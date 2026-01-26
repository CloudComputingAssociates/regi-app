// src/app/services/notification.service.ts
import { Injectable, signal } from '@angular/core';

export interface Notification {
  message: string;
  type: 'success' | 'error' | 'warning';
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationSignal = signal<Notification | null>(null);
  private timeoutId: any = null;

  notification = this.notificationSignal.asReadonly();

  show(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    // Clear any existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Show the notification
    this.notificationSignal.set({ message, type });

    // Auto-dismiss after 3 seconds
    this.timeoutId = setTimeout(() => {
      this.dismiss();
    }, 3000);
  }

  dismiss(): void {
    this.notificationSignal.set(null);
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
