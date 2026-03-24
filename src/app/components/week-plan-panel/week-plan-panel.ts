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
import { getMealSlotName, MealSummary, DayPlan, DayPlanMeal } from '../../models/planning.model';

const DAY_TO_NUM: Record<WeekStartDay, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A meal selected in the picker, before committing */
interface PickerSlot {
  slotNum: number;     // 1-based
  mealId: number;
  mealName: string;
}

@Component({
  selector: 'app-week-plan-panel',
  imports: [
    CommonModule, FormsModule,
    MatDatepickerModule, MatNativeDateModule, MatIconModule
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
            </div>
            <div class="day-slots">
              @for (slotNum of mealSlotNums(); track slotNum) {
                @let meal = getMealInSlot(dayOffset, slotNum);
                <div class="slot-row"
                     [class.slot-filled]="!!meal"
                     [class.slot-selected]="isSlotSelected(dayOffset, slotNum)"
                     (click)="selectSlot(dayOffset, slotNum, $event)"
                     (dblclick)="swapSlot(dayOffset, slotNum, $event)">
                  <span class="slot-label">{{ getMealSlotName(slotNum) }}</span>
                  <span class="slot-meal">{{ meal?.meal?.name ?? meal?.mealId ?? '—' }}</span>
                </div>
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
              <h3>
                @if (pickerSwapSlot()) {
                  Swap {{ getMealSlotName(pickerSwapSlot()!) }}
                } @else {
                  Fill Meals · {{ pickerSlots().length }} of {{ totalPickerSlots() }} slots
                }
              </h3>
              <button class="picker-close-btn" (click)="closeMealPicker()">✕</button>
            </div>

            <!-- Selected meals area (reorderable) -->
            @if (!pickerSwapSlot() && pickerSlots().length > 0) {
              <div class="picker-selected">
                @for (ps of pickerSlots(); track ps.slotNum; let i = $index) {
                  <div class="picker-selected-row">
                    <span class="picker-slot-label">{{ getMealSlotName(ps.slotNum) }}</span>
                    <span class="picker-slot-name">{{ ps.mealName }}</span>
                    <div class="picker-slot-actions">
                      <button class="picker-slot-btn"
                              [disabled]="i === 0"
                              (click)="movePickerSlot(i, -1)"
                              title="Move up">
                        <mat-icon>arrow_upward</mat-icon>
                      </button>
                      <button class="picker-slot-btn"
                              [disabled]="i === pickerSlots().length - 1"
                              (click)="movePickerSlot(i, 1)"
                              title="Move down">
                        <mat-icon>arrow_downward</mat-icon>
                      </button>
                      <button class="picker-slot-btn remove"
                              (click)="removePickerSlot(i)"
                              title="Remove">
                        <mat-icon>close</mat-icon>
                      </button>
                    </div>
                  </div>
                }
              </div>
            }

            <div class="picker-search">
              <input class="picker-search-input"
                     placeholder="Search meals..."
                     [value]="pickerSearch()"
                     (input)="onPickerSearch($event)" />
            </div>
            <div class="picker-list">
              @for (meal of filteredMeals(); track meal.id) {
                <div class="picker-meal-row"
                     (click)="onPickerMealClick(meal)">
                  <span class="picker-meal-name">{{ meal.name }}</span>
                  <span class="picker-meal-info">{{ meal.totalCalories ?? '—' }} cal</span>
                </div>
              } @empty {
                <div class="picker-empty">No meals found</div>
              }
            </div>
            <div class="picker-footer">
              <button class="picker-add-btn"
                      [disabled]="pickerSlots().length === 0"
                      (click)="commitPickerSlots()">
                <mat-icon>check</mat-icon> OK
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
  pickerSearch = signal('');
  pickerSlots = signal<PickerSlot[]>([]);
  pickerSwapSlot = signal<number | null>(null);  // non-null = swap mode for this slot
  pickerSwapDayOffset = signal<number>(0);
  availableMeals = signal<MealSummary[]>([]);

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

  totalPickerSlots = computed(() => this.prefs.mealsPerDay());

  repeatInfo = computed(() => {
    if (this.selectedDays().length !== 1) return null;
    const repeat = this.prefs.repeatMeals();
    return repeat > 1 ? repeat : null;
  });

  filteredMeals = computed(() => {
    const search = this.pickerSearch().toLowerCase();
    if (!search) return this.availableMeals();
    return this.availableMeals().filter(m => m.name.toLowerCase().includes(search));
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
    if (!wp) return null;
    const dateStr = this.toDateString(this.getDayDate(offset));
    return wp.days.find(d => d.planDate === dateStr) ?? null;
  }

  getMealInSlot(dayOffset: number, slotNum: number): DayPlanMeal | null {
    const dp = this.getDayPlan(dayOffset);
    if (!dp) return null;
    return dp.meals.find(m => m.mealSlot === slotNum) ?? null;
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

  swapSlot(dayOffset: number, slotNum: number, event: MouseEvent): void {
    event.stopPropagation();
    const meal = this.getMealInSlot(dayOffset, slotNum);
    if (!meal) return; // only swap filled slots

    this.pickerSwapSlot.set(slotNum);
    this.pickerSwapDayOffset.set(dayOffset);
    this.pickerSlots.set([]);
    this.pickerSearch.set('');
    this.pickerOpen.set(true);
    this.loadAvailableMeals();
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

  async openMealPicker(): Promise<void> {
    this.pickerSwapSlot.set(null);
    this.pickerSlots.set([]);
    this.pickerSearch.set('');
    this.pickerOpen.set(true);
    this.loadAvailableMeals();
  }

  closeMealPicker(): void {
    this.pickerOpen.set(false);
    this.pickerSwapSlot.set(null);
  }

  onPickerSearch(event: Event): void {
    this.pickerSearch.set((event.target as HTMLInputElement).value);
  }

  private loadAvailableMeals(): void {
    this.planningService.listMeals({ status: 'active', limit: 100 }).subscribe(meals => {
      this.availableMeals.set(meals);
    });
  }

  onPickerMealClick(meal: MealSummary): void {
    // Swap mode: replace the slot directly and close
    if (this.pickerSwapSlot()) {
      this.doSwap(meal);
      return;
    }

    // Fill mode: add to next available slot
    const current = this.pickerSlots();
    const maxSlots = this.prefs.mealsPerDay();
    if (current.length >= maxSlots) return; // all slots filled

    const nextSlotNum = current.length + 1;
    this.pickerSlots.set([...current, {
      slotNum: nextSlotNum,
      mealId: meal.id,
      mealName: meal.name
    }]);
  }

  // Reorder
  movePickerSlot(index: number, direction: -1 | 1): void {
    const slots = [...this.pickerSlots()];
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;

    // Swap positions
    [slots[index], slots[target]] = [slots[target], slots[index]];

    // Renumber
    this.pickerSlots.set(slots.map((s, i) => ({ ...s, slotNum: i + 1 })));
  }

  removePickerSlot(index: number): void {
    const slots = this.pickerSlots().filter((_, i) => i !== index);
    // Renumber
    this.pickerSlots.set(slots.map((s, i) => ({ ...s, slotNum: i + 1 })));
  }

  // Commit all picker slots to the selected day(s)
  async commitPickerSlots(): Promise<void> {
    const slots = this.pickerSlots();
    if (slots.length === 0) return;

    let wp = this.currentWeek();

    // Auto-create week plan if needed
    if (!wp) {
      try {
        const startDate = this.toDateString(this.selectedDate());
        const name = this.weekName() || undefined;
        wp = await this.weekPlanService.createWeekPlan({ startDate, name });
        await this.weekPlanService.listWeekPlans();
      } catch {
        return;
      }
    }

    const targetOffsets = this.getTargetDayOffsets();

    try {
      for (const offset of targetOffsets) {
        const dateStr = this.toDateString(this.getDayDate(offset));
        let dayPlan = wp.days.find(d => d.planDate === dateStr);

        if (!dayPlan) {
          dayPlan = await this.weekPlanService.createDayPlan({ planDate: dateStr });
        }

        for (const slot of slots) {
          await this.weekPlanService.assignMealToDayPlan(dayPlan.id, {
            mealId: slot.mealId,
            mealSlot: slot.slotNum
          });
        }
      }

      await this.weekPlanService.refreshCurrentWeekPlan();
    } catch {
      // error in service
    }

    this.closeMealPicker();
  }

  // Swap a single slot
  private async doSwap(meal: MealSummary): Promise<void> {
    const slotNum = this.pickerSwapSlot()!;
    const dayOffset = this.pickerSwapDayOffset();
    const dp = this.getDayPlan(dayOffset);
    if (!dp) return;

    try {
      // Remove existing meal in this slot
      const existing = dp.meals.find(m => m.mealSlot === slotNum);
      if (existing) {
        await this.weekPlanService.removeMealFromDayPlan(dp.id, existing.id);
      }

      // Assign new meal
      await this.weekPlanService.assignMealToDayPlan(dp.id, {
        mealId: meal.id,
        mealSlot: slotNum
      });

      await this.weekPlanService.refreshCurrentWeekPlan();
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

  onCreateNewPlan(event: MouseEvent): void {
    event.preventDefault();
    this.weekPlanService.clearCurrentWeekPlan();
    this.weekName.set(this.formatDefaultName(this.selectedDate()));
    this.nameEdited.set(false);
    this.clearSelections();
    this.closeDropdown();
    this.planNameInput?.nativeElement.focus();
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

    try {
      if (wp) {
        await this.weekPlanService.updateWeekPlan(wp.id, { name });
      } else {
        await this.weekPlanService.createWeekPlan({ startDate, name });
      }
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
    try {
      await this.weekPlanService.deleteWeekPlan(wp.id);
      await this.weekPlanService.listWeekPlans();
      this.clearSelections();
    } catch {
      // error in service
    }
  }

  close(): void {
    this.tabService.closeTab('review');
  }

  private clearSelections(): void {
    this.selectedDays.set([]);
    this.selectedSlot.set(null);
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
