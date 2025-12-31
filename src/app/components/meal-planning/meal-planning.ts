// src/app/components/meal-planning/meal-planning.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-meal-planning',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meal-planning-container">
      <!-- Close button -->
      <button type="button" class="close-btn" (click)="closePanel()">✕</button>

      <div class="content-placeholder">
        <p class="placeholder-text">Meal Planning</p>
        <p class="placeholder-subtext">(Coming soon)</p>
      </div>
    </div>
  `,
  styleUrls: ['./meal-planning.scss']
})
export class MealPlanningComponent {
  private tabService = inject(TabService);

  closePanel(): void {
    this.tabService.closeTab('meal-planning');
  }
}
