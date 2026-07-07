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
  signal,
  viewChild,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
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
  imports: [MatTooltipModule, MatIconModule, FoodComponent, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="slot-card" [class.empty]="isEmpty()" [class.editing]="editing()">
      <div class="slot-header">
        <span class="slot-title">Meal {{ slot().slotOrder }}</span>
        @if (renaming() && slot().mealId != null) {
          <!-- Recessed, indented box + blinking caret. Commits on Enter or when
               focus leaves; Escape cancels. -->
          <input
            #nameInput
            type="text"
            class="meal-name-edit"
            [value]="nameSeed()"
            (keydown.enter)="commitName($any($event.target).value); $any($event.target).blur()"
            (keydown.escape)="renaming.set(false)"
            (blur)="commitName($any($event.target).value)"
            aria-label="Meal name" />
        } @else if (title()) {
          <span class="meal-name">{{ title() }}</span>
        }
        <!-- + opens the food lookaside targeted at this meal (active while it's
             the add target). Pencil edits the title; trash deletes the meal.
             Editing/removing individual foods happens directly on each row. -->
        @if (!slot().isDiningOut) {
          <button
            type="button"
            class="icon-disc add-affordance"
            [class.icon-disc-active]="editing()"
            matTooltip="Add Food item"
            matTooltipPosition="above"
            (click)="toggleAdd.emit()">
            <mat-icon>add</mat-icon>
          </button>
        }
        @if (slot().mealId != null) {
          <button
            type="button"
            class="icon-disc"
            matTooltip="Edit Meal Title"
            matTooltipPosition="above"
            (click)="renaming.set(true)">
            <mat-icon>edit</mat-icon>
          </button>
          <button
            type="button"
            class="icon-disc icon-disc-danger"
            matTooltip="Delete meal"
            matTooltipPosition="above"
            (click)="deleteMeal.emit(slot().slotOrder)">
            <mat-icon>delete_outline</mat-icon>
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
          class="slot-placeholder pick"
          cdkDropList
          [cdkDropListEnterPredicate]="mealDropPredicate"
          (cdkDropListDropped)="onDrop($event)">
          <span>Pick meal — or</span>
          <button
            type="button"
            class="create-btn"
            matTooltip="Add foods to build this meal"
            matTooltipPosition="above"
            (click)="toggleAdd.emit()">
            Create
          </button>
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
                [resolving]="resolvingItemId() === item.id"
                (editItem)="editItem.emit($event)"
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

  /** True when this meal is the current lookaside "add" target — drives the
   *  accent border, the active + disc, and the card being a food drop target.
   *  Editing/removing individual foods is independent of this. */
  readonly editing = input<boolean>(false);

  /** The item id whose food is being resolved for the serving popup (drives
   *  that row's pencil busy state). */
  readonly resolvingItemId = input<number | null>(null);

  /** Emitted when a binder meal is dropped on this (empty) slot. The parent
   *  supplies the menuId and calls the assign endpoint. */
  readonly placeMeal = output<{ slotOrder: number; mealId: number }>();

  /** Emitted (with this slot's slotOrder) when the trash is clicked. */
  readonly deleteMeal = output<number>();

  /** + — toggle this meal as the lookaside add target (parent begins/stops). */
  readonly toggleAdd = output<void>();

  /** Inline name box committed — parent persists the new meal name. */
  readonly renameMeal = output<{ mealId: number; name: string }>();

  /** ✎ on a food row — edit that item's serving (parent opens the popup). */
  readonly editItem = output<MealItem>();

  /** ✕ on a food row — remove that item from the meal. */
  readonly removeItem = output<MealItem>();

  /** True while the meal title is being renamed inline (local, independent of
   *  the add target). */
  readonly renaming = signal(false);

  /** A lookaside food dropped on this (editing) meal card. */
  readonly dropFood = output<{ food: Food; serving: number }>();

  readonly isEmpty = computed(() => !this.slot().isDiningOut && this.slot().mealId == null);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  /** Seed for the inline name box — exactly what the header shows, so editing
   *  starts from the visible name and the committed value replaces it. */
  readonly nameSeed = computed<string>(() => this.title());

  // Focus + select the name box the moment renaming turns on, so the caret
  // blinks there and the user can type over the existing name.
  private readonly focusNameEffect = effect(() => {
    const el = this.nameInput()?.nativeElement;
    if (this.renaming() && el) {
      queueMicrotask(() => {
        el.focus();
        el.select();
      });
    }
  });

  /** Persist a changed meal name and exit rename (no-op on empty/unchanged). */
  commitName(value: string): void {
    this.renaming.set(false);
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
