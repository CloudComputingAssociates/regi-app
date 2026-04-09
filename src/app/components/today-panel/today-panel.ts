// src/app/components/today-panel/today-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { AuthService } from '@auth0/auth0-angular';
import { map, firstValueFrom } from 'rxjs';
import { TodayService, DailyLogItem } from '../../services/today.service';
import { PreferencesService } from '../../services/preferences.service';
import { NotificationService } from '../../services/notification.service';
import { TabService } from '../../services/tab.service';
import { WeekPlanService } from '../../services/week-plan.service';
import { WeekPlanPrintService } from '../../services/week-plan-print.service';

/** A meal group with computed timing and items */
interface MealGroup {
  slot: number;
  time: string;
  name: string;
  videoLink?: string;
  items: DailyLogItem[];
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
  affirmed: boolean;
}

/** Food popup data */
interface FoodPopup {
  item: DailyLogItem;
  x: number;
  y: number;
}

@Component({
  selector: 'app-today-panel',
  imports: [CommonModule, AsyncPipe, MatTooltipModule, MatIconModule, MatDatepickerModule, MatNativeDateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Report area -->
      <div class="report-area">
        @if (todayService.loading()) {
          <div class="loading-state">Loading today's plan...</div>
        } @else if (!hasPlan()) {
          <div class="report-header">
            <div class="report-title-row">
              <div class="date-navigator">
                <span class="nav-day-of-week">{{ dayOfWeek() }}</span>
                <button class="nav-arrow icon-btn" (click)="goToPreviousDay()" matTooltip="Previous day" matTooltipPosition="above">
                  <mat-icon>chevron_left</mat-icon>
                </button>
                <span class="nav-date" (click)="datePicker2.open()">{{ displayDate() }}</span>
                <input class="hidden-date-input" [matDatepicker]="datePicker2" [value]="currentDate()" (dateChange)="onDatePicked($event.value)" />
                <mat-datepicker #datePicker2 />
                <button class="nav-arrow icon-btn" (click)="goToNextDay()" matTooltip="Next day" matTooltipPosition="above">
                  <mat-icon>chevron_right</mat-icon>
                </button>
              </div>
              <div class="report-actions">
                <button class="icon-btn print-btn"
                  [disabled]="!weekPlanId()"
                  (click)="openPrintDialog()"
                  matTooltip="Print Week Plan"
                  matTooltipPosition="above"
                  [matTooltipShowDelay]="300">
                  <mat-icon>print</mat-icon>
                </button>
                <button class="icon-btn close-btn"
                  (click)="closePanel()"
                  matTooltip="Close"
                  matTooltipPosition="above"
                  [matTooltipShowDelay]="300">
                  ✕
                </button>
              </div>
            </div>
          </div>
          <div class="no-plan-state">
            <p>No Plan scheduled for this day.</p>
            <p class="no-plan-hint">Use RegiMenu℠ MealPlans to create meals and assign to a Week Plan.</p>
          </div>
        } @else {
          <!-- Header -->
          <div class="report-header">
            <div class="report-title-row">
              <div class="nav-day-of-week">{{ dayOfWeek() }}</div>
              <div class="report-actions">
                <button class="icon-btn print-btn"
                  [disabled]="!weekPlanId()"
                  (click)="openPrintDialog()"
                  matTooltip="Print Week Plan"
                  matTooltipPosition="above"
                  [matTooltipShowDelay]="300">
                  <mat-icon>print</mat-icon>
                </button>
                <button class="icon-btn close-btn"
                  (click)="closePanel()"
                  matTooltip="Close"
                  matTooltipPosition="above"
                  [matTooltipShowDelay]="300">
                  ✕
                </button>
              </div>
            </div>
            <div class="date-water-row">
            <div class="date-navigator">
              <button class="nav-arrow icon-btn" (click)="goToPreviousDay()" matTooltip="Previous day" matTooltipPosition="above">
                <mat-icon>chevron_left</mat-icon>
              </button>
              <span class="nav-date" (click)="datePicker.open()">{{ displayDate() }}</span>
              <input class="hidden-date-input" [matDatepicker]="datePicker" [value]="currentDate()" (dateChange)="onDatePicked($event.value)" />
              <mat-datepicker #datePicker />
              <button class="nav-arrow icon-btn" (click)="goToNextDay()" matTooltip="Next day" matTooltipPosition="above">
                <mat-icon>chevron_right</mat-icon>
              </button>
            </div>
            @if (waterTarget() > 0) {
              <div class="water-tracker">
                <span class="water-label">Water</span>
                @for (i of waterTargetArray(); track i) {
                  <button class="water-icon-btn" (click)="onWaterClick(i)">
                    @if (i < waterConsumedCount()) {
                      @if (waterMode() === 'bottle') {
                        <img src="/images/waterbottleiconblue.png" alt="full" class="water-icon" />
                      } @else {
                        <img src="/images/WaterGlassFull.png" alt="full" class="water-icon" />
                      }
                    } @else {
                      @if (waterMode() === 'bottle') {
                        <img src="/images/waterbottleicon.png" alt="empty" class="water-icon" />
                      } @else {
                        <img src="/images/WaterGlassEmpty.png" alt="empty" class="water-icon" />
                      }
                    }
                  </button>
                }
              </div>
            }
            </div>
            <div class="report-totals target-totals">
              <span class="totals-label">Target:</span>
              <span class="totals-grid">
                <span class="totals-val">{{ plannedTotals().calories }}</span><span class="totals-unit">cal</span>
                <span class="totals-val">{{ plannedTotals().protein }}g</span><span class="totals-unit">protein</span>
                <span class="totals-val">{{ plannedTotals().fat }}g</span><span class="totals-unit">fat</span>
                <span class="totals-val">{{ plannedTotals().carbs }}g</span><span class="totals-unit">carbs</span>
              </span>
            </div>
          </div>

          <!-- Meals -->
          @for (meal of mealGroups(); track meal.slot; let idx = $index) {
            <div class="meal-section">
              <div class="meal-header">
                <input type="checkbox"
                  class="meal-check"
                  [checked]="meal.affirmed"
                  (change)="toggleMealAffirm(meal)" />
                <span class="meal-title-line">{{ meal.time }} Meal {{ meal.slot }}@if (meal.name) { -<span class="meal-plan-name"> {{ meal.name }}</span>}</span>
                @if (meal.videoLink) {
                  <button class="video-btn" (click)="openMealVideo(meal.videoLink)"
                    matTooltip="YouTube video" matTooltipPosition="above">
                    <svg class="yt-icon" viewBox="0 0 28 20"><rect rx="4" width="28" height="20" fill="#FF0000"/><polygon points="11,4 11,16 20,10" fill="#FFF"/></svg>
                  </button>
                }
              </div>
              <div class="meal-totals">
                <span class="totals-label">Total:</span>
                <span class="totals-grid">
                  <span class="totals-val">{{ meal.totalCalories }}</span><span class="totals-unit">cal</span>
                  <span class="totals-val">{{ meal.totalProtein }}g</span><span class="totals-unit">protein</span>
                  <span class="totals-val">{{ meal.totalFat }}g</span><span class="totals-unit">fat</span>
                  <span class="totals-val">{{ meal.totalCarbs }}g</span><span class="totals-unit">carbs</span>
                </span>
              </div>

              <!-- Food items -->
              <div class="food-list">
                @for (item of meal.items; track item.id) {
                  <div class="food-row">
                    <input type="checkbox"
                      class="food-check"
                      [checked]="isItemChecked(item.id)"
                      (change)="toggleItem(item.id, meal)" />
                    <span class="food-name" (click)="showFoodPopup(item, $event)">
                      {{ item.foodName }}
                    </span>
                    <span class="food-qty">{{ item.quantity }} {{ item.unit }}</span>
                  </div>
                }
              </div>
            </div>

          }

          <div class="report-subtitle">
            RegiMenu<sup class="sm">SM</sup> generated for {{ userName$ | async }}.&nbsp;&nbsp;{{ todayFormatted() }}@if (planDay()) { (Day {{ planDay() }})}
          </div>

          @if (isFinalized()) {
            <div class="log-section">
              <div class="finalized-msg">✔ Day logged</div>
            </div>
          }
        }
      </div>

      <!-- Food detail popup -->
      @if (foodPopup()) {
        <div class="food-popup-overlay" (click)="hideFoodPopup()">
          <div class="food-popup" [style.top.px]="foodPopup()!.y" [style.left.px]="foodPopup()!.x"
            (click)="$event.stopPropagation()">
            <button class="popup-close" (click)="hideFoodPopup()">✕</button>
            <div class="popup-header">{{ foodPopup()!.item.quantity }} {{ foodPopup()!.item.unit }} — {{ foodPopup()!.item.foodName }}</div>
            <div class="popup-row"><span>Calories</span><span>{{ foodPopup()!.item.calories ?? 0 }}</span></div>
            <div class="popup-row"><span>Protein</span><span>{{ foodPopup()!.item.proteinG ?? 0 }}g</span></div>
            <div class="popup-row"><span>Fat</span><span>{{ foodPopup()!.item.fatG ?? 0 }}g</span></div>
            <div class="popup-row"><span>Carbs</span><span>{{ foodPopup()!.item.carbG ?? 0 }}g</span></div>
          </div>
        </div>
      }

      <!-- Print options dialog -->
      @if (showPrintDialog()) {
        <div class="food-popup-overlay" (click)="closePrintDialog()">
          <div class="print-dialog" (click)="$event.stopPropagation()">
            <button class="popup-close" (click)="closePrintDialog()">✕</button>
            <p class="print-dialog-title">Print Plan Details</p>
            <label class="print-option">
              <input type="checkbox" [checked]="printIncludeToday()" (change)="printIncludeToday.set(!printIncludeToday())" />
              Today
            </label>
            <label class="print-option">
              <input type="checkbox" [checked]="printIncludeWeek()" (change)="printIncludeWeek.set(!printIncludeWeek())" />
              Week
            </label>
            <label class="print-option">
              <input type="checkbox" [checked]="printIncludeShoppingList()" (change)="printIncludeShoppingList.set(!printIncludeShoppingList())" />
              Shopping List
            </label>
            <div class="print-dialog-actions">
              <button class="dismiss-btn print-go-btn" [disabled]="printLoading() || (!printIncludeToday() && !printIncludeWeek() && !printIncludeShoppingList())" (click)="executePrint()">
                @if (printLoading()) { Loading... } @else { Print }
              </button>
              <button class="dismiss-btn" (click)="closePrintDialog()">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- Good Job popup -->
      @if (showGoodJob()) {
        <div class="food-popup-overlay" (click)="dismissGoodJob()">
          <div class="good-job-dialog" (click)="$event.stopPropagation()">
            <p class="good-job-text">Good Job! All meals checked off.</p>
            <button class="dismiss-btn" (click)="dismissGoodJob()">OK</button>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./today-panel.scss']
})
export class TodayPanelComponent implements OnInit {
  todayService = inject(TodayService);
  private prefs = inject(PreferencesService);
  private notificationService = inject(NotificationService);
  private auth = inject(AuthService);
  private tabService = inject(TabService);
  private weekPlanService = inject(WeekPlanService);
  private printService = inject(WeekPlanPrintService);

  userName$ = this.auth.user$.pipe(map(u => u?.name ?? 'User'));

  // Date navigation
  currentDate = signal(new Date());
  private static readonly DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  dayOfWeek = computed(() => TodayPanelComponent.DAYS[this.currentDate().getDay()]);
  displayDate = computed(() => {
    const d = this.currentDate();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${d.getFullYear()}`;
  });

  // Checked food item IDs
  private checkedItems = signal<Set<number>>(new Set());

  // Meal groups built from today's log
  mealGroups = signal<MealGroup[]>([]);

  // Plan name and date info
  planName = signal('');
  planDay = signal(0);
  todayFormatted = signal('');
  hasPlan = signal(false);
  isFinalized = signal(false);

  weekPlanId = signal<number | undefined>(undefined);

  // Water tracking
  waterMode = computed(() => this.prefs.dailyGoals().waterMode ?? 'glasses');
  private waterServingOz = computed(() => {
    if (this.waterMode() === 'bottle') {
      return this.prefs.dailyGoals().bottleSizeOz ?? 32;
    }
    return this.prefs.useImperial() ? 16 : 16.907; // 16oz or 500ml
  });
  waterTarget = computed(() => {
    // waterGlasses is always stored as count of 16oz glasses
    const glasses = this.prefs.dailyGoals().waterGlasses;
    let glassCount = glasses && glasses > 0 ? glasses : 0;

    // Holliday-Segar fallback if no saved value
    if (!glassCount) {
      const kg = this.prefs.personalInfo().targetWeightKg;
      if (!kg) return 0;
      let ml = 0;
      if (kg <= 10) ml = kg * 100;
      else if (kg <= 20) ml = 1000 + (kg - 10) * 50;
      else ml = 1500 + (kg - 20) * 20;
      glassCount = Math.round((ml / 29.5735) / 16);
    }

    // Convert glass count to bottle count if in bottle mode
    if (this.waterMode() === 'bottle') {
      const bottleOz = this.prefs.dailyGoals().bottleSizeOz ?? 32;
      const totalOz = glassCount * 16;
      const raw = totalOz / bottleOz;
      return raw % 1 > 0.5 ? Math.ceil(raw) : Math.floor(raw);
    }
    return glassCount;
  });
  waterConsumedCount = computed(() => {
    const oz = this.todayService.today()?.waterOzConsumed ?? 0;
    if (!oz || !this.waterServingOz()) return 0;
    return Math.round(oz / this.waterServingOz());
  });
  waterTargetArray = computed(() => Array.from({ length: this.waterTarget() }, (_, i) => i));

  async onWaterClick(index: number): Promise<void> {
    const currentCount = this.waterConsumedCount();
    // Toggle: if clicking the last filled one, unfill it; otherwise fill up to clicked
    const newCount = (index + 1 === currentCount) ? index : index + 1;
    const newOz = newCount * this.waterServingOz();
    await this.todayService.updateWater(newOz);
  }

  // Popups
  foodPopup = signal<FoodPopup | null>(null);
  showGoodJob = signal(false);

  // Print dialog
  showPrintDialog = signal(false);
  printIncludeToday = signal(true);
  printIncludeWeek = signal(false);
  printIncludeShoppingList = signal(false);
  printLoading = signal(false);

  // Planned totals (all items, regardless of check state)
  plannedTotals = computed(() => {
    const meals = this.mealGroups();
    let cal = 0, pro = 0, fat = 0, carbs = 0;

    for (const meal of meals) {
      cal += meal.totalCalories;
      pro += meal.totalProtein;
      fat += meal.totalFat;
      carbs += meal.totalCarbs;
    }

    const total = pro * 4 + fat * 9 + carbs * 4;
    return {
      calories: cal,
      protein: pro,
      fat,
      carbs,
      proteinPct: total > 0 ? Math.round((pro * 4 / total) * 100) : 0,
      fatPct: total > 0 ? Math.round((fat * 9 / total) * 100) : 0,
      carbsPct: total > 0 ? Math.round((carbs * 4 / total) * 100) : 0
    };
  });

  // Actual totals (only checked items)
  checkedTotals = computed(() => {
    const meals = this.mealGroups();
    const checked = this.checkedItems();
    let cal = 0, pro = 0, fat = 0, carbs = 0;

    for (const meal of meals) {
      for (const item of meal.items) {
        if (checked.has(item.id)) {
          cal += item.calories ?? 0;
          pro += Math.round(item.proteinG ?? 0);
          fat += Math.round(item.fatG ?? 0);
          carbs += Math.round(item.carbG ?? 0);
        }
      }
    }

    return { calories: cal, protein: pro, fat, carbs };
  });

  // Push checked macros to TodayService so the macros bar can read them
  private syncMacros = effect(() => {
    const t = this.checkedTotals();
    this.todayService.checkedMacros.set({ protein: t.protein, fat: t.fat, carbs: t.carbs });
  });

  allMealsAffirmed = computed(() => {
    return this.mealGroups().length > 0 && this.mealGroups().every(m => m.affirmed);
  });

  async ngOnInit(): Promise<void> {
    await this.loadDate(this.currentDate());
  }

  goToPreviousDay(): void {
    const d = new Date(this.currentDate());
    d.setDate(d.getDate() - 1);
    this.currentDate.set(d);
    this.loadDate(d);
  }

  goToNextDay(): void {
    const d = new Date(this.currentDate());
    d.setDate(d.getDate() + 1);
    this.currentDate.set(d);
    this.loadDate(d);
  }

  onDatePicked(date: Date | null): void {
    if (!date) return;
    this.currentDate.set(date);
    this.loadDate(date);
  }

  private currentDateStr(): string {
    const d = this.currentDate();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private async loadDate(date: Date): Promise<void> {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    this.todayFormatted.set(`${mm}/${dd}/${yyyy}`);

    const resp = await this.todayService.fetchToday(dateStr);

    if (!resp || resp.items.length === 0) {
      this.hasPlan.set(false);
      this.mealGroups.set([]);
      this.checkedItems.set(new Set());
      this.planName.set('');
      this.planDay.set(0);
      this.weekPlanId.set(undefined);
      return;
    }

    this.hasPlan.set(true);
    this.isFinalized.set(!!resp.finalizedAt);
    this.weekPlanId.set(resp.weekPlanId);

    if (resp.planName) {
      this.planName.set(resp.planName);
    }
    if (resp.planStartDate) {
      const start = new Date(resp.planStartDate + 'T00:00:00');
      const dayNum = Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
      if (dayNum > 0) {
        this.planDay.set(dayNum);
      }
      // Preload the rest of the week in background
      this.todayService.preloadWeek(resp.planStartDate);
    }

    this.buildMealGroups(resp.items, resp.mealNames ?? {}, resp.mealVideoLinks ?? {});

    const checked = new Set(resp.items.filter(i => i.isChecked).map(i => i.id));
    this.checkedItems.set(checked);
  }

  private buildMealGroups(items: DailyLogItem[], mealNames: Record<number, string>, mealVideoLinks: Record<number, string>): void {
    const slotMap = new Map<number, DailyLogItem[]>();
    for (const item of items) {
      const list = slotMap.get(item.mealSlot) || [];
      list.push(item);
      slotMap.set(item.mealSlot, list);
    }

    const startTime = this.prefs.eatingStartTime();
    const mealsPerDay = this.prefs.mealsPerDay();
    const fastingType = this.prefs.fastingType();
    const windowHours = this.getEatingWindowHours(fastingType);
    const spacingMinutes = mealsPerDay > 1 ? (windowHours * 60) / (mealsPerDay - 1) : 0;

    const groups: MealGroup[] = [];
    const sortedSlots = Array.from(slotMap.keys()).sort((a, b) => a - b);

    for (let i = 0; i < sortedSlots.length; i++) {
      const slot = sortedSlots[i];
      const slotItems = slotMap.get(slot)!;
      const time = this.calculateMealTime(startTime, i, spacingMinutes);

      let totalCal = 0, totalPro = 0, totalFat = 0, totalCarbs = 0;
      for (const item of slotItems) {
        totalCal += item.calories ?? 0;
        totalPro += Math.round(item.proteinG ?? 0);
        totalFat += Math.round(item.fatG ?? 0);
        totalCarbs += Math.round(item.carbG ?? 0);
      }

      groups.push({
        slot,
        time,
        name: mealNames[slot] || '',
        videoLink: mealVideoLinks[slot] || undefined,
        items: slotItems,
        totalCalories: totalCal,
        totalProtein: totalPro,
        totalFat: totalFat,
        totalCarbs: totalCarbs,
        affirmed: slotItems.every(i => i.isChecked)
      });
    }

    this.mealGroups.set(groups);
  }

  private getEatingWindowHours(fastingType: string): number {
    switch (fastingType) {
      case '16_8': return 8;
      case '18_6': return 6;
      case '20_4': return 4;
      case 'omad': return 0;
      default: return 14; // 'none' — generous window
    }
  }

  private calculateMealTime(startTime: string, index: number, spacingMinutes: number): string {
    const [hours, mins] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + Math.round(index * spacingMinutes);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${displayH}${period}` : `${displayH}:${String(m).padStart(2, '0')}${period}`;
  }

  // --- Item checking ---

  isItemChecked(itemId: number): boolean {
    return this.checkedItems().has(itemId);
  }

  toggleItem(itemId: number, meal: MealGroup): void {
    const next = new Set(this.checkedItems());
    const isChecked = !next.has(itemId);
    if (isChecked) {
      next.add(itemId);
    } else {
      next.delete(itemId);
    }
    this.checkedItems.set(next);
    this.updateMealAffirmed(meal);

    // Auto-save to API and invalidate cache for this date
    this.todayService.checkItem(itemId, isChecked);
    this.todayService.invalidateCache(this.currentDateStr());
  }

  toggleMealAffirm(meal: MealGroup): void {
    const checked = this.checkedItems();
    const allChecked = meal.items.every(i => checked.has(i.id));

    const next = new Set(checked);
    const newState = !allChecked;
    for (const item of meal.items) {
      if (newState) {
        next.add(item.id);
      } else {
        next.delete(item.id);
      }
    }
    this.checkedItems.set(next);
    this.updateMealAffirmed(meal);

    // Single API call for the entire meal and invalidate cache
    this.todayService.checkMeal(meal.slot, newState);
    this.todayService.invalidateCache(this.currentDateStr());
  }

  private updateMealAffirmed(meal: MealGroup): void {
    const checked = this.checkedItems();
    this.mealGroups.update(groups =>
      groups.map(g => g.slot === meal.slot
        ? { ...g, affirmed: g.items.every(i => checked.has(i.id)) }
        : g
      )
    );

    // Auto-popup if all meals affirmed
    if (this.allMealsAffirmed() && !this.isFinalized()) {
      this.showGoodJob.set(true);
    }
  }

  getMealActiveTotals(meal: MealGroup): { calories: number; protein: number; fat: number; carbs: number } {
    const checked = this.checkedItems();
    let cal = 0, pro = 0, fat = 0, carbs = 0;
    for (const item of meal.items) {
      if (checked.has(item.id)) {
        cal += item.calories ?? 0;
        pro += Math.round(item.proteinG ?? 0);
        fat += Math.round(item.fatG ?? 0);
        carbs += Math.round(item.carbG ?? 0);
      }
    }
    return { calories: cal, protein: pro, fat, carbs };
  }

  // --- Food popup ---

  showFoodPopup(item: DailyLogItem, event: MouseEvent): void {
    this.foodPopup.set({ item, x: event.clientX, y: event.clientY });
  }

  hideFoodPopup(): void {
    this.foodPopup.set(null);
  }

  dismissGoodJob(): void {
    this.showGoodJob.set(false);
  }

  openMealVideo(url: string): void {
    this.tabService.openVideoViewer(url);
  }

  closePanel(): void {
    this.tabService.closeTab('today');
  }

  // Print
  openPrintDialog(defaults?: { today?: boolean; week?: boolean; shopping?: boolean }): void {
    this.printIncludeToday.set(defaults?.today ?? true);
    this.printIncludeWeek.set(defaults?.week ?? false);
    this.printIncludeShoppingList.set(defaults?.shopping ?? false);
    this.showPrintDialog.set(true);
  }

  closePrintDialog(): void {
    this.showPrintDialog.set(false);
  }

  async executePrint(): Promise<void> {
    const wpId = this.weekPlanId();
    if (!wpId) return;

    this.printLoading.set(true);
    try {
      const wp = await this.weekPlanService.getWeekPlan(wpId);
      const userName = await firstValueFrom(this.userName$);
      const d = this.currentDate();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');

      this.printService.print(wp, {
        includeToday: this.printIncludeToday(),
        includeWeek: this.printIncludeWeek(),
        includeShoppingList: this.printIncludeShoppingList(),
        todayDate: `${yyyy}-${mm}-${dd}`,
        userName: userName ?? 'User',
        eatingStartTime: this.prefs.eatingStartTime(),
        mealsPerDay: this.prefs.mealsPerDay(),
        fastingType: this.prefs.fastingType()
      });

      this.closePrintDialog();
    } catch {
      this.notificationService.show('Failed to load week plan for printing', 'error');
    } finally {
      this.printLoading.set(false);
    }
  }
}
