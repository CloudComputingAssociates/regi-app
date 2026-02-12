// src/app/components/notification/notification.ts
import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
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
          </div>
          @if (isConfirmation()) {
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
