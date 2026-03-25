// src/app/components/today-panel/today-panel.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-today-panel',
  imports: [CommonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <div class="panel-content">
        <!-- Action buttons -->
        <div class="action-buttons">
          <div class="action-right">
            <button
              class="icon-btn close-btn"
              (click)="close()"
              matTooltip="Close"
              matTooltipPosition="above"
              [matTooltipShowDelay]="300">
              ✕
            </button>
          </div>
        </div>

        <!-- Today content placeholder -->
        <div class="today-placeholder">
          Today — coming soon
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./today-panel.scss']
})
export class TodayPanelComponent {
  private tabService = inject(TabService);

  close(): void {
    this.tabService.closeTab('today');
  }
}
