// src/app/components/foods-panel/foods-panel.ts
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { FoodCarouselComponent } from '../food-carousel/food-carousel';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { UserFoodService } from '../../services/user-food.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { FoodsService, Category } from '../../services/foods.service';
import { TabService } from '../../services/tab.service';
import { CreateUserFoodRequest } from '../../models/user-food.model';
import { Food } from '../../models/food.model';

const SERVING_UNITS = ['whole', 'cup', 'tbsp', 'tsp', 'oz', 'lbs', 'g'];

type SpinSource = 'myfoods' | 'restricted' | 'yeh-approved';

const CAROUSEL_CATEGORIES = [
  'Protein', 'Fat', 'Dairy', 'Vegetable',
  'Carbohydrate', 'Fruit', 'Processed', 'Condiment',
] as const;

const LS_MYFOODS = 'regi.foods.myfoods';
const LS_THISWEEK = 'regi.foods.thisweek';

const CATEGORY_PLURALS: Record<string, string> = {
  Protein: 'Proteins',
  Fat: 'Fats',
  Dairy: 'Dairy',
  Vegetable: 'Vegetables',
  Carbohydrate: 'Carbohydrates',
  Fruit: 'Fruits',
  Processed: 'Processed',
  Condiment: 'Condiments',
};

@Component({
  selector: 'app-foods-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule, FoodCarouselComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="foods-panel-container">
      <div class="action-buttons">
        <button
          class="icon-btn add-food-btn"
          (click)="openAddDialog()"
          matTooltip="Add My Food"
          matTooltipPosition="above"
          [matTooltipShowDelay]="300">
          +
        </button>
        <button
          class="icon-btn close-btn"
          (click)="closePanel()"
          matTooltip="Close"
          matTooltipPosition="above"
          [matTooltipShowDelay]="300">
          ✕
        </button>
      </div>

      <div class="spin-controls">
        <div class="spin-row">
          <span class="spin-row-label">Type</span>
          <select
            class="spin-source-select"
            [ngModel]="spinSource()"
            (ngModelChange)="spinSource.set($event)">
            <option value="myfoods">My Foods</option>
            <option value="restricted">Restricted</option>
            <option value="yeh-approved">YEH Approved</option>
          </select>
          <input
            type="text"
            class="search-input compact"
            [value]="searchQuery()"
            (input)="onSearchInput($any($event.target).value)"
            placeholder="Search…" />
        </div>

        <div class="spin-row">
          <span class="spin-row-label">Filters</span>
          <div class="category-radio-panel" role="group" aria-label="Category filter">
            @for (cat of carouselCategories; track cat) {
              <button
                type="button"
                class="category-radio-btn"
                [class.pressed]="isCategoryActive(cat)"
                [attr.aria-pressed]="isCategoryActive(cat)"
                (click)="toggleCategory(cat)">
                {{ categoryLabel(cat) }}
              </button>
            }
          </div>
        </div>
      </div>

      <app-food-carousel
        [foods]="carouselFoods()"
        [(addTo)]="addTo"
        (add)="onAddFood($event)" />

      <div
        class="pane-splitter"
        (mousedown)="onSplitterMouseDown($event)"
        (touchstart)="onSplitterTouchStart($event)">
        <div class="splitter-grip"></div>
      </div>

      <div class="bottom-pane" [style.height.px]="bottomPaneHeight()">
        <div class="bottom-header">
          @if (addTo() === 'myfoods') {
            My Foods ({{ myFoodsLocal().length }})
          } @else {
            This Week ({{ thisWeekLocal().length }})
          }
        </div>

        <div class="bottom-list">
          @let list = addTo() === 'myfoods' ? myFoodsLocal() : thisWeekLocal();
          @if (list.length === 0) {
            <div class="bottom-empty">
              @if (addTo() === 'myfoods') {
                Double-click a centered food to add to MyFoods.
              } @else {
                Double-click a centered food to add to This Week.
              }
            </div>
          } @else {
            @for (food of list; track food.id) {
              <div class="selected-food-row">
                <div class="selected-food-thumb">
                  @if (food.foodImageThumbnail) {
                    <img [src]="food.foodImageThumbnail" alt="" />
                  } @else {
                    <div class="selected-food-thumb-placeholder"></div>
                  }
                </div>
                <span class="selected-food-name">
                  {{ food.shortDescription || food.description }}
                </span>

                @if (addTo() === 'myfoods') {
                  <mat-icon
                    class="row-action favorite"
                    [class.active]="preferencesService.isAllowed(food.id)"
                    (click)="toggleFavorite($event, food.id)"
                    matTooltip="Favorite"
                    matTooltipPosition="left">
                    {{ preferencesService.isAllowed(food.id) ? 'star' : 'star_border' }}
                  </mat-icon>
                  <mat-icon
                    class="row-action restrict"
                    [class.active]="preferencesService.isRestricted(food.id)"
                    (click)="toggleRestricted($event, food.id)"
                    matTooltip="Restrict"
                    matTooltipPosition="left">
                    block
                  </mat-icon>
                  <mat-icon
                    class="row-action remove"
                    (click)="removeFromMyFoods($event, food.id)"
                    matTooltip="Remove"
                    matTooltipPosition="left">
                    delete
                  </mat-icon>
                } @else {
                  <mat-icon
                    class="row-action remove"
                    (click)="removeFromThisWeek($event, food.id)"
                    matTooltip="Remove"
                    matTooltipPosition="left">
                    delete
                  </mat-icon>
                }
              </div>
            }
          }
        </div>
      </div>

      <!-- Add Food Dialog -->
      @if (showAddDialog()) {
        <div class="dialog-overlay" (click)="closeAddDialog()">
          <div class="add-food-dialog" (click)="$event.stopPropagation()">
            <div class="dialog-header">
              <span class="dialog-title">Add My Food</span>
              <div class="dialog-header-right">
                <button class="dialog-ok-btn"
                  [disabled]="!canSubmit() || isSubmitting()"
                  (click)="submitFood()">
                  @if (isSubmitting()) {
                    <span class="save-spinner"></span>
                  } @else {
                    ✓
                  }
                </button>
                <button class="dialog-close" (click)="closeAddDialog()">✕</button>
              </div>
            </div>

            @if (isSubmitting()) {
              <div class="submit-overlay">
                <span class="submit-spinner"></span>
                <span class="submit-text">Adding food...</span>
              </div>
            }

            <div class="dialog-body">
              <div class="form-row">
                <label>Description <span class="required">*</span>
                  @if (sourceFoodId()) {
                    <span class="source-food-id">({{ sourceFoodId() }})</span>
                  }
                </label>
                <input type="text" class="form-input" [(ngModel)]="newFood.description" placeholder="e.g., Organic Greek Yogurt" />
              </div>

              <div class="form-row">
                <label>Short Description</label>
                <input type="text" class="form-input" [(ngModel)]="newFood.shortDescription" placeholder="e.g., Greek Yogurt" />
              </div>

              <div class="form-row">
                <label>Product Link <span class="optional-hint">(optional)</span></label>
                <div class="link-input-row">
                  <input type="url" class="form-input" [(ngModel)]="newFood.productPurchaseLink" placeholder="https://amazon.com/..." />
                  @if (newFood.productPurchaseLink) {
                    <button type="button" class="test-link-btn" (click)="testProductLink()">Test</button>
                  }
                </div>
              </div>

              <div class="form-row">
                <label>Category</label>
                <select class="form-select" [(ngModel)]="newFood.categoryId">
                  @for (cat of categories(); track cat.id) {
                    <option [ngValue]="cat.id">{{ cat.name }}</option>
                  }
                </select>
              </div>

              <div class="form-row-inline">
                <div class="form-col">
                  <label>Serving Unit</label>
                  <select class="form-select" [(ngModel)]="newFood.servingUnit">
                    @for (unit of servingUnits; track unit) {
                      <option [value]="unit">{{ unit }}</option>
                    }
                  </select>
                </div>
                <div class="form-col">
                  <label>Grams/Unit</label>
                  <input type="number" class="form-input" [(ngModel)]="newFood.servingGramsPerUnit" placeholder="0" />
                </div>
              </div>

              <div class="macros-section">
                <span class="section-label">Nutrition (per serving)</span>
                <div class="macro-grid">
                  <div class="macro-field">
                    <label>Calories <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.calories" />
                  </div>
                  <div class="macro-field">
                    <label>Protein (g) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.proteinG" />
                  </div>
                  <div class="macro-field">
                    <label>Fat (g) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.totalFatG" />
                  </div>
                  <div class="macro-field">
                    <label>Carbs (g) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.totalCarbohydrateG" />
                  </div>
                  <div class="macro-field">
                    <label>Fiber (g) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.dietaryFiberG" />
                  </div>
                  <div class="macro-field">
                    <label>Sodium (mg) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.sodiumMG" />
                  </div>
                </div>
              </div>

              <div class="image-section">
                <div class="image-upload">
                  <label>Product Image</label>
                  <div class="drop-zone"
                    [class.has-image]="productImagePreview()"
                    tabindex="0"
                    (dragover)="onDragOver($event)"
                    (drop)="onDrop($event, 'product')"
                    (paste)="onPaste($event, 'product')">
                    @if (productImagePreview()) {
                      <img [src]="productImagePreview()" alt="" class="preview-img" />
                      <button type="button" class="remove-img-btn" (click)="clearImage('product'); $event.stopPropagation()">✕</button>
                    } @else {
                      <div class="drop-placeholder">
                        <button type="button" class="browse-btn desktop-only" (click)="productImageInput.click(); $event.stopPropagation()">Browse</button>
                        <button type="button" class="camera-btn mobile-only" (click)="productImageInput.click(); $event.stopPropagation()">📷</button>
                        <span class="drop-label desktop-only">Drop or Ctrl+V to paste</span>
                        <span class="drop-label mobile-only">Tap 📷 or paste</span>
                      </div>
                    }
                  </div>
                  <input #productImageInput type="file" accept="image/*" capture="environment" hidden
                    (change)="onImageSelected($event, 'product')" />
                </div>

                <div class="image-upload">
                  <label>Nutrition Label <span class="label-hint">(auto-reads values)</span></label>
                  <div class="drop-zone"
                    [class.has-image]="nutritionImagePreview()"
                    tabindex="0"
                    (dragover)="onDragOver($event)"
                    (drop)="onDrop($event, 'nutrition')"
                    (paste)="onPaste($event, 'nutrition')">
                    @if (nutritionImagePreview()) {
                      <img [src]="nutritionImagePreview()" alt="" class="preview-img" />
                      <button type="button" class="remove-img-btn" (click)="clearImage('nutrition'); $event.stopPropagation()">✕</button>
                    } @else {
                      <div class="drop-placeholder">
                        <button type="button" class="browse-btn desktop-only" (click)="nutritionImageInput.click(); $event.stopPropagation()">Browse</button>
                        <button type="button" class="camera-btn mobile-only" (click)="nutritionImageInput.click(); $event.stopPropagation()">📷</button>
                        <span class="drop-label desktop-only">Drop or Ctrl+V to paste</span>
                        <span class="drop-label mobile-only">Tap 📷 or paste</span>
                      </div>
                    }
                  </div>
                  <input #nutritionImageInput type="file" accept="image/*" capture="environment" hidden
                    (change)="onImageSelected($event, 'nutrition')" />
                </div>
              </div>

              <div class="share-row">
                <label class="share-check">
                  <input type="checkbox" [(ngModel)]="newFood.shareCandidate" />
                  <span>Share w/ YEH Community</span>
                </label>
              </div>
            </div>

          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./foods-panel.scss']
})
export class FoodsPanelComponent {
  private tabService = inject(TabService);
  protected preferencesService = inject(FoodPreferencesService);
  private notificationService = inject(NotificationService);
  private userFoodService = inject(UserFoodService);
  private imageUploadService = inject(ImageUploadService);
  private foodsService = inject(FoodsService);
  private cdr = inject(ChangeDetectorRef);

  categories = signal<Category[]>([]);

  // Spin carousel state
  readonly carouselCategories = CAROUSEL_CATEGORIES;
  spinSource = signal<SpinSource>('yeh-approved');
  selectedCategories = signal<Set<string>>(new Set(['Protein']));
  private rawCarouselFoods = signal<Food[]>([]);

  // Search: filters the carousel locally (no API round-trip per keystroke)
  searchQuery = signal('');

  // Carousel feed = raw foods narrowed by the search box.
  carouselFoods = computed<Food[]>(() => {
    const raw = this.rawCarouselFoods();
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return raw;
    return raw.filter(f =>
      f.description.toLowerCase().includes(q) ||
      (f.shortDescription?.toLowerCase().includes(q) ?? false),
    );
  });

  // Carousel destination + local lists (persisted to localStorage).
  // The slider drives both the add target AND which list is visible at the bottom.
  addTo = signal<'myfoods' | 'thisweek'>('myfoods');
  myFoodsLocal = signal<Food[]>(this.loadLocal(LS_MYFOODS));
  thisWeekLocal = signal<Food[]>(this.loadLocal(LS_THISWEEK));

  // Splitter — bottom-pane height in px (clamped on drag)
  bottomPaneHeight = signal(220);
  private splitterStartY = 0;
  private splitterStartHeight = 0;

  categoryLabel(cat: string): string {
    return CATEGORY_PLURALS[cat] ?? cat;
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
  }

  // Auto-load whenever source or filter changes (search is applied client-side)
  private autoLoadCarousel = effect(() => {
    const source = this.spinSource();
    const cats = this.selectedCategories();
    this.loadCarouselFoods(source, cats);
  });

  // Persist lists whenever they change
  private persistMyFoods = effect(() => {
    this.saveLocal(LS_MYFOODS, this.myFoodsLocal());
  });
  private persistThisWeek = effect(() => {
    this.saveLocal(LS_THISWEEK, this.thisWeekLocal());
  });

  // ----- Carousel add target handling -----

  onAddFood(event: { food: Food; destination: 'myfoods' | 'thisweek' }): void {
    const { food, destination } = event;
    const target = destination === 'myfoods' ? this.myFoodsLocal : this.thisWeekLocal;
    if (target().some(f => f.id === food.id)) {
      this.notificationService.show('Already in list', 'info');
      return;
    }
    target.update(list => [...list, food]);
    this.notificationService.show(
      `Added to ${destination === 'myfoods' ? 'My Foods' : 'This Week'}`,
      'success',
    );
  }

  // ----- Per-row actions -----

  toggleFavorite(event: Event, foodId: number): void {
    event.stopPropagation();
    this.preferencesService.toggleFavoriteLocal(foodId);
  }

  toggleRestricted(event: Event, foodId: number): void {
    event.stopPropagation();
    this.preferencesService.toggleRestrictedLocal(foodId);
  }

  removeFromMyFoods(event: Event, foodId: number): void {
    event.stopPropagation();
    this.myFoodsLocal.update(list => list.filter(f => f.id !== foodId));
  }

  removeFromThisWeek(event: Event, foodId: number): void {
    event.stopPropagation();
    this.thisWeekLocal.update(list => list.filter(f => f.id !== foodId));
  }

  // ----- Draggable splitter -----

  onSplitterMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.splitterStartY = event.clientY;
    this.splitterStartHeight = this.bottomPaneHeight();
    const onMove = (e: MouseEvent) => {
      const delta = this.splitterStartY - e.clientY;
      this.bottomPaneHeight.set(this.clampPaneHeight(this.splitterStartHeight + delta));
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
    this.splitterStartHeight = this.bottomPaneHeight();
    const onMove = (e: TouchEvent) => {
      const delta = this.splitterStartY - e.touches[0].clientY;
      this.bottomPaneHeight.set(this.clampPaneHeight(this.splitterStartHeight + delta));
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onEnd);
  }

  private clampPaneHeight(px: number): number {
    return Math.max(80, Math.min(px, 600));
  }

  // ----- localStorage helpers -----

  private loadLocal(key: string): Food[] {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Food[]) : [];
    } catch {
      return [];
    }
  }

  private saveLocal(key: string, foods: Food[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(foods));
    } catch {
      // quota or disabled storage — silently swallow
    }
  }

  showAddDialog = signal(false);
  isSubmitting = signal(false);
  sourceFoodId = signal<number | null>(null);

  // File objects for upload to yeh-image
  productImageFile = signal<File | null>(null);
  nutritionImageFile = signal<File | null>(null);

  // Local previews (object URLs)
  productImagePreview = signal<string | null>(null);
  nutritionImagePreview = signal<string | null>(null);

  servingUnits = SERVING_UNITS;

  newFood: Partial<CreateUserFoodRequest> = this.emptyFood();

  private emptyFood(): Partial<CreateUserFoodRequest> {
    return {
      description: '',
      shortDescription: '',
      servingUnit: 'whole',
      servingGramsPerUnit: 0,
      productPurchaseLink: '',
      shareCandidate: false,
      calories: 0,
      proteinG: 0,
      totalFatG: 0,
      sodiumMG: 0,
      totalCarbohydrateG: 0,
      dietaryFiberG: 0
    };
  }

  canSubmit(): boolean {
    return !!(this.newFood.description && this.newFood.calories !== undefined);
  }

  openAddDialog(): void {
    this.newFood = this.emptyFood();
    this.sourceFoodId.set(null);
    this.clearImage('product');
    this.clearImage('nutrition');
    this.foodsService.loadCategories().then(cats => {
      this.categories.set(cats);
      this.cdr.markForCheck();
    });
    this.showAddDialog.set(true);
  }

  closeAddDialog(): void {
    this.revokePreviewUrls();
    this.showAddDialog.set(false);
  }

  onImageSelected(event: Event, type: 'product' | 'nutrition'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setImageFile(file, type);
    input.value = '';
  }

  onPaste(event: ClipboardEvent, type: 'product' | 'nutrition'): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        event.preventDefault();
        const file = items[i].getAsFile();
        if (file) this.setImageFile(file, type);
        return;
      }
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent, type: 'product' | 'nutrition'): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      this.setImageFile(file, type);
    }
  }

  clearImage(type: 'product' | 'nutrition'): void {
    if (type === 'product') {
      if (this.productImagePreview()) URL.revokeObjectURL(this.productImagePreview()!);
      this.productImageFile.set(null);
      this.productImagePreview.set(null);
    } else {
      if (this.nutritionImagePreview()) URL.revokeObjectURL(this.nutritionImagePreview()!);
      this.nutritionImageFile.set(null);
      this.nutritionImagePreview.set(null);
    }
  }

  private setImageFile(file: File, type: 'product' | 'nutrition'): void {
    const previewUrl = URL.createObjectURL(file);
    if (type === 'product') {
      if (this.productImagePreview()) URL.revokeObjectURL(this.productImagePreview()!);
      this.productImageFile.set(file);
      this.productImagePreview.set(previewUrl);
    } else {
      if (this.nutritionImagePreview()) URL.revokeObjectURL(this.nutritionImagePreview()!);
      this.nutritionImageFile.set(file);
      this.nutritionImagePreview.set(previewUrl);
    }
    this.cdr.markForCheck();
  }

  private revokePreviewUrls(): void {
    if (this.productImagePreview()) URL.revokeObjectURL(this.productImagePreview()!);
    if (this.nutritionImagePreview()) URL.revokeObjectURL(this.nutritionImagePreview()!);
    this.productImageFile.set(null);
    this.nutritionImageFile.set(null);
    this.productImagePreview.set(null);
    this.nutritionImagePreview.set(null);
  }

  async submitFood(): Promise<void> {
    if (!this.canSubmit()) return;
    this.isSubmitting.set(true);

    try {
      // 1. Create the UserFood record (no image data — just metadata + nutrition)
      const req = { ...this.newFood } as CreateUserFoodRequest;
      delete (req as any).foodImage;
      delete (req as any).nutritionFactsImage;

      const result = await this.userFoodService.createUserFood(req);
      if (!result) {
        this.notificationService.show('Failed to add food', 'error');
        return;
      }

      const foodId = result.id;

      // 2. Upload images to yeh-image service (source=user)
      const uploads: Promise<unknown>[] = [];

      if (this.productImageFile()) {
        uploads.push(
          this.imageUploadService.uploadProductImage(foodId, this.productImageFile()!).catch(() => {
            this.notificationService.show('Food added, but product image upload failed', 'warning');
          })
        );
      }

      if (this.nutritionImageFile()) {
        uploads.push(
          this.imageUploadService.uploadNutritionImage(foodId, this.nutritionImageFile()!).catch(() => {
            this.notificationService.show('Food added, but nutrition label upload failed', 'warning');
          })
        );
      }

      await Promise.all(uploads);

      this.notificationService.show('Food added', 'success');
      this.closeAddDialog();

      // Surface the newly-added food in the spinner immediately by switching to MyFoods
      this.spinSource.set('myfoods');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  testProductLink(): void {
    const url = this.newFood.productPurchaseLink;
    if (url) {
      window.open(url, '_blank', 'noopener');
    }
  }

  closePanel(): void {
    this.tabService.closeTab('foods');
  }

  // ---- Spin carousel ----

  isCategoryActive(cat: string): boolean {
    return this.selectedCategories().has(cat);
  }

  toggleCategory(cat: string): void {
    this.selectedCategories.update(set => {
      const next = new Set(set);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  private loadRequestId = 0;
  private async loadCarouselFoods(source: SpinSource, cats: Set<string>): Promise<void> {
    if (cats.size === 0) {
      this.rawCarouselFoods.set([]);
      return;
    }

    const reqId = ++this.loadRequestId;
    try {
      let foods: Food[] = [];
      if (source === 'yeh-approved') {
        const resp = await firstValueFrom(this.foodsService.searchYehApprovedFoods(500));
        foods = resp?.foods ?? [];
      } else if (source === 'myfoods') {
        foods = await firstValueFrom(this.preferencesService.getAllowedFoodsFull());
      } else {
        foods = await firstValueFrom(this.preferencesService.getRestrictedFoodsFull());
      }

      // Stale-result guard: discard if a newer load has started
      if (reqId !== this.loadRequestId) return;

      // Intersect with pressed categories (skip filter when all are pressed)
      if (cats.size < CAROUSEL_CATEGORIES.length) {
        foods = foods.filter(f => cats.has(f.categoryName ?? ''));
      }

      this.rawCarouselFoods.set(foods);
    } catch {
      if (reqId !== this.loadRequestId) return;
      this.notificationService.show('Failed to load foods for spin', 'error');
      this.rawCarouselFoods.set([]);
    }
  }
}
