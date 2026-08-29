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
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ShoppingListResponse, ShoppingListPdfRequest } from '../models/generated/shopping.schema';
import {
  AddMealItemRequest,
  AddMealToSlotRequest,
  CreateMealRequest,
  CreateRotationRequest,
  FoodSource,
  GenerateMealRequest,
  ItemRole,
  Meal,
  MealItem,
  Menu,
  MenuSlot,
  Rotation,
  RotationDetail,
  SaveMenuToOriginalConflict,
  UpdateMealItemRequest,
  WipeFromBinderResponse,
  UpdateMealRequest,
  UpdateMenuRequest,
  UpdateRotationRequest,
} from '../models';
import { Food } from '../models/food.model';
import { SettingsService } from './settings.service';
import { NotificationService } from './notification.service';

/** Step-9 teach line, appended to a destroy confirm when the meal has unsaved
 *  work (diverged clone or edited this session). */
export const TEACH_SAVE_LINE =
  'You changed this meal — save it to your notebook first to keep your version.';

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

  /** Binder rail collapsed (slid off to the right)? Like a chef tossing the
   *  spiral notebook off the counter — the Menus & Meals board opens full-width.
   *  Toggled from the splitter arrow; reopened via the splitter or the empty
   *  slot's "Drag from Binder" link. */
  readonly binderCollapsed = signal(true); // starts closed — open it when needed
  toggleBinderCollapsed(): void { this.binderCollapsed.update((v) => !v); }
  showBinder(): void { this.binderCollapsed.set(false); }
  hideBinder(): void { this.binderCollapsed.set(true); }

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
    const empty = menu.slots.find((s) => !s.isDiningOut && this.slotEmpty(s));
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

  /** Meal ids carrying unsaved FOOD changes this session (item add / remove /
   *  quantity) that have NOT been pushed to the Binder. Distinct from
   *  sessionEditedMeals: a pure RENAME does not set this (renames auto-persist to
   *  the Binder). This is the ONLY thing that makes the back-face save disc
   *  actionable — it prompts "save food changes to Binder?". A reactive signal so
   *  the disc lights/dims on OnPush. Cleared once the change is saved to the
   *  Binder, or the meal leaves it. */
  private readonly foodEditedMeals = signal<Set<number>>(new Set());

  private markFoodEdited(mealId: number): void {
    this.foodEditedMeals.update((s) => (s.has(mealId) ? s : new Set(s).add(mealId)));
  }

  private clearFoodEdited(mealId: number): void {
    this.foodEditedMeals.update((s) => {
      if (!s.has(mealId)) return s;
      const next = new Set(s);
      next.delete(mealId);
      return next;
    });
  }

  /** True when the meal has food changes not yet saved to the Binder — gates the
   *  back-face save disc (enabled + green only then). */
  hasUnsavedFoodChanges(mealId: number | null | undefined): boolean {
    return mealId != null && this.foodEditedMeals().has(mealId);
  }

  /** Menu ids whose SLOT COMPOSITION changed this session (a meal added / removed
   *  / created in a slot). For a menu the user has already committed to — one
   *  that's SAVED (pinned) or REAL-NAMED — this is an unsaved change to offer back
   *  to the notebook (the menu save-check lights). On a fresh unnamed menu it's
   *  just building, so the card gates it out. Cleared once saved back. */
  private readonly menuCompositionEdited = signal<Set<number>>(new Set());

  private markMenuComposition(menuId: number): void {
    this.menuCompositionEdited.update((s) => (s.has(menuId) ? s : new Set(s).add(menuId)));
  }

  private clearMenuComposition(menuId: number): void {
    this.menuCompositionEdited.update((s) => {
      if (!s.has(menuId)) return s;
      const next = new Set(s);
      next.delete(menuId);
      return next;
    });
  }

  /** True when this menu's slot composition was changed this session (drives the
   *  menu save-check for committed menus — the card decides pinned/named gating). */
  menuCompositionChanged(menuId: number): boolean {
    return this.menuCompositionEdited().has(menuId);
  }

  /** The ORIGINAL (source) menu id a placed copy was minted from, or null for an
   *  original / a menu not yet cached. Gates the "Save to original" affordance —
   *  present only on copies that carry the server-owned clonedFromMenuId link. */
  menuClonedFromMenuId(menuId: number): number | null {
    return this.menusById().get(menuId)?.clonedFromMenuId ?? null;
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

  /** Green-check "dirty" state for a slotted meal's save disc: UNPINNED and
   *  edited this session (renamed / food added or removed). Deliberately NARROWER
   *  than shouldTeachSave (no diverged-clone clause) — a freshly placed meal, or
   *  one just removed from the Binder, reads CLEAN (grey fork & knife), same as a
   *  newly created one. */
  isMealDirty(mealId: number | null | undefined): boolean {
    if (mealId == null) return false;
    const meal = this.getMeal(mealId);
    return !!meal && meal.pinned !== true && this.sessionEditedMeals.has(mealId);
  }

  /** Any teach-worthy meal in a menu's slots (drives the tile-clear teach line). */
  menuHasUnsavedWork(menuId: number): boolean {
    const menu = this.menusById().get(menuId);
    if (!menu) return false;
    return menu.slots.some((s) =>
      (s.meals ?? []).some((m) => {
        const meal = this.getMeal(m.mealId);
        return meal ? this.shouldTeachSave(meal) : false;
      }),
    );
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
    const id = this.selectedMenuId();
    return this.menuTotals(id ?? undefined);
  });

  /** Summed slot macros for a menu by id — the same source the top macro bars
   *  use. Reads the cached full Menu (loaded when selected/edited), so totals
   *  build live as meals are placed and foods added. Zeros for a menu whose
   *  detail hasn't been fetched yet. Reactive: reads the menusById signal. */
  menuTotals(menuId: number | null | undefined): MenuTotals {
    const totals: MenuTotals = { proteinG: 0, fatG: 0, carbG: 0, fiberG: 0, calories: 0 };
    if (menuId == null) return totals;
    const menu = this.menusById().get(menuId);
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
  }

  getMeal(mealId: number): Meal | null {
    return this.mealsById().get(mealId) ?? null;
  }

  /** True when a menu holds at least one meal in any (non-dining-out) slot — a
   *  menu isn't a "planned" menu-day until a meal lands in it, so this gates the
   *  menu-days tally. Reads the loaded menu detail (menusById); reactive. */
  menuHasMeals(menuId: number): boolean {
    const menu = this.menusById().get(menuId);
    if (!menu) return false;
    return (menu.slots ?? []).some((s) => !s.isDiningOut && (s.meals?.length ?? 0) > 0);
  }

  /** The Binder original a fork descends from, resolved from the PERSISTED
   *  `clonedFromMealId` back-pointer against the loaded Binder list. Fork sources
   *  are always pinned Binder meals, so `binderMeals` reliably holds them with
   *  their `mealImage`/`mealImageThumbnail` and `recipeLink` (the list select
   *  carries those, though not items). null when the meal isn't a fork, or the
   *  original isn't loaded (binder not yet fetched / unpinned / deleted) — callers
   *  then fall through to their existing fallbacks. Survives reload (unlike the
   *  old in-memory fork map), since the back-pointer is on the meal row. */
  private forkOriginal(meal: Meal | null | undefined): Meal | null {
    const srcId = meal?.clonedFromMealId;
    if (srcId == null) return null;
    return this.binderMeals().find((m) => m.id === srcId) ?? null;
  }

  /** A meal's cover image URL, in preference order:
   *   1. the meal's own MealImage (a real meal photo),
   *   2. the fork ORIGINAL's MealImage, resolved via `clonedFromMealId` (a fork
   *      does NOT inherit the source's image — /meal/{id}/duplicate deliberately
   *      drops it — so borrow the original's from the Binder list),
   *   3. the PRIMARY-PROTEIN food's image (so AI-generated / imageless meals show
   *      the star ingredient's picture instead of a blank tile). Prefers the
   *      full-resolution `foodImage`; falls back to the thumbnail until the API
   *      enriches meal items with the full image. '' when nothing is available. */
  coverImageFor(mealId: number): string {
    return this.assignedImageFor(mealId) || this.proteinImageFor(mealId);
  }

  /** The meal's ASSIGNED photo — its own MealImage, or (for a copy-on-write fork
   *  that dropped its image) the fork ORIGINAL's, borrowed via clonedFromMealId.
   *  EXCLUDES the protein-derived default so an assigned slot thumbnail can
   *  outrank it (see meal.ts `tileImage`). '' when the meal has no assigned photo. */
  assignedImageFor(mealId: number): string {
    const meal = this.getMeal(mealId);
    return meal?.mealImage?.trim() || this.forkOriginal(meal)?.mealImage?.trim() || '';
  }

  /** The protein-derived default — the star ingredient's picture. The LAST-resort
   *  cover, below any assigned photo/thumbnail. '' when none. */
  proteinImageFor(mealId: number): string {
    return this.primaryProteinImage(this.getMeal(mealId)) || '';
  }

  /** The star ingredient's picture — the meal's primary-protein food image. Full
   *  resolution when present, else its thumbnail. '' if the meal has no items
   *  loaded or no protein image. */
  private primaryProteinImage(meal: Meal | null | undefined): string {
    if (!meal) return '';
    const items = meal.items ?? [];
    const primary =
      (meal.primaryProteinFoodId != null
        ? items.find((it) => it.food?.foodId === meal.primaryProteinFoodId)
        : undefined) ??
      items.find((it) => it.itemRole === 'primary') ??
      items.find((it) => (it.food?.foodImage ?? it.food?.foodImageThumbnail ?? '').trim());
    return primary?.food?.foodImage?.trim() || primary?.food?.foodImageThumbnail?.trim() || '';
  }

  /** A meal's recipe-link URL. The server's fork-on-place/edit deliberately does
   *  NOT copy RecipeLink to the fork (one-recipe → one-meal invariant), so a
   *  placed/edited imported meal loses its link. Fall back to the fork ORIGINAL's
   *  recipe link (resolved via `clonedFromMealId` against the Binder list) so the
   *  "(from recipe import)" hyperlink survives — including across a reload. */
  recipeLinkFor(mealId: number): string {
    const own = this.getMeal(mealId)?.recipeLink?.trim();
    if (own) return own;
    return this.forkOriginal(this.getMeal(mealId))?.recipeLink?.trim() || '';
  }

  slotItems(mealId: number | null | undefined): MealItem[] {
    if (mealId == null) return [];
    return this.mealsById().get(mealId)?.items ?? [];
  }

  /** Cache a fetched Menu. Single chokepoint for slot state so the board reads
   *  stay consistent. Slots carry `meals[]` (0–4) directly now. */
  private cacheMenu(id: number, menu: Menu): void {
    this.menusById.update((m) => new Map(m).set(id, menu));
  }

  /** True when a slot holds no meals (and isn't dining-out). */
  private slotEmpty(s: MenuSlot): boolean {
    return (s.meals?.length ?? 0) === 0;
  }

  /** Append a meal to a slot at its next free position.
   *    POST /api/menu/{id}/slot/{slotOrder}/meals { mealId }  (409 if full/dining-out) */
  private addMealToSlot(menuId: number, slotOrder: number, mealId: number): Promise<unknown> {
    const body: AddMealToSlotRequest = { mealId };
    return firstValueFrom(
      this.http.post(`${this.baseUrl}/menu/${menuId}/slot/${slotOrder}/meals`, body),
    );
  }

  /** Swap a slot's single occupant (single-meal compat): remove the old meal, add
   *  the new one. Used by the fork repoints — the slot ends holding just newMealId.
   *    DELETE .../slot/{slotOrder}/meals/{oldMealId} → POST .../slot/{slotOrder}/meals */
  private async replaceSlotMeal(
    menuId: number,
    slotOrder: number,
    oldMealId: number,
    newMealId: number,
  ): Promise<void> {
    // ADD first, then remove — so a half-failed swap never leaves the slot empty
    // (worst case the old meal lingers, which is visible, not lost).
    await this.addMealToSlot(menuId, slotOrder, newMealId);
    await firstValueFrom(
      this.http.delete(`${this.baseUrl}/menu/${menuId}/slot/${slotOrder}/meals/${oldMealId}`),
    );
  }

  /** The (menuId, slotOrder) of the slot being edited for a meal — the editing
   *  slot if it matches, else that meal's slot in the SELECTED menu. Targeted
   *  (not a global search) so fork-on-edit repoints the exact slot on screen. */
  private editingSlotOf(mealId: number): { menuId: number; slotOrder: number } | null {
    const es = this.editingSlot();
    if (es?.mealId === mealId) return { menuId: es.menuId, slotOrder: es.slotOrder };
    const sel = this.selectedMenu();
    const slot = sel?.slots.find((s) => (s.meals ?? []).some((m) => m.mealId === mealId));
    if (sel?.id != null && slot != null) return { menuId: sel.id, slotOrder: slot.slotOrder };
    return null;
  }

  /** COPY-ON-WRITE guard (v6). The server LINKS a placed saved (pinned) meal
   *  rather than forking it, so editing a slotted PINNED meal would mutate the
   *  Binder original. Before any edit, if the slotted meal is pinned, fork a
   *  fresh disposable copy (POST /meal/{id}/duplicate), repoint the slot to the
   *  fork, refresh the board menu so the fork is what's on screen, and redirect
   *  the edit onto the fork — the saved copy is never touched. The fork's item
   *  ids differ, so an optional itemId is remapped by position. On a non-pinned
   *  meal or any failure, returns the originals (edit in place). */
  private async forkOnEdit(mealId: number, itemId?: number): Promise<{ mealId: number; itemId?: number }> {
    const meal = this.getMeal(mealId);
    if (meal?.pinned !== true) return { mealId, itemId };
    const loc = this.editingSlotOf(mealId);
    if (loc == null) return { mealId, itemId };
    try {
      const stub = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal/${mealId}/duplicate`, {}),
      );
      const forkId = stub.id;
      if (forkId == null) return { mealId, itemId };
      // The fork's origin is the server-persisted clonedFromMealId (set by the
      // duplicate endpoint) — no client-side bookkeeping needed.
      // The duplicate endpoint tacks " (copy)" onto the name. This fork is an
      // internal copy-on-write working copy, NOT a user "copy" — restore the
      // source's clean name so "(copy)" never appears. Non-fatal if it fails.
      if (meal.name) {
        await firstValueFrom(
          this.http.put<Meal>(`${this.baseUrl}/meal/${forkId}`, { name: meal.name } as UpdateMealRequest),
        ).catch(() => undefined);
      }
      await this.replaceSlotMeal(loc.menuId, loc.slotOrder, mealId, forkId);
      // Refresh the board menu + fork so the slot on screen now shows the fork
      // (unpinned → its pin flips to a "Save" button) before the edit lands.
      await this.refreshMenu(loc.menuId);
      const fork = this.getMeal(forkId);
      if (this.editingSlot()?.mealId === mealId) {
        this.editingSlot.update((es) => (es ? { ...es, mealId: forkId } : es));
      }
      let forkItemId = itemId;
      if (itemId != null) {
        const idx = (meal.items ?? []).findIndex((i) => i.id === itemId);
        forkItemId = idx >= 0 ? fork?.items?.[idx]?.id ?? itemId : itemId;
      }
      return { mealId: forkId, itemId: forkItemId };
    } catch {
      return { mealId, itemId }; // fall back to an in-place edit rather than block
    }
  }

  // ---- Shopping list (computed from the rotation) ----------------------

  /** GET /api/rotation/{id}/shopping-list — the consolidated, retail-rounded
   *  list computed from every tracked meal item across the rotation's menus.
   *  basis 'recipe' uses each recipe's own servings; 'scale' multiplies every
   *  quantity by factor. Returns categories → items (name / quantity / unit). */
  getShoppingList(
    rotationId: number,
    basis: 'recipe' | 'scale',
    factor: number,
  ): Observable<ShoppingListResponse> {
    const params = new HttpParams().set('basis', basis).set('factor', String(factor));
    return this.http.get<ShoppingListResponse>(
      `${this.baseUrl}/rotation/${rotationId}/shopping-list`,
      { params },
    );
  }

  /** PUT /api/rotation/{id}/shopping-progress — persist which computed items the
   *  shopper has ticked off (opaque client-defined keys). Responds 204. */
  saveShoppingProgress(rotationId: number, checkedItems: string[]): Observable<void> {
    return this.http.put<void>(
      `${this.baseUrl}/rotation/${rotationId}/shopping-progress`,
      { checkedItems },
    );
  }

  /** POST /api/rotation/{id}/shopping-list/pdf — server-rendered PDF that merges
   *  the computed list with the user's staples (when body.staples is omitted the
   *  server uses settings.shoppingStaples). Returns the binary PDF as a Blob
   *  (Content-Disposition: inline; filename="shopping-list.pdf"). */
  downloadShoppingListPdf(rotationId: number, body: ShoppingListPdfRequest): Observable<Blob> {
    return this.http.post(
      `${this.baseUrl}/rotation/${rotationId}/shopping-list/pdf`,
      body,
      { responseType: 'blob' },
    );
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
        this.cacheMenu(menuId, menu);
      } catch (err) {
        this.error.set(this.errMessage(err));
        return;
      }
    }

    const menu = this.menusById().get(menuId);
    if (!menu) return;
    for (const slot of menu.slots) {
      if (slot.isDiningOut) continue;
      // Prefetch EVERY stacked meal so each tile's rows are cached before flip.
      for (const m of slot.meals ?? []) {
        if (this.mealsById().has(m.mealId)) continue;
        void this.loadMeal(m.mealId); // fire-and-forget
      }
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

  // ---- AI meal image generation (MealSetOwner-only) --------------------------
  /** Meals with an AI image-generation request in flight — drives the card's
   *  "Generating image…" state and guards double-submit. */
  readonly generatingImageIds = signal<Set<number>>(new Set());
  isGeneratingImage(mealId: number): boolean {
    return this.generatingImageIds().has(mealId);
  }

  /** Kick off async AI image generation for a meal. POST /meal/{id}/generate-image
   *  → 202 (regi-api emits a Kafka request; regi-image writes mealImage /
   *  mealImageThumbnail back later). We poll the meal until the image URL appears
   *  (or changes, for a regenerate), then the tile re-renders from coverImageFor.
   *  The backend owns generation — the client never uploads/generates. */
  async generateMealImage(mealId: number): Promise<void> {
    if (this.generatingImageIds().has(mealId)) return; // guard double-submit
    const baseline = this.mealImageUrl(mealId);        // regenerate → detect a change
    this.generatingImageIds.update((s) => new Set(s).add(mealId));
    try {
      await firstValueFrom(
        this.http.post<void>(`${this.baseUrl}/meal/${mealId}/generate-image`, null),
      );
      // 202 accepted — fire-and-forget. A brief dismissible toast is the only
      // feedback (the camera stays enabled); poll quietly so the image appears.
      this.notification.show('AI image creation queued — this may take a minute.', 'info', 5000);
      this.pollForMealImage(mealId, baseline, 0);
    } catch (err) {
      this.clearGeneratingImage(mealId);
      const status = (err as { status?: number })?.status;
      if (status === 503) {
        this.notification.show('Image generation is unavailable — please try again later.', 'error');
      } else {
        this.notification.show(this.errMessage(err), 'error');
      }
    }
  }

  private mealImageUrl(mealId: number): string {
    const m = this.getMeal(mealId);
    return m?.mealImage?.trim() || m?.mealImageThumbnail?.trim() || '';
  }
  private clearGeneratingImage(mealId: number): void {
    this.generatingImageIds.update((s) => {
      const n = new Set(s);
      n.delete(mealId);
      return n;
    });
  }

  /** Poll ~every 4s (cap ~60s) re-fetching the meal until its image URL appears or
   *  changes (regenerate), then clear the loading state and refresh the board. */
  private pollForMealImage(mealId: number, baseline: string, attempt: number): void {
    const MAX_ATTEMPTS = 15; // ~60s at 4s
    setTimeout(async () => {
      if (!this.generatingImageIds().has(mealId)) return; // cleared elsewhere
      await this.loadMeal(mealId);
      const now = this.mealImageUrl(mealId);
      if (now !== '' && now !== baseline) {
        // Refresh BOTH surfaces: the board's selected menu AND the Notebook/Binder
        // (a separate binderMeals signal), so the new thumbnail appears in the
        // spiral notebook without a manual reload.
        const fresh = this.getMeal(mealId);
        if (fresh) this.replaceBinderMeal(fresh);
        void this.refreshSelectedMenu();
        this.clearGeneratingImage(mealId);
        return;
      }
      if (attempt + 1 >= MAX_ATTEMPTS) {
        this.clearGeneratingImage(mealId);
        this.notification.show('Image is taking longer than expected — it may appear shortly.', 'warning');
        return;
      }
      this.pollForMealImage(mealId, baseline, attempt + 1);
    }, 4000);
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
      const spanDays = this.menuDaysSetting();

      const createBody: CreateRotationRequest = { spanDays, peopleCount: persons };
      const rot = await firstValueFrom(
        this.http.post<Rotation>(`${this.baseUrl}/rotation`, createBody),
      );
      const menu = await firstValueFrom(
        this.http.post<Menu>(`${this.baseUrl}/menu`, { slotCount }),
      );
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/rotation/${rot.id}/menus`, {
          menuId: menu.id,
          plannedCount: this.repeatBaseline(spanDays),
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
  private async loadMealsByScope(
    scope: 'folder' | 'binder',
    mealSetIds: number[] = [],
  ): Promise<Meal[]> {
    const PAGE = 100;
    const MAX_PAGES = 20; // 2000 meals — a sane ceiling for the read loop
    const all: Meal[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      // When set ids are chosen, the server returns the union of the caller's own
      // meals + meals junctioned into those (entitled) sets. Own meals omit the
      // mealSetId/mealSetName tags; set-sourced entries carry them.
      const params: Record<string, string> = {
        scope,
        limit: String(PAGE),
        offset: String(page * PAGE),
      };
      if (mealSetIds.length) params['mealSetIds'] = mealSetIds.join(',');
      const batch =
        (await firstValueFrom(this.http.get<Meal[]>(`${this.baseUrl}/meal`, { params }))) ?? [];
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

  /** The MealSet ids currently mixed into the Binder list (empty = My Meals
   *  only). Remembered so external reloads (pin / import / delete) preserve the
   *  user's set selection instead of dropping back to own-meals-only. */
  private binderMealSetIds: number[] = [];

  /** Load the Binder (pinned meals), optionally unioned with entitled MealSets.
   *  Passing mealSetIds updates the remembered selection; omit it to reuse the
   *  last selection (so unrelated reloads keep the sets visible). */
  async loadBinder(mealSetIds?: number[]): Promise<void> {
    if (mealSetIds !== undefined) this.binderMealSetIds = mealSetIds;
    try {
      this.binderMeals.set(await this.loadMealsByScope('binder', this.binderMealSetIds));
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

  /** Generate ONE meal and place it DIRECTLY into the next open meal slot — no
   *  Folder/RHS staging. The fresh meal is unpinned + uncloned, so the server
   *  LINKS it straight into the slot (no fork). It lives there as a transitory
   *  meal: the user pins it to keep it, edits it, or it's dropped with the menu.
   *  Slot target = the selected menu's first empty slot, else a freshly-created
   *  (next-lettered) menu's first slot.
   *    POST /meal/generate { mealType } -> Meal (persisted, pinned=false)
   *  Failures toast rather than setting the panel-wide error signal (which would
   *  replace the whole board on a transient generation failure). */
  async generateMeal(): Promise<void> {
    this.generating.set(true);
    try {
      const excludeMeals = this.knownMealNames();
      const body: GenerateMealRequest = { mealType: 'meal', excludeMeals };
      const meal = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal/generate`, body),
      );
      // Land the new meal in the Binder's Meals LIST (pin it) so the user drags
      // it into a slot themselves — do NOT auto-place it into a slot.
      const pinBody: UpdateMealRequest = { pinned: true };
      const saved = await firstValueFrom(
        this.http.put<Meal>(`${this.baseUrl}/meal/${meal.id}`, pinBody),
      );
      this.mealsById.update((m) => new Map(m).set(saved.id, saved));
      await this.loadBinder();
      // Cuisine-spin (green check) result: surface the new meal by NAME and its
      // protein focus so the notification is meaningful at a glance. The meal has
      // already floated to the top of the Binder Meals list (date-sort).
      const name = saved.name?.trim() || 'your new meal';
      const protein = saved.primaryProteinName?.trim();
      const msg = protein
        ? `Meal created: "${name}" — protein focus: ${protein}`
        : `Meal created and added to your Meals, ${name}`;
      this.notification.showIngest(msg, () => {});
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    } finally {
      this.generating.set(false);
    }
  }

  /** Where a freshly-generated meal lands: the selected menu's first empty,
   *  non-dining-out slot; failing that, add the next-lettered menu (creating one
   *  if the rotation has none) and use its first slot. Null if none can be made. */
  private async findGenerateTargetSlot(): Promise<{ menuId: number; slotOrder: number } | null> {
    const firstEmpty = (menu?: Menu): number | undefined =>
      menu?.slots.find((s) => !s.isDiningOut && this.slotEmpty(s))?.slotOrder;

    const sel = this.selectedMenu();
    const selEmpty = firstEmpty(sel);
    if (sel?.id != null && selEmpty != null) return { menuId: sel.id, slotOrder: selEmpty };

    // Selected menu is full (or there's no menu yet) → add one and use its slot.
    await this.addMenu();
    const created = this.selectedMenu();
    const newEmpty = firstEmpty(created);
    if (created?.id != null && newEmpty != null) {
      return { menuId: created.id, slotOrder: newEmpty };
    }
    return null;
  }

  /** Double-click placement of a Binder meal — an alternative to dragging it
   *  onto a slot. Drops it into the highlighted (selected) menu's first empty
   *  slot, or a fresh menu's first slot if the current one is full / none exists
   *  yet (same target the AI "Create Meal" uses). */
  async placeBinderMeal(mealId: number): Promise<void> {
    const target = await this.findGenerateTargetSlot();
    if (!target) return;
    await this.placeMealInSlot(target.menuId, target.slotOrder, mealId);
    if (this.selectedMenuId() !== target.menuId) {
      this.selectedMenuId.set(target.menuId);
      await this.selectMenu(target.menuId);
    }
  }

  /** "Create from scratch" — begin a brand-new empty meal in the next open slot
   *  (adding a menu if needed, same target the AI create uses) and open the food
   *  picker so the user builds it up. The meal row is created server-side on the
   *  first food add (addFoodToEditingMeal). */
  async createScratchMeal(): Promise<void> {
    const target = await this.findGenerateTargetSlot();
    if (!target) {
      this.notification.show('No open slot to create a meal in.', 'error');
      return;
    }
    if (this.selectedMenuId() !== target.menuId) {
      this.selectedMenuId.set(target.menuId);
      await this.selectMenu(target.menuId);
    }
    await this.createMealInSlot(target.menuId, target.slotOrder);
  }

  /** "Create from scratch" on a specific empty slot — immediately create a named
   *  "Meal N" (next free number in this menu), place it in the slot so a tile
   *  shows right away, then open it for editing (food picker) so the user builds
   *  it up. The user renames it later (pencil) or pins it to the Binder. */
  async createMealInSlot(menuId: number, slotOrder: number): Promise<void> {
    try {
      const createBody: CreateMealRequest = { name: this.nextMealName(menuId) };
      const meal = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal`, createBody),
      );
      await this.addMealToSlot(menuId, slotOrder, meal.id);
      this.mealsById.update((m) => new Map(m).set(meal.id, meal));
      // Reload the menu so the new tile appears, then open it for editing.
      const updated = await firstValueFrom(
        this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
      );
      this.cacheMenu(menuId, updated);
      this.editingSlot.set({ menuId, slotOrder, mealId: meal.id });
      this.markMenuComposition(menuId); // slot composition changed → savable back
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** The next free "Meal N" name for a menu — the smallest positive integer not
   *  already used by a "Meal N"-named meal in that menu's slots. */
  private nextMealName(menuId: number): string {
    const used = new Set<number>();
    const menu = this.menusById().get(menuId);
    for (const slot of menu?.slots ?? []) {
      for (const sm of slot.meals ?? []) {
        const m = /^meal\s+(\d+)$/i.exec((sm.mealName ?? '').trim());
        if (m) used.add(Number(m[1]));
      }
    }
    let n = 1;
    while (used.has(n)) n++;
    return `Meal ${n}`;
  }

  /** Names of meals the session already knows — meals placed in the selected
   *  menu — so the generator can avoid repeats. */
  private knownMealNames(): string[] {
    const names = new Set<string>();
    const menu = this.selectedMenu();
    if (menu) {
      for (const slot of menu.slots) {
        for (const m of slot.meals ?? []) {
          if (m.mealName) names.add(m.mealName);
        }
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
      await this.addMealToSlot(menuId, slotOrder, mealId);
      await this.refreshMenu(menuId);
      await this.loadFolder();
      this.markMenuComposition(menuId); // slot composition changed → savable back
    } catch (err) {
      // 409 = the slot rejected the append (full / duplicate / dining-out). Toast
      // the specific reason; never trip the panel-wide error signal for a drop.
      this.notification.show(this.slotConflictMessage(err), 'error');
    }
  }

  /** Remove ONE meal from a slot (per-tile trash on the image grid).
   *    DELETE /api/menu/{id}/slot/{slotOrder}/meals/{mealId}
   *  Re-fetch the menu on success; toast + leave the board intact on failure. */
  async removeMealFromSlot(menuId: number, slotOrder: number, mealId: number): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/menu/${menuId}/slot/${slotOrder}/meals/${mealId}`),
      );
    } catch (err) {
      // A 404 means the junction is ALREADY gone — e.g. the meal was deleted from
      // the binder, which cascade-removed it from the slot; the board tile is just
      // stale. Clearing is effectively done, so fall through and resync (no error).
      if (!(err instanceof HttpErrorResponse && err.status === 404)) {
        this.notification.show(this.errMessage(err), 'error');
        return;
      }
    }
    await this.refreshMenu(menuId);
    await this.loadFolder();
    this.markMenuComposition(menuId); // slot composition changed → savable back
  }

  /** MOVE a slotted meal to another EMPTY slot in the SAME menu (drag a slot's
   *  photo onto an empty slot). Add to the target FIRST, then detach from the
   *  source — a half-failure never loses the meal (worst case it's briefly in
   *  both). One refresh at the end. No-op if the target is the source slot. */
  async moveMealToEmptySlot(
    menuId: number,
    fromSlotOrder: number,
    toSlotOrder: number,
    mealId: number,
  ): Promise<void> {
    if (fromSlotOrder === toSlotOrder) return;
    try {
      await this.addMealToSlot(menuId, toSlotOrder, mealId);
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/menu/${menuId}/slot/${fromSlotOrder}/meals/${mealId}`),
      );
      await this.refreshMenu(menuId);
      await this.loadFolder();
    } catch (err) {
      this.notification.show(this.slotConflictMessage(err), 'error');
      await this.refreshMenu(menuId); // resync the board to server truth
    }
  }

  /** MOVE a slotted meal into a BRAND-NEW menu (drag a slot's photo onto the
   *  "+ Add menu" tile). Mirrors addMenu's create+link, then places the meal in
   *  the new menu's first slot and detaches it from the source slot, and selects
   *  the new menu. */
  async moveMealToNewMenu(
    sourceMenuId: number,
    sourceSlotOrder: number,
    mealId: number,
  ): Promise<void> {
    const rot = this.rotation();
    if (!rot?.id) return;
    try {
      const slotCount = this.settingsService.allSettings()?.regiMenu?.mealsPerDay ?? 4;
      const menu = await firstValueFrom(
        this.http.post<Menu>(`${this.baseUrl}/menu`, { slotCount }),
      );
      if (menu.id == null) return;
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/rotation/${rot.id}/menus`, {
          menuId: menu.id,
          plannedCount: this.repeatBaseline(rot.spanDays),
        }),
      );
      const firstSlot = menu.slots?.[0]?.slotOrder ?? 1;
      await this.addMealToSlot(menu.id, firstSlot, mealId);
      await firstValueFrom(
        this.http.delete(
          `${this.baseUrl}/menu/${sourceMenuId}/slot/${sourceSlotOrder}/meals/${mealId}`,
        ),
      );
      const detail = await firstValueFrom(
        this.http.get<RotationDetail>(`${this.baseUrl}/rotation/${rot.id}`),
      );
      this.rotation.set(detail);
      await this.refreshMenu(sourceMenuId); // source lost a meal
      this.selectedMenuId.set(menu.id);
      await this.selectMenu(menu.id);
      await this.loadFolder();
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** MOVE a slotted meal into ANOTHER existing menu (drag a slot's photo onto a
   *  menu tile in the strip). Fetches the target menu to find its first empty,
   *  non-dining slot, places the meal there, then detaches it from the source.
   *  The source menu stays selected (the meal simply leaves it). Both menus'
   *  caches refresh so the strip tallies update. No empty slot → toast + no-op. */
  async moveMealToMenu(
    sourceMenuId: number,
    sourceSlotOrder: number,
    mealId: number,
    targetMenuId: number,
  ): Promise<void> {
    if (targetMenuId === sourceMenuId) return;
    try {
      const target = await firstValueFrom(
        this.http.get<Menu>(`${this.baseUrl}/menu/${targetMenuId}`),
      );
      const slot = target.slots?.find((s) => !s.isDiningOut && this.slotEmpty(s));
      if (slot == null) {
        this.notification.show(`"${target.name ?? 'That menu'}" has no empty slot.`, 'error');
        return;
      }
      await this.addMealToSlot(targetMenuId, slot.slotOrder, mealId);
      await firstValueFrom(
        this.http.delete(
          `${this.baseUrl}/menu/${sourceMenuId}/slot/${sourceSlotOrder}/meals/${mealId}`,
        ),
      );
      await this.refreshMenu(sourceMenuId);
      await this.refreshMenu(targetMenuId);
      await this.loadFolder();
      this.notification.show(`Moved to "${target.name ?? 'menu'}"`, 'success');
    } catch (err) {
      this.notification.show(this.slotConflictMessage(err), 'error');
      await this.refreshMenu(sourceMenuId); // resync the board to server truth
    }
  }

  /** Map a slot-append 409 to a specific, human message; fall back to the generic
   *  error text for anything else. */
  private slotConflictMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.status === 409) {
      const body = typeof err.error === 'string' ? err.error : (err.error?.message ?? '');
      const text = String(body).toLowerCase();
      if (text.includes('dining')) return 'This slot is set to dining out.';
      if (text.includes('dup') || text.includes('already')) return 'That meal is already in this slot.';
      return 'This slot is full (max 4 meals).';
    }
    return this.errMessage(err);
  }

  /** "Repeat" — fan one meal out as read-only clones into every empty,
   *  non-dining-out slot of the menu. The server LINKS the same mealId into each
   *  slot (no fork for a disposable source; a disposable meal is explicitly
   *  allowed in several slots), so all slots share ONE meal row: editing the
   *  origin updates every clone, and clearing a clone slot only drops that
   *  reference (delete-on-detach keeps the meal while a sibling holds it).
   *  Sequential PUTs so the slot writes don't race; one refresh at the end.
   *    PUT /menu/{menuId}/slot { slotOrder, mealId } × empty slots */
  async repeatMealIntoSlots(menuId: number, mealId: number): Promise<void> {
    const menu = this.menusById().get(menuId);
    if (!menu) return;
    const targets = menu.slots
      .filter((s) => !s.isDiningOut && this.slotEmpty(s))
      .map((s) => s.slotOrder);
    if (targets.length === 0) return;
    try {
      for (const slotOrder of targets) {
        await this.addMealToSlot(menuId, slotOrder, mealId);
      }
      await this.refreshMenu(menuId);
      await this.loadFolder();
      const n = targets.length;
      this.notification.show(`Repeated into ${n} slot${n > 1 ? 's' : ''}`, 'success');
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** "Copy" — duplicate a meal as an INDEPENDENT new meal row titled
   *  "<name> (copy)" and link it into the menu's next empty slot. Unlike Repeat
   *  (shared-pointer clones), the copy is its own editable meal.
   *    POST /meal/{id}/duplicate -> Meal (fresh, unpinned)
   *    PUT  /meal/{copyId}        -> title it "<name> (copy)"
   *    PUT  /menu/{menuId}/slot   -> link the copy into the empty slot */
  async duplicateMealIntoSlot(menuId: number, mealId: number): Promise<void> {
    const menu = this.menusById().get(menuId);
    if (!menu) return;
    const slotOrder = menu.slots.find((s) => !s.isDiningOut && this.slotEmpty(s))?.slotOrder;
    if (slotOrder == null) {
      this.notification.show('No empty slot for the copy.', 'error');
      return;
    }
    try {
      const copy = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal/${mealId}/duplicate`, {}),
      );
      if (copy.id == null) return;
      // Title the copy "<name> (copy)" — strip any existing "(copy)" suffix on the
      // source first so we never chain "(copy) (copy)".
      const base = (this.getMeal(mealId)?.name ?? copy.name ?? 'Meal')
        .replace(/\s*\(copy\)\s*$/i, '')
        .trim();
      const body: UpdateMealRequest = { name: `${base} (copy)` };
      await firstValueFrom(this.http.put<Meal>(`${this.baseUrl}/meal/${copy.id}`, body));
      // Fresh (unpinned) copy → linked directly into the empty slot (no re-fork).
      await this.placeMealInSlot(menuId, slotOrder, copy.id);
      this.notification.show('Copied', 'success');
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Re-fetch a menu's detail + all its slotted meals into the caches. Used
   *  after slot placement (the slot may hold a new forked meal id; the menu's
   *  pinned flag may have flipped) and after pinning a menu (server cascade
   *  pins the menu + every slotted meal). */
  /** Force-reload the selected menu and every slotted meal (full GET, so fields
   *  like recipeLink refresh). Used after a recipe publish backfills RecipeLink
   *  onto meals already built from it — selectMenu would skip cached meals. */
  async refreshSelectedMenu(): Promise<void> {
    const id = this.selectedMenuId();
    if (id != null) await this.refreshMenu(id);
  }

  private async refreshMenu(menuId: number): Promise<void> {
    const menu = await firstValueFrom(this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`));
    this.cacheMenu(menuId, menu);
    // Keep the rotation's tile entry.pinned in lockstep with the menu's flag —
    // the tile derives its pin/ghost from entry.pinned, and pinning a menu (or
    // placing into a pinned one) flips it server-side.
    this.syncEntryPinned(menuId, menu.pinned === true);
    for (const slot of menu.slots) {
      for (const m of slot.meals ?? []) await this.loadMeal(m.mealId);
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
   *  meal. A pinned meal leaves the Folder, so refresh both lists.
   *  `clearClonedFrom` (pin-AS-NEW path) also nulls the server's clonedFromMealId
   *  so the new Binder meal is truly independent and stops borrowing the
   *  original's image/recipe-link. */
  async pinMeal(mealId: number, clearClonedFrom = false): Promise<void> {
    try {
      const body: UpdateMealRequest = { pinned: true };
      if (clearClonedFrom) body.clearClonedFrom = true;
      const updated = await firstValueFrom(
        this.http.put<Meal>(`${this.baseUrl}/meal/${mealId}`, body),
      );
      this.mealsById.update((m) => new Map(m).set(mealId, updated));
      this.clearFoodEdited(mealId); // now saved to the Binder → disc goes clean
      await Promise.all([this.loadBinder(), this.loadFolder()]);
      // Saving a meal you were building closes the food picker so the rail
      // returns to the Binder.
      this.stopEditing();
      this.notification.show('Saved to your notebook', 'success');
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Remove a meal FROM the Binder while keeping it slotted. PUT { pinned:false }
   *  — the meal stays in its slot (still referenced by the menu) but drops out of
   *  the Binder, returning it to the unsaved (green-check) state. Refresh both
   *  lists so the Binder card disappears and the slot's indicator flips. */
  async removeMealFromBinder(mealId: number): Promise<void> {
    try {
      const body: UpdateMealRequest = { pinned: false };
      const updated = await firstValueFrom(
        this.http.put<Meal>(`${this.baseUrl}/meal/${mealId}`, body),
      );
      this.mealsById.update((m) => new Map(m).set(mealId, updated));
      // Back to a clean slotted meal — same as newly created (grey fork & knife),
      // so drop any session-edited flag.
      this.sessionEditedMeals.delete(mealId);
      this.clearFoodEdited(mealId);
      await Promise.all([this.loadBinder(), this.loadFolder()]);
      this.notification.show('Removed from your notebook (still slotted)', 'success');
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** UI mirror of pinMenu's all-Binder save rule: true when EVERY slotted meal in
   *  the menu resolves in the cache to `pinned === true`. Used to gate the menu
   *  save control BEFORE the click (pinMenu keeps its own check as the backstop —
   *  this only mirrors it, it does not enforce). Discriminator is `pinned` (same
   *  as pinMenu), NOT clonedFromMealId. A slot meal not yet loaded in mealsById is
   *  UNKNOWN → treated as not-clean (savable only once the board's prefetch
   *  hydrates it); loaded-collection lookup only, never a per-slot fetch. Empty /
   *  all-pinned menus are clean, matching pinMenu (which blocks only on an unsaved
   *  meal). Returns false when the menu itself isn't cached yet. */
  menuAllSlotsClean(menuId: number): boolean {
    const menu = this.menusById().get(menuId);
    if (menu == null) return false;
    for (const slot of menu.slots ?? []) {
      if (slot.isDiningOut) continue;
      for (const sm of slot.meals ?? []) {
        if (this.mealsById().get(sm.mealId)?.pinned !== true) return false;
      }
    }
    return true;
  }

  /** Save the unsaved MEAL edits inside a placed menu back to the notebook: run
   *  each dirty slotted meal through saveSlottedCopy — which overwrites its Binder
   *  original in place (or pins it as new by name). Because slotted meals reference
   *  shared Binder meals, overwriting the original carries the change back into the
   *  notebook's copy of the menu too. The menu ENTITY isn't re-pinned here (that
   *  would risk spawning a "(copy)" menu); only the meal contents are pushed. */
  async saveMenuMealChanges(menuId: number): Promise<void> {
    const menu = this.menusById().get(menuId);
    if (menu == null) return;
    const dirty: number[] = [];
    for (const slot of menu.slots ?? []) {
      for (const sm of slot.meals ?? []) {
        const meal = this.getMeal(sm.mealId);
        if (meal && this.shouldTeachSave(meal)) dirty.push(sm.mealId);
      }
    }
    for (const mealId of dirty) {
      await this.saveSlottedCopy(mealId);
    }
    // Pin the menu so it actually lands in the Binder Menus list (the server
    // cascade locks it + its meals in). The dirty meals are saved above, so
    // pinMenu's all-Binder guard now passes. pinMenu also refreshes the menu and
    // both Binder groups, so no separate refresh is needed.
    await this.pinMenu(menuId);
    this.clearMenuComposition(menuId); // composition change saved
  }

  /** Save a PLACED copy's slot composition back onto its notebook ORIGINAL.
   *    PUT /api/menu/{copyId}/save-to-original  (no body)
   *  The copy is linked to its source via clonedFromMenuId (server-owned); the
   *  endpoint overwrites the original's slots from the copy and returns the
   *  updated ORIGINAL (slots fully expanded). Name + pinned on both are untouched.
   *    • 200 → merge the original into menusById so an open view of it refreshes.
   *    • 409 → SaveMenuToOriginalConflict: some slotted meals aren't in the binder
   *            yet; name them so the user saves those first.
   *    • 404 → the original is gone; drop the copy's back-pointer locally so the
   *            "Save to original" affordance disappears without a refetch. */
  async saveMenuToOriginal(copyId: number): Promise<void> {
    try {
      const original = await firstValueFrom(
        this.http.put<Menu>(`${this.baseUrl}/menu/${copyId}/save-to-original`, null),
      );
      if (original.id != null) this.cacheMenu(original.id, original);
      this.clearMenuComposition(copyId); // the copy's changes are now on the original
      this.notification.show('Saved to the original in your notebook', 'success');
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        const conflict = err.error as SaveMenuToOriginalConflict | null;
        const names = conflict?.unsavedMeals?.join(', ') ?? '';
        this.notification.show(`Save these meals to your binder first: ${names}`, 'error');
        return;
      }
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.notification.show('The original menu no longer exists.', 'error');
        // Drop the stale back-pointer so the affordance disappears without a refetch.
        this.menusById.update((m) => {
          const copy = m.get(copyId);
          if (copy == null) return m;
          return new Map(m).set(copyId, { ...copy, clonedFromMenuId: null });
        });
        return;
      }
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Pin a MENU to the Binder. PUT /menu/{id} { pinned: true } runs the server
   *  cascade — the menu AND every slotted meal flip pinned in one call — so we
   *  re-fetch the menu + its meals (every card's icon flips alive together) and
   *  refresh the Binder. (API registers PUT, not PATCH, for /menu/{id}.) */
  async pinMenu(menuId: number): Promise<void> {
    try {
      // RULE: a menu can only be saved once EVERY meal in it is already a Binder
      // meal. Otherwise the server's pin cascade would flip disposable one-offs
      // (forks / unsaved meals) to pinned, spawning copies. Block + name them so
      // the user saves the meals first, then the menu.
      const full = await firstValueFrom(this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`));
      const unsaved: string[] = [];
      // Walk EVERY stacked meal in every slot (meals[] is the multi-meal wire shape).
      for (const slot of full.slots ?? []) {
        if (slot.isDiningOut) continue;
        for (const sm of slot.meals ?? []) {
          let meal = this.getMeal(sm.mealId);
          if (meal == null) {
            await this.loadMeal(sm.mealId);
            meal = this.getMeal(sm.mealId);
          }
          if (meal?.pinned !== true) {
            unsaved.push((sm.mealName ?? meal?.name ?? `Meal ${slot.slotOrder}`).replace(/\s*\(copy\)\s*$/i, ''));
          }
        }
      }
      if (unsaved.length > 0) {
        this.notification.show(
          `Save these meals to your Binder first, then save the menu: ${unsaved.join(', ')}`,
          'error',
        );
        return;
      }

      const body: UpdateMenuRequest = { pinned: true };
      await firstValueFrom(this.http.put(`${this.baseUrl}/menu/${menuId}`, body));
      await this.refreshMenu(menuId);
      // Cascade pinned the menu + its slotted meals: refresh BOTH Binder groups.
      await Promise.all([this.loadBinder(), this.loadBinderMenus()]);
      // Ask the Binder rail to reveal the newly pinned menu (expand + scroll).
      this.revealBinderMenuId.set(menuId);
      this.notification.show('Saved to your notebook', 'success');
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

  /** Set (or clear) a meal's cooking method. PUT /meal/{id} { cookingMethodId }
   *  — a positive id sets it, 0 clears to NULL (wire convention). Updates the
   *  cache from the returned meal so the picker + metadata reflect it. */
  async updateMealCookingMethod(mealId: number, cookingMethodId: number): Promise<void> {
    try {
      const body: UpdateMealRequest = { cookingMethodId };
      const updated = await firstValueFrom(
        this.http.put<Meal>(`${this.baseUrl}/meal/${mealId}`, body),
      );
      this.mealsById.update((m) => new Map(m).set(mealId, updated));
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
   *      onto editingSlot. pinned stays false — a disposable placed meal.
   *    • food already an item (same foodId + foodSource): NO-OP — we never
   *      auto-summate. The user changes the amount via the row pencil.
   *    • otherwise: POST a new item.
   *  itemRole = 'primary' when the food is a Protein AND the meal has no primary
   *  yet; else 'side'. On success: refresh the menu (slot macros/chips) + the
   *  meal's items (rows/dot). Failures toast and leave the board intact. */
  /** The most recent successful food-add: the meal it landed in (FINAL id, after
   *  any copy-on-write fork) + the added food's id. Drives a one-shot "bloom" on
   *  the new row in the meal card; the card clears it on animation end. */
  readonly lastAdd = signal<{ mealId: number; foodId: number } | null>(null);

  async addFoodToEditingMeal(food: Food, serving: number): Promise<void> {
    const slot = this.editingSlot();
    if (!slot) return;

    // Capture the meal's ASSIGNED photo (its own, or the fork original's borrowed
    // one) BEFORE the add. POST /items never touches mealImage server-side, and a
    // copy-on-write fork drops it — so we re-attach this afterward instead of
    // letting the tile fall back to the protein-derived default. Deliberately does
    // NOT capture the protein default itself.
    const startMeal = slot.mealId != null ? this.getMeal(slot.mealId) : null;
    const keepImage =
      startMeal?.mealImage?.trim() || this.forkOriginal(startMeal)?.mealImage?.trim() || '';
    const keepThumb =
      startMeal?.mealImageThumbnail?.trim() ||
      this.forkOriginal(startMeal)?.mealImageThumbnail?.trim() ||
      '';
    // Same story for the recipe PDF link: a fork drops RecipeLink server-side, so
    // capture it (own, or the fork original's) and re-attach it below — otherwise
    // the "Recipe (PDF)" hyperlink vanishes the moment you add a food.
    const keepRecipe =
      startMeal?.recipeLink?.trim() || this.forkOriginal(startMeal)?.recipeLink?.trim() || '';

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
        if (mealId != null) await this.addMealToSlot(slot.menuId, slot.slotOrder, mealId);
        this.editingSlot.set({ ...slot, mealId });
        this.markMenuComposition(slot.menuId); // new meal filled an empty slot

      } else {
        // Fork-on-edit: adding a food to a placed SAVED meal forks it first
        // (repoints the slot + updates editingSlot to the fork).
        const forked = await this.forkOnEdit(mealId);
        mealId = forked.mealId;
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
      this.cacheMenu(slot.menuId, menu);
      await this.loadMeal(mealId);

      // Preserve the assigned photo AND the recipe link through the add: if the
      // (possibly forked) meal now has none of its OWN, re-attach what it was
      // showing. Only real assigned values — coverImageFor still falls back to the
      // protein default when there genuinely is no assigned image.
      if (keepImage || keepRecipe) {
        this.mealsById.update((map) => {
          const cur = map.get(mealId);
          if (!cur) return map;
          const needImage = !!keepImage && !cur.mealImage?.trim();
          const needRecipe = !!keepRecipe && !cur.recipeLink?.trim();
          if (!needImage && !needRecipe) return map;
          const next = new Map(map);
          next.set(mealId, {
            ...cur,
            ...(needImage
              ? { mealImage: keepImage, mealImageThumbnail: cur.mealImageThumbnail?.trim() || keepThumb }
              : {}),
            ...(needRecipe ? { recipeLink: keepRecipe } : {}),
          });
          return next;
        });
      }

      // One-shot bloom on the new row (matched by foodId — stable across a fork).
      if (food.id != null) this.lastAdd.set({ mealId, foodId: food.id });

      // Adding a food is an unsaved food change → light the back-face save disc.
      this.markFoodEdited(mealId);
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
    // Fork-on-edit: removing an item from a placed SAVED meal forks it first.
    const { mealId: editId, itemId: editItemId } = await this.forkOnEdit(mealId, itemId);
    const menuId = this.editingSlot()?.menuId ?? this.selectedMenuId();
    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/meal/${editId}/items/${editItemId}`),
      );
      this.markSessionEdited(editId);
      this.markFoodEdited(editId);
      if (menuId != null) {
        const menu = await firstValueFrom(
          this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
        );
        this.cacheMenu(menuId, menu);
      }
      await this.loadMeal(editId);
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
    // Fork-on-edit: changing a serving on a placed SAVED meal forks it first.
    const { mealId: editId, itemId: editItemId } = await this.forkOnEdit(mealId, itemId);
    const menuId = this.editingSlot()?.menuId ?? this.selectedMenuId();
    try {
      const body: UpdateMealItemRequest = { quantity };
      await firstValueFrom(
        this.http.put<MealItem>(`${this.baseUrl}/meal/${editId}/items/${editItemId}`, body),
      );
      this.markSessionEdited(editId);
      this.markFoodEdited(editId);
      if (menuId != null) {
        const menu = await firstValueFrom(
          this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
        );
        this.cacheMenu(menuId, menu);
      }
      await this.loadMeal(editId);
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Strip a trailing " (copy)" the duplicate endpoint may add, for name compares. */
  private stripCopy(name: string | null | undefined): string {
    return (name ?? '').replace(/(\s*\(copy\))+\s*$/i, '');
  }

  /** Save a slotted copy to the Binder — the NAME decides which of two things:
   *   • it's a fork whose name still matches its Binder original → OVERWRITE the
   *     original in place with this copy's contents.
   *   • name changed, or it's built-from-scratch / has no resolvable original →
   *     PIN AS NEW: it becomes its own Binder meal and severs the back-pointer
   *     (clearClonedFrom) so it's fully independent.
   *  No dialog; the button does exactly one of the two. */
  async saveSlottedCopy(mealId: number): Promise<void> {
    const meal = this.getMeal(mealId);
    if (meal == null) return;
    const original = this.forkOriginal(meal);
    const namesMatch =
      original != null &&
      this.stripCopy(meal.name).trim() === this.stripCopy(original.name).trim();
    if (namesMatch) {
      await this.overwriteOriginal(mealId);
      return;
    }
    // Pin as new — require a real name (not empty / "Meal 2").
    const name = (meal.name ?? '').trim();
    if (name === '' || /^meal\s*\d+$/i.test(name)) {
      this.notification.show(
        'Give your meal a real name (not "Meal 2") before saving it to your notebook.',
        'warning',
      );
      return;
    }
    await this.pinMeal(mealId, true);
  }

  /** Overwrite a Binder original in place with a slotted copy's contents — sync
   *  the original's items to the copy's via the per-item endpoints (add / update /
   *  remove), matched by food identity (foodSource:foodId, or name for pending),
   *  then repoint the slot to the original so it holds a real Binder meal (which
   *  is what lets the menu be saved under the all-Binder rule). The source is the
   *  copy's persisted `clonedFromMealId`. */
  private async overwriteOriginal(forkId: number): Promise<void> {
    const sourceId = this.getMeal(forkId)?.clonedFromMealId;
    if (sourceId == null) return;
    try {
      // Pull authoritative items for both sides (the cache may be partial).
      const [fork, source] = await Promise.all([
        firstValueFrom(this.http.get<Meal>(`${this.baseUrl}/meal/${forkId}`)),
        firstValueFrom(this.http.get<Meal>(`${this.baseUrl}/meal/${sourceId}`)),
      ]);
      const key = (it: MealItem): string =>
        it.food ? `${it.food.foodSource}:${it.food.foodId}` : `name:${it.foodName}`;
      const sourceByKey = new Map<string, MealItem>();
      for (const it of source.items ?? []) sourceByKey.set(key(it), it);
      const seen = new Set<string>();
      const calls: Promise<unknown>[] = [];

      for (const f of fork.items ?? []) {
        const k = key(f);
        seen.add(k);
        const s = sourceByKey.get(k);
        if (!s) {
          const body: AddMealItemRequest = {
            foodId: f.food?.foodId ?? null,
            foodSource: (f.food?.foodSource ?? 'pending') as FoodSource,
            foodName: f.foodName,
            itemRole: f.itemRole,
            isTracked: f.isTracked,
            quantity: f.quantity,
            unit: f.unit,
          };
          calls.push(firstValueFrom(this.http.post(`${this.baseUrl}/meal/${sourceId}/items`, body)));
        } else if (s.id != null && (s.quantity !== f.quantity || s.unit !== f.unit)) {
          const body: UpdateMealItemRequest = { quantity: f.quantity, unit: f.unit };
          calls.push(
            firstValueFrom(this.http.put(`${this.baseUrl}/meal/${sourceId}/items/${s.id}`, body)),
          );
        }
      }
      // Remove source items the fork no longer has.
      for (const [k, s] of sourceByKey) {
        if (!seen.has(k) && s.id != null) {
          calls.push(firstValueFrom(this.http.delete(`${this.baseUrl}/meal/${sourceId}/items/${s.id}`)));
        }
      }
      await Promise.all(calls);
      await this.loadMeal(sourceId);
      // Point the slot back at the (now-updated) Binder original and drop the
      // disposable fork link — so the slot holds a real Binder meal, not a
      // one-off. This is also what lets the menu be saved (all-Binder rule).
      const loc = this.editingSlotOf(forkId);
      if (loc != null) {
        await this.replaceSlotMeal(loc.menuId, loc.slotOrder, forkId, sourceId);
        await this.refreshMenu(loc.menuId);
      }
      await this.loadBinder();
      // The fork's food changes now live in the Binder original → disc goes clean.
      this.clearFoodEdited(forkId);
      this.notification.show('notebook meal updated with your changes.', 'success');
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
    // A rename does NOT clone (only composition changes fork) — it's a pure
    // label write on the meal in the slot, even if that meal is a saved/linked
    // Binder meal (the rename then shows in the Binder too, since it's the same
    // meal). Editing foods is what spins off a private copy.
    const menuId = this.editingSlot()?.menuId ?? this.selectedMenuId();
    // Optimistic cache write, applied SYNCHRONOUSLY before any await. When the
    // green save-check is clicked in one gesture, the input's blur commits the
    // rename HERE first, then the click's saveSlottedCopy reads getMeal(mealId).
    // Updating the cached name now means that read sees the NEW name instead of
    // the stale pre-rename one — which otherwise tripped a spurious "give your
    // meal a name" on the FIRST save (it only worked on the second). Reverted in
    // the catch so a failed PUT doesn't leave a phantom name.
    const cached = this.getMeal(mealId);
    if (cached) {
      this.mealsById.update((m) => new Map(m).set(mealId, { ...cached, name: name.trim() }));
    }
    try {
      const body: UpdateMealRequest = { name };
      await firstValueFrom(this.http.put<Meal>(`${this.baseUrl}/meal/${mealId}`, body));
      this.markSessionEdited(mealId);
      if (menuId != null) {
        const menu = await firstValueFrom(
          this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
        );
        this.cacheMenu(menuId, menu);
      }
      await this.loadMeal(mealId);
      // Reflect the new name in the rail (a linked Binder meal shows there).
      await Promise.all([this.loadBinder(), this.loadFolder()]);
    } catch (err) {
      if (cached) this.mealsById.update((m) => new Map(m).set(mealId, cached));
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

  /** Baseline planned days for a NEW menu. The "Menu Repeats" setting is retired —
   *  new menus baseline to 1 (no auto-repeat); the user can still raise/lower it
   *  per menu. (repeatMeals is no longer read from settings.) */
  private repeatBaseline(spanDays: number): number {
    return Math.max(1, Math.min(spanDays, 1));
  }

  /** The "Menu-Days" preference (regiMenu.menuDays) — how many Menus/days a new
   *  rotation spans. Clamped to the API's 2–10 range; defaults to 7. */
  private menuDaysSetting(): number {
    const raw = this.settingsService.allSettings()?.regiMenu?.menuDays ?? 7;
    return Math.max(2, Math.min(10, Math.floor(raw)));
  }

  /** Apply a new Menu-Days value to the ACTIVE rotation's span. PATCH
   *  /rotation/{id} { spanDays } and reload so the "n / span days" badge and any
   *  per-menu plannedCount clamps update live. No-op when no rotation is loaded
   *  (the value still persists as a preference for the next rotation build). */
  async setRotationSpanDays(days: number): Promise<void> {
    const rot = this.rotation();
    if (!rot?.id) return;
    const spanDays = Math.max(2, Math.min(10, Math.floor(days)));
    if (spanDays === rot.spanDays) return;
    const body: UpdateRotationRequest = { spanDays };
    try {
      // API registers PUT (partial update) for /rotation/{id} — NOT PATCH.
      await firstValueFrom(
        this.http.put(`${this.baseUrl}/rotation/${rot.id}`, body),
      );
      const detail = await firstValueFrom(
        this.http.get<RotationDetail>(`${this.baseUrl}/rotation/${rot.id}`),
      );
      this.rotation.set(detail);
    } catch (err) {
      this.error.set(this.errMessage(err));
    }
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
   *    DELETE /api/meal/{id}  — the server force-detaches it from any menu slots,
   *  so this always deletes; a 409 is a different case (e.g. sold in a meal set).
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
   *    DELETE /api/meal/{id}  — the server force-detaches it from every menu slot,
   *  so this always deletes (no local slot-membership pre-check); a 409 is a
   *  different case (e.g. sold in a meal set).
   *  When deleteRecipe is true, the server also removes the imported recipe + its
   *  PDF the meal was created from (DELETE /api/meal/{id}?deleteRecipe=true). The
   *  meal delete reports success even if that cleanup partially failed — we don't
   *  surface partial-failure states. Reload the Binder after. */
  async deleteBinderMeal(mealId: number, deleteRecipe = false): Promise<void> {
    const url = deleteRecipe
      ? `${this.baseUrl}/meal/${mealId}?deleteRecipe=true`
      : `${this.baseUrl}/meal/${mealId}`;
    try {
      await firstValueFrom(this.http.delete(url));
      await this.loadBinder();
      // Deleting a binder meal cascade-removes it from any slot server-side —
      // refresh the board so its (now-empty) slots update instead of leaving a
      // stale tile that would 404 on a later "Clear".
      await this.refreshSelectedMenu();
    } catch (err) {
      this.notification.show(this.deleteErrMessage(err), 'error');
    }
  }

  /** Replace one meal in binderMeals + the mealsById cache with a fresh copy,
   *  immutably (the 200 body from restore/detach is the refresh — no reload). */
  private replaceBinderMeal(meal: Meal): void {
    if (meal.id == null) return;
    const id = meal.id;
    this.binderMeals.update((list) => list.map((m) => (m.id === id ? meal : m)));
    this.mealsById.update((m) => new Map(m).set(id, meal));
  }

  /** Restore a set-materialized meal to its MealSet original (discards the user's
   *  edits). POST /meal/{id}/restore → the restored Meal (with items). 409 when
   *  the meal isn't from a set. */
  async restoreMeal(mealId: number): Promise<void> {
    try {
      const meal = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal/${mealId}/restore`, null),
      );
      this.replaceBinderMeal(meal);
      this.notification.show('Restored to original.', 'success');
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.notification.show("This meal isn't from a MealSet.", 'error');
        return;
      }
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Detach a set-materialized meal from its MealSet — it becomes an ordinary
   *  owned meal (nulls sourceMealSetId/Name, so the badge + Restore disappear).
   *  POST /meal/{id}/detach → the updated Meal. 409 when already detached. */
  async detachMeal(mealId: number): Promise<void> {
    try {
      const meal = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal/${mealId}/detach`, null),
      );
      this.replaceBinderMeal(meal);
      this.notification.show('Detached from set.', 'success');
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.notification.show('This meal is already detached.', 'error');
        return;
      }
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Wipe every binder meal the caller materialized from a MealSet.
   *    POST /api/mealset/{setId}/wipe-from-binder → { deletedCount }
   *  Placements clear + edits are lost, but ownership is untouched (the set stays
   *  re-downloadable). On 200, drop those meals from binderMeals + the cache
   *  (immutable); 404 = the caller has no purchase for the set. */
  async wipeMealSet(setId: number): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.post<WipeFromBinderResponse>(`${this.baseUrl}/mealset/${setId}/wipe-from-binder`, null),
      );
      this.binderMeals.update((list) => list.filter((m) => m.sourceMealSetId !== setId));
      this.mealsById.update((m) => {
        const next = new Map(m);
        for (const [id, meal] of next) if (meal.sourceMealSetId === setId) next.delete(id);
        return next;
      });
      const n = res?.deletedCount ?? 0;
      this.notification.show(
        `${n} meals removed. Re-download anytime from the MealSets marketplace.`,
        'success',
      );
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.notification.show('You have no purchase for this MealSet.', 'error');
        return;
      }
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Clear a menu from the board (the menu-tile trash). This UNLINKS it from the
   *  rotation — removing it (and its meal slots) from the week's plan — but does
   *  NOT touch the Binder: a PINNED/saved menu (and its meals) survives there.
   *  Only a DISPOSABLE (unpinned) menu is additionally hard-deleted, since it
   *  isn't saved anywhere and would otherwise orphan. Reload after. */
  async deleteMenu(menuId: number): Promise<void> {
    const rot = this.rotation();
    const pinned = this.menus().find((m) => m.menuId === menuId)?.pinned === true;
    try {
      // Always unlink from the rotation (clears the menu + its meal slots off the
      // board). The server's DELETE /menu/{id} would trip the RotationMenus FK, so
      // this must come first regardless.
      if (rot?.id != null) {
        await firstValueFrom(
          this.http.delete(`${this.baseUrl}/rotation/${rot.id}/menus/${menuId}`),
        ).catch(() => undefined); // ignore: menu may not be linked
      }
      // Hard-delete ONLY a disposable (unpinned) menu. A pinned menu is saved in
      // the Binder — clearing it from the plan must NOT delete it there.
      if (!pinned) {
        await firstValueFrom(this.http.delete(`${this.baseUrl}/menu/${menuId}`));
      }
      await Promise.all([this.loadCurrentRotation(), this.loadBinder(), this.loadBinderMenus()]);
    } catch (err) {
      this.notification.show(this.deleteErrMessage(err), 'error');
    }
  }

  /** Delete a Binder menu. When deleteMeals is true (the "Delete Menu and all
   *  saved meals?" mini-wipe), delete every meal the menu holds FIRST — the
   *  server's meal delete has no in-use gate, so it detaches the meal from every
   *  menu and deletes it, avoiding any ordering/FK problem — then unlink the menu
   *  from the rotation (FK) and delete the now-empty menu. Slot ids are read from
   *  a FRESH menu fetch (the Binder snapshot can be stale). */
  async deleteBinderMenu(menuId: number, deleteMeals: boolean): Promise<void> {
    const rot = this.rotation();
    try {
      if (deleteMeals) {
        const detail = await firstValueFrom(
          this.http.get<Menu>(`${this.baseUrl}/menu/${menuId}`),
        );
        const mealIds = (detail.slots ?? []).flatMap((s) => (s.meals ?? []).map((m) => m.mealId));
        // Surface failures (no allSettled) so a stuck delete isn't silent.
        await Promise.all(
          mealIds.map((id) => firstValueFrom(this.http.delete(`${this.baseUrl}/meal/${id}`))),
        );
      }
      // Unlink from the rotation first so the raw Menu delete doesn't trip the
      // RotationMenus foreign key, then delete the (now empty) menu.
      if (rot?.id != null) {
        await firstValueFrom(
          this.http.delete(`${this.baseUrl}/rotation/${rot.id}/menus/${menuId}`),
        ).catch(() => undefined);
      }
      await firstValueFrom(this.http.delete(`${this.baseUrl}/menu/${menuId}`));
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
        if ((slot.meals?.length ?? 0) > 0) {
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
      await Promise.all([this.loadFolder(), this.loadBinder(), this.loadBinderMenus()]);
      // Stand a fresh empty plan back up immediately (empty slots), so the user
      // lands on a usable board rather than a "Start a plan" prompt.
      await this.startEmptyPlan();
    } catch (err) {
      this.notification.show(this.errMessage(err), 'error');
    }
  }

  /** Surface a useful message from an HttpErrorResponse. */
  private errMessage(err: unknown): string {
    const e = err as { error?: { error?: string }; statusText?: string };
    const serverMsg = e?.error?.error;
    if (typeof serverMsg === 'string' && serverMsg) return serverMsg;
    // A 2xx whose body didn't yield a server error (interrupted/empty response)
    // surfaces as statusText "OK" — that's noise, not a message, so skip it.
    const status = e?.statusText;
    if (status && status !== 'OK') return status;
    return 'Request failed';
  }

  /** Delete-specific message. The server force-detaches a meal from every menu slot
   *  on delete, so a 409 is NOT a "still slotted in a menu" case (that copy was a
   *  false positive, shown even with zero menus). A real 409 is a different reason —
   *  e.g. the meal is sold in a purchased meal set — so surface the API's ACTUAL
   *  message rather than hard-coding menu copy. */
  private deleteErrMessage(err: unknown): string {
    const e = err as { status?: number; error?: unknown };
    if (e?.status === 409) {
      const body = e.error;
      const msg = typeof body === 'string' ? body : (body as { error?: string })?.error;
      return typeof msg === 'string' && msg.trim() ? msg : 'This meal can’t be deleted.';
    }
    return this.errMessage(err);
  }
}
