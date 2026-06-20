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
