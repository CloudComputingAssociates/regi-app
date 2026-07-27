// src/app/models/menu-slot-compat.ts
//
// Single-meal COMPAT shim. The API moved a menu slot from a single `mealId` to
// `meals[]` (0–4 stacked meals). The board is still single-meal, so
// RotationService fills these mirror fields from `meals[0]` at cache time and the
// existing `slot.mealId` / `slot.mealName` / `slot.mealType` reads keep working.
// Remove this augmentation once the quartered multi-meal UI reads `meals[]`
// directly. See [[project-multimeal-slots]].
export {};

declare module './generated/rotation.schema' {
  interface MenuSlot {
    /** Client-derived mirror of meals[0].mealId (single-meal compat). */
    mealId?: number | null;
    /** Client-derived mirror of meals[0].mealName. */
    mealName?: string | null;
    /** Client-derived mirror of meals[0].mealType. */
    mealType?: string | null;
  }
}
