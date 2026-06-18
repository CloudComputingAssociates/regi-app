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
};
export type FoodSearchResponse = GeneratedFoodSearchResponse;

// Extract nested types for standalone use if needed
export type NutritionFacts = NonNullable<FoodSchema['nutritionFacts']>;
export type BrandInfo = NonNullable<FoodSchema['brandInfo']>;
export type Recipe = NonNullable<FoodSchema['recipe']>;
