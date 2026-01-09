// src/app/services/user-settings.service.ts
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';
import { environment } from '../../environments/environment';

export type MealsPerDay = 1 | 2 | 3 | 4 | 5 | 6;
export type FastingType = 'none' | '16_8' | '18_6' | '20_4' | 'omad';
export type RepeatMeals = 1 | 2 | 3 | 4;
export type FoodListSource = 'yeh_plus_myfoods' | 'yeh' | 'myfoods';

export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
}

export interface UserSettings {
  mealsPerDay: MealsPerDay;
  fastingType: FastingType;
  dailyGoals: DailyGoals;
  eatingStartTime: string;  // 24-hour format "HH:MM"
  repeatMeals: RepeatMeals;
  foodListSource: FoodListSource;
}

// API response format - dailyGoals comes as JSON string from backend
interface UserSettingsResponse {
  mealsPerDay: number;
  fastingType: string;
  dailyGoals?: string;  // JSON string that needs to be parsed
  eatingStartTime?: string;
  repeatMeals?: number;
  foodListSource?: string;
}

const DEFAULT_DAILY_GOALS: DailyGoals = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  fiber: 30,
  sodium: 2300
};

const DEFAULT_SETTINGS: UserSettings = {
  mealsPerDay: 3,
  fastingType: 'none',
  dailyGoals: DEFAULT_DAILY_GOALS,
  eatingStartTime: '08:00',
  repeatMeals: 1,
  foodListSource: 'yeh_plus_myfoods'
};

@Injectable({
  providedIn: 'root'
})
export class UserSettingsService {
  private http = inject(HttpClient);
  private readonly API_BASE_URL = environment.apiUrl;

  private settingsSignal = signal<UserSettings>(DEFAULT_SETTINGS);
  private loadingSignal = signal(false);
  private loadedSignal = signal(false);

  /** Read-only access to all settings */
  readonly settings = this.settingsSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly isLoaded = this.loadedSignal.asReadonly();

  /** Convenience accessors */
  readonly mealsPerDay = computed(() => this.settingsSignal().mealsPerDay);
  readonly fastingType = computed(() => this.settingsSignal().fastingType);
  readonly dailyGoals = computed(() => this.settingsSignal().dailyGoals);
  readonly eatingStartTime = computed(() => this.settingsSignal().eatingStartTime);
  readonly repeatMeals = computed(() => this.settingsSignal().repeatMeals);
  readonly foodListSource = computed(() => this.settingsSignal().foodListSource);

  /** Load settings from API */
  loadSettings(): Observable<UserSettings> {
    if (this.loadedSignal()) {
      return of(this.settingsSignal());
    }

    this.loadingSignal.set(true);
    return this.http.get<UserSettingsResponse>(`${this.API_BASE_URL}/user/settings`).pipe(
      map(response => {
        // Parse dailyGoals from JSON string if present
        let parsedDailyGoals: DailyGoals = DEFAULT_DAILY_GOALS;
        if (response.dailyGoals) {
          try {
            parsedDailyGoals = JSON.parse(response.dailyGoals);
          } catch {
            console.warn('Failed to parse dailyGoals, using defaults');
          }
        }

        const settings: UserSettings = {
          mealsPerDay: (response.mealsPerDay as MealsPerDay) || DEFAULT_SETTINGS.mealsPerDay,
          fastingType: (response.fastingType as FastingType) || DEFAULT_SETTINGS.fastingType,
          dailyGoals: parsedDailyGoals,
          eatingStartTime: response.eatingStartTime || DEFAULT_SETTINGS.eatingStartTime,
          repeatMeals: (response.repeatMeals as RepeatMeals) || DEFAULT_SETTINGS.repeatMeals,
          foodListSource: (response.foodListSource as FoodListSource) || DEFAULT_SETTINGS.foodListSource
        };
        this.settingsSignal.set(settings);
        this.loadedSignal.set(true);
        this.loadingSignal.set(false);
        return settings;
      }),
      catchError(error => {
        console.error('Failed to load user settings:', error);
        this.loadingSignal.set(false);
        // Return defaults on error
        return of(DEFAULT_SETTINGS);
      })
    );
  }

  /** Save settings to API */
  saveSettings(): Observable<UserSettings> {
    const current = this.settingsSignal();
    // API expects dailyGoals as a JSON string, not an object
    // defaultFoodList is required by the database (cannot be NULL)
    const payload = {
      defaultFoodList: 'yeh_approved',
      mealsPerDay: current.mealsPerDay,
      fastingType: current.fastingType,
      dailyGoals: JSON.stringify(current.dailyGoals),
      eatingStartTime: current.eatingStartTime,
      repeatMeals: current.repeatMeals,
      foodListSource: current.foodListSource
    };
    return this.http.put<UserSettingsResponse>(`${this.API_BASE_URL}/user/settings`, payload).pipe(
      map(() => current),
      catchError(error => {
        console.error('Failed to save user settings:', error);
        throw error;
      })
    );
  }

  /** Update meals per day */
  setMealsPerDay(value: MealsPerDay): void {
    this.settingsSignal.update(settings => ({
      ...settings,
      mealsPerDay: value
    }));
  }

  /** Update fasting type */
  setFastingType(value: FastingType): void {
    this.settingsSignal.update(settings => ({
      ...settings,
      fastingType: value
    }));
  }

  /** Update eating start time */
  setEatingStartTime(value: string): void {
    this.settingsSignal.update(settings => ({
      ...settings,
      eatingStartTime: value
    }));
  }

  /** Update repeat meals */
  setRepeatMeals(value: RepeatMeals): void {
    this.settingsSignal.update(settings => ({
      ...settings,
      repeatMeals: value
    }));
  }

  /** Update food list source */
  setFoodListSource(value: FoodListSource): void {
    this.settingsSignal.update(settings => ({
      ...settings,
      foodListSource: value
    }));
  }

  /** Update daily goals */
  setDailyGoals(goals: DailyGoals): void {
    this.settingsSignal.update(settings => ({
      ...settings,
      dailyGoals: goals
    }));
  }

  /** Update a single daily goal field */
  updateDailyGoal(field: keyof DailyGoals, value: number): void {
    this.settingsSignal.update(settings => ({
      ...settings,
      dailyGoals: {
        ...settings.dailyGoals,
        [field]: value
      }
    }));
  }

  /** Update multiple settings at once */
  updateSettings(partial: Partial<UserSettings>): void {
    this.settingsSignal.update(settings => ({
      ...settings,
      ...partial
    }));
  }

  /** Reset settings to defaults */
  resetToDefaults(): void {
    this.settingsSignal.set(DEFAULT_SETTINGS);
  }
}
