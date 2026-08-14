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
import { CdkDrag, CdkDragDrop, CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
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
    <div
      class="slot-card"
      [class.empty]="isEmpty()"
      [class.editing]="editing()"
      [class.filled]="!isEmpty() && !slot().isDiningOut"
      [attr.data-slot-order]="slot().slotOrder"
      [attr.data-slot-empty]="isEmpty()">
      @if (slot().isDiningOut) {
        <div class="slot-header"><span class="slot-title">Meal slot {{ slot().slotOrder }}</span></div>
        <div class="slot-placeholder dining-out">
          <span class="placeholder-icon">🍽️</span><span>Dining out</span>
        </div>
      } @else if (isEmpty()) {
        <div class="slot-header"><span class="slot-title">Meal slot {{ slot().slotOrder }}</span></div>
        <div
          class="slot-placeholder pick"
          [class.bloom]="dropHighlight()"
          cdkDropList
          [cdkDropListEnterPredicate]="mealDropPredicate"
          (cdkDropListDropped)="onDropMeal($event)">
          <span class="pick-sub">Drag from <button type="button" class="binder-link" (click)="$event.stopPropagation(); rotation.showBinder()">notebook</button></span>
          <span class="pick-sub">or, <button type="button" class="create-link" (click)="$event.stopPropagation(); createHere.emit()">Create</button> from scratch</span>
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
                <!-- The photo is draggable: drop it on an EMPTY slot to move it,
                     on "+ Add menu" to start a new menu with it, or out of the
                     slot area (macro bar / dead space) to clear the slot. A drop
                     on the same/occupied slot is a no-op. Routing is geometric in
                     onTileDragEnded — no drop list consumes this drag. -->
                <div
                  class="meal-tile"
                  cdkDrag
                  [cdkDragData]="{ fromSlot: true, slotOrder: slot().slotOrder, mealId: m.mealId }"
                  (cdkDragStarted)="rotation.dragging.set('meal')"
                  (cdkDragEnded)="onTileDragEnded(m.mealId, $event)">
                  @if (tileImage(m); as src) {
                    <img class="tile-img" [src]="src" alt="" />
                  } @else {
                    <div class="tile-noimg"><span>{{ clean(m.mealName) }}{{ isMealModified(m) ? ' (modified)' : '' }}</span></div>
                  }
                  <div class="tile-scrim"></div>
                  <!-- "(modified)" — same white title text — marks a meal that
                       isn't a Binder meal yet (blocks the menu save until saved). -->
                  <span class="tile-name">{{ clean(m.mealName) }}{{ isMealModified(m) ? ' (modified)' : '' }}</span>
                  <button
                    type="button"
                    class="tile-btn tile-flip"
                    matTooltip="Flip to ingredients"
                    (click)="flipTo(m.mealId, $event)">
                    <mat-icon>flip_camera_android</mat-icon>
                  </button>
                  <!-- Drag cursor shows the meal photo (name over a scrim). -->
                  <div class="drag-tile-preview" *cdkDragPreview>
                    @if (tileImage(m); as src) {
                      <img [src]="src" alt="" class="dtp-img" />
                      <div class="dtp-scrim"></div>
                    }
                    <span class="dtp-name">{{ clean(m.mealName) }}</span>
                  </div>
                </div>
              }
              @if (meals().length === 3) {
                <div class="meal-tile tile-empty"><span>drop a 4th</span></div>
              }
            </div>

            <!-- BACK: the one flipped meal, full detail. -->
            <div
              class="flip-back"
              cdkDropList
              [cdkDropListEnterPredicate]="foodDropPredicate"
              (cdkDropListDropped)="onDropMeal($event)">
              @if (flippedMeal(); as fm) {
                <!-- Same ">" control, same bottom-right corner as the FRONT tiles. -->
                <button
                  type="button"
                  class="tile-btn tile-flip"
                  matTooltip="Flip to photo"
                  (click)="flipHome()">
                  <mat-icon>flip_camera_android</mat-icon>
                </button>
                <div class="back-head">
                  <span class="name-label">Meal</span>
                  <input
                    #nameBox
                    type="text"
                    class="meal-name-box regi-field"
                    [value]="clean(fm.mealName)"
                    (input)="onNameInput(fm.mealId, nameBox.value)"
                    (keydown.enter)="nameBox.blur()"
                    (keydown.escape)="nameBox.value = clean(fm.mealName); onNameInput(fm.mealId, nameBox.value); nameBox.blur()"
                    (blur)="commitName(fm, nameBox.value)"
                    aria-label="Meal name" />
                  <!-- Save disc lights on unsaved FOOD changes OR a pending name
                       edit, so naming a meal shows there's something to save.
                       Clicking persists the meal (name + food) to the Binder. -->
                  <button
                    type="button"
                    class="icon-disc save-disc"
                    [class.icon-disc-confirm]="rotation.hasUnsavedFoodChanges(fm.mealId) || nameDirty(fm)"
                    [disabled]="!(rotation.hasUnsavedFoodChanges(fm.mealId) || nameDirty(fm))"
                    matTooltip="Save changes to your notebook"
                    (click)="pinMeal.emit(fm.mealId)">
                    <mat-icon>check</mat-icon>
                  </button>
                  <button
                    type="button"
                    class="back-clear-btn"
                    [matTooltip]="'Clear meal from Slot ' + slot().slotOrder"
                    (click)="removeMeal.emit({ slotOrder: slot().slotOrder, mealId: fm.mealId })">
                    <mat-icon>clear_all</mat-icon>
                  </button>
                </div>

                <div class="macro-row">
                  <span class="slot-cals">{{ round(mac(fm.macros).calories) }} cals</span>
                  <span class="chip protein">P {{ round(mac(fm.macros).proteinG) }}</span>
                  <span class="chip fiber">F {{ round(mac(fm.macros).fiberG) }}</span>
                  <span class="chip fat">F {{ round(mac(fm.macros).fatG) }}</span>
                  <span class="chip carb">C {{ round(mac(fm.macros).carbG) }}</span>
                  <button
                    type="button"
                    class="add-food-btn add-affordance"
                    matTooltip="Add food to this meal"
                    (click)="toggleAdd.emit(fm.mealId)">
                    <span>Add food</span>
                    <mat-icon>add</mat-icon>
                  </button>
                </div>

                <!-- Recipe link (when the meal has a source PDF), right-justified.
                     "My Foods" label removed — not needed. -->
                @if (recipeLinkFor(fm.mealId); as link) {
                  <div class="foods-head">
                    <button
                      type="button"
                      class="recipe-link"
                      matTooltip="Open the source recipe PDF"
                      (click)="openRecipe(link)">Click here for recipe (PDF)</button>
                  </div>
                }

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
  protected readonly rotation = inject(RotationService);
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
  /** "Create from scratch" link on an empty slot — build a new meal here (opens
   *  the food picker over the Binder). */
  readonly createHere = output<void>();
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
  /** The slot photo was dragged and released — the parent (which owns the menu
   *  id + rotation ops) geometrically routes it: move to an empty slot, start a
   *  new menu, clear the slot, or no-op. `point` is the release position. */
  readonly slotDragEnded = output<{ slotOrder: number; mealId: number; point: { x: number; y: number } }>();

  /** Stacked meals, ordered by position. */
  readonly meals = computed<MenuSlotMeal[]>(() =>
    [...(this.slot().meals ?? [])].sort((a, b) => a.position - b.position),
  );
  readonly isEmpty = computed(() => !this.slot().isDiningOut && this.meals().length === 0);
  readonly isFull = computed(() => this.meals().length >= 4);

  /** True when this specific tiled meal is KNOWN-modified (loaded + pinned !==
   *  true) — not a Binder meal yet, so it blocks the menu save under the
   *  all-Binder rule. Unknown (not-yet-loaded) meals are NOT flagged, to avoid a
   *  flash during prefetch; the menu save gate (menuAllSlotsClean) still treats
   *  unknown as not-savable. Drives the "(modified)" tag on the tile name. */
  isMealModified(m: MenuSlotMeal): boolean {
    const meal = this.rotation.getMeal(m.mealId);
    return meal != null && meal.pinned !== true;
  }
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

  /** The slot photo drag ended — clear the drag affordance and bubble the release
   *  point up so the parent can route the outcome (move / new menu / clear). Use
   *  the native event's VIEWPORT (client) coordinates so they line up with the
   *  parent's document.elementFromPoint hit-test (dropPoint can be page-space and
   *  drift under scroll). */
  onTileDragEnded(mealId: number, event: CdkDragEnd): void {
    this.rotation.dragging.set(null);
    const native = event.event as MouseEvent & Partial<TouchEvent>;
    const touch = native.changedTouches?.[0];
    const x = touch?.clientX ?? (native as MouseEvent).clientX ?? event.dropPoint.x;
    const y = touch?.clientY ?? (native as MouseEvent).clientY ?? event.dropPoint.y;
    this.slotDragEnded.emit({ slotOrder: this.slot().slotOrder, mealId, point: { x, y } });
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
    // coverImageFor prefers the full image and, for an edit-fork with no image of
    // its own, falls back to the fork source's image (so edits don't drop the
    // photo). Thumbnail is the last resort before the neutral tile.
    return this.rotation.coverImageFor(m.mealId) || m.mealImageThumbnail?.trim() || '';
  }

  /** Source recipe URL for a stacked meal, from the cached full Meal. */
  recipeLinkFor(mealId: number): string {
    // Delegates to the service, which falls back to the fork source's link (a
    // forked/placed imported meal drops its own RecipeLink server-side).
    return this.rotation.recipeLinkFor(mealId);
  }

  openRecipe(url: string): void {
    if (url) this.tabs.openWebView(url);
  }

  isDirty(mealId: number): boolean {
    return this.rotation.isMealDirty(mealId);
  }

  /** Live name-edit tracking so the green save-check lights while the typed name
   *  differs from the saved one — independent of the pin/dirty state. */
  readonly editingName = signal<{ id: number; val: string } | null>(null);

  onNameInput(mealId: number, val: string): void {
    this.editingName.set({ id: mealId, val });
  }

  nameDirty(fm: MenuSlotMeal): boolean {
    const e = this.editingName();
    if (!e || e.id !== fm.mealId) return false;
    const v = e.val.trim();
    return v !== '' && v !== this.clean(fm.mealName);
  }

  /** Strip the server's trailing " (copy)" (from copy-on-write forks) for display. */
  clean(name: string | null | undefined): string {
    return (name ?? '').replace(/(\s*\(copy\))+\s*$/i, '').trim();
  }

  commitName(fm: MenuSlotMeal, value: string): void {
    this.editingName.set(null);
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

  /** A food dragged from the lookaside carries { food, serving }. */
  private isFoodDrag(d: unknown): d is { food: Food; serving: number } {
    return !!d && typeof d === 'object' && 'food' in d;
  }

  /** Empty-slot placeholder accepts a binder meal drag; while this slot is being
   *  edited it also accepts a food dragged from the lookaside. */
  readonly mealDropPredicate = (drag: CdkDrag): boolean =>
    this.isFoodDrag(drag.data) ? this.editing() : this.isMealDrag(drag.data);

  /** Front grid accepts a meal append (room + not dining-out) OR, while editing,
   *  a food dragged from the lookaside. */
  readonly appendPredicate = (drag: CdkDrag): boolean =>
    this.isFoodDrag(drag.data)
      ? this.editing()
      : !this.isFull() && !this.slot().isDiningOut && this.isMealDrag(drag.data);

  /** Back-face (ingredient list) accepts a food drop while editing. */
  readonly foodDropPredicate = (drag: CdkDrag): boolean =>
    this.isFoodDrag(drag.data) && this.editing();

  onDropMeal(event: CdkDragDrop<unknown>): void {
    // A food dragged from the lookaside → add it to the editing meal.
    if (this.isFoodDrag(event.item.data)) {
      const { food, serving } = event.item.data;
      this.dropFood.emit({ food, serving: serving ?? 1 });
      return;
    }
    const meal = event.item.data as { id?: number } | undefined;
    if (meal?.id == null) return;
    this.placeMeal.emit({ slotOrder: this.slot().slotOrder, mealId: meal.id });
  }
}
