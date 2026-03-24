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
import { PreferencesService, WeekStartDay } from '../../services/preferences.service';
import { WeekPlanMacrosService } from '../../services/week-plan-macros.service';
import { getMealSlotName, DayPlan, DayPlanMeal } from '../../models/planning.model';
import { MealPickerComponent, MealPickerResult, MealSwapResult, StagedMeal } from '../meal-picker/meal-picker';
import { MealDetailComponent } from '../meal-detail/meal-detail';

const DAY_TO_NUM: Record<WeekStartDay, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Component({
  selector: 'app-week-plan-panel',
  imports: [
    CommonModule, FormsModule,
    MatDatepickerModule, MatNativeDateModule, MatIconModule,
    MealPickerComponent,
    MealDetailComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Close floats top-right -->
      <button class="panel-close-btn"
              (click)="close()"
              title="Close">
        ✕
      </button>

      <!-- Row 1: START DATE -->
      <div class="header-row">
        <span class="row-label">Start Date</span>
        <input
          class="header-input date-input"
          [matDatepicker]="picker"
          [value]="selectedDate()"
          (dateChange)="onDateChange($event.value)"
          [matDatepickerFilter]="weekStartFilter"
          readonly />
        <mat-datepicker-toggle [for]="picker" class="date-toggle" />
        <mat-datepicker #picker />
      </div>

      <!-- Row 2: WEEK PLAN -->
      <div class="header-row">
        <span class="row-label">Week Plan</span>
        <div class="plan-combo" (focusout)="onComboFocusOut($event)">
          <input
            #planNameInput
            type="text"
            class="header-input plan-name-input"
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

        <button class="icon-btn delete-btn"
                [disabled]="!currentWeek() || weekPlanService.loading()"
                (click)="confirmDeletePlan()"
                title="Delete week plan">
          <mat-icon>delete</mat-icon>
        </button>

        <button class="icon-btn save-btn"
                [disabled]="!nameEdited() || weekPlanService.loading()"
                (click)="saveWeekPlan()"
                title="Save name">
          <mat-icon>check</mat-icon>
        </button>
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
                [disabled]="selectedDays().length === 0"
                (click)="openMealPicker()"
                title="Add meals to selected days">
          <mat-icon>add</mat-icon> Add Meals
        </button>
        <button class="action-btn remove-meal-btn"
                [disabled]="!selectedSlot()"
                (click)="removeSelectedSlot()"
                title="Remove selected meal slot">
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

      <!-- Vertical day list with fixed slots -->
      <div class="day-list">
        @for (dayOffset of dayOffsets; track dayOffset) {
          @let dayDate = getDayDate(dayOffset);
          <div class="day-block"
               [class.day-selected]="isDaySelected(dayOffset)"
               (click)="toggleDay(dayOffset, $event)">
            <div class="day-label">
              <span class="day-name">{{ getDayName(dayDate) }}</span>
              <span class="day-date">{{ dayDate | date:'M/d' }}</span>
              @if (hasDayMeals(dayOffset)) {
                @let dt = getDayTotals(dayOffset);
                <span class="day-totals">{{ dt.cal }} cal&nbsp;&nbsp;{{ dt.fiber }}g fiber&nbsp;&nbsp;{{ dt.sodium }}mg salt</span>
              }
            </div>
            <div class="day-slots">
              @for (slotNum of mealSlotNums(); track slotNum) {
                @let meal = getMealInSlot(dayOffset, slotNum);
                <div class="slot-row"
                     [class.slot-filled]="!!meal"
                     [class.slot-selected]="isSlotSelected(dayOffset, slotNum)"
                     (click)="selectSlot(dayOffset, slotNum, $event)"
                     (dblclick)="onSlotDoubleClick(dayOffset, slotNum, $event)">
                  <span class="slot-label">{{ getMealSlotName(slotNum) }}</span>
                  <span class="slot-meal">{{ meal?.meal?.name ?? meal?.mealId ?? '—' }}</span>
                  @if (meal) {
                    <button class="slot-view-btn"
                            (click)="onViewMeal(dayOffset, slotNum, $event)"
                            title="View Meal">
                      <mat-icon>visibility</mat-icon>
                    </button>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Meal Picker -->
      @if (pickerOpen()) {
        <app-meal-picker
          [swapSlot]="pickerSwapSlot()"
          [existingMeals]="pickerExistingMeals()"
          (committed)="onPickerCommitted($event)"
          (swapped)="onPickerSwapped($event)"
          (closed)="closeMealPicker()" />
      }

      <!-- Meal Detail (read-only) -->
      @if (detailMealId()) {
        <app-meal-detail
          [mealId]="detailMealId()!"
          (closed)="closeDetail()" />
      }
    </div>
  `,
  styleUrls: ['./week-plan-panel.scss']
})
export class WeekPlanPanelComponent implements OnInit {
  @ViewChild('planNameInput') planNameInput!: ElementRef<HTMLInputElement>;

  private tabService = inject(TabService);
  private prefs = inject(PreferencesService);
  private weekPlanMacros = inject(WeekPlanMacrosService);
  weekPlanService = inject(WeekPlanService);

  readonly dayOffsets = [0, 1, 2, 3, 4, 5, 6];
  readonly getMealSlotName = getMealSlotName;

  selectedDate = signal<Date>(new Date());
  weekName = signal('');
  nameEdited = signal(false);
  showDeletePlanConfirm = signal(false);

  // Combo-box
  dropdownOpen = signal(false);
  dropdownHighlight = signal(-1);

  // Day + slot selection
  selectedDays = signal<number[]>([]);
  selectedSlot = signal<{ dayOffset: number; slotNum: number } | null>(null);

  // Picker state
  pickerOpen = signal(false);
  pickerSwapSlot = signal<number | null>(null);
  pickerSwapDayOffset = signal<number>(0);

  // Detail panel state
  detailMealId = signal<number | null>(null);

  // Existing meals for picker pre-population
  pickerExistingMeals = signal<StagedMeal[]>([]);

  // Busy state
  saving = signal(false);

  weekStartFilter = (d: Date | null): boolean => {
    if (!d) return false;
    return d.getDay() === DAY_TO_NUM[this.prefs.weekStartDay()];
  };

  currentWeek = this.weekPlanService.currentWeekPlan;

  /** Array of slot numbers [1, 2, 3...] based on mealsPerDay */
  mealSlotNums = computed(() => {
    const n = this.prefs.mealsPerDay();
    return Array.from({ length: n }, (_, i) => i + 1);
  });

  repeatInfo = computed(() => {
    if (this.selectedDays().length !== 1) return null;
    const repeat = this.prefs.repeatMeals();
    return repeat > 1 ? repeat : null;
  });

  async ngOnInit(): Promise<void> {
    const today = new Date();
    const weekStartNum = DAY_TO_NUM[this.prefs.weekStartDay()];
    const currentDay = today.getDay();
    const diff = (currentDay - weekStartNum + 7) % 7;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - diff);
    this.selectedDate.set(startDate);
    this.weekName.set(this.formatDefaultName(startDate));

    await this.weekPlanService.listWeekPlans();
    const dateStr = this.toDateString(startDate);
    const match = this.weekPlanService.weekPlans().find(wp => wp.startDate === dateStr);
    if (match) {
      await this.loadWeekPlan(match.id);
    }
  }

  // === Day/Slot helpers ===

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
    if (!wp?.days) return null;
    const dateStr = this.toDateString(this.getDayDate(offset));
    return wp.days.find(d => d.planDate === dateStr) ?? null;
  }

  getMealInSlot(dayOffset: number, slotNum: number): DayPlanMeal | null {
    const dp = this.getDayPlan(dayOffset);
    if (!dp?.meals) return null;
    return dp.meals.find(m => m.mealSlot === slotNum) ?? null;
  }

  // === Nutrition totals ===

  getDayTotals(dayOffset: number): { cal: number; fiber: number; sodium: number } {
    const dp = this.getDayPlan(dayOffset);
    if (!dp?.meals) return { cal: 0, fiber: 0, sodium: 0 };

    let cal = 0, fiber = 0, sodium = 0;
    for (const dpm of dp.meals) {
      if (dpm.meal) {
        cal += dpm.meal.totalCalories ?? 0;
        fiber += dpm.meal.totalFiberG ?? 0;
        sodium += dpm.meal.totalSodiumMg ?? 0;
      }
    }
    return { cal, fiber: Math.round(fiber), sodium };
  }

  hasDayMeals(dayOffset: number): boolean {
    const dp = this.getDayPlan(dayOffset);
    return !!(dp?.meals && dp.meals.length > 0);
  }

  // === Day selection ===

  toggleDay(dayOffset: number, event: MouseEvent): void {
    // Don't toggle if clicking a slot
    if ((event.target as HTMLElement).closest('.slot-row')) return;

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
    this.selectedSlot.set(null);
    this.publishDayMacros();
  }

  isDaySelected(dayOffset: number): boolean {
    return this.selectedDays().includes(dayOffset);
  }

  // === Slot selection ===

  selectSlot(dayOffset: number, slotNum: number, event: MouseEvent): void {
    event.stopPropagation();
    const current = this.selectedSlot();
    if (current?.dayOffset === dayOffset && current?.slotNum === slotNum) {
      this.selectedSlot.set(null);
    } else {
      this.selectedSlot.set({ dayOffset, slotNum });
    }
    // Also select the day
    if (!this.selectedDays().includes(dayOffset)) {
      this.selectedDays.set([dayOffset]);
    }
  }

  isSlotSelected(dayOffset: number, slotNum: number): boolean {
    const s = this.selectedSlot();
    return s?.dayOffset === dayOffset && s?.slotNum === slotNum;
  }

  // === Swap slot (double-click) ===

  onSlotDoubleClick(dayOffset: number, slotNum: number, event: MouseEvent): void {
    event.stopPropagation();
    const dpm = this.getMealInSlot(dayOffset, slotNum);
    if (!dpm) return;

    this.detailMealId.set(dpm.mealId);
  }

  onViewMeal(dayOffset: number, slotNum: number, event: MouseEvent): void {
    event.stopPropagation();
    const dpm = this.getMealInSlot(dayOffset, slotNum);
    if (!dpm) return;
    this.detailMealId.set(dpm.mealId);
  }

  closeDetail(): void {
    this.detailMealId.set(null);
    this.publishDayMacros();
  }

  // === Remove selected slot ===

  async removeSelectedSlot(): Promise<void> {
    const sel = this.selectedSlot();
    if (!sel) return;

    const dp = this.getDayPlan(sel.dayOffset);
    if (!dp) return;

    const dpm = dp.meals.find(m => m.mealSlot === sel.slotNum);
    if (!dpm) return;

    try {
      await this.weekPlanService.removeMealFromDayPlan(dp.id, dpm.id);
      this.selectedSlot.set(null);
      await this.weekPlanService.refreshCurrentWeekPlan();
      this.publishDayMacros();
    } catch {
      // error in service
    }
  }

  // === Repeat logic ===

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

  // === Meal picker ===

  openMealPicker(): void {
    this.pickerSwapSlot.set(null);

    // Pre-populate with existing meals from the first selected day
    const days = this.selectedDays();
    const existing: StagedMeal[] = [];
    if (days.length > 0) {
      const dp = this.getDayPlan(days[0]);
      if (dp?.meals) {
        for (const dpm of dp.meals) {
          existing.push({
            slotNum: dpm.mealSlot,
            mealId: dpm.mealId,
            mealName: dpm.meal?.name ?? `Meal ${dpm.mealId}`,
            proteinG: dpm.meal?.totalProteinG ?? 0,
            fatG: dpm.meal?.totalFatG ?? 0,
            carbG: dpm.meal?.totalCarbG ?? 0
          });
        }
      }
    }
    this.pickerExistingMeals.set(existing);
    this.pickerOpen.set(true);
  }

  closeMealPicker(): void {
    this.pickerOpen.set(false);
    this.pickerSwapSlot.set(null);
  }

  async onPickerCommitted(result: MealPickerResult): Promise<void> {
    const slots = result.slots;
    if (slots.length === 0) return;

    this.saving.set(true);
    document.body.style.cursor = 'wait';

    let wp = this.currentWeek();

    // Auto-create week plan if needed, then re-fetch to get day plans
    if (!wp) {
      try {
        const startDate = this.toDateString(this.selectedDate());
        const name = this.weekName() || undefined;
        await this.weekPlanService.createWeekPlan({ startDate, name });
        await this.weekPlanService.listWeekPlans();
        wp = this.currentWeek();
        if (!wp) return;
      } catch {
        return;
      }
    }

    const days = wp.days ?? [];
    const targetOffsets = this.getTargetDayOffsets();

    try {
      for (const offset of targetOffsets) {
        const dateStr = this.toDateString(this.getDayDate(offset));
        let dayPlan = days.find(d => d.planDate === dateStr);

        if (!dayPlan) {
          dayPlan = await this.weekPlanService.createDayPlan({ planDate: dateStr });
        }

        // Remove existing meals in this day plan first
        if (dayPlan.meals) {
          for (const existing of dayPlan.meals) {
            await this.weekPlanService.removeMealFromDayPlan(dayPlan.id, existing.id);
          }
        }

        for (const slot of slots) {
          await this.weekPlanService.assignMealToDayPlan(dayPlan.id, {
            mealId: slot.mealId,
            mealSlot: slot.slotNum
          });
        }
      }

      await this.weekPlanService.refreshCurrentWeekPlan();
      this.publishDayMacros();
    } catch {
      // error in service
    }

    this.saving.set(false);
    document.body.style.cursor = '';
    this.closeMealPicker();
  }

  async onPickerSwapped(result: MealSwapResult): Promise<void> {
    const dayOffset = this.pickerSwapDayOffset();
    const dp = this.getDayPlan(dayOffset);
    if (!dp) return;

    try {
      const existing = dp.meals.find(m => m.mealSlot === result.slotNum);
      if (existing) {
        await this.weekPlanService.removeMealFromDayPlan(dp.id, existing.id);
      }

      await this.weekPlanService.assignMealToDayPlan(dp.id, {
        mealId: result.mealId,
        mealSlot: result.slotNum
      });

      await this.weekPlanService.refreshCurrentWeekPlan();
      this.publishDayMacros();
    } catch {
      // error in service
    }

    this.closeMealPicker();
  }

  // === Combo-box ===

  onComboInputFocus(): void {
    this.dropdownOpen.set(true);
    this.dropdownHighlight.set(-1);
  }

  onComboFocusOut(event: FocusEvent): void {
    const related = event.relatedTarget as HTMLElement | null;
    const combo = (event.currentTarget as HTMLElement);
    if (related && combo.contains(related)) return;
    this.dropdownOpen.set(false);

    const wp = this.currentWeek();
    if (wp && this.nameEdited() && this.weekName() !== wp.name) {
      this.weekPlanService.updateWeekPlan(wp.id, { name: this.weekName() });
      this.weekPlanService.listWeekPlans();
      this.nameEdited.set(false);
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

  onSelectPlan(wp: { id: number; name: string; startDate: string }, event: MouseEvent): void {
    event.preventDefault();
    this.loadWeekPlan(wp.id);
    this.closeDropdown();
  }

  // === Header ===

  onDateChange(date: Date | null): void {
    if (!date) return;
    this.selectedDate.set(date);
    this.clearSelections();
    this.nameEdited.set(false);

    const dateStr = this.toDateString(date);
    const match = this.weekPlanService.weekPlans().find(wp => wp.startDate === dateStr);
    if (match) {
      this.loadWeekPlan(match.id);
    } else {
      this.weekPlanService.clearCurrentWeekPlan();
      this.weekName.set(this.formatDefaultName(date));
    }
  }

  onNameChange(event: Event): void {
    this.weekName.set((event.target as HTMLInputElement).value);
    this.nameEdited.set(true);
  }

  // === Week plan CRUD ===

  async saveWeekPlan(): Promise<void> {
    const startDate = this.toDateString(this.selectedDate());
    const name = this.weekName() || undefined;
    const wp = this.currentWeek();

    if (!wp) return; // only save name on existing plans; auto-create happens on meal add

    try {
      await this.weekPlanService.updateWeekPlan(wp.id, { name });
      this.nameEdited.set(false);
      await this.weekPlanService.listWeekPlans();
    } catch {
      // error in service
    }
  }

  async loadWeekPlan(id: number): Promise<void> {
    try {
      const wp = await this.weekPlanService.getWeekPlan(id);
      this.selectedDate.set(new Date(wp.startDate + 'T00:00:00'));
      this.weekName.set(wp.name);
      this.nameEdited.set(false);
      this.clearSelections();
    } catch {
      // error in service
    }
  }

  confirmDeletePlan(): void {
    this.showDeletePlanConfirm.set(true);
  }

  async deleteWeekPlan(): Promise<void> {
    const wp = this.currentWeek();
    if (!wp) return;
    this.showDeletePlanConfirm.set(false);

    const defaultName = this.formatDefaultName(this.selectedDate());

    try {
      await this.weekPlanService.deleteWeekPlan(wp.id);
    } catch {
      // may already be deleted
    }

    // Always clear regardless of API result
    this.weekPlanService.clearCurrentWeekPlan();
    await this.weekPlanService.listWeekPlans();
    this.weekName.set(defaultName);
    this.nameEdited.set(false);
    this.clearSelections();

    if (this.planNameInput?.nativeElement) {
      this.planNameInput.nativeElement.value = defaultName;
    }
  }

  close(): void {
    this.tabService.closeTab('review');
  }

  private clearSelections(): void {
    this.selectedDays.set([]);
    this.selectedSlot.set(null);
    this.weekPlanMacros.clear();
  }

  /** Publish macro totals for the first selected day to the macros component */
  private publishDayMacros(): void {
    const days = this.selectedDays();
    if (days.length === 0) {
      this.weekPlanMacros.clear();
      return;
    }

    // Show macros for the first selected day
    const dp = this.getDayPlan(days[0]);
    if (!dp?.meals) {
      this.weekPlanMacros.clear();
      return;
    }

    let proteinG = 0;
    let fatG = 0;
    let carbG = 0;
    for (const dpm of dp.meals) {
      if (dpm.meal) {
        proteinG += dpm.meal.totalProteinG ?? 0;
        fatG += dpm.meal.totalFatG ?? 0;
        carbG += dpm.meal.totalCarbG ?? 0;
      }
    }

    this.weekPlanMacros.setTotals({ proteinG, fatG, carbG });
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
