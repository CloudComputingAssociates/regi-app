// TypeScript models derived from Go schema: models/generated/settings.schema.go
// Mirrors the API response/request shapes for /api/user/settings/*

// Consolidated GET /api/user/settings response
export interface AllSettings {
  tabs?: TabSettings;
  regiMenu?: RegiMenuSettings;
  defaultFoodList?: string;
  dailyGoals?: DailyGoals;
  personalInfo?: PersonalInfo;
  shoppingStaples?: ShoppingStaple[];
  currentPicks?: CurrentPick[];
  glp1?: Glp1Settings;
}

// Basket-staged foods picked for the next planning round. Persisted as a JSON
// array on UserSettings.CurrentPicks. foodId + foodSource is the AllFoods view's
// composite key (the discriminator decides USDA Foods vs UserFoods). basketKey
// places the pick into one of the four UI baskets. pickServingSize=null means
// "no override; follow the MyFoods baseline"; a number is the per-basket
// override quantity in `food.servingUnit` units.
export interface CurrentPick {
  foodId: number;
  foodSource: 'food' | 'userfood';
  basketKey: 'Proteins' | 'Fats' | 'Carbs' | 'Other';
  pickServingSize: number | null;
  mealRole?: 'AnyUse' | 'PrimaryFood' | 'SecondaryFood';
  addedAt: string; // ISO 8601
}

// GET/PUT /api/user/settings/tabs
export interface TabSettings {
  defaultTabs: string[];
  activeTabId?: string;
}

// GET/PUT /api/user/settings/regimenu
export interface RegiMenuSettings {
  mealsPerDay?: number;
  repeatMeals?: number;
  weekStartDay?: string;
  persons?: number;
  menuDays?: number;
}

// GLP-1 dose tier (start / current / maintenance)
export interface Glp1Dose {
  dose?: number;
  units?: number;
  intervalDays?: number;
}

// GET/PUT /api/user/settings — glp1 section
export interface Glp1Settings {
  enabled?: boolean;
  brand?: string;
  pharmacy?: string;
  website?: string;
  startDate?: string; // ISO 8601 (YYYY-MM-DD) — when user began GLP-1 therapy
  startDose?: Glp1Dose;
  currentDose?: Glp1Dose;
  maintenanceDose?: Glp1Dose;
}

// GET/PUT /api/user/settings/dailygoals
export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
  waterMode?: 'glasses' | 'bottle';
  bottleSizeOz?: number;
  waterGlasses?: number;
  isOverridden?: boolean;
}

// GET/PUT /api/user/settings/personalinfo
export interface PersonalInfo {
  sex?: string;
  dateOfBirth?: string;
  heightCm?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
  activityLevel?: string;
  proteinRatio?: number;    // g per lb of target weight (0.8, 1.0, 1.2)
  carbScaleGrams?: number;  // daily carb target in grams (slider value)
  deficitPercent?: number;  // negative = deficit (losing), positive = surplus (gaining), e.g. -20 or +10
  calcCalories?: number;    // calculated daily calorie target from BMR/TDEE/deficit
  calcProtein?: number;     // calculated daily protein (proteinRatio × targetWeight in lbs)
  calcFats?: number;        // calculated daily fat (remaining calories after protein and carbs)
  calcCarbs?: number;       // calculated daily carbs (from carbScaleGrams)
  lastUpdated?: string;     // ISO date (YYYY-MM-DD) when personal info was last updated
  units?: 'us' | 'metric';  // Unit system preference
}

// Shopping staple item
export interface ShoppingStaple {
  id: string;
  category: 'proteins' | 'produce' | 'bulk' | 'dairy' | 'aisles' | 'non_food' | 'fruits';
  item: string;
  qty?: string;
  store?: string;
  needed?: boolean;
  pickedUp?: boolean;
  sortOrder?: number;
}

// GET/PUT /api/user/settings/defaultfoodlist
export interface DefaultFoodListData {
  defaultFoodList: string;
}
