// src/app/services/this-week-macros.service.ts
// Lightweight signal service for sharing This Week macro totals between
// foods-panel (the producer, summing the local "This Week" food list)
// and the shared macros component (the consumer).
import { Injectable, signal } from '@angular/core';

export interface MacroTotals {
  proteinG: number;
  fiberG: number;
  fatG: number;
  carbG: number;
}

@Injectable({ providedIn: 'root' })
export class ThisWeekMacrosService {
  private totalsSignal = signal<MacroTotals>({ proteinG: 0, fiberG: 0, fatG: 0, carbG: 0 });
  readonly totals = this.totalsSignal.asReadonly();

  setTotals(totals: MacroTotals): void {
    this.totalsSignal.set(totals);
  }

  clear(): void {
    this.totalsSignal.set({ proteinG: 0, fiberG: 0, fatG: 0, carbG: 0 });
  }
}
