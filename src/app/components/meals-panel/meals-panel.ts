// src/app/components/meals-panel/meals-panel.ts
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
import { ImageUploadService } from '../../services/image-upload.service';
import { ChatOutputComponent } from '../chat/chat-output/chat-output';
import { FoodPickerComponent, FoodPickerAddEvent } from '../food-picker/food-picker';
import { FoodAmountEditorComponent, FoodAmountUpdate } from '../food-amount-editor/food-amount-editor';
import { MealSummary, MealItem } from '../../models/planning.model';
import { NutritionFacts } from '../../models/food.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-meals-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule, ChatOutputComponent, FoodPickerComponent, FoodAmountEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Header with plan name and actions -->
      <div class="plan-header" [class.stippled]="foodPickerOpen()">
        <div class="header-left">
          <span class="plan-label">Meal</span>

          <!-- Title field: renames the currently-open meal only -->
          <input
            #mealTitleInput
            class="meal-title-input"
            [value]="titleDraft()"
            [disabled]="!planningService.hasMeal()"
            (input)="onTitleInput($event)"
            (keydown.enter)="commitTitleRename()"
            (blur)="commitTitleRename()"
            placeholder="Untitled Meal"
            spellcheck="false" />
          <button
            class="title-save-btn"
            [disabled]="!titleDirty()"
            (click)="commitTitleRename()"
            matTooltip="Rename meal"
            matTooltipPosition="above">
            <mat-icon>check</mat-icon>
          </button>

          <!-- Launcher: create new or open an existing meal -->
          <div class="meal-launcher" (focusout)="onLauncherFocusOut($event)">
            <button
              class="launcher-btn"
              (mousedown)="onLauncherToggleMousedown($event)"
              aria-haspopup="listbox">
              <mat-icon>add</mat-icon>
              <span class="launcher-label">New / Open</span>
              <mat-icon class="combo-arrow">expand_more</mat-icon>
            </button>

            @if (dropdownOpen()) {
              <div class="combo-dropdown" role="listbox">
                <button
                  class="dropdown-item create-new"
                  (mousedown)="onCreateEmpty($event)"
                  role="option">
                  + New (empty)
                </button>
                <button
                  class="dropdown-item create-new build"
                  disabled
                  matTooltip="Coming soon"
                  matTooltipPosition="right"
                  role="option">
                  Build with RegiMenu…
                </button>
                <button
                  class="dropdown-item create-new ai-generate"
                  (mousedown)="onGenerateWithRegi($event)"
                  role="option">
                  Generate with RegiMenu
                </button>
                <div class="dropdown-divider"></div>
                <input
                  class="dropdown-search"
                  type="text"
                  [value]="typeAheadFilter()"
                  (input)="onSearchInput($event)"
                  placeholder="Search meals…"
                  spellcheck="false" />
                <label class="header-filter" matTooltip="Show your meal plans" matTooltipPosition="right">
                  <input type="checkbox" [checked]="showUserMeals()" (change)="toggleUserMeals()" />
                  <span class="filter-text">My Meals</span>
                </label>
                <label class="header-filter" matTooltip="Show Community plans" matTooltipPosition="right">
                  <input type="checkbox" [checked]="showCommunity()" (change)="toggleCommunity()" />
                  <span class="filter-text">Community</span>
                </label>
                <label class="header-filter" matTooltip="Show YEH Approved plans" matTooltipPosition="right">
                  <input type="checkbox" [checked]="showYeh()" (change)="toggleYeh()" />
                  <span class="filter-text">YEH Approved</span>
                </label>
                @for (plan of filteredPlans(); track plan.id) {
                  <button
                    class="dropdown-item"
                    [class.active]="planningService.currentPlan()?.id === plan.id"
                    (mousedown)="onSelectPlan(plan, $event)"
                    role="option">
                    <span class="dropdown-item-name">{{ plan.name }}</span>
                    @if (plan.shareApproved) {
                      <img src="/images/Community-C.ico" alt="Community" class="dropdown-item-icon" />
                    } @else if (plan.isYeh) {
                      <img src="/favicon.ico" alt="YEH" class="dropdown-item-icon" />
                    }
                  </button>
                }
                @if (savedPlans().length === 0 && !savedPlansLoading()) {
                  <div class="dropdown-empty">No saved MealPlans</div>
                }
                @if (savedPlansLoading()) {
                  <div class="dropdown-empty">Loading…</div>
                }
              </div>
            }
          </div>

          <!-- Delete plan button -->
          <button
            class="icon-btn delete-plan-btn"
            (click)="onDeletePlan()"
            [disabled]="!planningService.hasPlan()"
            matTooltip="Delete MealPlan"
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
      <!-- powered-by row removed -->

      @if (planningService.hasPlan()) {
        <!-- Top pane: links + image -->
        <div class="top-pane" [style.height.px]="topPaneHeight()">
          <div class="top-pane-content">
            <div class="links-side">
              <div class="link-row">
                <label class="link-label">Video</label>
                <input type="url" class="link-input"
                  [ngModel]="prepVideoLink()"
                  (ngModelChange)="onPrepVideoChange($event)"
                  [disabled]="isShareApproved()"
                  placeholder="https://youtube.com/..." />
                <button class="link-save-btn"
                  [disabled]="!prepVideoDirty() || isShareApproved()"
                  (click)="savePrepVideo()"
                  matTooltip="Save video link" matTooltipPosition="above">
                  <mat-icon>check</mat-icon>
                </button>
                <button class="video-btn" [class.stippled]="!prepVideoLink()"
                  [disabled]="!prepVideoLink()"
                  (click)="testPrepVideo()" matTooltip="Prep Video" matTooltipPosition="above">
                  <svg class="yt-icon" viewBox="0 0 28 20"><rect rx="4" width="28" height="20" fill="#FF0000"/><polygon points="11,4 11,16 20,10" fill="#FFF"/></svg>
                </button>
              </div>
              <div class="link-row">
                <label class="link-label">Recipe</label>
                <input type="url" class="link-input"
                  [ngModel]="recipeLink()"
                  (ngModelChange)="onRecipeLinkChange($event)"
                  [disabled]="isShareApproved()"
                  placeholder="https://recipe-site.com/..." />
                <button class="link-save-btn"
                  [disabled]="!recipeLinkDirty() || isShareApproved()"
                  (click)="saveRecipeLink()"
                  matTooltip="Save recipe link" matTooltipPosition="above">
                  <mat-icon>check</mat-icon>
                </button>
                <button class="browser-btn" [class.stippled]="!recipeLink()"
                  [disabled]="!recipeLink()"
                  (click)="openWebViewer()" matTooltip="View Recipe" matTooltipPosition="above">
                  <mat-icon class="browser-icon">visibility</mat-icon>
                </button>
              </div>
              <div class="share-row">
                @if (isShareApproved()) {
                  <span class="approved-badge">Community Approved</span>
                } @else {
                  <label class="share-check" matTooltip="Share Meal Plan with YEH Community" matTooltipPosition="above">
                    <input type="checkbox" [checked]="shareCandidate()" (change)="onShareCandidateChange($any($event.target).checked)" />
                    <span>Share with YEH Community</span>
                  </label>
                }
              </div>
            </div>
            <div class="image-side">
              @if (isShareApproved()) {
                <div class="meal-image-box locked">
                  @if (planningService.currentPlan()?.mealImage) {
                    <img [src]="planningService.currentPlan()?.mealImage" alt="" class="meal-box-img"
                      (click)="showImageZoom.set(true); $event.stopPropagation()" />
                  } @else {
                    <span class="drop-label">No image</span>
                  }
                </div>
              } @else {
                <div class="meal-image-box"
                  [class.compact]="!mealImagePreview() && !planningService.currentPlan()?.mealImage"
                  tabindex="0"
                  (dragover)="onMealImageDragOver($event)"
                  (drop)="onMealImageDrop($event)"
                  (paste)="onMealImagePaste($event)">
                  @if (mealImagePreview() || planningService.currentPlan()?.mealImage) {
                    <img [src]="mealImagePreview() || planningService.currentPlan()?.mealImage" alt="" class="meal-box-img"
                      (click)="showImageZoom.set(true); $event.stopPropagation()" />
                  } @else {
                    <div class="drop-placeholder">
                      <button type="button" class="browse-btn" (click)="mealImageInput.click(); $event.stopPropagation()">Browse</button>
                      <span class="drop-label">Meal photo: drop or Ctrl+V</span>
                    </div>
                  }
                </div>
                <input #mealImageInput type="file" accept="image/*" capture="environment" hidden
                  (change)="onMealImageSelected($event)" />
              }
            </div>
          </div>
        </div>

        <!-- Draggable splitter -->
        <div class="pane-splitter"
          (mousedown)="onSplitterMouseDown($event)"
          (touchstart)="onSplitterTouchStart($event)">
          <div class="splitter-grip"></div>
        </div>

        @if (showImageZoom() && (mealImagePreview() || planningService.currentPlan()?.mealImage)) {
          <div class="image-zoom-overlay" (click)="showImageZoom.set(false)">
            <img [src]="mealImagePreview() || planningService.currentPlan()?.mealImage" alt="" class="zoom-img" />
          </div>
        }
      }

      <!-- Bottom pane: heading + totals + food list -->
      @if (planningService.hasPlan()) {
        <div class="items-heading">
          <div class="items-heading-row">
            <span class="serves-group">
              <span class="serves-label">Serves</span>
              <input type="number" class="serves-input" min="1"
                [ngModel]="planningService.currentPlan()?.servings ?? 1"
                (ngModelChange)="onServingsChange($event)" />
            </span>
            <button
              class="add-food-btn"
              [disabled]="!planningService.hasPlan() || foodPickerOpen()"
              (click)="openFoodPicker()">
              <span class="add-food-plus">+</span> Add Food
            </button>
            <span class="heading-totals-right">
              <span class="totals-value-light">{{ displayCalories() }} cal</span>
              <span class="totals-value-light">{{ displayFiber() }}g fiber</span>
              <span class="totals-value-light">{{ displaySodium() }}mg salt</span>
              <span class="totals-pipe">|</span>
              <span class="per-serving-label">Per serving</span>
            </span>
          </div>
        </div>
      }

      <div class="plan-content-scroll">
      <!-- Plan items list -->
        @if (planningService.loading()) {
          <div class="loading-message">
            <div class="spinner-large"></div>
            <p>Please wait, MealPlan coming...</p>
          </div>
        } @else if (planningService.error()) {
          <div class="error-message">
            <p>{{ planningService.error() }}</p>
          </div>
        } @else if (!planningService.hasPlan()) {
          <div class="empty-message">
            <p class="placeholder-text">Intelligent meal planning powered by <img src="/images/AI-star.png" class="powered-by-icon" alt="" /> RegiMenu<sup class="sm">SM</sup></p>
            <ol class="placeholder-steps">
              <li>NAME dropdown, select <strong>Create RegiMenu<sup class="sm">SM</sup> Plan...</strong></li>
              <li>RegiMenu AI evaluates your settings, food preferences and auto-generates a plan</li>
              <li>Name the plan, if you like or delete it and start over, or</li>
              <li>Use the plan as a base, and make modifications to it</li>
            </ol>
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

                  <!-- Macros summary (per serving) -->
                  <div class="item-macros">
                    @if (item.calories) {
                      <span class="macro">{{ Math.round(item.calories / servings()) }} cal</span>
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
  styleUrls: ['./meals-panel.scss']
})
export class MealsPanelComponent implements OnInit, OnDestroy {
  private tabService = inject(TabService);
  chatService = inject(ChatService);
  planningService = inject(PlanningService);
  private preferencesService = inject(PreferencesService);
  private notificationService = inject(NotificationService);
  private imageUploadService = inject(ImageUploadService);

  @ViewChild('planList') planListRef!: ElementRef<HTMLElement>;
  @ViewChild('mealTitleInput') mealTitleInputRef?: ElementRef<HTMLInputElement>;

  isChatCollapsed = signal(false);

  // Meal title editor state
  titleDraft = signal('');
  titleDirty = signal(false);
  private titleIsAuto = true;

  // Dropdown state
  savedPlans = signal<MealSummary[]>([]);
  savedPlansLoading = signal(false);
  dropdownOpen = signal(false);

  // Plan list filters (checkboxes next to trash can)
  showUserMeals = signal(true);
  showCommunity = signal(true);
  showYeh = signal(true);
  typeAheadFilter = signal('');

  filteredPlans = computed(() => {
    let plans = this.savedPlans();
    const userMeals = this.showUserMeals();
    const community = this.showCommunity();
    const yeh = this.showYeh();
    const typeAhead = this.typeAheadFilter().toLowerCase();

    // Filter by checked categories; if none checked, show nothing
    // Candidates (shareCandidate but not shareApproved) are user meals until approved
    plans = plans.filter(p => {
      const isCommunity = p.shareApproved;
      const isYeh = p.isYeh;
      const isUserMeal = !isCommunity && !isYeh;
      if (userMeals && isUserMeal) return true;
      if (community && isCommunity) return true;
      if (yeh && isYeh) return true;
      return false;
    });

    // Type-ahead: filter by name
    if (typeAhead) {
      plans = plans.filter(p => p.name.toLowerCase().includes(typeAhead));
    }

    return plans;
  });

  toggleUserMeals(): void {
    this.showUserMeals.update(v => !v);
  }

  toggleCommunity(): void {
    this.showCommunity.update(v => !v);
  }

  toggleYeh(): void {
    this.showYeh.update(v => !v);
  }

  // Food picker overlay state
  foodPickerOpen = signal(false);

  // Food amount editor state
  amountEditorOpen = signal(false);
  editingIndex = signal(-1);
  editingItem = signal<MealItem | null>(null);
  editingNutritionFacts = signal<NutritionFacts | null>(null);
  editingBaseServingG = signal(100);

  // Meal image upload state
  mealImageFile = signal<File | null>(null);
  mealImagePreview = signal<string | null>(null);
  showImageZoom = signal(false);
  shareCandidate = signal(false);

  protected Math = Math;

  // Community approval lockdown
  isShareApproved = computed(() => this.planningService.currentPlan()?.shareApproved === true);

  // Per-serving display values
  servings = computed(() => this.planningService.currentPlan()?.servings ?? 1);
  displayCalories = computed(() => Math.round((this.planningService.currentPlan()?.totalCalories ?? 0) / this.servings()));
  displayFiber = computed(() => ((this.planningService.currentPlan()?.totalFiberG ?? 0) / this.servings()).toFixed(0));
  displaySodium = computed(() => Math.round((this.planningService.currentPlan()?.totalSodiumMg ?? 0) / this.servings()));

  // Splitter state
  topPaneHeight = signal(200);
  private splitterDragging = false;
  private splitterStartY = 0;
  private splitterStartHeight = 0;

  onSplitterMouseDown(e: MouseEvent): void {
    e.preventDefault();
    this.splitterDragging = true;
    this.splitterStartY = e.clientY;
    this.splitterStartHeight = this.topPaneHeight();
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - this.splitterStartY;
      this.topPaneHeight.set(Math.max(80, this.splitterStartHeight + delta));
    };
    const onUp = () => {
      this.splitterDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onSplitterTouchStart(e: TouchEvent): void {
    const touch = e.touches[0];
    this.splitterDragging = true;
    this.splitterStartY = touch.clientY;
    this.splitterStartHeight = this.topPaneHeight();
    const onMove = (ev: TouchEvent) => {
      const delta = ev.touches[0].clientY - this.splitterStartY;
      this.topPaneHeight.set(Math.max(80, this.splitterStartHeight + delta));
    };
    const onEnd = () => {
      this.splitterDragging = false;
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onEnd);
  }

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

  private syncTitleDraft = effect(() => {
    const meal = this.planningService.currentPlan();
    const name = meal?.name ?? '';
    this.titleDraft.set(name);
    this.titleDirty.set(false);
  });

  ngOnInit(): void {
    // Use preloaded cache if available, otherwise fetch
    const cached = this.planningService.savedMeals();
    if (cached.length > 0) {
      this.savedPlans.set(cached);
    } else {
      this.fetchSavedPlans();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    if (this.mealImagePreview()) URL.revokeObjectURL(this.mealImagePreview()!);
  }

  fetchSavedPlans(): void {
    this.savedPlansLoading.set(true);
    const sub = this.planningService.listMeals({
      status: 'active',
      limit: 100,
      includeYeh: true,
      includeCommunity: true
    }).subscribe({
      next: (meals) => {
        this.savedPlans.set(meals);
        this.savedPlansLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch saved MealPlans:', err);
        this.savedPlansLoading.set(false);
      }
    });
    this.subscriptions.push(sub);
  }

  // Title field: renames the currently-open meal
  onTitleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.titleDraft.set(value);
    this.titleDirty.set(value !== (this.planningService.currentPlan()?.name ?? ''));
    this.titleIsAuto = false;
  }

  async commitTitleRename(): Promise<void> {
    if (!this.titleDirty()) return;
    const plan = this.planningService.currentPlan();
    if (!plan) return;
    const name = this.titleDraft().trim() || 'Untitled Meal';
    try {
      await this.planningService.updateMeal(plan.id, { name });
      this.titleDirty.set(false);
      this.fetchSavedPlans();
    } catch {
      this.notificationService.show('Failed to rename meal', 'error');
    }
  }

  // Launcher dropdown interactions
  onLauncherToggleMousedown(event: MouseEvent): void {
    event.preventDefault();
    if (this.dropdownOpen()) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  onLauncherFocusOut(event: FocusEvent): void {
    const related = event.relatedTarget as HTMLElement | null;
    const launcher = (event.currentTarget as HTMLElement);
    if (related && launcher.contains(related)) {
      return; // focus moved within the launcher — don't close
    }
    this.closeDropdown();
  }

  openDropdown(): void {
    if (!this.dropdownOpen()) {
      this.fetchSavedPlans();
      this.dropdownOpen.set(true);
    }
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
    this.typeAheadFilter.set('');
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.typeAheadFilter.set(value);
  }

  async onCreateEmpty(event: MouseEvent): Promise<void> {
    event.preventDefault();
    this.closeDropdown();
    try {
      await this.planningService.createMeal('Untitled Meal');
      this.titleIsAuto = true;
      this.fetchSavedPlans();
      setTimeout(() => {
        const input = this.mealTitleInputRef?.nativeElement;
        if (input) {
          input.focus();
          input.select();
        }
      });
    } catch {
      this.notificationService.show('Failed to create MealPlan', 'error');
    }
  }

  onGenerateWithRegi(event: MouseEvent): void {
    event.preventDefault();
    this.closeDropdown();
    this.generatePlan();
  }

  onSelectPlan(plan: MealSummary, event: MouseEvent): void {
    event.preventDefault();
    this.closeDropdown();
    this.titleIsAuto = false;
    this.loadPlan(plan.id);
  }

  private async loadPlan(mealId: number): Promise<void> {
    try {
      await this.planningService.getMeal(mealId);
    } catch {
      this.notificationService.show('Failed to load MealPlan', 'error');
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
          this.notificationService.show('MealPlan deleted', 'success');
          this.fetchSavedPlans();
        } catch {
          this.notificationService.show('Failed to delete MealPlan', 'error');
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

  private syncShareCandidate = effect(() => {
    const meal = this.planningService.currentPlan();
    this.shareCandidate.set(meal?.shareCandidate ?? false);
    // Clear local image preview when switching plans
    if (this.mealImagePreview()) {
      URL.revokeObjectURL(this.mealImagePreview()!);
      this.mealImageFile.set(null);
      this.mealImagePreview.set(null);
    }
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

  // Recipe Link
  recipeLink = signal('');
  recipeLinkDirty = signal(false);
  private recipeLinkOriginal = '';

  private syncRecipeLink = effect(() => {
    const meal = this.planningService.currentPlan();
    const link = meal?.recipeLink ?? '';
    this.recipeLink.set(link);
    this.recipeLinkOriginal = link;
    this.recipeLinkDirty.set(false);
  });

  onRecipeLinkChange(value: string): void {
    this.recipeLink.set(value);
    this.recipeLinkDirty.set(value !== this.recipeLinkOriginal);
  }

  saveRecipeLink(): void {
    const plan = this.planningService.currentPlan();
    if (!plan) return;
    const link = this.recipeLink();
    this.planningService.updateMeal(plan.id, { recipeLink: link }).then(() => {
      this.recipeLinkOriginal = link;
      this.recipeLinkDirty.set(false);
    });
  }

  openWebViewer(): void {
    const url = this.recipeLink();
    if (url) this.tabService.openWebViewer(url);
  }

  openRecipeInBrowser(): void {
    const url = this.recipeLink();
    if (url) window.open(url, '_blank', 'noopener');
  }

  // Meal image upload
  onMealImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setMealImageFile(file);
    input.value = '';
  }

  onMealImagePaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        event.preventDefault();
        const file = items[i].getAsFile();
        if (file) this.setMealImageFile(file);
        return;
      }
    }
  }

  onMealImageDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onMealImageDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      this.setMealImageFile(file);
    }
  }

  private setMealImageFile(file: File): void {
    if (this.mealImagePreview()) URL.revokeObjectURL(this.mealImagePreview()!);
    this.mealImageFile.set(file);
    this.mealImagePreview.set(URL.createObjectURL(file));
    this.uploadMealImage();
  }

  async clearMealImage(): Promise<void> {
    if (this.mealImagePreview()) URL.revokeObjectURL(this.mealImagePreview()!);
    this.mealImageFile.set(null);
    this.mealImagePreview.set(null);

    // Clear from server
    const plan = this.planningService.currentPlan();
    if (plan) {
      await this.planningService.updateMeal(plan.id, { mealImage: '', mealImageThumbnail: '' });
    }
  }

  private async uploadMealImage(): Promise<void> {
    const plan = this.planningService.currentPlan();
    const file = this.mealImageFile();
    if (!plan || !file) return;

    try {
      const result = await this.imageUploadService.uploadMealImage(plan.id, file);
      // Update the current plan with the new image URLs
      this.planningService.updateMeal(plan.id, {});
      this.notificationService.show('Meal image uploaded', 'success');
      this.mealImageFile.set(null);
      // Keep preview showing the uploaded image
    } catch {
      this.notificationService.show('Failed to upload meal image', 'error');
    }
  }

  onServingsChange(value: number): void {
    if (!value || value < 1) return;
    const plan = this.planningService.currentPlan();
    if (plan) {
      this.planningService.updateMeal(plan.id, { servings: value });
    }
  }

  onShareCandidateChange(value: boolean): void {
    if (value) {
      // Confirm before submitting as community candidate
      this.notificationService.showConfirmation(
        'If your meal plan is approved for community sharing, the picture, video link and recipe link will be locked and cannot be modified. Continue?',
        'warning',
        () => {
          this.shareCandidate.set(true);
          const plan = this.planningService.currentPlan();
          if (plan) {
            this.planningService.updateMeal(plan.id, { shareCandidate: true });
          }
        },
        () => {
          this.shareCandidate.set(false);
        }
      );
    } else {
      this.shareCandidate.set(false);
      const plan = this.planningService.currentPlan();
      if (plan) {
        this.planningService.updateMeal(plan.id, { shareCandidate: false });
      }
    }
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
      await this.planningService.updatePlan(plan.id, { items: plan.items });
    } catch {
      this.notificationService.show('Failed to save MealPlan', 'error');
    }
  }

  closePanel(): void {
    this.tabService.closeTab('meal-planning');
  }

  async generatePlan(): Promise<void> {
    try {
      const name = this.getNextPlanName();
      await this.planningService.generateMeal(name);
      this.titleIsAuto = true;
      this.notificationService.show('MealPlan generated', 'success');
      this.fetchSavedPlans();
    } catch {
      this.notificationService.show('Failed to generate MealPlan', 'error');
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
