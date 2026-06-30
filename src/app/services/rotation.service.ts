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
import { Meal, MealItem, Menu, Rotation, RotationDetail } from '../models';
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
          plannedCount: 7,
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

  /** Surface a useful message from an HttpErrorResponse. */
  private errMessage(err: unknown): string {
    const e = err as { error?: { error?: string }; statusText?: string };
    return e?.error?.error ?? e?.statusText ?? 'Request failed';
  }
}
