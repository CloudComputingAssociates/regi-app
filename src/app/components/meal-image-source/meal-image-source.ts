// src/app/components/meal-image-source/meal-image-source.ts
//
// The 3-way meal-image loader — a bloom dialog off the meal card's camera key.
// Open to EVERYONE. Three ways to give a meal its photo:
//   • Top 2/3  — a drop zone: paste (Ctrl+V) / drag-drop / browse a PNG · JPG · HEIC
//                → POST /image/upload/product?source=meal (synchronous; server
//                writes MealImage/Thumbnail) → stamp + flip.
//   • Bottom-left  — "Camera – take phone pic": issues a DURABLE captureMeal command
//                (POST /api/tether/device/{id}/command → 202 {messageId}) to the
//                user's registered phone; enabled once a phone is REGISTERED (live
//                not required — the command survives ttlSeconds offline). The web no
//                longer pops the phone camera — an in-dialog panel directs the user to
//                the phone's menu (☰) → Phone panel; the TetherService results poll
//                flips the card on 'done' or closes the panel on failed/timeout.
//   • Bottom-right — "AI Generate meal image": MealSetOwner ONLY (not rendered for
//                others — intentional, so non-authors bring their own photo).
// Any success closes the dialog; the card flips to the fresh photo and the Notebook
// thumbnail updates (both via rotation.imagedMeal / applyUploadedMealImage).
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ImageUploadService } from '../../services/image-upload.service';
import { RotationService } from '../../services/rotation.service';
import { TetherService } from '../../services/tether.service';
import { RoleService } from '../../services/role.service';
import { NotificationService } from '../../services/notification.service';

export interface MealImageSourceData {
  mealId: number;
  mealName: string;
}

@Component({
  selector: 'app-meal-image-source',
  imports: [MatDialogModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // While the dialog is open, a paste anywhere with an image drops it in.
  host: { '(document:paste)': 'onPaste($event)' },
  template: `
    <div class="mis">
      <button
        type="button"
        class="dialog-disc dialog-disc-cancel mis-close"
        matTooltip="Close"
        (click)="close()">
        <mat-icon>close</mat-icon>
      </button>

      @if (phoneWaiting()) {
        <!-- Phone-capture waiting state — clear instructions + auto-closes when the
             photo lands from the phone. -->
        <div class="mis-waiting">
          <mat-icon class="mis-wait-icon">phonelink_ring</mat-icon>
          <span class="mis-wait-title">📱 Sent to your phone</span>
          <span class="mis-wait-sub">
            On your phone, open the menu (☰) → <strong>Phone</strong> to take the
            picture. The photo drops onto this card automatically when it lands — you
            can close this window; it will still arrive.
          </span>
          <button type="button" class="mis-wait-btn" (click)="close()">Close</button>
        </div>
      } @else {
      <h3 class="mis-title">Add a photo — {{ data.mealName }}</h3>

      <!-- Top 2/3: the drop zone. -->
      <div
        class="mis-drop"
        tabindex="0"
        [class.dragging]="dragOver()"
        [class.busy]="busy()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)">
        @if (busy()) {
          <span class="mis-drop-title">Uploading…</span>
        } @else {
          <mat-icon class="mis-drop-icon">add_photo_alternate</mat-icon>
          <span class="mis-drop-title">Drop, paste, or browse a photo</span>
          <span class="mis-drop-sub">
            JPG · PNG · HEIC — paste a screenshot, drag a file, or
            <button type="button" class="mis-link" (click)="fileInput.click()">browse</button>
          </span>
        }
        <input
          #fileInput
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
          hidden
          (change)="onFile(fileInput)" />
      </div>

      <!-- Bottom 1/3: split — phone camera (left) · AI generate (right, owner only). -->
      <div class="mis-actions">
        <div class="mis-half">
          <button
            type="button"
            class="mis-source-btn"
            [disabled]="!canPhone()"
            [matTooltip]="canPhone() ? 'Send a photo request to your phone' : 'Open Regi on your phone to enable'"
            (click)="takePhonePic()">
            <mat-icon>photo_camera</mat-icon>
          </button>
          <div class="mis-source-text" [class.shaded]="!canPhone()">
            <span class="mis-source-label">Camera — take phone pic</span>
            <span class="mis-source-sub">{{
              canPhone() ? 'sends the request to your phone' : 'Open Regi on your phone to enable'
            }}</span>
          </div>
        </div>

        @if (isOwner()) {
          <div class="mis-half">
            <button
              type="button"
              class="mis-source-btn mis-ai-btn"
              matTooltip="Generate a photo from this meal"
              (click)="generateAi()">
              <img src="/images/AI-star-blue.png" alt="AI" class="mis-ai-img" />
            </button>
            <div class="mis-source-text">
              <span class="mis-source-label">AI Generate meal image</span>
              <span class="mis-source-sub">created from your ingredients &amp; notes</span>
            </div>
          </div>
        }
      </div>
      }
    </div>
  `,
  styleUrls: ['./meal-image-source.scss'],
})
export class MealImageSourceComponent {
  private ref = inject(MatDialogRef<MealImageSourceComponent>);
  readonly data = inject<MealImageSourceData>(MAT_DIALOG_DATA);
  private imageUpload = inject(ImageUploadService);
  private rotation = inject(RotationService);
  private tether = inject(TetherService);
  private role = inject(RoleService);
  private notification = inject(NotificationService);

  readonly busy = signal(false);
  readonly dragOver = signal(false);
  readonly isOwner = computed(() => this.role.hasRole('MealSetOwner'));
  // Enabled only when one of the user's phones is LIVE — the enqueue routes to a live
  // phone and 409s if none is connected, so gate the button on presence.anyLive.
  readonly canPhone = computed(() => this.tether.anyLive());

  /** True after a phone-capture command is sent — shows the "open your phone" panel
   *  until the photo arrives (auto-close) or the user closes it. */
  readonly phoneWaiting = signal(false);
  /** The imagedMeal seq at wait-start, so we only auto-close on a NEW arrival for
   *  this meal (not a stale prior completion). */
  private waitStartSeq = 0;

  constructor() {
    // Photo arrived from the phone (or any source) for THIS meal while waiting →
    // close; the card flip + thumbnail refresh happen via rotation.imagedMeal.
    effect(() => {
      const done = this.rotation.imagedMeal();
      if (!done) return;
      untracked(() => {
        if (this.phoneWaiting() && done.id === this.data.mealId && done.seq > this.waitStartSeq) {
          this.ref.close();
        }
      });
    });

    // The phone capture FAILED or TIMED OUT for this meal (the results poll surfaces
    // it; TetherService already toasted) → drop the waiting panel.
    effect(() => {
      const ev = this.tether.captureEvent();
      if (!ev) return;
      untracked(() => {
        if (
          this.phoneWaiting() &&
          ev.kind === 'meal' &&
          ev.id === this.data.mealId &&
          ev.status !== 'done'
        ) {
          this.ref.close();
        }
      });
    });
  }

  // JPG/PNG plus Apple HEIC/HEIF (the server transcodes HEIC → JPEG). Apple HEIC
  // often arrives with an EMPTY or odd MIME type, so accept by extension too.
  private static readonly ACCEPTED_MIME = /^image\/(jpeg|png|heic|heif)$/i;
  private static readonly ACCEPTED_EXT = /\.(jpe?g|png|heic|heif)$/i;
  private accepted(file: File): boolean {
    return (
      MealImageSourceComponent.ACCEPTED_MIME.test(file.type) ||
      MealImageSourceComponent.ACCEPTED_EXT.test(file.name)
    );
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(true);
  }
  onDragLeave(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
  }
  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    const file = ev.dataTransfer?.files?.[0] ?? null;
    if (file) void this.upload(file);
  }
  onFile(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) void this.upload(file);
  }
  onPaste(ev: ClipboardEvent): void {
    const file = ev.clipboardData?.files?.[0];
    if (file) {
      ev.preventDefault();
      void this.upload(file);
    }
  }

  private async upload(file: File): Promise<void> {
    if (this.busy()) return;
    if (!this.accepted(file)) {
      this.notification.show('Please use a JPG, PNG, or HEIC image.', 'error');
      return;
    }
    this.busy.set(true);
    try {
      const res = await this.imageUpload.uploadMealImage(this.data.mealId, file);
      if (res?.cdn_url) {
        this.rotation.applyUploadedMealImage(this.data.mealId, res.cdn_url, res.thumbnail_url);
        this.ref.close();
      } else {
        this.notification.show('Upload failed — no URL returned.', 'error');
      }
    } catch {
      // HEIC will fail here until the regi-api decoder deploys — say so plainly.
      this.notification.show(
        'Image upload failed. If this is a HEIC photo, try a JPG/PNG for now.',
        'error',
      );
    } finally {
      this.busy.set(false);
    }
  }

  takePhonePic(): void {
    if (!this.tether.anyLive()) {
      this.notification.show('No phone connected — open Regi on your phone and try again.', 'warning');
      return;
    }
    void (async () => {
      try {
        // USER-LEVEL enqueue — the API routes to whichever phone is live; no deviceId.
        // The web doesn't pop a camera; the user takes the shot on the phone. Completion
        // (card flip) / timeout arrive via the results poll (rotation.imagedMeal / captureEvent).
        this.waitStartSeq = this.rotation.imagedMeal()?.seq ?? 0;
        await this.tether.requestCapture({
          kind: 'meal',
          id: this.data.mealId,
          name: this.data.mealName,
        });
        this.notification.show('📱 Sent to your phone — open the menu (☰) → Camera to take the picture.', 'info');
        this.phoneWaiting.set(true);
      } catch (err) {
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        if (status === 409) {
          this.notification.show('No phone connected — open Regi on your phone and try again.', 'warning');
        } else if (status === 503) {
          this.notification.show('Phone capture is temporarily unavailable. Please try again later.', 'error');
        } else {
          this.notification.show('Could not send the request to your phone. Please try again.', 'error');
        }
      }
    })();
  }

  generateAi(): void {
    void this.rotation.generateMealImage(this.data.mealId); // its own snackbar + poll
    this.ref.close();
  }

  close(): void {
    this.ref.close();
  }
}
