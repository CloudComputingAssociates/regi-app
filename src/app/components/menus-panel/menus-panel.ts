// src/app/components/menus-panel/menus-panel.ts
//
// Tab root for the Menus surface. Hosts the menu-card row (menu picker) above
// the menus-meals grid (the selected menu's meal slots). All state comes from
// RotationService — Phase 0 is mock-backed.
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { RotationService } from '../../services/rotation.service';
import { SettingsService } from '../../services/settings.service';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { FoodsService } from '../../services/foods.service';
import { UserFoodService } from '../../services/user-food.service';
import { NotificationService } from '../../services/notification.service';
import { TabService } from '../../services/tab.service';
import { MenuCardRowComponent } from '../menu-card-row/menu-card-row';
import { MenusMealsComponent } from '../menus-meals/menus-meals';
import { MealBinderComponent } from '../meal-binder/meal-binder';
import { AiCreateMealComponent } from '../ai-create-meal/ai-create-meal';
import { MacrosComponent } from '../macros/macros';
import { FoodLookasideComponent } from '../food-lookaside/food-lookaside';
import { NutritionFactsLabelComponent } from '../nutrition-facts-label/nutrition-facts-label';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';
import { MealItem } from '../../models';
import { Food } from '../../models/food.model';
import { UserFood } from '../../models/user-food.model';
import {
  nutritionLabelScale,
  snapServingForUnit,
  massGramsForUnit,
  nfUnitOptions,
  parseGramsPerUnit,
} from '../../models/food-display';
import { LangfusePromptService } from '../../services/langfuse-prompt.service';

@Component({
  selector: 'app-menus-panel',
  imports: [
    MenuCardRowComponent,
    MenusMealsComponent,
    MealBinderComponent,
    AiCreateMealComponent,
    MacrosComponent,
    FoodLookasideComponent,
    NutritionFactsLabelComponent,
    MatDialogModule,
    MatTooltipModule,
    MatIconModule,
    DragDropModule,
  ],
  // Click anywhere outside a meal card / the food rail / the serving popup
  // deselects the current add target (so there's an obvious way out, and you
  // can pick another meal).
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:mousemove)': 'onSplitterMove($event)',
    '(document:mouseup)': 'onSplitterUp()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      @if (rotation.loading()) {
        <div class="state-center">
          <div class="spinner" aria-label="Loading"></div>
        </div>
      } @else if (rotation.error() && rotation.rotation() === null) {
        <div class="state-center">
          <p class="state-msg error">{{ rotation.error() }}</p>
          <button type="button" class="state-btn" (click)="rotation.loadCurrentRotation()">Retry</button>
        </div>
      } @else if (rotation.rotation() === null) {
        <!-- No plan → auto-start one (see the effect below); show the spinner
             while it stands up the default empty board. -->
        <div class="state-center">
          <div class="spinner" aria-label="Starting your plan"></div>
        </div>
      } @else {
        <!-- Flex row: board (toolbar + menu-card-row + meals) on the left,
             Meals binder on the right. cdkDropListGroup connects the binder's
             draggable meal cards to the empty-slot drop targets in the board. -->
        <div class="menus-layout" [class.splitter-dragging]="splitterDragging" cdkDropListGroup>
          <div class="menus-main">
            <!-- Thin raised toolbar, pinned at the very top of the board column.
                 Wipe sits ~2/3 across; People (persisted) is right-justified
                 against the right edge, adjacent to the Meals binder. -->
            <div class="menus-toolbar">
              <!-- Surface title — same blue/weight as the Binder header. -->
              <span class="toolbar-title">
                <mat-icon class="toolbar-title-icon">restaurant</mat-icon>Menus &amp; Meals
              </span>
              <!-- Selected menu's calorie total — its auto margins center it in the
                   free space and flush the whole button cluster to the right. -->
              <span class="toolbar-cals">{{ round(rotation.selectedMenuTotals().calories) }} cals</span>
              <!-- Right-justified action cluster: Shopping · Notebook · Clear all.
                   A padding gap (on the close X) separates Clear all from the X. -->
              <div class="toolbar-buttons">
                <!-- Notebook — toggles the Binder. -->
                <button
                  type="button"
                  class="notebook-btn"
                  [class.active]="!rotation.binderCollapsed()"
                  [matTooltip]="rotation.binderCollapsed() ? 'Open Notebook' : 'Close Notebook'"
                  matTooltipPosition="above"
                  [attr.aria-label]="rotation.binderCollapsed() ? 'Open Notebook' : 'Close Notebook'"
                  [attr.aria-pressed]="!rotation.binderCollapsed()"
                  (click)="rotation.toggleBinderCollapsed()">
                  <!-- Spiral notebook — user-supplied transparent PNG (black strokes),
                       inverted to light in CSS so it reads on the dark button. -->
                  <img class="notebook-icon" src="/images/spiral-notebook-icon.png" alt="" aria-hidden="true" />
                </button>
                <!-- Shopping List — toggles the Notebook on the Shopping tab (second
                     click closes it, like the Notebook key). Grocery-bag glyph reads
                     instantly as "to buy". -->
                <button
                  type="button"
                  class="shop-list-btn"
                  [class.active]="!rotation.binderCollapsed() && rotation.activeBinderTab() === 'shopping'"
                  matTooltip="Shopping list. Opens 'shop' tab in your Notebook"
                  matTooltipPosition="above"
                  (click)="rotation.toggleBinderTab('shopping')">
                  <mat-icon class="shop-list-icon" aria-hidden="true">shopping_bag</mat-icon>
                </button>
                <!-- Clear all — wipe everything, start over. -->
                <button
                  type="button"
                  class="wipe-menus-btn"
                  matTooltip="Clear rotation of all menus & meals"
                  (click)="onWipeMenus()">
                  <mat-icon class="wipe-icon" aria-hidden="true">clear_all</mat-icon>
                </button>
              </div>
              <!-- Exit — far right of the toolbar. Red X disc (matches the Notebook). -->
              <button
                type="button"
                class="dialog-disc dialog-disc-cancel menus-close-disc"
                matTooltip="Close Menus &amp; Meals panel"
                matTooltipPosition="above"
                aria-label="Close Menus & Meals panel"
                (click)="tabService.closePanel()">
                <mat-icon aria-hidden="true">close</mat-icon>
              </button>
              <!-- Planned-days tally moved DOWN into the menu-strip area (see
                   app-menu-card-row), bottom-aligned with the "menus" watermark. -->
            </div>

            <!-- Macros bar moved UP into the app-bar (banner). Toggled by the
                 "Hide/Show macros" key in the toolbar above. -->

            <app-menu-card-row
              [menus]="rotation.menus()"
              [selectedMenuId]="rotation.selectedMenuId() ?? -1"
              [spanDays]="rotation.rotation()!.spanDays"
              [menuTargetHot]="rotation.menuTargetHot()"
              (menuSelect)="onSelectMenu($event)"
              (deleteMenu)="onDeleteMenu($event)"
              (pinMenu)="onSaveMenu($event)"
              (renameMenu)="rotation.updateMenuName($event.menuId, $event.name)"
              (dropMenu)="rotation.addMenuToRotation($event)"
              (addMenu)="onAddMenu()"
              (duplicateMenu)="rotation.addMenuToRotation($event)" />


            <div class="panel-body">
              <app-menus-meals
                [menu]="rotation.selectedMenu()"
                [resolvingItemId]="resolvingItemId()"
                (editItem)="onEditItem($event)" />
            </div>

            <!-- AI Create Meal bloom — centered over the board (not the rail), so
                 it never pushes the meal list / meals grid off-screen. -->
            @if (createOpen()) {
              <app-ai-create-meal (close)="createOpen.set(false)" />
            }

            <!-- Editing a meal (the card's + / a food drop) floats My Foods as a
                 bloom OVER the panel — the Notebook stays visible in the rail.
                 The lookaside's own header carries the "My Foods" title + X (which
                 stops editing); the backdrop also closes it. -->
            @if (rotation.editingSlot() !== null) {
              <div class="myfoods-bloom-backdrop" (click)="rotation.stopEditing()">
                <div class="myfoods-bloom-window" (click)="$event.stopPropagation()">
                  <app-food-lookaside />
                </div>
              </div>
            }
          </div>

          <!-- Notebook stays put whether or not a meal is being edited. Adding
               food to a meal now floats My Foods as a bloom (see below) instead of
               swapping the notebook out of the rail. -->
          <div
            class="rail-splitter"
            [class.dragging]="splitterDragging"
            [class.binder-hidden]="rotation.binderCollapsed()"
            (mousedown)="onSplitterDown($event)">
            <button
              type="button"
              class="rail-toggle"
              [matTooltip]="rotation.binderCollapsed() ? 'Show Binder' : 'Hide Binder'"
              matTooltipPosition="left"
              (mousedown)="$event.stopPropagation()"
              (click)="rotation.toggleBinderCollapsed()">
              <mat-icon>{{ rotation.binderCollapsed() ? 'chevron_left' : 'chevron_right' }}</mat-icon>
            </button>
          </div>
          <app-meal-binder
            [class.binder-collapsed]="rotation.binderCollapsed()"
            [style.flex-basis]="railBasis()"
            (createMeal)="createOpen.set(true)" />
        </div>
      }

      <!-- Per-item serving editor. Nutrition label + inline serving/unit adjuster
           ONLY — no category dropdown or other curation controls. Every change
           (stepper, typed quantity, unit switch) AUTO-SAVES the item's quantity
           (and unit) via PUT — write-through, no green disc, no two-step. It's the
           meal-local serving layer only: it never touches Picks/MyFoods. The red
           disc just closes (there's nothing to discard — edits are already saved). -->
      @if (popupItem()) {
        <div class="nf-popup-overlay" (click)="onPopupClose()">
          <div class="nf-popup" (click)="$event.stopPropagation()">
            <div class="dialog-discs">
              <button
                type="button"
                class="dialog-disc dialog-disc-cancel"
                (click)="onPopupClose()"
                matTooltip="Close"
                matTooltipPosition="below"
                aria-label="Close">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="nf-popup-inner">
              <div class="nf-popup-header">
                <span class="nf-popup-title">
                  {{ popupFood()!.shortDescription || popupFood()!.description }}
                </span>
                @if (popupUnitResolving()) {
                  <span class="nf-popup-unit-busy">figuring grams…</span>
                }
              </div>
              <regi-nutrition-label
                [nutritionFacts]="popupFood()!.nutritionFacts ?? null"
                [scale]="popupScale()"
                [displayUnit]="popupUnit()"
                [displayQuantity]="draft()"
                [editable]="true"
                [showSave]="false"
                [unitOptions]="popupUnitOptions()"
                (adjust)="onPopupAdjust($event)"
                (commit)="onPopupCommit($event)"
                (unitChange)="onPopupUnitChange($event)" />
            </div>
          </div>
        </div>
      }

      <!-- Center-screen "drag" encourager — shown only while a Binder card is
           held down (before motion), cleared once the drag moves or releases. -->
      @if (rotation.showDragHint()) {
        <div class="drag-encourager">
          <mat-icon>arrow_back</mat-icon>
          <span class="drag-word">drag</span>
        </div>
      }
    </div>
  `,
  styleUrls: ['./menus-panel.scss'],
})
export class MenusPanelComponent implements OnInit {
  readonly rotation = inject(RotationService);
  private settingsService = inject(SettingsService);
  private dialog = inject(MatDialog);
  private preferencesService = inject(FoodPreferencesService);
  private foodsService = inject(FoodsService);
  private userFoodService = inject(UserFoodService);
  private notification = inject(NotificationService);
  private langfusePromptService = inject(LangfusePromptService);
  protected tabService = inject(TabService);
  private host = inject(ElementRef<HTMLElement>);

  /** Round a macro/calorie total for display in the toolbar cals pill. */
  round(n: number | null | undefined): number {
    return Math.round(n ?? 0);
  }

  // ---- Rail splitter ---------------------------------------------------
  // User-draggable width for the Menus & Meals rail. null = the default 25%.
  // The food picker is a fixed 25% overlay (it ignores this), so that side is
  // always uniform; the custom width is preserved for the Menus & Meals rail.
  private readonly railBasisPx = signal<number | null>(null);
  splitterDragging = false;

  /** AI Create Meal bloom visibility — opened by the Binder's Create button,
   *  closed on cancel / after generate or a recipe drop kicks off. */
  readonly createOpen = signal(false);

  readonly railBasis = computed<string>(() => {
    if (this.rotation.binderCollapsed()) return '0'; // slid off to the right
    const px = this.railBasisPx();
    return px != null ? `${px}px` : '30%';
  });

  constructor() {
    // Closing the Notebook (any trigger — the splitter arrow, the toolbar key)
    // FORGETS any dragged rail width, so the next open returns at the standard 30%
    // rather than the last dragged size. Reset-to-default on every close.
    effect(
      () => {
        if (this.rotation.binderCollapsed()) this.railBasisPx.set(null);
      },
      { allowSignalWrites: true },
    );

    // Entering the food picker snaps the Menus & Meals rail back to its default
    // 25%, so that side is uniform after an edit and returns at 25% when the
    // picker closes. Re-drag the splitter to resize again.
    effect(
      () => {
        if (this.rotation.editingSlot() !== null) this.railBasisPx.set(null);
      },
      { allowSignalWrites: true },
    );

    // No "Start a plan" button — when there's no rotation (fresh user, or right
    // after a Clear-all wipe) and we're not loading/errored, auto-stand-up the
    // default empty board. The flag prevents re-entry while it's creating.
    effect(
      () => {
        const noPlan = this.rotation.rotation() === null;
        if (this.rotation.loading() || this.rotation.error() || !noPlan) {
          this.autoStarting = false;
          return;
        }
        if (this.autoStarting) return;
        this.autoStarting = true;
        void this.rotation.startEmptyPlan();
      },
      { allowSignalWrites: true },
    );
  }

  /** Guards the auto-start effect so it fires once per "no plan" episode. */
  private autoStarting = false;

  onSplitterDown(e: MouseEvent): void {
    if (this.rotation.binderCollapsed()) return; // collapsed → only the arrow acts
    e.preventDefault();
    this.splitterDragging = true;
  }

  onSplitterMove(e: MouseEvent): void {
    if (!this.splitterDragging) return;
    const layout = this.host.nativeElement.querySelector('.menus-layout') as HTMLElement | null;
    if (!layout) return;
    const rect = layout.getBoundingClientRect();
    // Rail width = distance from the cursor to the layout's right edge; clamp so
    // neither side collapses.
    const width = rect.right - e.clientX;
    this.railBasisPx.set(Math.max(300, Math.min(width, rect.width - 320)));
  }

  onSplitterUp(): void {
    this.splitterDragging = false;
  }

  // ---- Per-item serving popup state ------------------------------------
  // Full allowed-foods list (same source foods-panel / the lookaside use) —
  // used ONLY to resolve a meal item to its full Food for the label's per-100g
  // values. This flow never writes to FoodPreferencesService.
  private readonly allowedFull = signal<Food[]>([]);

  // Foods fetched by id (GET /api/foods/{id}) to resolve items not in the
  // allowed set, cached so repeat pencil-opens don't refetch. Read-only cache.
  private readonly fetchedFoods = signal<Map<string, Food>>(new Map());

  /** The item id whose food is being fetched (drives the pencil busy state). */
  readonly resolvingItemId = signal<number | null>(null);

  /** Resolves once the allowed-foods load settles — awaited before resolution
   *  so a fast pencil-click on a fresh session doesn't miss a userfood that's
   *  still loading (userfoods live only in the allowed set, not GET /foods). */
  private allowedLoad: Promise<void> = Promise.resolve();

  /** The item whose serving is being edited (null = popup closed). */
  readonly popupItem = signal<MealItem | null>(null);
  /** The meal that item belongs to (target of the PUT). */
  private readonly popupMealId = signal<number | null>(null);
  /** The item's food, resolved to a full Food (per-100g nutritionFacts). */
  readonly popupFood = signal<Food | null>(null);
  /** Draft quantity. Every stepper/commit/unit change AUTO-SAVES the item. */
  readonly draft = signal<number>(1);
  /** True while the AI resolves grams-per-unit for a food-specific unit switch. */
  readonly popupUnitResolving = signal(false);

  /** The item's current serving unit (food's own, then the item's, then grams). */
  readonly popupUnit = computed<string>(
    () => this.popupFood()?.servingUnit || this.popupItem()?.unit || 'g',
  );
  /** Unit dropdown options — the standard set plus the current unit if novel. */
  readonly popupUnitOptions = computed<string[]>(() => nfUnitOptions(this.popupUnit()));

  /** Label scale: per-100g × (draft × gramsPerUnit)/100 — same math as the
   *  foods-panel popup, keyed on the ITEM's draft quantity. */
  readonly popupScale = computed<number>(() => nutritionLabelScale(this.popupFood(), this.draft()));

  ngOnInit(): void {
    // Reload-on-mount: the server is the source of truth for the rotation.
    this.rotation.loadCurrentRotation();
    // Prime the allowed-foods list so the serving popup can resolve an item's
    // food to its per-100g values (also correct-ifies the common case without
    // waiting on a by-id fetch). Read-only — resolution never persists here.
    this.allowedLoad = firstValueFrom(this.preferencesService.getAllowedFoodsFull())
      .then((foods) => this.allowedFull.set(foods ?? []))
      .catch(() => this.allowedFull.set([]));
  }

  /** Deselect the add target when clicking outside a meal card, the food rail,
   *  or the serving popup. Clicks inside a meal card are left to that card's own
   *  controls (its + toggles/switches, food rows edit), so this never fights the
   *  select/switch actions. */
  onDocumentClick(ev: MouseEvent): void {
    if (this.rotation.editingSlot() === null) return;
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest('app-meal') ||
      target.closest('app-food-lookaside') ||
      target.closest('.nf-popup-overlay')
    ) {
      return;
    }
    this.rotation.stopEditing();
  }

  /** Switching menus exits any in-progress slot edit before selecting, so the
   *  rail returns to the binder rather than editing a slot on another menu. */
  onSelectMenu(menuId: number): void {
    this.rotation.stopEditing();
    this.rotation.selectMenu(menuId);
    // Selecting an empty menu → auto-open the Notebook so meals are right there
    // to drag in. (A menu that already has meals leaves the binder as-is.)
    if (!this.rotation.menuHasMeals(menuId)) {
      this.rotation.showBinder();
    }
  }

  /** + Add menu — the new menu is always empty, so open the Notebook to drag
   *  meals in straight away. */
  onAddMenu(): void {
    this.rotation.showBinder();
    void this.rotation.addMenu();
  }

  /** ✎ on a food row — resolve the item's food and open the serving popup at
   *  the item's CURRENT quantity. Resolution: (a) the allowed-foods set, then
   *  (b) a by-id fetch for canonical foods not in that set. Only a genuine
   *  fetch failure toasts (the pencil is already hidden for pending items). */
  async onEditItem(e: { mealId: number; item: MealItem }): Promise<void> {
    const food = await this.resolveItemFood(e.item);
    if (!food) {
      this.notification.show("Can't edit this food's serving here.", 'error');
      return;
    }
    const initial = Number((e.item.quantity ?? food.servingSize ?? 1).toFixed(4));
    this.popupMealId.set(e.mealId);
    this.popupItem.set(e.item);
    this.popupFood.set(food);
    this.draft.set(initial);
  }

  /** Resolve a meal item to a full Food (per-100g values). Key is
   *  (foodId, foodSource) with a missing foodSource normalized to 'food' — the
   *  same key the add path / in-meal dot use.
   *    (a) the allowed-foods set (covers curated userfoods + favorited foods),
   *    (b) on miss, fetch by id — 'userfood' via GET /api/userfoods/{id} (its id
   *        keys the UserFoods table), 'food' via GET /api/foods/{id}. Both cached
   *        for repeat opens.
   *  Allowed-foods is a curation preference, not an identity lookup, so a
   *  userfood outside it (e.g. a dynamic recipe ingredient) still resolves via
   *  its own endpoint. Null only when the item has no food (pending/unresolved)
   *  or the fetch fails / returns no id. */
  private async resolveItemFood(item: MealItem): Promise<Food | null> {
    // The food identity lives on the item's nested `food` record (null for
    // pending items — those have the pencil hidden already).
    const itemFood = item.food;
    if (!itemFood) return null;
    const source = itemFood.foodSource ?? 'food';
    const key = `${itemFood.foodId}:${source}`;
    // Ensure the allowed set has settled so a fresh-session click resolves
    // userfoods (and favorited foods) without falling through to a by-id fetch.
    await this.allowedLoad;
    const hit = this.allowedFull().find((f) => `${f.id}:${f.foodSource ?? 'food'}` === key);
    if (hit) return hit;

    const cached = this.fetchedFoods().get(key);
    if (cached) return cached;

    if (itemFood.foodId == null) return null;

    this.resolvingItemId.set(item.id ?? null);
    try {
      // foodId is ALREADY the positive table id for its source (AllFoods:
      // uf.UserFoodID AS FoodID) — pass it through unmodified (the negative-ID
      // convention is blended /foods search results only). Userfoods key the
      // UserFoods table, so fetch them via /userfoods/{id}; canonical foods via
      // /foods/{id}.
      const food =
        source === 'userfood'
          ? await this.resolveUserFood(itemFood.foodId)
          : await firstValueFrom(this.foodsService.getFoodById(itemFood.foodId));
      if (!food?.id) return null;
      this.fetchedFoods.update((m) => new Map(m).set(key, food));
      return food;
    } catch {
      return null;
    } finally {
      this.resolvingItemId.set(null);
    }
  }

  /** Fetch a userfood by id and shape it into the Food the serving popup wants. */
  private async resolveUserFood(foodId: number): Promise<Food | null> {
    const uf = await this.userFoodService.getUserFoodById(foodId);
    return uf ? this.userFoodToFood(uf) : null;
  }

  /** Map a UserFood (GET /api/userfoods/{id}) into the Food shape the serving
   *  popup consumes. Nutrition mirrors the AllFoods userfood projection (same
   *  UserNutritionFacts source), so the label scales identically to an in-set
   *  userfood. An untracked dynamic ingredient carries NO nutrition — leave
   *  nutritionFacts undefined so the label renders empty rather than NaN.
   *  servingSize stays null (userfoods have none in AllFoods either); the popup's
   *  initial quantity comes from the meal item's own quantity. */
  private userFoodToFood(uf: UserFood): Food {
    const nf = uf.nutritionFacts;
    return {
      id: uf.id,
      foodSource: 'userfood',
      description: uf.description,
      shortDescription: uf.shortDescription,
      servingSize: null,
      servingUnit: uf.servingUnit,
      servingGramsPerUnit: uf.servingGramsPerUnit,
      nutritionFacts: nf
        ? {
            calories: nf.calories,
            proteinG: nf.proteinG,
            totalFatG: nf.totalFatG,
            saturatedFatG: nf.saturatedFatG,
            transFatG: nf.transFatG,
            cholesterolMG: nf.cholesterolMG,
            sodiumMG: nf.sodiumMG,
            totalCarbohydrateG: nf.totalCarbohydrateG,
            dietaryFiberG: nf.dietaryFiberG,
            totalSugarsG: nf.totalSugarsG,
            addedSugarsG: nf.addedSugarsG,
            vitaminDMcg: nf.vitaminDMcg,
            calciumMG: nf.calciumMG,
            ironMG: nf.ironMG,
            potassiumMG: nf.potassiumMG,
            servingSizeG: nf.servingSizeG,
            servingSizeHousehold: nf.servingSizeHousehold,
          }
        : undefined,
    } as Food;
  }

  /** ▲ / ▼ stepper — unit-aware ladder-snap the draft, then AUTO-SAVE the item. */
  onPopupAdjust(direction: 'up' | 'down'): void {
    const next = snapServingForUnit(this.draft(), direction, this.popupUnit());
    if (next === undefined) return;
    const val = Number(next.toFixed(4));
    this.draft.set(val);
    void this.persistItemQuantity(val);
  }

  /** Typed input commit — accept off-ladder values, then AUTO-SAVE the item. */
  onPopupCommit(value: number): void {
    const val = Number(value.toFixed(4));
    this.draft.set(val);
    void this.persistItemQuantity(val);
  }

  /** Inline unit switch. Converts the draft so total grams — and therefore the
   *  nutrition — stay EQUATED: newQty = (oldQty × oldGramsPerUnit) / newGramsPerUnit.
   *  Weight units use the deterministic table; a food-specific unit (cup/tbsp/each)
   *  uses the food's own grams-per-unit, else the AI. AUTO-SAVES quantity + unit. */
  async onPopupUnitChange(newUnit: string): Promise<void> {
    const food = this.popupFood();
    const curUnit = this.popupUnit();
    if (!food || !newUnit || newUnit === curUnit) return;

    // Current grams-per-unit: the food's own, else the weight table, else the AI.
    let curGpu = food.servingGramsPerUnit && food.servingGramsPerUnit > 0
      ? food.servingGramsPerUnit
      : (massGramsForUnit(curUnit) ?? 0);
    if (curGpu <= 0) {
      this.popupUnitResolving.set(true);
      curGpu = (await this.resolveGramsPerUnitAI(food, curUnit)) ?? 0;
      this.popupUnitResolving.set(false);
    }
    const curGrams = curGpu > 0 ? this.draft() * curGpu : 0;

    // New grams-per-unit: weight table (instant), else the AI (food-specific).
    let newGpu = massGramsForUnit(newUnit);
    if (newGpu == null) {
      this.popupUnitResolving.set(true);
      newGpu = await this.resolveGramsPerUnitAI(food, newUnit);
      this.popupUnitResolving.set(false);
    }
    if (newGpu == null || newGpu <= 0) {
      this.notification.show(`Couldn't work out grams per ${newUnit} — pick another unit.`, 'error');
      return;
    }

    const newQty = curGrams > 0 ? Number((curGrams / newGpu).toFixed(4)) : this.draft();
    this.popupFood.update((f) => (f ? { ...f, servingUnit: newUnit, servingGramsPerUnit: newGpu as number } : f));
    this.draft.set(newQty);
    void this.persistItemQuantity(newQty, newUnit);
  }

  /** Write-through: persist the item's quantity (and unit when it changed) via
   *  PUT. Meal-local only — never touches Picks/MyFoods. Failure toasts inside
   *  the rotation service; the board is refreshed there. */
  private async persistItemQuantity(quantity: number, unit?: string): Promise<void> {
    const mealId = this.popupMealId();
    const item = this.popupItem();
    if (mealId == null || item?.id == null) return;
    await this.rotation.updateMealItemQuantity(mealId, item.id, quantity, unit);
  }

  /** Ask the AI (Langfuse `grams-per-unit`) for grams in one `unit` of this food.
   *  Null on any failure so the caller can warn and leave the unit unchanged. */
  private async resolveGramsPerUnitAI(food: Food, unit: string): Promise<number | null> {
    const name = (food.shortDescription?.trim() || food.description || '').trim();
    if (!name) return null;
    try {
      const res = await this.langfusePromptService.run('grams-per-unit', { food: name, unit });
      const parsed = parseGramsPerUnit(res.text);
      const g = Number(parsed?.gramsPerUnit);
      return Number.isFinite(g) && g > 0 ? g : null;
    } catch {
      return null;
    }
  }

  /** Red X / backdrop — just close (edits already auto-saved). */
  onPopupClose(): void {
    this.closePopup();
  }

  private closePopup(): void {
    this.popupItem.set(null);
    this.popupFood.set(null);
    this.popupMealId.set(null);
  }

  /** Trash on a menu tile — CLEAR the menu from this week's plan (unlinks it and
   *  its meal slots off the board). A saved (pinned) menu and its meals survive in
   *  the Binder; only a disposable (unpinned) menu is fully removed.
   *  Teach line appended when a slot holds diverged/session-edited work. */
  /** Menu save-check pressed. If the menu holds unsaved MEAL edits (a food added,
   *  a portion changed), the changes live on the slot instances — confirm pushing
   *  them back to the notebook (each meal overwrites its Binder original). A plain
   *  unsaved menu (name only) pins directly, as before. */
  onSaveMenu(menuId: number): void {
    // No confirmation — the green check saves the (re)named menu to the notebook.
    // Meal adds/removes already autosave (write-through), so there's nothing to ask
    // about; saveMenuMealChanges also pins any not-yet-saved slotted meals first.
    void this.rotation.saveMenuMealChanges(menuId);
  }

  onDeleteMenu(menuId: number): void {
    // Simple clear — Wipe Menus is what nukes the default Day 1…N menus from the
    // notebook, so the per-menu trash just clears this menu (and its meals) off the
    // current week's rotation. Saved (renamed) menus stay in the notebook; meals are
    // never deleted (they live in the notebook independently).
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        title: 'Clear Menu Slot?',
        message: "Wipe the day's menu, meals are not deleted.",
        confirmLabel: 'Yes',
        onConfirm: () => void this.rotation.deleteMenu(menuId),
      },
    });
  }

  /** "Wipe Menus" — whole-rotation teardown. Confirms with a strong warning;
   *  pinned menus + Binder meals survive. Teach line when the rotation holds
   *  diverged/session-edited work (best-effort over loaded menus). */
  onWipeMenus(): void {
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        title: 'Wipe Menus',
        message: "You will lose your work for this week's menus. OK to proceed?",
        teachLine:
          '1. All menus wiped. Meal slots cleared.\n' +
          '2. Renamed menus & saved meals are retained.\n' +
          '3. Default "Day 1…N" menus are removed from your notebook.\n' +
          '4. Shopping List staples are set to Need = false.',
        confirmLabel: 'Proceed',
        onConfirm: () => {
          void this.rotation.wipeMenus();
          void this.settingsService.resetShoppingStapleNeeds();
        },
      },
    });
  }
}
