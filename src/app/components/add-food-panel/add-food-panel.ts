// src/app/components/add-food-panel/add-food-panel.ts
//
// Reusable "Add a food to My Foods" dialog. One overlay, mounted by BOTH the
// binder food-lookaside "+" and the Foods-panel "+", so the add-food flow is
// learned once. Bloom-window chrome + round confirm/cancel discs per CLAUDE.md
// Dialog conventions (copied from settings-overlay).
//
// Flow (reuses the SAME typeahead the recipe editor uses):
//   1. Type a name → IngredientTypeahead surfaces as-you-type matches from your
//      food list, plus an "Add …" that hits the food database (FatSecret).
//   2. Picking a candidate creates + auto-favorites a UserFood into MyFoods; the
//      panel re-loads it for the ratify step. Picking a system/Regi match just
//      favorites it (it's already fully specified) and closes.
//   3. Ratify the serving geometry (quantity · unit · grams-per-unit) and read
//      the per-100 g macros, then Save (PATCH /api/foods/serving-geometry).
//   4. Photo: if the food already has one, show it; otherwise SUGGEST a photo —
//      first our CDN (GET /api/image/url), then Open Food Facts by name — which
//      the user approves on Save, or replaces via drag / paste-screenshot /
//      browse (POST /api/image/upload/product).
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { UserFoodService } from '../../services/user-food.service';
import { FoodsService } from '../../services/foods.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { UserFood } from '../../models/user-food.model';
import { IngredientTypeaheadComponent, PickedFood } from '../ingredient-typeahead/ingredient-typeahead';

@Component({
  selector: 'app-add-food-panel',
  imports: [MatIconModule, MatTooltipModule, IngredientTypeaheadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="afp-backdrop" (click)="onBackdrop()">
      <div class="afp-window" (click)="$event.stopPropagation()">
        <div class="afp-header">
          <img src="images/yeh_logo_dark.png" alt="" class="afp-logo" />
          <span class="afp-title">Add a Food</span>
          <div class="dialog-discs">
            @if (canSave()) {
              <button type="button" class="dialog-disc dialog-disc-confirm"
                matTooltip="Save" matTooltipPosition="below" (click)="onSave()"
                aria-label="Save food">
                <mat-icon>check</mat-icon>
              </button>
            }
            <button type="button" class="dialog-disc dialog-disc-cancel"
              matTooltip="Close" matTooltipPosition="below" (click)="onClose()"
              aria-label="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>

        <div class="afp-body">
          @if (!created()) {
            <!-- Stage 1: typeahead — as-you-type matches + food-database add. -->
            <label class="afp-label">Search for a food</label>
            <app-ingredient-typeahead (foodPicked)="onPicked($event)" />
            @if (resolving()) {
              <p class="afp-hint">Adding…</p>
            } @else {
              <p class="afp-hint">Start typing — pick a match, or add a new food from the database.</p>
            }
          } @else {
            <!-- Stage 2: ratify serving geometry + photo for the created food. -->
            <div class="afp-created">
              <mat-icon class="afp-created-tick">check_circle</mat-icon>
              <span class="afp-created-name">{{ foodName() }}</span>
              <span class="afp-created-note">added to My Foods</span>
            </div>

            <div class="afp-grid">
              <!-- Left: serving geometry + macros. -->
              <div class="afp-col">
                <div class="afp-section-title">Serving &amp; units</div>
                <div class="afp-fields">
                  <label class="afp-field">
                    <span>Quantity</span>
                    <input type="number" min="0.01" step="0.25" class="afp-input"
                      [value]="quantity()"
                      (input)="quantity.set(numOf($any($event.target).value, 1))" />
                  </label>
                  <label class="afp-field">
                    <span>Unit</span>
                    <input type="text" class="afp-input" placeholder="e.g. container, cup"
                      [value]="unit()"
                      (input)="unit.set($any($event.target).value)" />
                  </label>
                  <label class="afp-field">
                    <span>Grams per unit</span>
                    <input type="number" min="0.01" step="1" class="afp-input"
                      [value]="gramsPerUnit() ?? ''"
                      (input)="gramsPerUnit.set(numOrNull($any($event.target).value))" />
                  </label>
                </div>

                <div class="afp-section-title">Per 100 g</div>
                @if (per100(); as m) {
                  <div class="afp-macros">
                    <div class="afp-macro"><b>{{ m.cal }}</b><span>cal</span></div>
                    <div class="afp-macro"><b>{{ m.protein }}g</b><span>protein</span></div>
                    <div class="afp-macro"><b>{{ m.fat }}g</b><span>fat</span></div>
                    <div class="afp-macro"><b>{{ m.carbs }}g</b><span>carbs</span></div>
                  </div>
                } @else {
                  <p class="afp-hint">No nutrition on file for this food yet.</p>
                }
              </div>

              <!-- Right: photo. -->
              <div class="afp-col">
                <div class="afp-section-title">Photo</div>
                <div
                  class="afp-photo"
                  tabindex="0"
                  [class.busy]="photoBusy()"
                  [class.suggested]="photoIsSuggestion()"
                  (dragover)="onDragOver($event)"
                  (drop)="onDrop($event)"
                  (paste)="onPaste($event)"
                  (click)="fileInput.click()">
                  @if (photoUrl()) {
                    <img [src]="photoUrl()" alt="" class="afp-photo-img" />
                  }
                  <div class="afp-photo-overlay">
                    @if (photoBusy()) {
                      <span>Uploading…</span>
                    } @else if (photoSearching()) {
                      <mat-icon>image_search</mat-icon>
                      <span>Looking for a photo…</span>
                    } @else if (photoUrl()) {
                      <mat-icon>{{ photoIsSuggestion() ? 'auto_awesome' : 'photo_camera' }}</mat-icon>
                      <span>{{ photoIsSuggestion() ? 'Suggested — Save to keep, or click to replace' : 'Click to replace' }}</span>
                    } @else {
                      <mat-icon>add_photo_alternate</mat-icon>
                      <span>Drag, paste, or click to add a photo</span>
                    }
                  </div>
                </div>
                <input #fileInput type="file" accept="image/jpeg,image/png" hidden
                  (change)="onFile(fileInput)" />
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./add-food-panel.scss'],
})
export class AddFoodPanelComponent {
  private userFoods = inject(UserFoodService);
  private foodsService = inject(FoodsService);
  private imageUpload = inject(ImageUploadService);
  private prefs = inject(FoodPreferencesService);
  private notification = inject(NotificationService);

  /** Fired when the dialog should close (host controls visibility with @if). */
  readonly close = output<void>();
  /** Fired when a food was added/changed — the host reloads its MyFoods list. */
  readonly added = output<void>();

  // ---- Stage 1: typeahead pick → resolve to the ratify stage ---------------
  /** A pick is being resolved (created food fetched / system food favorited). */
  readonly resolving = signal(false);

  async onPicked(p: PickedFood): Promise<void> {
    if (this.resolving()) return;
    this.resolving.set(true);
    try {
      if (p.foodSource === 'userfood') {
        // Freshly created (or existing) UserFood — load it for ratification.
        const food = await this.userFoods.getUserFoodById(p.foodId);
        if (!food) {
          this.notification.show('Could not load the added food.', 'error');
          return;
        }
        this.didAdd = true;
        this.setCreated(food);
      } else {
        // A system / Regi match — already fully specified (serving, photo). The
        // "add" is just favoriting it into MyFoods; then we're done.
        if (!this.prefs.isAllowed(p.foodId)) {
          this.prefs.toggleFavoriteLocal(p.foodId);
          try {
            await firstValueFrom(this.prefs.saveAllChanges());
          } catch {
            /* the debounced autosave will still flush it */
          }
        }
        this.didAdd = true;
        this.notification.show(`Added ${p.name} to My Foods.`, 'success');
        this.finish();
      }
    } finally {
      this.resolving.set(false);
    }
  }

  // ---- Stage 2: the created food + ratification ----------------------------
  readonly created = signal<UserFood | null>(null);
  /** Whether anything was actually added this session (drives `added` on close). */
  private didAdd = false;

  readonly unit = signal('');
  readonly gramsPerUnit = signal<number | null>(null);
  readonly quantity = signal(1);
  // Baseline captured at create-time, to detect a geometry edit worth saving.
  private baseUnit = '';
  private baseGrams: number | null = null;
  private baseQty = 1;

  readonly photoUrl = signal('');
  readonly photoIsSuggestion = signal(false);
  readonly photoBusy = signal(false);
  readonly photoSearching = signal(false);

  /** Seed the ratify fields + photo from a just-resolved UserFood. */
  private setCreated(food: UserFood): void {
    this.created.set(food);
    this.baseUnit = food.servingUnit ?? '';
    this.baseGrams = food.servingGramsPerUnit ?? null;
    this.baseQty = food.servingSizeMultiplicand ?? 1;
    this.unit.set(this.baseUnit);
    this.gramsPerUnit.set(this.baseGrams);
    this.quantity.set(this.baseQty);
    if (food.foodImage) {
      this.photoUrl.set(food.foodImage);
      this.photoIsSuggestion.set(false);
    } else {
      void this.suggestPhoto(food);
    }
  }

  /** Suggest a photo when the food has none: our CDN by description first, then
   *  Open Food Facts (.org) by name as a best-effort fallback. */
  private async suggestPhoto(food: UserFood): Promise<void> {
    const desc = (food.description || food.shortDescription || '').trim();
    if (!desc) return;
    this.photoSearching.set(true);
    try {
      const cdn = await this.imageUpload.lookupImageUrl(desc);
      let url = cdn?.product_image_url || '';
      if (!url) url = await this.imageUpload.searchOpenFoodFactsImage(desc);
      if (url) {
        this.photoUrl.set(url);
        this.photoIsSuggestion.set(true);
      }
    } catch {
      /* no suggestion — the user can still upload one. */
    } finally {
      this.photoSearching.set(false);
    }
  }

  foodName(): string {
    const f = this.created();
    return f?.shortDescription?.trim() || f?.description || 'Food';
  }

  /** Per-100 g macros. The API stores nutritionFacts ALREADY normalized per
   *  100 g, so these are read straight through (no serving-size scaling). */
  readonly per100 = computed<{ cal: number; protein: number; fat: number; carbs: number } | null>(() => {
    const nf = this.created()?.nutritionFacts;
    if (!nf) return null;
    const r = (n: number | undefined) => Math.round(n ?? 0);
    return {
      cal: r(nf.calories),
      protein: r(nf.proteinG),
      fat: r(nf.totalFatG),
      carbs: r(nf.totalCarbohydrateG),
    };
  });

  /** Geometry differs from what the server stored → worth a serving-geometry PATCH. */
  private geometryDirty(): boolean {
    return (
      this.unit().trim() !== this.baseUnit.trim() ||
      this.gramsPerUnit() !== this.baseGrams ||
      this.quantity() !== this.baseQty
    );
  }

  /** Green disc shows when there's something to commit: a geometry edit or a
   *  pending photo suggestion to approve. geometryDirty() reads the unit/grams/
   *  quantity signals, so this computed tracks them. */
  readonly canSave = computed<boolean>(() => {
    if (!this.created()) return false;
    return this.geometryDirty() || this.photoIsSuggestion();
  });

  numOf(v: string, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  numOrNull(v: string): number | null {
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
  }

  // ---- Photo upload (drag / paste / browse) --------------------------------
  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
  }
  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    const file = ev.dataTransfer?.files?.[0];
    if (file) void this.uploadPhoto(file);
  }
  onPaste(ev: ClipboardEvent): void {
    const file = ev.clipboardData?.files?.[0];
    if (file) {
      ev.preventDefault();
      void this.uploadPhoto(file);
    }
  }
  onFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.uploadPhoto(file);
  }

  private async uploadPhoto(file: File): Promise<void> {
    const food = this.created();
    if (!food?.id || this.photoBusy()) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      this.notification.show('Please use a JPG or PNG image.', 'error');
      return;
    }
    this.photoBusy.set(true);
    try {
      const res = await this.imageUpload.uploadProductImage(food.id, file);
      if (res?.cdn_url) {
        this.photoUrl.set(res.cdn_url);
        this.photoIsSuggestion.set(false); // now persisted on the food
      } else {
        this.notification.show('Upload failed — no URL returned.', 'error');
      }
    } catch {
      this.notification.show('Image upload failed.', 'error');
    } finally {
      this.photoBusy.set(false);
    }
  }

  /** Approve a suggested photo: fetch the image, wrap it as a File, and push it
   *  through the SAME upload path so the food gets a proper CDN + thumbnail. */
  private async approveSuggestedPhoto(): Promise<void> {
    const food = this.created();
    const url = this.photoUrl();
    if (!food?.id || !url) return;
    this.photoBusy.set(true);
    try {
      const blob = await (await fetch(url)).blob();
      const type = /png(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg';
      const file = new File([await blob.arrayBuffer()], 'suggested-photo', { type });
      const res = await this.imageUpload.uploadProductImage(food.id, file);
      if (res?.cdn_url) this.photoUrl.set(res.cdn_url);
      this.photoIsSuggestion.set(false);
    } catch {
      // Cross-origin fetch or upload failed — keep it as a suggestion; the user
      // can still upload manually. Don't block the rest of the Save.
      this.notification.show('Could not attach the suggested photo — upload one instead.', 'error');
    } finally {
      this.photoBusy.set(false);
    }
  }

  // ---- Commit / dismiss ----------------------------------------------------
  async onSave(): Promise<void> {
    const food = this.created();
    if (!food?.id) return;
    if (this.geometryDirty() && this.unit().trim() && this.gramsPerUnit()) {
      try {
        await firstValueFrom(
          this.foodsService.patchServingGeometry({
            foodId: food.id,
            foodSource: 'userfood',
            unitName: this.unit().trim(),
            gramsPerUnit: this.gramsPerUnit()!,
            defaultQuantity: this.quantity(),
          }),
        );
      } catch {
        this.notification.show('Could not save serving units.', 'error');
      }
    }
    if (this.photoIsSuggestion()) await this.approveSuggestedPhoto();
    this.finish();
  }

  onBackdrop(): void {
    // Don't dismiss on a stray backdrop click while there are uncommitted edits.
    if (this.canSave()) return;
    this.onClose();
  }

  onClose(): void {
    this.finish();
  }

  private finish(): void {
    if (this.didAdd) this.added.emit();
    this.close.emit();
  }
}
