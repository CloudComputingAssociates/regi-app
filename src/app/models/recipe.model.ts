// src/app/models/recipe.model.ts
//
// Hand-transcribed from the regi-api recipe wire shape (this project keeps a
// generator for the schema-fed models but recipe status is transcribed by hand,
// per house standard). recipeId + parseState are always present; the remaining
// fields marshal as explicit null until the import populates them — so they are
// `T | null`, NOT optional.

export type RecipeParseState = 'awaiting_parse' | 'parsing' | 'parsed' | 'failed';

/** GET /api/recipe/{id} — owner-scoped recipe import status (404 if not yours). */
export interface RecipeStatus {
  recipeId: number;
  parseState: RecipeParseState;
  parseError: string | null;
  mealId: number | null;
  mealName: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  pdfUrl: string | null;
}

/** 202 body from POST /api/recipe/import — the import was accepted and is
 *  parsing asynchronously; poll GET /api/recipe/{recipeId} for completion. */
export interface RecipeImportResponse {
  recipeId: number;
  parseState: RecipeParseState;
}
