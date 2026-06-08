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
              (mousedown)="onCardHoldStart(center, item, $event)"
              (touchstart)="onCardHoldStart(center, item, $event)">
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

  // Press-and-hold state (single-click-and-hold on center card shows NF)
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holdActive = false;
  private holdStartX = 0;
  private holdStartY = 0;
  private static readonly HOLD_DELAY_MS = 200;
  private static readonly HOLD_MOVE_THRESHOLD_PX = 8;

  // Spinner dblclick (activated) → ADD to the chosen destination.
  onActivated(item: SpinnerItem): void {
    // If a hold is in flight, kill it so the NF popup doesn't flash on top of the add.
    this.endHold(true);
    const food = item['food'] as Food | undefined;
    if (food) this.add.emit({ food, destination: this.addTo() });
  }

  // mousedown / touchstart on a center card: schedule NF popup after HOLD_DELAY_MS.
  // Any release or sufficient movement cancels the hold (and closes NF if it opened).
  onCardHoldStart(isCenter: boolean, item: SpinnerItem, ev: MouseEvent | TouchEvent): void {
    if (!isCenter) return;
    const food = item['food'] as Food | undefined;
    if (!food) return;

    const p = this.eventPoint(ev);
    this.holdStartX = p.x;
    this.holdStartY = p.y;

    this.holdTimer = setTimeout(() => {
      this.showNfPopup(food);
      this.holdActive = true;
      this.holdTimer = null;
    }, FoodCarouselComponent.HOLD_DELAY_MS);

    const onEnd = () => this.endHold(true);
    const onMove = (e: MouseEvent | TouchEvent) => {
      const np = this.eventPoint(e);
      const dx = np.x - this.holdStartX;
      const dy = np.y - this.holdStartY;
      if (Math.hypot(dx, dy) > FoodCarouselComponent.HOLD_MOVE_THRESHOLD_PX) {
        this.endHold(true);
      }
    };
    const cleanup = () => {
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
    };
    this.holdCleanup = cleanup;

    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove);
  }

  private holdCleanup: (() => void) | null = null;

  private endHold(closePopup: boolean): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.holdActive && closePopup) {
      this.closeNfPopup();
    }
    this.holdActive = false;
    if (this.holdCleanup) {
      this.holdCleanup();
      this.holdCleanup = null;
    }
  }

  private eventPoint(e: MouseEvent | TouchEvent): { x: number; y: number } {
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if ('changedTouches' in e && (e as TouchEvent).changedTouches.length > 0) {
      return {
        x: (e as TouchEvent).changedTouches[0].clientX,
        y: (e as TouchEvent).changedTouches[0].clientY,
      };
    }
    const me = e as MouseEvent;
    return { x: me.clientX, y: me.clientY };
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
