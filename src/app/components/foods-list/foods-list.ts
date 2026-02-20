// src/app/components/foods-list/foods-list.ts
import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Food } from '../../models/food.model';

export interface RemoveFoodEvent {
  food: Food;
}

interface FoodGroup {
  category: string;
  foods: { food: Food; flatIndex: number }[];
  collapsed: boolean;
}

const CATEGORY_ORDER = [
  'Protein', 'Fat', 'Dairy', 'Vegetable', 'Carbohydrate',
  'Fruit', 'Processed', 'Beverage', 'Condiment'
];

@Component({
  selector: 'app-foods-list',
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="foods-list-container">
      <div
        class="foods-list"
        (keydown)="onKeyDown($event)"
        tabindex="0">
        @if (foods().length === 0) {
          <div class="empty-message">
            <p>No foods selected</p>
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
                        <img [src]="item.food.foodImageThumbnail" [alt]="item.food.description" class="thumbnail-img" />
                      } @else {
                        <div class="thumbnail-placeholder"></div>
                      }
                    </div>
                    <span class="food-description">{{ item.food.description }}</span>
                  </div>
                }
              }
            }
          }
        }
      </div>
    </div>
  `,
  styleUrls: ['./foods-list.scss']
})
export class FoodsListComponent {
  foods = input<Food[]>([]);

  removeFood = output<RemoveFoodEvent>();

  selectedIndex = signal<number>(-1);

  private collapsedCategories = signal<Set<string>>(new Set(CATEGORY_ORDER));

  groupedFoods = computed<FoodGroup[]>(() => {
    const foods = this.foods();
    const collapsed = this.collapsedCategories();
    const groupMap = new Map<string, { food: Food; flatIndex: number }[]>();

    // Initialize predefined categories
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

    // Build ordered list: predefined first, then any extras
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
      this.removeFood.emit({ food });
      this.lastTapTime = 0;
      this.lastTapIndex = -1;
    } else {
      this.selectedIndex.set(index);
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

    const isSwipeLeft =
      deltaX < -(elementWidth * this.swipeThreshold) &&
      deltaY < 50 &&
      deltaTime < this.swipeTimeLimit;

    if (isSwipeLeft) {
      const foodList = this.foods();
      if (index >= 0 && index < foodList.length) {
        const food = foodList[index];
        this.removeFood.emit({ food });
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
          this.selectedIndex.set(currentIndex + 1);
          this.scrollToIndex(currentIndex + 1);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          this.selectedIndex.set(currentIndex - 1);
          this.scrollToIndex(currentIndex - 1);
        } else if (currentIndex === -1 && foodList.length > 0) {
          this.selectedIndex.set(0);
          this.scrollToIndex(0);
        }
        break;

      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        if (currentIndex >= 0 && currentIndex < foodList.length) {
          const food = foodList[currentIndex];
          this.removeFood.emit({ food });

          if (currentIndex >= foodList.length - 1) {
            this.selectedIndex.set(Math.max(0, foodList.length - 2));
          }
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
