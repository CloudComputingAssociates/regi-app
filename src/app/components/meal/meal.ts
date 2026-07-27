// src/app/components/meal/meal.ts
//
// One meal slot on the menus-meals grid. Header reads "Meal {slotOrder}
// ({slotLabel})" with a visual-only inline-edit affordance. Body shows
// macro chips (P/C/F/Fi grams — never calories) and the food rows. Handles
// three states: filled, empty (pick a meal), and dining-out.
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MealItem, MenuSlot } from '../../models';
import { Food } from '../../models/food.model';
import { FoodComponent } from '../food/food';
import { TabService } from '../../services/tab.service';

interface SlotMacros {
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
}

@Component({
  selector: 'app-meal',
  imports: [MatTooltipModule, MatIconModule, FoodComponent, DragDropModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="slot-card" [class.empty]="isEmpty()" [class.editing]="editing()" [class.has-cover]="hasCover()">

      <!-- The card interior (header + macros + food rows). Rendered directly when
           there's no cover image, or as the flip's BACK face when there is — one
           source of truth via ngTemplateOutlet, so the back content is UNCHANGED. -->
      <ng-template #cardBody>
      <div class="slot-header">
        <!-- The meal NAME box is the primary title (filled slots) or "Meal N"
             for an empty slot. A bare green check sits just RIGHT of the box —
             enabled only once there's an unsaved edit; delete pins to the corner. -->
        <div class="header-name">
          @if (slot().mealId == null) {
            <span class="slot-title">Meal {{ slot().slotOrder }}</span>
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
              <!-- Save = bare check (no disc). Always clickable so any meal can be
                   persisted, but only bright GREEN when there's an actual edit —
                   muted grey otherwise, so it never reads "actionable" with no
                   changes. Click saves (fork → update origin; fresh → to Binder). -->
              <button
                type="button"
                class="save-check"
                [class.active]="dirty()"
                matTooltip="Save changes"
                matTooltipPosition="above"
                (click)="onPin()">
                <mat-icon>check</mat-icon>
              </button>
            </div>
          }
        </div>
        <!-- Delete pinned to the upper-right corner. -->
        @if (slot().mealId != null) {
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
          [class.bloom]="dropHighlight()"
          cdkDropList
          [cdkDropListEnterPredicate]="mealDropPredicate"
          (cdkDropListDropped)="onDrop($event)">
          <div class="pick-line">
            <button
              type="button"
              class="create-btn"
              matTooltip="Create meal from scratch"
              matTooltipPosition="above"
              (click)="toggleAdd.emit()">
              + Create Meal
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
            <!-- Source recipe link — its own line ABOVE the macro discs. Permanent
                 underline (not hover-only) so it reads as a standing link to the
                 imported recipe PDF that seeded this meal. Only when a link exists. -->
            @if (hasRecipeLink()) {
              <button
                type="button"
                class="recipe-link"
                matTooltip="Open the source recipe PDF"
                matTooltipPosition="above"
                (click)="openRecipe()">Recipe Link (.PDF)</button>
            }
            <!-- Macro line (ONE row): Protein, Carbs, Fat, Fiber (order P C Fat
                 Fiber), cals trailing, and the dropdown chevron on the far RIGHT. -->
            <div class="macro-summary">
              <span class="chip protein">P {{ round(macros().proteinG) }}</span>
              @if (macrosOpen()) {
                <span class="chip carb">C {{ round(macros().carbG) }}</span>
                <span class="chip fat">F {{ round(macros().fatG) }}</span>
              }
              <span class="chip fiber">F {{ round(macros().fiberG) }}</span>
              @if (macrosOpen()) {
                <span class="meal-cals">{{ calories() }} cals</span>
              }
              <button
                type="button"
                class="card-toggle"
                [matTooltip]="macrosOpen() ? 'Hide extra macros' : 'Show Calories, Carbs & Fats'"
                matTooltipPosition="above"
                (click)="toggleMacros()">
                <mat-icon>{{ macrosOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
              </button>
              <!-- + add-food disc: set off by itself on the far RIGHT (margin-left:
                   auto), sitting under the header trash — its own thing, apart from
                   the disc + chevron cluster on the left. -->
              <button
                type="button"
                class="icon-disc add-affordance"
                [class.icon-disc-pressed]="editing()"
                [matTooltip]="editing() ? 'Adding foods (close from the food list)' : 'Add food to meal'"
                matTooltipPosition="above"
                (click)="toggleAdd.emit()">
                <mat-icon>add</mat-icon>
              </button>
            </div>
          }
          <div class="food-rows">
            @for (item of mainItems(); track item.id) {
              <app-food
                [item]="item"
                [resolving]="resolvingItemId() === item.id"
                (editItem)="editItem.emit($event)"
                (removeItem)="removeItem.emit($event)" />
            }
          </div>
          <!-- Dynamic recipe ingredients — collapsed accordion below the main
               rows (foods auto-added for the recipe, not in MyFoods). -->
          @if (dynamicItems().length > 0) {
            <div class="dyn-accordion">
              <button
                type="button"
                class="dyn-head"
                [matTooltip]="dynamicOpen() ? 'Hide recipe ingredients' : 'Show recipe ingredients not in MyFoods'"
                matTooltipPosition="above"
                (click)="toggleDynamic()">
                <mat-icon class="dyn-chevron">{{ dynamicOpen() ? 'expand_more' : 'chevron_right' }}</mat-icon>
                <span class="dyn-label">Dynamic Ingredients added</span>
                <span class="dyn-count">{{ dynamicItems().length }}</span>
              </button>
              @if (dynamicOpen()) {
                <div class="food-rows dyn-rows">
                  @for (item of dynamicItems(); track item.id) {
                    <app-food
                      [item]="item"
                      [resolving]="resolvingItemId() === item.id"
                      (editItem)="editItem.emit($event)"
                      (removeItem)="removeItem.emit($event)" />
                  }
                </div>
              }
            </div>
          }
          @if (editing() && items().length === 0) {
            <div class="edit-drop-hint">Click or drag a food to add</div>
          }
        </div>
      }
      </ng-template>

      @if (hasCover()) {
        <!-- Flip card: cover photo (front) ⇄ card content (back). rotateY is safe
             here — the card tree has no position:fixed and no in-card CDK overlays
             (tooltips + drag previews portal out to <body>). -->
        <div class="flip" [class.show-back]="showBack()">
          <div class="flip-face flip-front">
            <img class="cover-img" [src]="coverUrl()" alt="" (error)="onImageError()" />
            <div class="cover-scrim"></div>
            <span class="cover-title">{{ title() }}</span>
            <button
              type="button"
              class="flip-btn"
              aria-label="Show nutrition"
              matTooltip="Show nutrition"
              matTooltipPosition="left"
              (mousedown)="swallow($event)"
              (click)="flip($event)">
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>
          <div class="flip-face flip-back">
            <ng-container [ngTemplateOutlet]="cardBody" />
            <button
              type="button"
              class="flip-btn"
              aria-label="Show photo"
              matTooltip="Show photo"
              matTooltipPosition="left"
              (mousedown)="swallow($event)"
              (click)="flip($event)">
              <mat-icon>chevron_left</mat-icon>
            </button>
          </div>
        </div>
      } @else {
        <ng-container [ngTemplateOutlet]="cardBody" />
      }

    </div>
  `,
  styleUrls: ['./meal.scss'],
})
export class MealComponent {
  private readonly tabs = inject(TabService);

  readonly slot = input.required<MenuSlot>();
  readonly items = input.required<MealItem[]>();

  /** Source recipe URL (the imported recipe PDF in GCP that seeded this meal), or
   *  empty/undefined when the meal has no recipe. Threaded down from the cached
   *  Meal — MenuSlot doesn't carry it. Drives the "Recipe Link (.PDF)" line. */
  readonly recipeLink = input<string | null | undefined>(null);

  /** Meal cover image URLs, threaded from the cached Meal (MenuSlot carries no
   *  image). Thumbnail is preferred; the full image is the fallback. When neither
   *  is set the card renders exactly as before — no cover, no flip. */
  readonly mealImage = input<string | null | undefined>(null);
  readonly mealThumbnail = input<string | null | undefined>(null);

  /** Flip state — front (photo) is the default face when a cover exists; the back
   *  is the card content. Component-local, not persisted; resets on re-render. */
  readonly showBack = signal(false);

  /** Set when the cover image fails to load — the card then behaves as imageless. */
  private readonly imageError = signal(false);

  /** Cover URL: full image preferred (the cover fills a large card, so the small
   *  thumbnail would upscale and blur), thumbnail as fallback, '' when neither. */
  readonly coverUrl = computed<string>(
    () => this.mealImage()?.trim() || this.mealThumbnail()?.trim() || '',
  );

  /** Show the cover + flip only when a usable image is present and hasn't errored. */
  readonly hasCover = computed<boolean>(() => !this.imageError() && this.coverUrl() !== '');

  /** Flip button — toggle the face. Swallows the event so it never starts a drag,
   *  selects the card, or opens it. */
  flip(ev: Event): void {
    ev.stopPropagation();
    ev.preventDefault();
    this.showBack.update((v) => !v);
  }

  /** mousedown guard on the flip button — a press must not begin a drag/select. */
  swallow(ev: Event): void {
    ev.stopPropagation();
    ev.preventDefault();
  }

  /** Cover image failed to load — treat the card as having no image (Step 3). */
  onImageError(): void {
    this.imageError.set(true);
  }

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

  /** Emitted when a binder meal is dropped on this (empty) slot. The parent
   *  supplies the menuId and calls the assign endpoint. */
  readonly placeMeal = output<{ slotOrder: number; mealId: number }>();

  /** Emitted (with this slot's slotOrder) when the trash is clicked. */
  readonly deleteMeal = output<number>();

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

  /** Green-check click → save. Only reachable while dirty (the check is disabled
   *  otherwise). The parent routes it: a fork updates its Binder origin; a fresh
   *  meal saves to the Binder. Never creates a duplicate. */
  onPin(): void {
    this.pinMeal.emit();
  }

  /** ✎ on a food row — edit that item's serving (parent opens the popup). */
  readonly editItem = output<MealItem>();

  /** ✕ on a food row — remove that item from the meal. */
  readonly removeItem = output<MealItem>();

  /** A lookaside food dropped on this (editing) meal card. */
  readonly dropFood = output<{ food: Food; serving: number }>();

  readonly isEmpty = computed(() => !this.slot().isDiningOut && this.slot().mealId == null);

  /** A meal item is a "dynamic ingredient" when its resolved food was auto-created
   *  during recipe import (not a curated MyFoods / REGI-approved food). */
  private isDynamicItem(item: MealItem): boolean {
    return item.food?.dynamicIngredient === true;
  }

  /** Real foods (MyFoods + REGI-approved) — listed first, as the meal's main rows.
   *  Pending/unresolved items (food null) are NOT dynamic ingredients, so they
   *  stay here too. */
  readonly mainItems = computed<MealItem[]>(() =>
    this.items().filter((i) => !this.isDynamicItem(i)),
  );

  /** Dynamic recipe ingredients — pushed below the main rows into a collapsed
   *  "Dynamic Ingredients added" accordion. */
  readonly dynamicItems = computed<MealItem[]>(() =>
    this.items().filter((i) => this.isDynamicItem(i)),
  );

  /** Dynamic-ingredients accordion open state — starts COLLAPSED. */
  readonly dynamicOpen = signal(false);

  toggleDynamic(): void {
    this.dynamicOpen.update((v) => !v);
  }

  /** True when there's a source recipe URL to link to. */
  readonly hasRecipeLink = computed<boolean>(() => (this.recipeLink() ?? '').trim().length > 0);

  /** Open the source recipe (imported PDF) in the bloom web-view OVERLAY — a
   *  bordered, scrollable window with the traffic-light maximize/restore/close
   *  discs. The overlay renders PDFs and skips its idle auto-close for them. */
  openRecipe(): void {
    const url = (this.recipeLink() ?? '').trim();
    if (url) this.tabs.openWebView(url);
  }

  /** Macro reveal open state — meals START CLOSED (just the Protein + Fiber
   *  summary discs); the chevron reveals Carbs/Fat/Cals below. */
  readonly macrosOpen = signal(false);

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
    // Strip the generator's trailing " meal" and the server's " (copy)" suffix
    // (the latter is added by the duplicate endpoint that backs copy-on-write
    // fork-on-edit — it's an implementation detail, not part of the name).
    const mealName = (this.slot().mealName ?? '')
      .replace(/\s+meal$/i, '')
      .replace(/(\s*\(copy\))+\s*$/i, '')
      .trim();
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
