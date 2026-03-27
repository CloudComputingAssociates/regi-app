// src/app/components/today-panel/today-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@auth0/auth0-angular';
import { map } from 'rxjs';
import { NutritionTipService } from '../../services/nutrition-tip.service';
import { TodayService, DailyLogItem } from '../../services/today.service';
import { PreferencesService } from '../../services/preferences.service';
import { WeekPlanService } from '../../services/week-plan.service';
import { NotificationService } from '../../services/notification.service';

/** A meal group with computed timing and items */
interface MealGroup {
  slot: number;
  time: string;
  name: string;
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
  imports: [CommonModule, AsyncPipe, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Nutrition tip — apple shows immediately, content loads async -->
      <div class="nutrition-tip-card">
        <img src="/images/TipOfTheDayApple.png" alt="Tip of the Day" class="tip-apple" />
        @if (tipService.tip(); as tip) {
          @if (tip.imageUrl) {
            <img [src]="tip.imageUrl" alt="" class="tip-thumbnail" />
          }
          <div class="tip-text">
            <a [href]="tip.articleUrl" target="_blank" rel="noopener" class="tip-title">
              {{ tip.title }}
            </a>
            @if (tip.description) {
              <span class="tip-description">{{ tip.description }}</span>
            }
            <span class="tip-source">NutritionFacts.org</span>
          </div>
        } @else if (tipService.loading()) {
          <span class="tip-loading">Loading tip...</span>
        }
      </div>

      <!-- Report area -->
      <div class="report-area">
        @if (todayService.loading()) {
          <div class="loading-state">Loading today's plan...</div>
        } @else if (!hasPlan()) {
          <div class="no-plan-state">
            <p>No Plan scheduled for today.</p>
            <p class="no-plan-hint">Use RegiMenu℠ Meals to create meals and assign to a Week Plan.</p>
          </div>
        } @else {
          <!-- Header -->
          <div class="report-header">
            <div class="report-title-row">
              <span class="report-plan-name">{{ planName() }}</span>
              <div class="report-actions">
                <button class="icon-btn print-btn" disabled
                  matTooltip="Print PDF (coming soon)"
                  matTooltipPosition="above"
                  [matTooltipShowDelay]="300">
                  🖨
                </button>
                <button class="icon-btn save-btn" [class.has-changes]="!isFinalized()"
                  [disabled]="isFinalized() || isLogging()"
                  (click)="logTheDay()"
                  matTooltip="Log the day"
                  matTooltipPosition="above"
                  [matTooltipShowDelay]="300">
                  @if (isLogging()) {
                    <span class="save-spinner"></span>
                  } @else {
                    ✓
                  }
                </button>
              </div>
            </div>
            <div class="report-subtitle">
              RegiMenu<sup class="sm">SM</sup> generated for {{ userName$ | async }}
            </div>
            <div class="report-totals">
              Actual Daily Totals: {{ activeTotals().calories }} calories |
              {{ activeTotals().protein }}g protein ({{ activeTotals().proteinPct }}%) |
              {{ activeTotals().fat }}g fat ({{ activeTotals().fatPct }}%) |
              {{ activeTotals().carbs }}g carbs ({{ activeTotals().carbsPct }}%)
            </div>
          </div>

          <!-- Meals -->
          @for (meal of mealGroups(); track meal.slot) {
            <div class="meal-section">
              <div class="meal-header">
                <button class="yeh-logo-btn" [class.affirmed]="meal.affirmed"
                  (click)="toggleMealAffirm(meal)"
                  matTooltip="Affirm this meal — checks all items"
                  matTooltipPosition="above"
                  [matTooltipShowDelay]="300">
                  <img src="/images/yeh_logo_dark.png" alt="YEH" class="yeh-logo-img" />
                </button>
                <span class="meal-title-line">{{ meal.time }} Meal {{ meal.slot }} - {{ meal.name }}</span>
              </div>
              <div class="meal-totals">
                Total: {{ getMealActiveTotals(meal).calories }} cal |
                {{ getMealActiveTotals(meal).protein }}g protein |
                {{ getMealActiveTotals(meal).fat }}g fat |
                {{ getMealActiveTotals(meal).carbs }}g carbs
              </div>

              <!-- Food items -->
              <div class="food-list">
                @for (item of meal.items; track item.id) {
                  <div class="food-row">
                    <input type="checkbox"
                      class="food-check"
                      [checked]="isItemChecked(item.id)"
                      (change)="toggleItem(item.id, meal)" />
                    <span class="food-name"
                      (click)="showFoodPopup(item, $event)"
                      (mouseenter)="showFoodPopup(item, $event)"
                      (mouseleave)="hideFoodPopup()">
                      {{ item.foodName }}
                    </span>
                    <span class="food-qty">{{ item.quantity }} {{ item.unit }}</span>
                  </div>
                }
              </div>
            </div>
          }

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
            <div class="popup-header">{{ foodPopup()!.item.foodName }}</div>
            <div class="popup-row"><span>Quantity</span><span>{{ foodPopup()!.item.quantity }} {{ foodPopup()!.item.unit }}</span></div>
            <div class="popup-row"><span>Calories</span><span>{{ foodPopup()!.item.calories ?? 0 }}</span></div>
            <div class="popup-row"><span>Protein</span><span>{{ foodPopup()!.item.proteinG ?? 0 }}g</span></div>
            <div class="popup-row"><span>Fat</span><span>{{ foodPopup()!.item.fatG ?? 0 }}g</span></div>
            <div class="popup-row"><span>Carbs</span><span>{{ foodPopup()!.item.carbG ?? 0 }}g</span></div>
          </div>
        </div>
      }

      <!-- Good Job popup -->
      @if (showGoodJob()) {
        <div class="food-popup-overlay" (click)="dismissGoodJob()">
          <div class="good-job-dialog" (click)="$event.stopPropagation()">
            <p class="good-job-text">Good Job! Logging the day's meals.</p>
            <button class="dismiss-btn" (click)="confirmLog()">OK</button>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./today-panel.scss']
})
export class TodayPanelComponent implements OnInit {
  tipService = inject(NutritionTipService);
  todayService = inject(TodayService);
  private prefs = inject(PreferencesService);
  private weekPlanService = inject(WeekPlanService);
  private notificationService = inject(NotificationService);
  private auth = inject(AuthService);

  userName$ = this.auth.user$.pipe(map(u => u?.name ?? 'User'));

  // Checked food item IDs
  private checkedItems = signal<Set<number>>(new Set());

  // Meal groups built from today's log
  mealGroups = signal<MealGroup[]>([]);

  // Plan name
  planName = signal('');
  hasPlan = signal(false);
  isFinalized = signal(false);
  isLogging = signal(false);

  // Popups
  foodPopup = signal<FoodPopup | null>(null);
  showGoodJob = signal(false);

  // Computed active totals (adjusted for unchecked items)
  activeTotals = computed(() => {
    const checked = this.checkedItems();
    const meals = this.mealGroups();
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

  allMealsAffirmed = computed(() => {
    return this.mealGroups().length > 0 && this.mealGroups().every(m => m.affirmed);
  });

  async ngOnInit(): Promise<void> {
    const resp = await this.todayService.fetchToday();
    if (!resp || resp.items.length === 0) {
      this.hasPlan.set(false);
      this.tipService.fetchTip();
      return;
    }

    this.hasPlan.set(true);
    this.isFinalized.set(!!resp.finalizedAt);

    // Get week plan info for meal names
    await this.weekPlanService.listWeekPlans();
    const plans = this.weekPlanService.weekPlans();
    await this.loadMealNames(resp.sourcePlanId, resp.items);

    // All items start unchecked — user affirms via YEH logo per meal
    this.checkedItems.set(new Set());

    // Load nutrition tip after report is rendered (lower priority)
    this.tipService.fetchTip();
  }

  private async loadMealNames(sourcePlanId: number | undefined, items: DailyLogItem[]): Promise<void> {
    // Group items by mealSlot
    const slotMap = new Map<number, DailyLogItem[]>();
    for (const item of items) {
      const list = slotMap.get(item.mealSlot) || [];
      list.push(item);
      slotMap.set(item.mealSlot, list);
    }

    // Find the week plan covering today's date to get plan name and meal names
    const mealNames = new Map<number, string>();
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      for (const wp of this.weekPlanService.weekPlans()) {
        const fullPlan = await this.weekPlanService.getWeekPlan(wp.id);
        const dayPlan = fullPlan.days?.find(d => d.planDate === todayStr);
        if (dayPlan) {
          this.planName.set(fullPlan.name || 'Plan');
          for (const dpm of dayPlan.meals || []) {
            if (dpm.meal?.name) {
              mealNames.set(dpm.mealSlot, dpm.meal.name);
            }
          }
          break;
        }
      }
    } catch {
      // Fallback — no meal names
    }

    // Build meal groups with timing
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
        name: mealNames.get(slot) || `Meal ${slot}`,
        items: slotItems,
        totalCalories: totalCal,
        totalProtein: totalPro,
        totalFat: totalFat,
        totalCarbs: totalCarbs,
        affirmed: false
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
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    this.checkedItems.set(next);

    // Update meal affirmed state — affirmed only if all items checked
    this.updateMealAffirmed(meal);
  }

  toggleMealAffirm(meal: MealGroup): void {
    const checked = this.checkedItems();
    const allChecked = meal.items.every(i => checked.has(i.id));

    const next = new Set(checked);
    if (allChecked) {
      // Un-affirm: uncheck all items in this meal
      for (const item of meal.items) {
        next.delete(item.id);
      }
    } else {
      // Affirm: check all items in this meal
      for (const item of meal.items) {
        next.add(item.id);
      }
    }
    this.checkedItems.set(next);
    this.updateMealAffirmed(meal);
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

  // --- Logging ---

  async logTheDay(): Promise<void> {
    if (this.allMealsAffirmed()) {
      this.showGoodJob.set(true);
    } else {
      // Log anyway with what's checked
      await this.doLog();
    }
  }

  dismissGoodJob(): void {
    this.showGoodJob.set(false);
  }

  async confirmLog(): Promise<void> {
    this.showGoodJob.set(false);
    await this.doLog();
  }

  private async doLog(): Promise<void> {
    this.isLogging.set(true);
    const success = await this.todayService.finalizeToday();
    this.isLogging.set(false);
    if (success) {
      this.isFinalized.set(true);
      this.notificationService.show('Day logged successfully', 'success');
    } else {
      this.notificationService.show('Failed to log the day', 'error');
    }
  }
}
