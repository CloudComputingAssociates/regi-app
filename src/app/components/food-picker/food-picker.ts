// src/app/components/food-picker/food-picker.ts
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FoodsListComponent, AddFoodEvent, SelectedFoodEvent } from '../foods-list/foods-list';
import { NutritionFactsLabelComponent } from '../nutrition-facts-label/nutrition-facts-label';
import { Food, NutritionFacts } from '../../models/food.model';

export interface FoodPickerAddEvent {
  food: Food;
  amount: number;   // always in grams
  unit: string;
}

type EditorUnit = 'g' | 'oz' | 'lbs' | 'cup' | 'tsp' | 'tbsp' | 'ml' | 'whole';

const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1, oz: 28.3495, lbs: 453.592,
};

const WEIGHT_UNITS: EditorUnit[] = ['g', 'oz', 'lbs'];
const FOOD_SPECIFIC_UNITS: EditorUnit[] = ['whole', 'cup', 'tsp', 'tbsp', 'ml'];

@Component({
  selector: 'app-food-picker',
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, FoodsListComponent, NutritionFactsLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="picker-backdrop"
      [style.display]="isOpen() ? 'flex' : 'none'"
      >

      <div class="picker-panel">
        <!-- Header -->
        <div class="picker-header">
          <span class="picker-title">Add Food</span>
          <div class="picker-header-actions">
            <button class="add-btn"
              [disabled]="!selectedFood()"
              (click)="onAddClick()"
              matTooltip="Add food to meal"
              matTooltipPosition="below"
              aria-label="Add food to meal">
              <mat-icon>check</mat-icon>
            </button>
            <button class="close-btn" (click)="onClose()" aria-label="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>

        <!-- Foods list (fixed height) -->
        <div class="picker-list">
          <app-foods-list
            mode="search"
            [showAiButton]="false"
            [showPreferenceIcons]="false"
            [showFilterRadios]="false"
            (selectedFood)="onFoodSelected($event)"
            (addFood)="onFoodAdded($event)" />
        </div>

        <!-- QTY / Units / Nutrition (shown when a food is selected) -->
        @if (selectedFood()) {
          <div class="picker-details">
            <div class="qty-row">
              <label class="qty-label">QTY:</label>
              <input
                type="number"
                class="qty-input"
                [ngModel]="displayQty()"
                (ngModelChange)="onQtyChange($event)"
                min="0"
                step="0.5" />
              <select class="unit-select" [ngModel]="selectedUnit()" (ngModelChange)="onUnitChange($event)">
                @for (u of availableUnits(); track u) {
                  <option [ngValue]="u">{{ u }}</option>
                }
              </select>
            </div>
            <div class="nf-scroll">
              <yeh-nutrition-label
                [nutritionFacts]="selectedFood()!.nutritionFacts ?? null"
                [scale]="scale()"
                [displayUnit]="selectedUnit()"
                [displayQuantity]="displayQty()" />
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./food-picker.scss']
})
export class FoodPickerComponent {
  mealPlanId = input<string>('');
  isOpen = input<boolean>(false);
  showNameField = input<boolean>(false);

  foodAdded = output<FoodPickerAddEvent>();
  closed = output<void>();

  selectedFood = signal<Food | null>(null);
  displayQty = signal<number>(1);
  selectedUnit = signal<EditorUnit>('whole');

  private gramsPerUnit = 100;

  availableUnits = computed<EditorUnit[]>(() => {
    const food = this.selectedFood();
    const units: EditorUnit[] = [...WEIGHT_UNITS];
    const foodUnit = (food?.servingUnit as EditorUnit) || null;
    const hasGpu = food?.servingGramsPerUnit != null && food.servingGramsPerUnit > 0;

    if (foodUnit && hasGpu && FOOD_SPECIFIC_UNITS.includes(foodUnit) && !units.includes(foodUnit)) {
      units.unshift(foodUnit);
    }
    return units;
  });

  scale = computed(() => {
    const qty = this.displayQty();
    const unit = this.selectedUnit();
    const gpuFactor = unit in WEIGHT_TO_GRAMS ? WEIGHT_TO_GRAMS[unit] : this.gramsPerUnit;
    const totalG = qty * gpuFactor;
    // Nutrition data is stored normalized to per-100g
    return totalG / 100;
  });

  onClose(): void {
    this.selectedFood.set(null);
    this.closed.emit();
  }

  onFoodSelected(event: SelectedFoodEvent): void {
    const food = event.food;
    const nf = food.nutritionFacts;
    const unit = (food.servingUnit as EditorUnit) || 'g';

    this.gramsPerUnit = food.servingGramsPerUnit ?? nf?.servingSizeG ?? 100;

    let defaultQty = 1;
    if (unit === 'g') {
      defaultQty = nf?.servingSizeG ?? 100;
    }

    this.selectedFood.set(food);
    this.selectedUnit.set(unit);
    this.displayQty.set(defaultQty);
  }

  onAddClick(): void {
    const food = this.selectedFood();
    if (!food) return;
    this.emitAdd(food);
  }

  onFoodAdded(event: AddFoodEvent): void {
    this.emitAdd(event.food);
  }

  private emitAdd(food: Food): void {
    const qty = this.displayQty();
    const unit = this.selectedUnit();
    const gpuFactor = unit in WEIGHT_TO_GRAMS ? WEIGHT_TO_GRAMS[unit] : this.gramsPerUnit;
    const amountG = qty * gpuFactor;

    this.foodAdded.emit({ food, amount: amountG, unit });
    // Stay open — reset selection for next add
    this.selectedFood.set(null);
  }

  onQtyChange(value: number): void {
    this.displayQty.set(value);
  }

  onUnitChange(unit: EditorUnit): void {
    this.selectedUnit.set(unit);
    // Reset qty to sensible default for new unit
    if (unit === 'g') {
      this.displayQty.set(this.selectedFood()?.nutritionFacts?.servingSizeG ?? 100);
    } else {
      this.displayQty.set(1);
    }
  }
}
