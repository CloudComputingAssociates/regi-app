// src/app/components/week-plan-panel/week-plan-panel.ts
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  ViewChild,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { TabService } from '../../services/tab.service';
import { WeekPlanService } from '../../services/week-plan.service';
import { PlanningService } from '../../services/planning.service';
import { PreferencesService, WeekStartDay } from '../../services/preferences.service';
import { getMealSlotName, MealSummary, DayPlan } from '../../models/planning.model';

const DAY_TO_NUM: Record<WeekStartDay, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Component({
  selector: 'app-week-plan-panel',
  imports: [
    CommonModule, FormsModule,
    MatDatepickerModule, MatNativeDateModule, MatIconModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Header -->
      <div class="plan-header">
        <div class="header-left">
          <span class="plan-label">Week Plan</span>

          <!-- Combo-box dropdown for week plan selection/rename -->
          <div class="plan-combo" (focusout)="onComboFocusOut($event)">
            <input
              #planNameInput
              type="text"
              class="plan-name-input"
              [value]="weekName()"
              (input)="onNameChange($event)"
              (focus)="onComboInputFocus()"
              (keydown.enter)="onPlanNameCommit($event)"
              (keydown.escape)="closeDropdown()"
              (keydown.arrowDown)="onArrowDown($event)"
              placeholder="Plan name..."
              spellcheck="false" />
            <button
              class="combo-toggle"
              (mousedown)="onDropdownToggleMousedown($event)"
              tabindex="-1"
              aria-label="Show saved week plans">
              <mat-icon class="combo-arrow">expand_more</mat-icon>
            </button>

            @if (dropdownOpen()) {
              <div class="combo-dropdown" role="listbox">
                <button
                  class="dropdown-item create-new"
                  [class.highlighted]="dropdownHighlight() === -1"
                  (mousedown)="onCreateNewPlan($event)"
                  role="option">
                  + New Week Plan
                </button>
                @for (wp of weekPlanService.weekPlans(); track wp.id; let i = $index) {
                  <button
                    class="dropdown-item"
                    [class.highlighted]="dropdownHighlight() === i"
                    [class.active]="currentWeek()?.id === wp.id"
                    (mousedown)="onSelectPlan(wp, $event)"
                    role="option">
                    <span class="dropdown-item-name">{{ wp.name }}</span>
                    <span class="dropdown-item-date">{{ wp.startDate }}</span>
                  </button>
                }
                @if (weekPlanService.weekPlans().length === 0) {
                  <div class="dropdown-empty">No saved plans</div>
                }
              </div>
            }
          </div>

          <!-- Save (green check) -->
          <button class="icon-btn save-btn"
                  [disabled]="weekPlanService.loading()"
                  (click)="saveWeekPlan()"
                  title="Save">
            <mat-icon>check</mat-icon>
          </button>

          <!-- Calendar date input (plain) -->
          <input
            class="date-input"
            [matDatepicker]="picker"
            [value]="selectedDate()"
            (dateChange)="onDateChange($event.value)"
            [matDatepickerFilter]="weekStartFilter"
            placeholder="Start date"
            readonly />
          <mat-datepicker-toggle [for]="picker" class="date-toggle" />
          <mat-datepicker #picker />

          <!-- Delete week plan -->
          <button class="icon-btn delete-btn"
                  [disabled]="!currentWeek() || weekPlanService.loading()"
                  (click)="confirmDeletePlan()"
                  title="Delete week plan">
            <mat-icon>delete</mat-icon>
          </button>

          <!-- Close -->
          <button class="icon-btn close-btn"
                  (click)="close()"
                  title="Close">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      @if (showDeletePlanConfirm()) {
        <div class="confirm-overlay" (click)="showDeletePlanConfirm.set(false)">
          <div class="confirm-dialog" (click)="$event.stopPropagation()">
            <p>Delete this week plan?</p>
            <div class="confirm-buttons">
              <button class="confirm-btn delete" (click)="deleteWeekPlan()">Delete</button>
              <button class="confirm-btn cancel" (click)="showDeletePlanConfirm.set(false)">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- Action bar -->
      <div class="action-bar">
        <button class="action-btn add-meal-btn"
                [disabled]="selectedDays().length === 0 || !currentWeek()"
                (click)="openMealPicker()"
                title="Add meal to selected days">
          <mat-icon>add</mat-icon> Add Meal
        </button>
        <button class="action-btn remove-meal-btn"
                [disabled]="!canRemoveMeal()"
                (click)="removeSelectedMeals()"
                title="Remove selected meal from selected days">
          <mat-icon>delete</mat-icon> Remove
        </button>
        <span class="action-hint">
          @if (selectedDays().length === 0) {
            Select day(s) below
          } @else {
            {{ selectedDays().length }} day{{ selectedDays().length > 1 ? 's' : '' }} selected
            @if (repeatInfo()) {
              · repeat every {{ repeatInfo() }} days
            }
          }
        </span>
      </div>

      <!-- Vertical day list -->
      <div class="day-list">
        @for (dayOffset of dayOffsets; track dayOffset) {
          @let dayDate = getDayDate(dayOffset);
          @let dayPlan = getDayPlan(dayOffset);
          <div class="day-row"
               [class.selected]="isDaySelected(dayOffset)"
               (click)="toggleDay(dayOffset, $event)">
            <div class="day-label">
              <span class="day-name">{{ getDayName(dayDate) }}</span>
              <span class="day-date">{{ dayDate | date:'M/d' }}</span>
            </div>
            <div class="day-meals">
              @if (dayPlan && dayPlan.meals.length > 0) {
                @for (dpm of dayPlan.meals; track dpm.id) {
                  <span class="meal-tag"
                        [class.meal-selected]="isMealSelected(dayOffset, dpm.id)"
                        (click)="toggleMealSelection(dayOffset, dpm.id, $event)">
                    {{ dpm.meal?.name ?? 'Meal ' + dpm.mealId }}
                  </span>
                }
              } @else {
                <span class="no-meals">—</span>
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
              <h3>Add Meal</h3>
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
                  <span class="picker-meal-info">{{ meal.totalCalories ?? '—' }} cal</span>
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
  @ViewChild('planNameInput') planNameInput!: ElementRef<HTMLInputElement>;

  private tabService = inject(TabService);
  private prefs = inject(PreferencesService);
  private planningService = inject(PlanningService);
  weekPlanService = inject(WeekPlanService);

  readonly dayOffsets = [0, 1, 2, 3, 4, 5, 6];
  readonly getMealSlotName = getMealSlotName;

  selectedDate = signal<Date>(new Date());
  weekName = signal('');
  showDeletePlanConfirm = signal(false);

  // Combo-box state
  dropdownOpen = signal(false);
  dropdownHighlight = signal(-1);

  // Multi-select days
  selectedDays = signal<number[]>([]);
  selectedMealIds = signal<Record<number, number>>({});

  // Meal picker state
  pickerOpen = signal(false);
  pickerSearch = signal('');
  pickerSelectedMealId = signal<number | null>(null);
  availableMeals = signal<MealSummary[]>([]);

  weekStartFilter = (d: Date | null): boolean => {
    if (!d) return false;
    return d.getDay() === DAY_TO_NUM[this.prefs.weekStartDay()];
  };

  currentWeek = this.weekPlanService.currentWeekPlan;

  repeatInfo = computed(() => {
    if (this.selectedDays().length !== 1) return null;
    const repeat = this.prefs.repeatMeals();
    return repeat > 1 ? repeat : null;
  });

  canRemoveMeal = computed(() => Object.keys(this.selectedMealIds()).length > 0);

  filteredMeals = computed(() => {
    const search = this.pickerSearch().toLowerCase();
    if (!search) return this.availableMeals();
    return this.availableMeals().filter(m => m.name.toLowerCase().includes(search));
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

  // --- Combo-box ---

  onComboInputFocus(): void {
    this.dropdownOpen.set(true);
    this.dropdownHighlight.set(-1);
  }

  onComboFocusOut(event: FocusEvent): void {
    const related = event.relatedTarget as HTMLElement | null;
    const combo = (event.currentTarget as HTMLElement);
    if (related && combo.contains(related)) return;
    this.dropdownOpen.set(false);

    // Auto-save name change on existing plan
    const wp = this.currentWeek();
    if (wp && this.weekName() !== wp.name) {
      this.weekPlanService.updateWeekPlan(wp.id, { name: this.weekName() });
      this.weekPlanService.listWeekPlans();
    }
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
    this.planNameInput?.nativeElement.blur();
  }

  onDropdownToggleMousedown(event: MouseEvent): void {
    event.preventDefault();
    this.dropdownOpen.update(v => !v);
    if (!this.dropdownOpen()) {
      this.planNameInput?.nativeElement.focus();
    }
  }

  onArrowDown(event: Event): void {
    event.preventDefault();
    if (!this.dropdownOpen()) {
      this.dropdownOpen.set(true);
      this.dropdownHighlight.set(-1);
      return;
    }
    const max = this.weekPlanService.weekPlans().length - 1;
    this.dropdownHighlight.update(h => Math.min(h + 1, max));
  }

  onPlanNameCommit(event: Event): void {
    event.preventDefault();
    this.closeDropdown();
    this.saveWeekPlan();
  }

  onCreateNewPlan(event: MouseEvent): void {
    event.preventDefault();
    this.weekPlanService.clearCurrentWeekPlan();
    this.weekName.set(this.formatDefaultName(this.selectedDate()));
    this.clearSelections();
    this.closeDropdown();
    this.planNameInput?.nativeElement.focus();
  }

  onSelectPlan(wp: { id: number; name: string; startDate: string }, event: MouseEvent): void {
    event.preventDefault();
    this.loadWeekPlan(wp.id);
    this.closeDropdown();
  }

  // --- Header actions ---

  onDateChange(date: Date | null): void {
    if (!date) return;
    this.selectedDate.set(date);
    this.weekName.set(this.formatDefaultName(date));
    this.weekPlanService.clearCurrentWeekPlan();
    this.clearSelections();
  }

  onNameChange(event: Event): void {
    this.weekName.set((event.target as HTMLInputElement).value);
  }

  // --- Day helpers ---

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

  // --- Day multi-select ---

  toggleDay(dayOffset: number, event: MouseEvent): void {
    const current = this.selectedDays();
    if (event.ctrlKey || event.metaKey) {
      if (current.includes(dayOffset)) {
        this.selectedDays.set(current.filter(d => d !== dayOffset));
      } else {
        this.selectedDays.set([...current, dayOffset].sort());
      }
    } else {
      if (current.length === 1 && current[0] === dayOffset) {
        this.selectedDays.set([]);
      } else {
        this.selectedDays.set([dayOffset]);
      }
    }
    this.selectedMealIds.set({});
  }

  isDaySelected(dayOffset: number): boolean {
    return this.selectedDays().includes(dayOffset);
  }

  // --- Meal selection ---

  toggleMealSelection(dayOffset: number, dayPlanMealId: number, event: MouseEvent): void {
    event.stopPropagation();
    const current = this.selectedMealIds();
    if (current[dayOffset] === dayPlanMealId) {
      const { [dayOffset]: _, ...rest } = current;
      this.selectedMealIds.set(rest);
    } else {
      this.selectedMealIds.set({ ...current, [dayOffset]: dayPlanMealId });
    }
    if (!this.selectedDays().includes(dayOffset)) {
      this.selectedDays.set([...this.selectedDays(), dayOffset].sort());
    }
  }

  isMealSelected(dayOffset: number, dayPlanMealId: number): boolean {
    return this.selectedMealIds()[dayOffset] === dayPlanMealId;
  }

  // --- Repeat logic ---

  private getTargetDayOffsets(): number[] {
    const selected = this.selectedDays();
    if (selected.length !== 1) return selected;

    const repeat = this.prefs.repeatMeals();
    if (repeat <= 1) return selected;

    const base = selected[0];
    const targets: number[] = [];
    for (let offset = base; offset < 7; offset += repeat) {
      targets.push(offset);
    }
    return targets;
  }

  // --- Meal picker ---

  async openMealPicker(): Promise<void> {
    this.pickerSearch.set('');
    this.pickerSelectedMealId.set(null);
    this.pickerOpen.set(true);

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
    await this.assignMealToTargetDays(meal.id);
    this.closeMealPicker();
  }

  async addSelectedMealFromPicker(): Promise<void> {
    const mealId = this.pickerSelectedMealId();
    if (!mealId) return;
    await this.assignMealToTargetDays(mealId);
    this.closeMealPicker();
  }

  private async assignMealToTargetDays(mealId: number): Promise<void> {
    const wp = this.currentWeek();
    if (!wp) return;

    const targetOffsets = this.getTargetDayOffsets();

    try {
      for (const offset of targetOffsets) {
        const dateStr = this.toDateString(this.getDayDate(offset));
        let dayPlan = wp.days.find(d => d.planDate === dateStr);

        if (!dayPlan) {
          dayPlan = await this.weekPlanService.createDayPlan({ planDate: dateStr });
        }

        const existingSlots = dayPlan.meals.map(m => m.mealSlot);
        const nextSlot = existingSlots.length > 0 ? Math.max(...existingSlots) + 1 : 1;

        await this.weekPlanService.assignMealToDayPlan(dayPlan.id, {
          mealId,
          mealSlot: nextSlot
        });
      }

      await this.weekPlanService.refreshCurrentWeekPlan();
    } catch {
      // error captured in service
    }
  }

  // --- Remove meals ---

  async removeSelectedMeals(): Promise<void> {
    const mealSelections = this.selectedMealIds();
    if (Object.keys(mealSelections).length === 0) return;

    try {
      for (const [offsetStr, dayPlanMealId] of Object.entries(mealSelections)) {
        const dayOffset = Number(offsetStr);
        const dayPlan = this.getDayPlan(dayOffset);
        if (!dayPlan) continue;

        await this.weekPlanService.removeMealFromDayPlan(dayPlan.id, dayPlanMealId);
      }

      this.selectedMealIds.set({});
      await this.weekPlanService.refreshCurrentWeekPlan();
    } catch {
      // error captured in service
    }
  }

  // --- Week plan CRUD ---

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
      this.clearSelections();
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
      this.clearSelections();
    } catch {
      // error captured in service
    }
  }

  close(): void {
    this.tabService.closeTab('review');
  }

  private clearSelections(): void {
    this.selectedDays.set([]);
    this.selectedMealIds.set({});
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
