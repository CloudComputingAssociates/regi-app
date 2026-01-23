// src/app/services/preferences.service.ts
// Service for managing user application preferences (mealsPerDay, fastingType, dailyGoals, etc.)
// API: /user/preferences (GET/PUT)
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  GetPreferencesResponse,
  DailyGoals,
  UpdatePreferencesRequest,
} from '../models/generated/preferences.schema';

// Re-export generated types for consumers
export type { DailyGoals, GetPreferencesResponse, UpdatePreferencesRequest };

// Narrower types for better type safety in the UI
export type MealsPerDay = 1 | 2 | 3 | 4 | 5 | 6;
export type FastingType = 'none' | '16_8' | '18_6' | '20_4' | 'omad';
export type RepeatMeals = 1 | 2 | 3 | 4;
export type FoodListSource = 'yeh_plus_myfoods' | 'yeh' | 'myfoods';

// Local preferences with parsed dailyGoals (API returns as JSON string)
export interface Preferences {
  mealsPerDay: MealsPerDay;
  fastingType: FastingType;
  dailyGoals: DailyGoals;
  eatingStartTime: string;  // 24-hour format "HH:MM"
  repeatMeals: RepeatMeals;
  foodListSource: FoodListSource;
}

const DEFAULT_DAILY_GOALS: DailyGoals = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  fiber: 30,
  sodium: 2300
};

const DEFAULT_PREFERENCES: Preferences = {
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
export class PreferencesService {
  private http = inject(HttpClient);
  private readonly API_BASE_URL = environment.apiUrl;

  private preferencesSignal = signal<Preferences>(DEFAULT_PREFERENCES);
  private loadingSignal = signal(false);
  private loadedSignal = signal(false);

  /** Read-only access to all preferences */
  readonly preferences = this.preferencesSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly isLoaded = this.loadedSignal.asReadonly();

  /** Convenience accessors */
  readonly mealsPerDay = computed(() => this.preferencesSignal().mealsPerDay);
  readonly fastingType = computed(() => this.preferencesSignal().fastingType);
  readonly dailyGoals = computed(() => this.preferencesSignal().dailyGoals);
  readonly eatingStartTime = computed(() => this.preferencesSignal().eatingStartTime);
  readonly repeatMeals = computed(() => this.preferencesSignal().repeatMeals);
  readonly foodListSource = computed(() => this.preferencesSignal().foodListSource);

  /** Load preferences from API */
  loadPreferences(): Observable<Preferences> {
    if (this.loadedSignal()) {
      return of(this.preferencesSignal());
    }

    this.loadingSignal.set(true);
    return this.http.get<GetPreferencesResponse>(`${this.API_BASE_URL}/user/preferences`).pipe(
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

        const preferences: Preferences = {
          mealsPerDay: (response.mealsPerDay as MealsPerDay) || DEFAULT_PREFERENCES.mealsPerDay,
          fastingType: (response.fastingType as FastingType) || DEFAULT_PREFERENCES.fastingType,
          dailyGoals: parsedDailyGoals,
          eatingStartTime: response.eatingStartTime || DEFAULT_PREFERENCES.eatingStartTime,
          repeatMeals: (response.repeatMeals as RepeatMeals) || DEFAULT_PREFERENCES.repeatMeals,
          foodListSource: (response.foodListSource as FoodListSource) || DEFAULT_PREFERENCES.foodListSource
        };
        this.preferencesSignal.set(preferences);
        this.loadedSignal.set(true);
        this.loadingSignal.set(false);
        return preferences;
      }),
      catchError(error => {
        console.error('Failed to load user preferences:', error);
        this.loadingSignal.set(false);
        // Return defaults on error
        return of(DEFAULT_PREFERENCES);
      })
    );
  }

  /** Save preferences to API */
  savePreferences(): Observable<Preferences> {
    const current = this.preferencesSignal();
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
    return this.http.put<GetPreferencesResponse>(`${this.API_BASE_URL}/user/preferences`, payload).pipe(
      map(() => current),
      catchError(error => {
        console.error('Failed to save user preferences:', error);
        throw error;
      })
    );
  }

  /** Update meals per day */
  setMealsPerDay(value: MealsPerDay): void {
    this.preferencesSignal.update(prefs => ({
      ...prefs,
      mealsPerDay: value
    }));
  }

  /** Update fasting type */
  setFastingType(value: FastingType): void {
    this.preferencesSignal.update(prefs => ({
      ...prefs,
      fastingType: value
    }));
  }

  /** Update eating start time */
  setEatingStartTime(value: string): void {
    this.preferencesSignal.update(prefs => ({
      ...prefs,
      eatingStartTime: value
    }));
  }

  /** Update repeat meals */
  setRepeatMeals(value: RepeatMeals): void {
    this.preferencesSignal.update(prefs => ({
      ...prefs,
      repeatMeals: value
    }));
  }

  /** Update food list source */
  setFoodListSource(value: FoodListSource): void {
    this.preferencesSignal.update(prefs => ({
      ...prefs,
      foodListSource: value
    }));
  }

  /** Update daily goals */
  setDailyGoals(goals: DailyGoals): void {
    this.preferencesSignal.update(prefs => ({
      ...prefs,
      dailyGoals: goals
    }));
  }

  /** Update a single daily goal field */
  updateDailyGoal(field: keyof DailyGoals, value: number): void {
    this.preferencesSignal.update(prefs => ({
      ...prefs,
      dailyGoals: {
        ...prefs.dailyGoals,
        [field]: value
      }
    }));
  }

  /** Update multiple preferences at once */
  updatePreferences(partial: Partial<Preferences>): void {
    this.preferencesSignal.update(prefs => ({
      ...prefs,
      ...partial
    }));
  }

  /** Reset preferences to defaults */
  resetToDefaults(): void {
    this.preferencesSignal.set(DEFAULT_PREFERENCES);
  }
}
