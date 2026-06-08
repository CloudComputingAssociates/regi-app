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
import { viewChild } from '@angular/core';
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
            <div class="food-card" [class.is-center]="center">
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
          <button
            type="button"
            class="add-to-trigger"
            (click)="onAddCentered()"
            [disabled]="!currentFood()"
            aria-label="Add">
            +
          </button>
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

  // Spinner viewChild — used to grab the centered item on Add
  private spinner = viewChild(SpinnerComponent);

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

  // The currently-centered Food (or null) — drives the Add button's disabled state
  currentFood = computed<Food | null>(() => {
    const it = this.spinner()?.currentItem();
    if (!it) return null;
    return (it['food'] as Food | undefined) ?? null;
  });

  // NF popup state
  nfPopupFood = signal<Food | null>(null);

  // Activation: spinner double-click / Enter → open NF popup for the centered food.
  onActivated(item: SpinnerItem): void {
    const food = item['food'] as Food | undefined;
    if (food) this.showNfPopup(food);
  }

  // Add button → emit (add) with the centered food + current destination.
  onAddCentered(): void {
    const food = this.currentFood();
    if (!food) return;
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
