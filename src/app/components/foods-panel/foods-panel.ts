// src/app/components/foods-panel/foods-panel.ts
import { Component, ChangeDetectionStrategy, signal, inject, viewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FoodsListComponent, SelectedFoodEvent } from '../foods-list/foods-list';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-foods-panel',
  imports: [CommonModule, MatTooltipModule, FoodsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="foods-panel-container">
      <div class="action-buttons">
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
          (selectedFood)="onFoodSelected($event)" />
      </div>
    </div>
  `,
  styleUrls: ['./foods-panel.scss']
})
export class FoodsPanelComponent {
  private tabService = inject(TabService);
  protected preferencesService = inject(FoodPreferencesService);
  private notificationService = inject(NotificationService);

  private foodsList = viewChild(FoodsListComponent);

  isSaving = signal(false);

  constructor() {
    effect(() => {
      const comp = this.foodsList();
      if (comp) {
        this.tabService.updateTabBadge('foods', comp.totalCount());
      }
    });
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
}
