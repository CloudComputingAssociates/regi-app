// src/app/components/preferences-panel/preferences-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, OnInit, AfterViewInit, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabService } from '../../services/tab.service';
import { NotificationService } from '../../services/notification.service';
import { PreferencesService, MealsPerDay, DailyGoals, WeekStartDay, FoodListSource } from '../../services/preferences.service';
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

      @if (showPiWarning()) {
        <div class="confirm-overlay" (click)="cancelPiChange()">
          <div class="confirm-dialog" (click)="$event.stopPropagation()">
            <p>Changing Personal Info will re-calculate your nutrition targets, weeks to goal, and target date.</p>
            <div class="confirm-buttons">
              <button class="confirm-btn discard" (click)="confirmPiChange()">Continue</button>
              <button class="confirm-btn cancel" (click)="cancelPiChange()">Cancel</button>
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
          <!-- Save / Close controls were removed from inside the panel; the
               wrapping SettingsOverlayComponent now exposes the round
               green-check / red-X dialog controls per the dialog convention
               in CLAUDE.md. The panel's save() method is still public so
               the overlay can call it via @ViewChild. -->
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
                    <option value="lightly_active">Lightly Active (1-3 d/wk)</option>
                    <option value="light_moderate">Lt-Mod (4-5 d/wk)</option>
                    <option value="moderately_active">Mod. Active (daily / intense 3-4)</option>
                    <option value="very_active">Very Active (intense 6-7)</option>
                    <option value="extremely_active">Ext. Active (2×/day, physical job)</option>
                  </select>
                </div>
                <div class="pi-bmr">{{ bmrTdeeLabel() }}
                  <span class="info-icon"
                        #bmrTooltip="matTooltip"
                        matTooltip="Basal Metabolic Rate — calories burned at complete rest to keep vital functions running."
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="0"
                        (click)="bmrTooltip.toggle()">&#9432;</span>
                </div>
                <div class="pi-bmr">{{ bmiLabel() }}
                  <span class="info-icon"
                        #bmiTooltip="matTooltip"
                        matTooltip="Body Mass Index — weight ÷ height² (kg/m²); flags under / healthy / over weight."
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="0"
                        (click)="bmiTooltip.toggle()">&#9432;</span>
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
                    User Overridden
                  </label>
                  <span class="info-icon"
                        #overrideTooltip="matTooltip"
                        matTooltip="Lit when you've manually changed one or more Nutrition Targets, so the values shown have overridden the calculated defaults. Uncheck to discard your overrides and revert to values computed from your Personal Info."
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
                  <!-- Protein ratio dropdown + direct-grams shortcut.
                       The dropdown is one rung from {0.5..1.2 g/lb}. The
                       grams input next to it lets the user type a target
                       directly — useful when they want a specific number
                       that doesn't fall on a ratio rung. Typing in the
                       grams box auto-overrides; the dropdown shows blank
                       when the saved ratio is off-rung (Angular's default
                       behavior when ngModel doesn't match any option).
                       Both grams boxes (this one and the lower green one
                       in the macro-grid) share a live-draft signal so a
                       keystroke in either reflects in both. Backspace to
                       empty + blur reverts to the pre-edit ratio. -->
                  <div class="macro-control-row">
                    <label class="setting-label">Proteins</label>
                    <select class="setting-select protein-select"
                      [ngModel]="userSettingsService.effectiveProteinRatio()"
                      (ngModelChange)="onProteinRatioChange($event)">
                      <option [ngValue]="0.5">0.5 g/lb</option>
                      <option [ngValue]="0.7">0.7 g/lb</option>
                      <option [ngValue]="0.8">0.8 g/lb</option>
                      <option [ngValue]="0.9">0.9 g/lb</option>
                      <option [ngValue]="1.0">1.0 g/lb</option>
                      <option [ngValue]="1.1">1.1 g/lb</option>
                      <option [ngValue]="1.2">1.2 g/lb</option>
                    </select>
                    <span class="grams-or">-or-</span>
                    <input type="number" class="protein-grams-input"
                      [ngModel]="topProteinGramsDisplay()"
                      (ngModelChange)="onProteinGramsChange($event)"
                      (focus)="onProteinGramsFocus()"
                      (blur)="onProteinGramsBlur()" />
                    <span class="grams-suffix">g</span>
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
                      <label>Proteins {{ userSettingsService.showPercent() ? '%' : 'g' }}</label>
                      <input type="number" [ngModel]="proteinDisplay()"
                             (ngModelChange)="onMacroFieldChange('protein', $event)"
                             (focus)="onProteinGramsFocus()"
                             (blur)="onProteinGramsBlur()" />
                    </div>
                    <div class="target-field macro-fat">
                      <label>Fats {{ userSettingsService.showPercent() ? '%' : 'g' }}</label>
                      <input type="number" [ngModel]="fatDisplay()"
                             (ngModelChange)="onMacroFieldChange('fat', $event)"
                             [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    </div>
                    <div class="target-field macro-carbs">
                      <label>Carbs {{ userSettingsService.showPercent() ? '%' : 'g' }}</label>
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
                      <label>Fiber g</label>
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
                  </div>
                  <div class="macro-separator"></div>
                  <div class="water-section" [class.targets-disabled]="!userSettingsService.dailyGoals().isOverridden">
                    <label class="water-heading">Daily Water
                      <span class="info-icon"
                        #waterTooltip="matTooltip"
                        matTooltip="Holliday-Segar Formula"
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="0"
                        (click)="waterTooltip.toggle()">&#9432;</span>
                    </label>
                    <div class="water-option">
                      <label class="water-radio">
                        <input type="radio" name="waterMode" value="glasses"
                               [checked]="waterMode() === 'glasses'"
                               [disabled]="!userSettingsService.dailyGoals().isOverridden"
                               (change)="onWaterModeChange('glasses')" />
                        {{ userSettingsService.useImperial() ? '16 oz glasses' : '500 ml glasses' }}
                      </label>
                      <input type="number" class="water-input" [ngModel]="waterGlasses()"
                             (ngModelChange)="onWaterGlassesChange($event)"
                             [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                    </div>
                    <div class="water-option">
                      <label class="water-radio">
                        <input type="radio" name="waterMode" value="bottle"
                               [checked]="waterMode() === 'bottle'"
                               [disabled]="!userSettingsService.dailyGoals().isOverridden"
                               (change)="onWaterModeChange('bottle')" />
                        My Bottle Count
                      </label>
                      <input type="number" class="water-input" [ngModel]="waterBottles()"
                             (ngModelChange)="onWaterBottlesChange($event)"
                             [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                      <span class="water-unit">holds</span>
                      <input type="number" class="water-bottle-size" [ngModel]="bottleSizeDisplay()"
                             (ngModelChange)="onBottleSizeChange($event)"
                             [disabled]="!userSettingsService.dailyGoals().isOverridden" />
                      <span class="water-unit">{{ userSettingsService.useImperial() ? 'oz' : 'L' }}</span>
                    </div>
                    <div class="water-display-row">
                      @for (g of waterDisplayArray(); track g) {
                        @if (waterMode() === 'bottle') {
                          <img src="/images/waterbottleiconblue.png" alt="bottle" class="water-bottle-img" />
                        } @else {
                          <img src="/images/WaterGlassFull.png" alt="glass" class="water-glass-img" />
                        }
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
            }
            </div>

            <!-- Menu -->
            <div class="accordion-section">
              <button class="accordion-header" (click)="planningOpen.set(!planningOpen())">
                <mat-icon class="accordion-arrow" [class.open]="planningOpen()">chevron_right</mat-icon>
                <span class="accordion-title">Menu</span>
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
                    <option [ngValue]="7">7 meals</option>
                    <option [ngValue]="8">8 meals</option>
                  </select>
                </div>
                <div class="setting-row">
                  <label class="setting-label">Meal Repeats</label>
                  <input type="number" min="1" class="setting-number"
                    [ngModel]="userSettingsService.repeatMeals()"
                    (change)="onRepeatMealsChange($event)" />
                  <span class="setting-hint">per week</span>
                  <span class="info-icon"
                        #repeatTooltip="matTooltip"
                        matTooltip="By repeating day plans, you optimize grocery lists and reduce waste"
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="0"
                        (click)="repeatTooltip.toggle()">&#9432;</span>
                </div>
                <div class="setting-row">
                  <label class="setting-label">Start Day</label>
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
              </div>

              <div class="regimenu-column">
                <div class="setting-row">
                  <label class="setting-label">Foods from</label>
                  <select
                    class="setting-select"
                    [ngModel]="userSettingsService.foodListSource()"
                    (ngModelChange)="onFoodListSourceChange($event)">
                    <option value="myfoods">MyFoods</option>
                    <option value="regi_plus_myfoods">MyFoods + RegiApproved</option>
                    <option value="all_foods">All Foods</option>
                  </select>
                  <span class="info-icon"
                        #foodsTooltip="matTooltip"
                        matTooltip="Which foods meal planning draws from: your own MyFoods, MyFoods plus the RegiApproved list, or all foods."
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="0"
                        (click)="foodsTooltip.toggle()">&#9432;</span>
                </div>
                <div class="setting-row">
                  <label class="setting-label">Persons</label>
                  <input type="number" min="1" class="setting-number"
                    [ngModel]="userSettingsService.persons()"
                    (change)="onPersonsChange($event)" />
                </div>
              </div>
            </div>
            </div>
            }
            </div>

            <!-- GLP-1 tracking -->
            <div class="accordion-section">
              <button class="accordion-header" (click)="glp1Open.set(!glp1Open())">
                <mat-icon class="accordion-arrow" [class.open]="glp1Open()">chevron_right</mat-icon>
                <span class="accordion-title">GLP-1 tracking</span>
                <span class="accordion-control" (click)="$event.stopPropagation()">
                  <label class="override-label">
                    <input type="checkbox"
                      [ngModel]="userSettingsService.glp1().enabled"
                      (ngModelChange)="onGlp1EnabledChange($event)" />
                    Enabled
                  </label>
                </span>
              </button>
              @if (glp1Open()) {
              <div class="accordion-body">
                <div class="settings-section glp1-section">
                  <div class="glp1-column">
                    <!-- Website is the row anchor — its left edge of the input
                         (after the 110px label slot) lines up with the [mg]
                         inputs in the dose rows below. -->
                    <div class="glp1-field-row">
                      <label class="setting-label glp1-row-label">Website</label>
                      <input type="text" class="glp1-text glp1-text-wide"
                        [disabled]="!userSettingsService.glp1().enabled"
                        [ngModel]="userSettingsService.glp1().website || ''"
                        (ngModelChange)="onGlp1FieldChange('website', $event)" />
                      <label class="setting-label glp1-gap-left">Brand</label>
                      <input type="text" class="glp1-text"
                        [disabled]="!userSettingsService.glp1().enabled"
                        [ngModel]="userSettingsService.glp1().brand || ''"
                        (ngModelChange)="onGlp1FieldChange('brand', $event)" />
                      <label class="setting-label glp1-gap-left">Pharmacy</label>
                      <input type="text" class="glp1-text"
                        [disabled]="!userSettingsService.glp1().enabled"
                        [ngModel]="userSettingsService.glp1().pharmacy || ''"
                        (ngModelChange)="onGlp1FieldChange('pharmacy', $event)" />
                    </div>

                    <!-- Start Dose: locks once all 3 fields are filled. The
                         circular reset button reappears to wipe it back to
                         editable. When the user completes Start Dose with
                         Current Dose still empty, Current is auto-seeded as
                         the "you were here" snapshot. -->
                    <div class="glp1-dose-row">
                      <label class="setting-label glp1-row-label">Start Dose</label>
                      <input type="number" min="0" class="glp1-num"
                        [disabled]="!userSettingsService.glp1().enabled || startDoseLocked()"
                        [ngModel]="(userSettingsService.glp1().startDose || {}).dose"
                        (change)="onGlp1DoseChange('startDose', 'dose', $event)" />
                      <span class="glp1-unit">mg</span>
                      <input type="number" min="0" class="glp1-num"
                        [disabled]="!userSettingsService.glp1().enabled || startDoseLocked()"
                        [ngModel]="(userSettingsService.glp1().startDose || {}).units"
                        (change)="onGlp1DoseChange('startDose', 'units', $event)" />
                      <span class="glp1-unit">units</span>
                      <span class="glp1-every">every</span>
                      <input type="number" min="0" class="glp1-num"
                        [disabled]="!userSettingsService.glp1().enabled || startDoseLocked()"
                        [ngModel]="(userSettingsService.glp1().startDose || {}).intervalDays"
                        (change)="onGlp1DoseChange('startDose', 'intervalDays', $event)" />
                      <span class="glp1-unit">days</span>
                      <span class="glp1-every">Start date</span>
                      <input type="date" class="glp1-date"
                        [disabled]="!userSettingsService.glp1().enabled || startDoseLocked()"
                        [ngModel]="userSettingsService.glp1().startDate || ''"
                        (ngModelChange)="onGlp1FieldChange('startDate', $event)" />
                      @if (startDoseLocked()) {
                        @if (currentDoseEmpty()) {
                          <button type="button" class="glp1-promote-btn"
                            [disabled]="!userSettingsService.glp1().enabled"
                            matTooltip="Copy Start Dose to Current"
                            matTooltipPosition="above"
                            (click)="copyStartToCurrent()">
                            <mat-icon>arrow_downward</mat-icon>
                          </button>
                        }
                        <button type="button" class="glp1-reset-btn"
                          [disabled]="!userSettingsService.glp1().enabled"
                          matTooltip="Reset (clears Start + Current)"
                          matTooltipPosition="above"
                          (click)="resetStartDose()">
                          <mat-icon>replay</mat-icon>
                        </button>
                      }
                    </div>

                    <!-- Current Dose row. "Maintenance" checkbox at the end is
                         a soft decorator — it flags that the user is on the
                         maintenance phase but doesn't change where the dose
                         data is stored. Persisted in localStorage so it
                         survives refresh without needing a schema field. -->
                    <div class="glp1-dose-row">
                      <label class="setting-label glp1-row-label">Current Dose</label>
                      <input type="number" min="0" class="glp1-num"
                        [disabled]="!userSettingsService.glp1().enabled"
                        [ngModel]="(userSettingsService.glp1().currentDose || {}).dose"
                        (change)="onGlp1DoseChange('currentDose', 'dose', $event)" />
                      <span class="glp1-unit">mg</span>
                      <input type="number" min="0" class="glp1-num"
                        [disabled]="!userSettingsService.glp1().enabled"
                        [ngModel]="(userSettingsService.glp1().currentDose || {}).units"
                        (change)="onGlp1DoseChange('currentDose', 'units', $event)" />
                      <span class="glp1-unit">units</span>
                      <span class="glp1-every">every</span>
                      <input type="number" min="0" class="glp1-num"
                        [disabled]="!userSettingsService.glp1().enabled"
                        [ngModel]="(userSettingsService.glp1().currentDose || {}).intervalDays"
                        (change)="onGlp1DoseChange('currentDose', 'intervalDays', $event)" />
                      <span class="glp1-unit">days</span>
                      <label class="glp1-maint-check">
                        <input type="checkbox"
                          [disabled]="!userSettingsService.glp1().enabled"
                          [checked]="glp1OnMaintenance()"
                          (change)="onMaintenanceChange($event)" />
                        Maintenance
                      </label>
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
  glp1Open = signal(false);

  // "Maintenance" decorator on the Current Dose row. Soft flag — does not
  // change where dose data is stored, just notes that the user has graduated
  // from titration to maintenance. localStorage-backed so it survives refresh
  // without a schema field (the user said "doesn't matter much"; promote to
  // Glp1Settings.onMaintenance later if cross-device persistence is wanted).
  glp1OnMaintenance = signal(localStorage.getItem('yeh_glp1_onMaintenance') === 'true');

  /** Start Dose is a snapshot — once dose + units + intervalDays + startDate
   *  are all filled it becomes read-only (semi-indelible). The reset arrow
   *  next to the row clears it back to editable. Including startDate in the
   *  predicate is critical: locking on just the 3 numerics would disable the
   *  date input the moment the third number is typed, before the user has a
   *  chance to enter the date. */
  startDoseLocked = computed(() => {
    const g = this.userSettingsService.glp1();
    const sd = g.startDose;
    return !!(sd && (sd.dose ?? 0) > 0 && (sd.units ?? 0) > 0 && (sd.intervalDays ?? 0) > 0 && g.startDate);
  });

  /** True when Current Dose has no values entered yet — controls whether the
   *  green ⇩ "promote Start to Current" button appears. We don't auto-seed
   *  Current from Start because the user wants the choice explicit (and the
   *  Material guide-balloon nudges them toward it). */
  currentDoseEmpty = computed(() => {
    const cd = this.userSettingsService.glp1().currentDose;
    return !cd || (!cd.dose && !cd.units && !cd.intervalDays);
  });

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

  // Water intake tracking
  // Internal storage is always in oz (glasses=16oz each, bottle size in oz)
  waterMode = computed(() => this.userSettingsService.dailyGoals().waterMode ?? 'glasses');
  bottleSizeOz = computed(() => this.userSettingsService.dailyGoals().bottleSizeOz ?? 32);

  // Glass size: 16oz (US) or 500ml (metric)
  private glassSizeOz = computed(() => this.userSettingsService.useImperial() ? 16 : 16.907); // 500ml ≈ 16.907oz

  // Holliday-Segar method: 100ml/kg first 10kg + 50ml/kg next 10kg + 20ml/kg remaining
  private calcTotalOz = computed(() => {
    const kg = this.userSettingsService.personalInfo().targetWeightKg;
    if (!kg) return 0;
    let ml = 0;
    if (kg <= 10) {
      ml = kg * 100;
    } else if (kg <= 20) {
      ml = 1000 + (kg - 10) * 50;
    } else {
      ml = 1500 + (kg - 20) * 20;
    }
    return Math.round(ml / 29.5735); // ml to oz
  });

  waterGlasses = computed(() => {
    const saved = this.userSettingsService.dailyGoals().waterGlasses;
    if (saved && saved > 0) return saved;
    return Math.round(this.calcTotalOz() / this.glassSizeOz());
  });

  waterBottles = computed(() => {
    const totalOz = this.waterGlasses() * this.glassSizeOz();
    const bottleOz = this.bottleSizeOz();
    if (!bottleOz) return 0;
    const raw = totalOz / bottleOz;
    return raw % 1 > 0.5 ? Math.ceil(raw) : Math.floor(raw);
  });

  // Bottle size display: oz for US, liters for metric
  bottleSizeDisplay = computed(() => {
    const oz = this.bottleSizeOz();
    if (this.userSettingsService.useImperial()) return oz;
    return Math.round((oz * 29.5735) / 10) / 100; // oz to liters, 2 decimal places
  });

  waterDisplayCount = computed(() => this.waterMode() === 'bottle' ? this.waterBottles() : this.waterGlasses());
  waterDisplayArray = computed(() => Array.from({ length: this.waterDisplayCount() }, (_, i) => i));

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
    const lastUpdated = this.userSettingsService.personalInfo().lastUpdated;
    if (!tdee || !cals || !weeks) return '';
    const gap = Math.abs(tdee - cals);
    const direction = tdee > cals ? 'deficit' : 'surplus';

    // Calculate goal date from anchor (lastUpdated or today)
    const anchor = lastUpdated ? new Date(lastUpdated) : new Date();
    const goalDate = new Date(anchor);
    goalDate.setDate(goalDate.getDate() + weeks * 7);
    const goalStr = goalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return `${weeks} weeks to goal at ${gap} cal ${direction} (${goalStr})`;
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
    return this.settingsChanged() || this.userSettingsService.hasDirtyGroups();
  }

  // --- Personal Info handlers ---

  // Personal Info change guard — warns user once per session that changes recalculate targets
  private piChangeConfirmed = false;
  private pendingPiAction: (() => void) | null = null;
  showPiWarning = signal(false);

  private guardedPiChange(action: () => void): void {
    if (this.piChangeConfirmed) {
      action();
      return;
    }
    this.pendingPiAction = action;
    this.showPiWarning.set(true);
  }

  confirmPiChange(): void {
    this.piChangeConfirmed = true;
    this.showPiWarning.set(false);
    this.pendingPiAction?.();
    this.pendingPiAction = null;
  }

  cancelPiChange(): void {
    this.showPiWarning.set(false);
    this.pendingPiAction = null;
    // Reload to revert the field value that Angular already bound
    this.userSettingsService.loadPreferences();
  }

  onSexChange(value: string): void {
    this.guardedPiChange(() => {
      this.userSettingsService.setSex(value);
      this.syncMacros();
    });
  }

  onDateOfBirthChange(value: string): void {
    this.guardedPiChange(() => {
      this.userSettingsService.setDateOfBirth(value);
      this.syncMacros();
    });
  }

  onHeightFtChange(ft: number): void {
    this.guardedPiChange(() => {
      const inches = this.heightIn() || 0;
      this.userSettingsService.setHeightCm(PreferencesService.ftInToCm(ft, +inches));
      this.syncMacros();
    });
  }

  onHeightInChange(inches: number): void {
    this.guardedPiChange(() => {
      const ft = this.heightFt() || 0;
      this.userSettingsService.setHeightCm(PreferencesService.ftInToCm(+ft, inches));
      this.syncMacros();
    });
  }

  onHeightCmChange(value: number): void {
    this.guardedPiChange(() => {
      this.userSettingsService.setHeightCm(value);
      this.syncMacros();
    });
  }

  onCurrentWeightChange(value: number): void {
    this.guardedPiChange(() => {
      const kg = this.userSettingsService.useImperial() ? PreferencesService.lbsToKg(value) : value;
      this.userSettingsService.setCurrentWeightKg(kg);
      this.syncMacros();
    });
  }

  onTargetWeightChange(value: number): void {
    this.guardedPiChange(() => {
      const kg = this.userSettingsService.useImperial() ? PreferencesService.lbsToKg(value) : value;
      this.userSettingsService.setTargetWeightKg(kg);
      this.syncMacros();
    });
  }

  onActivityLevelChange(value: string): void {
    this.guardedPiChange(() => {
      this.userSettingsService.setActivityLevel(value);
      this.syncMacros();
    });
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

  // ============================================================
  // Direct-grams protein entry (top + bottom share state)
  // ============================================================

  /** Raw text in the protein grams input(s) while the user is mid-edit.
   *  null = not editing; the inputs fall back to dailyGoals.protein. A non-
   *  null string takes priority so both boxes mirror each keystroke (even
   *  during a backspace-to-empty walk). On blur with an empty value we
   *  restore the pre-edit ratio — this is the "tip-toe back out" reset. */
  proteinGramsDraft = signal<string | null>(null);

  /** Snapshots taken on focus of either grams input so we can revert if the
   *  user backspaces to empty and blurs. Plain class members (not signals)
   *  because they're transient and don't drive any reactive UI. */
  private preEditProtein: number | null = null;
  private preEditRatio: number | undefined = undefined;

  /** Display value for the top grams input — prefers the live draft when
   *  the user is editing, falls back to the persisted protein in grams. */
  topProteinGramsDisplay = computed<string | number>(() => {
    const draft = this.proteinGramsDraft();
    if (draft !== null) return draft;
    return this.userSettingsService.dailyGoals().protein;
  });

  /** Activity multipliers — Mifflin-St. Jeor / Harris-Benedict standard.
   *  Kept in lockstep with the schema enum, the dropdown options, and the
   *  switch in preferences.service.ts. */
  private static readonly ACTIVITY_MULTIPLIERS: Record<string, number> = {
    sedentary: 1.2,
    lightly_active: 1.375,
    light_moderate: 1.4654,
    moderately_active: 1.55,
    very_active: 1.725,
    extremely_active: 1.9,
  };

  /** BMR + activity-adjusted readout under the Activity dropdown. Format:
   *  "BMR: 2,656 cals (Activity adjusted: 4,117)". Em-dash short-circuit
   *  when BMR inputs are missing; suppresses the parenthetical until the
   *  user picks an Activity level. */
  bmrTdeeLabel = computed<string>(() => {
    const bmr = this.userSettingsService.computedBMR();
    if (bmr === null) return 'BMR: — cals';
    const activity = this.userSettingsService.personalInfo().activityLevel;
    const bmrStr = bmr.toLocaleString();
    if (!activity) return `BMR: ${bmrStr} cals`;
    const mult = PreferencesPanelComponent.ACTIVITY_MULTIPLIERS[activity] ?? 1;
    const tdee = Math.round(bmr * mult);
    return `BMR: ${bmrStr} cals (Activity adjusted: ${tdee.toLocaleString()})`;
  });

  /** BMI readout shown directly above BMR. Format:
   *  "BMI: 24.5 (target: 22.0)". Em-dash short-circuit when height or current
   *  weight is missing; suppresses the parenthetical until a target weight is
   *  known. BMI = weightKg / heightM². */
  bmiLabel = computed<string>(() => {
    const pi = this.userSettingsService.personalInfo();
    if (!pi.heightCm || !pi.currentWeightKg) return 'BMI: —';
    const heightM = pi.heightCm / 100;
    const bmi = pi.currentWeightKg / (heightM * heightM);
    const bmiStr = bmi.toFixed(1);
    if (!pi.targetWeightKg) return `BMI: ${bmiStr}`;
    const targetBmi = pi.targetWeightKg / (heightM * heightM);
    return `BMI: ${bmiStr} (target: ${targetBmi.toFixed(1)})`;
  });

  /** Focus of either grams input — snapshot the pre-edit state once. The
   *  second focus (e.g. user clicks from top to bottom while editing) is a
   *  no-op since preEditProtein is already set. */
  onProteinGramsFocus(): void {
    if (this.preEditProtein !== null) return;
    this.preEditProtein = this.userSettingsService.dailyGoals().protein;
    this.preEditRatio = this.userSettingsService.personalInfo().proteinRatio;
  }

  /** Live-typed grams value from either grams input. Empty / non-positive
   *  input is held as a draft (no state write) so the box can show empty
   *  without zeroing the rest of the UI — the blur handler reverts. A
   *  valid positive number is written to dailyGoals.protein AND the
   *  implied ratio is computed (grams / target_lbs) so the dropdown's
   *  saved value reflects the user's actual entry, off-rung or not. */
  onProteinGramsChange(value: string | number | null): void {
    const str = value === null || value === undefined ? '' : String(value);
    this.proteinGramsDraft.set(str);

    const n = parseFloat(str);
    if (!Number.isFinite(n) || n <= 0) return;

    if (!this.userSettingsService.dailyGoals().isOverridden) {
      this.userSettingsService.setIsOverridden(true);
    }

    // Recompute implied ratio so the dropdown's bound value reflects what
    // the user actually entered. Off-rung values (e.g. 0.75) leave the
    // select rendering blank — Angular's natural behavior when ngModel
    // doesn't match any option.
    const targetKg = this.userSettingsService.personalInfo().targetWeightKg;
    if (targetKg) {
      const targetLbs = PreferencesService.kgToLbs(targetKg);
      if (targetLbs > 0) {
        this.userSettingsService.setProteinRatio(n / targetLbs);
      }
    }

    this.userSettingsService.updateDailyGoal('protein', n);
    const dg = this.userSettingsService.dailyGoals();
    const newFat = Math.max(0, Math.round((dg.calories - dg.protein * 4 - dg.carbs * 4) / 9));
    this.userSettingsService.updateDailyGoal('fat', newFat);
    this.syncMacros();
  }

  /** Blur of either grams input — if the draft is empty (user backspaced
   *  all the way out), restore the pre-edit ratio + protein and rebalance.
   *  Otherwise just clear the draft so the displayed value falls back to
   *  the (now-up-to-date) state. */
  onProteinGramsBlur(): void {
    const draft = this.proteinGramsDraft();
    const n = draft === null ? NaN : parseFloat(draft);
    const isEmpty = draft === null || draft === '' || !Number.isFinite(n) || n <= 0;

    if (isEmpty && this.preEditProtein !== null) {
      if (this.preEditRatio !== undefined) {
        this.userSettingsService.setProteinRatio(this.preEditRatio);
      } else {
        this.userSettingsService.clearProteinRatio();
      }
      this.userSettingsService.updateDailyGoal('protein', this.preEditProtein);
      const dg = this.userSettingsService.dailyGoals();
      const newFat = Math.max(0, Math.round((dg.calories - dg.protein * 4 - dg.carbs * 4) / 9));
      this.userSettingsService.updateDailyGoal('fat', newFat);
      this.syncMacros();
    }

    this.proteinGramsDraft.set(null);
    this.preEditProtein = null;
    this.preEditRatio = undefined;
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

    // Protein: keep the implied ratio + top-grams draft in sync so the
    // dropdown and the top grams input track the lower box's edits. Same
    // contract as the dedicated onProteinGramsChange handler.
    if (field === 'protein') {
      const targetKg = this.userSettingsService.personalInfo().targetWeightKg;
      if (targetKg && grams > 0) {
        const targetLbs = PreferencesService.kgToLbs(targetKg);
        if (targetLbs > 0) {
          this.userSettingsService.setProteinRatio(grams / targetLbs);
        }
      }
      // Mirror the live value into the draft so the top grams input shows
      // the same typed number as the lower one (only matters in g mode —
      // in % mode the top input naturally lags one keystroke as the user
      // backspaces, which is acceptable since the user is operating in %).
      if (!this.userSettingsService.showPercent()) {
        this.proteinGramsDraft.set(grams > 0 ? String(grams) : '');
      }
    }

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

  onWaterModeChange(mode: 'glasses' | 'bottle'): void {
    this.userSettingsService.updateDailyGoal('waterMode', mode);
    if (mode === 'bottle') {
      this.userSettingsService.updateDailyGoal('bottleSizeOz', this.bottleSizeOz());
    }
    this.settingsChanged.set(true);
  }

  onWaterGlassesChange(value: number): void {
    if (!value || value <= 0) return;
    this.userSettingsService.updateDailyGoal('waterGlasses', value);
    this.userSettingsService.updateDailyGoal('waterMode', 'glasses');
    this.settingsChanged.set(true);
  }

  onWaterBottlesChange(value: number): void {
    if (!value || value <= 0) return;
    // Back-calculate glasses from bottles
    const bottleOz = this.bottleSizeOz();
    const totalOz = value * bottleOz;
    const glasses = Math.round(totalOz / this.glassSizeOz());
    this.userSettingsService.updateDailyGoal('waterGlasses', glasses);
    this.userSettingsService.updateDailyGoal('waterMode', 'bottle');
    this.userSettingsService.updateDailyGoal('bottleSizeOz', bottleOz);
    this.settingsChanged.set(true);
  }

  onBottleSizeChange(value: number): void {
    if (!value || value <= 0) return;
    const oz = this.userSettingsService.useImperial() ? value : Math.round(value * 33.814); // liters to oz
    this.userSettingsService.updateDailyGoal('bottleSizeOz', oz);
    this.userSettingsService.updateDailyGoal('waterMode', 'bottle');
    this.settingsChanged.set(true);
  }

  onMealsPerDayChange(value: MealsPerDay): void {
    this.userSettingsService.setMealsPerDay(value);
    this.settingsChanged.set(true);
  }

  onRepeatMealsChange(event: Event): void {
    const raw = +(event.target as HTMLInputElement).value;
    this.userSettingsService.setRepeatMeals(raw);
    this.settingsChanged.set(true);
  }

  onPersonsChange(event: Event): void {
    const raw = +(event.target as HTMLInputElement).value;
    this.userSettingsService.setPersons(raw);
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

  onGlp1EnabledChange(value: boolean): void {
    this.userSettingsService.setGlp1Enabled(value);
    this.settingsChanged.set(true);
  }

  onGlp1FieldChange(field: 'brand' | 'pharmacy' | 'website' | 'startDate', value: string): void {
    this.userSettingsService.setGlp1Field(field, value);
    this.settingsChanged.set(true);
  }

  onGlp1DoseChange(
    tier: 'startDose' | 'currentDose' | 'maintenanceDose',
    field: 'dose' | 'units' | 'intervalDays',
    event: Event
  ): void {
    const raw = +(event.target as HTMLInputElement).value;
    this.userSettingsService.setGlp1Dose(tier, field, raw);
    this.settingsChanged.set(true);
  }

  /** Green ⇩ button — explicit promote of Start Dose into Current Dose. Only
   *  visible while currentDoseEmpty(); once Current has values the button
   *  hides (the user is now titrating Current independently). */
  copyStartToCurrent(): void {
    const sd = this.userSettingsService.glp1().startDose;
    if (!sd) return;
    this.userSettingsService.setGlp1DoseTier('currentDose', { ...sd });
    this.settingsChanged.set(true);
  }

  onMaintenanceChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.glp1OnMaintenance.set(checked);
    localStorage.setItem('yeh_glp1_onMaintenance', String(checked));
  }

  resetStartDose(): void {
    this.userSettingsService.clearGlp1Dose('startDose');
    // Reset is the "I screwed up, start over" button. Wipe Current Dose too
    // since it was either a copy of Start (via the green ⇩) or being titrated
    // off a Start that's now being replaced — either way the user is asking
    // for a clean slate. Date goes with the numerics so an orphaned date
    // wouldn't re-trigger the lock prematurely.
    this.userSettingsService.clearGlp1Dose('currentDose');
    this.userSettingsService.setGlp1Field('startDate', '');
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
      // Settings now lives in an overlay; closing the panel = closing the
      // overlay. closeTab() would no-op since 'preferences' isn't in tabs.
      this.tabService.closeSettings();
    }
  }

  confirmClose(): void {
    this.settingsChanged.set(false);
    this.showConfirmDialog.set(false);
    this.tabService.closeSettings();
  }

  cancelClose(): void {
    this.showConfirmDialog.set(false);
  }
}
