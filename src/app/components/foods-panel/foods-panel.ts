// src/app/components/foods-panel/foods-panel.ts
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { FoodsListComponent, SelectedFoodEvent, FoodNotFoundEvent } from '../foods-list/foods-list';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { UserFoodService } from '../../services/user-food.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { FoodsService, Category } from '../../services/foods.service';
import { TabService } from '../../services/tab.service';
import { CreateUserFoodRequest } from '../../models/user-food.model';

const SERVING_UNITS = ['whole', 'cup', 'tbsp', 'tsp', 'oz', 'lbs', 'g'];

@Component({
  selector: 'app-foods-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule, FoodsListComponent],
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

      <div class="foods-content">
        <app-foods-list
          [mode]="'search'"
          [showAiButton]="false"
          [showPreferenceIcons]="true"
          [showFilterRadios]="true"
          (selectedFood)="onFoodSelected($event)"
          (foodNotFound)="onFoodNotFound($event)" />
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
    } finally {
      this.isSubmitting.set(false);
    }
  }

  closePanel(): void {
    this.tabService.closeTab('foods');
  }

  onFoodSelected(event: SelectedFoodEvent): void {
    console.log('Food selected in Foods tab:', event.description);
  }

  onFoodNotFound(event: FoodNotFoundEvent): void {
    this.newFood = this.emptyFood();
    this.clearImage('product');
    this.clearImage('nutrition');

    // Ensure categories are loaded for the dropdown
    this.foodsService.loadCategories().then(cats => {
      this.categories.set(cats);

      if (event.suggestedFood) {
        // Map categoryName to categoryId
        const catName = event.suggestedFood.categoryName;
        if (catName) {
          const match = cats.find(c => c.name === catName);
          if (match) this.newFood.categoryId = match.id;
        }
        // Default to first category if no match
        if (!this.newFood.categoryId && cats.length > 0) {
          this.newFood.categoryId = cats[0].id;
        }
      } else if (cats.length > 0) {
        this.newFood.categoryId = cats[0].id;
      }

      this.cdr.markForCheck();
    });

    if (event.suggestedFood) {
      const f = event.suggestedFood;
      this.sourceFoodId.set(f.id);
      const nf = f.nutritionFacts;
      this.newFood.description = f.description;
      this.newFood.shortDescription = f.shortDescription || '';
      this.newFood.calories = nf?.calories ?? 0;
      this.newFood.proteinG = nf?.proteinG ?? 0;
      this.newFood.totalFatG = nf?.totalFatG ?? 0;
      this.newFood.totalCarbohydrateG = nf?.totalCarbohydrateG ?? 0;
      this.newFood.dietaryFiberG = nf?.dietaryFiberG ?? 0;
      this.newFood.sodiumMG = nf?.sodiumMG ?? 0;
      this.newFood.servingUnit = 'g';
      this.newFood.servingGramsPerUnit = nf?.servingSizeG ?? 0;
    } else {
      this.newFood.description = event.searchQuery;
    }

    this.showAddDialog.set(true);
  }
}
