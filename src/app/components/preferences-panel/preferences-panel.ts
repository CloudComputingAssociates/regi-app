// src/app/components/preferences-panel/preferences-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, OnInit, OnDestroy, AfterViewInit, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { NotificationService } from '../../services/notification.service';
import { PreferencesService, MealsPerDay, FastingType, DailyGoals, RepeatMeals, FoodListSource, WeekStartDay } from '../../services/preferences.service';
import { SettingsService } from '../../services/settings.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChatOutputComponent } from '../chat/chat-output/chat-output';

@Component({
  selector: 'app-preferences-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, ChatOutputComponent],
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
      <div class="settings-pane" [style.flex]="aiPanelOpen() ? topFlex() : '1 1 0%'" #settingsPane (scroll)="onSettingsScroll()">
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
            <div class="action-left">
              <button
                class="icon-btn ai-btn"
                [class.ai-active]="aiPanelOpen()"
                (click)="toggleAiPanel()"
                matTooltip="AI assist"
                matTooltipPosition="above"
                [matTooltipShowDelay]="300">
                <img src="/images/AI-star-white.png" alt="AI" class="ai-btn-icon" />
              </button>
              <span class="ai-label">AI assistant</span>
            </div>
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
            <div class="settings-section personal-info-section">
              <div class="pi-column">
                <span class="column-label">Personal Info
                  <span class="pi-scale-label">Units</span>
                  <button class="unit-toggle" (click)="toggleUnits()">
                    {{ userSettingsService.useImperial() ? 'US' : 'metric' }}
                  </button>
                </span>
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
                <div class="pi-row pi-daily-row">
                  <label class="setting-label">Daily</label>
                  <input type="text" class="pi-input pi-small pi-readonly" readonly
                    [value]="userSettingsService.computedTargetCalories() ?? '—'" />
                  <span class="unit-label">cals</span>
                  @if (userSettingsService.deficitLabel()) {
                    <span class="pi-deficit-label">{{ userSettingsService.deficitLabel() }}</span>
                  }
                </div>
                <div class="pi-row pi-daily-row pi-calc-suggestion">
                  <label class="setting-label"></label>
                  <input type="text" class="pi-input pi-macro-box pi-readonly" readonly
                    [value]="userSettingsService.personalInfo().calcProtein ?? '—'" />
                  <span class="unit-label">P</span>
                  <input type="text" class="pi-input pi-macro-box pi-readonly" readonly
                    [value]="userSettingsService.personalInfo().calcFats ?? '—'" />
                  <span class="unit-label">F</span>
                  <input type="text" class="pi-input pi-macro-box pi-readonly" readonly
                    [value]="userSettingsService.personalInfo().calcCarbs ?? '—'" />
                  <span class="unit-label">C</span>
                </div>
                <div class="pi-row pi-daily-row">
                  <label class="setting-label">Weeks</label>
                  <input type="text" class="pi-input pi-small pi-readonly" readonly
                    [value]="userSettingsService.computedWeeksToGoal() ?? '—'" />
                  <span class="unit-label">to goal weight</span>
                </div>
                <div class="pi-last-updated">(last updated {{ lastComputedDate() }})</div>
              </div>
            </div>

            <!-- Nutrition Targets -->
            <div class="settings-section">
              <div class="targets-column">
                <span class="column-label">Nutrition Targets</span>
                <!-- Carb scale slider -->
                <div class="macro-control-row">
                  <label class="setting-label">Carbs</label>
                  <input type="range" class="carb-slider"
                    [min]="0"
                    [max]="userSettingsService.maxCarbGrams()"
                    [ngModel]="userSettingsService.personalInfo().carbScaleGrams ?? 50"
                    (ngModelChange)="onCarbScaleChange($event)" />
                  <span class="slider-value">{{ userSettingsService.personalInfo().carbScaleGrams ?? 50 }}g</span>
                </div>
                <!-- Protein ratio dropdown -->
                <div class="macro-control-row">
                  <label class="setting-label">Proteins</label>
                  <select class="setting-select"
                    [ngModel]="userSettingsService.personalInfo().proteinRatio ?? 1.0"
                    (ngModelChange)="onProteinRatioChange($event)">
                    <option [ngValue]="0.8">0.8 g/lb</option>
                    <option [ngValue]="1.0">1.0 g/lb</option>
                    <option [ngValue]="1.2">1.2 g/lb</option>
                  </select>
                  <span class="macro-hint">of body weight</span>
                </div>
                <div class="macro-separator"></div>
                <div class="override-row">
                  <label class="override-label">
                    User set
                    <input type="checkbox"
                      [ngModel]="userSettingsService.dailyGoals().isOverridden"
                      (ngModelChange)="onOverrideChange($event)" />
                  </label>
                </div>
                <div class="targets-grid">
                  <div class="target-field">
                    <label>Calories</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().calories"
                           (ngModelChange)="onMacroFieldChange('calories', $event)" />
                  </div>
                </div>
                <div class="targets-grid">
                  <div class="target-field">
                    <label>Proteins</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().protein"
                           (ngModelChange)="onMacroFieldChange('protein', $event)" />
                  </div>
                  <div class="target-field">
                    <label>Fats</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().fat"
                           (ngModelChange)="onMacroFieldChange('fat', $event)" />
                  </div>
                  <div class="target-field">
                    <label>Carbs</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().carbs"
                           (ngModelChange)="onMacroFieldChange('carbs', $event)" />
                  </div>
                </div>
                <div class="targets-grid">
                  <div class="target-field">
                    <label>Fiber</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().fiber"
                           (ngModelChange)="onDailyGoalChange('fiber', $event)" />
                  </div>
                  <div class="target-field">
                    <label>Sodium</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().sodium"
                           (ngModelChange)="onDailyGoalChange('sodium', $event)" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Bottom row: Eating Window + Regimenu side by side -->
            <div class="settings-section bottom-row">
              <div class="plan-column">
                <span class="column-label">Eating Window</span>
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
                <span class="column-label">RegiMenu</span>
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
                  <label class="setting-label">Repeat Meals</label>
                  <select
                    class="setting-select"
                    [ngModel]="userSettingsService.repeatMeals()"
                    (ngModelChange)="onRepeatMealsChange($event)">
                    <option [ngValue]="1">1</option>
                    <option [ngValue]="2">2</option>
                    <option [ngValue]="3">3</option>
                    <option [ngValue]="4">4</option>
                  </select>
                </div>
                <div class="setting-row">
                  <label class="setting-label">Foods from</label>
                  <select
                    class="setting-select"
                    [ngModel]="userSettingsService.foodListSource()"
                    (ngModelChange)="onFoodListSourceChange($event)">
                    <option value="yeh_plus_myfoods">YEH+MyFoods</option>
                    <option value="yeh">YEH</option>
                    <option value="myfoods">MyFoods</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      @if (aiPanelOpen()) {
        <!-- Draggable splitter -->
        <div
          class="splitter-bar"
          (mousedown)="onSplitterMouseDown($event)"
          (touchstart)="onSplitterTouchStart($event)">
          <span class="splitter-grip">⇕</span>
        </div>

        <!-- Bottom pane: AI Output -->
        <div class="chat-pane" [style.flex]="bottomFlex()">
          <div class="chat-pane-header">
            <span class="chat-pane-label">Preferences AI Output</span>
          </div>
          <app-chat-output context="preferences" [condensed]="true" />
        </div>
      }
    </div>
  `,
  styleUrls: ['./preferences-panel.scss']
})
export class PreferencesPanelComponent implements OnInit, OnDestroy, AfterViewInit {
  private tabService = inject(TabService);
  chatService = inject(ChatService);
  protected userSettingsService = inject(PreferencesService);
  private settingsService = inject(SettingsService);
  private notificationService = inject(NotificationService);
  private el = inject(ElementRef);
  private ngZone = inject(NgZone);

  // Retry loading preferences when allSettings becomes available (handles page refresh race)
  private loadEffect = effect(() => {
    const all = this.settingsService.allSettings();
    if (all && !this.userSettingsService.isLoaded()) {
      this.userSettingsService.loadPreferences();
    }
  });

  isSaving = signal(false);
  showConfirmDialog = signal(false);
  settingsChanged = signal(false);
  aiPanelOpen = signal(false);

  // Scroll hint state
  showScrollUp = signal(false);
  showScrollDown = signal(false);

  // Splitter state: default 2/3 top, 1/3 bottom
  topFlex = signal('2 1 0%');
  bottomFlex = signal('1 1 0%');

  private isDragging = false;
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: (() => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: (() => void) | null = null;

  // Generate 24-hour time options in 30-minute increments
  timeOptions: string[] = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2).toString().padStart(2, '0');
    const minutes = (i % 2 === 0) ? '00' : '30';
    return `${hours}:${minutes}`;
  });

  // Format today's date as MM/DD/YYYY for "last updated" display
  lastComputedDate = computed(() => {
    // Re-read deficitPercent so this recomputes when it changes
    const pct = this.userSettingsService.personalInfo().deficitPercent;
    if (pct === undefined || pct === null) return '';
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  });

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

  ngOnInit(): void {
    this.userSettingsService.loadPreferences();
  }

  ngAfterViewInit(): void {
    // Initial check after content renders
    setTimeout(() => this.updateScrollHints(), 0);
  }

  ngOnDestroy(): void {
    this.cleanupDragListeners();
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

  toggleUnits(): void {
    this.userSettingsService.toggleUnits();
  }

  toggleAiPanel(): void {
    this.aiPanelOpen.update(v => !v);
    this.chatService.setPromptMe(this.aiPanelOpen());
  }

  onProteinRatioChange(value: number): void {
    this.userSettingsService.setProteinRatio(+value);
    this.syncMacros();
  }

  onCarbScaleChange(value: number): void {
    this.userSettingsService.setCarbScaleGrams(+value);
    this.syncMacros();
  }

  private syncMacros(): void {
    this.userSettingsService.computeDeficitPercent();
    this.userSettingsService.syncComputedMacros();
    this.settingsChanged.set(true);
  }

  // --- Existing handlers ---

  onOverrideChange(checked: boolean): void {
    this.userSettingsService.setIsOverridden(checked);
    this.settingsChanged.set(true);
  }

  /** User typed in a macro field (calories/protein/fat/carbs) — auto-set override */
  onMacroFieldChange(field: keyof DailyGoals, value: number): void {
    if (!this.userSettingsService.dailyGoals().isOverridden) {
      this.userSettingsService.setIsOverridden(true);
    }
    this.userSettingsService.updateDailyGoal(field, value);
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

  // --- Splitter drag logic ---

  onSplitterMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.startDrag();

    this.boundMouseMove = (e: MouseEvent) => this.onDrag(e.clientY);
    this.boundMouseUp = () => this.stopDrag();

    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  onSplitterTouchStart(event: TouchEvent): void {
    event.preventDefault();
    this.startDrag();

    this.boundTouchMove = (e: TouchEvent) => this.onDrag(e.touches[0].clientY);
    this.boundTouchEnd = () => this.stopDrag();

    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd);
  }

  private startDrag(): void {
    this.isDragging = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  private onDrag(clientY: number): void {
    if (!this.isDragging) return;

    const container = this.el.nativeElement.querySelector('.panel-container') as HTMLElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    // Clamp ratio between 20% and 80%
    let ratio = (clientY - rect.top) / rect.height;
    ratio = Math.max(0.2, Math.min(0.8, ratio));

    const topRatio = ratio;
    const bottomRatio = 1 - ratio;

    this.ngZone.run(() => {
      this.topFlex.set(`${topRatio} 1 0%`);
      this.bottomFlex.set(`${bottomRatio} 1 0%`);
    });
  }

  private stopDrag(): void {
    this.isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.cleanupDragListeners();
    this.updateScrollHints();
  }

  private cleanupDragListeners(): void {
    if (this.boundMouseMove) {
      document.removeEventListener('mousemove', this.boundMouseMove);
      this.boundMouseMove = null;
    }
    if (this.boundMouseUp) {
      document.removeEventListener('mouseup', this.boundMouseUp);
      this.boundMouseUp = null;
    }
    if (this.boundTouchMove) {
      document.removeEventListener('touchmove', this.boundTouchMove);
      this.boundTouchMove = null;
    }
    if (this.boundTouchEnd) {
      document.removeEventListener('touchend', this.boundTouchEnd);
      this.boundTouchEnd = null;
    }
  }
}
