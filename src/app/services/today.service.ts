// src/app/services/today.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DailyLogItem {
  id: number;
  foodId: number;
  foodName: string;
  mealSlot: number;
  quantity: number;
  unit: string;
  calories?: number;
  proteinG?: number;
  fatG?: number;
  carbG?: number;
  fiberG?: number;
  sodiumMg?: number;
  isOverride: boolean;
  originalFoodId?: number;
  originalFoodName?: string;
  isChecked: boolean;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sodium: number;
}

export interface TodayResponse {
  id: number;
  logDate: string;
  sourcePlanId?: number;
  swapCount: number;
  canSwap: boolean;
  nutritionTargets?: NutritionTargets;
  totalCalories?: number;
  totalProteinG?: number;
  totalFatG?: number;
  totalCarbG?: number;
  totalFiberG?: number;
  totalSodiumMg?: number;
  items: DailyLogItem[];
  finalizedAt?: string;
  planName?: string;
  planStartDate?: string;
  weekPlanId?: number;
  mealNames?: Record<number, string>;
  mealVideoLinks?: Record<number, string>;
  waterOzConsumed?: number;
}

@Injectable({
  providedIn: 'root'
})
export class TodayService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  private todaySignal = signal<TodayResponse | null>(null);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  readonly today = this.todaySignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  // Checked macro totals — updated by today-panel when items are checked/unchecked
  readonly checkedMacros = signal<{ protein: number; fat: number; carbs: number }>({ protein: 0, fat: 0, carbs: 0 });

  // Date cache for instant arrow navigation
  private cache = new Map<string, TodayResponse>();

  async fetchToday(date?: string): Promise<TodayResponse | null> {
    const key = date ?? this.todayKey();

    // Return cached if available (don't show loading spinner)
    const cached = this.cache.get(key);
    if (cached) {
      this.todaySignal.set(cached);
      return cached;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      const url = date
        ? `${this.baseUrl}/today?date=${date}`
        : `${this.baseUrl}/today`;
      const resp = await firstValueFrom(
        this.http.get<TodayResponse>(url)
      );
      this.cache.set(key, resp);
      this.todaySignal.set(resp);
      return resp;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load today';
      this.errorSignal.set(msg);
      return null;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /** Preload a week's worth of days around the given date */
  preloadWeek(startDate: string): void {
    const start = new Date(startDate + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = this.formatDate(d);
      if (!this.cache.has(key)) {
        // Fire and forget — populate cache in background
        const url = `${this.baseUrl}/today?date=${key}`;
        firstValueFrom(this.http.get<TodayResponse>(url))
          .then(resp => this.cache.set(key, resp))
          .catch(() => {}); // silently skip failed days
      }
    }
  }

  /** Invalidate cache for a specific date (e.g., after checking items) */
  invalidateCache(date?: string): void {
    if (date) {
      this.cache.delete(date);
    } else {
      this.cache.clear();
    }
  }

  private todayKey(): string {
    return this.formatDate(new Date());
  }

  private formatDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async checkItem(itemId: number, isChecked: boolean): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.patch(`${this.baseUrl}/today/items/${itemId}/check`, { isChecked })
      );
      return true;
    } catch {
      return false;
    }
  }

  async checkMeal(mealSlot: number, isChecked: boolean): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.patch(`${this.baseUrl}/today/meals/${mealSlot}/check`, { isChecked })
      );
      return true;
    } catch {
      return false;
    }
  }

  async updateWater(ozConsumed: number): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.patch(`${this.baseUrl}/today/water`, { ozConsumed })
      );
      // Update the local signal
      const current = this.todaySignal();
      if (current) {
        this.todaySignal.set({ ...current, waterOzConsumed: ozConsumed });
      }
      return true;
    } catch {
      return false;
    }
  }

  async finalizeToday(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/today/finalize`, {})
      );
      // Refresh to get finalizedAt
      await this.fetchToday();
      return true;
    } catch {
      return false;
    }
  }
}
