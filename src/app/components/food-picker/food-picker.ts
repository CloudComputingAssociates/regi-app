// src/app/components/food-picker/food-picker.ts
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FoodsListComponent, AddFoodEvent } from '../foods-list/foods-list';
import { Food } from '../../models/food.model';

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
  imports: [CommonModule, MatIconModule, FoodsListComponent],
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
            (addFood)="onFoodAdded($event)" />
        </div>
      </div>
    </div>
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

  onBackdropClick(): void {
    this.onClose();
  }

  onClose(): void {
    this.closed.emit();
  }

  onFoodAdded(event: AddFoodEvent): void {
    const food = event.food;
    const nf = food.nutritionFacts;
    const unit = food.servingUnit;

    if (unit && unit in WEIGHT_TO_GRAMS) {
      // Weight-based unit (oz, lbs, g): use constant, no ServingGramsPerUnit needed
      // Default to 1 unit worth of grams
      const amount = WEIGHT_TO_GRAMS[unit];
      this.foodAdded.emit({ food, amount, unit });
    } else if (unit && food.servingGramsPerUnit) {
      // Food-specific unit (whole, cup, tbsp, etc.): use stored grams-per-unit
      this.foodAdded.emit({ food, amount: food.servingGramsPerUnit, unit });
    } else {
      // No preferred unit: add one serving in grams
      const amount = nf?.servingSizeG ?? 100;
      this.foodAdded.emit({ food, amount, unit: 'g' });
    }
  }
}
