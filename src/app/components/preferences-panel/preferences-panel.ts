// src/app/components/preferences-panel/preferences-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, OnInit, OnDestroy, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { NotificationService } from '../../services/notification.service';
import { PreferencesService, MealsPerDay, FastingType, DailyGoals, RepeatMeals, FoodListSource } from '../../services/preferences.service';
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
      <div class="settings-pane" [style.flex]="topFlex()">
        <div class="panel-content">
          <!-- Action buttons - right-aligned in flow -->
          <div class="action-buttons">
            <button
              class="icon-btn ai-btn"
              matTooltip="AI assist"
              matTooltipPosition="above"
              [matTooltipShowDelay]="300">
              <img src="/images/AI-star.png" alt="AI" class="ai-btn-icon" />
            </button>
            <span class="btn-spacer"></span>
            <button
              class="icon-btn save-btn"
              [class.has-changes]="hasAnyChanges()"
              (click)="save()"
              matTooltip="Save"
              matTooltipPosition="above"
              [matTooltipShowDelay]="300">
              ✓
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

          <div class="settings-wrapper">
            <!-- Top row: Nutrition Targets -->
            <div class="settings-section">
              <div class="targets-column">
                <span class="column-label">Nutrition Targets</span>
                <div class="targets-grid">
                  <div class="target-field">
                    <label>Cal</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().calories"
                           (ngModelChange)="onDailyGoalChange('calories', $event)" />
                  </div>
                  <div class="target-field">
                    <label>Protein</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().protein"
                           (ngModelChange)="onDailyGoalChange('protein', $event)" />
                  </div>
                  <div class="target-field">
                    <label>Carbs</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().carbs"
                           (ngModelChange)="onDailyGoalChange('carbs', $event)" />
                  </div>
                  <div class="target-field">
                    <label>Fat</label>
                    <input type="number" [ngModel]="userSettingsService.dailyGoals().fat"
                           (ngModelChange)="onDailyGoalChange('fat', $event)" />
                  </div>
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

      <!-- Draggable splitter -->
      <div
        class="splitter-bar"
        (mousedown)="onSplitterMouseDown($event)"
        (touchstart)="onSplitterTouchStart($event)">
      </div>

      <!-- Bottom pane: AI Output -->
      <div class="chat-pane" [style.flex]="bottomFlex()">
        <div class="chat-pane-header">
          <span class="chat-pane-label">Preferences AI Output</span>
        </div>
        <app-chat-output context="preferences" [condensed]="true" />
      </div>
    </div>
  `,
  styleUrls: ['./preferences-panel.scss']
})
export class PreferencesPanelComponent implements OnInit, OnDestroy {
  private tabService = inject(TabService);
  chatService = inject(ChatService);
  protected userSettingsService = inject(PreferencesService);
  private notificationService = inject(NotificationService);
  private el = inject(ElementRef);
  private ngZone = inject(NgZone);

  isSaving = signal(false);
  showConfirmDialog = signal(false);
  settingsChanged = signal(false);

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

  ngOnInit(): void {
    this.userSettingsService.loadPreferences().subscribe();
  }

  ngOnDestroy(): void {
    this.cleanupDragListeners();
  }

  hasAnyChanges(): boolean {
    return this.settingsChanged();
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

  onFoodListSourceChange(value: FoodListSource): void {
    this.userSettingsService.setFoodListSource(value);
    this.settingsChanged.set(true);
  }

  save(): void {
    if (!this.hasAnyChanges()) return;

    this.isSaving.set(true);
    this.userSettingsService.savePreferences().subscribe({
      next: () => {
        this.isSaving.set(false);
        this.settingsChanged.set(false);
        this.notificationService.show('Preferences saved', 'success');
      },
      error: () => {
        this.isSaving.set(false);
        this.notificationService.show('Failed to save preferences', 'error');
      }
    });
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
