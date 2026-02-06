// src/app/models/planning.model.ts
// Types for meal plan generation and management

export interface PlanItem {
  id?: number;
  foodId: number;
  foodName: string;
  mealSlot: number;  // 1=Breakfast, 2=Lunch, 3=Dinner, 4+=Snack
  quantity: number;
  unit: string;
  calories?: number;
  proteinG?: number;
  fatG?: number;
  carbG?: number;
  fiberG?: number;
  sodiumMg?: number;
  sortOrder?: number;
  // For display - populated from Foods table
  foodImageThumbnail?: string;
  shortDescription?: string;
  description?: string;
}

export interface Plan {
  id: number;
  name: string;
  planType: 'day' | 'week';
  planDate: string;  // YYYY-MM-DD
  endDate?: string;  // For week plans
  isFavorite: boolean;
  status: 'active' | 'completed' | 'archived';
  totalCalories?: number;
  totalProteinG?: number;
  totalFatG?: number;
  totalCarbG?: number;
  totalFiberG?: number;
  totalSodiumMg?: number;
  items: PlanItem[];
  createdAt: string;
  updatedAt: string;
}

export interface GeneratePlanRequest {
  planType: 'day' | 'week';
  planDate: string;  // YYYY-MM-DD
  promptGist: string;
  name?: string;
}

export interface UpdatePlanRequest {
  name?: string;
  isFavorite?: boolean;
  status?: 'active' | 'completed' | 'archived';
  items?: PlanItem[];
}

export interface PlanSummary {
  id: number;
  name: string;
  planType: 'day' | 'week';
  planDate: string;
  endDate?: string;
  isFavorite: boolean;
  status: string;
  totalCalories?: number;
  createdAt: string;
}

export interface ListPlansRequest {
  planType?: 'day' | 'week';
  status?: 'active' | 'completed' | 'archived';
  isFavorite?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface ListPlansResponse {
  plans: PlanSummary[];
  total: number;
  limit: number;
  offset: number;
}

// Helper to get meal slot name
export function getMealSlotName(slot: number): string {
  switch (slot) {
    case 1: return 'Breakfast';
    case 2: return 'Lunch';
    case 3: return 'Dinner';
    default: return `Snack ${slot - 3}`;
  }
}
