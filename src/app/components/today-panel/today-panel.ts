// src/app/components/today-panel/today-panel.ts
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-today-panel',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Today content placeholder -->
      <div class="today-placeholder">
        Today — coming soon
      </div>
    </div>
  `,
  styleUrls: ['./today-panel.scss']
})
export class TodayPanelComponent {
}
