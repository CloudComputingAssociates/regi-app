// src/app/components/image-drop/image-drop.ts
//
// Reusable image dropzone for the MealSets authoring surface. One dotted area
// that accepts a JPG/PNG by:
//   - pasting a screenshot / image clip (Ctrl+V)  → upload the bits
//   - dropping a file                             → upload the bits
//   - the "browse" link                           → file picker
// Emits the resulting CDN url via (valueChange). No external Upload button; no
// URL entry (kept simple — users screenshot-paste or pick a file).
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MealSetService } from '../../services/mealset.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-image-drop',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="idz"
      tabindex="0"
      [class.dragging]="dragOver()"
      [class.busy]="busy()"
      [class.has-img]="!!value()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
      (paste)="onPaste($event)">
      @if (value(); as v) {
        <img [src]="v" alt="" class="idz-thumb" />
      }
      <div class="idz-overlay">
        @if (busy()) {
          <span class="idz-title">Uploading…</span>
        } @else {
          <mat-icon class="idz-icon">add_photo_alternate</mat-icon>
          <span class="idz-title">{{ value() ? 'Replace' : 'Drag, paste, or browse' }}</span>
          <span class="idz-sub">
            JPG / PNG · paste a screenshot ·
            <button type="button" class="idz-link" (click)="fileInput.click()">browse</button>
          </span>
        }
      </div>
      <input #fileInput type="file" accept="image/jpeg,image/png" hidden (change)="onFile(fileInput)" />
    </div>
  `,
  styleUrls: ['./image-drop.scss'],
})
export class ImageDropComponent {
  private mealSetService = inject(MealSetService);
  private notification = inject(NotificationService);

  /** Current image url (CDN). */
  readonly value = input<string>('');
  /** Optional slug hint for the stored image name. */
  readonly name = input<string>('');
  /** Emits the resulting CDN url after an upload. */
  readonly valueChange = output<string>();

  readonly busy = signal(false);
  readonly dragOver = signal(false);

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
    if (file) void this.uploadFile(file);
  }

  onFile(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) void this.uploadFile(file);
  }

  /** Ctrl+V on the focused zone: an image clip (screenshot) uploads. */
  onPaste(ev: ClipboardEvent): void {
    const file = ev.clipboardData?.files?.[0];
    if (file) {
      ev.preventDefault();
      void this.uploadFile(file);
    }
  }

  private async uploadFile(file: File): Promise<void> {
    if (this.busy()) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      this.notification.show('Please use a JPG or PNG image.', 'error');
      return;
    }
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.mealSetService.uploadImage(file, this.name() || undefined));
      if (res?.cdn_url) this.valueChange.emit(res.cdn_url);
      else this.notification.show('Upload failed — no URL returned.', 'error');
    } catch {
      this.notification.show('Image upload failed.', 'error');
    } finally {
      this.busy.set(false);
    }
  }
}
