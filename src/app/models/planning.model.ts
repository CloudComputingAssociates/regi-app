// src/app/models/planning.model.ts
// Types for standalone meal generation and day plan assembly

export interface MealItem {
  id?: number;
  foodId: number;
  foodName: string;
  quantity: number;
  unit: string;
  calories?: number;
  proteinG?: number;
  fatG?: number;
  carbG?: number;
  fiberG?: number;
  sodiumMg?: number;
  servingSizeG?: number;
  servingGramsPerUnit?: number;
  sortOrder?: number;
  foodImageThumbnail?: string;
  shortDescription?: string;
  categoryName?: string;
  productPurchaseLink?: string;
}

export interface Meal {
  id: number;
  name: string;
  planType: 'meal' | 'snack';
  mealSeqNum: number;
  primaryProteinFoodId?: number;
  primaryProteinName?: string;
  isYeh: boolean;
  isFavorite: boolean;
  status: 'active' | 'archived';
  totalCalories?: number;
  totalProteinG?: number;
  totalFatG?: number;
  totalCarbG?: number;
  totalFiberG?: number;
  totalSodiumMg?: number;
  prepVideoLink?: string;
  recipeLink?: string;
  mealImage?: string;
  mealImageThumbnail?: string;
  shareCandidate?: boolean;
  shareApproved?: boolean;
  items: MealItem[];
  createdAt: string;
  updatedAt: string;
}

export interface GenerateMealRequest {
  promptGist: string;
  name?: string;
}

export interface UpdateMealRequest {
  name?: string;
  isFavorite?: boolean;
  status?: 'active' | 'archived';
  prepVideoLink?: string;
  recipeLink?: string;
  mealImage?: string;
  mealImageThumbnail?: string;
  shareCandidate?: boolean;
  items?: MealItem[];
}

export interface MealSummary {
  id: number;
  name: string;
  planType: 'meal' | 'snack';
  mealSeqNum: number;
  primaryProteinFoodId?: number;
  primaryProteinName?: string;
  isYeh: boolean;
  isFavorite: boolean;
  status: string;
  totalCalories?: number;
  totalProteinG?: number;
  totalFatG?: number;
  totalCarbG?: number;
  totalFiberG?: number;
  totalSodiumMg?: number;
  mealImageThumbnail?: string;
  shareCandidate?: boolean;
  shareApproved?: boolean;
  createdAt: string;
}

export interface ListMealsRequest {
  planType?: 'meal' | 'snack';
  status?: 'active' | 'archived';
  isFavorite?: boolean;
  includeYeh?: boolean;
  includeCommunity?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListMealsResponse {
  meals: MealSummary[];
  total: number;
  limit: number;
  offset: number;
}

// DayPlan types
export interface DayPlanMeal {
  id: number;
  mealId: number;
  mealSlot: number;  // 1, 2, 3... order in day
  meal?: Meal;
}

export interface DayPlan {
  id: number;
  planDate: string;  // YYYY-MM-DD
  year: number;
  weekOfYear: number;
  dayOfWeek: number;  // 1=Mon..7=Sun
  targetCalories?: number;
  targetProteinG?: number;
  targetFatG?: number;
  targetCarbG?: number;
  targetFiberG?: number;
  maxSodiumMg?: number;
  meals: DayPlanMeal[];
  createdAt: string;
}

export interface CreateDayPlanRequest {
  planDate: string;  // YYYY-MM-DD
}

export interface AssignMealRequest {
  mealId: number;
  mealSlot: number;
}

export interface WeekViewResponse {
  year: number;
  weekOfYear: number;
  days: DayPlan[];
}

// Shopping progress for a single food item within a week plan
export interface ShoppingProgressItem {
  foodId: number;
  pickedUp: boolean;
  needed: boolean;
}

// WeekPlan types
export interface WeekPlan {
  id: number;
  name: string;
  startDate: string;  // YYYY-MM-DD
  isFavorite: boolean;
  days: DayPlan[];
  createdAt: string;
  shoppingProgress?: ShoppingProgressItem[];
}

export interface WeekPlanSummary {
  id: number;
  name: string;
  startDate: string;
  isFavorite: boolean;
  dayCount: number;
  createdAt: string;
}

export interface CreateWeekPlanRequest {
  startDate: string;
  name?: string;
}

export interface UpdateWeekPlanRequest {
  name?: string;
  isFavorite?: boolean;
  shoppingProgress?: ShoppingProgressItem[];
}

export interface CopyWeekPlanRequest {
  startDate: string;
  name?: string;
}

export interface ListWeekPlansResponse {
  weekPlans: WeekPlanSummary[];
  total: number;
}

// Helper to get meal slot name
export function getMealSlotName(slot: number): string {
  return `Meal ${slot}`;
}
