// src/app/services/notification.service.ts
import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  message: string;
  type: NotificationType;
  onConfirm?: () => void;
  onCancel?: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationSignal = signal<Notification | null>(null);
  private timeoutId: any = null;

  notification = this.notificationSignal.asReadonly();

  show(message: string, type: NotificationType = 'success', timeoutMs = 3000): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.notificationSignal.set({ message, type });

    this.timeoutId = setTimeout(() => {
      this.dismiss();
    }, timeoutMs);
  }

  /** Show a confirmation toast with ✓ (proceed) and ✕ (cancel) buttons.
   *  Auto-dismisses after timeoutMs (default 10s). */
  showConfirmation(
    message: string,
    type: NotificationType,
    onConfirm: () => void,
    onCancel: () => void,
    timeoutMs = 10000
  ): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.notificationSignal.set({ message, type, onConfirm, onCancel });

    this.timeoutId = setTimeout(() => {
      // Treat timeout as cancel
      onCancel();
      this.dismiss();
    }, timeoutMs);
  }

  confirm(): void {
    const n = this.notificationSignal();
    if (n?.onConfirm) n.onConfirm();
    this.dismiss();
  }

  cancel(): void {
    const n = this.notificationSignal();
    if (n?.onCancel) n.onCancel();
    this.dismiss();
  }

  dismiss(): void {
    this.notificationSignal.set(null);
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
