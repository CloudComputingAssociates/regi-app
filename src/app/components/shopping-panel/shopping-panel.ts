// src/app/components/shopping-panel/shopping-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, effect, OnInit, OnDestroy, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { TabService } from '../../services/tab.service';
import { SettingsService } from '../../services/settings.service';
import { WeekPlanService } from '../../services/week-plan.service';
import { PreferencesService, WeekStartDay } from '../../services/preferences.service';
import { NotificationService } from '../../services/notification.service';
import { ShoppingStaple } from '../../models/settings.models';
import { WeekPlan, ShoppingProgressItem } from '../../models/planning.model';
import { WeekPlanPrintService } from '../../services/week-plan-print.service';
import { AuthService } from '@auth0/auth0-angular';
import { map, firstValueFrom } from 'rxjs';

const DAY_TO_NUM: Record<WeekStartDay, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

type StapleCategory = 'proteins' | 'produce' | 'bulk' | 'dairy' | 'aisles' | 'non_food';

interface CategorySection {
  id: StapleCategory;
  label: string;
}

/** Aggregated food item from week plan */
interface PlanFoodItem {
  foodId: number;
  foodName: string;
  displayName: string;
  totalQty: number;
  unit: string;
  pickedUp: boolean;
  needed: boolean;
  categoryName: string;
  productPurchaseLink?: string;
}

/** Plan food categories for accordion grouping */
interface PlanCategory {
  id: string;
  label: string;
}

const PLAN_CATEGORIES: PlanCategory[] = [
  { id: 'protein', label: 'Proteins' },
  { id: 'vegetable', label: 'Produce/Vegetables' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'grain', label: 'Grains' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'fat', label: 'Fats/Oils' },
  { id: 'other', label: 'Other' }
];

@Component({
  selector: 'app-shopping-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule, MatDatepickerModule, MatNativeDateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container" #panelContainer>
      <!-- Action buttons - top right -->
      <div class="action-buttons">
        @if (isSaving()) {
          <span class="auto-save-indicator">saving...</span>
        }
        <button
          class="icon-btn print-btn"
          (click)="openPrintDialog()"
          [disabled]="!selectedWeekPlan()"
          matTooltip="Print Plan Details"
          matTooltipPosition="above"
          [matTooltipShowDelay]="300">
          <mat-icon>print</mat-icon>
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

      <!-- Top pane: Plan Foods -->
      <div class="plan-pane" [style.flex]="topFlex()">
        <div class="plan-header">
          <div class="plan-header-left">
            <input
              class="date-input"
              [matDatepicker]="shopPicker"
              [value]="selectedDate()"
              (dateChange)="onDateChange($event.value)"
              [matDatepickerFilter]="weekStartFilter"
              readonly />
            <mat-datepicker-toggle [for]="shopPicker" class="date-toggle" />
            <mat-datepicker #shopPicker />
            <button class="check-all-btn" (click)="checkEverything()"
              matTooltip="Use this to review for un-checked items before checkout."
              matTooltipPosition="above"
              [matTooltipShowDelay]="300">
              Missed Items
            </button>
          </div>
        </div>
        <div class="plan-foods-title">
          @if (selectedPlanName()) {
            <span class="staples-title">{{ selectedPlanName() }}</span>
          }
          <span class="staples-title buy-column-label">Need</span>
        </div>

        <div class="plan-content">
          @if (!selectedWeekPlan()) {
            <div class="plan-empty">
              <p>No plan for this week — pick a date with a slotted plan</p>
            </div>
          } @else if (planFoodItems().length === 0) {
            <div class="plan-empty">
              <p>No meals slotted for this week</p>
            </div>
          } @else {
            <div class="plan-items-list">
              @for (cat of planCategories; track cat.id) {
                @if (getPlanCategoryItems(cat.id).length > 0) {
                  <div class="accordion-section">
                    <button class="accordion-header" (click)="togglePlanCategory(cat.id)">
                      <mat-icon class="accordion-arrow" [class.open]="isPlanCategoryOpen(cat.id)">chevron_right</mat-icon>
                      <span class="accordion-title">{{ cat.label }}</span>
                    </button>
                    @if (isPlanCategoryOpen(cat.id)) {
                      <div class="accordion-body">
                        @for (item of getPlanCategoryItems(cat.id); track item.foodId) {
                          <div class="staple-row" [class.not-needed]="!item.needed" [class.picked-up]="item.pickedUp && item.needed">
                            <input type="checkbox"
                              class="picked-up-check"
                              [checked]="item.pickedUp"
                              [disabled]="!item.needed"
                              (change)="togglePlanPickedUp(item)" />

                            <span class="plan-qty">{{ item.totalQty }} {{ item.unit }}</span>
                            @if (item.productPurchaseLink) {
                              <a class="plan-food-name food-link" [href]="item.productPurchaseLink" target="_blank" rel="noopener" (click)="$event.stopPropagation()">{{ item.displayName }}</a>
                            } @else {
                              <span class="plan-food-name">{{ item.displayName }}</span>
                            }

                            <label class="toggle-slider" [class.on]="item.needed">
                              <input type="checkbox"
                                [checked]="item.needed"
                                (change)="togglePlanNeeded(item)" />
                              <span class="toggle-track">
                                <span class="toggle-thumb"></span>
                              </span>
                            </label>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              }
            </div>
          }
        </div>
      </div>

      <!-- Draggable splitter -->
      <div class="splitter-bar"
        (mousedown)="onSplitterMouseDown($event)"
        (touchstart)="onSplitterTouchStart($event)">
        <span class="splitter-grip">⇕</span>
      </div>

      <!-- Bottom pane: Staples -->
      <div class="staples-pane" [style.flex]="bottomFlex()">
        <div class="staples-header">
          <span class="staples-title">Staples</span>
          <span class="staples-title buy-column-label">Buy</span>
        </div>

        <div class="staples-content">
          @for (cat of categories; track cat.id) {
            <div class="accordion-section">
              <button class="accordion-header" (click)="toggleCategory(cat.id)">
                <mat-icon class="accordion-arrow" [class.open]="isCategoryOpen(cat.id)">chevron_right</mat-icon>
                <span class="accordion-title">{{ cat.label }}</span>
              </button>

              @if (isCategoryOpen(cat.id)) {
                <div class="accordion-body">
                  <!-- Add row -->
                  <div class="add-row">
                    <input
                      type="text"
                      class="add-input"
                      [placeholder]="'Add ' + cat.label.toLowerCase() + ' item...'"
                      [value]="getNewItemText(cat.id)"
                      (input)="onNewItemInput(cat.id, $event)"
                      (keydown.enter)="addItem(cat.id)" />
                    <button
                      class="add-btn"
                      [disabled]="!getNewItemText(cat.id)"
                      (click)="addItem(cat.id)"
                      matTooltip="Add item"
                      matTooltipPosition="above"
                      [matTooltipShowDelay]="300">
                      +
                    </button>
                  </div>

                  <!-- Staple rows -->
                  @for (staple of getCategoryItems(cat.id); track staple.id) {
                    <div class="staple-row" [class.not-needed]="staple.needed === false" [class.picked-up]="staple.pickedUp && staple.needed !== false">
                      <input type="checkbox"
                        class="picked-up-check"
                        [checked]="staple.pickedUp || staple.needed === false"
                        [disabled]="staple.needed === false"
                        (change)="togglePickedUp(staple)" />

                      <input type="text"
                        class="staple-qty"
                        [value]="staple.qty || ''"
                        (change)="updateField(staple, 'qty', $event)"
                        placeholder="Qty" />

                      <input type="text"
                        class="staple-item"
                        [value]="staple.item"
                        (change)="updateField(staple, 'item', $event)" />

                      <input type="text"
                        class="staple-store"
                        [value]="staple.store || ''"
                        (change)="updateField(staple, 'store', $event)"
                        placeholder="Store" />

                      <label class="toggle-slider" [class.on]="staple.needed !== false">
                        <input type="checkbox"
                          [checked]="staple.needed !== false"
                          (change)="toggleNeeded(staple)" />
                        <span class="toggle-track">
                          <span class="toggle-thumb"></span>
                        </span>
                      </label>

                      <button class="delete-btn"
                        (click)="deleteItem(staple)"
                        matTooltip="Delete"
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="300">
                        <mat-icon class="delete-icon">delete</mat-icon>
                      </button>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- "Did I get everything?" confirmation dialog -->
      <!-- Print options dialog -->
      @if (showPrintDialog()) {
        <div class="confirm-overlay" (click)="closePrintDialog()">
          <div class="confirm-dialog print-dialog" (click)="$event.stopPropagation()">
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

      @if (showCheckDialog()) {
        <div class="confirm-overlay" (click)="closeCheckDialog()">
          <div class="confirm-dialog check-dialog" (click)="$event.stopPropagation()">
            @if (missingItems().planFoods.length === 0 && missingItems().staples.length === 0) {
              <p class="check-result check-success">All done! Everything is checked.</p>
            } @else {
              <p class="check-result check-missing">Missed Items</p>
              @if (missingItems().planFoods.length > 0) {
                <div class="missing-group">
                  <strong>Plan Foods:</strong>
                  <span>{{ missingItems().planFoods.join(', ') }}</span>
                </div>
              }
              @if (missingItems().staples.length > 0) {
                <div class="missing-group">
                  <strong>Staples:</strong>
                  <span>{{ missingItems().staples.join(', ') }}</span>
                </div>
              }
            }
            <button class="dismiss-btn" (click)="closeCheckDialog()">OK</button>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./shopping-panel.scss']
})
export class ShoppingPanelComponent implements OnInit, OnDestroy {
  private tabService = inject(TabService);
  private settingsService = inject(SettingsService);
  private weekPlanService = inject(WeekPlanService);
  private prefs = inject(PreferencesService);
  private notificationService = inject(NotificationService);
  private printService = inject(WeekPlanPrintService);
  private auth = inject(AuthService);
  private el = inject(ElementRef);
  private ngZone = inject(NgZone);

  private userName$ = this.auth.user$.pipe(map(u => u?.name ?? 'User'));

  isSaving = signal(false);

  // Print dialog
  showPrintDialog = signal(false);
  printIncludeToday = signal(false);
  printIncludeWeek = signal(false);
  printIncludeShoppingList = signal(true);
  printLoading = signal(false);

  // Staples data
  staples = signal<ShoppingStaple[]>([]);

  // Week plan / calendar
  selectedDate = signal<Date>(new Date());
  selectedWeekPlan = signal<WeekPlan | null>(null);
  selectedPlanName = signal<string>('');

  // Aggregated plan food items
  planFoodItems = signal<PlanFoodItem[]>([]);

  // Plan food category accordion
  planCategories = PLAN_CATEGORIES;
  private openPlanCategories = signal<Set<string>>(new Set(['protein', 'vegetable', 'fruit', 'grain', 'dairy', 'fat', 'other']));

  // Staple accordion state
  private openCategories = signal<Set<StapleCategory>>(new Set(['proteins']));

  // New item text per category
  private newItemTexts = signal<Record<string, string>>({});

  // Check dialog
  showCheckDialog = signal(false);
  missingItems = signal<{ planFoods: string[]; staples: string[] }>({ planFoods: [], staples: [] });

  // Splitter state: default 3/4 top, 1/4 bottom
  topFlex = signal('3 1 0%');
  bottomFlex = signal('1 1 0%');

  private isDragging = false;
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: (() => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: (() => void) | null = null;

  categories: CategorySection[] = [
    { id: 'proteins', label: 'Proteins' },
    { id: 'produce', label: 'Produce/Vegetables' },
    { id: 'bulk', label: 'Bulk' },
    { id: 'dairy', label: 'Dairy' },
    { id: 'aisles', label: 'Aisles' },
    { id: 'non_food', label: 'Non-Food Items' }
  ];

  // Calendar filter: only allow selecting week-start days
  weekStartFilter = (d: Date | null): boolean => {
    if (!d) return false;
    return d.getDay() === DAY_TO_NUM[this.prefs.weekStartDay()];
  };

  // Watch for settings to load (handles page refresh race condition)
  private settingsEffect = effect(() => {
    const all = this.settingsService.allSettings();
    if (all?.shoppingStaples && this.staples().length === 0) {
      this.staples.set([...all.shoppingStaples]);
    }
  });

  async ngOnInit(): Promise<void> {
    // Load available week plans then auto-select
    await this.weekPlanService.listWeekPlans();
    this.autoSelectWeek();
  }

  ngOnDestroy(): void {
    this.cleanupDragListeners();
  }

  // --- Auto-save ---

  private async autoSave(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.settingsService.saveShoppingStaples(this.staples());
    } catch {
      this.notificationService.show('Failed to save staples', 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  // --- Week plan selection via calendar ---

  /** Calculate the week start date for a given date */
  private getWeekStartDate(date: Date): Date {
    const weekStartNum = DAY_TO_NUM[this.prefs.weekStartDay()];
    const currentDay = date.getDay();
    const diff = (currentDay - weekStartNum + 7) % 7;
    const start = new Date(date);
    start.setDate(date.getDate() - diff);
    return start;
  }

  private toDateString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Auto-select: try next week's start date first, fall back to current week */
  private autoSelectWeek(): void {
    const today = new Date();
    const thisWeekStart = this.getWeekStartDate(today);
    const nextWeekStart = new Date(thisWeekStart);
    nextWeekStart.setDate(thisWeekStart.getDate() + 7);

    const plans = this.weekPlanService.weekPlans();
    const nextMatch = plans.find(wp => wp.startDate === this.toDateString(nextWeekStart));
    const thisMatch = plans.find(wp => wp.startDate === this.toDateString(thisWeekStart));

    if (nextMatch) {
      this.selectedDate.set(nextWeekStart);
      this.loadPlanForDate(nextWeekStart);
    } else {
      this.selectedDate.set(thisWeekStart);
      this.loadPlanForDate(thisWeekStart);
    }
  }

  /** Calendar date changed */
  onDateChange(date: Date | null): void {
    if (!date) return;
    this.selectedDate.set(date);
    this.loadPlanForDate(date);
  }

  /** Find and load the week plan matching a start date */
  private async loadPlanForDate(date: Date): Promise<void> {
    const dateStr = this.toDateString(date);
    const plans = this.weekPlanService.weekPlans();
    const match = plans.find(wp => wp.startDate === dateStr);

    if (match) {
      try {
        const wp = await this.weekPlanService.getWeekPlan(match.id);
        this.selectedWeekPlan.set(wp);
        this.selectedPlanName.set(wp.name || dateStr);
        this.aggregatePlanFoods(wp);
        // Merge saved shopping progress
        if (wp.shoppingProgress?.length) {
          const progressMap = new Map(wp.shoppingProgress.map(p => [p.foodId, p]));
          this.planFoodItems.update(items =>
            items.map(item => {
              const saved = progressMap.get(item.foodId);
              return saved ? { ...item, pickedUp: saved.pickedUp, needed: saved.needed } : item;
            })
          );
        }
      } catch {
        this.selectedWeekPlan.set(null);
        this.selectedPlanName.set('');
        this.planFoodItems.set([]);
      }
    } else {
      this.selectedWeekPlan.set(null);
      this.selectedPlanName.set('');
      this.planFoodItems.set([]);
    }
  }

  /** Map DB categoryName (e.g. "Protein", "Vegetable") to our plan category id */
  private normalizePlanCategory(cat?: string): string {
    if (!cat) return 'other';
    const lower = cat.toLowerCase();
    if (lower.includes('protein')) return 'protein';
    if (lower.includes('vegetable')) return 'vegetable';
    if (lower.includes('fruit')) return 'fruit';
    if (lower.includes('grain') || lower.includes('carbohydrate')) return 'grain';
    if (lower.includes('dairy')) return 'dairy';
    if (lower.includes('fat') || lower.includes('oil')) return 'fat';
    return 'other';
  }

  private aggregatePlanFoods(wp: WeekPlan): void {
    const map = new Map<number, PlanFoodItem>();

    for (const day of wp.days || []) {
      for (const dpm of day.meals || []) {
        if (!dpm.meal?.items) continue;
        for (const item of dpm.meal.items) {
          const existing = map.get(item.foodId);
          if (existing) {
            existing.totalQty += item.quantity;
          } else {
            map.set(item.foodId, {
              foodId: item.foodId,
              foodName: item.foodName,
              displayName: item.shortDescription || item.foodName,
              totalQty: item.quantity,
              unit: item.unit,
              pickedUp: false,
              needed: true,
              categoryName: this.normalizePlanCategory(item.categoryName),
              productPurchaseLink: item.productPurchaseLink
            });
          }
        }
      }
    }

    this.planFoodItems.set(
      Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
    );
  }

  togglePlanPickedUp(item: PlanFoodItem): void {
    this.planFoodItems.update(list =>
      list.map(i => i.foodId === item.foodId ? { ...i, pickedUp: !i.pickedUp } : i)
    );
    this.savePlanProgress();
  }

  togglePlanNeeded(item: PlanFoodItem): void {
    this.planFoodItems.update(list =>
      list.map(i => i.foodId === item.foodId
        ? { ...i, needed: !i.needed, pickedUp: i.needed ? true : false }
        : i
      )
    );
    this.savePlanProgress();
  }

  private async savePlanProgress(): Promise<void> {
    const wp = this.selectedWeekPlan();
    if (!wp) return;
    const progress: ShoppingProgressItem[] = this.planFoodItems().map(item => ({
      foodId: item.foodId,
      pickedUp: item.pickedUp,
      needed: item.needed
    }));
    try {
      await this.weekPlanService.updateShoppingProgress(wp.id, progress);
    } catch {
      this.notificationService.show('Failed to save shopping progress', 'error');
    }
  }

  // --- "Did I get everything?" ---

  checkEverything(): void {
    const missingPlan = this.planFoodItems()
      .filter(i => i.needed && !i.pickedUp)
      .map(i => i.foodName);

    const missingStaples = this.staples()
      .filter(s => s.needed !== false && !s.pickedUp)
      .map(s => s.item);

    this.missingItems.set({ planFoods: missingPlan, staples: missingStaples });
    this.showCheckDialog.set(true);
  }

  closeCheckDialog(): void {
    this.showCheckDialog.set(false);
  }

  // --- Accordion ---

  // --- Plan food category accordion ---

  togglePlanCategory(id: string): void {
    const current = this.openPlanCategories();
    const next = new Set(current);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    this.openPlanCategories.set(next);
  }

  isPlanCategoryOpen(id: string): boolean {
    return this.openPlanCategories().has(id);
  }

  getPlanCategoryItems(categoryId: string): PlanFoodItem[] {
    return this.planFoodItems().filter(i => i.categoryName === categoryId);
  }

  // --- Staple accordion ---

  toggleCategory(id: StapleCategory): void {
    const current = this.openCategories();
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.openCategories.set(next);
  }

  isCategoryOpen(id: StapleCategory): boolean {
    return this.openCategories().has(id);
  }

  getCategoryItems(category: StapleCategory): ShoppingStaple[] {
    return this.staples()
      .filter(s => s.category === category)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  // --- New item ---

  getNewItemText(category: string): string {
    return this.newItemTexts()[category] || '';
  }

  onNewItemInput(category: string, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.newItemTexts.update(texts => ({ ...texts, [category]: val }));
  }

  addItem(category: StapleCategory): void {
    const text = this.getNewItemText(category).trim();
    if (!text) return;

    const categoryItems = this.getCategoryItems(category);
    const newStaple: ShoppingStaple = {
      id: crypto.randomUUID(),
      category,
      item: text,
      qty: '1',
      needed: true,
      pickedUp: false,
      sortOrder: categoryItems.length
    };

    this.staples.update(list => [...list, newStaple]);
    this.newItemTexts.update(texts => ({ ...texts, [category]: '' }));
    this.autoSave();
  }

  // --- Staple row actions ---

  togglePickedUp(staple: ShoppingStaple): void {
    this.staples.update(list =>
      list.map(s => s.id === staple.id ? { ...s, pickedUp: !s.pickedUp } : s)
    );
    this.autoSave();
  }

  toggleNeeded(staple: ShoppingStaple): void {
    const wasNeeded = staple.needed !== false;
    this.staples.update(list =>
      list.map(s => s.id === staple.id
        ? { ...s, needed: !wasNeeded, pickedUp: wasNeeded ? true : false }
        : s
      )
    );
    this.autoSave();
  }

  updateField(staple: ShoppingStaple, field: 'qty' | 'item' | 'store', event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.staples.update(list =>
      list.map(s => s.id === staple.id ? { ...s, [field]: val } : s)
    );
    this.autoSave();
  }

  deleteItem(staple: ShoppingStaple): void {
    this.staples.update(list => list.filter(s => s.id !== staple.id));
    this.autoSave();
  }

  close(): void {
    this.tabService.closeTab('shop');
  }

  openPrintDialog(): void {
    this.printIncludeToday.set(false);
    this.printIncludeWeek.set(false);
    this.printIncludeShoppingList.set(true);
    this.showPrintDialog.set(true);
  }

  closePrintDialog(): void {
    this.showPrintDialog.set(false);
  }

  async executePrint(): Promise<void> {
    const wp = this.selectedWeekPlan();
    if (!wp) return;

    this.printLoading.set(true);
    try {
      const userName = await firstValueFrom(this.userName$);
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');

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
      this.notificationService.show('Failed to print', 'error');
    } finally {
      this.printLoading.set(false);
    }
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
    let ratio = (clientY - rect.top) / rect.height;
    ratio = Math.max(0.15, Math.min(0.85, ratio));
    this.ngZone.run(() => {
      this.topFlex.set(`${ratio} 1 0%`);
      this.bottomFlex.set(`${1 - ratio} 1 0%`);
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
