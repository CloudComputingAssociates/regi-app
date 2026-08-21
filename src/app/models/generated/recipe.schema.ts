/* eslint-disable */
/**
 * Recipe Authoring Schema — HAND-MAINTAINED (no generator).
 * Transcribed field-for-field from regi-api schemas/recipe.schema.json.
 * The authored/imported Recipe entity (dbo.Recipes), its ingredient lines
 * (dbo.RecipeIngredients), the authoring CRUD payloads, and the CookingMethods
 * vocabulary. DB columns Instructions→directions, RecipeImageLink→heroImageLink.
 */

/**
 * Provenance of the recipe. 'imported' = built by the PDF import pipeline
 * (default). 'authored' = hand-written in the authoring subsystem.
 */
export type RecipeType = "imported" | "authored";

/** food | userfood | pending — a resolved ingredient's food linkage. */
export type RecipeIngredientFoodSource = "food" | "userfood" | "pending";

/**
 * A row in dbo.Recipes — imported or authored.
 */
export interface Recipe {
  recipeId: number;
  /** Owner; null for admin/catalog recipes */
  userId?: number | null;
  title: string;
  /** Editorial header line under the title. Free text — NEVER a genre/category. */
  tagline?: string | null;
  /** Free-flow Directions (DB Instructions). PLAIN TEXT; '\n' preserved verbatim. */
  directions?: string | null;
  /** Optional free-flow tips/notes. PLAIN TEXT; '\n' preserved verbatim. */
  tips?: string | null;
  /** Optional yield note, e.g. 'Makes 12 muffins' */
  yieldNote?: string | null;
  /** Servings the base ingredient quantities yield */
  servingsBase?: number | null;
  prepTimeMin?: number | null;
  cookTimeMin?: number | null;
  recipeType: RecipeType;
  /** REGI-approved catalog flag. Admin-owned; read-only here. */
  isRegiApproved: boolean;
  /** Author has published the recipe (visible beyond the author) */
  isPublished: boolean;
  /** Recipe is free vs. gated by entitlement */
  isFree: boolean;
  /** Author-archived (soft-hidden); ownership/data retained */
  isArchived: boolean;
  /** Hero image CDN URL (DB RecipeImageLink) */
  heroImageLink?: string | null;
  /** Rendered/imported recipe PDF CDN URL. Server-owned; read-only. */
  recipePdfLink?: string | null;
  attributionAuthor?: string | null;
  attributionLink?: string | null;
  /** Author-entered per-serving fallback calories */
  summaryCal?: number | null;
  summaryProteinG?: number | null;
  summaryFiberG?: number | null;
  summaryFatG?: number | null;
  summaryCarbG?: number | null;
  /** When the recipe PDF was last rendered; null if never. Server-owned. */
  pdfRenderedUtc?: string | null;
  createdAt: string;
  updatedAt: string;
  [k: string]: unknown;
}

/**
 * One line in dbo.RecipeIngredients. quantity/unit are normalized numerics;
 * displayQuantity is the as-written string, rendered verbatim.
 */
export interface RecipeIngredient {
  recipeIngredientId: number;
  recipeId: number;
  ingredientName: string;
  /** Normalized numeric quantity; null when unparseable/absent */
  quantity?: number | null;
  /** Normalized unit; null when absent */
  unit?: string | null;
  /** As-written quantity string, e.g. '1½ cups' — never recomputed */
  displayQuantity?: string | null;
  /** Parenthetical note, e.g. '(finely chopped)' */
  note?: string | null;
  foodId?: number | null;
  foodSource: RecipeIngredientFoodSource;
  dynamicIngredient: boolean;
  sortOrder: number;
  [k: string]: unknown;
}

/**
 * POST (authoring) create. Author-writable header fields only; recipeType is
 * stamped 'authored' server-side. Ingredient lines are managed via their own
 * endpoints, not embedded here.
 */
export interface CreateRecipeRequest {
  title: string;
  tagline?: string | null;
  /** PLAIN TEXT; '\n' preserved verbatim. Required for an authored recipe. */
  directions?: string | null;
  tips?: string | null;
  yieldNote?: string | null;
  servingsBase?: number | null;
  prepTimeMin?: number | null;
  cookTimeMin?: number | null;
  /** Admin-only catalog flag; ignored for author self-serve creates */
  isRegiApproved?: boolean | null;
  isPublished?: boolean | null;
  isFree?: boolean | null;
  heroImageLink?: string | null;
  attributionAuthor?: string | null;
  attributionLink?: string | null;
  summaryCal?: number | null;
  summaryProteinG?: number | null;
  summaryFiberG?: number | null;
  summaryFatG?: number | null;
  summaryCarbG?: number | null;
  [k: string]: unknown;
}

/**
 * PATCH (authoring) update. All fields optional; only provided fields update.
 * isArchived is togglable here (archive/unarchive).
 */
export interface UpdateRecipeRequest {
  title?: string | null;
  tagline?: string | null;
  directions?: string | null;
  tips?: string | null;
  yieldNote?: string | null;
  servingsBase?: number | null;
  prepTimeMin?: number | null;
  cookTimeMin?: number | null;
  isRegiApproved?: boolean | null;
  isPublished?: boolean | null;
  isFree?: boolean | null;
  isArchived?: boolean | null;
  heroImageLink?: string | null;
  attributionAuthor?: string | null;
  attributionLink?: string | null;
  summaryCal?: number | null;
  summaryProteinG?: number | null;
  summaryFiberG?: number | null;
  summaryFatG?: number | null;
  summaryCarbG?: number | null;
  [k: string]: unknown;
}

/** Single-recipe read: the header plus its ordered ingredient lines. */
export interface RecipeResponse {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  [k: string]: unknown;
}

/**
 * POST .../ingredient — appends one line. recipeIngredientId/recipeId are
 * server-owned; sortOrder is server-assigned (appended to the end).
 */
export interface CreateRecipeIngredientRequest {
  ingredientName: string;
  quantity?: number | null;
  unit?: string | null;
  displayQuantity?: string | null;
  note?: string | null;
  foodId?: number | null;
  /** food | userfood | pending (defaults pending) */
  foodSource?: RecipeIngredientFoodSource | null;
  dynamicIngredient?: boolean | null;
  [k: string]: unknown;
}

/**
 * PATCH .../ingredient/{iid} — all fields optional; only provided fields update.
 * sortOrder is changed only via ingredient-order.
 */
export interface UpdateRecipeIngredientRequest {
  ingredientName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  displayQuantity?: string | null;
  note?: string | null;
  foodId?: number | null;
  foodSource?: RecipeIngredientFoodSource | null;
  dynamicIngredient?: boolean | null;
  [k: string]: unknown;
}

/**
 * PUT .../ingredient-order — the recipe's ingredient ids in the new display
 * order. Must be exactly the recipe's current line ids (any permutation).
 */
export interface ReorderIngredientsRequest {
  ingredientIds: number[];
  [k: string]: unknown;
}

/** Lightweight recipe row for list views. */
export interface RecipeSummary {
  id: number;
  title: string;
  recipeType: RecipeType;
  isPublished: boolean;
  isFree: boolean;
  isArchived: boolean;
  updatedAt: string;
  heroImageLink?: string | null;
  [k: string]: unknown;
}

/** List of recipe summaries. */
export interface ListRecipesResponse {
  recipes: RecipeSummary[];
  [k: string]: unknown;
}

/** A row in dbo.CookingMethods — the vocabulary a Meal may reference. */
export interface CookingMethod {
  id: number;
  name: string;
  sortOrder: number;
  [k: string]: unknown;
}

/** Active cooking methods for pickers, in SortOrder. */
export interface ListCookingMethodsResponse {
  cookingMethods: CookingMethod[];
  [k: string]: unknown;
}
