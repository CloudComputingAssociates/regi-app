// src/app/components/macros/macros.ts
import { Component, OnInit, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MacrosService } from '../../services/macros.service';
import { PreferencesService } from '../../services/preferences.service';
import { TabService } from '../../services/tab.service';
import { TimePeriod, NutritionResponse } from '../../models/nutrition.model';

// Context determines how the macros component behaves
export type MacrosContext = 'preferences' | 'foods' | 'regimenu' | 'today' | 'shopping' | 'default';

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

          <!-- Macro Nutrients Row with Mode Toggle -->
          <div class="macro-row">

            <!-- Iterate through each macro nutrient -->
            @for (macro of effectiveDisplayData().macros; track macro.name) {
              <div class="macro-item">
                <div class="custom-progress-container">
                  <div class="custom-progress-track">
                    <div
                      class="custom-progress-fill"
                      [style.width.%]="macro.percentage"
                      [style.background]="getMacroGradient(macro.name)">
                      <span class="bar-value">{{ getBarDisplayValue(macro) }}</span>
                    </div>
                    <span class="bar-title">{{ macro.name }}</span>
                  </div>
                </div>
              </div>
            }

            <!-- Right-side controls -->
            <div class="mode-toggle-container">
              @if (context() === 'preferences') {
                <div class="unit-toggle">
                  <span class="unit-label left">%</span>
                  <span class="unit-thumb right"></span>
                  <span class="unit-label right">G</span>
                </div>
              } @else {
                <button
                  type="button"
                  class="unit-toggle"
                  (click)="toggleDisplayMode()">
                  <span class="unit-label left">%</span>
                  <span class="unit-thumb" [class.right]="!showPercent"></span>
                  <span class="unit-label right">G</span>
                </button>
              }
            </div>


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
  private tabService = inject(TabService);

  // Derive context from active tab
  readonly context = computed<MacrosContext>(() => {
    const tabId = this.tabService.activeTabId();
    if (!tabId) return 'default';
    if (tabId === 'preferences') return 'preferences';
    if (tabId === 'foods') return 'foods';
    if (tabId === 'regimenu') return 'regimenu';
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

  // Signal for subscription-based display data (non-preferences contexts)
  private subscriptionData = signal<MacroDisplayData>({ macros: [], timePeriod: 'day' });

  // Combined display: picks preferences signal or subscription-based data
  readonly effectiveDisplayData = computed<MacroDisplayData>(() => {
    if (this.context() === 'preferences') {
      return this.preferencesDisplayData();
    }
    return this.subscriptionData();
  });

  // Component state
  isLoading = false;
  showPercent = true;

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

  toggleDisplayMode(): void {
    this.showPercent = !this.showPercent;
  }

  /**
   * Get the value to display inside the progress bar
   */
  getBarDisplayValue(macro: MacroNutrient): string {
    if (this.context() === 'preferences') {
      return `${macro.target}g`;
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
      case 'carbs': return '#81612e';
      default: return '#5a62b3';
    }
  }

  getMacroGradient(macroName: string): string {
    const color = this.getMacroColor(macroName);
    return `linear-gradient(to right, ${color}66, ${color})`;
  }

}
