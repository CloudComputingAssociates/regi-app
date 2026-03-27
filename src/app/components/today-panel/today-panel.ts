// src/app/components/today-panel/today-panel.ts
import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NutritionTipService } from '../../services/nutrition-tip.service';

@Component({
  selector: 'app-today-panel',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      @if (tipService.tip(); as tip) {
        <div class="nutrition-tip-card">
          @if (tip.imageUrl) {
            <img [src]="tip.imageUrl" alt="" class="tip-thumbnail" />
          }
          <div class="tip-text">
            <a [href]="tip.articleUrl" target="_blank" rel="noopener" class="tip-title">
              {{ tip.title }}
            </a>
            <span class="tip-source">NutritionFacts.org — Daily Tip</span>
          </div>
        </div>
      }

      <!-- Today content placeholder -->
      <div class="today-placeholder">
        Today — coming soon
      </div>
    </div>
  `,
  styleUrls: ['./today-panel.scss']
})
export class TodayPanelComponent implements OnInit {
  tipService = inject(NutritionTipService);

  ngOnInit(): void {
    this.tipService.fetchTip();
  }
}
