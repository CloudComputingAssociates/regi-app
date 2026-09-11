// src/app/components/notification/notification.ts
import { Component, ChangeDetectionStrategy, inject, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notification',
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notificationService.notification(); as notification) {
      <div class="notification-container">
        <div class="notification"
          [class.error]="notification.type === 'error'"
          [class.warning]="notification.type === 'warning'"
          [class.info]="notification.type === 'info'"
          [class.confirmation]="isConfirmation()">
          <div class="message-area">
            @for (line of messageLines(); track $index) {
              <span class="message-line">{{ line }}</span>
            }
            @if (notification.ingest; as ingest) {
              <label class="ingest-optout">
                <input
                  type="checkbox"
                  [checked]="dontShowAgain()"
                  (change)="dontShowAgain.set($any($event.target).checked)" />
                <span>{{ ingest.checkboxLabel }}</span>
              </label>
            }
          </div>
          @if (notification.ingest; as ingest) {
            <button class="ingest-ok" (click)="notificationService.ingestOk(dontShowAgain())">
              {{ ingest.okLabel }}
            </button>
          } @else if (isConfirmation()) {
            <div class="confirm-buttons">
              <button class="confirm-btn confirm-ok" (click)="notificationService.confirm()" aria-label="Proceed">
                <mat-icon>check</mat-icon>
              </button>
              <button class="confirm-btn confirm-cancel" (click)="notificationService.cancel()" aria-label="Cancel">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          } @else {
            <button class="close-btn" (click)="notificationService.dismiss()" aria-label="Close notification">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
      </div>
    }
  `,
  styleUrls: ['./notification.scss']
})
export class NotificationComponent {
  notificationService = inject(NotificationService);

  /** Local checkbox state for the ingest toast. Reset to false each time a fresh
   *  ingest toast appears so a prior "checked" never carries over. */
  readonly dontShowAgain = signal(false);

  constructor() {
    effect(
      () => {
        if (this.notificationService.notification()?.ingest) this.dontShowAgain.set(false);
      },
      { allowSignalWrites: true },
    );
  }

  isConfirmation = computed(() => {
    const n = this.notificationService.notification();
    return !!n?.onConfirm || !!n?.onCancel;
  });

  messageLines = computed(() => {
    const n = this.notificationService.notification();
    if (!n) return [];
    return n.message.split('\n');
  });
}
