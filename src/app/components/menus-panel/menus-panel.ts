// src/app/components/menus-panel/menus-panel.ts
//
// Tab root for the Menus surface. Hosts the menu-card row (menu picker) above
// the menus-meals grid (the selected menu's meal slots). All state comes from
// RotationService — Phase 0 is mock-backed.
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
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
      @if (rotation.loading()) {
        <div class="state-center">
          <div class="spinner" aria-label="Loading"></div>
        </div>
      } @else if (rotation.error()) {
        <div class="state-center">
          <p class="state-msg error">{{ rotation.error() }}</p>
          <button type="button" class="state-btn" (click)="rotation.loadCurrentRotation()">Retry</button>
        </div>
      } @else if (rotation.rotation() === null) {
        <div class="state-center">
          <p class="state-msg">No plan yet</p>
          <button type="button" class="state-btn" (click)="rotation.generateDefault()">Generate a plan</button>
        </div>
      } @else {
        <!-- Thin raised toolbar, pinned above the menu-card row. Only shown
             when a plan is loaded so Wipe never appears with nothing to act on.
             Left ~2/3 is reserved for future controls; Wipe sits ~2/3 across. -->
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
          [menus]="rotation.menus()"
          [selectedMenuId]="rotation.selectedMenuId() ?? -1"
          [spanDays]="rotation.rotation()!.spanDays"
          (select)="rotation.selectMenu($event)" />

        <div class="panel-body">
          <app-menus-meals [menu]="rotation.selectedMenu()" />
        </div>
      }
    </div>
  `,
  styleUrls: ['./menus-panel.scss'],
})
export class MenusPanelComponent implements OnInit {
  readonly rotation = inject(RotationService);
  private dialog = inject(MatDialog);

  ngOnInit(): void {
    // Reload-on-mount: the server is the source of truth for the rotation.
    this.rotation.loadCurrentRotation();
  }

  /** Open the dark confirm dialog. No real wipe yet — the dialog's buttons
   *  all close to a no-op this phase (endpoint not wired). */
  openWipeConfirm(): void {
    this.dialog.open(WipeConfirmDialogComponent, { panelClass: 'wipe-dialog-panel' });
  }
}
