// src/app/models/food.model.ts
// Re-exports from generated schema for backward compatibility
import {
  FoodSchema,
  FoodSearchResponse as GeneratedFoodSearchResponse,
  FoodSearchBatchResponse,
} from './generated/food.schema';

// Re-export generated types
export type { FoodSchema, FoodSearchBatchResponse };

// Type aliases for backward compatibility
export type Food = FoodSchema;
export type FoodSearchResponse = GeneratedFoodSearchResponse;

// Extract nested types for standalone use if needed
export type NutritionFacts = NonNullable<FoodSchema['nutritionFacts']>;
export type BrandInfo = NonNullable<FoodSchema['brandInfo']>;
export type Recipe = NonNullable<FoodSchema['recipe']>;
