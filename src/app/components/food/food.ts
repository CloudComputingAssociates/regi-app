// src/app/components/food/food.ts
//
// One food line inside a meal card: "{quantity} {unit} · {foodName}".
// Hovering reveals a "swap" affordance — a NO-OP stub this phase; it gets
// wired to the lookaside food picker in Phase 4.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MealItem } from '../../models';

@Component({
  selector: 'app-food',
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="food-row">
      <span class="food-text">
        <span class="qty">{{ item().quantity }} {{ item().unit }}</span>
        <span class="dot">·</span>
        <span class="name">{{ item().shortDescription?.trim() || item().foodName }}</span>
      </span>
      <button
        type="button"
        class="swap-btn"
        matTooltip="AI Swap Food"
        matTooltipPosition="left"
        (click)="onSwap()">
        <img src="images/AI-star.png" alt="" class="swap-icon" />
        <span class="swap-text">AI Swap Food</span>
      </button>
    </div>
  `,
  styleUrls: ['./food.scss'],
})
export class FoodComponent {
  readonly item = input.required<MealItem>();

  /** Phase 4 affordance — intentionally a no-op for now. */
  onSwap(): void {
    // no-op stub
  }
}
