// src/app/models/serving-geometry.model.ts
//
// Serving-geometry PATCH wire DTOs — HAND-MAINTAINED. Transcribed field-for-field
// from regi-api/models/generated/food.schema.go (ServingGeometryPatchRequest /
// ServingGeometryPatchResponse). There is NO schemas/*.json for this surface —
// the Go struct is itself hand-maintained — so this mirrors it directly, the same
// precedent as fatsecret.model.ts.
//
// PATCH /api/foods/serving-geometry sets the three-level portion model for a food.
// When foodSource !== 'userfood' the target Food is cloned to a UserFoods row
// first, then edited (so the caller's own copy carries the geometry).

/** Body of PATCH /api/foods/serving-geometry. */
export interface ServingGeometryPatchRequest {
  /** Target food id (Foods.FoodID or UserFoods.UserFoodID). */
  foodId: number;
  /** 'food' (system, will be cloned) | 'userfood' (edited in place). */
  foodSource: 'food' | 'userfood';
  /** Unit being set/taught. Weight units (g/oz/lb) are rejected — intrinsic. */
  unitName: string;
  /** Grams per one unit; must be > 0 and < 5000. */
  gramsPerUnit: number;
  /** Optional default portion quantity for the primary unit (UserFoods.ServingSize). */
  defaultQuantity?: number;
}

/** Result of a serving-geometry PATCH. */
export interface ServingGeometryPatchResponse {
  /** The UserFoods row that now carries the geometry (the clone's id for a system food). */
  userFoodId: number;
  /** True when a system Food was cloned to satisfy the edit. */
  cloned: boolean;
  /** 'primary' (base geometry set) | 'taught' (additional unit added). */
  action: string;
}
