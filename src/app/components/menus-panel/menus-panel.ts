// src/app/components/menus-panel/menus-panel.ts
//
// Tab root for the Menus surface. Hosts the menu-card row (menu picker) above
// the menus-meals grid (the selected menu's meal slots). All state comes from
// RotationService — Phase 0 is mock-backed.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RotationService } from '../../services/rotation.service';
import { MenuCardRowComponent } from '../menu-card-row/menu-card-row';
import { MenusMealsComponent } from '../menus-meals/menus-meals';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';

@Component({
  selector: 'app-menus-panel',
  imports: [MenuCardRowComponent, MenusMealsComponent, MatDialogModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Thin raised toolbar, pinned above the menu-card row. Left ~2/3 is
           reserved for future controls; the Wipe key sits ~2/3 across. -->
      <div class="menus-toolbar">
        <button
          type="button"
          class="wipe-btn"
          matTooltip="Clears all menus and unsaved meals so you can start fresh."
          (click)="openWipeConfirm()">
          Wipe
        </button>
      </div>

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
  private dialog = inject(MatDialog);

  /** Open the dark confirm dialog. No real wipe yet — the dialog's buttons
   *  all close to a no-op this phase (endpoint not wired). */
  openWipeConfirm(): void {
    this.dialog.open(WipeConfirmDialogComponent, { panelClass: 'wipe-dialog-panel' });
  }
}
