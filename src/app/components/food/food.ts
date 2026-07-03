// src/app/components/food/food.ts
//
// One food line inside a meal card: "{quantity} {unit} · {foodName}".
// Hovering reveals two affordances: a pencil (edit — opens the Nutrition Facts
// editor to adjust servings for this exact food in place) and a garbage can
// (delete — removes this food line from the meal). "Add food" comes later with
// the empty-meal build.
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
      <span class="food-actions">
        <button
          type="button"
          class="food-action edit"
          matTooltip="Edit food (Nutrition Facts)"
          matTooltipPosition="left"
          (click)="editItem.emit(item())">
          ✎
        </button>
        <button
          type="button"
          class="food-action delete"
          matTooltip="Delete food from meal"
          matTooltipPosition="left"
          (click)="deleteItem.emit(item())">
          🗑
        </button>
      </span>
    </div>
  `,
  styleUrls: ['./food.scss'],
})
export class FoodComponent {
  readonly item = input.required<MealItem>();

  /** Pencil — open the Nutrition Facts editor for this exact food in place. */
  readonly editItem = output<MealItem>();

  /** Garbage can — remove this food line from the meal. */
  readonly deleteItem = output<MealItem>();
}
