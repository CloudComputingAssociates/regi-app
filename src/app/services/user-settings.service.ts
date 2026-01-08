// src/app/services/user-settings.service.ts
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';
import { environment } from '../../environments/environment';

export type MealsPerDay = 1 | 2 | 3 | 4 | 5 | 6;
export type FastingType = 'none' | '16:8' | '18:6' | '20:4' | 'omad';

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
}

// API response format
interface UserSettingsResponse {
  mealsPerDay: number;
  fastingType: string;
  dailyGoals?: DailyGoals;
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
  dailyGoals: DEFAULT_DAILY_GOALS
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

  /** Load settings from API */
  loadSettings(): Observable<UserSettings> {
    if (this.loadedSignal()) {
      return of(this.settingsSignal());
    }

    this.loadingSignal.set(true);
    return this.http.get<UserSettingsResponse>(`${this.API_BASE_URL}/user/settings`).pipe(
      map(response => {
        const settings: UserSettings = {
          mealsPerDay: (response.mealsPerDay as MealsPerDay) || DEFAULT_SETTINGS.mealsPerDay,
          fastingType: (response.fastingType as FastingType) || DEFAULT_SETTINGS.fastingType,
          dailyGoals: response.dailyGoals || DEFAULT_DAILY_GOALS
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
    return this.http.put<UserSettingsResponse>(`${this.API_BASE_URL}/user/settings`, current).pipe(
      map(() => {
        console.log('User settings saved:', current);
        return current;
      }),
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
