// src/app/components/foods-panel/foods-panel.ts
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { FoodsListComponent, SelectedFoodEvent, FoodNotFoundEvent } from '../foods-list/foods-list';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { UserFoodService } from '../../services/user-food.service';
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
          class="icon-btn save-btn"
          [class.has-changes]="preferencesService.hasUnsavedChanges()"
          (click)="save()"
          [disabled]="!preferencesService.hasUnsavedChanges() || isSaving()"
          matTooltip="Save"
          matTooltipPosition="above"
          [matTooltipShowDelay]="300">
          ✓
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
              <button class="dialog-close" (click)="closeAddDialog()">✕</button>
            </div>

            <div class="dialog-body">
              <div class="form-row">
                <label>Description <span class="required">*</span></label>
                <input type="text" class="form-input" [(ngModel)]="newFood.description" placeholder="e.g., Organic Greek Yogurt" />
              </div>

              <div class="form-row">
                <label>Short Description</label>
                <input type="text" class="form-input" [(ngModel)]="newFood.shortDescription" placeholder="e.g., Greek Yogurt" />
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
                  <input type="number" class="form-input" [(ngModel)]="newFood.gramsPerServingUnit" placeholder="0" />
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
                  <div class="drop-zone" (click)="productImageInput.click()">
                    @if (newFood.foodImage) {
                      <img [src]="newFood.foodImage" alt="" class="preview-img" />
                    } @else {
                      <img src="/images/food-placeholder.png" alt="" class="preview-img placeholder" />
                      <span class="drop-hint">Click or drop image</span>
                    }
                  </div>
                  <input #productImageInput type="file" accept="image/*" capture="environment" hidden
                    (change)="onImageSelected($event, 'foodImage')" />
                </div>

                <div class="image-upload">
                  <label>Nutrition Facts Label</label>
                  <div class="drop-zone" (click)="nutritionImageInput.click()">
                    @if (newFood.nutritionFactsImage) {
                      <img [src]="newFood.nutritionFactsImage" alt="" class="preview-img" />
                    } @else {
                      <span class="drop-hint">Click or drop image</span>
                    }
                  </div>
                  <input #nutritionImageInput type="file" accept="image/*" capture="environment" hidden
                    (change)="onImageSelected($event, 'nutritionFactsImage')" />
                </div>
              </div>

              <div class="share-row">
                <label class="share-check">
                  <input type="checkbox" [(ngModel)]="newFood.shareWithCommunity" />
                  <span>Share with community</span>
                </label>
              </div>
            </div>

            <div class="dialog-footer">
              <button class="cancel-btn" (click)="closeAddDialog()">Cancel</button>
              <button class="submit-btn" [disabled]="!canSubmit() || isSubmitting()"
                (click)="submitFood()">
                @if (isSubmitting()) {
                  Adding...
                } @else {
                  Add Food
                }
              </button>
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

  isSaving = signal(false);
  showAddDialog = signal(false);
  isSubmitting = signal(false);

  servingUnits = SERVING_UNITS;

  newFood: Partial<CreateUserFoodRequest> = this.emptyFood();

  private emptyFood(): Partial<CreateUserFoodRequest> {
    return {
      description: '',
      shortDescription: '',
      servingUnit: 'whole',
      gramsPerServingUnit: 0,
      shareWithCommunity: false,
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
    this.showAddDialog.set(true);
  }

  closeAddDialog(): void {
    this.showAddDialog.set(false);
  }

  onImageSelected(event: Event, field: 'foodImage' | 'nutritionFactsImage'): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      (this.newFood as any)[field] = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async submitFood(): Promise<void> {
    if (!this.canSubmit()) return;
    this.isSubmitting.set(true);

    const req = this.newFood as CreateUserFoodRequest;
    const result = await this.userFoodService.createUserFood(req);

    this.isSubmitting.set(false);
    if (result) {
      this.notificationService.show('Food added', 'success');
      this.closeAddDialog();
    } else {
      this.notificationService.show('Failed to add food', 'error');
    }
  }

  closePanel(): void {
    this.tabService.closeTab('foods');
  }

  save(): void {
    if (!this.preferencesService.hasUnsavedChanges()) return;

    this.isSaving.set(true);
    this.preferencesService.saveAllChanges().subscribe({
      next: () => {
        this.isSaving.set(false);
        this.notificationService.show('Food preferences saved', 'success');
      },
      error: () => {
        this.isSaving.set(false);
        this.notificationService.show('Failed to save food preferences', 'error');
      }
    });
  }

  onFoodSelected(event: SelectedFoodEvent): void {
    console.log('Food selected in Foods tab:', event.description);
  }

  onFoodNotFound(event: FoodNotFoundEvent): void {
    this.newFood = this.emptyFood();
    this.newFood.description = event.searchQuery;
    this.showAddDialog.set(true);
  }
}
