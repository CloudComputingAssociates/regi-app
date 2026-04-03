// src/app/models/user-food.model.ts
// User-created foods stored in the YEH database UserFoods table

export interface UserFood {
  id: number;
  userId: number;
  sourceFoodId?: number;
  description: string;
  shortDescription?: string;
  categoryId?: number;
  subCategoryId?: number;
  dataSource: string;
  foodRequestType?: string;
  servingUnit?: string;
  servingGramsPerUnit?: number;
  servingSizeMultiplicand?: number;
  glycemicIndex?: number;
  glycemicLoad?: number;
  foodImage?: string;
  foodImageThumbnail?: string;
  nutritionFactsImage?: string;
  nutritionFactsImagePending?: string;
  nutritionFactsStatus?: string;
  nutritionFactsQueueState?: string;
  ingredientsImage?: string;
  ingredientsImagePending?: string;
  ingredientsAreAllergens: boolean;
  gtinUpc?: string;
  productPurchaseLink?: string;
  shareCandidate: boolean;
  shareApproved: boolean;
  createdAt: string;
  updatedAt: string;
  nutritionFacts?: UserNutritionFacts;
}

export interface UserNutritionFacts {
  id: number;
  userFoodId: number;
  foodName?: string;
  servingSizeHousehold?: string;
  servingSizeG?: number;
  servingsPerContainer?: number;
  calories: number;
  proteinG: number;
  totalFatG: number;
  saturatedFatG?: number;
  transFatG?: number;
  cholesterolMG?: number;
  sodiumMG?: number;
  totalCarbohydrateG: number;
  dietaryFiberG?: number;
  totalSugarsG?: number;
  addedSugarsG?: number;
  vitaminDMcg?: number;
  calciumMG?: number;
  ironMG?: number;
  potassiumMG?: number;
  createdAt: string;
}

export interface CreateUserFoodRequest {
  sourceFoodId?: number;
  description: string;
  shortDescription?: string;
  categoryId?: number;
  dataSource?: string;
  servingUnit?: string;
  servingGramsPerUnit?: number;
  servingSizeMultiplicand?: number;
  foodImage?: string;
  foodImageThumbnail?: string;
  nutritionFactsImage?: string;
  ingredientsImage?: string;
  gtinUpc?: string;
  // Inline nutrition (written to UserNutritionFacts)
  calories: number;
  proteinG: number;
  totalFatG: number;
  sodiumMG: number;
  totalCarbohydrateG: number;
  dietaryFiberG: number;
  servingSizeHousehold?: string;
  servingSizeG?: number;
  saturatedFatG?: number;
  transFatG?: number;
  cholesterolMG?: number;
  totalSugarsG?: number;
  addedSugarsG?: number;
  vitaminDMcg?: number;
  calciumMG?: number;
  ironMG?: number;
  potassiumMG?: number;
  productPurchaseLink?: string;
  shareCandidate?: boolean;
}
