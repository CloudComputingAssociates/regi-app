// src/app/components/food-picker/food-picker.ts
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FoodsListComponent, AddFoodEvent } from '../foods-list/foods-list';
import { FoodAmountEditorComponent, FoodAmountUpdate } from '../food-amount-editor/food-amount-editor';
import { Food, NutritionFacts } from '../../models/food.model';
import { MealItem } from '../../models/planning.model';

export interface FoodPickerAddEvent {
  food: Food;
  amount: number;   // always in grams
  unit: string;
}

// Weight-to-weight conversions (always valid, no density needed)
const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  oz: 28.3495,
  lbs: 453.592,
};

@Component({
  selector: 'app-food-picker',
  imports: [CommonModule, MatIconModule, FoodsListComponent, FoodAmountEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="picker-backdrop"
      [style.display]="isOpen() ? 'flex' : 'none'"
      (click)="onBackdropClick()">

      <div class="picker-panel" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="picker-header">
          <span class="picker-title">Add Food</span>
          <button class="close-btn" (click)="onClose()" aria-label="Close">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <!-- Foods list (reused component) -->
        <div class="picker-body">
          <app-foods-list
            mode="search"
            [showAiButton]="false"
            [showPreferenceIcons]="false"
            [showFilterRadios]="false"
            (addFood)="onFoodSelected($event)" />
        </div>
      </div>
    </div>

    <!-- Amount editor overlay -->
    <app-food-amount-editor
      [isOpen]="editorOpen()"
      [item]="editorItem()"
      [itemIndex]="0"
      [nutritionFacts]="editorNutritionFacts()"
      [baseServingSizeG]="editorBaseServingG()"
      titlePrefix="ADD"
      (amountChanged)="onAmountConfirmed($event)"
      (closed)="closeEditor()" />
  `,
  styleUrls: ['./food-picker.scss']
})
export class FoodPickerComponent {
  // Inputs
  mealPlanId = input<string>('');
  isOpen = input<boolean>(false);
  showNameField = input<boolean>(false);

  // Outputs
  foodAdded = output<FoodPickerAddEvent>();
  closed = output<void>();

  // Editor state
  editorOpen = signal(false);
  editorItem = signal<MealItem | null>(null);
  editorNutritionFacts = signal<NutritionFacts | null>(null);
  editorBaseServingG = signal(100);
  private pendingFood: Food | null = null;

  onBackdropClick(): void {
    this.onClose();
  }

  onClose(): void {
    this.closed.emit();
  }

  onFoodSelected(event: AddFoodEvent): void {
    const food = event.food;
    const nf = food.nutritionFacts;
    const unit = food.servingUnit ?? 'g';
    const gramsPerUnit = food.servingGramsPerUnit ?? nf?.servingSizeG ?? 100;

    // Default quantity
    let defaultQty = 1;
    if (unit === 'g') {
      defaultQty = nf?.servingSizeG ?? 100;
    }

    // Build a temporary MealItem for the editor
    const tempItem: MealItem = {
      foodId: food.id,
      foodName: food.description,
      shortDescription: food.shortDescription ?? undefined,
      quantity: defaultQty,
      unit,
      calories: nf?.calories,
      proteinG: nf?.proteinG,
      fatG: nf?.totalFatG,
      carbG: nf?.totalCarbohydrateG,
      fiberG: nf?.dietaryFiberG,
      sodiumMg: nf?.sodiumMG,
      servingSizeG: nf?.servingSizeG,
      servingGramsPerUnit: food.servingGramsPerUnit ?? undefined,
      foodImageThumbnail: food.foodImageThumbnail ?? undefined,
      categoryName: food.categoryName ?? undefined,
      productPurchaseLink: food.productPurchaseLink ?? undefined,
    };

    const baseServingG = defaultQty * (unit in WEIGHT_TO_GRAMS ? WEIGHT_TO_GRAMS[unit] : gramsPerUnit);

    this.pendingFood = food;
    this.editorItem.set(tempItem);
    this.editorNutritionFacts.set(nf ?? null);
    this.editorBaseServingG.set(baseServingG);
    this.editorOpen.set(true);
  }

  onAmountConfirmed(event: FoodAmountUpdate): void {
    if (!this.pendingFood) return;

    this.foodAdded.emit({
      food: this.pendingFood,
      amount: event.quantityG,
      unit: event.displayUnit,
    });

    this.closeEditor();
  }

  closeEditor(): void {
    this.editorOpen.set(false);
    this.pendingFood = null;
  }
}
