// src/app/components/add-food-panel/add-food-panel.ts
//
// Reusable "Add a food to My Foods" dialog. One overlay, mounted by BOTH the
// binder food-lookaside "+" and the Foods-panel "+", so the add-food flow is
// learned once. Bloom-window chrome + round confirm/cancel discs per CLAUDE.md
// Dialog conventions (copied from settings-overlay).
//
// Flow (reuses the SAME plumbing the recipe typeahead already uses):
//   1. Type a name → Enter/Search → FatSecret candidates
//      (GET /api/userfoods/fatsecret-search).
//   2. Pick a candidate → create + auto-favorite into MyFoods
//      (POST /api/userfoods/from-fatsecret → UserFood + imageStatus).
//   3. Ratify the serving geometry (quantity · unit · grams-per-unit) and read
//      the per-100 g macros, then Save (PATCH /api/foods/serving-geometry).
//   4. Photo: if the created food already has one, show it; otherwise SUGGEST a
//      public/product photo (GET /api/image/url) the user can approve, or
//      replace via drag / paste-screenshot / browse (POST /api/image/upload/product).
//
// The food is created the moment a candidate is picked (mirrors the existing
// typeahead), so the ratify step edits an already-in-MyFoods food; the green
// disc commits the geometry/photo edits, the red X just closes.
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
import { NotificationService } from '../../services/notification.service';
import { UserFood } from '../../models/user-food.model';
import { FatSecretCandidate } from '../../models/fatsecret.model';

@Component({
  selector: 'app-add-food-panel',
  imports: [MatIconModule, MatTooltipModule],
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
            <!-- Stage 1: search FatSecret by name. -->
            <label class="afp-label" for="afp-search">Search for a food</label>
            <div class="afp-search-row">
              <input
                id="afp-search"
                type="text"
                class="afp-input"
                [value]="query()"
                placeholder="e.g. greek yogurt, chicken breast…"
                (input)="query.set($any($event.target).value)"
                (keydown.enter)="runSearch()" />
              <button type="button" class="afp-search-btn"
                [disabled]="!query().trim() || searching()"
                (click)="runSearch()">
                <mat-icon>{{ searching() ? 'hourglass_empty' : 'search' }}</mat-icon>
              </button>
            </div>

            @if (searching()) {
              <p class="afp-hint">Searching…</p>
            } @else if (searched()) {
              @if (candidates().length) {
                <div class="afp-candidates">
                  @for (c of candidates(); track c.fatsecretFoodId) {
                    <button type="button" class="afp-cand" [disabled]="creating()"
                      (click)="pickCandidate(c)">
                      <span class="afp-cand-name">
                        {{ c.name }}@if (c.brand) { <em> · {{ c.brand }}</em> }
                      </span>
                      <span class="afp-cand-sub">
                        {{ c.servingDescription }}@if (c.calories) { · {{ c.calories }} cal }
                      </span>
                    </button>
                  }
                </div>
              } @else {
                <p class="afp-hint">No matches — try a different name.</p>
              }
            } @else {
              <p class="afp-hint">Type a food name and press Enter to search the food database.</p>
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
  private notification = inject(NotificationService);

  /** Fired when the dialog should close (host controls visibility with @if). */
  readonly close = output<void>();
  /** Fired when a food was added/changed — the host reloads its MyFoods list. */
  readonly added = output<void>();

  // ---- Stage 1: search -----------------------------------------------------
  readonly query = signal('');
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly candidates = signal<FatSecretCandidate[]>([]);
  readonly creating = signal(false);

  async runSearch(): Promise<void> {
    const q = this.query().trim();
    if (!q || this.searching()) return;
    this.searching.set(true);
    this.searched.set(true);
    try {
      const res = await firstValueFrom(this.userFoods.searchFatSecret(q, 10));
      this.candidates.set(res?.candidates ?? []);
    } catch {
      this.candidates.set([]);
      this.notification.show('Food search failed — try again.', 'error');
    } finally {
      this.searching.set(false);
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

  async pickCandidate(c: FatSecretCandidate): Promise<void> {
    if (this.creating()) return;
    this.creating.set(true);
    try {
      const res = await firstValueFrom(
        this.userFoods.createFromFatSecret({ fatsecretFoodId: c.fatsecretFoodId }),
      );
      const food = res?.food;
      if (!food?.id) {
        this.notification.show('Could not add the food.', 'error');
        return;
      }
      this.didAdd = true;
      this.created.set(food);
      // Seed the ratify fields from the created food.
      this.baseUnit = food.servingUnit ?? '';
      this.baseGrams = food.servingGramsPerUnit ?? null;
      this.baseQty = food.servingSizeMultiplicand ?? 1;
      this.unit.set(this.baseUnit);
      this.gramsPerUnit.set(this.baseGrams);
      this.quantity.set(this.baseQty);
      // Photo: use the food's own image if it has one, else suggest one.
      if (food.foodImage) {
        this.photoUrl.set(food.foodImage);
        this.photoIsSuggestion.set(false);
      } else {
        void this.suggestPhoto(food);
      }
    } catch {
      this.notification.show('Could not add the food.', 'error');
    } finally {
      this.creating.set(false);
    }
  }

  private async suggestPhoto(food: UserFood): Promise<void> {
    const desc = food.description || food.shortDescription;
    if (!desc) return;
    try {
      const res = await this.imageUpload.lookupImageUrl(desc);
      if (res?.product_image_url) {
        this.photoUrl.set(res.product_image_url);
        this.photoIsSuggestion.set(true);
      }
    } catch {
      /* no suggestion — the user can still upload one. */
    }
  }

  foodName(): string {
    const f = this.created();
    return f?.shortDescription?.trim() || f?.description || 'Food';
  }

  /** Per-100 g macros derived from the created food's nutrition facts, when the
   *  reference-serving grams (servingSizeG) is known; otherwise null. */
  readonly per100 = computed<{ cal: number; protein: number; fat: number; carbs: number } | null>(() => {
    const nf = this.created()?.nutritionFacts;
    if (!nf) return null;
    const g = nf.servingSizeG ?? 0;
    const factor = g > 0 ? 100 / g : 1; // no basis → show the stored values as-is
    const round = (n: number | undefined) => Math.round((n ?? 0) * factor);
    return {
      cal: round(nf.calories),
      protein: round(nf.proteinG),
      fat: round(nf.totalFatG),
      carbs: round(nf.totalCarbohydrateG),
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

  /** Approve a suggested photo: fetch the CDN image, wrap it as a File, and push
   *  it through the SAME upload path so the food gets a proper CDN + thumbnail. */
  private async approveSuggestedPhoto(): Promise<void> {
    const food = this.created();
    const url = this.photoUrl();
    if (!food?.id || !url) return;
    this.photoBusy.set(true);
    try {
      const blob = await (await fetch(url)).blob();
      const type = /png$/i.test(url) ? 'image/png' : 'image/jpeg';
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
