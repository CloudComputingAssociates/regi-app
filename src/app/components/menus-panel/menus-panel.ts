// src/app/components/menus-panel/menus-panel.ts
//
// Tab root for the Menus surface. Hosts the menu-card row (menu picker) above
// the menus-meals grid (the selected menu's meal slots). All state comes from
// RotationService — Phase 0 is mock-backed.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RotationService } from '../../services/rotation.service';
import { MenuCardRowComponent } from '../menu-card-row/menu-card-row';
import { MenusMealsComponent } from '../menus-meals/menus-meals';

@Component({
  selector: 'app-menus-panel',
  imports: [MenuCardRowComponent, MenusMealsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <app-menu-card-row
        [menus]="rotation.rotation().menus"
        [selectedMenuId]="rotation.selectedMenuId()"
        [spanDays]="rotation.rotation().spanDays"
        (select)="rotation.selectMenu($event)" />

      <div class="panel-body">
        <app-menus-meals [menu]="rotation.selectedMenu()" />
      </div>
    </div>
  `,
  styleUrls: ['./menus-panel.scss'],
})
export class MenusPanelComponent {
  readonly rotation = inject(RotationService);
}
