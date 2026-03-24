// src/app/services/week-plan-macros.service.ts
// Lightweight signal service for sharing macro totals between
// week-plan-panel, meal-picker, and macros component.
import { Injectable, signal } from '@angular/core';

export interface MacroTotals {
  proteinG: number;
  fatG: number;
  carbG: number;
}

@Injectable({ providedIn: 'root' })
export class WeekPlanMacrosService {
  /** Current macro totals to display (from selected day or picker staging) */
  private totalsSignal = signal<MacroTotals>({ proteinG: 0, fatG: 0, carbG: 0 });
  readonly totals = this.totalsSignal.asReadonly();

  setTotals(totals: MacroTotals): void {
    this.totalsSignal.set(totals);
  }

  clear(): void {
    this.totalsSignal.set({ proteinG: 0, fatG: 0, carbG: 0 });
  }
}
