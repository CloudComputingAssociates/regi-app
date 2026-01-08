// src/app/components/preferences-panel/preferences-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabService } from '../../services/tab.service';
import { PreferencesService } from '../../services/preferences.service';
import { NotificationService } from '../../services/notification.service';
import { UserSettingsService, MealsPerDay, FastingType, DailyGoals } from '../../services/user-settings.service';
import { FoodsComponent, SelectedFoodEvent } from '../foods/foods';
import { forkJoin, Observable } from 'rxjs';

@Component({
  selector: 'app-preferences-panel',
  imports: [CommonModule, FormsModule, FoodsComponent],
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

      <div class="panel-content">
        <!-- Settings Section - two columns -->
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

          <!-- Right column: Meals & Fasting -->
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
          </div>

          <!-- Action buttons -->
          <div class="action-buttons">
            <button
              class="icon-btn close-btn"
              (click)="close()"
              title="Close without saving">
              ✕
            </button>
            <button
              class="icon-btn save-btn"
              [class.has-changes]="hasAnyChanges()"
              (click)="saveAndClose()"
              title="Save and close">
              ✓
            </button>
          </div>
        </div>

        <!-- Foods Section -->
        <div class="foods-section">
          <app-foods
            [mode]="'search'"
            [showAiButton]="false"
            [showPreferenceIcons]="true"
            [showFilterRadios]="true"
            (selectedFood)="onFoodSelected($event)" />
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./preferences-panel.scss']
})
export class PreferencesPanelComponent implements OnInit {
  private tabService = inject(TabService);
  protected preferencesService = inject(PreferencesService);
  protected userSettingsService = inject(UserSettingsService);
  private notificationService = inject(NotificationService);

  isSaving = signal(false);
  showConfirmDialog = signal(false);
  settingsChanged = signal(false);

  ngOnInit(): void {
    // Load user settings when panel opens
    this.userSettingsService.loadSettings().subscribe();
  }

  hasAnyChanges(): boolean {
    return this.preferencesService.hasUnsavedChanges() || this.settingsChanged();
  }

  onDailyGoalChange(field: keyof DailyGoals, value: number): void {
    console.log('Daily goal changed:', field, value);
    this.userSettingsService.updateDailyGoal(field, value);
    this.settingsChanged.set(true);
  }

  onMealsPerDayChange(value: MealsPerDay): void {
    console.log('Meals per day changed:', value);
    this.userSettingsService.setMealsPerDay(value);
    this.settingsChanged.set(true);
  }

  onFastingTypeChange(value: FastingType): void {
    console.log('Fasting type changed:', value);
    this.userSettingsService.setFastingType(value);
    this.settingsChanged.set(true);
  }

  saveAndClose(): void {
    alert('saveAndClose called - settingsChanged: ' + this.settingsChanged());
    console.log('saveAndClose called', {
      hasAnyChanges: this.hasAnyChanges(),
      settingsChanged: this.settingsChanged(),
      preferencesHasChanges: this.preferencesService.hasUnsavedChanges(),
      currentSettings: this.userSettingsService.settings()
    });

    if (!this.hasAnyChanges()) {
      this.tabService.closeTab('preferences');
      return;
    }

    this.isSaving.set(true);

    // Build array of save operations
    const saveOps: Observable<unknown>[] = [];
    if (this.preferencesService.hasUnsavedChanges()) {
      saveOps.push(this.preferencesService.saveAllChanges());
    }
    if (this.settingsChanged()) {
      console.log('Adding saveSettings to operations');
      saveOps.push(this.userSettingsService.saveSettings());
    }

    console.log('Save operations count:', saveOps.length);

    if (saveOps.length === 0) {
      this.isSaving.set(false);
      this.tabService.closeTab('preferences');
      return;
    }

    forkJoin(saveOps).subscribe({
      next: () => {
        console.log('Save completed successfully');
        this.isSaving.set(false);
        this.settingsChanged.set(false);
        this.notificationService.show('Preferences saved', 'success');
        this.tabService.closeTab('preferences');
      },
      error: (err) => {
        console.error('Failed to save preferences:', err);
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
    this.preferencesService.discardChanges();
    this.settingsChanged.set(false);
    this.showConfirmDialog.set(false);
    this.tabService.closeTab('preferences');
  }

  cancelClose(): void {
    this.showConfirmDialog.set(false);
  }

  onFoodSelected(event: SelectedFoodEvent): void {
    console.log('Food selected in Preferences:', event.description);
  }
}
