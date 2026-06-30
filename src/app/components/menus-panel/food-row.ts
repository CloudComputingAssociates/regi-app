// src/app/components/menus-panel/food-row.ts
//
// One food line inside a meal-slot card: "{quantity} {unit} · {foodName}".
// Hovering reveals a "swap" affordance — a NO-OP stub this phase; it gets
// wired to the lookaside food picker in Phase 4.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MealItem } from '../../models';

@Component({
  selector: 'app-food-row',
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="food-row">
      <span class="food-text">
        <span class="qty">{{ item().quantity }} {{ item().unit }}</span>
        <span class="dot">·</span>
        <span class="name">{{ item().foodName }}</span>
      </span>
      <button
        type="button"
        class="swap-btn"
        matTooltip="Swap food"
        matTooltipPosition="left"
        (click)="onSwap()">
        ⇄
      </button>
    </div>
  `,
  styleUrls: ['./food-row.scss'],
})
export class FoodRowComponent {
  readonly item = input.required<MealItem>();

  /** Phase 4 affordance — intentionally a no-op for now. */
  onSwap(): void {
    // no-op stub
  }
}
