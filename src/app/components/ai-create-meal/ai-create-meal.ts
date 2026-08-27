// src/app/components/ai-create-meal/ai-create-meal.ts
//
// "Add Meals" bloom — a centered overlay over the Menus & Meals board for
// getting meals INTO the Binder. Two paths:
//   1. Import a recipe (drag & drop / browse a PDF/JPEG/PNG) — a valid file
//      kicks off the background import and autocloses the bloom.
//   2. Buy curated Meal Sets at meals.regimenu.com (upsell).
// The old "Create with AI from your picks" path was removed by request.
// We DON'T watch import progress here; the completion notification arrives
// globally (existing ingest toast).
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../environments/environment';
import { RecipeService } from '../../services/recipe.service';
import { RecipeImportWatcher } from '../../services/recipe-import-watcher.service';
import { NotificationService } from '../../services/notification.service';
import { RoleService } from '../../services/role.service';
import { TabService } from '../../services/tab.service';

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
          <mat-icon class="bloom-title-icon">restaurant</mat-icon>Add Meals
        </div>

        <!-- Import at the TOP: a compact drop zone (no big graphic) — a valid
             file autocloses the bloom. -->
        <span class="section-label import-label">Import a recipe</span>
        <div
          class="import-dropzone"
          [class.dragging]="dragOver()"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDropFile($event)">
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

        <!-- Glowing separator into the upsell. -->
        <div class="glow-divider" aria-hidden="true"></div>

        @if (isAuthor()) {
          <!-- MealSetOwner: one card into the Author Studio (recipes + MealSets). -->
          <div class="meal-sets">
            <div class="meal-sets-head">
              <mat-icon class="meal-sets-icon">restaurant_menu</mat-icon>
              <span class="meal-sets-title">MealSet Studio</span>
            </div>
            <div class="meal-sets-desc">Author recipes and manage your MealSets.</div>
            <button type="button" class="meal-sets-cta" (click)="openStudio()">
              <mat-icon>edit_note</mat-icon>Open MealSet Studio
            </button>
          </div>
        } @else {
          <!-- Purchase Additional Meal Sets — curated, chef-authored packs. -->
          <div class="meal-sets">
            <div class="meal-sets-head">
              <mat-icon class="meal-sets-icon">restaurant_menu</mat-icon>
              <span class="meal-sets-title">Purchase Additional MealSets</span>
            </div>
            <div class="meal-sets-price">
              as low as <strong>$4.99</strong> for <strong>20 meals</strong>
            </div>
            <div class="meal-sets-desc">Full recipes, balanced nutrition.</div>
            <div class="meal-sets-tags">GLP&#8209;1 friendly · Keto · Carnivore · more…</div>
            <a
              class="meal-sets-cta"
              [href]="marketplaceUrl()"
              target="_blank"
              rel="noopener">
              <mat-icon>open_in_new</mat-icon>Browse MealSets
            </a>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./ai-create-meal.scss'],
})
export class AiCreateMealComponent {
  private recipeService = inject(RecipeService);
  private watcher = inject(RecipeImportWatcher);
  private notification = inject(NotificationService);
  private role = inject(RoleService);
  private tabService = inject(TabService);
  private auth = inject(AuthService);

  /** Current user's email (Auth0 email claim), '' until the profile loads. */
  private readonly userEmail = toSignal(
    this.auth.user$.pipe(map((u) => u?.email ?? '')),
    { initialValue: '' },
  );

  /** MealSets marketplace URL with the SSO hand-off params. `?connect=1` triggers
   *  the marketplace's prompt=none Auth0 round-trip to adopt the current SSO
   *  identity; `login_hint` pre-fills the email (advisory — only matters if the
   *  marketplace has to fall back to interactive login). Email is URL-encoded;
   *  when it isn't loaded yet we send `?connect=1` alone so the marketplace falls
   *  back to the raw shared SSO session. Both origins share the same Auth0 tenant. */
  readonly marketplaceUrl = computed(() => {
    const base = `${environment.mealsetsUrl}/?connect=1`;
    const email = this.userEmail();
    return email ? `${base}&login_hint=${encodeURIComponent(email)}` : base;
  });

  /** Close the bloom — on cancel (X / backdrop) or after an import kicks off. */
  readonly close = output<void>();

  /** MealSetOwner authors get a single "Author Studio" card instead of the upsell;
   *  authoring + MealSets both live in the Studio now. */
  isAuthor(): boolean {
    return this.role.hasRole('MealSetOwner');
  }

  /** Open the Author Studio (the mealsets left-nav panel). Closes this bloom. */
  openStudio(): void {
    this.close.emit();
    this.tabService.openPanel('mealsets', 'MealSet Studio');
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
    // A dropped/browsed PDF is queued — reassure the user (yellow, auto-closes
    // after 10s; the close button is always available). The real completion
    // notification arrives later from the background watcher. PDF-only per request.
    if (file.type === 'application/pdf') {
      this.notification.show(
        "Queued for processing, we'll take it from here. Notification will be sent when finished importing and AI processing.",
        'warning',
        10000,
      );
    }
    void this.uploadAndWatch(file);
    return true;
  }

  private async uploadAndWatch(file: File): Promise<void> {
    try {
      const res = await firstValueFrom(this.recipeService.importRecipe(file));
      if (res?.recipeId != null) this.watcher.watch(res.recipeId);
    } catch {
      this.notification.show('Recipe import failed — could not upload the file.', 'error');
    }
  }
}
