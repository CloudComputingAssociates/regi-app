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
  AssignMealToSlotRequest,
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
  UpdateMenuRequest,
} from '../models';
import { Food } from '../models/food.model';
import { SettingsService } from './settings.service';
import { NotificationService } from './notification.service';

/** Step-9 teach line, appended to a destroy confirm when the meal has unsaved
 *  work (diverged clone or edited this session). */
export const TEACH_SAVE_LINE =
  'You changed this meal — save it to your Binder first to keep your version.';

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

  /** The user's Binder meals (pinned) — server truth via GET /meal?scope=binder. */
  readonly binderMeals = signal<Meal[]>([]);

  /** The user's Binder menus (pinned) — server truth via GET /menu?scope=binder.
   *  First-class citizens alongside Binder meals; carry cached total macros. */
  readonly binderMenus = signal<Menu[]>([]);

  /** The user's Folder meals: unpinned, unplaced disposable meals — server truth
   *  via GET /meal?scope=folder. Replaces the old localStorage-backed candidate
   *  list; the Folder is now server-authoritative, so there is no client persist
   *  layer. A meal self-removes from the Folder server-side once it's placed. */
  readonly folderMeals = signal<Meal[]>([]);

  /** Standing People count from settings (persons), default 1. Persisted. */
  readonly persons = computed(() => this.settingsService.allSettings()?.regiMenu?.persons ?? 1);

  /** True while a single meal generation is in flight. */
  readonly generating = signal<boolean>(false);

  /** What kind of Binder card is being dragged right now ('meal' | 'menu'), or
   *  null. Drives the "bloom" highlight on valid drop targets: dragging a meal
   *  lights the empty meal slots; dragging a menu lights the Add-menu target. */
  readonly dragging = signal<'meal' | 'menu' | null>(null);

  /** The single-selected Binder card (click to select). Yellow-blooms the card
   *  and lights its target (next empty meal slot for a meal, +Add menu for a
   *  menu). Null = nothing selected. */
  readonly selectedCard = signal<{ kind: 'meal' | 'menu'; id: number } | null>(null);

  /** Center-screen "drag" encourager visibility — shown while a card is held
   *  down (before motion), hidden once dragging moves or the button releases. */
  readonly showDragHint = signal<boolean>(false);

  /** Single-select toggle for a Binder card. */
  selectCard(kind: 'meal' | 'menu', id: number): void {
    const c = this.selectedCard();
    this.selectedCard.set(c && c.kind === kind && c.id === id ? null : { kind, id });
  }

  isCardSelected(kind: 'meal' | 'menu', id: number): boolean {
    const c = this.selectedCard();
    return !!c && c.kind === kind && c.id === id;
  }

  /** The next (first) empty, non-dining-out slot in the selected menu — the
   *  meal target that lights up. Null when the menu is full / unloaded. */
  readonly nextEmptySlotOrder = computed<number | null>(() => {
    const menu = this.selectedMenu();
    if (!menu) return null;
    const empty = menu.slots.find((s) => !s.isDiningOut && s.mealId == null);
    return empty?.slotOrder ?? null;
  });

  /** True when a MEAL is the active target source (selected or being dragged) —
   *  the next empty slot should light. */
  readonly mealTargetHot = computed<boolean>(
    () => this.selectedCard()?.kind === 'meal' || this.dragging() === 'meal',
  );

  /** True when a MENU is the active target source — the +Add menu tile lights. */
  readonly menuTargetHot = computed<boolean>(
    () => this.selectedCard()?.kind === 'menu' || this.dragging() === 'menu',
  );

  /** Meal ids the user has edited THIS SPA session (rename, item add/remove,
   *  quantity change). Drives the Step-9 teach line on destroy confirms. Simple
   *  in-memory Set — no persistence; cleared on reload. */
  private readonly sessionEditedMeals = new Set<number>();

  /** Record a successful edit to a meal (Step 9). */
  markSessionEdited(mealId: number): void {
    this.sessionEditedMeals.add(mealId);
  }

  /** A meal's Binder pin icon is ALIVE when it's pinned, OR it's a still-verbatim
   *  clone (cloned && not yet diverged — updatedAt === createdAt to the second).
   *  Grey otherwise ("you'd lose this"). */
  isPinAlive(meal: Pick<Meal, 'pinned' | 'cloned' | 'createdAt' | 'updatedAt'>): boolean {
    return meal.pinned === true || (meal.cloned === true && !this.isDiverged(meal));
  }

  /** A cloned meal has DIVERGED from its source once it's been edited: the server
   *  bumps updatedAt past createdAt. Compared to the second to tolerate
   *  serialization jitter (createdAt == updatedAt at fork time). */
  isDiverged(meal: Pick<Meal, 'cloned' | 'createdAt' | 'updatedAt'>): boolean {
    if (!meal.createdAt || !meal.updatedAt) return false;
    const created = Math.floor(new Date(meal.createdAt).getTime() / 1000);
    const updated = Math.floor(new Date(meal.updatedAt).getTime() / 1000);
    return updated > created;
  }

  /** Should the Step-9 teach line show for destroying this (unpinned) meal? True
   *  when it's a diverged clone OR was edited this session — i.e. the user has
   *  work in it they haven't pinned. */
  shouldTeachSave(meal: Meal): boolean {
    if (meal.pinned) return false;
    const diverged = meal.cloned === true && this.isDiverged(meal);
    return diverged || (meal.id != null && this.sessionEditedMeals.has(meal.id));
  }

  /** Any teach-worthy meal in a menu's slots (drives the tile-clear teach line). */
  menuHasUnsavedWork(menuId: number): boolean {
    const menu = this.menusById().get(menuId);
    if (!menu) return false;
    return menu.slots.some((s) => {
      const meal = s.mealId != null ? this.getMeal(s.mealId) : null;
      return meal ? this.shouldTeachSave(meal) : false;
    });
  }

  /** Any disposable (unpinned) menu in the rotation — its composition is lost on
   *  Wipe Menus. Reads entry.pinned across ALL menus (present on every rotation
   *  entry), so it's correct even for menus never opened this session. */
  rotationHasUnsavedWork(): boolean {
    return this.menus().some((m) => m.pinned !== true);
  }

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

  /** Page through GET /meal for a scope (server-side filter: folder = unpinned &
   *  unplaced; binder = pinned). The list endpoint is paginated (default 20,
   *  ORDER BY Name ASC), so we pull all pages: page size = MaxListLimit (100),
   *  stop on a short page, with a safety cap so a runaway library can't loop. */
  private async loadMealsByScope(scope: 'folder' | 'binder'): Promise<Meal[]> {
    const PAGE = 100;
    const MAX_PAGES = 20; // 2000 meals — a sane ceiling for the read loop
    const all: Meal[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch =
        (await firstValueFrom(
          this.http.get<Meal[]>(`${this.baseUrl}/meal`, {
            params: { scope, limit: String(PAGE), offset: String(page * PAGE) },
          }),
        )) ?? [];
      all.push(...batch);
      if (batch.length < PAGE) break;
    }
    return all;
  }

  /** Load the Folder (unpinned, unplaced disposable meals). Server truth. */
  async loadFolder(): Promise<void> {
    try {
      this.folderMeals.set(await this.loadMealsByScope('folder'));
    } catch {
      this.folderMeals.set([]);
    }
  }

  /** Load the Binder (pinned meals). Server truth. */
  async loadBinder(): Promise<void> {
    try {
      this.binderMeals.set(await this.loadMealsByScope('binder'));
    } catch {
      this.binderMeals.set([]);
    }
  }

  /** Load the Binder MENUS (pinned). GET /menu?scope=binder returns a bare
   *  Menu[] with cached total macros — the menu cards render from those. */
  async loadBinderMenus(): Promise<void> {
    try {
      const menus = await firstValueFrom(
        this.http.get<Menu[]>(`${this.baseUrl}/menu`, { params: { scope: 'binder' } }),
      );
      this.binderMenus.set(menus ?? []);
    } catch {
      this.binderMenus.set([]);
    }
  }

  /** Generate ONE meal on demand and drop it into the Folder. anchorProtein/
   *  macroTarget are omitted — the server falls back to the user's picks/
   *  preferences and fair-share daily goals.
   *    POST /meal/generate { mealType } -> Meal (persisted, pinned=false)
   *  A generated meal is unpinned + unplaced, so it belongs in the Folder; we
   *  append the returned meal immediately (server truth on next loadFolder).
   *  Failures toast rather than setting the panel-wide error signal, which
   *  would replace the whole board (menus-panel error-state precedence) on a
   *  transient generation failure — mirrors placeMealInSlot. */
  async generateMeal(): Promise<void> {
    this.generating.set(true);
    try {
      // Feed the meals we already have back to the generator so it produces
      // something different (Folder meals + meals placed in this menu).
      const excludeMeals = this.knownMealNames();
      const body: GenerateMealRequest = { mealType: 'meal', excludeMeals };
      const meal = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal/generate`, body),
      );
      this.folderMeals.update((list) => [...list, meal]);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    } finally {
      this.generating.set(false);
    }
  }

  /** Names of meals the session already knows — Folder meals plus meals placed
   *  in the selected menu — so the generator can avoid repeats. */
  private knownMealNames(): string[] {
    const names = new Set<string>();
    for (const m of this.folderMeals()) {
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

  /** Assign a meal to a slot. Send the SOURCE mealId; the server owns fork-vs-
   *  link (fork-on-place: a pinned source is cloned into a new meal row and the
   *  slot references the fork; an unpinned source is linked directly and leaves
   *  the Folder; placing into a pinned menu flips that menu unpinned). So after
   *  success we MUST re-fetch the menu — the slot may now hold a NEW forked meal
   *  id and the menu's pinned flag may have flipped — and refresh the Folder
   *  (a placed Folder meal self-removes server-side).
   *    PUT /menu/{menuId}/slot { slotOrder, mealId } */
  async placeMealInSlot(menuId: number, slotOrder: number, mealId: number): Promise<void> {
    try {
      const body: AssignMealToSlotRequest = { slotOrder, mealId };
      await firstValueFrom(this.http.put(`${this.baseUrl}/menu/${menuId}/slot`, body));
      await this.refreshMenu(menuId);
      await this.loadFolder();
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Re-fetch a menu's detail + all its slotted meals into the caches. Used
   *  after slot placement (the slot may hold a new forked meal id; the menu's
   *  pinned flag may have flipped) and after pinning a menu (server cascade
   *  pins the menu + every slotted meal). */
  private async refreshMenu(menuId: number): Promise<void> {
    const menu = await firstValueFrom(this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`));
    this.menusById.update((m) => new Map(m).set(menuId, menu));
    // Keep the rotation's tile entry.pinned in lockstep with the menu's flag —
    // the tile derives its pin/ghost from entry.pinned, and pinning a menu (or
    // placing into a pinned one) flips it server-side.
    this.syncEntryPinned(menuId, menu.pinned === true);
    for (const slot of menu.slots) {
      if (slot.mealId != null) await this.loadMeal(slot.mealId);
    }
  }

  /** Patch one rotation menu entry's `pinned` in the rotation signal so the tile
   *  reflects an in-session pin/unpin without reloading the whole rotation. */
  private syncEntryPinned(menuId: number, pinned: boolean): void {
    const rot = this.rotation();
    if (!rot?.menus) return;
    let changed = false;
    const menus = rot.menus.map((m) => {
      if (m.menuId === menuId && m.pinned !== pinned) {
        changed = true;
        return { ...m, pinned };
      }
      return m;
    });
    if (changed) this.rotation.set({ ...rot, menus });
  }

  /** Pin a meal to the Binder. PUT { pinned: true }. The server may postfix the
   *  name ("Salmon (1)") on a Binder-name collision — always adopt the RETURNED
   *  meal. A pinned meal leaves the Folder, so refresh both lists. */
  async pinMeal(mealId: number): Promise<void> {
    try {
      const body: UpdateMealRequest = { pinned: true };
      const updated = await firstValueFrom(
        this.http.put<Meal>(`${this.baseUrl}/meal/${mealId}`, body),
      );
      this.mealsById.update((m) => new Map(m).set(mealId, updated));
      await Promise.all([this.loadBinder(), this.loadFolder()]);
      this.notification.show('Saved to your Binder', 'success');
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Pin a MENU to the Binder. PUT /menu/{id} { pinned: true } runs the server
   *  cascade — the menu AND every slotted meal flip pinned in one call — so we
   *  re-fetch the menu + its meals (every card's icon flips alive together) and
   *  refresh the Binder. (API registers PUT, not PATCH, for /menu/{id}.) */
  async pinMenu(menuId: number): Promise<void> {
    try {
      const body: UpdateMenuRequest = { pinned: true };
      await firstValueFrom(this.http.put(`${this.baseUrl}/menu/${menuId}`, body));
      await this.refreshMenu(menuId);
      // Cascade pinned the menu + its slotted meals: refresh BOTH Binder groups.
      await Promise.all([this.loadBinder(), this.loadBinderMenus()]);
      // Ask the Binder rail to reveal the newly pinned menu (expand + scroll).
      this.revealBinderMenuId.set(menuId);
      this.notification.show('Saved to your Binder', 'success');
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Set by pinMenu to the menu that should be revealed in the Binder's Menus
   *  group (the rail effect expands the section/group and scrolls it into view).
   *  Bumped to a fresh value each pin so re-pinning the same menu re-triggers. */
  readonly revealBinderMenuId = signal<number | null>(null);

  /** Rename a menu from the board tile — a PURE label write (PUT /menu/{id}
   *  { name }); the pin state is untouched. Patches the rotation entry's
   *  menuName locally so the tile updates immediately, and refreshes the Binder
   *  menus (a pinned menu's Binder card shows the new name). */
  async updateMenuName(menuId: number, name: string): Promise<void> {
    try {
      const body: UpdateMenuRequest = { name };
      await firstValueFrom(this.http.put(`${this.baseUrl}/menu/${menuId}`, body));
      this.syncEntryName(menuId, name);
      await this.loadBinderMenus();
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Patch one rotation menu entry's denormalized `menuName` in the rotation
   *  signal so the board tile reflects a rename without a full reload. */
  private syncEntryName(menuId: number, name: string): void {
    const rot = this.rotation();
    if (!rot?.menus) return;
    const menus = rot.menus.map((m) => (m.menuId === menuId ? { ...m, menuName: name } : m));
    this.rotation.set({ ...rot, menus });
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
   *      onto editingSlot. pinned stays false — a disposable placed meal.
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

      // Empty slot → create the meal and place it, then add into it. pinned is
      // left false (a disposable placed meal) — the user pins it if they want it.
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
      this.markSessionEdited(mealId);
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
      this.markSessionEdited(mealId);
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

  /** Rename a meal from the inline name box. In v6 a rename is a PURE name write
   *  — naming no longer pins/saves (that's the Binder pin icon's job). Refreshes
   *  the menu (slot's denormalized mealName) + the meal, and reloads the Binder/
   *  Folder so a pinned/unpinned card carrying this meal shows the new name. A
   *  failure toasts, board stays intact. Tracked as a session edit (teach line). */
  async updateMealName(mealId: number, name: string): Promise<void> {
    const menuId = this.editingSlot()?.menuId ?? this.selectedMenuId();
    try {
      const body: UpdateMealRequest = { name };
      await firstValueFrom(this.http.put<Meal>(`${this.baseUrl}/meal/${mealId}`, body));
      this.markSessionEdited(mealId);
      if (menuId != null) {
        const menu = await firstValueFrom(
          this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
        );
        this.menusById.update((m) => new Map(m).set(menuId, menu));
      }
      await this.loadMeal(mealId);
      // Reflect the new name in the rail (a pinned meal appears in the Binder).
      await Promise.all([this.loadBinder(), this.loadFolder()]);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Set the standing People count and persist it to settings (regiMenu.persons,
   *  1–12). startEmptyPlan reads this as the rotation's peopleCount. */
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

  /** Discard a Folder meal.
   *    DELETE /api/meal/{id}  (409 if the meal is currently slotted in a menu)
   *  Refresh the Folder from server truth on success. */
  async deleteFolderMeal(mealId: number): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`${this.baseUrl}/meal/${mealId}`));
      await this.loadFolder();
    } catch (err) {
      this.notification.show(this.deleteErrMessage(err), 'error');
    }
  }

  /** Explicitly delete a Binder (pinned) meal.
   *    DELETE /api/meal/{id}  (409 if the meal is still slotted in a menu)
   *  Reload the Binder after. */
  async deleteBinderMeal(mealId: number): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`${this.baseUrl}/meal/${mealId}`));
      await this.loadBinder();
    } catch (err) {
      this.notification.show(this.deleteErrMessage(err), 'error');
    }
  }

  /** Delete a Binder (pinned) menu. DELETE /menu/{id} removes the menu and drops
   *  its DISPOSABLE meals but KEEPS pinned ones (they stay in your Binder) — the
   *  "No, keep associated meals" path. When deleteMeals is true ("Yes"), we also
   *  delete every meal the menu held (captured before deletion), removing them
   *  from the Binder / any other menu too. Refreshes both Binder groups and the
   *  board (the menu may also sit in the current rotation). */
  async deleteBinderMenu(menuId: number, deleteMeals: boolean): Promise<void> {
    const menu = this.binderMenus().find((m) => m.id === menuId);
    const mealIds = (menu?.slots ?? [])
      .map((s) => s.mealId)
      .filter((id): id is number => id != null);
    try {
      await firstValueFrom(this.http.delete(`${this.baseUrl}/menu/${menuId}`));
      if (deleteMeals && mealIds.length) {
        // Best-effort: a meal already dropped by the menu delete just 404s.
        await Promise.allSettled(
          mealIds.map((id) => firstValueFrom(this.http.delete(`${this.baseUrl}/meal/${id}`))),
        );
      }
      await Promise.all([
        this.loadBinderMenus(),
        this.loadBinder(),
        this.loadCurrentRotation(),
      ]);
    } catch (err) {
      this.notification.show(this.deleteErrMessage(err), 'error');
    }
  }

  /** Clear a slot's meal (trash on an in-slot meal). DELETE /menu/{id}/slot/{n};
   *  the server decides the occupant's fate — deletes it if unpinned, unlinks it
   *  if pinned (it stays in the Binder). Re-fetch the menu so the slot renders
   *  empty and totals recompute; refresh the Folder in case the occupant became
   *  reachable there. */
  async clearSlot(menuId: number, slotOrder: number): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/menu/${menuId}/slot/${slotOrder}`),
      );
      await this.refreshMenu(menuId);
      await this.loadFolder();
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Clear a whole menu (the menu-tile trashcan). There is NO bulk single-menu
   *  wipe endpoint, so we loop per-slot DELETE /menu/{id}/slot/{n} over occupied
   *  slots (each clear: server deletes unpinned occupant, unlinks pinned), then
   *  re-fetch the menu + refresh the Folder.
   *  TODO(api): a bulk "clear all slots for a menu" endpoint would collapse this
   *  N-call loop into one round-trip — future API optimization. */
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
      await this.refreshMenu(menuId);
      await this.loadFolder();
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

  /** Drop a Binder menu onto "+ Add menu": duplicate it into a fresh working
   *  copy (so the Binder original stays pristine) and link that copy into the
   *  current rotation, then reload + select it. */
  async addMenuToRotation(menuId: number): Promise<void> {
    const rot = this.rotation();
    if (!rot?.id) return;
    try {
      const copy = await firstValueFrom(
        this.http.post<Menu>(`${this.baseUrl}/menu/${menuId}/duplicate`, {}),
      );
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/rotation/${rot.id}/menus`, {
          menuId: copy.id,
          plannedCount: this.repeatBaseline(rot.spanDays),
        }),
      );
      const detail = await firstValueFrom(
        this.http.get<RotationDetail>(`${this.baseUrl}/rotation/${rot.id}`),
      );
      this.rotation.set(detail);
      if (copy.id != null) {
        this.selectedMenuId.set(copy.id);
        await this.selectMenu(copy.id);
      }
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** "Wipe Menus" — the whole-rotation teardown. DELETE /rotation/{id} on the
   *  server deletes unpinned menus and their unpinned slotted meals; pinned
   *  menus survive (kept for the Binder with their composition); the rotation
   *  row is deleted. Folder + Binder are NOT cleared by this — only refreshed.
   *  Reloads the board (empty-state until a new plan is started). */
  async wipeMenus(): Promise<void> {
    const rot = this.rotation();
    if (!rot?.id) return;
    try {
      await firstValueFrom(this.http.delete(`${this.baseUrl}/rotation/${rot.id}`));
      await Promise.all([
        this.loadCurrentRotation(),
        this.loadFolder(),
        this.loadBinder(),
        this.loadBinderMenus(),
      ]);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Surface a useful message from an HttpErrorResponse. */
  private errMessage(err: unknown): string {
    const e = err as { error?: { error?: string }; statusText?: string };
    return e?.error?.error ?? e?.statusText ?? 'Request failed';
  }

  /** Delete-specific message. A 409 means the meal is still slotted in a menu;
   *  the server refuses to delete it until it's detached. Surface that plainly
   *  rather than the raw body. */
  private deleteErrMessage(err: unknown): string {
    const e = err as { status?: number };
    if (e?.status === 409) {
      return 'This meal is placed in a menu — remove it from that slot first.';
    }
    return this.errMessage(err);
  }
}
