// src/app/components/food/food.ts
//
// One food line inside a meal card: "{quantity} {unit} · {foodName}".
// Hovering reveals two affordances: a pencil (edit — opens the Nutrition Facts
// editor to adjust servings for this exact food in place) and a garbage can
// (delete — removes this food line from the meal). "Add food" comes later with
// the empty-meal build.
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MealItem } from '../../models';

@Component({
  selector: 'app-food',
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="food-row">
      <!-- Name first (2/3, clipped) then serving (1/3, clipped); the edit/trash
           actions sit outside this split. -->
      <span class="food-name">{{ item().food?.shortDescription?.trim() || item().foodName }}</span>
      <span class="food-qty">{{ item().quantity }} {{ item().unit }}</span>
      @if (editing()) {
        <span class="food-actions edit-mode">
          <!-- Pencil hidden for items whose food can't be resolved to a full
               Food (e.g. foodSource 'pending' — no persisted row to price). -->
          @if (canEditServing()) {
            <button
              type="button"
              class="food-action edit"
              [class.busy]="resolving()"
              [disabled]="resolving()"
              matTooltip="Edit serving"
              matTooltipPosition="left"
              (click)="editItem.emit(item())">
              ✎
            </button>
          }
          <button
            type="button"
            class="food-remove"
            matTooltip="Remove food from meal"
            matTooltipPosition="left"
            (click)="removeItem.emit(item())">
            ✕
          </button>
        </span>
      } @else {
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
      }
    </div>
  `,
  styleUrls: ['./food.scss'],
})
export class FoodComponent {
  readonly item = input.required<MealItem>();

  /** True while the parent slot is in edit mode — the row shows a ✕ remove
   *  button instead of the hover pencil/trash. */
  readonly editing = input<boolean>(false);

  /** True while this item's food is being fetched to open the serving popup —
   *  the ✎ pencil shows a brief busy state and can't be re-clicked. */
  readonly resolving = input<boolean>(false);

  /** Pencil — open the Nutrition Facts editor for this exact food in place. */
  readonly editItem = output<MealItem>();

  /** Garbage can — remove this food line from the meal. */
  readonly deleteItem = output<MealItem>();

  /** ✕ (edit mode) — remove this item from the meal via deleteMealItem. */
  readonly removeItem = output<MealItem>();

  /** Whether the edit-serving pencil is offered. Pending items carry no
   *  resolved food record (`food` is null), so there's nothing to price. */
  readonly canEditServing = computed<boolean>(() => this.item().food != null);
}
