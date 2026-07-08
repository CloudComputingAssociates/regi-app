// src/app/components/wipe-confirm-dialog/wipe-confirm-dialog.ts
//
// Confirm dialog for the menus-panel "Wipe menu" action. Dark-themed Material
// dialog (opened with panelClass 'wipe-dialog-panel' — see src/styles.scss
// for the dark surface override so there's no white default flash).
//
// Confirming deletes every meal from the CURRENTLY SELECTED menu (the menu
// itself stays; its slots go empty). Wired to RotationService.clearMenuMeals.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { RotationService } from '../../services/rotation.service';

@Component({
  selector: 'app-wipe-confirm-dialog',
  imports: [MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wipe-dialog">
      <p class="wipe-dialog-prompt">{{ message }}</p>
      <div class="wipe-dialog-actions">
        <button type="button" class="wipe-action" (click)="onDelete()">{{ confirmLabel }}</button>
        <button type="button" class="wipe-action" (click)="onCancel()">Cancel</button>
      </div>
    </div>
  `,
  styleUrls: ['./wipe-confirm-dialog.scss'],
})
export class WipeConfirmDialogComponent {
  private dialogRef = inject(MatDialogRef<WipeConfirmDialogComponent>);
  private rotation = inject(RotationService);
  // Optional overrides. When omitted (the Wipe menu button) the defaults wipe
  // the selected menu's meals; other callers (e.g. the menu-tile delete, the
  // meal-card "remove from slot") reuse this ONE dialog and pass their own
  // prompt text, confirm-button label, and confirm action.
  private data = inject<{ message?: string; confirmLabel?: string; onConfirm?: () => void } | null>(
    MAT_DIALOG_DATA,
    { optional: true },
  );

  readonly message =
    this.data?.message ?? 'Delete all meals from the selected menu? The menu stays; its slots are emptied.';
  readonly confirmLabel = this.data?.confirmLabel ?? 'Delete';

  /** Run the confirm action (default: wipe the selected menu's meals), close. */
  onDelete(): void {
    if (this.data?.onConfirm) {
      this.data.onConfirm();
    } else {
      const menuId = this.rotation.selectedMenuId();
      if (menuId != null) void this.rotation.clearMenuMeals(menuId);
    }
    this.dialogRef.close();
  }

  /** Cancel — close, no-op. */
  onCancel(): void {
    this.dialogRef.close();
  }
}
