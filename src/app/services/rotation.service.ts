// src/app/services/rotation.service.ts
//
// Live read path for the Menus surface. Owns the current Rotation, its Menus
// (lazily fetched + cached by id) and the Meals attached to slots (also lazily
// cached). The Auth0 interceptor in app.config.ts authenticates every call to
// environment.apiUrl, so no tokens are attached here.
//
// The component-facing surface is unchanged from Phase 0:
//   menus, selectedMenuId, selectMenu, selectedMenu, selectedMenuTotals,
//   slotItems, getMeal — plus loading/error and the loaders below.
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AddMealItemRequest,
  CreateMealRequest,
  GenerateMealRequest,
  ItemRole,
  Meal,
  MealItem,
  Menu,
  Rotation,
  RotationDetail,
  UpdateMealItemRequest,
  UpdateMealRequest,
} from '../models';
import { Food } from '../models/food.model';
import { SettingsService } from './settings.service';
import { NotificationService } from './notification.service';

/** Aggregate macro totals for a menu (grams + calories). */
export interface MenuTotals {
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
  calories: number;
}

@Injectable({ providedIn: 'root' })
export class RotationService {
  private http = inject(HttpClient);
  private settingsService = inject(SettingsService);
  private notification = inject(NotificationService);
  private baseUrl = environment.apiUrl;

  // ---- State -----------------------------------------------------------
  readonly rotation = signal<RotationDetail | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly selectedMenuId = signal<number | null>(null);

  /** The user's saved meals, for the right-hand Meals binder. */
  readonly binderMeals = signal<Meal[]>([]);

  /** Standing People count from settings (persons), default 1. Persisted. */
  readonly persons = computed(() => this.settingsService.allSettings()?.regiMenu?.persons ?? 1);

  /** Freshly AI-generated, not-yet-placed meals (the "NewMeal N" candidates
   *  at the top of the binder). Persisted server-side with isSaved=false. */
  readonly candidateMeals = signal<Meal[]>([]);
  /** True while a single meal generation is in flight. */
  readonly generating = signal<boolean>(false);

  /** The slot being edited in-place from the food lookaside rail. menuId +
   *  slotOrder locate the slot; mealId is null for an empty slot until the
   *  first add creates + places a meal (then it's adopted here). Set when the
   *  lookaside editing mode opens; addFoodToEditingMeal reads/updates it and
   *  stopEditing clears it (returning the rail to the binder). */
  readonly editingSlot = signal<{ menuId: number; slotOrder: number; mealId: number | null } | null>(null);

  /** Full menus (slots + macros), cached by menuId. Immutable map updates. */
  private menusById = signal<Map<number, Menu>>(new Map());
  /** Full meals (items), cached by mealId. Immutable map updates. */
  private mealsById = signal<Map<number, Meal>>(new Map());

  // ---- Derived (component-facing surface, shapes unchanged) ------------
  readonly menus = computed(() => this.rotation()?.menus ?? []);

  readonly selectedMenu = computed<Menu | undefined>(() => {
    const id = this.selectedMenuId();
    if (id == null) return undefined;
    return this.menusById().get(id);
  });

  // Top macro bars fill the moment the menu loads: summed from slot macros,
  // not from meal items (which stream in a beat later).
  readonly selectedMenuTotals = computed<MenuTotals>(() => {
    const menu = this.selectedMenu();
    const totals: MenuTotals = { proteinG: 0, fatG: 0, carbG: 0, fiberG: 0, calories: 0 };
    if (!menu) return totals;
    for (const slot of menu.slots) {
      const m = slot.macros;
      if (!m) continue;
      totals.proteinG += m.proteinG ?? 0;
      totals.fatG += m.fatG ?? 0;
      totals.carbG += m.carbG ?? 0;
      totals.fiberG += m.fiberG ?? 0;
      totals.calories += m.calories ?? 0;
    }
    return totals;
  });

  getMeal(mealId: number): Meal | null {
    return this.mealsById().get(mealId) ?? null;
  }

  slotItems(mealId: number | null | undefined): MealItem[] {
    if (mealId == null) return [];
    return this.mealsById().get(mealId)?.items ?? [];
  }

  // ---- Loaders ---------------------------------------------------------

  /** Load the user's current rotation: pick the active one (else newest),
   *  fetch its detail, and select the first menu. Empty list → empty state. */
  async loadCurrentRotation(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await firstValueFrom(
        this.http.get<Rotation[]>(`${this.baseUrl}/rotation`),
      );
      if (!list || list.length === 0) {
        this.rotation.set(null);
        return;
      }
      // List is newest-first; prefer the active rotation, else the first.
      const chosen = list.find((r) => r.status === 'active') ?? list[0];
      const detail = await firstValueFrom(
        this.http.get<RotationDetail>(`${this.baseUrl}/rotation/${chosen.id}`),
      );
      this.rotation.set(detail);
      const firstMenuId = detail.menus[0]?.menuId ?? null;
      this.selectedMenuId.set(firstMenuId);
      if (firstMenuId != null) await this.selectMenu(firstMenuId);
    } catch (err) {
      this.error.set(this.errMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Select a menu: fetch + cache its full detail if needed (this is what
   *  makes the top macro bars fill), then stream in the meals for its filled
   *  slots without blocking the menu render. */
  async selectMenu(menuId: number): Promise<void> {
    this.selectedMenuId.set(menuId);

    if (!this.menusById().has(menuId)) {
      try {
        const menu = await firstValueFrom(
          this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
        );
        this.menusById.update((m) => new Map(m).set(menuId, menu));
      } catch (err) {
        this.error.set(this.errMessage(err));
        return;
      }
    }

    const menu = this.menusById().get(menuId);
    if (!menu) return;
    for (const slot of menu.slots) {
      if (slot.isDiningOut) continue;
      const mealId = slot.mealId;
      if (mealId == null || this.mealsById().has(mealId)) continue;
      // Fire-and-forget: food rows appear as each meal resolves.
      void this.loadMeal(mealId);
    }
  }

  /** Fetch one meal into the cache. A single failure leaves that slot's food
   *  rows empty rather than failing the whole menu. */
  private async loadMeal(mealId: number): Promise<void> {
    try {
      const meal = await firstValueFrom(
        this.http.get<Meal>(`${this.baseUrl}/meal/${mealId}`),
      );
      this.mealsById.update((m) => new Map(m).set(mealId, meal));
    } catch {
      // swallow — see doc comment
    }
  }

  // PHASE 2 BOOTSTRAP — replaced by the generate dialog in Phase 3.
  async generateDefault(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      // Standing people default for this user (persons; defaults to 1). Written
      // through to the rotation's peopleCount on the generate request.
      const persons = this.settingsService.allSettings()?.regiMenu?.persons ?? 1;
      const detail = await firstValueFrom(
        this.http.post<RotationDetail>(`${this.baseUrl}/rotation/generate`, {
          spanDays: 7,
          peopleCount: persons,
          distinctMeals: 0,
        }),
      );
      this.rotation.set(detail);
      const firstMenuId = detail.menus[0]?.menuId ?? null;
      this.selectedMenuId.set(firstMenuId);
      if (firstMenuId != null) await this.selectMenu(firstMenuId);
    } catch (err) {
      this.error.set(this.errMessage(err));
    } finally {
      this.loading.set(false);
    }
  }


  /** Build an empty board manually (no AI): create a staged rotation, a menu
   *  with N empty slots, link it, then load the detail and select the menu.
   *  Routes/fields confirmed against the API:
   *    POST /rotation  { spanDays, peopleCount }            -> Rotation
   *    POST /menu      { slotCount }                        -> Menu (N slots)
   *    POST /rotation/{id}/menus { menuId, plannedCount }   -> link
   *    GET  /rotation/{id}                                  -> RotationDetail */
  async startEmptyPlan(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const regiMenu = this.settingsService.allSettings()?.regiMenu;
      const persons = regiMenu?.persons ?? 1;
      const slotCount = regiMenu?.mealsPerDay ?? 4;

      const rot = await firstValueFrom(
        this.http.post<Rotation>(`${this.baseUrl}/rotation`, {
          spanDays: 7,
          peopleCount: persons,
        }),
      );
      const menu = await firstValueFrom(
        this.http.post<Menu>(`${this.baseUrl}/menu`, { slotCount }),
      );
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/rotation/${rot.id}/menus`, {
          menuId: menu.id,
          plannedCount: this.repeatBaseline(7),
        }),
      );

      const detail = await firstValueFrom(
        this.http.get<RotationDetail>(`${this.baseUrl}/rotation/${rot.id}`),
      );
      this.rotation.set(detail);
      if (menu.id != null) {
        this.selectedMenuId.set(menu.id);
        await this.selectMenu(menu.id);
      }
    } catch (err) {
      this.error.set(this.errMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Load the user's saved meals into the binder. GET /meal returns a bare
   *  Meal[] (full objects, so isSaved is present); show only saved ones. */
  async loadBinderMeals(): Promise<void> {
    try {
      const meals = await firstValueFrom(
        this.http.get<Meal[]>(`${this.baseUrl}/meal`),
      );
      this.binderMeals.set((meals ?? []).filter((m) => m.isSaved === true));
    } catch {
      this.binderMeals.set([]);
    }
  }

  /** Generate ONE meal on demand and drop it into the binder's candidate
   *  region. anchorProtein/macroTarget are omitted — the server falls back to
   *  the user's picks/preferences and fair-share daily goals.
   *    POST /meal/generate { mealType } -> Meal (persisted, isSaved=false)
   *  Failures toast rather than setting the panel-wide error signal, which
   *  would replace the whole board (menus-panel error-state precedence) on a
   *  transient generation failure — mirrors placeMealInSlot. */
  async generateMeal(): Promise<void> {
    this.generating.set(true);
    try {
      // Feed the meals we already have back to the generator so it produces
      // something different (candidate NewMeals + meals placed in this menu).
      const excludeMeals = this.knownMealNames();
      const body: GenerateMealRequest = { mealType: 'meal', excludeMeals };
      const meal = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal/generate`, body),
      );
      this.candidateMeals.update((list) => [...list, meal]);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    } finally {
      this.generating.set(false);
    }
  }

  /** Names of meals the session already knows — generated candidates plus
   *  meals placed in the selected menu — so the generator can avoid repeats. */
  private knownMealNames(): string[] {
    const names = new Set<string>();
    for (const m of this.candidateMeals()) {
      if (m.name) names.add(m.name);
    }
    const menu = this.selectedMenu();
    if (menu) {
      for (const slot of menu.slots) {
        if (slot.mealName) names.add(slot.mealName);
      }
    }
    return [...names];
  }

  /** Assign a meal to an empty slot (copy — the meal stays in the binder).
   *    PUT /menu/{menuId}/slot { slotOrder, mealId }
   *  Re-fetch the menu so the slot + its macros render and selectedMenuTotals
   *  (the top bars) recompute. A failure toasts but leaves the board intact. */
  async placeMealInSlot(menuId: number, slotOrder: number, mealId: number): Promise<void> {
    try {
      await firstValueFrom(
        this.http.put(`${this.baseUrl}/menu/${menuId}/slot`, { slotOrder, mealId }),
      );
      const menu = await firstValueFrom(
        this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
      );
      this.menusById.update((m) => new Map(m).set(menuId, menu));
      // Stream in the assigned meal's items so its food rows appear.
      void this.loadMeal(mealId);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Open the food lookaside on a slot: the rail switches from the binder to
   *  the food list and adds funnel into this slot's meal. mealId is null for an
   *  empty slot (the first add creates + places the meal). */
  beginEditingSlot(menuId: number, slotOrder: number, mealId: number | null): void {
    this.editingSlot.set({ menuId, slotOrder, mealId });
  }

  /** Close the lookaside — "Done" returns the rail to the binder. */
  stopEditing(): void {
    this.editingSlot.set(null);
  }

  /** The single add path both lookaside gestures (double-click + drag) funnel
   *  into. A row is added at its resolved default serving — there's no
   *  selection/preview/draft step; serving edits happen on the item after it's
   *  in the meal. Quantity = serving; unit = the food's serving unit. Three
   *  cases against the editing slot's meal:
   *    • empty slot (mealId null): POST /meal {name} → PUT /menu/{id}/slot to
   *      place it (same endpoint placeMealInSlot uses) → adopt the new mealId
   *      onto editingSlot. isSaved stays false, matching generated meals.
   *    • food already an item (same foodId + foodSource): NO-OP — we never
   *      auto-summate. The user changes the amount via the row pencil.
   *    • otherwise: POST a new item.
   *  itemRole = 'primary' when the food is a Protein AND the meal has no primary
   *  yet; else 'side'. On success: refresh the menu (slot macros/chips) + the
   *  meal's items (rows/dot). Failures toast and leave the board intact. */
  async addFoodToEditingMeal(food: Food, serving: number): Promise<void> {
    const slot = this.editingSlot();
    if (!slot) return;

    const foodName = (food.shortDescription?.trim() || food.description || '').trim();
    const unit = food.servingUnit ?? 'serving';

    try {
      let mealId = slot.mealId;

      // Empty slot → create the meal and place it, then add into it. isSaved is
      // left false (a generated/placed-but-unsaved meal), so we don't PATCH it.
      if (mealId == null) {
        const createBody: CreateMealRequest = { name: foodName };
        const meal = await firstValueFrom(
          this.http.post<Meal>(`${this.baseUrl}/meal`, createBody),
        );
        mealId = meal.id;
        await firstValueFrom(
          this.http.put(`${this.baseUrl}/menu/${slot.menuId}/slot`, {
            slotOrder: slot.slotOrder,
            mealId,
          }),
        );
        this.editingSlot.set({ ...slot, mealId });
      }

      const existingItems = this.mealsById().get(mealId)?.items ?? [];
      const alreadyInMeal = existingItems.some(
        (i) => i.food?.foodId === food.id && (i.food?.foodSource ?? 'food') === (food.foodSource ?? 'food'),
      );

      // Already in the meal → adding again is a no-op. We never auto-summate the
      // quantity; to change the amount the user edits that item with the row
      // pencil. (No duplicate row either.)
      if (alreadyInMeal) return;

      const hasPrimary = existingItems.some((i) => i.itemRole === 'primary');
      const itemRole: ItemRole =
        food.categoryName === 'Protein' && !hasPrimary ? 'primary' : 'side';
      const body: AddMealItemRequest = {
        foodId: food.id,
        foodSource: food.foodSource ?? 'food',
        foodName,
        itemRole,
        isTracked: true,
        quantity: serving,
        unit,
      };
      await firstValueFrom(
        this.http.post<MealItem>(`${this.baseUrl}/meal/${mealId}/items`, body),
      );

      // Refresh so the slot's macro chips + top totals recompute and the meal's
      // food rows / in-meal dot reflect the add (placeMealInSlot pattern).
      const menu = await firstValueFrom(
        this.http.get<Menu>(`${this.baseUrl}/menu/${slot.menuId}`),
      );
      this.menusById.update((m) => new Map(m).set(slot.menuId, menu));
      await this.loadMeal(mealId);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Remove one item from a meal (the ✕ on a food row in edit mode).
   *    DELETE /api/meal/{mealId}/items/{itemId}
   *  then refresh the selected menu (slot macros / top bars) and the meal's
   *  items (rows) the same way addFoodToEditingMeal does. A failure toasts and
   *  leaves the board intact rather than setting the panel-wide error signal. */
  async deleteMealItem(mealId: number, itemId: number): Promise<void> {
    const menuId = this.editingSlot()?.menuId ?? this.selectedMenuId();
    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/meal/${mealId}/items/${itemId}`),
      );
      if (menuId != null) {
        const menu = await firstValueFrom(
          this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
        );
        this.menusById.update((m) => new Map(m).set(menuId, menu));
      }
      await this.loadMeal(mealId);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Edit one item's quantity in place (the ✎ on a food row in edit mode).
   *    PUT /api/meal/{mealId}/items/{itemId} { quantity }
   *  then refresh the selected menu (slot macros / top bars) and the meal's
   *  items (row text) the same way addFoodToEditingMeal does. This is the
   *  meal-local serving layer only — it never touches Picks/MyFoods. A failure
   *  toasts and leaves the board intact. */
  async updateMealItemQuantity(mealId: number, itemId: number, quantity: number): Promise<void> {
    const menuId = this.editingSlot()?.menuId ?? this.selectedMenuId();
    try {
      const body: UpdateMealItemRequest = { quantity };
      await firstValueFrom(
        this.http.put<MealItem>(`${this.baseUrl}/meal/${mealId}/items/${itemId}`, body),
      );
      if (menuId != null) {
        const menu = await firstValueFrom(
          this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
        );
        this.menusById.update((m) => new Map(m).set(menuId, menu));
      }
      await this.loadMeal(mealId);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Rename a meal from the inline name box — and treat that override as the
   *  action that makes the meal "yours": PATCH { name, isSaved: true }. A
   *  generated / cobbled-together meal (default protein name, isSaved=false)
   *  becomes a Named + saved meal that shows in the binder. Refreshes the menu
   *  (slot's denormalized mealName) + the meal, then reloads the binder so the
   *  now-saved meal appears there. A failure toasts, board stays intact. */
  async updateMealName(mealId: number, name: string): Promise<void> {
    const menuId = this.editingSlot()?.menuId ?? this.selectedMenuId();
    try {
      const body: UpdateMealRequest = { name, isSaved: true };
      await firstValueFrom(this.http.put<Meal>(`${this.baseUrl}/meal/${mealId}`, body));
      if (menuId != null) {
        const menu = await firstValueFrom(
          this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
        );
        this.menusById.update((m) => new Map(m).set(menuId, menu));
      }
      await this.loadMeal(mealId);
      // The rename saved it — surface it in the binder's saved-meals list.
      void this.loadBinderMeals();
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Set the standing People count and persist it to settings (regiMenu.persons,
   *  1–12). generateDefault reads this as the rotation's peopleCount. */
  async setPersons(n: number): Promise<void> {
    const clamped = Math.max(1, Math.min(12, n));
    const current = this.settingsService.allSettings()?.regiMenu ?? {};
    try {
      await this.settingsService.saveRegiMenuSettings({ ...current, persons: clamped });
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Baseline planned days for a NEW menu = the user's "Menu Repeats" setting
   *  (regiMenu.repeatMeals; how many days/times a menu repeats), clamped to the
   *  rotation span and at least 1. The user can then raise/lower it per menu. */
  private repeatBaseline(spanDays: number): number {
    const repeats = this.settingsService.allSettings()?.regiMenu?.repeatMeals ?? 1;
    return Math.max(1, Math.min(spanDays, repeats));
  }

  /** Set how many days of the rotation span a menu covers (plannedCount).
   *  PUT /rotation/{id}/menus/{menuId}, then reload so tiles + the badge update. */
  async setMenuDays(menuId: number, plannedCount: number): Promise<void> {
    const rot = this.rotation();
    if (!rot?.id) return;
    const clamped = Math.max(1, Math.min(rot.spanDays, plannedCount));
    try {
      await firstValueFrom(
        this.http.put(`${this.baseUrl}/rotation/${rot.id}/menus/${menuId}`, {
          plannedCount: clamped,
        }),
      );
      const detail = await firstValueFrom(
        this.http.get<RotationDetail>(`${this.baseUrl}/rotation/${rot.id}`),
      );
      this.rotation.set(detail);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Discard a generated candidate from the binder (client-only). The meal is a
   *  throwaway (isSaved=false) expunged server-side; this does NOT affect any
   *  slot the meal was already placed into. */
  removeCandidate(mealId: number): void {
    this.candidateMeals.update((list) => list.filter((m) => m.id !== mealId));
  }

  /** Clear a slot's meal (trash on an in-slot meal). DELETE /menu/{id}/slot/{n},
   *  then re-fetch so the slot renders empty and totals recompute. */
  async clearSlot(menuId: number, slotOrder: number): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/menu/${menuId}/slot/${slotOrder}`),
      );
      const menu = await firstValueFrom(
        this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
      );
      this.menusById.update((m) => new Map(m).set(menuId, menu));
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Delete every meal from a menu's slots (the "Wipe menu" action), leaving
   *  the menu itself intact with empty slots. Loops filled slots → DELETE
   *  /menu/{id}/slot/{n}, then re-fetches so slots render empty and the totals
   *  (top bars) reset. */
  async clearMenuMeals(menuId: number): Promise<void> {
    try {
      const menu =
        this.menusById().get(menuId) ??
        (await firstValueFrom(this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`)));
      for (const slot of menu.slots) {
        if (slot.mealId != null) {
          await firstValueFrom(
            this.http.delete(`${this.baseUrl}/menu/${menuId}/slot/${slot.slotOrder}`),
          );
        }
      }
      const fresh = await firstValueFrom(
        this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
      );
      this.menusById.update((m) => new Map(m).set(menuId, fresh));
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Add a new empty menu to the rotation (the "+ Add menu" link).
   *  POST /menu -> POST /rotation/{id}/menus -> reload + select the new menu. */
  async addMenu(): Promise<void> {
    const rot = this.rotation();
    if (!rot?.id) return;
    try {
      const slotCount = this.settingsService.allSettings()?.regiMenu?.mealsPerDay ?? 4;
      const menu = await firstValueFrom(
        this.http.post<Menu>(`${this.baseUrl}/menu`, { slotCount }),
      );
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/rotation/${rot.id}/menus`, {
          menuId: menu.id,
          plannedCount: this.repeatBaseline(rot.spanDays),
        }),
      );
      const detail = await firstValueFrom(
        this.http.get<RotationDetail>(`${this.baseUrl}/rotation/${rot.id}`),
      );
      this.rotation.set(detail);
      if (menu.id != null) {
        this.selectedMenuId.set(menu.id);
        await this.selectMenu(menu.id);
      }
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Trash on a menu tile. With more than one menu, remove this menu entry from
   *  the rotation (DELETE /rotation/{id}/menus/{menuId}) and select another.
   *  On the last remaining menu, clear its slots instead so an empty Menu A
   *  always stays. */
  async removeOrClearMenu(menuId: number): Promise<void> {
    const rot = this.rotation();
    if (!rot?.id) return;
    try {
      if ((rot.menus?.length ?? 0) > 1) {
        await firstValueFrom(
          this.http.delete(`${this.baseUrl}/rotation/${rot.id}/menus/${menuId}`),
        );
        const detail = await firstValueFrom(
          this.http.get<RotationDetail>(`${this.baseUrl}/rotation/${rot.id}`),
        );
        this.rotation.set(detail);
        const firstId = detail.menus[0]?.menuId ?? null;
        this.selectedMenuId.set(firstId);
        if (firstId != null) await this.selectMenu(firstId);
      } else {
        // Last remaining menu — keep it, just empty its slots.
        await this.clearMenuMeals(menuId);
      }
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Surface a useful message from an HttpErrorResponse. */
  private errMessage(err: unknown): string {
    const e = err as { error?: { error?: string }; statusText?: string };
    return e?.error?.error ?? e?.statusText ?? 'Request failed';
  }
}
