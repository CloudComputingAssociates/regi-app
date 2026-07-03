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
        <span class="slot-title">Meal {{ slot().slotOrder }}</span>
        @if (title()) {
          <span class="meal-name">{{ title() }}</span>
        }
        <button
          type="button"
          class="edit-affordance"
          matTooltip="Edit meal name"
          matTooltipPosition="above">
          ✎
        </button>
        @if (slot().mealId != null) {
          <button
            type="button"
            class="delete-affordance"
            matTooltip="Remove meal from slot"
            matTooltipPosition="above"
            (click)="deleteMeal.emit(slot().slotOrder)">
            🗑
          </button>
        }
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
          <span class="chip fiber">F {{ round(macros().fiberG) }}</span>
        </div>
        <div class="food-rows">
          @for (item of items(); track item.id) {
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

  /** Emitted (with this slot's slotOrder) when the trash is clicked. */
  readonly deleteMeal = output<number>();

  readonly isEmpty = computed(() => !this.slot().isDiningOut && this.slot().mealId == null);

  // Title = the primary protein's short name (shortDescription, else foodName),
  // from the meal's items (streamed in, so it refines once they load). Falls
  // back to the slot's meal name with the generator's trailing " meal" stripped.
  readonly title = computed<string>(() => {
    const items = this.items();
    const primary = items.find((i) => i.itemRole === 'primary') ?? items[0];
    if (primary) return (primary.shortDescription?.trim() || primary.foodName?.trim()) ?? '';
    return (this.slot().mealName ?? '').replace(/\s+meal$/i, '').trim();
  });

  /** CDK drop handler for an empty slot — copy semantics (no array mutation),
   *  so the dragged meal stays in the binder. */
  onDrop(event: CdkDragDrop<unknown>): void {
    const meal = event.item.data as { id?: number } | undefined;
    if (meal?.id == null) return;
    this.placeMeal.emit({ slotOrder: this.slot().slotOrder, mealId: meal.id });
  }

  // Chips read from the server-computed slot macros (same source as the top
  // bars) — accurate and present the moment the menu loads, rather than summing
  // per-item macros that stream in later and are null for AI 'pending' items.
  readonly macros = computed<SlotMacros>(() => {
    const m = this.slot().macros;
    return {
      proteinG: m?.proteinG ?? 0,
      carbG: m?.carbG ?? 0,
      fatG: m?.fatG ?? 0,
      fiberG: m?.fiberG ?? 0,
    };
  });

  round(n: number): number {
    return Math.round(n);
  }
}
