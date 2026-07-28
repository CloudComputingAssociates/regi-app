// src/app/components/meal/meal.ts
//
// One slot on the menus-meals grid — now a MULTI-MEAL slot (0–4 stacked meals).
// It's a flip card:
//   FRONT = an image grid of the stacked meals (all visible at once). Each tile
//           carries the meal photo + name, a top-RIGHT ⤢ to flip to that meal's
//           detail, and a top-LEFT 🗑 to remove just that meal. A filled,
//           non-full slot is also a drop target to APPEND another meal.
//   BACK  = ONE meal (the one whose tile ⤢ was pressed) at full-card detail:
//           name, macro chips, recipe link, food rows.
// A slim summed-macro strip + the whole-slot clear 🗑 live on the front header.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MealItem, MenuSlot, MenuSlotMeal } from '../../models';
import { Food } from '../../models/food.model';
import { FoodComponent } from '../food/food';
import { RotationService } from '../../services/rotation.service';
import { TabService } from '../../services/tab.service';

interface Macro {
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
  calories: number;
}

@Component({
  selector: 'app-meal',
  imports: [MatTooltipModule, MatIconModule, FoodComponent, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="slot-card" [class.empty]="isEmpty()" [class.editing]="editing()">
      <!-- Header: slot letter, summed macro strip (stays visible without flipping),
           and the whole-slot clear (wipes ALL meals). -->
      <div class="slot-header">
        <span class="slot-title">Slot {{ slot().slotOrder }}</span>
        @if (!isEmpty() && !slot().isDiningOut) {
          <span class="chip protein">P {{ round(macros().proteinG) }}</span>
          <span class="chip fiber">F {{ round(macros().fiberG) }}</span>
          <span class="chip carb">C {{ round(macros().carbG) }}</span>
          <span class="chip fat">F {{ round(macros().fatG) }}</span>
          <span class="slot-cals">{{ round(macros().calories) }} cals</span>
          <button
            type="button"
            class="icon-disc icon-disc-danger clear-slot"
            matTooltip="Clear this slot (all meals)"
            matTooltipPosition="above"
            (click)="deleteMeal.emit(slot().slotOrder)">
            <mat-icon>delete_outline</mat-icon>
          </button>
        }
      </div>

      @if (slot().isDiningOut) {
        <div class="slot-placeholder dining-out">
          <span class="placeholder-icon">🍽️</span><span>Dining out</span>
        </div>
      } @else if (isEmpty()) {
        <div
          class="slot-placeholder pick"
          [class.bloom]="dropHighlight()"
          cdkDropList
          [cdkDropListEnterPredicate]="mealDropPredicate"
          (cdkDropListDropped)="onDropMeal($event)">
          <span class="pick-sub">drag a meal from <mat-icon class="inline-icon">restaurant</mat-icon> <span class="meals-word">Meals</span></span>
        </div>
      } @else {
        <!-- Flip card: FRONT image grid ⇄ BACK single-meal detail. -->
        <div class="flip" [class.flipped]="flippedMeal() != null">
          <div class="flip-inner">
            <!-- FRONT: grid of the stacked meals; also a drop target to append. -->
            <div
              class="flip-front"
              [attr.data-count]="gridCount()"
              cdkDropList
              [cdkDropListEnterPredicate]="appendPredicate"
              (cdkDropListDropped)="onDropMeal($event)">
              @for (m of meals(); track m.mealId) {
                <div class="meal-tile">
                  @if (tileImage(m); as src) {
                    <img class="tile-img" [src]="src" alt="" />
                  } @else {
                    <div class="tile-noimg"><span>{{ clean(m.mealName) }}</span></div>
                  }
                  <div class="tile-scrim"></div>
                  <span class="tile-name">{{ clean(m.mealName) }}</span>
                  <button
                    type="button"
                    class="tile-btn tile-flip"
                    matTooltip="Open this meal"
                    (click)="flipTo(m.mealId, $event)">
                    <mat-icon>chevron_right</mat-icon>
                  </button>
                </div>
              }
              @if (meals().length === 3) {
                <div class="meal-tile tile-empty"><span>drop a 4th</span></div>
              }
            </div>

            <!-- BACK: the one flipped meal, full detail. -->
            <div class="flip-back">
              @if (flippedMeal(); as fm) {
                <!-- Same ">" control, same bottom-right corner as the FRONT tiles. -->
                <button
                  type="button"
                  class="tile-btn tile-flip"
                  matTooltip="Back to photos"
                  (click)="flipHome()">
                  <mat-icon>chevron_right</mat-icon>
                </button>
                <div class="back-head">
                  <input
                    #nameBox
                    type="text"
                    class="meal-name-box regi-field"
                    [value]="clean(fm.mealName)"
                    (keydown.enter)="nameBox.blur()"
                    (keydown.escape)="nameBox.value = clean(fm.mealName); nameBox.blur()"
                    (blur)="commitName(fm, nameBox.value)"
                    aria-label="Meal name" />
                  <button
                    type="button"
                    class="save-check"
                    [class.active]="isDirty(fm.mealId)"
                    matTooltip="Save changes"
                    (click)="pinMeal.emit(fm.mealId)">
                    <mat-icon>check</mat-icon>
                  </button>
                  <button
                    type="button"
                    class="back-delete"
                    matTooltip="Remove this meal"
                    (click)="removeMeal.emit({ slotOrder: slot().slotOrder, mealId: fm.mealId })">
                    <mat-icon>delete_outline</mat-icon>
                  </button>
                </div>

                @if (recipeLinkFor(fm.mealId); as link) {
                  <button
                    type="button"
                    class="recipe-link"
                    matTooltip="Open the source recipe PDF"
                    (click)="openRecipe(link)">Recipe Link (.PDF)</button>
                }

                <div class="macro-row">
                  <span class="chip protein">P {{ round(mac(fm.macros).proteinG) }}</span>
                  <span class="chip fiber">F {{ round(mac(fm.macros).fiberG) }}</span>
                  <span class="chip fat">F {{ round(mac(fm.macros).fatG) }}</span>
                  <span class="chip carb">C {{ round(mac(fm.macros).carbG) }}</span>
                  <span class="slot-cals">{{ round(mac(fm.macros).calories) }} cals</span>
                  <button
                    type="button"
                    class="icon-disc add-affordance"
                    matTooltip="Add food to this meal"
                    (click)="toggleAdd.emit(fm.mealId)">
                    <mat-icon>add</mat-icon>
                  </button>
                </div>

                <div class="food-rows">
                  @for (item of mainItemsFor(fm.mealId); track item.id) {
                    <app-food
                      [item]="item"
                      [resolving]="resolvingItemId() === item.id"
                      (editItem)="editItem.emit({ mealId: fm.mealId, item: $event })"
                      (removeItem)="removeItem.emit({ mealId: fm.mealId, item: $event })" />
                  }
                </div>
                @if (dynamicItemsFor(fm.mealId).length > 0) {
                  <div class="dyn-accordion">
                    <button
                      type="button"
                      class="dyn-head"
                      (click)="dynamicOpen.set(!dynamicOpen())">
                      <mat-icon class="dyn-chevron">{{ dynamicOpen() ? 'expand_more' : 'chevron_right' }}</mat-icon>
                      <span class="dyn-label">Dynamic Ingredients added</span>
                      <span class="dyn-count">{{ dynamicItemsFor(fm.mealId).length }}</span>
                    </button>
                    @if (dynamicOpen()) {
                      <div class="food-rows dyn-rows">
                        @for (item of dynamicItemsFor(fm.mealId); track item.id) {
                          <app-food
                            [item]="item"
                            [resolving]="resolvingItemId() === item.id"
                            (editItem)="editItem.emit({ mealId: fm.mealId, item: $event })"
                            (removeItem)="removeItem.emit({ mealId: fm.mealId, item: $event })" />
                        }
                      </div>
                    }
                  </div>
                }
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./meal.scss'],
})
export class MealComponent {
  private readonly rotation = inject(RotationService);
  private readonly tabs = inject(TabService);

  readonly slot = input.required<MenuSlot>();
  readonly editing = input<boolean>(false);
  readonly resolvingItemId = input<number | null>(null);
  readonly dropHighlight = input<boolean>(false);

  /** A binder meal was dropped on this slot — append it (parent calls place). */
  readonly placeMeal = output<{ slotOrder: number; mealId: number }>();
  /** Per-tile trash — remove just this meal from the slot. */
  readonly removeMeal = output<{ slotOrder: number; mealId: number }>();
  /** Header trash — clear the WHOLE slot (all meals). Emits slotOrder. */
  readonly deleteMeal = output<number>();
  /** + on the back — begin adding food to this meal (emits its mealId). */
  readonly toggleAdd = output<number>();
  /** Inline name box committed. */
  readonly renameMeal = output<{ mealId: number; name: string }>();
  /** Green check — save this meal (parent routes fork/first-save). */
  readonly pinMeal = output<number>();
  /** ✎ on a food row. */
  readonly editItem = output<{ mealId: number; item: MealItem }>();
  /** ✕ on a food row. */
  readonly removeItem = output<{ mealId: number; item: MealItem }>();
  /** A lookaside food dropped on this meal (kept for the editing food-add flow). */
  readonly dropFood = output<{ food: Food; serving: number }>();

  /** Stacked meals, ordered by position. */
  readonly meals = computed<MenuSlotMeal[]>(() =>
    [...(this.slot().meals ?? [])].sort((a, b) => a.position - b.position),
  );
  readonly isEmpty = computed(() => !this.slot().isDiningOut && this.meals().length === 0);
  readonly isFull = computed(() => this.meals().length >= 4);
  /** Grid divisions: 1 (full), 2 (halves), 3–4 (quarters). */
  readonly gridCount = computed(() => Math.min(4, Math.max(this.meals().length, 1)));

  /** Which meal is zoomed to the back face — null = showing the front grid. */
  readonly flippedMealId = signal<number | null>(null);
  /** The flipped meal, or null. Derived (not stored) so a removed meal auto-
   *  un-flips the moment meals[] no longer contains it. */
  readonly flippedMeal = computed<MenuSlotMeal | null>(
    () => this.meals().find((m) => m.mealId === this.flippedMealId()) ?? null,
  );

  /** Dynamic-ingredients accordion open state (back face). */
  readonly dynamicOpen = signal(false);

  /** The ONLY flip trigger: a tile's ⤢ opens that meal's detail. */
  flipTo(mealId: number, ev: Event): void {
    ev.stopPropagation();
    ev.preventDefault();
    this.flippedMealId.set(mealId);
  }

  flipHome(): void {
    this.flippedMealId.set(null);
  }

  /** Summed slot macros (front strip). */
  readonly macros = computed<Macro>(() => this.mac(this.slot().macros));

  /** Safe macro accessor (nullable MenuMacros → zeroed Macro). */
  mac(m: MenuSlotMeal['macros'] | undefined): Macro {
    return {
      proteinG: m?.proteinG ?? 0,
      carbG: m?.carbG ?? 0,
      fatG: m?.fatG ?? 0,
      fiberG: m?.fiberG ?? 0,
      calories: m?.calories ?? 0,
    };
  }

  /** Food rows for a stacked meal, split into real foods and dynamic ingredients. */
  mainItemsFor(mealId: number): MealItem[] {
    return this.rotation.slotItems(mealId).filter((i) => i.food?.dynamicIngredient !== true);
  }
  dynamicItemsFor(mealId: number): MealItem[] {
    return this.rotation.slotItems(mealId).filter((i) => i.food?.dynamicIngredient === true);
  }

  /** Tile image: prefer the FULL image (from the cached Meal) — the tile is large,
   *  so the small thumbnail upscales and blurs. Fall back to the slot's thumbnail
   *  (before the full Meal has streamed in), then '' → neutral tile. */
  tileImage(m: MenuSlotMeal): string {
    const full = this.rotation.getMeal(m.mealId)?.mealImage?.trim();
    return full || m.mealImageThumbnail?.trim() || '';
  }

  /** Source recipe URL for a stacked meal, from the cached full Meal. */
  recipeLinkFor(mealId: number): string {
    return (this.rotation.getMeal(mealId)?.recipeLink ?? '').trim();
  }

  openRecipe(url: string): void {
    if (url) this.tabs.openWebView(url);
  }

  isDirty(mealId: number): boolean {
    return this.rotation.isMealDirty(mealId);
  }

  /** Strip the server's trailing " (copy)" (from copy-on-write forks) for display. */
  clean(name: string | null | undefined): string {
    return (name ?? '').replace(/(\s*\(copy\))+\s*$/i, '').trim();
  }

  commitName(fm: MenuSlotMeal, value: string): void {
    const name = value.trim();
    if (!name || name === this.clean(fm.mealName)) return;
    this.renameMeal.emit({ mealId: fm.mealId, name });
  }

  round(n: number | null | undefined): number {
    return Math.round(n ?? 0);
  }

  // ---- Drag/drop -------------------------------------------------------
  private isMealDrag(d: unknown): boolean {
    return !!d && typeof d === 'object' && 'id' in d && !('food' in d) && !('slots' in d);
  }

  /** Empty-slot placeholder accepts a binder meal drag. */
  readonly mealDropPredicate = (drag: CdkDrag): boolean => this.isMealDrag(drag.data);

  /** Front grid accepts an append only while the slot has room and isn't dining-out. */
  readonly appendPredicate = (drag: CdkDrag): boolean =>
    !this.isFull() && !this.slot().isDiningOut && this.isMealDrag(drag.data);

  onDropMeal(event: CdkDragDrop<unknown>): void {
    const meal = event.item.data as { id?: number } | undefined;
    if (meal?.id == null) return;
    this.placeMeal.emit({ slotOrder: this.slot().slotOrder, mealId: meal.id });
  }
}
