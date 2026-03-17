// src/app/components/progress-panel/progress-panel.ts (Week Plan panel)
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-week-plan-panel',
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
      </div>

      <!-- Main content area -->
      <div class="panel-content">
        <div class="content-placeholder">
          <p class="placeholder-text">Week Plan</p>
          <p class="placeholder-subtext">Plan and track your weekly meals</p>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./progress-panel.scss']
})
export class WeekPlanPanelComponent {
  private tabService = inject(TabService);

  close(): void {
    this.tabService.closeTab('review');
  }
}
