// src/app/components/wipe-confirm-dialog/wipe-confirm-dialog.ts
//
// Shared dark-themed confirm dialog for the Menus surface teardown actions
// (opened with panelClass 'wipe-dialog-panel' — see src/styles.scss for the
// dark surface override so there's no white default flash).
//
// One dialog, many callers: each passes its own title / message / confirm-label
// / teach-line and a confirm action. With no data it falls back to clearing the
// selected menu's slots.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { RotationService } from '../../services/rotation.service';

interface WipeDialogData {
  title?: string;
  message?: string;
  /** Step-9 teach line, shown emphasized under the message when set. */
  teachLine?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

@Component({
  selector: 'app-wipe-confirm-dialog',
  imports: [MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wipe-dialog">
      @if (title) {
        <p class="wipe-dialog-title">{{ title }}</p>
      }
      <p class="wipe-dialog-prompt">{{ message }}</p>
      @if (teachLine) {
        <p class="wipe-dialog-teach">{{ teachLine }}</p>
      }
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
  private data = inject<WipeDialogData | null>(MAT_DIALOG_DATA, { optional: true });

  readonly title = this.data?.title ?? '';
  readonly message =
    this.data?.message ?? 'Delete all meals from the selected menu? The menu stays; its slots are emptied.';
  readonly teachLine = this.data?.teachLine ?? '';
  readonly confirmLabel = this.data?.confirmLabel ?? 'Delete';

  /** Run the confirm action (default: clear the selected menu's slots), close. */
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
