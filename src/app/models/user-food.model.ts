// src/app/models/user-food.model.ts
// User-created foods stored in the YEH database UserFoods table

export interface UserFood {
  id: number;
  userId: number;
  description: string;
  shortDescription?: string;
  servingUnit?: string;
  gramsPerServingUnit?: number;
  shareWithCommunity: boolean;
  foodImage?: string;
  nutritionFactsImage?: string;
  servingSizeHousehold?: string;
  servingSizeG?: number;
  calories: number;
  proteinG: number;
  totalFatG: number;
  sodiumMG: number;
  totalCarbohydrateG: number;
  dietaryFiberG: number;
  saturatedFatG?: number;
  transFatG?: number;
  cholesterolMG?: number;
  totalSugarsG?: number;
  addedSugarsG?: number;
  vitaminDMcg?: number;
  calciumMG?: number;
  ironMG?: number;
  potassiumMG?: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateUserFoodRequest = Omit<UserFood, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
