// TypeScript models derived from Go schema: models/generated/settings.schema.go
// Mirrors the API response/request shapes for /api/user/settings/*

// Consolidated GET /api/user/settings response
export interface AllSettings {
  tabs?: TabSettings;
  regiMenu?: RegiMenuSettings;
  defaultFoodList?: string;
  dailyGoals?: DailyGoals;
  personalInfo?: PersonalInfo;
}

// GET/PUT /api/user/settings/tabs
export interface TabSettings {
  defaultTabs: string[];
  activeTabId?: string;
}

// GET/PUT /api/user/settings/regimenu
export interface RegiMenuSettings {
  mealsPerDay?: number;
  fastingType?: string;
  eatingStartTime?: string;
  repeatMeals?: number;
}

// GET/PUT /api/user/settings/dailygoals
export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
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
}

// GET/PUT /api/user/settings/defaultfoodlist
export interface DefaultFoodListData {
  defaultFoodList: string;
}
