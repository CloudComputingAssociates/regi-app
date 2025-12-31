// src/app/components/meal-planning/meal-planning.ts
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-meal-planning',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meal-planning-container">
      <div class="content-placeholder">
        <p class="placeholder-text">Meal Planning</p>
        <p class="placeholder-subtext">(Coming soon)</p>
      </div>
    </div>
  `,
  styleUrls: ['./meal-planning.scss']
})
export class MealPlanningComponent {}
