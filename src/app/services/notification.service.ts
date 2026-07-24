// src/app/services/notification.service.ts
import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  message: string;
  type: NotificationType;
  onConfirm?: () => void;
  onCancel?: () => void;
  /** Ingest variant: renders a "Don't show this again" checkbox above a single
   *  O.K. button. Present only for the recipe-ingest toast. */
  ingest?: IngestToast;
}

export interface IngestToast {
  checkboxLabel: string;
  okLabel: string;
  /** O.K. pressed — receives the checkbox state. Timeout/dismiss never fires it. */
  onOk: (dontShowAgain: boolean) => void;
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

  /** Recipe-ingest toast: a message, a "Don't show this again" checkbox, and a
   *  single O.K. button. Timeout or dismiss-without-O.K. changes nothing. */
  showIngest(
    message: string,
    onOk: (dontShowAgain: boolean) => void,
    timeoutMs = 8000
  ): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.notificationSignal.set({
      message,
      type: 'success',
      ingest: { checkboxLabel: "Don't show this again", okLabel: 'O.K.', onOk },
    });
    this.timeoutId = setTimeout(() => this.dismiss(), timeoutMs);
  }

  /** O.K. pressed on the ingest toast — the renderer passes the checkbox state. */
  ingestOk(dontShowAgain: boolean): void {
    const n = this.notificationSignal();
    n?.ingest?.onOk(dontShowAgain);
    this.dismiss();
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
