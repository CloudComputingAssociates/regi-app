// src/app/components/menus-panel/menus-panel.ts
//
// Tab root for the Menus surface. Hosts the menus strip (menu picker) above
// the menu canvas (the selected menu's meal slots). All state comes from
// RotationService — Phase 0 is mock-backed.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RotationService } from '../../services/rotation.service';
import { MenusStripComponent } from './menus-strip';
import { MenuCanvasComponent } from './menu-canvas';

@Component({
  selector: 'app-menus-panel',
  imports: [MenusStripComponent, MenuCanvasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <app-menus-strip
        [menus]="rotation.rotation().menus"
        [selectedMenuId]="rotation.selectedMenuId()"
        [spanDays]="rotation.rotation().spanDays"
        (select)="rotation.selectMenu($event)" />

      <div class="panel-body">
        <app-menu-canvas [menu]="rotation.selectedMenu()" />
      </div>
    </div>
  `,
  styleUrls: ['./menus-panel.scss'],
})
export class MenusPanelComponent {
  readonly rotation = inject(RotationService);
}
