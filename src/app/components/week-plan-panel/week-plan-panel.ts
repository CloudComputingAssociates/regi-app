// src/app/components/week-plan-panel/week-plan-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TabService } from '../../services/tab.service';
import { WeekPlanService } from '../../services/week-plan.service';
import { PreferencesService, WeekStartDay } from '../../services/preferences.service';
import { getMealSlotName } from '../../models/planning.model';

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
    MatInputModule, MatIconModule, MatCheckboxModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Header row: calendar + week name + save + close -->
      <div class="week-header">
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

        <button class="close-header-btn"
                (click)="close()"
                title="Close">
          ✕
        </button>
      </div>

      <!-- Week grid -->
      <div class="week-grid">
        @for (dayOffset of dayOffsets; track dayOffset) {
          @let dayDate = getDayDate(dayOffset);
          @let dayPlan = getDayPlan(dayOffset);
          <div class="day-column">
            <div class="day-header">
              <span class="day-name">{{ getDayName(dayDate) }}</span>
              <span class="day-date">{{ dayDate | date:'M/d' }}</span>
            </div>
            <div class="day-meals">
              @if (dayPlan && dayPlan.meals.length > 0) {
                @for (dpm of dayPlan.meals; track dpm.id) {
                  <div class="meal-card">
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

      <!-- Saved week plans list -->
      @if (weekPlanService.weekPlans().length > 0) {
        <div class="saved-plans">
          <h3 class="saved-plans-title">Saved Week Plans</h3>
          @for (wp of weekPlanService.weekPlans(); track wp.id) {
            <div class="saved-plan-row" (click)="loadWeekPlan(wp.id)">
              <span class="saved-plan-name">{{ wp.name }}</span>
              <span class="saved-plan-date">{{ wp.startDate }}</span>
              <span class="saved-plan-days">{{ wp.dayCount }} days with meals</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./week-plan-panel.scss']
})
export class WeekPlanPanelComponent implements OnInit {
  private tabService = inject(TabService);
  private prefs = inject(PreferencesService);
  weekPlanService = inject(WeekPlanService);

  readonly dayOffsets = [0, 1, 2, 3, 4, 5, 6];
  readonly getMealSlotName = getMealSlotName;

  selectedDate = signal<Date>(new Date());
  weekName = signal('');

  /** Filter: only allow picking dates that match user's week-start day */
  weekStartFilter = (d: Date | null): boolean => {
    if (!d) return false;
    return d.getDay() === DAY_TO_NUM[this.prefs.weekStartDay()];
  };

  /** Computed: the current week plan loaded from service */
  currentWeek = this.weekPlanService.currentWeekPlan;

  ngOnInit(): void {
    // Set calendar to nearest past/current week start day
    const today = new Date();
    const weekStartNum = DAY_TO_NUM[this.prefs.weekStartDay()];
    const currentDay = today.getDay();
    const diff = (currentDay - weekStartNum + 7) % 7;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - diff);
    this.selectedDate.set(startDate);
    this.weekName.set(this.formatDefaultName(startDate));

    // Load saved week plans list
    this.weekPlanService.listWeekPlans();
  }

  onDateChange(date: Date | null): void {
    if (!date) return;
    this.selectedDate.set(date);
    this.weekName.set(this.formatDefaultName(date));

    // Clear current week plan when date changes
    this.weekPlanService.clearCurrentWeekPlan();
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

  getDayPlan(offset: number) {
    const wp = this.currentWeek();
    if (!wp) return null;
    const targetDate = this.getDayDate(offset);
    const dateStr = this.toDateString(targetDate);
    return wp.days.find(d => d.planDate === dateStr) ?? null;
  }

  async saveWeekPlan(): Promise<void> {
    const startDate = this.toDateString(this.selectedDate());
    const name = this.weekName() || undefined;
    try {
      await this.weekPlanService.createWeekPlan({ startDate, name });
      await this.weekPlanService.listWeekPlans();
    } catch {
      // error is captured in service
    }
  }

  async loadWeekPlan(id: number): Promise<void> {
    try {
      const wp = await this.weekPlanService.getWeekPlan(id);
      this.selectedDate.set(new Date(wp.startDate + 'T00:00:00'));
      this.weekName.set(wp.name);
    } catch {
      // error is captured in service
    }
  }

  close(): void {
    this.tabService.closeTab('review');
  }

  private formatDefaultName(date: Date): string {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}${dd}${yyyy}-week`;
  }

  private toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
