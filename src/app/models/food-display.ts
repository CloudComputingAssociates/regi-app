// src/app/models/food-display.ts
// Display-math helpers for foods. Internal nutrition values are stored
// per-100g; everything that renders a Nutrition Facts label has to convert
// that baseline into the user-facing serving the food row carries.
import type { Food } from './food.model';

/**
 * Scale factor for the `<regi-nutrition-label>` component. Per-100g macros
 * are multiplied by this scale to land at displayed-serving values.
 *
 *     scale = (servingSize × servingGramsPerUnit) / 100
 *
 * Do NOT use `Food.servingSizeMultiplicand` here. The multiplicand is the
 * ingest-time normalization factor — what we divided the source serving by
 * to land at per-100g internal storage. It's historical and never updates
 * when the user later edits servingSize / servingUnit / servingGramsPerUnit
 * in the admin tool. Relying on it drifted the label out of sync with the
 * food row (kiwi: admin showed "1 whole / 80g / 49 cal", the label still
 * showed "1 oz / 28g / 17 cal" because multiplicand stayed at 0.28).
 *
 * @param food      The food whose label is being rendered.
 * @param quantity  Optional override for the displayed quantity (e.g. a
 *                  user's draft inside an edit popup). Falls back to
 *                  `food.servingSize`, then 1.
 * @returns The multiplier to apply to each per-100g macro. Falls back to 1
 *          when `servingGramsPerUnit` is missing so the label degrades to a
 *          per-100g view rather than collapsing to zero.
 */
export function nutritionLabelScale(
  food: Pick<Food, 'servingSize' | 'servingGramsPerUnit'> | null | undefined,
  quantity?: number | null,
): number {
  if (!food) return 1;
  const qty = quantity ?? food.servingSize ?? 1;
  const gpu = food.servingGramsPerUnit ?? 0;
  if (gpu <= 0) return 1;
  return (qty * gpu) / 100;
}

/**
 * Curated ladder of "sensible" serving sizes, used by the ▲ / ▼ steppers in
 * every Nutrition Facts serving editor (foods-panel picks/MyFoods, and the
 * menus per-item quantity popup). Off-ladder values snap to the next rung in
 * the direction pressed — never force-snapped on display, only on click. The
 * ladder is unit-agnostic by design: users think "next bigger / smaller
 * portion", not "delta of N grams".
 */
export const SERVING_SIZE_LADDER: readonly number[] = [
  0.25, 0.5, 0.75,
  1, 1.25, 1.5, 1.75,
  2, 2.5, 3, 3.5,
  4, 5, 6, 8, 10, 12, 15, 20,
];

/**
 * Ladder-snap a serving value in the pressed direction:
 *   up   = smallest ladder rung strictly greater than `current`
 *   down = largest ladder rung strictly less than `current`
 * Returns undefined when already at (or past) the top/bottom of the ladder.
 */
export function snapServing(current: number, direction: 'up' | 'down'): number | undefined {
  if (direction === 'up') {
    return SERVING_SIZE_LADDER.find((v) => v > current);
  }
  for (let i = SERVING_SIZE_LADDER.length - 1; i >= 0; i--) {
    if (SERVING_SIZE_LADDER[i] < current) return SERVING_SIZE_LADDER[i];
  }
  return undefined;
}

/** Coarse ladder for gram amounts — stepping a 500g serving by 0.25g is absurd. */
const GRAM_LADDER: readonly number[] = [
  5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000,
];
/** Whole-number ladder for countable units ("each"): 1, 2, 3 … */
const COUNT_LADDER: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];

/** The stepper ladder appropriate for a UNIT. Grams step coarsely, countable
 *  units step by wholes, and everything else (oz/lb/kg/cup/tbsp/tsp) uses the
 *  fine fractional ladder. */
function ladderForUnit(unit: string | null | undefined): readonly number[] {
  const u = (unit ?? '').toLowerCase().trim();
  if (u === 'g' || u === 'gram' || u === 'grams' || u === 'mg') return GRAM_LADDER;
  if (['each', 'whole', 'piece', 'pieces', 'slice', 'slices', 'egg', 'eggs', 'count'].includes(u)) {
    return COUNT_LADDER;
  }
  return SERVING_SIZE_LADDER;
}

/** Ladder-snap in the pressed direction, using the ladder that fits `unit` so the
 *  steppers move in sensible increments for the current units. */
export function snapServingForUnit(
  current: number,
  direction: 'up' | 'down',
  unit: string | null | undefined,
): number | undefined {
  const ladder = ladderForUnit(unit);
  if (direction === 'up') return ladder.find((v) => v > current);
  for (let i = ladder.length - 1; i >= 0; i--) {
    if (ladder[i] < current) return ladder[i];
  }
  return undefined;
}

/** Units offered in the inline Nutrition-Facts unit editor. Weight units convert
 *  deterministically off {@link WEIGHT_UNIT_GRAMS}; the rest are food-specific
 *  (grams come from the food's own data or the AI grams-per-unit prompt). Shared
 *  by every context that mounts the editor (MyFoods baseline + menus per-item). */
export const NF_UNIT_CHOICES: readonly string[] = ['g', 'oz', 'lb', 'cup', 'tbsp', 'tsp', 'each'];

/** Grams in ONE of each weight unit — deterministic and food-independent. */
export const WEIGHT_UNIT_GRAMS: Readonly<Record<string, number>> = {
  g: 1, gram: 1, grams: 1, mg: 0.001, kg: 1000, oz: 28.3495, lb: 453.592,
};

/** Deterministic grams-per-unit for a WEIGHT unit, else null (food-specific unit
 *  whose grams must come from the food's data or the AI). */
export function massGramsForUnit(unit: string | null | undefined): number | null {
  const g = WEIGHT_UNIT_GRAMS[(unit ?? '').toLowerCase().trim()];
  return g != null ? g : null;
}

/** The unit dropdown options for a food: the standard set, plus the food's own
 *  current unit if it isn't already in it (so the current value is selectable). */
export function nfUnitOptions(currentUnit: string | null | undefined): string[] {
  const cur = (currentUnit || 'g').toLowerCase().trim();
  const base = [...NF_UNIT_CHOICES];
  return base.includes(cur) ? base : [cur, ...base];
}

/** Parse a `{ gramsPerUnit, confidence }` object from an LLM response, tolerating
 *  stray prose / code fences around the JSON. */
export function parseGramsPerUnit(text: string): { gramsPerUnit?: number; confidence?: string } | null {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* give up */ } }
  return null;
}
