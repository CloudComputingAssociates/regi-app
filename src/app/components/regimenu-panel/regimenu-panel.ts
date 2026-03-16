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
  OnDestroy
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
import { MealSummary } from '../../models/planning.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-regimenu-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule, ChatOutputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Header with plan name and actions -->
      <div class="plan-header" [class.stippled]="foodPickerOpen()">
        <div class="header-left">
          <span class="plan-label">Plan</span>

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
                  class="dropdown-item create-new"
                  [class.highlighted]="dropdownHighlight() === -1"
                  (mousedown)="onCreateNewPlan($event)"
                  role="option">
                  + Create new plan...
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

          <!-- Add food button (replaces favorite star) -->
          <button
            class="icon-btn add-food-btn"
            (click)="openFoodPicker()"
            [disabled]="!planningService.hasPlan() || foodPickerOpen()"
            matTooltip="Add Food"
            matTooltipPosition="above">
            <mat-icon>add</mat-icon>
          </button>
        </div>

        <div class="header-actions">
          @if (planningService.hasPlan()) {
            <button
              class="icon-btn save-btn"
              [class.has-changes]="hasChanges()"
              [disabled]="!hasChanges() || isSaving()"
              (click)="savePlan()"
              matTooltip="Save Plan"
              matTooltipPosition="above">
              @if (isSaving()) {
                <span class="spinner"></span>
              } @else {
                ✓
              }
            </button>
          }
          <button
            class="generate-btn"
            (click)="generatePlan()"
            [disabled]="planningService.loading() || planningService.hasPlan() || isNewPlanUnnamed()"
            matTooltip="Generate Meal Plan"
            matTooltipPosition="above">
            @if (planningService.loading()) {
              <span class="spinner"></span>
            } @else {
              Generate
            }
          </button>
          <button
            class="icon-btn close-btn"
            (click)="closePanel()"
            matTooltip="Close"
            matTooltipPosition="above">
            ✕
          </button>
        </div>
      </div>

      <!-- Plan items list -->
      <div class="plan-list-container">
        @if (planningService.loading()) {
          <div class="loading-message">
            <div class="spinner-large"></div>
            <p>Generating your meal plan...</p>
          </div>
        } @else if (planningService.error()) {
          <div class="error-message">
            <p>{{ planningService.error() }}</p>
          </div>
        } @else if (!planningService.hasPlan()) {
          <div class="empty-message">
            <p class="placeholder-text">Intelligent meal planning powered by AI</p>
            <p class="placeholder-subtext">Click "Generate" to create a meal plan</p>
          </div>
        } @else {
          <div class="plan-list" #planList>
            @for (item of planningService.planItems(); track item.id; let i = $index) {
              <div
                class="plan-item"
                [class.swiping]="swipingIndex() === i"
                [style.transform]="getSwipeTransform(i)"
                (touchstart)="onTouchStart($event, i)"
                (touchmove)="onTouchMove($event, i)"
                (touchend)="onTouchEnd($event, i)">

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
                    <span class="item-description">
                      {{ item.shortDescription || item.foodName }}
                    </span>
                    <span class="item-quantity">{{ formatQuantity(item.quantity, item.unit) }} {{ displayUnit(item.unit) }}</span>
                  </div>

                  <!-- Macros summary -->
                  <div class="item-macros">
                    @if (item.calories) {
                      <span class="macro">{{ item.calories }} cal</span>
                    }
                  </div>
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

      <!-- Totals footer -->
      @if (planningService.hasPlan()) {
        <div class="plan-totals">
          <span class="total-label">Meal totals:</span>
          <span class="total-value">{{ planningService.currentPlan()?.totalCalories ?? 0 }} cal</span>
          <span class="total-value">{{ planningService.currentPlan()?.totalProteinG?.toFixed(0) ?? 0 }}g P</span>
          <span class="total-value">{{ planningService.currentPlan()?.totalCarbG?.toFixed(0) ?? 0 }}g C</span>
          <span class="total-value">{{ planningService.currentPlan()?.totalFatG?.toFixed(0) ?? 0 }}g F</span>
        </div>
        <div class="plan-totals plan-totals-secondary">
          <span class="total-value">{{ planningService.currentPlan()?.totalFiberG?.toFixed(0) ?? 0 }}g fiber</span>
          <span class="total-value">{{ planningService.currentPlan()?.totalSodiumMg?.toFixed(0) ?? 0 }}mg sodium</span>
        </div>
      }

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
  isSaving = signal(false);
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

  private commitNewPlanName(): void {
    if (this.newPlanName.trim()) {
      this.newPlanNameCommitted.set(true);
    }
  }

  // Food picker
  openFoodPicker(): void {
    this.foodPickerOpen.set(true);
    // Food picker overlay component (Prompt B) will be integrated here
  }

  closeFoodPicker(): void {
    this.foodPickerOpen.set(false);
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
    return String(Math.round(quantity * 10) / 10);
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

  async savePlan(): Promise<void> {
    const plan = this.planningService.currentPlan();
    if (!plan) return;

    this.isSaving.set(true);
    try {
      const updates: { name?: string } = {};
      if (this.pendingName !== null) {
        updates.name = this.pendingName;
      }
      await this.planningService.updatePlan(plan.id, updates);
      this.pendingName = null;
      this.hasChanges.set(false);
      this.notificationService.show('Plan saved', 'success');
    } catch {
      this.notificationService.show('Failed to save plan', 'error');
    } finally {
      this.isSaving.set(false);
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
      this.planningService.deleteItem(items[index].id!);
      this.notificationService.show('Item removed', 'success');
    }
  }
}
