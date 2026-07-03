// src/app/components/menus-panel/menus-panel.ts
//
// Tab root for the Menus surface. Hosts the menu-card row (menu picker) above
// the menus-meals grid (the selected menu's meal slots). All state comes from
// RotationService — Phase 0 is mock-backed.
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { RotationService } from '../../services/rotation.service';
import { MenuCardRowComponent } from '../menu-card-row/menu-card-row';
import { MenusMealsComponent } from '../menus-meals/menus-meals';
import { MealBinderComponent } from '../meal-binder/meal-binder';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';

@Component({
  selector: 'app-menus-panel',
  imports: [
    MenuCardRowComponent,
    MenusMealsComponent,
    MealBinderComponent,
    MatDialogModule,
    MatTooltipModule,
    DragDropModule,
  ],
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
          <button type="button" class="state-btn" (click)="rotation.startEmptyPlan()">Start a plan</button>
        </div>
      } @else {
        <!-- Flex row: board (toolbar + menu-card-row + meals) on the left,
             Meals binder on the right. cdkDropListGroup connects the binder's
             draggable meal cards to the empty-slot drop targets in the board. -->
        <div class="menus-layout" cdkDropListGroup>
          <div class="menus-main">
            <!-- Thin raised toolbar, pinned above the menu-card row. People
                 (persisted) sits far-left; Wipe sits ~2/3 across. -->
            <div class="menus-toolbar">
              <div class="people-control">
                <span class="people-label">People</span>
                <button
                  type="button"
                  class="people-step"
                  matTooltip="Fewer people"
                  [disabled]="rotation.persons() <= 1"
                  (click)="rotation.setPersons(rotation.persons() - 1)">
                  −
                </button>
                <span class="people-count">{{ rotation.persons() }}</span>
                <button
                  type="button"
                  class="people-step"
                  matTooltip="More people"
                  [disabled]="rotation.persons() >= 12"
                  (click)="rotation.setPersons(rotation.persons() + 1)">
                  +
                </button>
              </div>

              <span class="toolbar-spacer"></span>

              <button
                type="button"
                class="wipe-btn"
                matTooltip="Deletes all meals from the selected menu (the menu stays, its slots go empty)."
                (click)="openWipeConfirm()">
                Wipe menu
              </button>

              <span class="toolbar-spacer-tail"></span>
            </div>

            <app-menu-card-row
              [menus]="rotation.menus()"
              [selectedMenuId]="rotation.selectedMenuId() ?? -1"
              [spanDays]="rotation.rotation()!.spanDays"
              (select)="rotation.selectMenu($event)"
              (deleteMenu)="rotation.removeOrClearMenu($event)"
              (addMenu)="rotation.addMenu()"
              (setDays)="rotation.setMenuDays($event.menuId, $event.plannedCount)" />

            <div class="panel-body">
              <app-menus-meals [menu]="rotation.selectedMenu()" />
            </div>
          </div>

          <app-meal-binder />
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
