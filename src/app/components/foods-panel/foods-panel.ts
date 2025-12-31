// src/app/components/foods-panel/foods-panel.ts
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FoodsComponent, SelectedFoodEvent, AddFoodEvent } from '../foods/foods';
import { SelectedFoodsComponent, RemoveFoodEvent } from '../selected-foods/selected-foods';
import { Food } from '../../models/food.model';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-foods-panel',
  imports: [CommonModule, FoodsComponent, SelectedFoodsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="foods-panel-container">
      <!-- Close button -->
      <button type="button" class="close-btn" (click)="closePanel()">✕</button>

      <!-- Top 1/4 - Reserved for filters and selected food display -->
      <div class="foods-panel-header">
        <div class="header-placeholder">
          <p class="header-text">Filters & Selected Food Display</p>
          <p class="header-subtext">(Coming soon)</p>
        </div>

        <!-- Blue description label at bottom of header -->
        @if (selectedDescription()) {
          <div class="selected-description">
            {{ selectedDescription() }}
          </div>
        }
      </div>

      <!-- Bottom 3/4 - Foods search component (left) and selected foods (right) -->
      <div class="foods-panel-content">
        <app-foods
          [mode]="'search'"
          (selectedFood)="onFoodSelected($event)"
          (addFood)="onAddFood($event)" />

        <app-selected-foods
          [foods]="selectedFoods()"
          (removeFood)="onRemoveFood($event)" />
      </div>
    </div>
  `,
  styleUrls: ['./foods-panel.scss']
})
export class FoodsPanelComponent {
  private tabService = inject(TabService);
  selectedDescription = signal<string>('');
  selectedFoods = signal<Food[]>([]);

  closePanel(): void {
    this.tabService.closeTab('foods');
  }

  onFoodSelected(event: SelectedFoodEvent): void {
    console.log('Food selected:', event);
    console.log('Description:', event.description);
    console.log('Protein:', event.protein, 'g');
    console.log('Carbs:', event.carbs, 'g');
    console.log('Fat:', event.fat, 'g');
    console.log('Fiber:', event.fiber, 'g');

    // Update the selected description
    this.selectedDescription.set(event.description);
  }

  onAddFood(event: AddFoodEvent): void {
    this.addToSelectedFoods(event.food);
  }

  onRemoveFood(event: RemoveFoodEvent): void {
    this.removeFromSelectedFoods(event.food);
  }

  private addToSelectedFoods(food: Food): void {
    // Check if food is already in selected foods (prevent duplicates)
    const currentFoods = this.selectedFoods();
    const alreadyExists = currentFoods.some(f => f.id === food.id);

    if (!alreadyExists) {
      this.selectedFoods.set([...currentFoods, food]);
      console.log('Added food to selected foods:', food.description);
    } else {
      console.log('Food already in selected foods:', food.description);
    }
  }

  private removeFromSelectedFoods(food: Food): void {
    const currentFoods = this.selectedFoods();
    const updatedFoods = currentFoods.filter(f => f.id !== food.id);
    this.selectedFoods.set(updatedFoods);
    console.log('Removed food from selected foods:', food.description);
  }
}
