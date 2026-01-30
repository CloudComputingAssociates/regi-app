// src/app/services/preferences.service.ts
// Manages user preferences state (regiMenu, dailyGoals, defaultFoodList, personalInfo).
// Initializes from SettingsService cached data (consolidated GET at startup).
// Saves via SettingsService individual PUT endpoints.
import { Injectable, inject, signal, computed } from '@angular/core';
import { SettingsService } from './settings.service';
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

  /** Max carb grams = all TDEE calories from carbs */
  readonly maxCarbGrams = computed(() => {
    const tdee = this.computedTDEE();
    if (!tdee) return 500; // fallback max
    return Math.floor(tdee / 4);
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

  /** Fat grams = remaining calories after protein + carbs, divided by 9 */
  readonly computedFatGrams = computed(() => {
    const tdee = this.computedTDEE();
    const protein = this.computedProteinGrams();
    const pi = this.personalInfo();
    const carbs = pi.carbScaleGrams ?? 50;
    if (!tdee || !protein) return null;
    const remaining = tdee - (protein * 4) - (carbs * 4);
    return Math.max(0, Math.round(remaining / 9));
  });

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
    return Math.round(lbs * 0.453592 * 10) / 10;
  }

  static kgToLbs(kg: number): number {
    return Math.round(kg / 0.453592 * 10) / 10;
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
