// src/app/components/meal/meal.ts
//
// One meal slot on the menus-meals grid. Header reads "Meal {slotOrder}
// ({slotLabel})" with a visual-only inline-edit affordance. Body shows
// macro chips (P/C/F/Fi grams — never calories) and the food rows. Handles
// three states: filled, empty (pick a meal), and dining-out.
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
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
    <div class="slot-card" [class.empty]="isEmpty()" [class.editing]="editing()" [class.clone]="isClone()">
      <div class="slot-header">
        <!-- Pin disc leads; the meal NAME box is the primary title (filled slots)
             or "Meal N" for an empty slot; the "Meal N" stamp trails. Copy +
             delete live down in the macro summary row; the + add sits in the
             foods area. All discs share the raised .icon-disc chrome + one size. -->
        @if (slot().mealId != null && !isClone()) {
          <!-- Save-state disc (same .icon-disc circle throughout):
               • clean, unsaved → GREY fork & knife → click to save (always live)
               • dirty (changed) → GREEN check inside the disc → click to save
               • saved (Binder)  → YELLOW fork & knife → click to remove (confirm)
               Never disabled while unpinned: a fresh or just-removed meal is
               savable in one click (no dummy edit needed to re-save).
               Hidden on a CLONE — the origin owns the shared meal's save state. -->
          <button
            type="button"
            class="icon-disc pin-disc"
            [class.icon-disc-pinned]="pinAlive()"
            [class.pin-dirty]="!pinAlive() && dirty()"
            [matTooltip]="pinTooltip()"
            matTooltipPosition="above"
            (click)="onPin()">
            <mat-icon>{{ (!pinAlive() && dirty()) ? 'check' : 'restaurant' }}</mat-icon>
          </button>
        }
        <div class="header-name">
          @if (slot().mealId == null) {
            <span class="slot-title">Meal {{ slot().slotOrder }}</span>
          } @else if (isClone()) {
            <!-- Clone (phantom): read-only name — the origin meal is where edits
                 happen; this slot is just a pointer that fills the day. -->
            <span class="clone-name" [title]="title()">{{ title() }}</span>
          } @else {
            <div class="name-wrap">
              <input
                #nameBox
                type="text"
                class="meal-name-box regi-field"
                [value]="title()"
                (focus)="onNameFocus(nameBox)"
                (input)="nameDraft.set(nameBox.value)"
                (keydown.enter)="nameBox.blur()"
                (keydown.escape)="nameBox.value = title(); nameBox.blur()"
                (blur)="onNameBlur(nameBox.value)"
                aria-label="Meal name" />
              <!-- Enter-arrow disc: always present just OUTSIDE the box (round,
                   tight). Grey at rest; turns the standard confirm-green while
                   the title is being edited. Pressing it commits, same as Enter. -->
              <button
                type="button"
                class="name-commit"
                [class.active]="showNameCommit()"
                matTooltip="Save name"
                matTooltipPosition="above"
                (mousedown)="$event.preventDefault()"
                (click)="nameBox.blur()">
                <mat-icon>keyboard_return</mat-icon>
              </button>
            </div>
          }
        </div>
        <!-- Copy + delete moved down to the macro summary row; the + add disc
             moved into the foods area. Individual food edit/remove is per-row. -->
        <!-- "Meal N" positional stamp — trailing the header. Empty slots show it
             via .slot-title instead, so only stamp filled/clone slots here. -->
        @if (slot().mealId != null) {
          <span class="meal-watermark">Meal {{ slot().slotOrder }}</span>
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
          [class.bloom]="dropHighlight()"
          cdkDropList
          [cdkDropListEnterPredicate]="mealDropPredicate"
          (cdkDropListDropped)="onDrop($event)">
          <div class="pick-line">
            <button
              type="button"
              class="create-btn"
              matTooltip="Add foods to build this meal"
              matTooltipPosition="above"
              (click)="toggleAdd.emit()">
              + Add meal
            </button>
          </div>
          <span class="pick-sub">or drag from <mat-icon class="inline-icon">restaurant</mat-icon> <span class="meals-word">Meals</span></span>
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
            <!-- Summary macro row: dropdown chevron FIRST, then the Protein +
                 Fiber discs (we browse meals by those quantities, not calories).
                 Copy + delete are pushed to the far right so they hold still when
                 the reveal opens/closes. -->
            <div class="macro-summary">
              <button
                type="button"
                class="card-toggle"
                [matTooltip]="macrosOpen() ? 'Hide extra macros' : 'Show Calories, Carbs & Fats'"
                matTooltipPosition="above"
                (click)="toggleMacros()">
                <mat-icon>{{ macrosOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
              </button>
              <span class="chip protein">P {{ round(macros().proteinG) }}</span>
              <span class="chip fiber">F {{ round(macros().fiberG) }}</span>
              <div class="summary-actions">
                <!-- Copy → duplicate this meal as an independent "(copy)" in the
                     next empty slot. Non-clone meals, while a slot is free. -->
                @if (canDuplicate()) {
                  <button
                    type="button"
                    class="icon-disc repeat-disc"
                    matTooltip="Duplicate this meal"
                    matTooltipPosition="above"
                    (click)="duplicateMeal.emit(slot().mealId!)">
                    <mat-icon>content_copy</mat-icon>
                  </button>
                }
                <button
                  type="button"
                  class="icon-disc icon-disc-danger"
                  [matTooltip]="isClone() ? 'Remove this repeat (frees the slot)' : 'Delete meal'"
                  matTooltipPosition="above"
                  (click)="deleteMeal.emit(slot().slotOrder)">
                  <mat-icon>delete_outline</mat-icon>
                </button>
              </div>
            </div>
            <!-- Chevron reveal (default OPEN): the OTHER macros — Carbs, Fat, Cals
                 (Protein + Fiber already show in the summary, so no repeat) — plus
                 the orig/clone tag. Expanding pushes the food rows down. -->
            @if (macrosOpen()) {
              <div class="macro-chips">
                <span class="chip carb">C {{ round(macros().carbG) }}</span>
                <span class="chip fat">F {{ round(macros().fatG) }}</span>
                <span class="meal-cals">{{ calories() }} cals</span>
                @if (repeatRole()) {
                  <span class="repeat-badge" [class.is-clone]="isClone()">{{ isClone() ? 'clone' : 'orig' }}</span>
                }
              </div>
            }
          }
          <!-- Foods area. The + add-food disc sits in line with the first food row
               (top-right of the foods), so "add food" reads as part of the foods. -->
          <div class="food-rows">
            @if (slot().mealId != null && !isClone()) {
              <button
                type="button"
                class="icon-disc add-affordance"
                [class.icon-disc-pressed]="editing()"
                [matTooltip]="editing() ? 'Adding foods (close from the food list)' : 'Add food to meal'"
                matTooltipPosition="above"
                (click)="toggleAdd.emit()">
                <mat-icon>add</mat-icon>
              </button>
            }
            @for (item of items(); track item.id) {
              <app-food
                [item]="item"
                [resolving]="resolvingItemId() === item.id"
                [readonly]="isClone()"
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

  /** Binder pin state of the slotted meal (alive = pinned or undiverged clone).
   *  Computed upstream from the resolved Meal so this card stays presentational.
   *  This is the SOLE visual signal — the card body never dims. */
  readonly pinAlive = input<boolean>(false);

  /** True when the meal has unsaved work (created / renamed / edited this
   *  session, or a diverged clone) — drives the ENABLED green check. Computed
   *  upstream so this card stays presentational. */
  readonly dirty = input<boolean>(false);

  /** True while a Binder meal is being dragged — the empty-slot placeholder
   *  "blooms" a bright border to advertise it as a valid drop target. */
  readonly dropHighlight = input<boolean>(false);

  /** Repeat role for this slot, inferred upstream from shared mealId across the
   *  menu's slots: 'origin' = the editable master, 'clone' = a read-only phantom
   *  pointer, null = not repeated (a plain, fully-editable meal). */
  readonly repeatRole = input<'origin' | 'clone' | null>(null);

  /** True when this meal can be duplicated — a non-clone meal with at least one
   *  empty slot left in the menu for the "(copy)" to land in. Drives the Copy
   *  button's presence. */
  readonly canDuplicate = input<boolean>(false);

  /** True when this slot is a read-only clone (phantom) of the origin meal. */
  readonly isClone = computed<boolean>(() => this.repeatRole() === 'clone');

  /** Emitted when a binder meal is dropped on this (empty) slot. The parent
   *  supplies the menuId and calls the assign endpoint. */
  readonly placeMeal = output<{ slotOrder: number; mealId: number }>();

  /** Emitted (with this slot's slotOrder) when the trash is clicked. */
  readonly deleteMeal = output<number>();

  /** Copy clicked — duplicate this meal (its mealId) as an independent "(copy)"
   *  in the menu's next empty slot. The parent calls the duplicate on
   *  RotationService. */
  readonly duplicateMeal = output<number>();

  /** + — toggle this meal as the lookaside add target (parent begins/stops). */
  readonly toggleAdd = output<void>();

  /** Inline name box committed — parent persists the new meal name. */
  readonly renameMeal = output<{ mealId: number; name: string }>();

  /** Green-check clicked — save this (dirty) meal to the Binder. */
  readonly pinMeal = output<void>();

  /** Yellow fork&knife clicked — remove this meal FROM the Binder (it stays
   *  slotted). The parent confirms + unpins. */
  readonly removeFromBinder = output<void>();

  /** Tooltip on the save-state disc, by state. */
  readonly pinTooltip = computed<string>(() => {
    if (this.pinAlive()) return 'In your Binder — click to remove';
    return 'Save to Binder';
  });

  /** Save-state disc click: saved → remove-from-Binder; otherwise (clean OR
   *  dirty) → save. Unpinned is always savable in one click. */
  onPin(): void {
    if (this.pinAlive()) {
      this.removeFromBinder.emit();
      return;
    }
    this.pinMeal.emit();
  }

  /** ✎ on a food row — edit that item's serving (parent opens the popup). */
  readonly editItem = output<MealItem>();

  /** ✕ on a food row — remove that item from the meal. */
  readonly removeItem = output<MealItem>();

  /** A lookaside food dropped on this (editing) meal card. */
  readonly dropFood = output<{ food: Food; serving: number }>();

  readonly isEmpty = computed(() => !this.slot().isDiningOut && this.slot().mealId == null);

  /** Macro reveal open state — defaults OPEN so meal + menu cards line up the
   *  same on load. Collapsed shows just the Protein + Fiber summary discs. */
  readonly macrosOpen = signal(true);

  toggleMacros(): void {
    this.macrosOpen.update((v) => !v);
  }

  /** True while the name box has focus. */
  private readonly nameFocused = signal(false);
  /** Current text in the name box (tracked for the dirty check). */
  readonly nameDraft = signal('');

  /** Show the green Enter/commit-arrow whenever the box is being edited (focused
   *  with text) — the arrow is the visible "press Enter to save" affordance, so
   *  it must be present the whole time you're editing, not only after a change.
   *  Committing an unchanged name is a harmless no-op (see commitName). */
  readonly showNameCommit = computed<boolean>(
    () => this.nameFocused() && this.nameDraft().trim() !== '',
  );

  onNameFocus(el: HTMLInputElement): void {
    this.nameFocused.set(true);
    this.nameDraft.set(el.value);
    // Highlight the whole title on the focusing click so typing replaces it; a
    // second click (already focused) drops the cursor to edit in place.
    setTimeout(() => el.select());
  }

  onNameBlur(value: string): void {
    this.nameFocused.set(false);
    this.commitName(value);
  }

  /** Persist a changed meal name from the name box (no-op on empty/unchanged). */
  commitName(value: string): void {
    const mealId = this.slot().mealId;
    const name = value.trim();
    if (mealId == null || !name || name === this.title().trim()) return;
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

  // Drag-data shape guards. Binder MEAL drags carry a Meal ({ id, mealType, … });
  // MENU drags carry a Menu ({ id, slots, … }); lookaside FOOD drags carry
  // { food, serving }. A meal slot accepts ONLY meals — so we exclude food
  // (has `food`) AND menus (have `slots`), since a Menu also carries `id`.
  private isFoodDrag(d: unknown): boolean {
    return !!d && typeof d === 'object' && 'food' in d;
  }

  private isMealDrag(d: unknown): boolean {
    return !!d && typeof d === 'object' && 'id' in d && !('food' in d) && !('slots' in d);
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
