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
import { RotationService, TEACH_SAVE_LINE } from '../../services/rotation.service';
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
import { nutritionLabelScale, snapServing } from '../../models/food-display';

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
              <!-- Clear · macros (an AM-radio push key: depressed = shown). -->
              <div class="toolbar-buttons">
                <button
                  type="button"
                  class="wipe-menus-btn"
                  matTooltip="Clear all, start over"
                  (click)="onWipeMenus()">
                  <mat-icon class="wipe-icon" aria-hidden="true">delete_sweep</mat-icon>
                </button>
                <button
                  type="button"
                  class="macros-toggle-btn"
                  [class.depressed]="tabService.macrosVisible()"
                  [matTooltip]="tabService.macrosVisible() ? 'Hide macros' : 'Show macros'"
                  matTooltipPosition="above"
                  (click)="tabService.toggleMacros()">
                  macros
                </button>
              </div>
              <!-- Exit — far right of the toolbar. -->
              <button
                type="button"
                class="close-panel-btn"
                matTooltip="Close Menus &amp; Meals panel"
                matTooltipPosition="above"
                (click)="tabService.closePanel()">
                <mat-icon class="close-icon" aria-hidden="true">logout</mat-icon>
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
              (saveToOriginal)="onSaveToOriginal($event)"
              (renameMenu)="rotation.updateMenuName($event.menuId, $event.name)"
              (dropMenu)="rotation.addMenuToRotation($event)"
              (addMenu)="rotation.addMenu()"
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
          </div>

          @if (rotation.editingSlot() === null) {
            <!-- Splitter doubles as the Binder toggle: DRAG to resize, or press the
                 arrow to slide the notebook off to the right (→) / bring it back
                 (←). A long vertical line with the arrow on the page's edge. -->
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
          } @else {
            <app-food-lookaside />
          }
        </div>
      }

      <!-- Per-item serving editor. Nutrition label + serving adjuster ONLY —
           no category dropdown or other curation controls. Save persists just
           the item's quantity (never Picks/MyFoods). Follows the CLAUDE.md
           dialog-disc convention: red close always, green save only when dirty;
           X reverts without persisting. -->
      @if (popupItem()) {
        <div class="nf-popup-overlay" (click)="onPopupClose()">
          <div class="nf-popup" (click)="$event.stopPropagation()">
            <div class="dialog-discs">
              @if (canSave()) {
                <button
                  type="button"
                  class="dialog-disc dialog-disc-confirm"
                  (click)="onPopupSave()"
                  matTooltip="Save serving"
                  matTooltipPosition="below"
                  aria-label="Save serving">
                  <mat-icon>check</mat-icon>
                </button>
              }
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
              </div>
              <regi-nutrition-label
                [nutritionFacts]="popupFood()!.nutritionFacts ?? null"
                [scale]="popupScale()"
                [displayUnit]="popupFood()!.servingUnit || popupItem()!.unit || 'g'"
                [displayQuantity]="draft()"
                [editable]="true"
                [showSave]="false"
                (adjust)="onPopupAdjust($event)"
                (commit)="onPopupCommit($event)"
                (save)="onPopupSave()" />
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
  private dialog = inject(MatDialog);
  private preferencesService = inject(FoodPreferencesService);
  private foodsService = inject(FoodsService);
  private userFoodService = inject(UserFoodService);
  private notification = inject(NotificationService);
  protected tabService = inject(TabService);
  private host = inject(ElementRef<HTMLElement>);

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
  /** Draft quantity (local only until Save). Opens at the item's quantity. */
  readonly draft = signal<number>(1);
  /** The quantity the popup opened at — drives the dirty/Save gate. */
  private readonly original = signal<number>(1);

  /** Save disc appears only when the draft differs from the opened value. */
  readonly canSave = computed<boolean>(() => this.draft() !== this.original());

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
    this.original.set(initial);
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

  /** ▲ / ▼ stepper — ladder-snap the draft (shared SERVING_SIZE_LADDER). */
  onPopupAdjust(direction: 'up' | 'down'): void {
    const next = snapServing(this.draft(), direction);
    if (next === undefined) return;
    this.draft.set(Number(next.toFixed(4)));
  }

  /** Typed input commit — accept off-ladder values (draft only). */
  onPopupCommit(value: number): void {
    this.draft.set(Number(value.toFixed(4)));
  }

  /** Green Save — persist ONLY the item's quantity via PUT, then close. Never
   *  touches Picks/MyFoods and never prompts the baseline dialog. */
  onPopupSave(): void {
    const mealId = this.popupMealId();
    const item = this.popupItem();
    if (mealId == null || item?.id == null || !this.canSave()) return;
    void this.rotation.updateMealItemQuantity(mealId, item.id, this.draft());
    this.closePopup();
  }

  /** Red X / backdrop — close and discard the draft (nothing persisted). */
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
    if (this.rotation.menuHasUnsavedWork(menuId) || this.rotation.menuCompositionChanged(menuId)) {
      this.dialog.open(WipeConfirmDialogComponent, {
        panelClass: 'wipe-dialog-panel',
        data: {
          message: 'Save these menu changes back into your notebook, permanently?',
          confirmLabel: 'Save to notebook',
          onConfirm: () => void this.rotation.saveMenuMealChanges(menuId),
        },
      });
      return;
    }
    void this.rotation.pinMenu(menuId);
  }

  /** Save-to-original pressed on a placed copy. Confirm, then overwrite the
   *  notebook original's slots with this copy's current meals (name + pinned
   *  status on both menus are left untouched). */
  onSaveToOriginal(copyId: number): void {
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        message:
          "Overwrite the original menu's slots with this menu's current meals? Name and pinned status are not changed.",
        confirmLabel: 'Save to original',
        onConfirm: () => void this.rotation.saveMenuToOriginal(copyId),
      },
    });
  }

  onDeleteMenu(menuId: number): void {
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        message: 'Clear this menu from your plan?',
        teachLine: this.rotation.menuHasUnsavedWork(menuId) ? TEACH_SAVE_LINE : undefined,
        confirmLabel: 'Clear',
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
        teachLine: 'All menus will be wiped. Meal slots all cleared.\nMeals saved to notebook will be retained.',
        confirmLabel: 'Proceed',
        onConfirm: () => void this.rotation.wipeMenus(),
      },
    });
  }
}
