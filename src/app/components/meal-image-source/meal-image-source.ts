// src/app/components/meal-image-source/meal-image-source.ts
//
// The 3-way meal-image loader — a bloom dialog off the meal card's camera key.
// Open to EVERYONE. Three ways to give a meal its photo:
//   • Top 2/3  — a drop zone: paste (Ctrl+V) / drag-drop / browse a PNG · JPG · HEIC
//                → POST /image/upload/product?source=meal (synchronous; server
//                writes MealImage/Thumbnail) → stamp + flip.
//   • Bottom-left  — "Camera – take phone pic": fires a captureMeal command to the
//                tethered phone; enabled ONLY when a device is live (else shaded).
//                Snackbar + poll-to-flip (mirrors the AI methodology).
//   • Bottom-right — "AI Generate meal image": MealSetOwner ONLY (not rendered for
//                others — intentional, so non-authors bring their own photo).
// Any success closes the dialog; the card flips to the fresh photo and the Notebook
// thumbnail updates (both via rotation.imagedMeal / applyUploadedMealImage).
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
            [matTooltip]="canPhone() ? 'Open your phone camera' : 'Connect your phone to enable'"
            (click)="takePhonePic()">
            <mat-icon>photo_camera</mat-icon>
          </button>
          <div class="mis-source-text" [class.shaded]="!canPhone()">
            <span class="mis-source-label">Camera — take phone pic</span>
            <span class="mis-source-sub">{{
              canPhone() ? 'must have phone app active/open' : 'connect your phone to enable'
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
  readonly canPhone = this.tether.anyLive;

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
    const deviceId = this.tether.firstLiveDeviceId();
    if (deviceId == null) {
      this.notification.show('Connect your phone (open the Regi app) to use this.', 'warning');
      return;
    }
    void (async () => {
      try {
        await this.tether.requestMealImageCapture(deviceId, this.data.mealId);
        this.notification.show(
          'Grab your phone and use your camera to complete the operation.',
          'info',
          8000,
        );
        this.rotation.awaitMealImage(this.data.mealId); // poll → flip when it lands
        this.ref.close();
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 409) {
          this.notification.show('Your phone went offline — reopen the Regi app and retry.', 'error');
        } else if (status === 404) {
          this.notification.show('Phone capture isn’t available yet — coming soon.', 'warning');
        } else {
          this.notification.show('Could not reach your phone. Please try again.', 'error');
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
