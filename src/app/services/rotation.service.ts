// PHASE 0 MOCK — internals replaced with HttpClient in Phase 2; the public surface is final.
//
// RotationService is the rename target for the old planning surface. It owns
// the currently-staged Rotation, its Menus (each a set of slots), and the
// Meals attached to those slots. The menus-panel reads everything from here;
// the macros bar reads selectedMenuTotals for the "menu" context.
import { Injectable, computed, signal } from '@angular/core';
import { Meal, MealItem, Menu, MenuSlot, RotationDetail } from '../models';

/** Aggregate macro totals for a menu (grams; calories derived). */
export interface MenuTotals {
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
  calories: number;
}

/** slotOrder → display label (1→A, 2→B, … 10→J). */
function slotLabel(slotOrder: number): string {
  return String.fromCharCode(64 + slotOrder); // 1→'A'
}

@Injectable({ providedIn: 'root' })
export class RotationService {
  // ---- Header + menu entries -------------------------------------------
  readonly rotation = signal<RotationDetail>({
    id: 1,
    name: 'My Rotation',
    spanDays: 7,
    peopleCount: 2,
    status: 'staged',
    isFavorite: false,
    menus: [
      { menuId: 1, menuName: 'Menu A', plannedCount: 3, consumedCount: 0 },
      { menuId: 2, menuName: 'Menu B', plannedCount: 2, consumedCount: 0 },
      { menuId: 3, menuName: 'Menu C', plannedCount: 2, consumedCount: 0 },
    ],
  });

  /** Full menus, keyed by menuId. Slots resolve their meals from `meals`. */
  private readonly menus = new Map<number, Menu>(buildMenus());
  /** Full meals, keyed by mealId. */
  private readonly meals = new Map<number, Meal>(buildMeals());

  // ---- Selection -------------------------------------------------------
  readonly selectedMenuId = signal<number>(1);

  readonly selectedMenu = computed<Menu | undefined>(() =>
    this.menus.get(this.selectedMenuId()),
  );

  selectMenu(id: number): void {
    this.selectedMenuId.set(id);
  }

  // ---- Lookups ---------------------------------------------------------
  getMeal(mealId: number): Meal | undefined {
    return this.meals.get(mealId);
  }

  slotItems(mealId: number | null | undefined): MealItem[] {
    if (mealId == null) return [];
    return this.meals.get(mealId)?.items ?? [];
  }

  // ---- Totals for the macros bar --------------------------------------
  readonly selectedMenuTotals = computed<MenuTotals>(() => {
    const menu = this.selectedMenu();
    const totals: MenuTotals = { proteinG: 0, fatG: 0, carbG: 0, fiberG: 0, calories: 0 };
    if (!menu) return totals;
    for (const slot of menu.slots) {
      for (const item of this.slotItems(slot.mealId)) {
        totals.proteinG += item.proteinG ?? 0;
        totals.fatG += item.fatG ?? 0;
        totals.carbG += item.carbG ?? 0;
        totals.fiberG += item.fiberG ?? 0;
      }
    }
    totals.calories = Math.round(4 * totals.proteinG + 4 * totals.carbG + 9 * totals.fatG);
    return totals;
  });

  // ---- Error surface (stands in for any old planning-error consumer) ---
  readonly error = signal<string | null>(null);
}

// ----------------------------------------------------------------------
// Mock seed data
// ----------------------------------------------------------------------

/** Fill the required Meal fields once so seeds stay terse. */
function mkMeal(id: number, name: string, items: MealItem[]): Meal {
  const seq = id;
  return {
    id,
    name,
    mealType: 'meal',
    mealSeqNum: seq,
    isRegiApproved: false,
    isFavorite: false,
    isSaved: true,
    status: 'active',
    servings: 1,
    shareCandidate: false,
    shareApproved: false,
    createdAt: '2026-06-30T00:00:00Z',
    updatedAt: '2026-06-30T00:00:00Z',
    items,
  };
}

/** Build a tracked food item. */
function mkItem(
  foodId: number,
  foodName: string,
  quantity: number,
  unit: string,
  m: { proteinG?: number; fatG?: number; carbG?: number; fiberG?: number },
  sortOrder: number,
): MealItem {
  return {
    foodId,
    foodName,
    foodSource: 'food',
    itemRole: sortOrder === 0 ? 'primary' : 'side',
    isTracked: true,
    quantity,
    unit,
    proteinG: m.proteinG ?? 0,
    fatG: m.fatG ?? 0,
    carbG: m.carbG ?? 0,
    fiberG: m.fiberG ?? 0,
    sortOrder,
  };
}

function buildMeals(): [number, Meal][] {
  const meals: Meal[] = [
    // ---- Menu A meals ----
    mkMeal(1, 'Chicken & Rice', [
      mkItem(101, 'Chicken thighs', 6, 'oz', { proteinG: 42, fatG: 2 }, 0),
      mkItem(102, 'Brown rice', 0.5, 'cup', { proteinG: 3, carbG: 18, fiberG: 5 }, 1),
      mkItem(103, 'Olive oil', 1, 'tbsp', { fatG: 3 }, 2),
    ]),
    mkMeal(2, 'Tuna & Cucumber', [
      mkItem(104, 'Tuna', 5, 'oz', { proteinG: 35, fatG: 8 }, 0),
      mkItem(105, 'Cucumber', 1, 'cup', { proteinG: 3, fatG: 2, carbG: 8 }, 1),
    ]),
    mkMeal(3, 'Yogurt & Berries', [
      mkItem(106, 'Greek yogurt', 1, 'serving', { proteinG: 17, carbG: 10 }, 0),
      mkItem(107, 'Blueberries', 0.5, 'cup', { proteinG: 1, carbG: 12, fiberG: 3 }, 1),
    ]),
    // ---- Menu B meals ----
    mkMeal(4, 'Salmon & Quinoa', [
      mkItem(108, 'Salmon', 6, 'oz', { proteinG: 40, fatG: 18 }, 0),
      mkItem(109, 'Quinoa', 0.75, 'cup', { proteinG: 6, fatG: 3, carbG: 30, fiberG: 5 }, 1),
    ]),
    mkMeal(5, 'Egg Scramble', [
      mkItem(110, 'Eggs', 3, 'large', { proteinG: 18, fatG: 15, carbG: 2 }, 0),
      mkItem(111, 'Spinach', 1, 'cup', { proteinG: 1, carbG: 1, fiberG: 1 }, 1),
    ]),
    mkMeal(6, 'Protein Shake', [
      mkItem(112, 'Whey protein', 1, 'scoop', { proteinG: 24, fatG: 1, carbG: 3 }, 0),
      mkItem(113, 'Banana', 1, 'medium', { proteinG: 1, carbG: 27, fiberG: 3 }, 1),
    ]),
    // ---- Menu C meals ----
    mkMeal(7, 'Turkey & Sweet Potato', [
      mkItem(114, 'Ground turkey', 5, 'oz', { proteinG: 35, fatG: 11 }, 0),
      mkItem(115, 'Sweet potato', 1, 'cup', { proteinG: 2, carbG: 27, fiberG: 4 }, 1),
    ]),
    mkMeal(8, 'Cottage Cheese Bowl', [
      mkItem(116, 'Cottage cheese', 1, 'cup', { proteinG: 28, fatG: 5, carbG: 8 }, 0),
      mkItem(117, 'Pineapple', 0.5, 'cup', { carbG: 11, fiberG: 1 }, 1),
    ]),
  ];
  return meals.map((m) => [m.id, m]);
}

/** Build a slot, computing slotLabel from slotOrder. */
function mkSlot(
  slotOrder: number,
  meal: Meal | null,
  opts: { isDiningOut?: boolean } = {},
): MenuSlot {
  return {
    slotOrder,
    slotLabel: slotLabel(slotOrder),
    slotName: null,
    mealId: meal?.id ?? null,
    mealName: meal?.name ?? null,
    mealType: meal?.mealType ?? null,
    isDiningOut: opts.isDiningOut ?? false,
  };
}

function mkMenu(id: number, name: string, slots: MenuSlot[]): Menu {
  return {
    id,
    name,
    slotCount: slots.length,
    isYeh: false,
    isFavorite: false,
    isSaved: true,
    slots,
  };
}

function buildMenus(): [number, Menu][] {
  // Reference seeded meals by id (mealName is denormalized onto the slot).
  const ref = (id: number, name: string, mealType: 'meal' | 'snack' = 'meal'): Meal =>
    ({ id, name, mealType } as Meal);

  const menuA = mkMenu(1, 'Menu A', [
    mkSlot(1, ref(1, 'Chicken & Rice')),
    mkSlot(2, ref(2, 'Tuna & Cucumber')),
    mkSlot(3, ref(3, 'Yogurt & Berries')),
    mkSlot(4, null), // empty slot
  ]);

  const menuB = mkMenu(2, 'Menu B', [
    mkSlot(1, ref(4, 'Salmon & Quinoa')),
    mkSlot(2, ref(5, 'Egg Scramble')),
    mkSlot(3, ref(6, 'Protein Shake')),
  ]);

  const menuC = mkMenu(3, 'Menu C', [
    mkSlot(1, ref(7, 'Turkey & Sweet Potato')),
    mkSlot(2, ref(8, 'Cottage Cheese Bowl')),
    mkSlot(3, null, { isDiningOut: true }), // dining out
  ]);

  return [menuA, menuB, menuC].map((m) => [m.id!, m]);
}
