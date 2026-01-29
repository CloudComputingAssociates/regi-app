// src/app/components/preferences-panel/preferences-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, OnInit } from '@angular/core';
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
    <div class="panel-container">
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

      <!-- Action buttons - floating top right -->
      <div class="action-buttons">
        <button
          class="icon-btn ai-btn"
          (click)="openAiChat()"
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

      <div class="panel-content">
        <div class="settings-wrapper">
          <div class="settings-section">
          <!-- Left column: Nutrition Targets -->
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

          <!-- Middle column: Meals & Fasting -->
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

          <!-- Right column: RegiMenu -->
          <div class="regimenu-column">
            <span class="column-label">RegiMenu℠</span>
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
              <label class="setting-label">Pick from</label>
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

      <!-- Mini chat panel (bottom-attached, collapsible, starts collapsed) -->
      @if (showChatPanel()) {
        <div class="mini-chat-panel" [class.collapsed]="isChatCollapsed()">
          <button class="mini-chat-toggle" (click)="toggleChat()">
            <span class="toggle-icon">{{ isChatCollapsed() ? '▲' : '▼' }}</span>
            <span class="toggle-label">AI Chat</span>
          </button>
          @if (!isChatCollapsed()) {
            <app-chat-output context="preferences" [condensed]="true" />
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./preferences-panel.scss']
})
export class PreferencesPanelComponent implements OnInit {
  private tabService = inject(TabService);
  chatService = inject(ChatService);
  protected userSettingsService = inject(PreferencesService);
  private notificationService = inject(NotificationService);

  isSaving = signal(false);
  showConfirmDialog = signal(false);
  settingsChanged = signal(false);
  isChatCollapsed = signal(true); // starts collapsed
  chatManuallyOpened = signal(false);

  hasPreferencesMessages = computed(() => this.chatService.preferencesMessages().length > 0);
  showChatPanel = computed(() => this.chatManuallyOpened() || this.hasPreferencesMessages() || this.chatService.preferencesIsLoading());

  constructor() {
    // Auto-expand chat panel when messages arrive or loading starts
    effect(() => {
      if (this.hasPreferencesMessages() || this.chatService.preferencesIsLoading()) {
        this.isChatCollapsed.set(false);
      }
    });
  }

  // Generate 24-hour time options in 30-minute increments
  timeOptions: string[] = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2).toString().padStart(2, '0');
    const minutes = (i % 2 === 0) ? '00' : '30';
    return `${hours}:${minutes}`;
  });

  ngOnInit(): void {
    // Load user settings when panel opens
    this.userSettingsService.loadPreferences().subscribe();
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

  toggleChat(): void {
    this.isChatCollapsed.update(v => !v);
  }

  openAiChat(): void {
    this.chatManuallyOpened.set(true);
    this.isChatCollapsed.set(false);
  }

}
