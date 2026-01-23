// src/app/components/shopping-panel/shopping-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-shopping-panel',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Action buttons - top right -->
      <div class="action-buttons">
        <button
          class="icon-btn close-btn"
          (click)="close()"
          title="Close">
          ✕
        </button>
        <button
          class="icon-btn save-btn"
          [class.has-changes]="hasChanges()"
          (click)="saveAndClose()"
          title="Save and close">
          ✓
        </button>
      </div>

      <!-- Main content area -->
      <div class="panel-content">
        <div class="content-placeholder">
          <p class="placeholder-text">Shopping List</p>
          <p class="placeholder-subtext">Your grocery list based on meal plans</p>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./shopping-panel.scss']
})
export class ShoppingPanelComponent {
  private tabService = inject(TabService);

  private changesExist = signal(false);

  hasChanges(): boolean {
    return this.changesExist();
  }

  close(): void {
    this.tabService.closeTab('shop');
  }

  saveAndClose(): void {
    // TODO: Implement save logic when shopping list data exists
    this.changesExist.set(false);
    this.tabService.closeTab('shop');
  }
}
