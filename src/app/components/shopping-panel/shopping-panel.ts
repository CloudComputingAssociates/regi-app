// src/app/components/shopping-panel/shopping-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { TabService } from '../../services/tab.service';
import { SettingsService } from '../../services/settings.service';
import { WeekPlanService } from '../../services/week-plan.service';
import { NotificationService } from '../../services/notification.service';
import { ShoppingStaple } from '../../models/settings.models';
import { WeekPlan, WeekPlanSummary, MealItem } from '../../models/planning.model';

type StapleCategory = 'proteins' | 'produce' | 'bulk' | 'dairy' | 'aisles' | 'non_food';

interface CategorySection {
  id: StapleCategory;
  label: string;
}

/** Aggregated food item from week plan */
interface PlanFoodItem {
  foodId: number;
  foodName: string;
  totalQty: number;
  unit: string;
  pickedUp: boolean;
  needed: boolean;
}

@Component({
  selector: 'app-shopping-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container" #panelContainer>
      <!-- Action buttons - top right -->
      <div class="action-buttons">
        <button
          class="icon-btn save-btn"
          [class.has-changes]="hasChanges()"
          [disabled]="isSaving()"
          (click)="save()"
          matTooltip="Save"
          matTooltipPosition="above"
          [matTooltipShowDelay]="300">
          @if (isSaving()) {
            <span class="save-spinner"></span>
          } @else {
            ✓
          }
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

      <!-- Top pane: Week Plan Foods -->
      <div class="plan-pane" [style.flex]="topFlex()">
        <div class="plan-header">
          <div class="plan-header-left">
            <select class="week-select" [ngModel]="selectedWeekPlanId()" (ngModelChange)="onWeekPlanChange($event)">
              <option [ngValue]="null">— Select week —</option>
              @for (wp of availableWeekPlans(); track wp.id) {
                <option [ngValue]="wp.id">{{ wp.name || wp.startDate }}</option>
              }
            </select>
          </div>
          <div class="plan-header-right">
            <button class="check-all-btn" (click)="checkEverything()"
              matTooltip="Did I get everything?"
              matTooltipPosition="above"
              [matTooltipShowDelay]="300">
              ✔ Got everything?
            </button>
          </div>
        </div>

        <div class="plan-content">
          @if (!selectedWeekPlan()) {
            <div class="plan-empty">
              <p>Select a week plan to see shopping items</p>
            </div>
          } @else if (planFoodItems().length === 0) {
            <div class="plan-empty">
              <p>No meals slotted for this week</p>
            </div>
          } @else {
            <div class="plan-items-list">
              @for (item of planFoodItems(); track item.foodId) {
                <div class="staple-row" [class.not-needed]="!item.needed">
                  <input type="checkbox"
                    class="picked-up-check"
                    [checked]="item.pickedUp"
                    [disabled]="!item.needed"
                    (change)="togglePlanPickedUp(item)" />

                  <label class="toggle-slider" [class.on]="item.needed">
                    <input type="checkbox"
                      [checked]="item.needed"
                      (change)="togglePlanNeeded(item)" />
                    <span class="toggle-track">
                      <span class="toggle-thumb"></span>
                    </span>
                  </label>

                  <span class="plan-qty">{{ item.totalQty }} {{ item.unit }}</span>
                  <span class="plan-food-name">{{ item.foodName }}</span>
                </div>
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
        </div>

        <div class="staples-content">
          @for (cat of categories; track cat.id) {
            <div class="accordion-section">
              <button class="accordion-header" (click)="toggleCategory(cat.id)">
                <mat-icon class="accordion-arrow" [class.open]="isCategoryOpen(cat.id)">chevron_right</mat-icon>
                <span class="accordion-title">{{ cat.label }}</span>
                <span class="accordion-count">({{ getCategoryItems(cat.id).length }})</span>
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
                    <div class="staple-row" [class.not-needed]="staple.needed === false">
                      <input type="checkbox"
                        class="picked-up-check"
                        [checked]="staple.pickedUp || staple.needed === false"
                        [disabled]="staple.needed === false"
                        (change)="togglePickedUp(staple)" />

                      <label class="toggle-slider" [class.on]="staple.needed !== false">
                        <input type="checkbox"
                          [checked]="staple.needed !== false"
                          (change)="toggleNeeded(staple)" />
                        <span class="toggle-track">
                          <span class="toggle-thumb"></span>
                        </span>
                      </label>

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
      @if (showCheckDialog()) {
        <div class="confirm-overlay" (click)="closeCheckDialog()">
          <div class="confirm-dialog check-dialog" (click)="$event.stopPropagation()">
            @if (missingItems().planFoods.length === 0 && missingItems().staples.length === 0) {
              <p class="check-result check-success">✔ Yes, everything is checked!</p>
            } @else {
              <p class="check-result check-missing">You still need to get:</p>
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
  private notificationService = inject(NotificationService);
  private el = inject(ElementRef);
  private ngZone = inject(NgZone);

  isSaving = signal(false);
  private dirty = signal(false);

  // Staples data
  staples = signal<ShoppingStaple[]>([]);

  // Week plan data
  availableWeekPlans = signal<WeekPlanSummary[]>([]);
  selectedWeekPlanId = signal<number | null>(null);
  selectedWeekPlan = signal<WeekPlan | null>(null);

  // Aggregated plan food items
  planFoodItems = signal<PlanFoodItem[]>([]);

  // Accordion state
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

  async ngOnInit(): Promise<void> {
    // Load staples from settings
    const all = this.settingsService.allSettings();
    if (all?.shoppingStaples) {
      this.staples.set([...all.shoppingStaples]);
    }

    // Load available week plans
    await this.weekPlanService.listWeekPlans();
    this.availableWeekPlans.set(this.weekPlanService.weekPlans());

    // Auto-select current week's plan if one exists
    this.autoSelectCurrentWeek();
  }

  ngOnDestroy(): void {
    this.cleanupDragListeners();
  }

  hasChanges(): boolean {
    return this.dirty();
  }

  // --- Week plan selection ---

  private autoSelectCurrentWeek(): void {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const mondayStr = monday.toISOString().slice(0, 10);

    // Find a plan whose startDate matches this week
    const plans = this.availableWeekPlans();
    const match = plans.find(wp => wp.startDate === mondayStr);
    if (match) {
      this.onWeekPlanChange(match.id);
    }
  }

  async onWeekPlanChange(id: number | null): Promise<void> {
    this.selectedWeekPlanId.set(id);
    if (!id) {
      this.selectedWeekPlan.set(null);
      this.planFoodItems.set([]);
      return;
    }

    try {
      const wp = await this.weekPlanService.getWeekPlan(id);
      this.selectedWeekPlan.set(wp);
      this.aggregatePlanFoods(wp);
    } catch {
      this.selectedWeekPlan.set(null);
      this.planFoodItems.set([]);
    }
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
              totalQty: item.quantity,
              unit: item.unit,
              pickedUp: false,
              needed: true
            });
          }
        }
      }
    }

    this.planFoodItems.set(
      Array.from(map.values()).sort((a, b) => a.foodName.localeCompare(b.foodName))
    );
  }

  togglePlanPickedUp(item: PlanFoodItem): void {
    this.planFoodItems.update(list =>
      list.map(i => i.foodId === item.foodId ? { ...i, pickedUp: !i.pickedUp } : i)
    );
  }

  togglePlanNeeded(item: PlanFoodItem): void {
    this.planFoodItems.update(list =>
      list.map(i => i.foodId === item.foodId
        ? { ...i, needed: !i.needed, pickedUp: !i.needed ? i.pickedUp : true }
        : i
      )
    );
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
    this.dirty.set(true);
  }

  // --- Staple row actions ---

  togglePickedUp(staple: ShoppingStaple): void {
    this.staples.update(list =>
      list.map(s => s.id === staple.id ? { ...s, pickedUp: !s.pickedUp } : s)
    );
    this.dirty.set(true);
  }

  toggleNeeded(staple: ShoppingStaple): void {
    const wasNeeded = staple.needed !== false;
    this.staples.update(list =>
      list.map(s => s.id === staple.id
        ? { ...s, needed: !wasNeeded, pickedUp: wasNeeded ? true : false }
        : s
      )
    );
    this.dirty.set(true);
  }

  updateField(staple: ShoppingStaple, field: 'qty' | 'item' | 'store', event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.staples.update(list =>
      list.map(s => s.id === staple.id ? { ...s, [field]: val } : s)
    );
    this.dirty.set(true);
  }

  deleteItem(staple: ShoppingStaple): void {
    this.staples.update(list => list.filter(s => s.id !== staple.id));
    this.dirty.set(true);
  }

  // --- Save / Close ---

  async save(): Promise<void> {
    if (!this.hasChanges()) return;
    this.isSaving.set(true);
    try {
      await this.settingsService.saveShoppingStaples(this.staples());
      this.isSaving.set(false);
      this.dirty.set(false);
      this.notificationService.show('Shopping staples saved', 'success');
    } catch {
      this.isSaving.set(false);
      this.notificationService.show('Failed to save staples', 'error');
    }
  }

  close(): void {
    this.tabService.closeTab('shop');
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
