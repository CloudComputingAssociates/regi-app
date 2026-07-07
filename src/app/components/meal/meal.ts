// src/app/components/meal/meal.ts
//
// One meal slot on the menus-meals grid. Header reads "Meal {slotOrder}
// ({slotLabel})" with a visual-only inline-edit affordance. Body shows
// macro chips (P/C/F/Fi grams — never calories) and the food rows. Handles
// three states: filled, empty (pick a meal), and dining-out.
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MealItem, MenuSlot } from '../../models';
import { Food } from '../../models/food.model';
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
    <div class="slot-card" [class.empty]="isEmpty()" [class.editing]="editing()">
      <div class="slot-header">
        <span class="slot-title">Meal {{ slot().slotOrder }}</span>
        @if (editing() && slot().mealId != null) {
          <!-- Recessed, indented box + blinking caret so it obviously reads as
               editable. Commits on Enter or when focus leaves (e.g. the user
               clicks a food row's pencil). -->
          <input
            #nameInput
            type="text"
            class="meal-name-edit"
            [value]="nameSeed()"
            (keydown.enter)="commitName($any($event.target).value); $any($event.target).blur()"
            (blur)="commitName($any($event.target).value)"
            aria-label="Meal name" />
        } @else if (title()) {
          <span class="meal-name">{{ title() }}</span>
        }
        @if (!slot().isDiningOut) {
          @if (editing()) {
            <button
              type="button"
              class="edit-affordance done"
              matTooltip="Done editing"
              matTooltipPosition="above"
              (click)="doneEdit.emit()">
              ✓
            </button>
          } @else {
            <button
              type="button"
              class="edit-affordance"
              matTooltip="Edit foods"
              matTooltipPosition="above"
              (click)="editSlot.emit()">
              ✎
            </button>
          }
        }
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
      } @else if (isEmpty() && !editing()) {
        <div
          class="slot-placeholder"
          cdkDropList
          [cdkDropListEnterPredicate]="mealDropPredicate"
          (cdkDropListDropped)="onDrop($event)">
          <span>empty slot — pick a meal</span>
          <button type="button" class="add-stub" disabled>+ from lookaside</button>
        </div>
      } @else {
        <!-- When editing, this body is the food drop target (enterPredicate
             only admits lookaside food drags on the editing card). Otherwise
             the predicate rejects everything, so it's an inert container. -->
        <div
          class="slot-body"
          cdkDropList
          [cdkDropListEnterPredicate]="foodDropPredicate"
          (cdkDropListDropped)="onDropFood($event)">
          @if (slot().mealId != null) {
            <div class="macro-chips">
              <span class="chip protein">P {{ round(macros().proteinG) }}</span>
              <span class="chip carb">C {{ round(macros().carbG) }}</span>
              <span class="chip fat">F {{ round(macros().fatG) }}</span>
              <span class="chip fiber">F {{ round(macros().fiberG) }}</span>
              <span class="meal-cals">{{ calories() }} cals</span>
            </div>
          }
          <div class="food-rows">
            @for (item of items(); track item.id) {
              <app-food
                [item]="item"
                [editing]="editing()"
                [resolving]="resolvingItemId() === item.id"
                (editItem)="editItem.emit($event)"
                (deleteItem)="deleteItem.emit($event)"
                (removeItem)="removeItem.emit($event)" />
            }
          </div>
          @if (editing() && items().length === 0) {
            <div class="edit-drop-hint">Click or drag a food to add</div>
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

  /** True when this slot is the one currently being edited (drives the accent
   *  border, the ✎→✓ Done swap, and the per-row ✕ remove buttons). */
  readonly editing = input<boolean>(false);

  /** The item id whose food is being resolved for the serving popup (drives
   *  that row's pencil busy state). */
  readonly resolvingItemId = input<number | null>(null);

  /** Emitted when a binder meal is dropped on this (empty) slot. The parent
   *  supplies the menuId and calls the assign endpoint. */
  readonly placeMeal = output<{ slotOrder: number; mealId: number }>();

  /** Emitted (with this slot's slotOrder) when the trash is clicked. */
  readonly deleteMeal = output<number>();

  /** ✎ — enter edit mode for this slot (parent calls beginEditingSlot). */
  readonly editSlot = output<void>();

  /** ✓ — leave edit mode (parent calls stopEditing). */
  readonly doneEdit = output<void>();

  /** Inline name box committed — parent persists the new meal name. */
  readonly renameMeal = output<{ mealId: number; name: string }>();

  /** Pencil on a food row — edit that food's Nutrition Facts (servings) in place. */
  readonly editItem = output<MealItem>();

  /** Garbage can on a food row — delete that food from the meal. */
  readonly deleteItem = output<MealItem>();

  /** ✕ on a food row (edit mode) — remove that item from the meal. */
  readonly removeItem = output<MealItem>();

  /** A lookaside food dropped on this (editing) meal card. */
  readonly dropFood = output<{ food: Food; serving: number }>();

  readonly isEmpty = computed(() => !this.slot().isDiningOut && this.slot().mealId == null);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  /** Seed for the inline name box — exactly what the header shows, so editing
   *  starts from the visible name and the committed value replaces it. */
  readonly nameSeed = computed<string>(() => this.title());

  // Auto-focus the name box once per edit-mode entry so the caret blinks there
  // immediately. Guarded by mealId so a later menu refresh (new slot reference)
  // doesn't steal focus back while the user is elsewhere (e.g. a row pencil).
  private focusedForMeal: number | null = null;
  private readonly focusNameEffect = effect(() => {
    const el = this.nameInput()?.nativeElement;
    const mealId = this.slot().mealId ?? null;
    if (!this.editing()) {
      this.focusedForMeal = null;
      return;
    }
    if (el && mealId != null && this.focusedForMeal !== mealId) {
      this.focusedForMeal = mealId;
      queueMicrotask(() => el.focus());
    }
  });

  /** Persist a changed meal name (no-op on empty or unchanged). */
  commitName(value: string): void {
    const mealId = this.slot().mealId;
    const name = value.trim();
    if (mealId == null || !name || name === this.nameSeed().trim()) return;
    this.renameMeal.emit({ mealId, name });
  }

  // Header name = the MEAL's own name (so an edited name shows here), with the
  // generator's trailing " meal" stripped. Falls back to the primary food's
  // short name only when the meal has no explicit name yet.
  readonly title = computed<string>(() => {
    const mealName = (this.slot().mealName ?? '').replace(/\s+meal$/i, '').trim();
    if (mealName) return mealName;
    const items = this.items();
    const primary = items.find((i) => i.itemRole === 'primary') ?? items[0];
    return (primary?.food?.shortDescription?.trim() || primary?.foodName?.trim()) ?? '';
  });

  /** CDK drop handler for an empty slot — copy semantics (no array mutation),
   *  so the dragged meal stays in the binder. */
  onDrop(event: CdkDragDrop<unknown>): void {
    const meal = event.item.data as { id?: number } | undefined;
    if (meal?.id == null) return;
    this.placeMeal.emit({ slotOrder: this.slot().slotOrder, mealId: meal.id });
  }

  /** CDK drop handler for the editing meal body — a lookaside food row. */
  onDropFood(event: CdkDragDrop<unknown>): void {
    const data = event.item.data as { food?: Food; serving?: number } | undefined;
    if (!data?.food) return;
    this.dropFood.emit({ food: data.food, serving: data.serving ?? 1 });
  }

  // Drag-data shape guards. Binder MEAL drags carry a Meal ({ id, … }); lookaside
  // FOOD drags carry { food, serving }. Predicates keep meal drags out of the
  // food target and food drags out of the empty-slot (meal) target.
  private isFoodDrag(d: unknown): boolean {
    return !!d && typeof d === 'object' && 'food' in d;
  }

  private isMealDrag(d: unknown): boolean {
    return !!d && typeof d === 'object' && 'id' in d && !('food' in d);
  }

  /** Editing meal body accepts ONLY food drags, and only while editing. */
  readonly foodDropPredicate = (drag: CdkDrag): boolean =>
    this.editing() && this.isFoodDrag(drag.data);

  /** Empty-slot placeholder accepts ONLY binder meal drags (rejects food). */
  readonly mealDropPredicate = (drag: CdkDrag): boolean => this.isMealDrag(drag.data);

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

  /** Meal total calories (server-computed slot macro), for the chips row. */
  readonly calories = computed<number>(() => Math.round(this.slot().macros?.calories ?? 0));

  round(n: number): number {
    return Math.round(n);
  }
}
