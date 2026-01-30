// src/app/services/macros.service.ts
// Service for macro nutrient display data - will evolve to support contextual display modes
import { Injectable, inject, effect } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NutritionResponse, TimePeriod } from '../models/nutrition.model';
import { PreferencesService } from './preferences.service';

@Injectable({
  providedIn: 'root'
})
export class MacrosService {
  private preferencesService = inject(PreferencesService);

  // Current time period selection (day/week toggle)
  private currentPeriodSubject = new BehaviorSubject<TimePeriod>('day');
  readonly currentPeriod$ = this.currentPeriodSubject.asObservable();

  // Nutrition data — targets are synced from PreferencesService dailyGoals
  private nutritionData: NutritionResponse = {
    nutrients: {
      protein: {
        'target-percent': 30,
        'target-grams': 150,
        'actual-day': 113,
        'actual-week': 945
      },
      fat: {
        'target-percent': 35,
        'target-grams': 78,
        'actual-day': 35,
        'actual-week': 468
      },
      carb: {
        'target-percent': 35,
        'target-grams': 175,
        'actual-day': 39,
        'actual-week': 980
      }
    }
  };

  constructor() {
    // Sync targets from dailyGoals whenever they change
    effect(() => {
      const goals = this.preferencesService.dailyGoals();
      if (!goals) return;
      if (goals.protein) this.nutritionData.nutrients.protein['target-grams'] = goals.protein;
      if (goals.carbs) this.nutritionData.nutrients.carb['target-grams'] = goals.carbs;
      if (goals.fat) this.nutritionData.nutrients.fat['target-grams'] = goals.fat;

      // Recompute target percentages from calories if available
      if (goals.calories && goals.calories > 0) {
        this.nutritionData.nutrients.protein['target-percent'] = Math.round((goals.protein * 4 / goals.calories) * 100);
        this.nutritionData.nutrients.carb['target-percent'] = Math.round((goals.carbs * 4 / goals.calories) * 100);
        this.nutritionData.nutrients.fat['target-percent'] = Math.round((goals.fat * 9 / goals.calories) * 100);
      }

      // Notify subscribers by re-emitting current period
      this.currentPeriodSubject.next(this.currentPeriodSubject.value);
    });
  }

  /** Set the current time period for display */
  setTimePeriod(period: TimePeriod): void {
    this.currentPeriodSubject.next(period);
  }

  /** Get the current time period */
  getCurrentTimePeriod(): TimePeriod {
    return this.currentPeriodSubject.value;
  }

  /** Get current nutrition data (synchronous) */
  getCurrentNutritionData(): NutritionResponse {
    return this.nutritionData;
  }
}
