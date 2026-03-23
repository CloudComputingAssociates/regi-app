// src/app/components/week-plan-panel/week-plan-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TabService } from '../../services/tab.service';
import { WeekPlanService } from '../../services/week-plan.service';
import { PlanningService } from '../../services/planning.service';
import { PreferencesService, WeekStartDay } from '../../services/preferences.service';
import { getMealSlotName, MealSummary, DayPlan, DayPlanMeal } from '../../models/planning.model';

/** Map day name → JS Date.getDay() value (0=Sun..6=Sat) */
const DAY_TO_NUM: Record<WeekStartDay, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Component({
  selector: 'app-week-plan-panel',
  imports: [
    CommonModule, FormsModule,
    MatDatepickerModule, MatNativeDateModule, MatFormFieldModule,
    MatInputModule, MatIconModule, MatSelectModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Header row: dropdown + calendar + name + save + close -->
      <div class="week-header">
        <mat-form-field appearance="outline" class="plan-select-field">
          <mat-label>Week Plan</mat-label>
          <mat-select [value]="currentWeek()?.id ?? ''"
                      (selectionChange)="onPlanSelected($event.value)">
            <mat-option value="">-- New Plan --</mat-option>
            @for (wp of weekPlanService.weekPlans(); track wp.id) {
              <mat-option [value]="wp.id">{{ wp.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="calendar-section">
          <mat-form-field appearance="outline" class="date-field">
            <mat-label>Start date</mat-label>
            <input matInput [matDatepicker]="picker"
                   [value]="selectedDate()"
                   (dateChange)="onDateChange($event.value)"
                   [matDatepickerFilter]="weekStartFilter">
            <mat-datepicker-toggle matSuffix [for]="picker" />
            <mat-datepicker #picker />
          </mat-form-field>
        </div>

        <div class="name-section">
          <input class="week-name-input"
                 [value]="weekName()"
                 (input)="onNameChange($event)"
                 placeholder="Week plan name" />
        </div>

        <button class="save-check-btn"
                [disabled]="weekPlanService.loading()"
                (click)="saveWeekPlan()"
                title="Save">
          <mat-icon>check</mat-icon>
        </button>

        <button class="delete-btn"
                [disabled]="!currentWeek() || weekPlanService.loading()"
                (click)="confirmDeletePlan()"
                title="Delete week plan">
          <mat-icon>delete</mat-icon>
        </button>

        <button class="close-header-btn"
                (click)="close()"
                title="Close">
          ✕
        </button>
      </div>

      @if (showDeletePlanConfirm()) {
        <div class="confirm-overlay" (click)="showDeletePlanConfirm.set(false)">
          <div class="confirm-dialog" (click)="$event.stopPropagation()">
            <p>Are you sure you want to delete this week plan?</p>
            <div class="confirm-buttons">
              <button class="confirm-btn delete" (click)="deleteWeekPlan()">Delete</button>
              <button class="confirm-btn cancel" (click)="showDeletePlanConfirm.set(false)">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- Week grid -->
      <div class="week-grid">
        @for (dayOffset of dayOffsets; track dayOffset) {
          @let dayDate = getDayDate(dayOffset);
          @let dayPlan = getDayPlan(dayOffset);
          <div class="day-column">
            <div class="day-header">
              <div class="day-header-info">
                <span class="day-name">{{ getDayName(dayDate) }}</span>
                <span class="day-date">{{ dayDate | date:'M/d' }}</span>
              </div>
              <div class="day-header-actions">
                <button class="day-action-btn add-btn"
                        (click)="openMealPicker(dayOffset)"
                        title="Add meal">
                  <mat-icon>add</mat-icon>
                </button>
                <button class="day-action-btn remove-btn"
                        [disabled]="!selectedMealForDay(dayOffset)"
                        (click)="removeMealFromDay(dayOffset)"
                        title="Remove selected meal">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            </div>
            <div class="day-meals">
              @if (dayPlan && dayPlan.meals.length > 0) {
                @for (dpm of dayPlan.meals; track dpm.id) {
                  <div class="meal-card"
                       [class.selected]="isSelected(dayOffset, dpm.id)"
                       (click)="selectMeal(dayOffset, dpm.id)">
                    <span class="meal-slot">{{ getMealSlotName(dpm.mealSlot) }}</span>
                    <span class="meal-name">{{ dpm.meal?.name ?? 'Meal ' + dpm.mealId }}</span>
                  </div>
                }
              } @else {
                <div class="empty-day">No meals</div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Meal Picker Popup -->
      @if (pickerOpen()) {
        <div class="picker-overlay" (click)="closeMealPicker()">
          <div class="picker-dialog" (click)="$event.stopPropagation()">
            <div class="picker-header">
              <h3>Add Meal to {{ pickerDayLabel() }}</h3>
              <button class="picker-close-btn" (click)="closeMealPicker()">✕</button>
            </div>
            <div class="picker-search">
              <input class="picker-search-input"
                     placeholder="Search meals..."
                     [value]="pickerSearch()"
                     (input)="onPickerSearch($event)" />
            </div>
            <div class="picker-list">
              @for (meal of filteredMeals(); track meal.id) {
                <div class="picker-meal-row"
                     [class.selected]="pickerSelectedMealId() === meal.id"
                     (click)="pickerSelectedMealId.set(meal.id)"
                     (dblclick)="addMealFromPicker(meal)">
                  <span class="picker-meal-name">{{ meal.name }}</span>
                  <span class="picker-meal-info">
                    {{ meal.totalCalories ?? '—' }} cal
                    · {{ meal.totalProteinG ?? '—' }}g protein
                  </span>
                </div>
              } @empty {
                <div class="picker-empty">No meals found</div>
              }
            </div>
            <div class="picker-footer">
              <button class="picker-add-btn"
                      [disabled]="!pickerSelectedMealId()"
                      (click)="addSelectedMealFromPicker()">
                <mat-icon>add</mat-icon> Add
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./week-plan-panel.scss']
})
export class WeekPlanPanelComponent implements OnInit {
  private tabService = inject(TabService);
  private prefs = inject(PreferencesService);
  private planningService = inject(PlanningService);
  weekPlanService = inject(WeekPlanService);

  readonly dayOffsets = [0, 1, 2, 3, 4, 5, 6];
  readonly getMealSlotName = getMealSlotName;

  selectedDate = signal<Date>(new Date());
  weekName = signal('');
  showDeletePlanConfirm = signal(false);

  // Per-day selection: maps dayOffset → selected DayPlanMeal id
  selectedMeals = signal<Record<number, number>>({});

  // Meal picker state
  pickerOpen = signal(false);
  pickerDayOffset = signal(0);
  pickerSearch = signal('');
  pickerSelectedMealId = signal<number | null>(null);
  availableMeals = signal<MealSummary[]>([]);

  /** Filter: only allow picking dates that match user's week-start day */
  weekStartFilter = (d: Date | null): boolean => {
    if (!d) return false;
    return d.getDay() === DAY_TO_NUM[this.prefs.weekStartDay()];
  };

  currentWeek = this.weekPlanService.currentWeekPlan;

  pickerDayLabel = computed(() => {
    const date = this.getDayDate(this.pickerDayOffset());
    return `${DAY_NAMES[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
  });

  filteredMeals = computed(() => {
    const search = this.pickerSearch().toLowerCase();
    if (!search) return this.availableMeals();
    return this.availableMeals().filter(m =>
      m.name.toLowerCase().includes(search)
    );
  });

  ngOnInit(): void {
    const today = new Date();
    const weekStartNum = DAY_TO_NUM[this.prefs.weekStartDay()];
    const currentDay = today.getDay();
    const diff = (currentDay - weekStartNum + 7) % 7;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - diff);
    this.selectedDate.set(startDate);
    this.weekName.set(this.formatDefaultName(startDate));

    this.weekPlanService.listWeekPlans();
  }

  onPlanSelected(value: number | string): void {
    if (value === '' || value === null) {
      this.weekPlanService.clearCurrentWeekPlan();
      this.weekName.set(this.formatDefaultName(this.selectedDate()));
      this.selectedMeals.set({});
      return;
    }
    this.loadWeekPlan(value as number);
  }

  onDateChange(date: Date | null): void {
    if (!date) return;
    this.selectedDate.set(date);
    this.weekName.set(this.formatDefaultName(date));
    this.weekPlanService.clearCurrentWeekPlan();
    this.selectedMeals.set({});
  }

  onNameChange(event: Event): void {
    this.weekName.set((event.target as HTMLInputElement).value);
  }

  getDayDate(offset: number): Date {
    const start = this.selectedDate();
    const d = new Date(start);
    d.setDate(start.getDate() + offset);
    return d;
  }

  getDayName(date: Date): string {
    return DAY_NAMES[date.getDay()];
  }

  getDayPlan(offset: number): DayPlan | null {
    const wp = this.currentWeek();
    if (!wp) return null;
    const dateStr = this.toDateString(this.getDayDate(offset));
    return wp.days.find(d => d.planDate === dateStr) ?? null;
  }

  // Selection
  selectMeal(dayOffset: number, dayPlanMealId: number): void {
    const current = this.selectedMeals();
    if (current[dayOffset] === dayPlanMealId) {
      // Deselect
      const { [dayOffset]: _, ...rest } = current;
      this.selectedMeals.set(rest);
    } else {
      this.selectedMeals.set({ ...current, [dayOffset]: dayPlanMealId });
    }
  }

  isSelected(dayOffset: number, dayPlanMealId: number): boolean {
    return this.selectedMeals()[dayOffset] === dayPlanMealId;
  }

  selectedMealForDay(dayOffset: number): number | undefined {
    return this.selectedMeals()[dayOffset];
  }

  // Meal picker
  async openMealPicker(dayOffset: number): Promise<void> {
    this.pickerDayOffset.set(dayOffset);
    this.pickerSearch.set('');
    this.pickerSelectedMealId.set(null);
    this.pickerOpen.set(true);

    // Load available meals
    this.planningService.listMeals({ status: 'active', limit: 100 }).subscribe(meals => {
      this.availableMeals.set(meals);
    });
  }

  closeMealPicker(): void {
    this.pickerOpen.set(false);
  }

  onPickerSearch(event: Event): void {
    this.pickerSearch.set((event.target as HTMLInputElement).value);
  }

  async addMealFromPicker(meal: MealSummary): Promise<void> {
    await this.assignMealToDay(this.pickerDayOffset(), meal.id);
    this.closeMealPicker();
  }

  async addSelectedMealFromPicker(): Promise<void> {
    const mealId = this.pickerSelectedMealId();
    if (!mealId) return;
    await this.assignMealToDay(this.pickerDayOffset(), mealId);
    this.closeMealPicker();
  }

  private async assignMealToDay(dayOffset: number, mealId: number): Promise<void> {
    const wp = this.currentWeek();
    if (!wp) return;

    const dateStr = this.toDateString(this.getDayDate(dayOffset));
    let dayPlan = wp.days.find(d => d.planDate === dateStr);

    try {
      // Create day plan if it doesn't exist
      if (!dayPlan) {
        dayPlan = await this.weekPlanService.createDayPlan({ planDate: dateStr });
      }

      // Next available meal slot
      const existingSlots = dayPlan.meals.map(m => m.mealSlot);
      const nextSlot = existingSlots.length > 0 ? Math.max(...existingSlots) + 1 : 1;

      await this.weekPlanService.assignMealToDayPlan(dayPlan.id, {
        mealId,
        mealSlot: nextSlot
      });

      // Refresh the week plan to get updated data
      await this.weekPlanService.refreshCurrentWeekPlan();
    } catch {
      // error captured in service
    }
  }

  async removeMealFromDay(dayOffset: number): Promise<void> {
    const dayPlanMealId = this.selectedMeals()[dayOffset];
    if (!dayPlanMealId) return;

    const dayPlan = this.getDayPlan(dayOffset);
    if (!dayPlan) return;

    try {
      await this.weekPlanService.removeMealFromDayPlan(dayPlan.id, dayPlanMealId);

      // Clear selection
      const { [dayOffset]: _, ...rest } = this.selectedMeals();
      this.selectedMeals.set(rest);

      await this.weekPlanService.refreshCurrentWeekPlan();
    } catch {
      // error captured in service
    }
  }

  // Week plan CRUD
  async saveWeekPlan(): Promise<void> {
    const startDate = this.toDateString(this.selectedDate());
    const name = this.weekName() || undefined;
    const wp = this.currentWeek();

    try {
      if (wp) {
        await this.weekPlanService.updateWeekPlan(wp.id, { name });
      } else {
        await this.weekPlanService.createWeekPlan({ startDate, name });
      }
      await this.weekPlanService.listWeekPlans();
    } catch {
      // error captured in service
    }
  }

  async loadWeekPlan(id: number): Promise<void> {
    try {
      const wp = await this.weekPlanService.getWeekPlan(id);
      this.selectedDate.set(new Date(wp.startDate + 'T00:00:00'));
      this.weekName.set(wp.name);
      this.selectedMeals.set({});
    } catch {
      // error captured in service
    }
  }

  confirmDeletePlan(): void {
    this.showDeletePlanConfirm.set(true);
  }

  async deleteWeekPlan(): Promise<void> {
    const wp = this.currentWeek();
    if (!wp) return;
    this.showDeletePlanConfirm.set(false);
    try {
      await this.weekPlanService.deleteWeekPlan(wp.id);
      await this.weekPlanService.listWeekPlans();
      this.selectedMeals.set({});
    } catch {
      // error captured in service
    }
  }

  close(): void {
    this.tabService.closeTab('review');
  }

  private formatDefaultName(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${yyyy}-${months[date.getMonth()]}-${dd}-plan`;
  }

  private toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
