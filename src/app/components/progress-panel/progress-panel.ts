// src/app/components/progress-panel/progress-panel.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-progress-panel',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Action buttons - top right (X only for Progress) -->
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
          <p class="placeholder-text">Progress</p>
          <p class="placeholder-subtext">Track your nutrition journey</p>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./progress-panel.scss']
})
export class ProgressPanelComponent {
  private tabService = inject(TabService);

  close(): void {
    this.tabService.closeTab('review');
  }
}
