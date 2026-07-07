// src/app/models/picks-hydration.ts
//
// Shared hydration for the user's server-persisted Food Picks. Both the Foods
// panel (This Week baskets) and the menus food-lookaside turn the raw
// CurrentPick[] on UserSettings into per-basket Food objects the same way, so
// the mapping lives here once rather than being copied per component.
import { Food } from './food.model';
import { CurrentPick } from './settings.models';

export type BasketKey = 'Proteins' | 'Fats' | 'Carbs' | 'Other';
export const BASKET_KEYS: readonly BasketKey[] = ['Proteins', 'Fats', 'Carbs', 'Other'];

export type ThisWeekBaskets = Record<BasketKey, Food[]>;

export function emptyBaskets(): ThisWeekBaskets {
  return { Proteins: [], Fats: [], Carbs: [], Other: [] };
}

/** Result of hydrating picks: the four baskets, the picks that matched a food
 *  in the allowed set (`kept`), and the picks whose food is no longer in the
 *  allowed set (`dropped` — stale references the caller may choose to prune). */
export interface HydratedPicks {
  baskets: ThisWeekBaskets;
  kept: CurrentPick[];
  dropped: CurrentPick[];
}

/** Turn server-persisted currentPicks into per-basket Food objects, using the
 *  user's full allowed-foods list as the lookup. Matching is on the
 *  (foodId, foodSource) composite key, with a missing foodSource normalized to
 *  'food'. Each hydrated Food is stamped with pickAddedAt / pickServingSize /
 *  mealRole from its pick. Entries within a basket are ordered by addedAt
 *  ascending. Pure — no I/O, no side effects. */
export function hydratePicks(picks: CurrentPick[], allowedFull: Food[]): HydratedPicks {
  const lookup = new Map<string, Food>();
  for (const f of allowedFull) {
    lookup.set(`${f.id}:${f.foodSource ?? 'food'}`, f);
  }
  const baskets = emptyBaskets();
  const kept: CurrentPick[] = [];
  const dropped: CurrentPick[] = [];
  for (const p of picks) {
    const food = lookup.get(`${p.foodId}:${p.foodSource ?? 'food'}`);
    if (!food) {
      dropped.push(p);
      continue;
    }
    baskets[p.basketKey].push({
      ...food,
      pickAddedAt: p.addedAt,
      pickServingSize: p.pickServingSize,
      mealRole: p.mealRole ?? 'AnyUse',
    });
    kept.push(p);
  }
  // Order entries within each basket by addedAt ascending so the visual stack
  // matches the order foods were originally added.
  for (const k of BASKET_KEYS) {
    baskets[k].sort((a, b) => (a.pickAddedAt ?? '').localeCompare(b.pickAddedAt ?? ''));
  }
  return { baskets, kept, dropped };
}
