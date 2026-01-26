// src/app/components/notification/notification.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notificationService.notification(); as notification) {
      <div class="notification-container">
        <div class="notification" [class.error]="notification.type === 'error'" [class.warning]="notification.type === 'warning'">
          <span class="message">{{ notification.message }}</span>
          <button class="close-btn" (click)="notificationService.dismiss()" aria-label="Close notification">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>
    }
  `,
  styleUrls: ['./notification.scss']
})
export class NotificationComponent {
  notificationService = inject(NotificationService);
}
