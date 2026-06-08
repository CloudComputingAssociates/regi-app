// src/app/components/food-carousel/food-carousel.ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
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
    @if (isOpen()) {
      <div class="carousel-backdrop">
        <div class="carousel-panel">
          <div class="carousel-header">
            <span class="carousel-title">Foods</span>
            <div class="carousel-header-actions">
              <button
                class="header-btn spin-btn"
                (click)="s.spin()"
                aria-label="Spin">
                <mat-icon>casino</mat-icon>
              </button>
              <button
                class="header-btn close-btn"
                (click)="closed.emit()"
                aria-label="Close">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          </div>

          <div class="carousel-body">
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

              <ng-template #spinnerDetails let-item>
                @if (item) {
                  <div class="food-details">
                    <div class="food-details-name">{{ item.label }}</div>
                    @if (macroHint(item); as hint) {
                      <div class="food-details-macros">{{ hint }}</div>
                    }
                  </div>
                }
              </ng-template>
            </app-spinner>
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
      </div>
    }
  `,
  styleUrls: ['./food-carousel.scss'],
})
export class FoodCarouselComponent {
  // Inputs
  foods = input<Food[]>([]);
  isOpen = input(false);

  // Outputs
  closed = output<void>();

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

  // Tear NF popup down when the carousel closes so it doesn't reappear on next open.
  private syncIsOpen = effect(() => {
    if (!this.isOpen()) {
      this.nfPopupFood.set(null);
    }
  });

  // Activation: spinner double-click / Enter → open NF popup for the centered food.
  onActivated(item: SpinnerItem): void {
    const food = item['food'] as Food | undefined;
    if (food) this.showNfPopup(food);
  }

  // Escape closes the NF popup first, then the carousel on a second press.
  onEscape(e: Event): void {
    if (!this.isOpen()) return;
    if (this.nfPopupFood()) {
      e.preventDefault();
      this.closeNfPopup();
      return;
    }
    e.preventDefault();
    this.closed.emit();
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

  // -------- Helpers for the spinnerDetails template --------

  macroHint(item: SpinnerItem | null): string {
    if (!item) return '';
    const food = item['food'] as Food | undefined;
    const nf = food?.nutritionFacts;
    if (!nf) return '';
    const p = nf.proteinG ?? 0;
    const c = nf.totalCarbohydrateG ?? 0;
    const fat = nf.totalFatG ?? 0;
    if (!p && !c && !fat) return '';
    return `${this.fmt(p)}g protein · ${this.fmt(c)}g carbs · ${this.fmt(fat)}g fat`;
  }

  private fmt(n: number): string {
    return (Math.round(n * 10) / 10).toString();
  }
}
