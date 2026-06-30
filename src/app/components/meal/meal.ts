// src/app/components/meal/meal.ts
//
// One meal slot on the menus-meals grid. Header reads "Meal {slotOrder}
// ({slotLabel})" with a visual-only inline-edit affordance. Body shows
// macro chips (P/C/F/Fi grams — never calories) and the food rows. Handles
// three states: filled, empty (pick a meal), and dining-out.
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MealItem, MenuSlot } from '../../models';
import { FoodComponent } from '../food/food';

interface SlotMacros {
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
}

@Component({
  selector: 'app-meal',
  imports: [MatTooltipModule, FoodComponent, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="slot-card" [class.empty]="isEmpty()">
      <div class="slot-header">
        <span class="slot-title">Meal {{ slot().slotOrder }} ({{ slot().slotLabel }})</span>
        @if (slot().mealName) {
          <span class="meal-name">{{ slot().mealName }}</span>
        }
        <button
          type="button"
          class="edit-affordance"
          matTooltip="Rename slot"
          matTooltipPosition="above">
          ✎
        </button>
      </div>

      @if (slot().isDiningOut) {
        <div class="slot-placeholder dining-out">
          <span class="placeholder-icon">🍽️</span>
          <span>Dining out</span>
        </div>
      } @else if (isEmpty()) {
        <div class="slot-placeholder" cdkDropList (cdkDropListDropped)="onDrop($event)">
          <span>empty slot — pick a meal</span>
          <button type="button" class="add-stub" disabled>+ from lookaside</button>
        </div>
      } @else {
        <div class="macro-chips">
          <span class="chip protein">P {{ round(macros().proteinG) }}</span>
          <span class="chip carb">C {{ round(macros().carbG) }}</span>
          <span class="chip fat">F {{ round(macros().fatG) }}</span>
          <span class="chip fiber">Fi {{ round(macros().fiberG) }}</span>
        </div>
        <div class="food-rows">
          @for (item of items(); track item.foodId) {
            <app-food [item]="item" />
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./meal.scss'],
})
export class MealComponent {
  readonly slot = input.required<MenuSlot>();
  readonly items = input.required<MealItem[]>();

  /** Emitted when a binder meal is dropped on this (empty) slot. The parent
   *  supplies the menuId and calls the assign endpoint. */
  readonly placeMeal = output<{ slotOrder: number; mealId: number }>();

  readonly isEmpty = computed(() => !this.slot().isDiningOut && this.items().length === 0);

  /** CDK drop handler for an empty slot — copy semantics (no array mutation),
   *  so the dragged meal stays in the binder. */
  onDrop(event: CdkDragDrop<unknown>): void {
    const meal = event.item.data as { id?: number } | undefined;
    if (meal?.id == null) return;
    this.placeMeal.emit({ slotOrder: this.slot().slotOrder, mealId: meal.id });
  }

  readonly macros = computed<SlotMacros>(() => {
    const totals: SlotMacros = { proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 };
    for (const item of this.items()) {
      totals.proteinG += item.proteinG ?? 0;
      totals.carbG += item.carbG ?? 0;
      totals.fatG += item.fatG ?? 0;
      totals.fiberG += item.fiberG ?? 0;
    }
    return totals;
  });

  round(n: number): number {
    return Math.round(n);
  }
}
