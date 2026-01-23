// src/app/services/macros.service.ts
// Service for macro nutrient display data - will evolve to support contextual display modes
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NutritionResponse, TimePeriod } from '../models/nutrition.model';

@Injectable({
  providedIn: 'root'
})
export class MacrosService {

  // Current time period selection (day/week toggle)
  private currentPeriodSubject = new BehaviorSubject<TimePeriod>('day');
  readonly currentPeriod$ = this.currentPeriodSubject.asObservable();

  // Static nutrition data for development - will be replaced with API data
  private staticNutritionData: NutritionResponse = {
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
    return this.staticNutritionData;
  }
}
