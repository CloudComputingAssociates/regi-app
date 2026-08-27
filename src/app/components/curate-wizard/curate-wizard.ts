// src/app/components/curate-wizard/curate-wizard.ts
//
// Curate Wizard — a "dating-app" swipe deck for quickly favoriting Regi-approved
// foods into MyFoods. Each card is one Regi-approved system food the user does
// NOT already have. Swipe/drag RIGHT (or press ✓) to add it to MyFoods; LEFT (or
// press ✗) to skip. Web-based, so the ✓/✗ buttons mirror the swipe gesture.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { FoodsService } from '../../services/foods.service';
import { Food } from '../../models/food.model';

const SWIPE_THRESHOLD = 110; // px past which a release commits the decision

@Component({
  selector: 'app-curate-wizard',
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointermove)': 'onPointerMove($event)',
    '(document:pointerup)': 'onPointerUp()',
  },
  template: `
    <div class="cw-backdrop" (click)="onClose()">
      <div class="cw-window" (click)="$event.stopPropagation()">
        <!-- Head: title + progress + close -->
        <div class="cw-head">
          <span class="cw-title">
            <mat-icon class="cw-title-icon">auto_fix_high</mat-icon>Curate Wizard
          </span>
          @if (!loading() && total() > 0) {
            <span class="cw-progress">{{ done() }} / {{ total() }}</span>
          }
          <button
            type="button"
            class="dialog-disc dialog-disc-cancel cw-close"
            matTooltip="Close"
            matTooltipPosition="below"
            aria-label="Close"
            (click)="onClose()">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <div class="cw-body">
          @if (loading()) {
            <div class="cw-state"><div class="cw-spinner"></div></div>
          } @else if (current(); as food) {
            <p class="cw-hint">Swipe right to add to MyFoods, left to skip.</p>
            <!-- The card -->
            <div
              class="cw-card"
              [class.dragging]="dragging()"
              [style.transform]="cardTransform()"
              (pointerdown)="onPointerDown($event)">
              <!-- Decision stamps -->
              <span class="cw-stamp add" [style.opacity]="dragX() > 20 ? 1 : 0">ADD</span>
              <span class="cw-stamp nope" [style.opacity]="dragX() < -20 ? 1 : 0">SKIP</span>

              <span class="cw-cat">{{ food.categoryName || 'Other' }}</span>

              <div class="cw-photo">
                @if (photo(food); as src) {
                  <img [src]="src" alt="" />
                } @else {
                  <mat-icon class="cw-photo-empty">restaurant</mat-icon>
                }
              </div>

              <div class="cw-name">{{ food.shortDescription || food.description }}</div>

              <div class="cw-macros">
                <span class="cw-macro"><b>{{ macro(food, 'proteinG') }}</b>g P</span>
                <span class="cw-macro"><b>{{ macro(food, 'totalCarbohydrateG') }}</b>g C</span>
                <span class="cw-macro"><b>{{ macro(food, 'totalFatG') }}</b>g F</span>
                <span class="cw-macro cals"><b>{{ macro(food, 'calories') }}</b> cal</span>
              </div>
              @if (food.servingSize) {
                <div class="cw-serving">per {{ food.servingSize }} {{ food.servingUnit || 'serving' }}</div>
              }
            </div>

            <!-- Click affordances. Skip/Add mirror the swipe; Restrict is a
                 click-only third action (not a swipe direction). -->
            <div class="cw-actions">
              <button type="button" class="cw-btn nope" matTooltip="Skip" aria-label="Skip" (click)="decide(false)">
                <mat-icon>close</mat-icon>
              </button>
              <button type="button" class="cw-btn yes" matTooltip="Add to MyFoods" aria-label="Add to MyFoods" (click)="decide(true)">
                <mat-icon>favorite</mat-icon>
              </button>
              <button
                type="button"
                class="cw-btn restrict"
                matTooltip="Restricted (Allergen or Inflammatory)"
                aria-label="Restricted (Allergen or Inflammatory)"
                (click)="restrict()">
                <mat-icon>dangerous</mat-icon>
              </button>
            </div>
          } @else {
            <!-- Done / empty -->
            <div class="cw-state cw-done">
              <mat-icon class="cw-done-icon">check_circle</mat-icon>
              @if (total() === 0) {
                <p class="cw-done-msg">Nothing new to review — your MyFoods already covers the Regi-approved list.</p>
              } @else {
                <p class="cw-done-msg">
                  All caught up! Added <b>{{ addedCount() }}</b> to MyFoods@if (restrictedCount() > 0) {, restricted <b>{{ restrictedCount() }}</b>}.
                </p>
              }
              <button type="button" class="cw-done-btn" (click)="onClose()">Done</button>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./curate-wizard.scss'],
})
export class CurateWizardComponent {
  readonly close = output<void>();

  private readonly prefs = inject(FoodPreferencesService);
  private readonly foods = inject(FoodsService);

  /** Deck of Regi-approved system foods NOT already in MyFoods, grouped by cat. */
  private readonly deck = signal<Food[]>([]);
  readonly loading = signal(true);
  private readonly index = signal(0);
  readonly addedCount = signal(0);
  readonly restrictedCount = signal(0);
  private touched = false; // any change staged → flush on close

  readonly total = computed(() => this.deck().length);
  readonly done = computed(() => Math.min(this.index(), this.total()));
  readonly current = computed<Food | undefined>(() => this.deck()[this.index()]);

  // Drag state
  readonly dragX = signal(0);
  readonly dragging = signal(false);
  private startX = 0;

  readonly cardTransform = computed(() => {
    const x = this.dragX();
    const rot = x / 18; // gentle tilt with the drag
    return `translateX(${x}px) rotate(${rot}deg)`;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const resp = await firstValueFrom(this.foods.searchYehApprovedFoods(500));
      const all = resp?.foods ?? [];
      const fresh = all
        .filter((f) => f['foodSource'] !== 'userfood' && !this.prefs.isAllowed(f.id))
        .sort((a, b) => (a.categoryName || 'zzz').localeCompare(b.categoryName || 'zzz'));
      this.deck.set(fresh);
    } catch {
      this.deck.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  photo(food: Food): string {
    return (food.foodImageThumbnail ?? food.foodImage ?? '').trim();
  }
  /** Per-serving macro off the nested nutrition facts (bracket access dodges the
   *  index-signature typing). */
  macro(food: Food, key: 'proteinG' | 'totalCarbohydrateG' | 'totalFatG' | 'calories'): number {
    const nf = food.nutritionFacts as Record<string, number> | null | undefined;
    return Math.round(nf?.[key] ?? 0);
  }

  /** Commit the current card: yes = favorite into MyFoods, then advance. */
  decide(yes: boolean): void {
    const food = this.current();
    if (!food) return;
    if (yes && !this.prefs.isAllowed(food.id)) {
      this.prefs.toggleFavoriteLocal(food.id);
      this.addedCount.update((n) => n + 1);
      this.touched = true;
    }
    this.advance();
  }

  /** Tag the current food as Restricted (Allergen/Inflammatory). Click-only —
   *  not a swipe direction. Pulls it out of MyFoods if it was there. */
  restrict(): void {
    const food = this.current();
    if (!food) return;
    if (!this.prefs.isRestricted(food.id)) {
      this.prefs.toggleRestrictedLocal(food.id, food['foodSource'] as string | undefined);
      this.restrictedCount.update((n) => n + 1);
      this.touched = true;
    }
    this.advance();
  }

  private advance(): void {
    this.dragX.set(0);
    this.dragging.set(false);
    this.index.update((i) => i + 1);
  }

  // --- Swipe gesture (pointer) ---
  onPointerDown(e: PointerEvent): void {
    this.startX = e.clientX;
    this.dragging.set(true);
  }
  onPointerMove(e: PointerEvent): void {
    if (!this.dragging()) return;
    this.dragX.set(e.clientX - this.startX);
  }
  onPointerUp(): void {
    if (!this.dragging()) return;
    const x = this.dragX();
    if (Math.abs(x) >= SWIPE_THRESHOLD) {
      this.decide(x > 0);
    } else {
      this.dragX.set(0); // snap back
      this.dragging.set(false);
    }
  }

  onClose(): void {
    // Flush any staged favorites (the debounced autosave is a backstop).
    if (this.touched) {
      this.prefs.saveAllChanges().subscribe({ error: () => {} });
    }
    this.close.emit();
  }
}
