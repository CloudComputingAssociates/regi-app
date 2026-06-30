// src/app/models/nutrition.model.ts

/**
 * Represents nutrient data for a single macro (protein/fat/carb)
 */
export interface NutrientData {
  'target-percent': number;  // % of daily calories from this macro
  'target-grams': number;    // Daily gram target
  'actual-day': number;      // Grams consumed today
  'actual-week': number;     // Grams consumed this week (7-day total)
}

/**
 * Complete nutrition response from API
 * GET /api/user/nutrition
 */
export interface NutritionResponse {
  nutrients: {
    protein: NutrientData;
    fiber: NutrientData;
    fat: NutrientData;
    carb: NutrientData;
  };
}

/**
 * Time period selector
 */
export type TimePeriod = 'day' | 'week';