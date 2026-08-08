// src/app/components/ai-create-meal/ai-create-meal.ts
//
// "AI Create Meal" bloom — a centered overlay over the Menus & Meals board.
// Replaces the old Binder "Create" accordion: instead of pushing the meal list
// (and the meals grid) down, the create controls bloom in the middle of the
// board and close the moment work is kicked off.
//   - Cuisine spin combo (default "none") + green check → generate from picks.
//   - "-or-" → drag & drop / browse a recipe file to import.
// We DON'T watch progress here: the green check or a successful drop autocloses
// the bloom, and the completion notification arrives globally (generate toasts
// the new meal's name + protein focus; import uses the existing ingest toast).
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { RotationService } from '../../services/rotation.service';
import { RecipeService } from '../../services/recipe.service';
import { RecipeImportWatcher } from '../../services/recipe-import-watcher.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-ai-create-meal',
  imports: [MatTooltipModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Backdrop over the board; click outside the bloom cancels. -->
    <div class="ai-create-backdrop" (click)="onCancel()">
      <div class="ai-create-bloom" (click)="$event.stopPropagation()">
        <!-- Red cancel disc, top-right (dialog convention). -->
        <div class="dialog-discs">
          <button
            type="button"
            class="dialog-disc dialog-disc-cancel"
            matTooltip="Cancel"
            matTooltipPosition="below"
            aria-label="Cancel"
            (click)="onCancel()">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <div class="bloom-title">
          <img src="images/AI-star.png" alt="" class="bloom-star" />AI Create Meal
        </div>

        <!-- Generate from the user's picks, with an optional cuisine spin.
             Disabled while a recipe import is in flight. -->
        <div class="ai-body" [class.area-disabled]="uploading()">
          <span class="genmeal-label">Create</span>
          <span class="cuisine-label">Cuisine spin:</span>
          <div class="twist-group">
            <div class="twist-combo">
              <input
                #twistInput
                type="text"
                class="twist-input"
                [value]="twistValue()"
                (input)="onTwistInput($any($event.target).value)"
                (focus)="twistOpen.set(true)"
                (blur)="onTwistBlur()"
                (keydown.escape)="twistOpen.set(false)" />
              <button
                type="button"
                class="twist-chevron"
                aria-label="Cuisine options"
                (mousedown)="onChevronMouseDown($event)">▾</button>
              @if (twistOpen()) {
                <ul class="twist-menu">
                  @for (opt of twistOptions; track opt) {
                    <li
                      class="twist-opt"
                      [class.selected]="opt === twistValue()"
                      (mousedown)="selectTwist(opt, $event)">{{ opt }}</li>
                  }
                </ul>
              }
            </div>
            <button
              type="button"
              class="icon-disc genmeal-go"
              [class.icon-disc-confirm]="!rotation.generating()"
              matTooltip="Meals from Foods you picked"
              [disabled]="rotation.generating() || uploading()"
              (click)="onGenerate()">
              @if (rotation.generating()) {
                <img src="images/AI-star.png" alt="" class="genmeal-spin" />
              } @else {
                <mat-icon>check</mat-icon>
              }
            </button>
          </div>
        </div>

        <div class="or-divider">-or-</div>

        <span class="genmeal-label import-label">Import</span>
        <!-- Import a recipe — drag & drop a file onto the zone, or browse.
             PDF / JPEG / PNG. A valid file autocloses the bloom. -->
        <div
          class="import-dropzone"
          [class.dragging]="dragOver()"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDropFile($event)">
          <mat-icon class="dz-icon">note_add</mat-icon>
          <span class="dz-title">Drag &amp; Drop a Recipe</span>
          <span class="dz-sub">
            PDF, JPEG or PNG — or
            <button type="button" class="dz-link" (click)="recipeInput.click()">browse files</button>
          </span>
        </div>
        <input
          #recipeInput
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          hidden
          (change)="onRecipeFileSelected(recipeInput)" />
      </div>
    </div>
  `,
  styleUrls: ['./ai-create-meal.scss'],
})
export class AiCreateMealComponent {
  readonly rotation = inject(RotationService);
  private recipeService = inject(RecipeService);
  private watcher = inject(RecipeImportWatcher);
  private notification = inject(NotificationService);

  /** Close the bloom — on cancel (X / backdrop) or after work is kicked off. */
  readonly close = output<void>();

  /** True only for the brief moment between choosing a file and autoclose; also
   *  dims the generate row so the two paths can't race. */
  readonly uploading = signal(false);

  // ----- Green check: generate from the user's food picks --------------------
  /** Fire the generation (fire-and-forget — the service toasts the result) and
   *  autoclose. We don't watch it here; the notification lands when it finishes. */
  onGenerate(): void {
    if (this.rotation.generating() || this.uploading()) return;
    void this.rotation.generateMeal();
    this.close.emit();
  }

  // ----- Cancel / backdrop ---------------------------------------------------
  onCancel(): void {
    this.close.emit();
  }

  // ----- Recipe import (drag & drop / browse) --------------------------------
  readonly dragOver = signal(false);

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(true);
  }
  onDragLeave(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
  }
  onDropFile(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    if (this.beginImport(ev.dataTransfer?.files?.[0] ?? null)) this.close.emit();
  }
  onRecipeFileSelected(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    input.value = ''; // let the same file be re-picked after a failure
    if (this.beginImport(file)) this.close.emit();
  }

  /** Validate + kick off the upload; returns true when an import actually began
   *  (so the caller can autoclose). Invalid files toast and keep the bloom open.
   *  The upload POST + background watch run on singleton services, so they
   *  survive this component's teardown; completion notifies globally. */
  private beginImport(file: File | null): boolean {
    if (!file) return false;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      this.notification.show('Please choose a PDF, JPEG, or PNG recipe file.', 'error');
      return false;
    }
    this.uploading.set(true);
    void this.uploadAndWatch(file);
    return true;
  }

  private async uploadAndWatch(file: File): Promise<void> {
    try {
      const res = await firstValueFrom(this.recipeService.importRecipe(file));
      if (res?.recipeId != null) this.watcher.watch(res.recipeId);
    } catch {
      this.notification.show('Recipe import failed — could not upload the file.', 'error');
    } finally {
      this.uploading.set(false);
    }
  }

  // ----- Cuisine "spin" combobox (default "none") ----------------------------
  readonly twistOptions = ['none', 'Italian', 'Mexican', 'Mediterranean', 'American', 'Custom...'];

  readonly twistValue = signal('none');
  readonly twistOpen = signal(false);
  private twistBeforeCustom = '';
  private twistInputRef = viewChild<ElementRef<HTMLInputElement>>('twistInput');

  onTwistInput(value: string): void {
    this.twistValue.set(value);
  }

  onChevronMouseDown(ev: Event): void {
    ev.preventDefault();
    this.twistOpen.update((v) => !v);
    this.twistInputRef()?.nativeElement.focus();
  }

  selectTwist(opt: string, ev: Event): void {
    ev.preventDefault();
    if (opt === 'Custom...') {
      this.twistBeforeCustom = this.twistValue().trim();
      this.twistValue.set('');
      this.twistOpen.set(false);
      queueMicrotask(() => this.twistInputRef()?.nativeElement.focus());
      return;
    }
    this.twistValue.set(opt);
    this.twistOpen.set(false);
  }

  onTwistBlur(): void {
    this.twistOpen.set(false);
    if (this.twistValue().trim() === '') {
      this.twistValue.set(this.twistBeforeCustom || 'none');
    }
  }
}
