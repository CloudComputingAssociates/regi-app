// src/app/components/food-picker/food-picker.ts
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FoodsListComponent, AddFoodEvent } from '../foods-list/foods-list';
import { FoodsService } from '../../services/foods.service';
import { Food } from '../../models/food.model';

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
  private foodsService = inject(FoodsService);

  // Inputs
  mealPlanId = input<string>('');
  isOpen = input<boolean>(false);
  showNameField = input<boolean>(false);

  // Outputs
  foodAdded = output<{ foodId: number; amount: number; unit: string }>();
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
    // Default serving: use servingSize if available, otherwise 100g
    const amount = nf?.servingSizeG ?? 100;
    const unit = 'g';

    this.foodAdded.emit({
      foodId: food.id,
      amount,
      unit
    });
  }
}
