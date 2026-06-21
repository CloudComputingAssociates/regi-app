// src/app/models/food.model.ts
// Re-exports from generated schema for backward compatibility
import {
  FoodSchema,
  FoodSearchResponse as GeneratedFoodSearchResponse,
  FoodSearchBatchResponse,
} from './generated/food.schema';

// Re-export generated types
export type { FoodSchema, FoodSearchBatchResponse };

// Type aliases for backward compatibility. Food extends FoodSchema with the
// `foodSource` discriminator that the API returns alongside every row (in
// AllFoodRow / preferences responses) but which isn't in the generated
// FoodSchema. It's the canonical source-of-truth for "USDA vs UserFood" —
// dataSource is provenance, foodSource is the table the row lives in.
export type Food = FoodSchema & {
  foodSource?: 'food' | 'userfood';
  // Food's curated baseline — number of `servingUnit` per serving
  // (e.g. 4 for "4 oz" of beef). Populated from Foods.ServingSize /
  // UserFoods.ServingSize via the AllFoods view. Optional on the alias
  // because FoodSchema (generated) doesn't have it natively yet.
  servingSize?: number | null;
  // This user's per-favorite override. null/undefined → no override; the
  // popup should fall through to `servingSize` (the baseline) for display
  // and macro math.
  userServingSize?: number | null;
  // Pick-state metadata — only meaningful when the Food blob is sitting
  // inside a Picks basket. `pickAddedAt` is the ISO timestamp captured when
  // the food was first dropped into the basket (round-trips via CurrentPicks
  // for stable ordering across devices). `pickServingSize` is the per-basket
  // serving override; null means "no override; follow the MyFoods baseline".
  pickAddedAt?: string;
  pickServingSize?: number | null;
};
export type FoodSearchResponse = GeneratedFoodSearchResponse;

// Extract nested types for standalone use if needed
export type NutritionFacts = NonNullable<FoodSchema['nutritionFacts']>;
export type BrandInfo = NonNullable<FoodSchema['brandInfo']>;
export type Recipe = NonNullable<FoodSchema['recipe']>;
