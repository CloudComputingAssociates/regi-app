// src/app/components/wipe-confirm-dialog/wipe-confirm-dialog.ts
//
// Confirm dialog for the menus-panel "Wipe" action. Dark-themed Material
// dialog (opened with panelClass 'wipe-dialog-panel' — see src/styles.scss
// for the dark surface override so there's no white default flash).
//
// PHASE: all three buttons just close the dialog and do nothing. The wipe
// endpoint is not wired yet.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-wipe-confirm-dialog',
  imports: [MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wipe-dialog">
      <p class="wipe-dialog-prompt">
        Wipe all menus and start fresh — generate a new AI set of menus and meals?
      </p>
      <div class="wipe-dialog-actions">
        <button type="button" class="wipe-action" (click)="onYes()">Yes</button>
        <button type="button" class="wipe-action" (click)="onNo()">No</button>
        <button type="button" class="wipe-action" (click)="onCancel()">Cancel</button>
      </div>
    </div>
  `,
  styleUrls: ['./wipe-confirm-dialog.scss'],
})
export class WipeConfirmDialogComponent {
  private dialogRef = inject(MatDialogRef<WipeConfirmDialogComponent>);

  /** Yes — wipe then regenerate.
   *  TODO: PUT /rotation/{id}/wipe, then call the generate flow to build a
   *  fresh AI set of menus and meals. */
  onYes(): void {
    this.dialogRef.close();
  }

  /** No — wipe but leave empty so the user hand-builds.
   *  TODO: PUT /rotation/{id}/wipe (no regenerate). */
  onNo(): void {
    this.dialogRef.close();
  }

  /** Cancel — close, no-op. */
  onCancel(): void {
    this.dialogRef.close();
  }
}
