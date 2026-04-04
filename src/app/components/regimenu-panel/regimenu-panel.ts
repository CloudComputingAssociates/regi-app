// src/app/components/regimenu-panel/regimenu-panel.ts
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
  OnInit,
  OnDestroy,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { PlanningService } from '../../services/planning.service';
import { PreferencesService } from '../../services/preferences.service';
import { NotificationService } from '../../services/notification.service';
import { ChatOutputComponent } from '../chat/chat-output/chat-output';
import { FoodPickerComponent, FoodPickerAddEvent } from '../food-picker/food-picker';
import { FoodAmountEditorComponent, FoodAmountUpdate } from '../food-amount-editor/food-amount-editor';
import { MealSummary, MealItem, UpdateMealRequest } from '../../models/planning.model';
import { NutritionFacts } from '../../models/food.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-regimenu-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule, ChatOutputComponent, FoodPickerComponent, FoodAmountEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Header with plan name and actions -->
      <div class="plan-header" [class.stippled]="foodPickerOpen()">
        <div class="header-left">
          <span class="plan-label">Meal Plan</span>

          <!-- Combo-box dropdown for plan name -->
          <div class="plan-combo" (focusout)="onComboFocusOut($event)">
            <input
              #planNameInput
              type="text"
              class="plan-name-input"
              [class.stippled-entry]="isNewPlanMode() && !newPlanNameCommitted()"
              [value]="displayPlanName()"
              (input)="onPlanNameInput($event)"
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
              aria-label="Show saved plans">
              <mat-icon class="combo-arrow">expand_more</mat-icon>
            </button>

            @if (dropdownOpen()) {
              <div class="combo-dropdown" role="listbox">
                <button
                  class="dropdown-item create-new ai-generate"
                  [class.highlighted]="dropdownHighlight() === -2"
                  (mousedown)="onAIGeneratePlan($event)"
                  role="option">
                  AI Generate Plan
                </button>
                <button
                  class="dropdown-item create-new"
                  [class.highlighted]="dropdownHighlight() === -1"
                  (mousedown)="onCreateNewPlan($event)"
                  role="option">
                  + Create Empty Plan
                </button>
                @for (plan of savedPlans(); track plan.id; let i = $index) {
                  <button
                    class="dropdown-item"
                    [class.highlighted]="dropdownHighlight() === i"
                    [class.active]="planningService.currentPlan()?.id === plan.id"
                    (mousedown)="onSelectPlan(plan, $event)"
                    role="option">
                    <span class="dropdown-item-name">{{ plan.name }}</span>
                    @if (plan.totalCalories) {
                      <span class="dropdown-item-cal">{{ plan.totalCalories }} cal</span>
                    }
                  </button>
                }
                @if (savedPlans().length === 0 && !savedPlansLoading()) {
                  <div class="dropdown-empty">No saved plans</div>
                }
                @if (savedPlansLoading()) {
                  <div class="dropdown-empty">Loading...</div>
                }
              </div>
            }
          </div>

          <!-- Add food button -->
          <button
            class="icon-btn add-food-btn"
            (click)="openFoodPicker()"
            [disabled]="(!planningService.hasPlan() && !isNewPlanMode()) || foodPickerOpen()"
            matTooltip="Add Food"
            matTooltipPosition="above">
            <mat-icon>add</mat-icon>
          </button>

          <!-- Delete plan button -->
          <button
            class="icon-btn delete-plan-btn"
            (click)="onDeletePlan()"
            [disabled]="!planningService.hasPlan()"
            matTooltip="Delete Plan"
            matTooltipPosition="above">
            <mat-icon>delete</mat-icon>
          </button>

        </div>

        <div class="header-actions">
          <button
            class="icon-btn close-btn"
            (click)="closePanel()"
            matTooltip="Close"
            matTooltipPosition="above">
            ✕
          </button>
        </div>
      </div>

      <!-- Totals row beneath header -->
      @if (planningService.hasPlan()) {
        <div class="totals-row" [class.stippled]="foodPickerOpen()">
          <span class="totals-value">{{ planningService.currentPlan()?.totalCalories ?? 0 }} cal</span>
          <span class="totals-value">{{ planningService.currentPlan()?.totalFiberG?.toFixed(0) ?? 0 }}g fiber</span>
          <span class="totals-value">{{ planningService.currentPlan()?.totalSodiumMg?.toFixed(0) ?? 0 }}mg salt</span>
        </div>

        <!-- Prep Video row -->
        <div class="prep-video-row">
          <label class="prep-video-label">Prep Video</label>
          <input
            type="url"
            class="prep-video-input"
            [ngModel]="prepVideoLink()"
            (ngModelChange)="onPrepVideoChange($event)"
            placeholder="https://youtube.com/..." />
          @if (prepVideoLink()) {
            <button class="prep-video-test-btn" (click)="testPrepVideo()" matTooltip="Watch video" matTooltipPosition="above">
              <mat-icon>visibility</mat-icon>
            </button>
          }
          <button
            class="prep-video-save-btn"
            [disabled]="!prepVideoDirty()"
            (click)="savePrepVideo()"
            matTooltip="Save prep video link"
            matTooltipPosition="above">
            <mat-icon>check</mat-icon>
          </button>
        </div>
      }

      <!-- Plan items list -->
      <div class="plan-list-container">
        @if (planningService.loading()) {
          <div class="loading-message">
            <div class="spinner-large"></div>
            <p>Please wait, meal plan coming...</p>
          </div>
        } @else if (planningService.error()) {
          <div class="error-message">
            <p>{{ planningService.error() }}</p>
          </div>
        } @else if (!planningService.hasPlan()) {
          <div class="empty-message">
            <p class="placeholder-text">Intelligent meal planning powered by AI</p>
            <p class="placeholder-subtext">Select a plan or choose "AI Generate Plan" from the dropdown</p>
          </div>
        } @else {
          <div class="plan-list" #planList>
            @for (item of planningService.planItems(); track item.id; let i = $index) {
              <div
                class="plan-item"
                [class.swiping]="swipingIndex() === i"
                [style.transform]="getSwipeTransform(i)"
                (dblclick)="openAmountEditor(i)"
                (touchstart)="onTouchStart($event, i); onItemLongPressStart(i)"
                (touchmove)="onTouchMove($event, i); onItemLongPressEnd()"
                (touchend)="onTouchEnd($event, i); onItemLongPressEnd()"
                matTooltip="Double-click (Web) or press-and-hold (Mobile) to edit"
                #itemTooltip="matTooltip"
                [matTooltipShowDelay]="2000"
                matTooltipPosition="above"
                (mouseenter)="scheduleTooltipHide(itemTooltip)"
                (mouseleave)="clearTooltipHide()">

                <div class="item-content">
                  <!-- Thumbnail -->
                  <div class="item-thumbnail">
                    @if (item.foodImageThumbnail) {
                      <img [src]="item.foodImageThumbnail" alt="" class="thumbnail-img">
                    } @else {
                      <div class="thumbnail-placeholder"></div>
                    }
                  </div>

                  <!-- Description and quantity -->
                  <div class="item-details">
                    @if (item.productPurchaseLink) {
                      <span class="item-description food-link" (click)="openProductLink($event, item.productPurchaseLink!)">{{ item.shortDescription || item.foodName }}</span>
                    } @else {
                      <span class="item-description">{{ item.shortDescription || item.foodName }}</span>
                    }
                    <span class="item-quantity">{{ formatQuantity(item.quantity, item.unit) }} {{ displayUnit(item.unit) }}</span>
                  </div>

                  <!-- Macros summary -->
                  <div class="item-macros">
                    @if (item.calories) {
                      <span class="macro">{{ item.calories }} cal</span>
                    }
                  </div>

                  <!-- Edit button -->
                  <button class="item-edit-btn" (click)="openAmountEditor(i)" aria-label="Edit amount">
                    <mat-icon>edit</mat-icon>
                  </button>

                  <!-- Delete button -->
                  <button class="item-delete-btn" (click)="deleteItem(i)" aria-label="Delete item">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>

                <!-- Delete action (revealed on swipe) -->
                <div class="delete-action">
                  <span>Delete</span>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Mini chat panel (bottom-attached, collapsible) -->
      @if (hasRegimenuMessages() || chatService.regimenuIsLoading()) {
        <div class="mini-chat-panel" [class.collapsed]="isChatCollapsed()">
          <button class="mini-chat-toggle" (click)="toggleChat()">
            <span class="toggle-icon">{{ isChatCollapsed() ? '▲' : '▼' }}</span>
            <span class="toggle-label">AI Chat</span>
          </button>
          @if (!isChatCollapsed()) {
            <app-chat-output context="regimenu" [condensed]="true" />
          }
        </div>
      }

      <!-- Food picker overlay (never destroyed, shown/hidden via isOpen) -->
      <app-food-picker
        [mealPlanId]="planningService.currentPlan()?.id?.toString() ?? ''"
        [isOpen]="foodPickerOpen()"
        [showNameField]="isNewPlanMode() && !newPlanNameCommitted()"
        (foodAdded)="onFoodPickerAdd($event)"
        (closed)="closeFoodPicker()" />

      <!-- Food amount editor overlay -->
      <app-food-amount-editor
        [isOpen]="amountEditorOpen()"
        [item]="editingItem()"
        [itemIndex]="editingIndex()"
        [nutritionFacts]="editingNutritionFacts()"
        [baseServingSizeG]="editingBaseServingG()"
        (amountChanged)="onAmountChanged($event)"
        (closed)="closeAmountEditor()" />
    </div>
  `,
  styleUrls: ['./regimenu-panel.scss']
})
export class RegimenuPanelComponent implements OnInit, OnDestroy {
  private tabService = inject(TabService);
  chatService = inject(ChatService);
  planningService = inject(PlanningService);
  private preferencesService = inject(PreferencesService);
  private notificationService = inject(NotificationService);

  @ViewChild('planList') planListRef!: ElementRef<HTMLElement>;
  @ViewChild('planNameInput') planNameInputRef!: ElementRef<HTMLInputElement>;

  isChatCollapsed = signal(false);
  hasChanges = signal(false);
  private pendingName: string | null = null;

  // Dropdown state
  savedPlans = signal<MealSummary[]>([]);
  savedPlansLoading = signal(false);
  dropdownOpen = signal(false);
  dropdownHighlight = signal<number>(-2); // -2 = none, -1 = "create new", 0+ = plan index

  // New plan mode
  isNewPlanMode = signal(false);
  newPlanNameCommitted = signal(false);
  private newPlanName = '';

  // Food picker overlay state
  foodPickerOpen = signal(false);

  // Food amount editor state
  amountEditorOpen = signal(false);
  editingIndex = signal(-1);
  editingItem = signal<MealItem | null>(null);
  editingNutritionFacts = signal<NutritionFacts | null>(null);
  editingBaseServingG = signal(100);

  // Swipe state
  swipingIndex = signal<number | null>(null);
  swipeOffset = signal(0);

  // Touch tracking
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private isSwiping = false;

  private subscriptions: Subscription[] = [];

  hasRegimenuMessages = computed(() => this.chatService.regimenuMessages().length > 0);

  displayPlanName = computed(() => {
    if (this.isNewPlanMode()) {
      return this.newPlanName;
    }
    return this.planningService.planName();
  });

  isNewPlanUnnamed = computed(() => {
    return this.isNewPlanMode() && !this.newPlanNameCommitted();
  });


  ngOnInit(): void {
    this.fetchSavedPlans();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  fetchSavedPlans(): void {
    this.savedPlansLoading.set(true);
    const sub = this.planningService.listMeals({ status: 'active', limit: 50 }).subscribe({
      next: (meals) => {
        this.savedPlans.set(meals);
        this.savedPlansLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch saved plans:', err);
        this.savedPlansLoading.set(false);
      }
    });
    this.subscriptions.push(sub);
  }

  // Combo-box interactions
  onComboInputFocus(): void {
    this.openDropdown();
  }

  onDropdownToggleMousedown(event: MouseEvent): void {
    event.preventDefault(); // prevent input blur
    if (this.dropdownOpen()) {
      this.closeDropdown();
    } else {
      this.openDropdown();
      this.planNameInputRef?.nativeElement?.focus();
    }
  }

  openDropdown(): void {
    if (!this.dropdownOpen()) {
      this.fetchSavedPlans();
      this.dropdownOpen.set(true);
      this.dropdownHighlight.set(-2);
    }
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
    this.dropdownHighlight.set(-2);
  }

  onComboFocusOut(event: FocusEvent): void {
    const related = event.relatedTarget as HTMLElement | null;
    const combo = (event.currentTarget as HTMLElement);
    if (related && combo.contains(related)) {
      return; // focus moved within the combo — don't close
    }
    this.closeDropdown();

    // If in new plan mode and user blurs out, commit the name if non-empty
    if (this.isNewPlanMode() && !this.newPlanNameCommitted() && this.newPlanName.trim()) {
      this.commitNewPlanName();
    }

    // Auto-save if plan name was changed on an existing plan
    if (!this.isNewPlanMode() && this.pendingName !== null) {
      this.autoSave();
    }
  }

  onArrowDown(event: Event): void {
    event.preventDefault();
    if (!this.dropdownOpen()) {
      this.openDropdown();
      return;
    }
    const max = this.savedPlans().length - 1;
    const current = this.dropdownHighlight();
    if (current < max) {
      this.dropdownHighlight.set(current + 1);
    }
  }

  onAIGeneratePlan(event: MouseEvent): void {
    event.preventDefault();
    this.closeDropdown();
    this.generatePlan();
  }

  onCreateNewPlan(event: MouseEvent): void {
    event.preventDefault();
    this.planningService.clearPlan();
    this.isNewPlanMode.set(true);
    this.newPlanNameCommitted.set(false);

    this.newPlanName = '';
    this.closeDropdown();

    // Focus the input for naming
    setTimeout(() => {
      const input = this.planNameInputRef?.nativeElement;
      if (input) {
        input.value = '';
        input.focus();
      }
    });
  }

  onSelectPlan(plan: MealSummary, event: MouseEvent): void {
    event.preventDefault();
    this.isNewPlanMode.set(false);
    this.newPlanNameCommitted.set(false);

    this.newPlanName = '';
    this.closeDropdown();
    this.loadPlan(plan.id);
  }

  private async loadPlan(mealId: number): Promise<void> {
    try {
      await this.planningService.getMeal(mealId);
    } catch {
      this.notificationService.show('Failed to load plan', 'error');
    }
  }

  onPlanNameInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (this.isNewPlanMode()) {
      this.newPlanName = value;
    } else {
      this.pendingName = value;
      this.hasChanges.set(true);
    }
  }

  onPlanNameCommit(event: Event): void {
    (event.target as HTMLInputElement).blur();
    if (this.isNewPlanMode() && this.newPlanName.trim()) {
      this.commitNewPlanName();
    }
    this.closeDropdown();
  }

  private async commitNewPlanName(): Promise<void> {
    const name = this.newPlanName.trim();
    if (!name || this.newPlanNameCommitted()) return;

    this.newPlanNameCommitted.set(true);

    try {
      await this.planningService.createMeal(name);
      this.isNewPlanMode.set(false);
      this.newPlanName = '';
      this.fetchSavedPlans();
    } catch {
      this.notificationService.show('Failed to create plan', 'error');
    }
  }

  onDeletePlan(): void {
    const plan = this.planningService.currentPlan();
    if (!plan) return;

    this.notificationService.showConfirmation(
      `Delete "${plan.name}"? This cannot be undone.`,
      'warning',
      async () => {
        try {
          await this.planningService.deleteMeal(plan.id);
          this.notificationService.show('Plan deleted', 'success');
          this.fetchSavedPlans();
        } catch {
          this.notificationService.show('Failed to delete plan', 'error');
        }
      },
      () => {}
    );
  }

  // Prep Video
  prepVideoLink = signal('');
  prepVideoDirty = signal(false);
  private prepVideoOriginal = '';

  private syncPrepVideo = effect(() => {
    const meal = this.planningService.currentPlan();
    const link = meal?.prepVideoLink ?? '';
    this.prepVideoLink.set(link);
    this.prepVideoOriginal = link;
    this.prepVideoDirty.set(false);
  });

  onPrepVideoChange(value: string): void {
    this.prepVideoLink.set(value);
    this.prepVideoDirty.set(value !== this.prepVideoOriginal);
  }

  testPrepVideo(): void {
    const url = this.prepVideoLink();
    if (url) this.tabService.openVideoViewer(url);
  }

  savePrepVideo(): void {
    const plan = this.planningService.currentPlan();
    if (!plan) return;
    const link = this.prepVideoLink();
    this.planningService.updateMeal(plan.id, { prepVideoLink: link }).then(() => {
      this.prepVideoOriginal = link;
      this.prepVideoDirty.set(false);
    });
  }

  // Food picker
  openFoodPicker(): void {
    this.foodPickerOpen.set(true);
  }

  closeFoodPicker(): void {
    this.foodPickerOpen.set(false);
  }

  // Weight-to-weight conversion factors (always valid)
  private readonly weightToGrams: Record<string, number> = {
    g: 1, oz: 28.3495, lbs: 453.592,
  };

  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

  scheduleTooltipHide(tooltip: { hide: () => void }): void {
    this.clearTooltipHide();
    this.tooltipHideTimer = setTimeout(() => tooltip.hide(), 6000); // 2s show delay + 4s visible
  }

  clearTooltipHide(): void {
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
  }

  openProductLink(event: Event, url: string): void {
    event.stopPropagation();
    window.open(url, '_blank', 'noopener');
  }

  // Long-press to edit (mobile)
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  onItemLongPressStart(index: number): void {
    this.longPressTimer = setTimeout(() => {
      this.openAmountEditor(index);
    }, 500);
  }

  onItemLongPressEnd(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  // Food amount editor
  openAmountEditor(index: number): void {
    const items = this.planningService.planItems();
    const item = items[index];
    if (!item) return;

    // quantity is in display units; convert to grams for nutrition base
    // Weight units use fixed constants; food-specific units use servingGramsPerUnit
    const convFactor = this.weightToGrams[item.unit]
      ?? item.servingGramsPerUnit
      ?? item.servingSizeG
      ?? 100;
    const baseServingG = item.quantity * convFactor;
    const nf: NutritionFacts = {
      foodName: item.shortDescription || item.foodName,
      servingSizeG: baseServingG,
      calories: item.calories ?? 0,
      totalFatG: item.fatG ?? 0,
      saturatedFatG: 0,
      cholesterolMG: 0,
      sodiumMG: item.sodiumMg ?? 0,
      totalCarbohydrateG: item.carbG ?? 0,
      dietaryFiberG: item.fiberG ?? 0,
      totalSugarsG: 0,
      proteinG: item.proteinG ?? 0,
      vitaminDMcg: 0,
      calciumMG: 0,
      ironMG: 0,
      potassiumMG: 0,
    };

    this.editingIndex.set(index);
    this.editingItem.set(item);
    this.editingNutritionFacts.set(nf);
    this.editingBaseServingG.set(baseServingG);
    this.amountEditorOpen.set(true);
  }

  closeAmountEditor(): void {
    this.amountEditorOpen.set(false);
  }

  onAmountChanged(event: FoodAmountUpdate): void {
    this.planningService.updateItem(event.itemIndex, {
      quantity: event.displayQuantity,
      unit: event.displayUnit,
      calories: event.scaledCalories,
      proteinG: event.scaledProteinG,
      fatG: event.scaledFatG,
      carbG: event.scaledCarbG,
      fiberG: event.scaledFiberG,
      sodiumMg: event.scaledSodiumMg,
    });
    this.autoSave();
  }

  onFoodPickerAdd(event: FoodPickerAddEvent): void {
    const { food, amount, unit } = event;
    const nf = food.nutritionFacts;
    // amount is always in grams; nutrition values are per 100g (USDA standard)
    const scale = amount / 100;

    // Convert gram amount to display quantity for the given unit
    // Weight units use fixed constants; food-specific units use servingGramsPerUnit
    const convFactor = this.weightToGrams[unit]
      ?? food.servingGramsPerUnit
      ?? amount;
    const displayQty = amount / convFactor;

    this.planningService.addItem({
      foodId: food.id,
      foodName: food.description,
      shortDescription: food.shortDescription ?? undefined,
      foodImageThumbnail: food.foodImageThumbnail ?? undefined,
      quantity: displayQty,
      unit,
      servingSizeG: nf?.servingSizeG ?? 100,
      servingGramsPerUnit: food.servingGramsPerUnit ?? undefined,
      calories: nf?.calories ? Math.round(nf.calories * scale) : undefined,
      proteinG: nf?.proteinG ? Math.round(nf.proteinG * scale * 10) / 10 : undefined,
      fatG: nf?.totalFatG ? Math.round(nf.totalFatG * scale * 10) / 10 : undefined,
      carbG: nf?.totalCarbohydrateG ? Math.round(nf.totalCarbohydrateG * scale * 10) / 10 : undefined,
      fiberG: nf?.dietaryFiberG ? Math.round(nf.dietaryFiberG * scale * 10) / 10 : undefined,
      sodiumMg: nf?.sodiumMG ? Math.round(nf.sodiumMG * scale) : undefined,
    });
    this.notificationService.show(`Added ${food.shortDescription || food.description}`, 'success');
    this.autoSave();
  }

  formatQuantity(quantity: number, unit: string): string {
    if (unit === 'g' && this.preferencesService.useImperial()) {
      const oz = quantity / 28.3495;
      return String(Math.round(oz * 10) / 10);
    }
    if (unit === 'g') {
      return String(Math.ceil(quantity));
    }
    if (unit === 'oz') {
      return String(Math.ceil(quantity * 10) / 10);
    }
    return String(Math.round(quantity * 100) / 100);
  }

  displayUnit(unit: string): string {
    if (unit === 'g' && this.preferencesService.useImperial()) {
      return 'oz';
    }
    return unit;
  }

  toggleChat(): void {
    this.isChatCollapsed.update(v => !v);
  }

  private async autoSave(): Promise<void> {
    const plan = this.planningService.currentPlan();
    if (!plan) return;

    try {
      const updates: UpdateMealRequest = {};
      if (this.pendingName !== null) {
        updates.name = this.pendingName;
        this.pendingName = null;
      }
      updates.items = plan.items;
      await this.planningService.updatePlan(plan.id, updates);
      this.hasChanges.set(false);
    } catch {
      this.notificationService.show('Failed to save plan', 'error');
    }
  }

  closePanel(): void {
    this.tabService.closeTab('meal-planning');
  }

  async generatePlan(): Promise<void> {
    try {
      let name: string | undefined;
      if (this.isNewPlanMode() && this.newPlanNameCommitted() && this.newPlanName.trim()) {
        name = this.newPlanName.trim();
      } else {
        // Auto-assign name: "Meal Plan [n]"
        name = this.getNextPlanName();
      }
      await this.planningService.generateMeal(name);
      this.isNewPlanMode.set(false);
      this.newPlanNameCommitted.set(false);
      this.newPlanName = '';
      this.notificationService.show('Meal plan generated', 'success');
      this.fetchSavedPlans(); // refresh list
    } catch {
      this.notificationService.show('Failed to generate plan', 'error');
    }
  }

  private getNextPlanName(): string {
    const plans = this.savedPlans();
    let maxN = 0;
    const pattern = /^Meal Plan (\d+)$/;
    for (const plan of plans) {
      const match = plan.name.match(pattern);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxN) maxN = n;
      }
    }
    return `Meal Plan ${maxN + 1}`;
  }

  // Swipe handling for delete
  onTouchStart(event: TouchEvent, index: number): void {
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
    this.isSwiping = false;
  }

  onTouchMove(event: TouchEvent, index: number): void {
    const touch = event.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    if (deltaX < -10) {
      this.isSwiping = true;
      this.swipingIndex.set(index);
      this.swipeOffset.set(Math.max(deltaX, -100));
      event.preventDefault();
    }
  }

  onTouchEnd(event: TouchEvent, index: number): void {
    if (!this.isSwiping) {
      this.resetSwipe();
      return;
    }

    const deltaTime = Date.now() - this.touchStartTime;
    const threshold = -50;

    if (this.swipeOffset() < threshold || (this.swipeOffset() < -20 && deltaTime < 200)) {
      this.deleteItem(index);
    }

    this.resetSwipe();
  }

  private resetSwipe(): void {
    this.swipingIndex.set(null);
    this.swipeOffset.set(0);
    this.isSwiping = false;
  }

  getSwipeTransform(index: number): string {
    if (this.swipingIndex() === index) {
      return `translateX(${this.swipeOffset()}px)`;
    }
    return 'translateX(0)';
  }

  deleteItem(index: number): void {
    const items = this.planningService.planItems();
    if (items[index]) {
      this.planningService.deleteItemByIndex(index);
      this.notificationService.show('Item removed', 'success');
      this.autoSave();
    }
  }
}
