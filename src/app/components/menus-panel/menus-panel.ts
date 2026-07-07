// src/app/components/menus-panel/menus-panel.ts
//
// Tab root for the Menus surface. Hosts the menu-card row (menu picker) above
// the menus-meals grid (the selected menu's meal slots). All state comes from
// RotationService — Phase 0 is mock-backed.
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { RotationService } from '../../services/rotation.service';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { FoodsService } from '../../services/foods.service';
import { NotificationService } from '../../services/notification.service';
import { MenuCardRowComponent } from '../menu-card-row/menu-card-row';
import { MenusMealsComponent } from '../menus-meals/menus-meals';
import { MealBinderComponent } from '../meal-binder/meal-binder';
import { FoodLookasideComponent } from '../food-lookaside/food-lookaside';
import { NutritionFactsLabelComponent } from '../nutrition-facts-label/nutrition-facts-label';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';
import { MealItem } from '../../models';
import { Food } from '../../models/food.model';
import { nutritionLabelScale, snapServing } from '../../models/food-display';

@Component({
  selector: 'app-menus-panel',
  imports: [
    MenuCardRowComponent,
    MenusMealsComponent,
    MealBinderComponent,
    FoodLookasideComponent,
    NutritionFactsLabelComponent,
    MatDialogModule,
    MatTooltipModule,
    MatIconModule,
    DragDropModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      @if (rotation.loading()) {
        <div class="state-center">
          <div class="spinner" aria-label="Loading"></div>
        </div>
      } @else if (rotation.error()) {
        <div class="state-center">
          <p class="state-msg error">{{ rotation.error() }}</p>
          <button type="button" class="state-btn" (click)="rotation.loadCurrentRotation()">Retry</button>
        </div>
      } @else if (rotation.rotation() === null) {
        <div class="state-center">
          <p class="state-msg">No plan yet</p>
          <button type="button" class="state-btn" (click)="rotation.startEmptyPlan()">Start a plan</button>
        </div>
      } @else {
        <!-- Flex row: board (toolbar + menu-card-row + meals) on the left,
             Meals binder on the right. cdkDropListGroup connects the binder's
             draggable meal cards to the empty-slot drop targets in the board. -->
        <div class="menus-layout" cdkDropListGroup>
          <div class="menus-main">
            <!-- Thin raised toolbar, pinned above the menu-card row. Wipe sits
                 ~2/3 across; People (persisted) is right-justified against the
                 right edge, adjacent to the Meals binder. -->
            <div class="menus-toolbar">
              <div class="people-control">
                <span class="people-label">Serving:</span>
                <button
                  type="button"
                  class="people-step"
                  matTooltip="Fewer servings"
                  [disabled]="rotation.persons() <= 1"
                  (click)="rotation.setPersons(rotation.persons() - 1)">
                  −
                </button>
                <span class="people-count">{{ rotation.persons() }}</span>
                <button
                  type="button"
                  class="people-step"
                  matTooltip="More servings"
                  [disabled]="rotation.persons() >= 12"
                  (click)="rotation.setPersons(rotation.persons() + 1)">
                  +
                </button>
              </div>

              <button
                type="button"
                class="wipe-btn"
                matTooltip="Deletes all meals from the selected menu (the menu stays, its slots go empty)."
                (click)="openWipeConfirm()">
                Wipe menu <span class="wipe-icon" aria-hidden="true">🗑</span>
              </button>

              <span class="toolbar-spacer"></span>
            </div>

            <app-menu-card-row
              [menus]="rotation.menus()"
              [selectedMenuId]="rotation.selectedMenuId() ?? -1"
              [spanDays]="rotation.rotation()!.spanDays"
              (select)="onSelectMenu($event)"
              (deleteMenu)="rotation.removeOrClearMenu($event)"
              (addMenu)="rotation.addMenu()"
              (setDays)="rotation.setMenuDays($event.menuId, $event.plannedCount)" />

            <div class="panel-body">
              <app-menus-meals
                [menu]="rotation.selectedMenu()"
                [resolvingItemId]="resolvingItemId()"
                (editItem)="onEditItem($event)" />
            </div>
          </div>

          @if (rotation.editingSlot() === null) {
            <app-meal-binder />
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
    </div>
  `,
  styleUrls: ['./menus-panel.scss'],
})
export class MenusPanelComponent implements OnInit {
  readonly rotation = inject(RotationService);
  private dialog = inject(MatDialog);
  private preferencesService = inject(FoodPreferencesService);
  private foodsService = inject(FoodsService);
  private notification = inject(NotificationService);

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
   *    (a) the allowed-foods set (covers all userfoods + favorited foods),
   *    (b) on miss, GET /api/foods/{id} for canonical 'food' items (e.g.
   *        generated-meal foods never favorited), cached for repeat opens.
   *  A 'userfood' miss can't be safely fetched by numeric id (that id keys the
   *  UserFoods table, not Foods) so it returns null → toast. */
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

    if (source !== 'food' || itemFood.foodId == null) return null;

    this.resolvingItemId.set(item.id ?? null);
    try {
      const food = await firstValueFrom(this.foodsService.getFoodById(itemFood.foodId));
      if (!food?.id) return null;
      this.fetchedFoods.update((m) => new Map(m).set(key, food));
      return food;
    } catch {
      return null;
    } finally {
      this.resolvingItemId.set(null);
    }
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

  /** Open the dark confirm dialog. No real wipe yet — the dialog's buttons
   *  all close to a no-op this phase (endpoint not wired). */
  openWipeConfirm(): void {
    this.dialog.open(WipeConfirmDialogComponent, { panelClass: 'wipe-dialog-panel' });
  }
}
