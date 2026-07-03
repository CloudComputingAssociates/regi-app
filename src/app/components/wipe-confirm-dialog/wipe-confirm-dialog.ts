// src/app/components/wipe-confirm-dialog/wipe-confirm-dialog.ts
//
// Confirm dialog for the menus-panel "Wipe menu" action. Dark-themed Material
// dialog (opened with panelClass 'wipe-dialog-panel' — see src/styles.scss
// for the dark surface override so there's no white default flash).
//
// Confirming deletes every meal from the CURRENTLY SELECTED menu (the menu
// itself stays; its slots go empty). Wired to RotationService.clearMenuMeals.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { RotationService } from '../../services/rotation.service';

@Component({
  selector: 'app-wipe-confirm-dialog',
  imports: [MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wipe-dialog">
      <p class="wipe-dialog-prompt">
        Delete all meals from the selected menu? The menu stays; its slots are emptied.
      </p>
      <div class="wipe-dialog-actions">
        <button type="button" class="wipe-action" (click)="onDelete()">Delete</button>
        <button type="button" class="wipe-action" (click)="onCancel()">Cancel</button>
      </div>
    </div>
  `,
  styleUrls: ['./wipe-confirm-dialog.scss'],
})
export class WipeConfirmDialogComponent {
  private dialogRef = inject(MatDialogRef<WipeConfirmDialogComponent>);
  private rotation = inject(RotationService);

  /** Delete every meal from the selected menu, then close. */
  onDelete(): void {
    const menuId = this.rotation.selectedMenuId();
    if (menuId != null) void this.rotation.clearMenuMeals(menuId);
    this.dialogRef.close();
  }

  /** Cancel — close, no-op. */
  onCancel(): void {
    this.dialogRef.close();
  }
}
