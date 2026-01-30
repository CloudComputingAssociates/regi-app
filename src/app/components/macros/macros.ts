// src/app/components/macros/macros.ts
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject, computed, signal, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MacrosService } from '../../services/macros.service';
import { PreferencesService } from '../../services/preferences.service';
import { TabService } from '../../services/tab.service';
import { TimePeriod, NutritionResponse } from '../../models/nutrition.model';

// Context determines how the macros component behaves
export type MacrosContext = 'preferences' | 'foods' | 'regimenu' | 'today' | 'shopping' | 'default';

// Display modes for macros component
export type MacrosDisplayMode = 'day' | 'week' | 'food' | 'mealplan' | 'dayplan';

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
                <div class="macro-title">{{ macro.name }}</div>
                <div class="custom-progress-container">
                  <div class="custom-progress-track">
                    <div
                      class="custom-progress-fill"
                      [style.width.%]="macro.percentage"
                      [style.background-color]="context() === 'preferences' ? '#10b981' : getMacroColor(macro.name, macro.percentage)">
                    </div>
                  </div>
                  <div class="limit-marker"></div>
                  <span class="target-label">{{ macro.target }}</span>
                </div>

                <!-- Value Label -->
                @if (context() === 'preferences') {
                } @else if (!isPlanningMode()) {
                  <button
                    type="button"
                    class="value-label clickable"
                    (click)="toggleDisplayMode()"
                    matTooltip="Toggle Percent/Grams"
                    matTooltipPosition="below">
                    @if (showPercent) {
                      {{ macro.percentage }}%
                    } @else {
                      {{ macro.actual }}g
                    }
                  </button>
                } @else {
                  <div class="value-label">
                    @if (showPercent) {
                      {{ macro.percentage }}%
                    } @else {
                      {{ macro.actual }}g
                    }
                  </div>
                }
              </div>
            }

            <!-- Mode Toggle (Right) - Label on top, arrow button below -->
            @if (context() !== 'preferences') {
            <div class="mode-toggle-container">
              @if (!isPlanningMode()) {
                <span class="mode-label">{{ currentTimePeriod === 'day' ? 'Day' : 'Week' }}</span>
                <button
                  type="button"
                  class="arrow-btn"
                  (click)="toggleTimePeriod()"
                  matTooltip="Toggle between Day and Week totals"
                  matTooltipPosition="below">
                  ▶
                </button>
              } @else {
                <span class="mode-label">{{ getPlanningModeLabel() }}</span>
                <button
                  type="button"
                  class="arrow-btn"
                  (click)="cyclePlanningMode()"
                  matTooltip="Toggle planning display mode"
                  matTooltipPosition="below">
                  ▶
                </button>
              }
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
export class MacrosComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();
  private macrosService = inject(MacrosService);
  private preferencesService = inject(PreferencesService);
  private tabService = inject(TabService);

  // Input to indicate if we're in planning mode
  planningMode = input<boolean>(false);

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
        { name: 'Protein', actual: 0, target: goals?.protein ?? 0, percentage: 100 },
        { name: 'Carbs', actual: 0, target: goals?.carbs ?? 0, percentage: 100 },
        { name: 'Fat', actual: 0, target: goals?.fat ?? 0, percentage: 100 }
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
  currentTimePeriod: TimePeriod = 'day';
  isLoading = false;
  currentPlanningDisplayMode: MacrosDisplayMode = 'food';
  showPercent = true;

  ngOnInit(): void {
    // Get initial static data immediately
    this.subscriptionData.set(this.transformNutritionData(
      this.macrosService.getCurrentNutritionData(),
      'day'
    ));
    this.currentTimePeriod = 'day';

    // Listen for time period changes (for non-preferences contexts)
    this.macrosService.currentPeriod$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(timePeriod => {
      this.currentTimePeriod = timePeriod;
      this.subscriptionData.set(this.transformNutritionData(
        this.macrosService.getCurrentNutritionData(),
        timePeriod
      ));
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Transform nutrition response data for component display
   * Order: Protein, Carbs, Fat
   */
  private transformNutritionData(
    data: NutritionResponse,
    timePeriod: TimePeriod
  ): MacroDisplayData {
    const macros: MacroNutrient[] = [
      {
        name: 'Protein',
        actual: timePeriod === 'day' ? data.nutrients.protein['actual-day'] : data.nutrients.protein['actual-week'],
        target: data.nutrients.protein['target-grams'],
        percentage: this.calculatePercentage(
          timePeriod === 'day' ? data.nutrients.protein['actual-day'] : data.nutrients.protein['actual-week'],
          data.nutrients.protein['target-grams']
        )
      },
      {
        name: 'Carbs',
        actual: timePeriod === 'day' ? data.nutrients.carb['actual-day'] : data.nutrients.carb['actual-week'],
        target: data.nutrients.carb['target-grams'],
        percentage: this.calculatePercentage(
          timePeriod === 'day' ? data.nutrients.carb['actual-day'] : data.nutrients.carb['actual-week'],
          data.nutrients.carb['target-grams']
        )
      },
      {
        name: 'Fat',
        actual: timePeriod === 'day' ? data.nutrients.fat['actual-day'] : data.nutrients.fat['actual-week'],
        target: data.nutrients.fat['target-grams'],
        percentage: this.calculatePercentage(
          timePeriod === 'day' ? data.nutrients.fat['actual-day'] : data.nutrients.fat['actual-week'],
          data.nutrients.fat['target-grams']
        )
      }
    ];

    return { macros, timePeriod };
  }

  /**
   * Calculate progress percentage, capped at 100%
   */
  private calculatePercentage(actual: number, target: number): number {
    if (target === 0) return 0;
    return Math.min(Math.round((actual / target) * 100), 100);
  }

  /**
   * Toggle between time periods (Today/Week)
   */
  toggleTimePeriod(): void {
    const newPeriod: TimePeriod = this.currentTimePeriod === 'day' ? 'week' : 'day';
    this.macrosService.setTimePeriod(newPeriod);
  }

  /**
   * Toggle between percent and grams display
   */
  toggleDisplayMode(): void {
    this.showPercent = !this.showPercent;
  }

  isPlanningMode(): boolean {
    return this.planningMode();
  }

  /**
   * Cycle through planning display modes: food -> mealplan -> dayplan -> food
   */
  cyclePlanningMode(): void {
    const modes: MacrosDisplayMode[] = ['food', 'mealplan', 'dayplan'];
    const currentIndex = modes.indexOf(this.currentPlanningDisplayMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.currentPlanningDisplayMode = modes[nextIndex];
  }

  /**
   * Get label for current planning mode
   */
  getPlanningModeLabel(): string {
    switch (this.currentPlanningDisplayMode) {
      case 'food': return 'Food';
      case 'mealplan': return 'MealPlan';
      case 'dayplan': return 'DayPlan';
      default: return 'Food';
    }
  }

  /**
   * Get Material Design color theme for progress bar
   */
  getMatColor(macroName: string, percentage: number): 'primary' | 'accent' | 'warn' {
    // Carbs use reverse logic (lower is better)
    if (macroName.toLowerCase() === 'carbs') {
      if (percentage <= 33) return 'primary';  // Green for low carbs
      if (percentage <= 66) return 'accent';   // Orange for moderate
      return 'warn';                           // Red for high carbs
    }

    // Protein and Fat use normal logic (higher is better)
    if (percentage <= 33) return 'warn';       // Red - needs attention
    if (percentage <= 66) return 'accent';     // Orange - making progress
    return 'primary';                          // Green - on track
  }

  /**
   * Get color based on macro type and percentage
   */
  getMacroColor(macroName: string, percentage: number): string {
    // Carbs use reverse color logic (lower is better)
    if (macroName.toLowerCase() === 'carbs') {
      if (percentage <= 33) return '#10b981'; // Green - good (low carbs)
      if (percentage <= 66) return '#f59e0b'; // Orange - moderate
      return '#ef4444';                        // Red - high (too many carbs)
    }

    // Protein and Fat use normal color logic (higher is better)
    if (percentage <= 33) return '#ef4444';   // Red - needs attention
    if (percentage <= 66) return '#f59e0b';   // Orange - making progress
    return '#10b981';                          // Green - on track
  }

}
