// src/app/services/preferences.service.ts
// Manages user preferences state (regiMenu, dailyGoals, defaultFoodList, personalInfo).
// Initializes from SettingsService cached data (consolidated GET at startup).
// Saves via SettingsService individual PUT endpoints.
import { Injectable, inject, signal, computed } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from './settings.service';
import { environment } from '../../environments/environment';
import {
  DailyGoals, RegiMenuSettings, PersonalInfo
} from '../models/settings.models';

// Narrower types for UI
export type MealsPerDay = 1 | 2 | 3 | 4 | 5 | 6;
export type FastingType = 'none' | '16_8' | '18_6' | '20_4' | 'omad';
export type RepeatMeals = 1 | 2 | 3 | 4;
export type FoodListSource = 'yeh_plus_myfoods' | 'yeh' | 'myfoods';

export type { DailyGoals, PersonalInfo };

export interface Preferences {
  mealsPerDay: MealsPerDay;
  fastingType: FastingType;
  dailyGoals: DailyGoals;
  eatingStartTime: string;
  repeatMeals: RepeatMeals;
  foodListSource: FoodListSource;
  personalInfo: PersonalInfo;
}

const DEFAULT_DAILY_GOALS: DailyGoals = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  fiber: 30,
  sodium: 2300
};

const DEFAULT_PERSONAL_INFO: PersonalInfo = {};

const DEFAULT_PREFERENCES: Preferences = {
  mealsPerDay: 3,
  fastingType: 'none',
  dailyGoals: DEFAULT_DAILY_GOALS,
  eatingStartTime: '08:00',
  repeatMeals: 1,
  foodListSource: 'yeh_plus_myfoods',
  personalInfo: DEFAULT_PERSONAL_INFO
};

// Track which groups have been modified since last save
interface DirtyGroups {
  regiMenu: boolean;
  dailyGoals: boolean;
  defaultFoodList: boolean;
  personalInfo: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PreferencesService {
  private settingsService = inject(SettingsService);
  private auth = inject(AuthService);

  private preferencesSignal = signal<Preferences>(DEFAULT_PREFERENCES);
  private loadingSignal = signal(false);
  private loadedSignal = signal(false);
  private dirtyGroups = signal<DirtyGroups>({
    regiMenu: false, dailyGoals: false, defaultFoodList: false, personalInfo: false
  });

  // Unit preference for height/weight display
  readonly useImperial = signal(localStorage.getItem('yeh_useImperial') !== 'false');

  readonly preferences = this.preferencesSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly isLoaded = this.loadedSignal.asReadonly();

  // Convenience accessors
  readonly mealsPerDay = computed(() => this.preferencesSignal().mealsPerDay);
  readonly fastingType = computed(() => this.preferencesSignal().fastingType);
  readonly dailyGoals = computed(() => this.preferencesSignal().dailyGoals);
  readonly eatingStartTime = computed(() => this.preferencesSignal().eatingStartTime);
  readonly repeatMeals = computed(() => this.preferencesSignal().repeatMeals);
  readonly foodListSource = computed(() => this.preferencesSignal().foodListSource);
  readonly personalInfo = computed(() => this.preferencesSignal().personalInfo);

  // ========================================================
  // COMPUTED NUTRITION (Mifflin-St. Jeor)
  // ========================================================

  /** TDEE computed from personal info via Mifflin-St. Jeor + activity multiplier */
  readonly computedTDEE = computed(() => {
    const pi = this.personalInfo();
    if (!pi.sex || !pi.dateOfBirth || !pi.heightCm || !pi.currentWeightKg || !pi.activityLevel) {
      return null;
    }
    const age = PreferencesService.calcAge(pi.dateOfBirth);
    if (age <= 0) return null;

    // Mifflin-St. Jeor: BMR
    // Male:   10 * weight(kg) + 6.25 * height(cm) - 5 * age - 5 + 166 => +5
    // Female: 10 * weight(kg) + 6.25 * height(cm) - 5 * age - 161
    const bmr = pi.sex === 'male'
      ? 10 * pi.currentWeightKg + 6.25 * pi.heightCm - 5 * age + 5
      : 10 * pi.currentWeightKg + 6.25 * pi.heightCm - 5 * age - 161;

    const multiplier = PreferencesService.activityMultiplier(pi.activityLevel);
    return Math.round(bmr * multiplier);
  });

  /** Target calories = TDEE adjusted by deficit/surplus percent */
  readonly computedTargetCalories = computed(() => {
    const tdee = this.computedTDEE();
    if (!tdee) return null;
    const pi = this.personalInfo();
    const pct = pi.deficitPercent ?? 0; // negative = deficit, positive = surplus
    return Math.round(tdee * (1 + pct / 100));
  });

  /** Label for the deficit/surplus annotation, e.g. "20% lowered" or "10% raised" */
  readonly deficitLabel = computed(() => {
    const pi = this.personalInfo();
    const pct = pi.deficitPercent;
    if (!pct || pct === 0) return null;
    const absPct = Math.abs(pct);
    return pct < 0 ? `${absPct}% lowered` : `${absPct}% raised`;
  });

  /** Estimated weeks to reach target weight from current weight */
  readonly computedWeeksToGoal = computed(() => {
    const tdee = this.computedTDEE();
    const target = this.computedTargetCalories();
    const pi = this.personalInfo();
    if (!tdee || !target || !pi.currentWeightKg || !pi.targetWeightKg) return null;
    const weightDiffKg = Math.abs(pi.currentWeightKg - pi.targetWeightKg);
    if (weightDiffKg < 0.1) return 0;
    // Daily caloric gap
    const dailyGap = Math.abs(tdee - target);
    if (dailyGap === 0) return null;
    // 7700 kcal ≈ 1 kg of body weight
    const kgPerWeek = (dailyGap * 7) / 7700;
    if (kgPerWeek === 0) return null;
    return Math.round(weightDiffKg / kgPerWeek);
  });

  /** Max carb grams = all TDEE calories from carbs */
  readonly maxCarbGrams = computed(() => {
    const tdee = this.computedTDEE();
    if (!tdee) return 200; // fallback max
    return Math.min(200, Math.floor(tdee / 4));
  });

  /** Protein grams computed from target weight * ratio */
  readonly computedProteinGrams = computed(() => {
    const pi = this.personalInfo();
    const ratio = pi.proteinRatio ?? 1.0;
    const targetKg = pi.targetWeightKg;
    if (!targetKg) return null;
    const targetLbs = PreferencesService.kgToLbs(targetKg);
    return Math.round(targetLbs * ratio);
  });

  /** Fat grams = remaining calories after protein + carbs, divided by 9 (uses target calories, not raw TDEE) */
  readonly computedFatGrams = computed(() => {
    const targetCals = this.computedTargetCalories();
    const protein = this.computedProteinGrams();
    const pi = this.personalInfo();
    const carbs = pi.carbScaleGrams ?? 50;
    if (!targetCals || !protein) return null;
    const remaining = targetCals - (protein * 4) - (carbs * 4);
    return Math.max(0, Math.round(remaining / 9));
  });

  /** Sync computed macros into dailyGoals when personal info yields values */
  syncComputedMacros(): void {
    const protein = this.computedProteinGrams();
    const fat = this.computedFatGrams();
    const pi = this.personalInfo();
    const carbs = pi.carbScaleGrams;
    const targetCals = this.computedTargetCalories();

    const updates: Partial<DailyGoals> = {};
    if (protein !== null) updates.protein = protein;
    if (carbs !== undefined) updates.carbs = carbs;
    if (fat !== null) updates.fat = fat;
    if (targetCals !== null) updates.calories = targetCals;

    if (Object.keys(updates).length === 0) return;

    this.preferencesSignal.update(p => ({
      ...p,
      dailyGoals: { ...p.dailyGoals, ...updates }
    }));
    this.dirtyGroups.update(d => ({ ...d, dailyGoals: true }));
  }

  // ========================================================
  // LOAD (from SettingsService cached data)
  // ========================================================

  loadPreferences(): void {
    if (this.loadedSignal()) return;

    this.loadingSignal.set(true);
    const all = this.settingsService.allSettings();

    if (!all) {
      this.loadingSignal.set(false);
      return;
    }

    const rm = all.regiMenu;
    const dg = all.dailyGoals;
    const pi = all.personalInfo;

    const prefs: Preferences = {
      mealsPerDay: (rm?.mealsPerDay as MealsPerDay) || DEFAULT_PREFERENCES.mealsPerDay,
      fastingType: (rm?.fastingType as FastingType) || DEFAULT_PREFERENCES.fastingType,
      eatingStartTime: rm?.eatingStartTime || DEFAULT_PREFERENCES.eatingStartTime,
      repeatMeals: (rm?.repeatMeals as RepeatMeals) || DEFAULT_PREFERENCES.repeatMeals,
      foodListSource: this.mapDefaultFoodList(all.defaultFoodList),
      dailyGoals: dg ?? DEFAULT_DAILY_GOALS,
      personalInfo: pi ?? DEFAULT_PERSONAL_INFO
    };

    this.preferencesSignal.set(prefs);
    this.loadedSignal.set(true);
    this.loadingSignal.set(false);
    this.dirtyGroups.set({ regiMenu: false, dailyGoals: false, defaultFoodList: false, personalInfo: false });
  }

  // ========================================================
  // SAVE (individual PUTs for changed groups)
  // ========================================================

  async savePreferences(): Promise<void> {
    const current = this.preferencesSignal();
    const dirty = this.dirtyGroups();
    const promises: Promise<unknown>[] = [];

    if (dirty.regiMenu) {
      const data: RegiMenuSettings = {
        mealsPerDay: current.mealsPerDay,
        fastingType: current.fastingType,
        eatingStartTime: current.eatingStartTime,
        repeatMeals: current.repeatMeals
      };
      promises.push(this.settingsService.saveRegiMenuSettings(data));
    }

    if (dirty.dailyGoals) {
      promises.push(this.settingsService.saveDailyGoals(current.dailyGoals));
    }

    if (dirty.defaultFoodList) {
      promises.push(this.settingsService.saveDefaultFoodList(
        this.mapFoodListSourceToApi(current.foodListSource)
      ));
    }

    if (dirty.personalInfo) {
      promises.push(this.settingsService.savePersonalInfo(current.personalInfo));
    }

    if (promises.length === 0) return;

    await Promise.all(promises);
    this.dirtyGroups.set({ regiMenu: false, dailyGoals: false, defaultFoodList: false, personalInfo: false });
  }

  // ========================================================
  // SETTERS (mark dirty groups)
  // ========================================================

  setMealsPerDay(value: MealsPerDay): void {
    this.preferencesSignal.update(p => ({ ...p, mealsPerDay: value }));
    this.dirtyGroups.update(d => ({ ...d, regiMenu: true }));
  }

  setFastingType(value: FastingType): void {
    this.preferencesSignal.update(p => ({ ...p, fastingType: value }));
    this.dirtyGroups.update(d => ({ ...d, regiMenu: true }));
  }

  setEatingStartTime(value: string): void {
    this.preferencesSignal.update(p => ({ ...p, eatingStartTime: value }));
    this.dirtyGroups.update(d => ({ ...d, regiMenu: true }));
  }

  setRepeatMeals(value: RepeatMeals): void {
    this.preferencesSignal.update(p => ({ ...p, repeatMeals: value }));
    this.dirtyGroups.update(d => ({ ...d, regiMenu: true }));
  }

  setFoodListSource(value: FoodListSource): void {
    this.preferencesSignal.update(p => ({ ...p, foodListSource: value }));
    this.dirtyGroups.update(d => ({ ...d, defaultFoodList: true }));
  }

  setDailyGoals(goals: DailyGoals): void {
    this.preferencesSignal.update(p => ({ ...p, dailyGoals: goals }));
    this.dirtyGroups.update(d => ({ ...d, dailyGoals: true }));
  }

  updateDailyGoal(field: keyof DailyGoals, value: number): void {
    this.preferencesSignal.update(p => ({
      ...p,
      dailyGoals: { ...p.dailyGoals, [field]: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, dailyGoals: true }));
  }

  // Personal Info setters
  setSex(value: string): void {
    this.preferencesSignal.update(p => ({
      ...p, personalInfo: { ...p.personalInfo, sex: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, personalInfo: true }));
  }

  setDateOfBirth(value: string): void {
    this.preferencesSignal.update(p => ({
      ...p, personalInfo: { ...p.personalInfo, dateOfBirth: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, personalInfo: true }));
  }

  setHeightCm(value: number): void {
    this.preferencesSignal.update(p => ({
      ...p, personalInfo: { ...p.personalInfo, heightCm: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, personalInfo: true }));
  }

  setCurrentWeightKg(value: number): void {
    this.preferencesSignal.update(p => ({
      ...p, personalInfo: { ...p.personalInfo, currentWeightKg: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, personalInfo: true }));
  }

  setTargetWeightKg(value: number): void {
    this.preferencesSignal.update(p => ({
      ...p, personalInfo: { ...p.personalInfo, targetWeightKg: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, personalInfo: true }));
  }

  setActivityLevel(value: string): void {
    this.preferencesSignal.update(p => ({
      ...p, personalInfo: { ...p.personalInfo, activityLevel: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, personalInfo: true }));
  }

  setProteinRatio(value: number): void {
    this.preferencesSignal.update(p => ({
      ...p, personalInfo: { ...p.personalInfo, proteinRatio: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, personalInfo: true }));
  }

  setDeficitPercent(value: number): void {
    this.preferencesSignal.update(p => ({
      ...p, personalInfo: { ...p.personalInfo, deficitPercent: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, personalInfo: true }));
  }

  /** Ask AI to compute a conservative deficit/surplus percent.
   *  Only calls if deficitPercent is not already stored and both weights are set.
   *  Falls back to a simple heuristic if the AI call fails. */
  async computeDeficitPercentViaAI(): Promise<void> {
    const pi = this.personalInfo();
    if (pi.deficitPercent !== undefined && pi.deficitPercent !== null) return;
    if (!pi.currentWeightKg || !pi.targetWeightKg) return;
    const diff = pi.targetWeightKg - pi.currentWeightKg;
    if (Math.abs(diff) < 0.5) return; // at goal

    const currentLbs = PreferencesService.kgToLbs(pi.currentWeightKg);
    const targetLbs = PreferencesService.kgToLbs(pi.targetWeightKg);
    const direction = diff < 0 ? 'lose' : 'gain';
    const sex = pi.sex || 'unknown';
    const age = pi.dateOfBirth ? PreferencesService.calcAge(pi.dateOfBirth) : 'unknown';
    const activity = pi.activityLevel || 'unknown';

    const userPrompt = `A ${sex} person, age ${age}, activity level ${activity}, currently weighs ${currentLbs} lbs and wants to ${direction} weight to reach ${targetLbs} lbs. What conservative caloric ${direction === 'lose' ? 'deficit' : 'surplus'} percentage would you recommend? Reply with ONLY a single integer number — negative for deficit (e.g. -20) or positive for surplus (e.g. 10). No explanation, just the number.`;

    try {
      const token = await firstValueFrom(this.auth.getAccessTokenSilently());
      const response = await fetch(`${environment.apiUrl}/ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemPrompt: 'You are a nutrition expert. You recommend conservative, safe caloric adjustments. For weight loss, recommend between -10 and -25. For weight gain (muscle), recommend between 5 and 15. Always pick the more conservative (lower magnitude) end. Reply with ONLY a single integer.',
          userPrompt,
          maxTokens: 10,
          temperature: 0.1
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const content = (data.content || '').trim();
      const parsed = parseInt(content, 10);
      if (!isNaN(parsed) && parsed >= -30 && parsed <= 20) {
        this.setDeficitPercent(parsed);
        return;
      }
    } catch (err) {
      console.warn('[PreferencesService] AI deficit call failed, using fallback:', err);
    }

    // Fallback heuristic
    const gapKg = Math.abs(diff);
    let pct: number;
    if (diff < 0) {
      pct = gapKg < 10 ? -15 : gapKg < 30 ? -20 : -25;
    } else {
      pct = gapKg < 5 ? 5 : gapKg < 15 ? 10 : 15;
    }
    this.setDeficitPercent(pct);
  }

  setCarbScaleGrams(value: number): void {
    this.preferencesSignal.update(p => ({
      ...p, personalInfo: { ...p.personalInfo, carbScaleGrams: value }
    }));
    this.dirtyGroups.update(d => ({ ...d, personalInfo: true }));
  }

  // Unit toggle
  toggleUnits(): void {
    const newValue = !this.useImperial();
    this.useImperial.set(newValue);
    localStorage.setItem('yeh_useImperial', String(newValue));
  }

  // ========================================================
  // UNIT CONVERSION HELPERS
  // ========================================================

  static lbsToKg(lbs: number): number {
    return Math.round(lbs * 0.453592 * 100) / 100;
  }

  static kgToLbs(kg: number): number {
    return Math.round(kg / 0.453592);
  }

  static cmToFtIn(cm: number): { ft: number; inches: number } {
    const totalInches = cm / 2.54;
    const ft = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return { ft, inches };
  }

  static ftInToCm(ft: number, inches: number): number {
    return Math.round((ft * 12 + inches) * 2.54 * 10) / 10;
  }

  static calcAge(dateOfBirth: string): number {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }

  static activityMultiplier(level: string): number {
    switch (level) {
      case 'sedentary': return 1.2;
      case 'lightly_active': return 1.375;
      case 'moderately_active': return 1.55;
      case 'very_active': return 1.725;
      case 'extremely_active': return 1.9;
      default: return 1.2;
    }
  }

  // ========================================================
  // MISC
  // ========================================================

  updatePreferences(partial: Partial<Preferences>): void {
    this.preferencesSignal.update(p => ({ ...p, ...partial }));
  }

  resetToDefaults(): void {
    this.preferencesSignal.set(DEFAULT_PREFERENCES);
  }

  /** Returns true if any group has been modified since last load/save */
  hasDirtyGroups(): boolean {
    const d = this.dirtyGroups();
    return d.regiMenu || d.dailyGoals || d.defaultFoodList || d.personalInfo;
  }

  /** Reset all dirty flags (used when discarding unsaved changes) */
  resetDirtyGroups(): void {
    this.dirtyGroups.set({ regiMenu: false, dailyGoals: false, defaultFoodList: false, personalInfo: false });
  }

  // Map API defaultFoodList string to FoodListSource (the old API used different values)
  private mapDefaultFoodList(value?: string): FoodListSource {
    switch (value) {
      case 'yeh_approved': return 'yeh';
      case 'all_foods': return 'yeh_plus_myfoods';
      default: return DEFAULT_PREFERENCES.foodListSource;
    }
  }

  private mapFoodListSourceToApi(value: FoodListSource): string {
    switch (value) {
      case 'yeh': return 'yeh_approved';
      case 'yeh_plus_myfoods': return 'all_foods';
      case 'myfoods': return 'all_foods';
      default: return 'yeh_approved';
    }
  }
}
