// src/app/components/preferences-panel/preferences-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, OnInit, AfterViewInit, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabService } from '../../services/tab.service';
import { NotificationService } from '../../services/notification.service';
import { PreferencesService, MealsPerDay, FastingType, DailyGoals, RepeatMeals, FoodListSource, WeekStartDay } from '../../services/preferences.service';
import { SettingsService } from '../../services/settings.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
@Component({
  selector: 'app-preferences-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container" #panelContainer>
      <!-- Confirmation dialog -->
      @if (showConfirmDialog()) {
        <div class="confirm-overlay" (click)="cancelClose()">
          <div class="confirm-dialog" (click)="$event.stopPropagation()">
            <p>You have unsaved changes. Close without saving?</p>
            <div class="confirm-buttons">
              <button class="confirm-btn discard" (click)="confirmClose()">Discard</button>
              <button class="confirm-btn cancel" (click)="cancelClose()">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- Top pane: Settings -->
      <div class="settings-pane" style="flex: 1 1 0%" #settingsPane (scroll)="onSettingsScroll()">
        @if (showScrollUp()) {
          <div class="scroll-hint scroll-hint-up">
            <span class="scroll-chevron">&#x25B2;</span>
          </div>
        }
        @if (showScrollDown()) {
          <div class="scroll-hint scroll-hint-down">
            <span class="scroll-chevron">&#x25BC;</span>
          </div>
        }
        <div class="panel-content">
          <!-- Action buttons -->
          <div class="action-buttons">
            <div class="action-right">
              <button
                class="icon-btn save-btn"
                [class.has-changes]="hasAnyChanges()"
                [disabled]="isSaving()"
                (click)="save()"
                matTooltip="Save"
                matTooltipPosition="above"
                [matTooltipShowDelay]="300">
                @if (isSaving()) {
                  <span class="save-spinner"></span>
                } @else {
                  ✓
                }
              </button>
              <button
                class="icon-btn close-btn"
                (click)="close()"
                matTooltip="Close"
                matTooltipPosition="above"
                [matTooltipShowDelay]="300">
                ✕
              </button>
            </div>
          </div>

          <div class="settings-wrapper">
            <!-- Personal Info -->
            <div class="accordion-section">
              <button class="accordion-header" (click)="personalInfoOpen.set(!personalInfoOpen())">
                <mat-icon class="accordion-arrow" [class.open]="personalInfoOpen()">chevron_right</mat-icon>
                <span class="accordion-title">Personal Info</span>
                <span class="accordion-control" (click)="$event.stopPropagation()">
                  <span class="pi-scale-label">Units</span>
                  <button class="unit-toggle" (click)="toggleUnits()">
                    {{ userSettingsService.useImperial() ? 'US' : 'metric' }}
                  </button>
                </span>
              </button>
              @if (personalInfoOpen()) {
              <div class="accordion-body">
              <div class="settings-section personal-info-section">
              <div class="pi-column">
                <div class="pi-row">
                  <label class="setting-label">DOB</label>
                  <input type="date" class="pi-input pi-date"
                    [ngModel]="userSettingsService.personalInfo().dateOfBirth || ''"
                    (ngModelChange)="onDateOfBirthChange($event)" />
                  <label class="setting-label pi-gap-left">Sex</label>
                  <select class="setting-select"
                    [ngModel]="userSettingsService.personalInfo().sex || ''"
                    (ngModelChange)="onSexChange($event)">
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div class="pi-row">
                  <label class="setting-label">Height</label>
                  @if (userSettingsService.useImperial()) {
                    <div class="height-imperial">
                      <input type="number" class="pi-input pi-small"
                        [ngModel]="heightFt()"
                        (ngModelChange)="onHeightFtChange($event)" />
                      <span class="unit-label">ft</span>
                      <input type="number" class="pi-input pi-small"
                        [ngModel]="heightIn()"
                        (ngModelChange)="onHeightInChange($event)" />
                      <span class="unit-label">in</span>
                    </div>
                  } @else {
                    <div class="height-metric">
                      <input type="number" class="pi-input pi-small"
                        [ngModel]="userSettingsService.personalInfo().heightCm || ''"
                        (ngModelChange)="onHeightCmChange($event)" />
                      <span class="unit-label">cm</span>
                    </div>
                  }
                </div>
                <div class="pi-row">
                  <label class="setting-label">Weight</label>
                  <div class="weight-row">
                    <input type="number" class="pi-input pi-small"
                      [ngModel]="currentWeightDisplay()"
                      (ngModelChange)="onCurrentWeightChange($event)" />
                    <span class="unit-label">{{ userSettingsService.useImperial() ? 'lbs' : 'kg' }}</span>
                  </div>
                  <label class="setting-label pi-gap-left">Goal</label>
                  <div class="weight-row">
                    <input type="number" class="pi-input pi-small"
                      [ngModel]="targetWeightDisplay()"
                      (ngModelChange)="onTargetWeightChange($event)" />
                    <span class="unit-label">{{ userSettingsService.useImperial() ? 'lbs' : 'kg' }}</span>
                    @if (goalWeightPctLabel()) {
                      <span class="goal-pct">{{ goalWeightPctLabel() }}</span>
                    }
                  </div>
                </div>
                <div class="pi-row">
                  <label class="setting-label">Activity</label>
                  <select class="setting-select"
                    [ngModel]="userSettingsService.personalInfo().activityLevel || ''"
                    (ngModelChange)="onActivityLevelChange($event)">
                    <option value="">—</option>
                    <option value="sedentary">Sedentary</option>
                    <option value="lightly_active">Lightly Active</option>
                    <option value="moderately_active">Mod. Active</option>
                    <option value="very_active">Very Active</option>
                    <option value="extremely_active">Ext. Active</option>
                  </select>
                </div>
                <div class="pi-last-updated">last updated {{ lastComputedDate() }}</div>
              </div>
            </div>
            </div>
            }
            </div>

            <!-- Nutrition Targets -->
            <div class="accordion-section">
              <button class="accordion-header" (click)="nutritionTargetsOpen.set(!nutritionTargetsOpen())">
                <mat-icon class="accordion-arrow" [class.open]="nutritionTargetsOpen()">chevron_right</mat-icon>
                <span class="accordion-title">Nutrition Targets</span>
                <span class="accordion-control" (click)="$event.stopPropagation()">
                  <label class="override-label">
                    <input type="checkbox"
                      [ngModel]="userSettingsService.dailyGoals().isOverridden"
                      (ngModelChange)="onOverrideChange($event)" />
                    User override
                  </label>
                  <span class="info-icon"
                        #overrideTooltip="matTooltip"
                        matTooltip="Nutrition Targets calculated by your Personal Info can be overridden for more granular control."
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="0"
                        (click)="overrideTooltip.toggle()">&#9432;</span>
                </span>
              </button>
              @if (nutritionTargetsOpen()) {
              <div class="accordion-body">
              <div class="settings-section">
              <div class="targets-column">
                <div class="targets-body" [class.targets-disabled]="!userSettingsService.dailyGoals().isOverridden">
                  <!-- Carb scale slider -->
                  <div class="macro-control-row">
                    <label class="setting-label">Carbs</label>
                    <input type="range" class="carb-slider"
                      [min]="0"
                      [max]="carbSliderMax()"
                      [ngModel]="carbSliderValue()"
                      (ngModelChange)="onCarbScaleChange($event)"
                      [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    <span class="slider-value">{{ carbSliderLabel() }}</span>
                  </div>
                  <!-- Protein ratio dropdown -->
                  <div class="macro-control-row">
                    <label class="setting-label">Proteins</label>
                    <select class="setting-select protein-select"
                      [ngModel]="userSettingsService.effectiveProteinRatio()"
                      (ngModelChange)="onProteinRatioChange($event)"
                      [disabled]="!userSettingsService.dailyGoals().isOverridden">
                      <option [ngValue]="0.5">0.5 g/lb</option>
                      <option [ngValue]="0.7">0.7 g/lb</option>
                      <option [ngValue]="0.8">0.8 g/lb</option>
                      <option [ngValue]="0.9">0.9 g/lb</option>
                      <option [ngValue]="1.0">1.0 g/lb</option>
                      <option [ngValue]="1.1">1.1 g/lb</option>
                      <option [ngValue]="1.2">1.2 g/lb</option>
                    </select>
                    <span class="macro-hint">of body weight</span>
                  </div>
                  <div class="macro-separator"></div>
                  <div class="calories-label-row">
                    <label>Calories</label>
                  </div>
                  <div class="calories-deficit-row">
                    <input type="number" class="cal-input"
                      [ngModel]="userSettingsService.dailyGoals().calories"
                      (ngModelChange)="onCaloriesChange($event)"
                      [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    <input type="number" class="deficit-input"
                      [ngModel]="deficitAbsValue()"
                      (ngModelChange)="onDeficitChange($event)"
                      [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    <span class="deficit-direction">{{ deficitDirectionLabel() }}</span>
                  </div>
                  <div class="weeks-to-goal">{{ weeksToGoalLabel() }}</div>
                  <div class="macro-separator"></div>
                  <div class="macro-grid">
                    <div class="target-field macro-protein">
                      <label>Proteins {{ userSettingsService.showPercent() ? '%' : 'G' }}</label>
                      <input type="number" [ngModel]="proteinDisplay()"
                             (ngModelChange)="onMacroFieldChange('protein', $event)"
                             [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    </div>
                    <div class="target-field macro-fat">
                      <label>Fats {{ userSettingsService.showPercent() ? '%' : 'G' }}</label>
                      <input type="number" [ngModel]="fatDisplay()"
                             (ngModelChange)="onMacroFieldChange('fat', $event)"
                             [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    </div>
                    <div class="target-field macro-carbs">
                      <label>Carbs {{ userSettingsService.showPercent() ? '%' : 'G' }}</label>
                      <input type="number" [ngModel]="carbsDisplay()"
                             (ngModelChange)="onMacroFieldChange('carbs', $event)"
                             [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    </div>
                    <svg viewBox="0 0 60 60" class="macro-pie" xmlns="http://www.w3.org/2000/svg">
                      @for (seg of pieChartSegments(); track seg.label) {
                        <path [attr.d]="seg.path" [attr.fill]="seg.color" />
                        <text [attr.x]="seg.labelX" [attr.y]="seg.labelY"
                          text-anchor="middle" dominant-baseline="central"
                          fill="#fff" font-size="9" font-weight="700">{{ seg.label }}</text>
                      }
                    </svg>
                    <div class="target-field">
                      <label>Fiber G</label>
                      <input type="number" [ngModel]="userSettingsService.dailyGoals().fiber"
                             (ngModelChange)="onDailyGoalChange('fiber', $event)"
                             [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    </div>
                    <div class="target-field">
                      <label>Sodium mg</label>
                      <input type="number" [ngModel]="userSettingsService.dailyGoals().sodium"
                             (ngModelChange)="onDailyGoalChange('sodium', $event)"
                             [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    </div>
                    <div class="target-field">
                      <label>Water (16oz)/day</label>
                      <input type="number" [ngModel]="waterGlasses()" disabled />
                    </div>
                  </div>
                  <div class="water-glasses-row">
                    @for (g of waterGlassesArray(); track g) {
                      <img src="/images/WaterGlassFull.png" alt="glass" class="water-glass-img" />
                    }
                  </div>
                </div>
              </div>
            </div>
            </div>
            }
            </div>

            <!-- RegiMenu + Planning -->
            <div class="accordion-section">
              <button class="accordion-header" (click)="planningOpen.set(!planningOpen())">
                <mat-icon class="accordion-arrow" [class.open]="planningOpen()">chevron_right</mat-icon>
                <span class="accordion-title">RegiMenu + Planning</span>
              </button>
              @if (planningOpen()) {
              <div class="accordion-body">
            <div class="settings-section bottom-row">
              <div class="plan-column">
                <div class="setting-row">
                  <label class="setting-label">Meals</label>
                  <select
                    class="setting-select"
                    [ngModel]="userSettingsService.mealsPerDay()"
                    (ngModelChange)="onMealsPerDayChange($event)">
                    <option [ngValue]="1">1 meal</option>
                    <option [ngValue]="2">2 meals</option>
                    <option [ngValue]="3">3 meals</option>
                    <option [ngValue]="4">4 meals</option>
                    <option [ngValue]="5">5 meals</option>
                    <option [ngValue]="6">6 meals</option>
                  </select>
                </div>
                <div class="setting-row">
                  <label class="setting-label">Fasting</label>
                  <select
                    class="setting-select"
                    [ngModel]="userSettingsService.fastingType()"
                    (ngModelChange)="onFastingTypeChange($event)">
                    <option value="none">None</option>
                    <option value="16_8">16:8</option>
                    <option value="18_6">18:6</option>
                    <option value="20_4">20:4</option>
                    <option value="omad">OMAD</option>
                  </select>
                </div>
                <div class="setting-row">
                  <label class="setting-label">Start at</label>
                  <select
                    class="setting-select time-select"
                    [ngModel]="userSettingsService.eatingStartTime()"
                    (ngModelChange)="onEatingStartTimeChange($event)">
                    @for (time of timeOptions; track time) {
                      <option [value]="time">{{ time }}</option>
                    }
                  </select>
                </div>
              </div>

              <div class="regimenu-column">
                <div class="setting-row">
                  <label class="setting-label">Week Starts</label>
                  <select
                    class="setting-select"
                    [ngModel]="userSettingsService.weekStartDay()"
                    (ngModelChange)="onWeekStartDayChange($event)">
                    <option value="sunday">Sunday</option>
                    <option value="monday">Monday</option>
                    <option value="tuesday">Tuesday</option>
                    <option value="wednesday">Wednesday</option>
                    <option value="thursday">Thursday</option>
                    <option value="friday">Friday</option>
                    <option value="saturday">Saturday</option>
                  </select>
                </div>
                <div class="setting-row">
                  <label class="setting-label">Meal Repeats</label>
                  <select
                    class="setting-select"
                    [ngModel]="userSettingsService.repeatMeals()"
                    (ngModelChange)="onRepeatMealsChange($event)">
                    <option [ngValue]="1">1</option>
                    <option [ngValue]="2">2</option>
                    <option [ngValue]="3">3</option>
                    <option [ngValue]="4">4</option>
                  </select>
                  <span class="info-icon"
                        #repeatTooltip="matTooltip"
                        matTooltip="By repeating day plans, you optimize grocery lists and reduce waste"
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="0"
                        (click)="repeatTooltip.toggle()">&#9432;</span>
                </div>
                <div class="setting-row">
                  <label class="setting-label">Foods from</label>
                  <select
                    class="setting-select"
                    [ngModel]="userSettingsService.foodListSource()"
                    (ngModelChange)="onFoodListSourceChange($event)">
                    <option value="yeh">YEH</option>
                    <option value="myfoods">MyFoods</option>
                  </select>
                  <span class="info-icon"
                        #foodsTooltip="matTooltip"
                        matTooltip="Choose from YEH Approved foods, or your own list. Go to Food Preferences panel, select YEH as a starter list and favorite (star) the ones you like. Click restricted on foods you cannot have."
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="0"
                        (click)="foodsTooltip.toggle()">&#9432;</span>
                </div>
              </div>
            </div>
            </div>
            }
            </div>
          </div>
        </div>
      </div>

    </div>
  `,
  styleUrls: ['./preferences-panel.scss']
})
export class PreferencesPanelComponent implements OnInit, AfterViewInit {
  private tabService = inject(TabService);
  protected userSettingsService = inject(PreferencesService);
  private settingsService = inject(SettingsService);
  private notificationService = inject(NotificationService);
  private el = inject(ElementRef);

  // Retry loading preferences when allSettings becomes available (handles page refresh race)
  private loadEffect = effect(() => {
    const all = this.settingsService.allSettings();
    if (all && !this.userSettingsService.isLoaded()) {
      this.userSettingsService.loadPreferences();
      this.tryStampOnLoad();
    }
  });

  isSaving = signal(false);
  showConfirmDialog = signal(false);
  settingsChanged = signal(false);
  // Accordion state
  personalInfoOpen = signal(true);
  nutritionTargetsOpen = signal(false);
  planningOpen = signal(false);

  // Scroll hint state
  showScrollUp = signal(false);
  showScrollDown = signal(false);

  // Generate 24-hour time options in 30-minute increments
  timeOptions: string[] = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2).toString().padStart(2, '0');
    const minutes = (i % 2 === 0) ? '00' : '30';
    return `${hours}:${minutes}`;
  });

  // Tracks when personal info was last modified — display format MM/DD/YYYY
  private lastComputedDateSignal = signal('');
  lastComputedDate = this.lastComputedDateSignal.asReadonly();
  private hasStampedOnLoad = false;

  /** Convert YYYY-MM-DD → MM/DD/YYYY for display */
  private static isoToDisplay(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${m}/${d}/${y}`;
  }

  /** Set today's date on display signal AND persist to personalInfo.lastUpdated */
  private stampLastUpdated(): void {
    const d = new Date();
    this.lastComputedDateSignal.set(
      `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
    );
    this.userSettingsService.stampPersonalInfoLastUpdated();
  }

  /** On initial load, read persisted lastUpdated from personalInfo */
  private tryStampOnLoad(): void {
    if (this.hasStampedOnLoad || !this.userSettingsService.isLoaded()) return;
    this.hasStampedOnLoad = true;
    const pi = this.userSettingsService.personalInfo();
    if (pi.lastUpdated) {
      this.lastComputedDateSignal.set(PreferencesPanelComponent.isoToDisplay(pi.lastUpdated));
    } else {
      this.stampLastUpdated();
    }
  }

  // Computed height in ft/in from stored cm
  heightFt = computed(() => {
    const cm = this.userSettingsService.personalInfo().heightCm;
    if (!cm) return '';
    return PreferencesService.cmToFtIn(cm).ft;
  });

  heightIn = computed(() => {
    const cm = this.userSettingsService.personalInfo().heightCm;
    if (!cm) return '';
    return PreferencesService.cmToFtIn(cm).inches;
  });

  currentWeightDisplay = computed(() => {
    const kg = this.userSettingsService.personalInfo().currentWeightKg;
    if (!kg) return '';
    return this.userSettingsService.useImperial() ? PreferencesService.kgToLbs(kg) : kg;
  });

  targetWeightDisplay = computed(() => {
    const kg = this.userSettingsService.personalInfo().targetWeightKg;
    if (!kg) return '';
    return this.userSettingsService.useImperial() ? PreferencesService.kgToLbs(kg) : kg;
  });

  // Water intake: half body weight (lbs) in oz, divided by 16oz glasses
  waterGlasses = computed(() => {
    const kg = this.userSettingsService.personalInfo().targetWeightKg;
    if (!kg) return 0;
    const lbs = PreferencesService.kgToLbs(kg);
    const oz = lbs / 2;
    return Math.round(oz / 16);
  });

  waterGlassesArray = computed(() => Array.from({ length: this.waterGlasses() }, (_, i) => i));

  waterOz = computed(() => {
    const kg = this.userSettingsService.personalInfo().targetWeightKg;
    if (!kg) return 0;
    const lbs = PreferencesService.kgToLbs(kg);
    return Math.round(lbs / 2);
  });

  deficitAbsValue = computed(() => {
    const pct = this.userSettingsService.personalInfo().deficitPercent;
    if (pct === undefined || pct === null) return 0;
    return Math.abs(pct);
  });

  deficitDirectionLabel = computed(() => {
    const pct = this.userSettingsService.personalInfo().deficitPercent;
    if (!pct || pct === 0) return '% deficit';
    return pct < 0 ? '% deficit' : '% surplus';
  });

  weeksToGoalLabel = computed(() => {
    const weeks = this.userSettingsService.computedWeeksToGoal() ?? 0;
    const tdee = this.userSettingsService.computedTDEE();
    const cals = this.userSettingsService.dailyGoals().calories;
    if (!tdee || !cals) return `${weeks} weeks to goal`;
    const gap = Math.abs(tdee - cals);
    const direction = tdee > cals ? 'deficit' : 'surplus';
    return `${weeks} weeks to goal at ${gap} cal ${direction}`;
  });

  /** Inline label: % mode shows "(-39.0%)", g mode shows "(-150 lbs)" or "(-68 kg)" */
  goalWeightPctLabel = computed(() => {
    const pi = this.userSettingsService.personalInfo();
    if (!pi.currentWeightKg || !pi.targetWeightKg) return '';
    const diffKg = pi.targetWeightKg - pi.currentWeightKg;
    if (Math.abs(diffKg) < 0.1) return '';

    if (this.userSettingsService.showPercent()) {
      const pct = (diffKg / pi.currentWeightKg) * 100;
      const sign = pct > 0 ? '+' : '';
      return `(${sign}${pct.toFixed(0)}%)`;
    }
    // Grams/absolute mode: show weight difference in lbs or kg
    if (this.userSettingsService.useImperial()) {
      const diffLbs = Math.round(diffKg / 0.453592);
      const sign = diffLbs > 0 ? '+' : '';
      return `(${sign}${diffLbs} lbs)`;
    }
    const diff = Math.round(diffKg);
    const sign = diff > 0 ? '+' : '';
    return `(${sign}${diff} kg)`;
  });

  /** Carb slider: shows grams in G mode, % of calories in % mode */
  carbSliderValue = computed(() => {
    const pi = this.userSettingsService.personalInfo();
    const grams = pi.carbScaleGrams ?? this.userSettingsService.defaultCarbGrams();
    if (!this.userSettingsService.showPercent()) return grams;
    const cals = this.userSettingsService.dailyGoals().calories;
    return cals ? Math.round((grams * 4 / cals) * 100) : 0;
  });

  carbSliderMax = computed(() => {
    if (this.userSettingsService.showPercent()) return 100;
    return this.userSettingsService.maxCarbGrams();
  });

  carbSliderLabel = computed(() => {
    const val = this.carbSliderValue();
    return this.userSettingsService.showPercent() ? `${val}%` : `${val}g`;
  });

  /** Display values for macro fields: grams in G mode, % of calories in % mode */
  proteinDisplay = computed(() => {
    const dg = this.userSettingsService.dailyGoals();
    if (!this.userSettingsService.showPercent()) return dg.protein;
    return dg.calories ? Math.round((dg.protein * 4 / dg.calories) * 100) : 0;
  });

  fatDisplay = computed(() => {
    const dg = this.userSettingsService.dailyGoals();
    if (!this.userSettingsService.showPercent()) return dg.fat;
    return dg.calories ? Math.round((dg.fat * 9 / dg.calories) * 100) : 0;
  });

  carbsDisplay = computed(() => {
    const dg = this.userSettingsService.dailyGoals();
    if (!this.userSettingsService.showPercent()) return dg.carbs;
    return dg.calories ? Math.round((dg.carbs * 4 / dg.calories) * 100) : 0;
  });

  /** Pie chart segments for P/F/C calorie distribution */
  pieChartSegments = computed(() => {
    const dg = this.userSettingsService.dailyGoals();
    const proteinCals = dg.protein * 4;
    const fatCals = dg.fat * 9;
    const carbsCals = dg.carbs * 4;
    const total = proteinCals + fatCals + carbsCals;
    if (total <= 0) return [];

    const raw = [
      { pct: proteinCals / total, color: '#41ac17', label: 'P' },
      { pct: fatCals / total, color: '#902ee3', label: 'F' },
      { pct: carbsCals / total, color: '#e67300', label: 'C' }
    ];

    const cx = 30, cy = 30, r = 25;
    let angle = -Math.PI / 2;
    return raw.filter(s => s.pct > 0.001).map(seg => {
      const start = angle;
      const sweep = seg.pct * 2 * Math.PI;
      const end = start + sweep;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const large = sweep > Math.PI ? 1 : 0;
      // For near-full circle, nudge end point slightly to avoid collapsed arc
      const path = seg.pct > 0.999
        ? `M ${cx},${cy - r} A ${r},${r} 0 1,1 ${cx - 0.01},${cy - r} Z`
        : `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${large},1 ${x2},${y2} Z`;
      const mid = start + sweep / 2;
      const lr = r * 0.6;
      angle = end;
      return { path, color: seg.color, label: seg.label, labelX: cx + lr * Math.cos(mid), labelY: cy + lr * Math.sin(mid) };
    });
  });

  ngOnInit(): void {
    this.userSettingsService.loadPreferences();
    this.tryStampOnLoad();
  }

  ngAfterViewInit(): void {
    // Initial check after content renders
    setTimeout(() => this.updateScrollHints(), 0);
  }

  onSettingsScroll(): void {
    this.updateScrollHints();
  }

  private updateScrollHints(): void {
    const pane = this.el.nativeElement.querySelector('.settings-pane') as HTMLElement;
    if (!pane) return;
    const threshold = 4;
    this.showScrollUp.set(pane.scrollTop > threshold);
    this.showScrollDown.set(pane.scrollTop + pane.clientHeight < pane.scrollHeight - threshold);
  }

  hasAnyChanges(): boolean {
    return this.settingsChanged();
  }

  // --- Personal Info handlers ---

  onSexChange(value: string): void {
    this.userSettingsService.setSex(value);
    this.syncMacros();
  }

  onDateOfBirthChange(value: string): void {
    this.userSettingsService.setDateOfBirth(value);
    this.syncMacros();
  }

  onHeightFtChange(ft: number): void {
    const inches = this.heightIn() || 0;
    this.userSettingsService.setHeightCm(PreferencesService.ftInToCm(ft, +inches));
    this.syncMacros();
  }

  onHeightInChange(inches: number): void {
    const ft = this.heightFt() || 0;
    this.userSettingsService.setHeightCm(PreferencesService.ftInToCm(+ft, inches));
    this.syncMacros();
  }

  onHeightCmChange(value: number): void {
    this.userSettingsService.setHeightCm(value);
    this.syncMacros();
  }

  onCurrentWeightChange(value: number): void {
    const kg = this.userSettingsService.useImperial() ? PreferencesService.lbsToKg(value) : value;
    this.userSettingsService.setCurrentWeightKg(kg);
    this.syncMacros();
  }

  onTargetWeightChange(value: number): void {
    const kg = this.userSettingsService.useImperial() ? PreferencesService.lbsToKg(value) : value;
    this.userSettingsService.setTargetWeightKg(kg);
    this.syncMacros();
  }

  onActivityLevelChange(value: string): void {
    this.userSettingsService.setActivityLevel(value);
    this.syncMacros();
  }

  /** User changed calories → reverse-compute deficit percent and rebalance fat */
  onCaloriesChange(newCals: number): void {
    if (!this.userSettingsService.dailyGoals().isOverridden) {
      this.userSettingsService.setIsOverridden(true);
    }
    this.userSettingsService.updateDailyGoal('calories', newCals);
    const tdee = this.userSettingsService.computedTDEE();
    if (tdee && tdee > 0) {
      this.userSettingsService.setDeficitPercent(Math.round(((newCals / tdee) - 1) * 100));
    }
    // Rebalance: fat absorbs the calorie change
    const dg = this.userSettingsService.dailyGoals();
    const newFat = Math.max(0, Math.round((newCals - dg.protein * 4 - dg.carbs * 4) / 9));
    this.userSettingsService.updateDailyGoal('fat', newFat);
    this.settingsChanged.set(true);
  }

  /** User changed deficit percent → compute calories from TDEE and rebalance fat */
  onDeficitChange(absValue: number): void {
    const currentPct = this.userSettingsService.personalInfo().deficitPercent ?? 0;
    const sign = currentPct >= 0 && currentPct !== 0 ? 1 : -1;
    const newPct = sign * Math.abs(absValue);
    this.userSettingsService.setDeficitPercent(newPct);
    const tdee = this.userSettingsService.computedTDEE();
    if (tdee) {
      const newCals = Math.round(tdee * (1 + newPct / 100));
      this.userSettingsService.updateDailyGoal('calories', newCals);
      // Rebalance: fat absorbs the calorie change
      const dg = this.userSettingsService.dailyGoals();
      const newFat = Math.max(0, Math.round((newCals - dg.protein * 4 - dg.carbs * 4) / 9));
      this.userSettingsService.updateDailyGoal('fat', newFat);
    }
    this.syncMacros();
  }

  toggleUnits(): void {
    this.userSettingsService.toggleUnits();
  }

  onProteinRatioChange(value: number): void {
    this.userSettingsService.setProteinRatio(+value);
    this.syncMacros();

    // Always flow computed protein into dailyGoals and rebalance fat
    const protein = this.userSettingsService.computedProteinGrams();
    if (protein !== null) {
      this.userSettingsService.updateDailyGoal('protein', protein);
      const dg = this.userSettingsService.dailyGoals();
      const newFat = Math.max(0, Math.round((dg.calories - dg.protein * 4 - dg.carbs * 4) / 9));
      this.userSettingsService.updateDailyGoal('fat', newFat);
    }
  }

  onCarbScaleChange(value: number): void {
    // Convert % → grams if in percent mode
    let grams = +value;
    if (this.userSettingsService.showPercent()) {
      const cals = this.userSettingsService.dailyGoals().calories;
      grams = cals ? Math.round((value / 100 * cals) / 4) : 0;
    }
    this.userSettingsService.setCarbScaleGrams(grams);
    this.syncMacros();

    // Always flow carbs + rebalanced fat into dailyGoals (even when overridden)
    this.userSettingsService.updateDailyGoal('carbs', grams);
    const dg = this.userSettingsService.dailyGoals();
    const newFat = Math.max(0, Math.round((dg.calories - dg.protein * 4 - dg.carbs * 4) / 9));
    this.userSettingsService.updateDailyGoal('fat', newFat);
  }

  private syncMacros(): void {
    this.userSettingsService.computeDeficitPercent();
    this.userSettingsService.syncComputedMacros();
    this.stampLastUpdated();
    this.settingsChanged.set(true);
  }

  // --- Existing handlers ---

  onOverrideChange(checked: boolean): void {
    if (checked) {
      this.userSettingsService.setIsOverridden(true);
      this.settingsChanged.set(true);
      return;
    }
    // Unchecking: confirm before resetting overrides
    this.notificationService.showConfirmation(
      'This will reset all Nutrition Target overrides to calculated defaults.',
      'warning',
      () => {
        // OK — reset to formula defaults
        this.userSettingsService.clearProteinRatio();
        this.userSettingsService.clearCarbScaleGrams();
        this.userSettingsService.setIsOverridden(false);
        this.syncMacros();
        this.settingsChanged.set(true);
      },
      () => {
        // Cancel — re-check the checkbox (keep overridden)
        this.userSettingsService.setIsOverridden(true);
      }
    );
  }

  /** User typed in a macro field (protein/fat/carbs) — auto-set override and rebalance.
   *  In % mode, converts percentage input to grams before storing. */
  onMacroFieldChange(field: keyof DailyGoals, value: number): void {
    if (!this.userSettingsService.dailyGoals().isOverridden) {
      this.userSettingsService.setIsOverridden(true);
    }

    // Convert % → grams if in percent mode
    let grams = value;
    if (this.userSettingsService.showPercent()) {
      const cals = this.userSettingsService.dailyGoals().calories;
      const calPerGram = field === 'fat' ? 9 : 4;
      grams = cals ? Math.round((value / 100 * cals) / calPerGram) : 0;
    }

    this.userSettingsService.updateDailyGoal(field, grams);

    // Keep carb slider in sync when carbs field changes
    if (field === 'carbs') {
      this.userSettingsService.setCarbScaleGrams(grams);
    }

    // Auto-rebalance: keep calories constant, adjust the complement
    const dg = this.userSettingsService.dailyGoals();
    const cals = dg.calories;

    if (field === 'protein' || field === 'carbs') {
      const newFat = Math.max(0, Math.round((cals - dg.protein * 4 - dg.carbs * 4) / 9));
      this.userSettingsService.updateDailyGoal('fat', newFat);
    } else if (field === 'fat') {
      const newCarbs = Math.max(0, Math.round((cals - dg.protein * 4 - dg.fat * 9) / 4));
      this.userSettingsService.updateDailyGoal('carbs', newCarbs);
    }

    this.settingsChanged.set(true);
  }

  onDailyGoalChange(field: keyof DailyGoals, value: number): void {
    this.userSettingsService.updateDailyGoal(field, value);
    this.settingsChanged.set(true);
  }

  onMealsPerDayChange(value: MealsPerDay): void {
    this.userSettingsService.setMealsPerDay(value);
    this.settingsChanged.set(true);
  }

  onFastingTypeChange(value: FastingType): void {
    this.userSettingsService.setFastingType(value);
    this.settingsChanged.set(true);
  }

  onEatingStartTimeChange(value: string): void {
    this.userSettingsService.setEatingStartTime(value);
    this.settingsChanged.set(true);
  }

  onRepeatMealsChange(value: RepeatMeals): void {
    this.userSettingsService.setRepeatMeals(value);
    this.settingsChanged.set(true);
  }

  onWeekStartDayChange(value: WeekStartDay): void {
    this.userSettingsService.setWeekStartDay(value);
    this.settingsChanged.set(true);
  }

  onFoodListSourceChange(value: FoodListSource): void {
    this.userSettingsService.setFoodListSource(value);
    this.settingsChanged.set(true);
  }

  async save(): Promise<void> {
    if (!this.hasAnyChanges()) return;

    const warnings = this.userSettingsService.validateOnSave();
    if (warnings.length > 0) {
      this.notificationService.showConfirmation(
        warnings.join('\n'),
        'warning',
        () => this.doSave(),
        () => { /* cancel — stay in edit mode, button stays green */ }
      );
    } else {
      this.doSave();
    }
  }

  private async doSave(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.userSettingsService.savePreferences();
      this.isSaving.set(false);
      this.settingsChanged.set(false);
      this.notificationService.show('Preferences saved', 'success');
    } catch {
      this.isSaving.set(false);
      this.notificationService.show('Failed to save preferences', 'error');
    }
  }

  close(): void {
    if (this.hasAnyChanges()) {
      this.showConfirmDialog.set(true);
    } else {
      this.tabService.closeTab('preferences');
    }
  }

  confirmClose(): void {
    this.settingsChanged.set(false);
    this.showConfirmDialog.set(false);
    this.tabService.closeTab('preferences');
  }

  cancelClose(): void {
    this.showConfirmDialog.set(false);
  }
}
