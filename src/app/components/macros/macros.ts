// src/app/components/macros/macros.ts
import { Component, OnInit, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MacrosService } from '../../services/macros.service';
import { PreferencesService } from '../../services/preferences.service';
import { PlanningService } from '../../services/planning.service';
import { TabService } from '../../services/tab.service';
import { WeekPlanMacrosService } from '../../services/week-plan-macros.service';
import { TodayService } from '../../services/today.service';
import { TimePeriod, NutritionResponse } from '../../models/nutrition.model';

// Context determines how the macros component behaves
export type MacrosContext = 'preferences' | 'foods' | 'regimenu' | 'weekplan' | 'today' | 'shopping' | 'default';

export interface MacroNutrient {
  name: string;
  percentage: number;
  actual: number;
  target: number;
}

export interface MacroDisplayData {
  macros: MacroNutrient[];
  timePeriod: TimePeriod;
}

@Component({
  selector: 'app-macros',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatProgressBarModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="macros-container">

      <mat-card class="indicators-card">
        <mat-card-content>

          <!-- Macro Nutrients Row -->
          <div class="macro-row">
            @for (macro of effectiveDisplayData().macros; track macro.name) {
              <div class="macro-item">
                <div class="custom-progress-container">
                  <div class="custom-progress-track">
                    <div
                      class="custom-progress-fill"
                      [style.width.%]="macro.percentage"
                      [style.background]="getMacroGradient(macro.name)">
                      @if (macro.percentage > 20) {
                        <span class="bar-value">{{ getBarDisplayValue(macro) }}</span>
                      }
                    </div>
                    @if (macro.percentage <= 20) {
                      <span class="bar-value-centered">{{ getBarDisplayValue(macro) }}</span>
                    }
                  </div>
                  <div class="label-row">
                    <span class="bar-label" [style.color]="getLabelColor(macro.name)">{{ macro.name }}</span>
                    @if ($last) {
                      <div class="mode-toggle-container">
                        <button
                          type="button"
                          class="unit-toggle"
                          (click)="toggleDisplayMode()"
                          matTooltip="Percent/Grams"
                          matTooltipPosition="above"
                          [matTooltipShowDelay]="300">
                          <span class="unit-label left">%</span>
                          <span class="unit-thumb" [class.right]="!showPercent"></span>
                          <span class="unit-label right">g</span>
                        </button>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>

        </mat-card-content>
      </mat-card>

      <!-- Content Area Below (optional) -->
      <div class="content-section">
        <ng-content></ng-content>
      </div>

      <!-- Loading State -->
      @if (isLoading) {
        <div class="loading-overlay">
          <div class="loading-spinner"></div>
        </div>
      }

    </div>
  `,
  styleUrls: ['./macros.scss']
})
export class MacrosComponent implements OnInit {

  private macrosService = inject(MacrosService);
  private preferencesService = inject(PreferencesService);
  private planningService = inject(PlanningService);
  private tabService = inject(TabService);
  private weekPlanMacros = inject(WeekPlanMacrosService);
  private todayService = inject(TodayService);

  // Derive context from active tab
  readonly context = computed<MacrosContext>(() => {
    const tabId = this.tabService.activeTabId();
    if (!tabId) return 'default';
    if (tabId === 'preferences') return 'preferences';
    if (tabId === 'foods') return 'foods';
    if (tabId === 'meal-planning') return 'regimenu';
    if (tabId === 'review') return 'weekplan';
    if (tabId === 'today') return 'today';
    if (tabId === 'shopping') return 'shopping';
    return 'default';
  });

  // Signal-based display data for preferences context (live from PreferencesService)
  readonly preferencesDisplayData = computed<MacroDisplayData>(() => {
    const goals = this.preferencesService.dailyGoals();
    return {
      macros: [
        { name: 'proteins', actual: 0, target: goals?.protein ?? 0, percentage: 100 },
        { name: 'fats', actual: 0, target: goals?.fat ?? 0, percentage: 100 },
        { name: 'carbs', actual: 0, target: goals?.carbs ?? 0, percentage: 100 }
      ],
      timePeriod: 'day'
    };
  });

  // Signal-based display data for regimenu context (live from PlanningService)
  readonly regimenuDisplayData = computed<MacroDisplayData>(() => {
    const meal = this.planningService.currentMeal();
    const goals = this.preferencesService.dailyGoals();
    const targetP = goals?.protein ?? 150;
    const targetF = goals?.fat ?? 78;
    const targetC = goals?.carbs ?? 175;

    const actualP = meal?.totalProteinG ?? 0;
    const actualF = meal?.totalFatG ?? 0;
    const actualC = meal?.totalCarbG ?? 0;

    return {
      macros: [
        { name: 'proteins', actual: Math.round(actualP), target: targetP, percentage: this.calculatePercentage(actualP, targetP) },
        { name: 'fats', actual: Math.round(actualF), target: targetF, percentage: this.calculatePercentage(actualF, targetF) },
        { name: 'carbs', actual: Math.round(actualC), target: targetC, percentage: this.calculatePercentage(actualC, targetC) },
      ],
      timePeriod: 'day'
    };
  });

  // Signal-based display data for week plan context
  readonly weekPlanDisplayData = computed<MacroDisplayData>(() => {
    const totals = this.weekPlanMacros.totals();
    const goals = this.preferencesService.dailyGoals();
    const targetP = goals?.protein ?? 150;
    const targetF = goals?.fat ?? 78;
    const targetC = goals?.carbs ?? 175;

    return {
      macros: [
        { name: 'proteins', actual: Math.round(totals.proteinG), target: targetP, percentage: this.calculatePercentage(totals.proteinG, targetP) },
        { name: 'fats', actual: Math.round(totals.fatG), target: targetF, percentage: this.calculatePercentage(totals.fatG, targetF) },
        { name: 'carbs', actual: Math.round(totals.carbG), target: targetC, percentage: this.calculatePercentage(totals.carbG, targetC) },
      ],
      timePeriod: 'day'
    };
  });

  // Signal-based display data for today context (live from checked items)
  readonly todayDisplayData = computed<MacroDisplayData>(() => {
    const checked = this.todayService.checkedMacros();
    const goals = this.preferencesService.dailyGoals();
    const targetP = goals?.protein ?? 150;
    const targetF = goals?.fat ?? 78;
    const targetC = goals?.carbs ?? 175;

    return {
      macros: [
        { name: 'proteins', actual: checked.protein, target: targetP, percentage: this.calculatePercentage(checked.protein, targetP) },
        { name: 'fats', actual: checked.fat, target: targetF, percentage: this.calculatePercentage(checked.fat, targetF) },
        { name: 'carbs', actual: checked.carbs, target: targetC, percentage: this.calculatePercentage(checked.carbs, targetC) },
      ],
      timePeriod: 'day'
    };
  });

  // Signal for subscription-based display data (non-preferences contexts)
  private subscriptionData = signal<MacroDisplayData>({ macros: [], timePeriod: 'day' });

  // Combined display: picks context-appropriate data source
  // Zero display for shopping context
  private static readonly ZERO_MACROS: MacroDisplayData = {
    macros: [
      { name: 'proteins', actual: 0, target: 0, percentage: 0 },
      { name: 'fats', actual: 0, target: 0, percentage: 0 },
      { name: 'carbs', actual: 0, target: 0, percentage: 0 }
    ],
    timePeriod: 'day'
  };

  readonly effectiveDisplayData = computed<MacroDisplayData>(() => {
    const ctx = this.context();
    if (ctx === 'preferences') return this.preferencesDisplayData();
    if (ctx === 'regimenu') return this.regimenuDisplayData();
    if (ctx === 'weekplan') return this.weekPlanDisplayData();
    if (ctx === 'today') return this.todayDisplayData();
    if (ctx === 'shopping') return MacrosComponent.ZERO_MACROS;
    return this.subscriptionData();
  });

  // Component state
  isLoading = false;

  ngOnInit(): void {
    this.subscriptionData.set(this.transformNutritionData(
      this.macrosService.getCurrentNutritionData()
    ));
  }

  /**
   * Transform nutrition response data for component display
   * Order: Protein, Carbs, Fat
   */
  private transformNutritionData(data: NutritionResponse): MacroDisplayData {
    const macros: MacroNutrient[] = [
      {
        name: 'proteins',
        actual: data.nutrients.protein['actual-day'],
        target: data.nutrients.protein['target-grams'],
        percentage: this.calculatePercentage(data.nutrients.protein['actual-day'], data.nutrients.protein['target-grams'])
      },
      {
        name: 'fats',
        actual: data.nutrients.fat['actual-day'],
        target: data.nutrients.fat['target-grams'],
        percentage: this.calculatePercentage(data.nutrients.fat['actual-day'], data.nutrients.fat['target-grams'])
      },
      {
        name: 'carbs',
        actual: data.nutrients.carb['actual-day'],
        target: data.nutrients.carb['target-grams'],
        percentage: this.calculatePercentage(data.nutrients.carb['actual-day'], data.nutrients.carb['target-grams'])
      }
    ];

    return { macros, timePeriod: 'day' };
  }

  /**
   * Calculate progress percentage, capped at 100%
   */
  private calculatePercentage(actual: number, target: number): number {
    if (target === 0) return 0;
    return Math.min(Math.round((actual / target) * 100), 100);
  }

  get showPercent(): boolean {
    return this.preferencesService.showPercent();
  }

  toggleDisplayMode(): void {
    this.preferencesService.showPercent.update(v => !v);
  }

  /**
   * Get the value to display inside the progress bar
   */
  getBarDisplayValue(macro: MacroNutrient): string {
    const ctx = this.context();
    if (ctx === 'preferences') {
      if (this.showPercent) {
        const calories = this.preferencesService.dailyGoals()?.calories;
        if (calories && calories > 0) {
          const calPerGram = macro.name === 'fats' ? 9 : 4;
          const pct = Math.round((macro.target * calPerGram / calories) * 100);
          return `${pct}%`;
        }
        return '0%';
      }
      return `${macro.target}g`;
    }
    if (ctx === 'regimenu' || ctx === 'weekplan') {
      return this.showPercent ? `${macro.percentage}%` : `${macro.actual}g`;
    }
    return this.showPercent ? `${macro.percentage}%` : `${macro.actual}g`;
  }

  /**
   * Get fixed color for each macro type
   */
  getMacroColor(macroName: string): string {
    switch (macroName) {
      case 'proteins': return '#41ac17';
      case 'fats': return '#902ee3';
      case 'carbs': return '#e67300';
      default: return '#5a62b3';
    }
  }

  getMacroGradient(macroName: string): string {
    const color = this.getMacroColor(macroName);
    return `linear-gradient(to right, ${color}66, ${color})`;
  }

  /**
   * Get label color - same as bar, slightly brighter for fats/carbs
   */
  getLabelColor(macroName: string): string {
    switch (macroName) {
      case 'proteins': return '#41ac17';
      case 'fats': return '#c060ff';
      case 'carbs': return '#ffb347';
      default: return '#5a62b3';
    }
  }

}
