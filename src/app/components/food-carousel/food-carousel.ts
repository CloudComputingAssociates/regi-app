// src/app/components/food-carousel/food-carousel.ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { SpinnerComponent, SpinnerItem } from '../spinner/spinner';
import { NutritionFactsLabelComponent } from '../nutrition-facts-label/nutrition-facts-label';
import { Food } from '../../models/food.model';

@Component({
  selector: 'app-food-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, SpinnerComponent, NutritionFactsLabelComponent],
  host: {
    '(document:keydown.escape)': 'onEscape($event)',
  },
  template: `
    <div class="carousel-panel">
      <div class="carousel-body">
        <button
          type="button"
          class="floating-spin-btn"
          (click)="s.spin()"
          aria-label="Spin">
          Spin
        </button>

        <app-spinner
          #s="appSpinner"
          [items]="spinnerItems()"
          (activated)="onActivated($event)">
          <ng-template #spinnerCard let-item let-center="isCenter">
            <div
              class="food-card"
              [class.is-center]="center"
              (click)="onCardSingleClick(center, item)"
              (dblclick)="onCardDblClick(center, item)">
              <div class="food-card-image">
                @if (item.thumbnailUrl) {
                  <img [src]="item.thumbnailUrl" alt="" draggable="false" />
                } @else {
                  <svg viewBox="0 0 64 64" class="food-card-stub" aria-hidden="true">
                    <path
                      d="M32 18 C 20 18 14 28 14 38 C 14 50 22 58 32 58 C 42 58 50 50 50 38 C 50 28 44 18 32 18 Z M32 14 C 32 10 36 6 40 6"
                      fill="none"
                      stroke="rgba(255,255,255,0.35)"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                }
              </div>
              @if (item.label) {
                <div class="food-card-caption">{{ item.label }}</div>
              }
            </div>
          </ng-template>
        </app-spinner>

        <div class="add-to-bar">
          <span class="add-to-label">Add to</span>
          <div class="add-to-toggle" role="group">
            <button
              type="button"
              class="add-to-option"
              [class.active]="addTo() === 'myfoods'"
              (click)="addTo.set('myfoods')">
              MyFoods
            </button>
            <button
              type="button"
              class="add-to-option"
              [class.active]="addTo() === 'thisweek'"
              (click)="addTo.set('thisweek')">
              This Week
            </button>
          </div>
        </div>
      </div>

      <!-- Nutrition Facts popup -->
      @if (nfPopupFood()) {
            <div class="nf-popup-overlay" (click)="closeNfPopup()">
              <div class="nf-popup" (click)="$event.stopPropagation()">
                <button class="nf-popup-close" (click)="closeNfPopup()">✕</button>
                <div class="nf-popup-header">
                  @if (nfPopupFood()!.productPurchaseLink) {
                    <a
                      class="nf-popup-title nf-popup-title-link"
                      (click)="openProductLink(nfPopupFood()!)">
                      {{ nfPopupFood()!.shortDescription || nfPopupFood()!.description }}
                    </a>
                  } @else {
                    <span class="nf-popup-title">
                      {{ nfPopupFood()!.shortDescription || nfPopupFood()!.description }}
                    </span>
                  }
                </div>
                <regi-nutrition-label
                  [nutritionFacts]="nfPopupFood()!.nutritionFacts ?? null"
                  [scale]="nfPopupFood()!.servingSizeMultiplicand || 1" />
              </div>
            </div>
      }
    </div>
  `,
  styleUrls: ['./food-carousel.scss'],
})
export class FoodCarouselComponent {
  // Inputs
  foods = input<Food[]>([]);

  // Two-way: which destination the slider currently points at
  addTo = model<'myfoods' | 'thisweek'>('myfoods');

  // Outputs
  add = output<{ food: Food; destination: 'myfoods' | 'thisweek' }>();

  // foods -> SpinnerItem[]
  spinnerItems = computed<SpinnerItem[]>(() =>
    this.foods().map(
      (f) =>
        ({
          id: f.id,
          thumbnailUrl: f.foodImageThumbnail ?? undefined,
          fullUrl: f.foodImage ?? undefined,
          label: f.shortDescription || f.description,
          food: f,
        }) as SpinnerItem,
    ),
  );

  // NF popup state
  nfPopupFood = signal<Food | null>(null);

  // Single-click on a center card opens the NF popup and leaves it up. We delay
  // briefly so a double-click (which fires AFTER both clicks) can suppress it.
  private singleClickTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DBLCLICK_WINDOW_MS = 250;

  // Spinner dblclick (activated) → ADD to the chosen destination.
  onActivated(item: SpinnerItem): void {
    const food = item['food'] as Food | undefined;
    if (food) this.addCenteredFood(food);
  }

  // Direct dblclick on the projected food-card — a fallback in case the spinner's
  // own per-card dblclick gate didn't fire (e.g. timing/edge cases on isCenter).
  // The parent's onAddFood dedupes by food.id, so a double-emit is harmless.
  onCardDblClick(isCenter: boolean, item: SpinnerItem): void {
    if (!isCenter) return;
    const food = item['food'] as Food | undefined;
    if (!food) return;
    this.addCenteredFood(food);
  }

  // Single click on a center card opens the NF popup. Side-card clicks fall
  // through (the spinner's tap-to-center already handles those at pointerup).
  // We defer the popup open by ~250ms so a double-click can cancel it cleanly.
  onCardSingleClick(isCenter: boolean, item: SpinnerItem): void {
    if (!isCenter) return;
    const food = item['food'] as Food | undefined;
    if (!food) return;

    // Re-arm: a second click from a forming double-click resets the timer; the
    // dblclick handler will then cancel before this fires.
    if (this.singleClickTimer) clearTimeout(this.singleClickTimer);
    this.singleClickTimer = setTimeout(() => {
      this.singleClickTimer = null;
      this.showNfPopup(food);
    }, FoodCarouselComponent.DBLCLICK_WINDOW_MS);
  }

  // Centralized "add" path so both dblclick entry points cancel pending NF and
  // tear down any open popup before emitting.
  private addCenteredFood(food: Food): void {
    if (this.singleClickTimer) {
      clearTimeout(this.singleClickTimer);
      this.singleClickTimer = null;
    }
    if (this.nfPopupFood()) this.closeNfPopup();
    this.add.emit({ food, destination: this.addTo() });
  }

  // Escape closes the NF popup if it's open.
  onEscape(e: Event): void {
    if (this.nfPopupFood()) {
      e.preventDefault();
      this.closeNfPopup();
    }
  }

  // -------- NF popup methods --------

  showNfPopup(food: Food): void {
    this.nfPopupFood.set(food);
  }

  closeNfPopup(): void {
    this.nfPopupFood.set(null);
  }

  openProductLink(food: Food): void {
    const url = food.productPurchaseLink;
    if (url) {
      this.closeNfPopup();
      window.open(url, '_blank', 'noopener');
    }
  }
}
