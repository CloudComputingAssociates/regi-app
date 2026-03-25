// src/app/components/foods-list/foods-list.ts
import { Component, ChangeDetectionStrategy, signal, computed, output, input, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRadioModule } from '@angular/material/radio';
import { FoodsService } from '../../services/foods.service';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { TabService } from '../../services/tab.service';
import { Food } from '../../models/food.model';
import { HttpErrorResponse } from '@angular/common/http';

export type FoodFilterType = 'yeh-approved' | 'my-favorites' | 'my-restricted' | 'clear';

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

@Component({
  selector: 'app-foods-list',
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatRadioModule],
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

        <!-- Filter Radio Buttons -->
        @if (showFilterRadios()) {
          <div class="filter-row">
            <mat-radio-group class="filter-radio-group" [value]="activeFilter()" (change)="onFilterChange($event.value)">
              <mat-radio-button value="yeh-approved">YEH</mat-radio-button>
              <mat-radio-button value="my-favorites">MyFoods</mat-radio-button>
              <mat-radio-button value="my-restricted">Restricted</mat-radio-button>
              <mat-radio-button value="clear">All</mat-radio-button>
            </mat-radio-group>
          </div>
        } @else {
          <!-- Original checkbox for Plan tab -->
          <div class="yeh-approved-row">
            <label class="checkbox-control">
              <input
                type="checkbox"
                [checked]="isYehApproved()"
                (change)="onYehApprovedChange($event)" />
              <span>YEH Approved</span>
            </label>
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
              <p>Loading foods...</p>
            </div>
          } @else if (foods().length === 0) {
            <div class="food-item placeholder-item">
              <span class="food-description">{{ getEmptyMessage() }}</span>
            </div>
          } @else {
            @for (group of groupedFoods(); track group.category) {
              @if (group.foods.length > 0) {
                <div class="category-header"
                     (click)="toggleCollapse(group.category)">
                  <mat-icon class="collapse-icon"
                            [class.collapsed]="group.collapsed">expand_more</mat-icon>
                  <span class="category-name">{{ group.category }}</span>
                  <span class="category-count">{{ group.foods.length }}</span>
                </div>
                @if (!group.collapsed) {
                  @for (item of group.foods; track item.food.id) {
                    <div
                      class="food-item"
                      [class.selected]="selectedIndex() === item.flatIndex"
                      (click)="selectFood(item.flatIndex)"
                      (touchstart)="onTouchStart($event, item.flatIndex)"
                      (touchmove)="onTouchMove($event, item.flatIndex)"
                      (touchend)="onTouchEnd($event, item.flatIndex)"
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

                      @if (showPreferenceIcons()) {
                        <div class="preference-icons">
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
    </div>
  `,
  styleUrls: ['./foods-list.scss']
})
export class FoodsListComponent implements OnInit {
  private foodsService = inject(FoodsService);
  protected preferencesService = inject(FoodPreferencesService);
  private notificationService = inject(NotificationService);
  private tabService = inject(TabService);

  // Inputs
  mode = input<'search' | 'display'>('search');
  displayFoods = input<Food[]>([]);
  showAiButton = input<boolean>(true);
  showPreferenceIcons = input<boolean>(false);
  showFilterRadios = input<boolean>(false);

  // Outputs
  selectedFood = output<SelectedFoodEvent>();
  addFood = output<AddFoodEvent>();

  // Internal state
  searchQuery = '';
  maxCount = 500;
  foods = signal<Food[]>([]);
  selectedIndex = signal<number>(-1);
  isLoading = signal<boolean>(false);
  isYehApproved = signal<boolean>(true);
  activeFilter = signal<FoodFilterType>('yeh-approved');

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

  private setFoods(foods: Food[]): void {
    this.foods.set(foods);
    this.tabService.updateTabBadge('foods', foods.length);
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
  private restrictedCache = signal<Food[]>([]);

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

  ngOnInit(): void {
    // Always start with YEH Approved filter
    this.activeFilter.set('yeh-approved');
    this.isYehApproved.set(true);

    if (this.mode() === 'search') {
      this.loadYehApprovedFoods();

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
            this.selectFood(0);
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

  /** Load user's favorite foods from API */
  private loadFavorites(): void {
    this.isLoading.set(true);

    this.preferencesService.getAllowedPreferences().subscribe({
      next: () => {
        const favoriteFoods: Food[] = [];
        const allowedMap = this.preferencesService.allowedFoods();

        const yehFoods = this.yehApprovedCache();
        for (const food of yehFoods) {
          if (allowedMap.has(food.id)) {
            favoriteFoods.push(food);
          }
        }

        this.favoritesCache.set(favoriteFoods);
        this.setFoods(favoriteFoods);

        if (favoriteFoods.length > 0) {
          this.selectFood(0);
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

  /** Load user's restricted foods from API */
  private loadRestricted(): void {
    this.isLoading.set(true);

    this.preferencesService.getRestrictedPreferences().subscribe({
      next: () => {
        const restrictedFoods: Food[] = [];
        const restrictedMap = this.preferencesService.restrictedFoods();

        const yehFoods = this.yehApprovedCache();
        for (const food of yehFoods) {
          if (restrictedMap.has(food.id)) {
            restrictedFoods.push(food);
          }
        }

        this.restrictedCache.set(restrictedFoods);
        this.setFoods(restrictedFoods);

        if (restrictedFoods.length > 0) {
          this.selectFood(0);
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

  /** Handle filter radio change */
  onFilterChange(filter: FoodFilterType): void {
    this.activeFilter.set(filter);
    this.searchQuery = '';
    this.selectedIndex.set(-1);

    switch (filter) {
      case 'yeh-approved':
        this.isYehApproved.set(true);
        if (this.yehApprovedCache().length > 0) {
          this.setFoods(this.yehApprovedCache());
          if (this.foods().length > 0) {
            this.selectFood(0);
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

      case 'clear':
        this.isYehApproved.set(false);
        this.setFoods([]);
        break;
    }
  }

  /** Handle search query changes */
  onSearchQueryChange(query: string): void {
    const filter = this.activeFilter();
    const trimmedQuery = query.trim().toLowerCase();

    let cache: Food[] = [];
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
      case 'clear':
        return;
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
        this.selectFood(0);
      } else {
        this.selectedIndex.set(-1);
      }
    }
  }

  canSearch(): boolean {
    if (this.activeFilter() === 'clear') {
      return this.searchQuery.trim().length >= 2;
    }
    return true;
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
    const filter = this.activeFilter();

    if (filter !== 'clear') {
      this.onSearchQueryChange(this.searchQuery);
      return;
    }

    if (query.length < 2) {
      return;
    }

    this.isLoading.set(true);

    this.foodsService.searchFoods(query, this.maxCount).subscribe({
      next: (response) => {
        if (response && response.foods && Array.isArray(response.foods)) {
          this.setFoods(response.foods);

          if (response.foods.length > 0) {
            this.selectFood(0);
          } else {
            this.selectedIndex.set(-1);
          }
        } else {
          this.setFoods([]);
          this.selectedIndex.set(-1);
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

  toggleFavorite(event: Event, foodId: number): void {
    event.stopPropagation();
    this.preferencesService.toggleFavoriteLocal(foodId);
  }

  toggleRestricted(event: Event, foodId: number): void {
    event.stopPropagation();
    this.preferencesService.toggleRestrictedLocal(foodId);
  }

  selectFood(index: number): void {
    const foodList = this.foods();
    if (index < 0 || index >= foodList.length) {
      return;
    }

    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - this.lastTapTime;
    const isDoubleTap =
      index === this.lastTapIndex &&
      timeSinceLastTap < this.doubleTapDelay;

    if (isDoubleTap) {
      const food = foodList[index];
      this.addFood.emit({ food });

      this.lastTapTime = 0;
      this.lastTapIndex = -1;
    } else {
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

      this.lastTapTime = currentTime;
      this.lastTapIndex = index;
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
