// src/app/components/menu-plan-panel/menu-plan-panel.ts
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-menu-plan-panel',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <div class="panel-header">
        <span class="page-title">Menu Plan</span>
        <span class="brand">RegiMenu<sup class="sm">SM</sup></span>
      </div>
      <div class="panel-body"></div>
    </div>
  `,
  styleUrls: ['./menu-plan-panel.scss']
})
export class MenuPlanPanelComponent {}
