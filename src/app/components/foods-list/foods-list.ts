// src/app/components/foods-list/foods-list.ts
import { Component, ChangeDetectionStrategy, signal, computed, output, input, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRadioModule } from '@angular/material/radio';
import { NutritionFactsLabelComponent } from '../nutrition-facts-label/nutrition-facts-label';
import { FoodsService } from '../../services/foods.service';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { UserFoodService } from '../../services/user-food.service';
import { TabService } from '../../services/tab.service';
import { PreferencesService } from '../../services/preferences.service';
import { Food } from '../../models/food.model';
import { UserFood } from '../../models/user-food.model';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';

export type FoodFilterType = 'yeh-approved' | 'my-favorites' | 'my-restricted' | 'community' | 'clear';

export interface FoodGroup {
  category: string;
  foods: { food: Food; flatIndex: number }[];
  collapsed: boolean;
}

const CATEGORY_ORDER = [
  'Protein', 'Fat', 'Dairy', 'Vegetable', 'Carbohydrate',
  'Fruit', 'Processed', 'Beverage', 'Condiment'
];

export interface SelectedFoodEvent {
  food: Food;
  description: string;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface AddFoodEvent {
  food: Food;
}

export interface FoodNotFoundEvent {
  searchQuery: string;
  suggestedFood?: Food;
}

@Component({
  selector: 'app-foods-list',
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatRadioModule, NutritionFactsLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="foods-container">
      <!-- Search Mode UI -->
      @if (mode() === 'search') {
        <div class="search-controls">
          <input
            type="text"
            class="search-input"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchQueryChange($event)"
            (keydown.enter)="performSearch(); $event.stopPropagation()"
            placeholder="Search food..."
            [disabled]="isLoading()" />

          <button
            class="search-btn"
            (click)="performSearch()"
            [disabled]="isLoading() || !canSearch()"
            aria-label="Search">
            <mat-icon>keyboard_return</mat-icon>
          </button>

          <!-- AI Pick Button -->
          @if (showAiButton()) {
            <button
              type="button"
              class="ai-pick-btn"
              matTooltip="Let 'AI' pick foods"
              matTooltipPosition="below"
              aria-label="Let AI pick foods">
              <img src="images/ai-button1.png" alt="AI" class="ai-icon" />
            </button>
          }
        </div>

        <!-- Filter Radio Buttons (browse mode) -->
        @if (showFilterRadios()) {
          <div class="filter-row">
            <div class="filter-radio-group">
              <label class="filter-radio">
                <input type="radio" name="foodFilter" [checked]="activeFilter() === 'my-favorites'" (change)="onFilterChange('my-favorites')" />
                <span>MyFoods</span>
              </label>
              <label class="filter-radio">
                <input type="radio" name="foodFilter" [checked]="activeFilter() === 'my-restricted'" (change)="onFilterChange('my-restricted')" />
                <span>Restricted</span>
              </label>
              <label class="filter-radio">
                <input type="radio" name="foodFilter" [checked]="activeFilter() === 'community'" (change)="onFilterChange('community')" />
                <span>Community</span>
              </label>
              <label class="filter-radio">
                <input type="radio" name="foodFilter" [checked]="activeFilter() === 'yeh-approved'" (change)="onFilterChange('yeh-approved')" />
                <span>YEH Approved</span>
              </label>
            </div>
          </div>
        }
      }

      <!-- Foods List -->
      <div class="foods-list-container">
        <div
          class="foods-list"
          (keydown)="onKeyDown($event)"
          tabindex="0">
          @if (isLoading()) {
            <div class="loading-message">
              <span class="loading-spinner"></span>
              <p>Loading foods...</p>
            </div>
          } @else if (foods().length === 0) {
            <div class="food-item placeholder-item">
              <span class="food-description">{{ getEmptyMessage() }}</span>
            </div>
          } @else {
            @if (showPreferenceIcons()) {
              <div class="preference-column-header">
                <span matTooltip="Favorite to add to MyFoods. Restrict means you don't/can't consume" matTooltipPosition="below">{{ (activeFilter() === 'my-favorites' || activeFilter() === 'my-restricted') ? 'Remove' : 'Favorite / Restrict' }}</span>
              </div>
            }
            @for (group of groupedFoods(); track group.category) {
              @if (group.foods.length > 0) {
                <div class="category-header"
                     (click)="toggleCollapse(group.category)">
                  <mat-icon class="collapse-icon"
                            [class.collapsed]="group.collapsed">expand_more</mat-icon>
                  <span class="category-name">{{ group.category }}</span>
                </div>
                @if (!group.collapsed) {
                  @for (item of group.foods; track item.food.id) {
                    <div
                      class="food-item"
                      [class.selected]="selectedIndex() === item.flatIndex"
                      (click)="selectFood(item.flatIndex)"
                      (dblclick)="onFoodDblClick(item.food)"
                      [matTooltip]="showPreferenceIcons() ? 'Double-click food for Nutrition Facts, Zoom image and product links.' : ''"
                      #foodTooltip="matTooltip"
                      [matTooltipShowDelay]="2000"
                      matTooltipPosition="above"
                      (mouseenter)="scheduleTooltipHide(foodTooltip)"
                      (mouseleave)="clearTooltipHide()"
                      (touchstart)="onTouchStart($event, item.flatIndex); onFoodLongPressStart($event, item.food)"
                      (touchmove)="onTouchMove($event, item.flatIndex); onFoodLongPressEnd()"
                      (touchend)="onTouchEnd($event, item.flatIndex); onFoodLongPressEnd()"
                      tabindex="0"
                      role="button"
                      [attr.aria-label]="item.food.description">
                      <div class="food-thumbnail">
                        @if (item.food.foodImageThumbnail) {
                          <img [src]="item.food.foodImageThumbnail" alt="" class="thumbnail-img" />
                        } @else {
                          <div class="thumbnail-placeholder"></div>
                        }
                      </div>
                      <span class="food-description">{{ getDisplayDescription(item.food) }}</span>
                      @if (!item.food.dataSource?.startsWith('USDA') && item.food.userId) {
                        <span class="food-badge my-food-badge">My Food</span>
                      }

                      @if (showPreferenceIcons()) {
                        <div class="preference-icons">
                          @if (activeFilter() === 'my-favorites') {
                            <mat-icon
                              class="delete-icon"
                              (click)="removePreference($event, item.food.id)"
                              aria-label="Remove from favorites">
                              delete
                            </mat-icon>
                          } @else if (activeFilter() === 'my-restricted') {
                            <mat-icon
                              class="restricted-icon active"
                              (click)="removePreference($event, item.food.id)"
                              aria-label="Remove restriction">
                              block
                            </mat-icon>
                          } @else {
                            <mat-icon
                              class="favorite-icon"
                              [class.active]="preferencesService.isAllowed(item.food.id)"
                              (click)="toggleFavorite($event, item.food.id)"
                              aria-label="Toggle favorite">
                              {{ preferencesService.isAllowed(item.food.id) ? 'star' : 'star_border' }}
                            </mat-icon>
                            <mat-icon
                              class="restricted-icon"
                              [class.active]="preferencesService.isRestricted(item.food.id)"
                              (click)="toggleRestricted($event, item.food.id)"
                              aria-label="Toggle restricted">
                              block
                            </mat-icon>
                          }
                        </div>
                      }
                    </div>
                  }
                }
              }
            }
          }
        </div>
      </div>

      <!-- Nutrition Facts popup -->
      @if (nfPopupFood()) {
        <div class="nf-popup-overlay" (click)="closeNfPopup()">
          <div class="nf-popup" (click)="$event.stopPropagation()">
            <button class="nf-popup-close" (click)="closeNfPopup()">✕</button>
            @if (nfPopupFood()!.foodImage) {
              <div class="nf-popup-image" [style.max-height.px]="nfImageHeight()"
                (mouseenter)="onImageZoomEnter()"
                (mouseleave)="onImageZoomLeave()"
                (mousemove)="onImageZoomMove($event)">
                <img [src]="nfPopupFood()!.foodImage" [alt]="nfPopupFood()!.description"
                  [class.zoomed]="imageZoomed()"
                  [style.transform-origin]="imageZoomOrigin()" />
                @if (nfPopupFood()!.productPurchaseLink) {
                  <div class="nf-popup-link-badge">
                    <mat-icon>open_in_new</mat-icon> purchase link below
                  </div>
                }
              </div>
            }
            <div class="nf-popup-header">
              @if (nfPopupFood()!.productPurchaseLink) {
                <a class="nf-popup-title nf-popup-title-link" (click)="openProductLink(nfPopupFood()!)">{{ nfPopupFood()!.shortDescription || nfPopupFood()!.description }}</a>
              } @else {
                <span class="nf-popup-title">{{ nfPopupFood()!.shortDescription || nfPopupFood()!.description }}</span>
              }
            </div>
            @if (nfPopupFood()!.foodImage) {
              <div class="nf-popup-splitter" (mousedown)="onSplitterMouseDown($event)" (touchstart)="onSplitterTouchStart($event)">
                <div class="splitter-grip"></div>
              </div>
            }
            <yeh-nutrition-label [nutritionFacts]="nfPopupFood()!.nutritionFacts ?? null" [scale]="nfPopupFood()!.servingSizeMultiplicand || 1" />
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./foods-list.scss']
})
export class FoodsListComponent implements OnInit {
  private foodsService = inject(FoodsService);
  protected preferencesService = inject(FoodPreferencesService);
  private notificationService = inject(NotificationService);
  private userFoodService = inject(UserFoodService);
  private tabService = inject(TabService);
  private prefsService = inject(PreferencesService);

  // Inputs
  mode = input<'search' | 'display'>('search');
  displayFoods = input<Food[]>([]);
  showAiButton = input<boolean>(true);
  showPreferenceIcons = input<boolean>(false);
  showFilterRadios = input<boolean>(false);

  // Outputs
  selectedFood = output<SelectedFoodEvent>();
  addFood = output<AddFoodEvent>();
  foodNotFound = output<FoodNotFoundEvent>();

  // Internal state
  searchQuery = '';
  maxCount = 500;
  foods = signal<Food[]>([]);
  selectedIndex = signal<number>(-1);
  isLoading = signal<boolean>(false);
  isYehApproved = signal<boolean>(true);
  activeFilter = signal<FoodFilterType>('yeh-approved');
  activeFilters = signal<Set<string>>(new Set(['yeh-approved']));

  // Accordion state — all categories start collapsed
  private collapsedCategories = signal<Set<string>>(new Set(CATEGORY_ORDER));

  groupedFoods = computed<FoodGroup[]>(() => {
    const foods = this.foods();
    const collapsed = this.collapsedCategories();
    const groupMap = new Map<string, { food: Food; flatIndex: number }[]>();

    for (const cat of CATEGORY_ORDER) {
      groupMap.set(cat, []);
    }

    foods.forEach((food, index) => {
      const category = food.categoryName || 'Uncategorized';
      if (!groupMap.has(category)) {
        groupMap.set(category, []);
      }
      groupMap.get(category)!.push({ food, flatIndex: index });
    });

    const orderedCategories = [...CATEGORY_ORDER];
    for (const key of groupMap.keys()) {
      if (!orderedCategories.includes(key)) {
        orderedCategories.push(key);
      }
    }

    return orderedCategories
      .filter(cat => groupMap.has(cat))
      .map(category => ({
        category,
        foods: groupMap.get(category)!,
        collapsed: collapsed.has(category),
      }));
  });

  totalCount = computed(() => this.foods().length);

  // Nutrition Facts popup
  nfPopupFood = signal<Food | null>(null);
  imageZoomed = signal(false);
  imageZoomOrigin = signal('center center');
  nfImageHeight = signal(600);
  private splitterStartY = 0;
  private splitterStartHeight = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  private linkClickTimer: ReturnType<typeof setTimeout> | null = null;
  private linkClickFood: Food | null = null;

  onFoodLinkClick(event: Event, food: Food): void {
    event.stopPropagation();
    if (this.linkClickFood === food && this.linkClickTimer) {
      // Double click on link — show nutrition facts
      clearTimeout(this.linkClickTimer);
      this.linkClickTimer = null;
      this.linkClickFood = null;
      this.showNfPopup(food);
    } else {
      // First click — wait to see if double click follows
      this.linkClickFood = food;
      this.linkClickTimer = setTimeout(() => {
        // Single click — open link
        window.open(food.productPurchaseLink!, '_blank', 'noopener');
        this.linkClickTimer = null;
        this.linkClickFood = null;
      }, 300);
    }
  }

  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

  scheduleTooltipHide(tooltip: { hide: () => void }): void {
    this.clearTooltipHide();
    this.tooltipHideTimer = setTimeout(() => tooltip.hide(), 6000);
  }

  clearTooltipHide(): void {
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
  }

  onFoodDblClick(food: Food): void {
    if (this.showPreferenceIcons()) {
      this.showNfPopup(food);
    }
    // Plan tab: adding is handled by selectFood's double-tap detection — don't duplicate
  }

  showNfPopup(food: Food): void {
    this.imageZoomed.set(false);
    this.nfImageHeight.set(600);
    this.nfPopupFood.set(food);
  }

  closeNfPopup(): void {
    this.nfPopupFood.set(null);
  }

  openProductLink(food: Food): void {
    const url = food.productPurchaseLink;
    if (url) {
      this.closeNfPopup();
      window.open(url, '_blank', 'noopener');
    }
  }

  onImageZoomEnter(): void {
    this.imageZoomed.set(true);
  }

  onImageZoomLeave(): void {
    this.imageZoomed.set(false);
  }

  onImageZoomMove(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    this.imageZoomOrigin.set(`${x}% ${y}%`);
  }

  onSplitterMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.splitterStartY = event.clientY;
    this.splitterStartHeight = this.nfImageHeight();

    const onMove = (e: MouseEvent) => {
      const delta = e.clientY - this.splitterStartY;
      this.nfImageHeight.set(Math.max(40, this.splitterStartHeight + delta));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onSplitterTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    this.splitterStartY = touch.clientY;
    this.splitterStartHeight = this.nfImageHeight();

    const onMove = (e: TouchEvent) => {
      const delta = e.touches[0].clientY - this.splitterStartY;
      this.nfImageHeight.set(Math.max(40, this.splitterStartHeight + delta));
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onEnd);
  }

  onFoodLongPressStart(event: TouchEvent, food: Food): void {
    if (!this.showPreferenceIcons()) return; // Plan tab uses swipe-to-add, not long-press
    this.longPressTimer = setTimeout(() => {
      event.preventDefault();
      this.showNfPopup(food);
    }, 500);
  }

  onFoodLongPressEnd(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private setFoods(foods: Food[]): void {
    this.foods.set(foods);

    // Collapse all, then expand the first category that has foods
    const allCollapsed = new Set(CATEGORY_ORDER);
    if (foods.length > 0) {
      const firstCategory = foods[0].categoryName || 'Uncategorized';
      allCollapsed.delete(firstCategory);
    }
    this.collapsedCategories.set(allCollapsed);
  }

  toggleCollapse(category: string): void {
    this.collapsedCategories.update(set => {
      const next = new Set(set);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  // Caches
  private yehApprovedCache = signal<Food[]>([]);
  private favoritesCache = signal<Food[]>([]);
  private combinedCache = signal<Food[]>([]);
  private restrictedCache = signal<Food[]>([]);
  private communityCache = signal<Food[]>([]);

  // Double-click/tap detection
  private lastTapTime = 0;
  private lastTapIndex = -1;
  private readonly doubleTapDelay = 300;

  // Swipe detection
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private swipingIndex = -1;
  private readonly swipeThreshold = 0.35;
  private readonly swipeTimeLimit = 500;

  // Tracks whether user has manually changed the filter (radio click).
  // Once true, the settings-driven effect won't override their choice.
  private userChangedFilter = false;

  // Handles the refresh race condition where settings load after this component initializes.
  // Only applies the saved preference if the user hasn't manually switched filters yet.
  private foodSourceEffect = effect(() => {
    if (this.showFilterRadios() && this.userChangedFilter) return;

    const source = this.prefsService.foodListSource();
    const filter = source === 'myfoods' ? 'my-favorites' : 'yeh-approved';

    if (this.activeFilter() === filter) return;

    this.activeFilters.set(new Set([filter]));
    this.activeFilter.set(filter as FoodFilterType);
    this.isYehApproved.set(filter === 'yeh-approved' || source === 'yeh_plus_myfoods');

    if (this.mode() === 'search') {
      if (source === 'yeh_plus_myfoods') {
        this.loadYehPlusMyFoods();
      } else if (filter === 'yeh-approved') {
        this.loadYehApprovedFoods();
      } else {
        this.loadFavorites();
      }
    }
  });

  ngOnInit(): void {
    if (this.showFilterRadios()) {
      // Read current preference (may still be default if settings haven't loaded yet)
      const source = this.prefsService.foodListSource();
      const initialFilter = source === 'myfoods' ? 'my-favorites' : 'yeh-approved';
      this.activeFilters.set(new Set([initialFilter]));
      this.activeFilter.set(initialFilter as FoodFilterType);
      this.isYehApproved.set(initialFilter === 'yeh-approved' || source === 'yeh_plus_myfoods');
    } else {
      // Plan tab — use preference setting, no checkbox
      const source = this.prefsService.foodListSource();
      const filter = source === 'myfoods' ? 'my-favorites' : 'yeh-approved';
      this.activeFilter.set(filter as FoodFilterType);
      this.isYehApproved.set(filter === 'yeh-approved' || source === 'yeh_plus_myfoods');
    }

    if (this.mode() === 'search') {
      const source = this.prefsService.foodListSource();
      // Always load the initial list based on active filter
      if (source === 'yeh_plus_myfoods') {
        this.loadYehPlusMyFoods();
      } else if (this.isYehApproved()) {
        this.loadYehApprovedFoods();
      } else {
        this.loadFavorites();
      }

      // Load user preferences if showing preference icons
      if (this.showPreferenceIcons()) {
        this.preferencesService.getAllPreferences().subscribe({
          error: (err) => console.error('Failed to load preferences:', err)
        });
      }
    }
  }

  /** Get appropriate empty message based on filter */
  getEmptyMessage(): string {
    switch (this.activeFilter()) {
      case 'clear':
        return 'Enter search and press Enter';
      case 'my-favorites':
        return 'No favorite foods';
      case 'my-restricted':
        return 'No restricted foods';
      case 'community':
        return 'No community foods';
      case 'yeh-approved':
        return 'No YEH approved foods';
      default:
        return '{food count: 0}';
    }
  }

  /** Load all YEH approved foods and cache them */
  private loadYehApprovedFoods(): void {
    this.isLoading.set(true);

    this.foodsService.searchYehApprovedFoods(this.maxCount).subscribe({
      next: (response) => {
        if (response && response.foods && Array.isArray(response.foods)) {
          this.yehApprovedCache.set(response.foods);
          this.setFoods(response.foods);

          if (response.foods.length > 0) {
            this.selectFood(0, false);
          }
        }
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('Failed to load YEH approved foods:', error);
        this.isLoading.set(false);
        this.notificationService.show('Failed to load YEH approved foods', 'error');
      }
    });
  }

  /** Load user's favorite foods directly from API (full food objects via AllFoods view) */
  private loadFavorites(): void {
    this.isLoading.set(true);

    this.preferencesService.getAllowedFoodsFull().subscribe({
      next: (foods) => {
        this.favoritesCache.set(foods);
        this.setFoods(foods);

        if (foods.length > 0) {
          this.selectFood(0, false);
        } else {
          this.selectedIndex.set(-1);
        }
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('Failed to load favorites:', error);
        this.isLoading.set(false);
        this.notificationService.show('Failed to load favorites', 'error');
      }
    });
  }

  /** Load YEH approved + user's favorites merged, deduped by food ID */
  private loadYehPlusMyFoods(): void {
    this.isLoading.set(true);

    forkJoin({
      yeh: this.foodsService.searchYehApprovedFoods(this.maxCount),
      favorites: this.preferencesService.getAllowedFoodsFull()
    }).subscribe({
      next: ({ yeh, favorites }) => {
        const yehFoods = yeh?.foods ?? [];
        const seenIds = new Set(yehFoods.map(f => f.id));
        const uniqueFavorites = favorites.filter(f => !seenIds.has(f.id));
        const merged = [...yehFoods, ...uniqueFavorites];

        this.yehApprovedCache.set(yehFoods);
        this.favoritesCache.set(favorites);
        this.combinedCache.set(merged);
        this.setFoods(merged);

        if (merged.length > 0) {
          this.selectFood(0, false);
        }
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('Failed to load YEH + MyFoods:', error);
        this.isLoading.set(false);
        this.notificationService.show('Failed to load foods', 'error');
      }
    });
  }

  /** Load user's restricted foods directly from API (full food objects via AllFoods view) */
  private loadRestricted(): void {
    this.isLoading.set(true);

    this.preferencesService.getRestrictedFoodsFull().subscribe({
      next: (foods) => {
        this.restrictedCache.set(foods);
        this.setFoods(foods);

        if (foods.length > 0) {
          this.selectFood(0, false);
        } else {
          this.selectedIndex.set(-1);
        }
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('Failed to load restricted:', error);
        this.isLoading.set(false);
        this.notificationService.show('Failed to load restricted foods', 'error');
      }
    });
  }

  /** Load community shared foods (ShareApproved = 1) */
  private async loadCommunity(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.foodsService.loadCategories();
      const userFoods = await this.userFoodService.listCommunityFoods();
      const foods = userFoods.map(uf => this.userFoodToFood(uf));
      this.communityCache.set(foods);
      this.setFoods(foods);

      if (foods.length > 0) {
        this.selectFood(0, false);
      } else {
        this.selectedIndex.set(-1);
      }
    } catch {
      this.notificationService.show('Failed to load community foods', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Map a UserFood to a Food for display in the list */
  private userFoodToFood(uf: UserFood): Food {
    return {
      id: uf.id, // real ID — use dataSource to distinguish from USDA foods
      description: uf.description,
      shortDescription: uf.shortDescription,
      foodRequestType: 'unknown',
      categoryName: this.foodsService.getCategoryName(uf.categoryId),
      dataSource: uf.dataSource || 'user',
      yehApproved: false,
      glycemicIndex: uf.glycemicIndex ?? 0,
      glycemicLoad: uf.glycemicLoad,
      servingSizeMultiplicand: uf.servingSizeMultiplicand ?? 1,
      servingUnit: uf.servingUnit,
      servingGramsPerUnit: uf.servingGramsPerUnit,
      foodImage: uf.foodImage,
      foodImageThumbnail: uf.foodImageThumbnail,
      nutritionFactsImage: uf.nutritionFactsImage,
      productPurchaseLink: uf.productPurchaseLink,
      verifiedType: 'unknown',
      verifiedBy: '',
      duplicateCount: 0,
      nutritionFacts: {
        calories: uf.nutritionFacts?.calories ?? 0,
        proteinG: uf.nutritionFacts?.proteinG ?? 0,
        totalFatG: uf.nutritionFacts?.totalFatG ?? 0,
        saturatedFatG: uf.nutritionFacts?.saturatedFatG ?? 0,
        totalCarbohydrateG: uf.nutritionFacts?.totalCarbohydrateG ?? 0,
        dietaryFiberG: uf.nutritionFacts?.dietaryFiberG ?? 0,
        sodiumMG: uf.nutritionFacts?.sodiumMG ?? 0,
        servingSizeG: uf.nutritionFacts?.servingSizeG ?? 0,
      }
    };
  }

  /** Handle filter radio change (browse mode) */
  onFilterChange(filter: FoodFilterType): void {
    this.userChangedFilter = true;
    this.activeFilter.set(filter);
    this.activeFilters.set(new Set([filter]));
    this.searchQuery = '';
    this.selectedIndex.set(-1);
    this.setFoods([]);

    switch (filter) {
      case 'yeh-approved':
        this.isYehApproved.set(true);
        if (this.yehApprovedCache().length > 0) {
          this.setFoods(this.yehApprovedCache());
          if (this.foods().length > 0) {
            this.selectFood(0, false);
          }
        } else {
          this.loadYehApprovedFoods();
        }
        break;

      case 'my-favorites':
        this.isYehApproved.set(false);
        this.loadFavorites();
        break;

      case 'my-restricted':
        this.isYehApproved.set(false);
        this.loadRestricted();
        break;

      case 'community':
        this.isYehApproved.set(false);
        this.loadCommunity();
        break;

      case 'clear':
        this.isYehApproved.set(false);
        this.setFoods([]);
        break;
    }
  }

  /** Check if a filter checkbox is active */
  isFilterActive(filter: string): boolean {
    return this.activeFilters().has(filter);
  }

  /** Toggle a filter — single-select: clicking the active one deselects all */
  onFilterToggle(filter: string): void {
    const wasActive = this.activeFilters().has(filter);

    if (wasActive) {
      // Deselect — no filter active
      this.activeFilters.set(new Set());
      this.activeFilter.set('clear');
      this.isYehApproved.set(false);
      this.searchQuery = '';
      this.selectedIndex.set(-1);
      this.setFoods([]);
      return;
    }

    // Select this one, deselect others
    this.activeFilters.set(new Set([filter]));
    this.searchQuery = '';
    this.selectedIndex.set(-1);
    this.onFilterChange(filter as FoodFilterType);
  }

  /** Handle search query changes */
  onSearchQueryChange(query: string): void {
    const filter = this.activeFilter();
    const trimmedQuery = query.trim().toLowerCase();

    let cache: Food[] = [];
    if (this.combinedCache().length > 0 && this.prefsService.foodListSource() === 'yeh_plus_myfoods') {
      cache = this.combinedCache();
    } else {
      switch (filter) {
        case 'yeh-approved':
          cache = this.yehApprovedCache();
          break;
        case 'my-favorites':
          cache = this.favoritesCache();
          break;
        case 'my-restricted':
          cache = this.restrictedCache();
          break;
        case 'community':
          cache = this.communityCache();
          break;
        case 'clear':
          return;
      }
    }

    if (cache.length > 0) {
      if (trimmedQuery.length === 0) {
        this.setFoods(cache);
      } else {
        const filtered = cache.filter(food =>
          food.description.toLowerCase().includes(trimmedQuery) ||
          (food.shortDescription && food.shortDescription.toLowerCase().includes(trimmedQuery))
        );
        this.setFoods(filtered);
      }

      if (this.foods().length > 0) {
        this.selectFood(0, false);
      } else {
        this.selectedIndex.set(-1);
      }
    }
  }

  canSearch(): boolean {
    return this.searchQuery.trim().length >= 2 || this.activeFilters().size > 0;
  }

  getDisplayDescription(food: Food): string {
    return food.shortDescription || food.description;
  }

  onYehApprovedChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.isYehApproved.set(checked);

    if (checked) {
      this.searchQuery = '';
      this.loadYehApprovedFoods();
    } else {
      this.yehApprovedCache.set([]);
      this.setFoods([]);
      this.selectedIndex.set(-1);
    }
  }

  performSearch(): void {
    const query = this.searchQuery.trim();
    if (query.length < 2) return;

    // Check if food exists in any active filter list
    const filters = this.activeFilters();
    const localLists: Food[] = [];
    if (filters.has('yeh-approved')) localLists.push(...this.yehApprovedCache());
    if (filters.has('my-favorites')) localLists.push(...this.favoritesCache());
    if (filters.has('my-restricted')) localLists.push(...this.restrictedCache());
    if (filters.has('community')) localLists.push(...this.communityCache());

    const lowerQuery = query.toLowerCase();
    const localMatch = localLists.some(f =>
      f.description.toLowerCase().includes(lowerQuery) ||
      (f.shortDescription && f.shortDescription.toLowerCase().includes(lowerQuery))
    );

    if (localMatch) {
      // Found in checked lists — filter and show local results
      const filtered = localLists.filter(f =>
        f.description.toLowerCase().includes(lowerQuery) ||
        (f.shortDescription && f.shortDescription.toLowerCase().includes(lowerQuery))
      );
      this.setFoods(filtered);
      if (filtered.length > 0) this.selectFood(0, false);
      return;
    }

    // Not in user's lists — search the API (FoodDB → FatSecret fallback)
    this.isLoading.set(true);

    this.foodsService.searchFoods(query, 50).subscribe({
      next: (response) => {
        if (response && response.foods && Array.isArray(response.foods) && response.foods.length > 0) {
          // Pick the best match with the lowest FoodID (original USDA entry)
          const best = response.foods
            .sort((a, b) => a.id - b.id)[0];
          this.foodNotFound.emit({ searchQuery: query, suggestedFood: best });
        } else {
          // Nothing found anywhere — open empty Add dialog
          this.foodNotFound.emit({ searchQuery: query });
        }
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('Food search error:', error);
        this.setFoods([]);
        this.selectedIndex.set(-1);
        this.isLoading.set(false);

        let errorMessage = `Search failed (${error.status})`;
        if (error.status === 0) {
          errorMessage = 'Network error - CORS or connection issue';
        } else if (error.status === 401) {
          errorMessage = 'Auth error - Token issue';
        } else if (error.status === 403) {
          errorMessage = 'Forbidden - Access denied';
        } else if (error.status === 404) {
          errorMessage = 'Not found';
        } else if (error.status >= 500) {
          errorMessage = `Server error (${error.status})`;
        }
        this.notificationService.show(errorMessage, 'error');
      }
    });
  }

  private getFoodSource(foodId: number): string | undefined {
    const food = this.foods().find(f => f.id === foodId);
    if (!food) return undefined;
    // USDA foods have DataSource like 'USDA-FNDDS-...' — anything else is a user food
    return food.dataSource?.startsWith('USDA') ? undefined : 'user';
  }

  toggleFavorite(event: Event, foodId: number): void {
    event.stopPropagation();
    this.preferencesService.toggleFavoriteLocal(foodId, this.getFoodSource(foodId));
  }

  toggleRestricted(event: Event, foodId: number): void {
    event.stopPropagation();
    this.preferencesService.toggleRestrictedLocal(foodId, this.getFoodSource(foodId));
  }

  removePreference(event: Event, foodId: number): void {
    event.stopPropagation();
    const filter = this.activeFilter();
    const source = this.getFoodSource(foodId);
    if (filter === 'my-favorites') {
      this.preferencesService.toggleFavoriteLocal(foodId, source);
    } else if (filter === 'my-restricted') {
      this.preferencesService.toggleRestrictedLocal(foodId, source);
    }
    // Remove from displayed list immediately
    this.foods.update(foods => foods.filter(f => f.id !== foodId));
  }

  selectFood(index: number, fromUserClick = true): void {
    const foodList = this.foods();
    if (index < 0 || index >= foodList.length) {
      return;
    }

    if (fromUserClick) {
      const currentTime = Date.now();
      const timeSinceLastTap = currentTime - this.lastTapTime;
      const isDoubleTap =
        index === this.lastTapIndex &&
        timeSinceLastTap < this.doubleTapDelay &&
        timeSinceLastTap > 50; // ignore impossibly fast clicks (debounce)

      if (isDoubleTap) {
        // Only emit addFood from the food picker (not Food Preferences)
        if (!this.showPreferenceIcons()) {
          const food = foodList[index];
          this.addFood.emit({ food });
        }

        // Cooldown — prevent next click from pairing
        this.lastTapTime = 0;
        this.lastTapIndex = -1;
        return;
      }

      this.lastTapTime = currentTime;
      this.lastTapIndex = index;
    } else {
      // Reset double-tap tracking on programmatic selection
      this.lastTapTime = 0;
      this.lastTapIndex = -1;
    }

    {
      this.selectedIndex.set(index);
      const food = foodList[index];

      const nf = food.nutritionFacts;
      const event: SelectedFoodEvent = {
        food,
        description: food.description,
        protein: nf?.proteinG ?? 0,
        carbs: nf?.totalCarbohydrateG ?? 0,
        fat: nf?.totalFatG ?? 0,
        fiber: nf?.dietaryFiberG ?? 0
      };

      this.selectedFood.emit(event);
    }
  }

  onTouchStart(event: TouchEvent, index: number): void {
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
    this.swipingIndex = index;
  }

  onTouchMove(event: TouchEvent, index: number): void {
    if (this.swipingIndex !== index) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = Math.abs(touch.clientY - this.touchStartY);

    if (deltaY > Math.abs(deltaX)) {
      this.swipingIndex = -1;
      return;
    }

    if (Math.abs(deltaX) > 10) {
      event.preventDefault();
    }
  }

  onTouchEnd(event: TouchEvent, index: number): void {
    if (this.swipingIndex !== index) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = Math.abs(touch.clientY - this.touchStartY);
    const deltaTime = Date.now() - this.touchStartTime;

    const target = event.target as HTMLElement;
    const foodItem = target.closest('.food-item') as HTMLElement;
    const elementWidth = foodItem?.offsetWidth || 0;

    const isSwipeRight =
      deltaX > elementWidth * this.swipeThreshold &&
      deltaY < 50 &&
      deltaTime < this.swipeTimeLimit;

    if (isSwipeRight) {
      const foodList = this.foods();
      if (index >= 0 && index < foodList.length) {
        const food = foodList[index];
        this.addFood.emit({ food });
      }
    }

    this.swipingIndex = -1;
  }

  onKeyDown(event: KeyboardEvent): void {
    const foodList = this.foods();
    if (foodList.length === 0) {
      return;
    }

    const currentIndex = this.selectedIndex();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < foodList.length - 1) {
          this.selectFood(currentIndex + 1);
          this.scrollToIndex(currentIndex + 1);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          this.selectFood(currentIndex - 1);
          this.scrollToIndex(currentIndex - 1);
        } else if (currentIndex === -1 && foodList.length > 0) {
          this.selectFood(0);
          this.scrollToIndex(0);
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (currentIndex >= 0 && currentIndex < foodList.length) {
          const food = foodList[currentIndex];
          this.addFood.emit({ food });
        }
        break;
    }
  }

  private scrollToIndex(index: number): void {
    setTimeout(() => {
      const foodItems = document.querySelectorAll('.food-item');
      if (foodItems[index]) {
        foodItems[index].scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }, 0);
  }
}
