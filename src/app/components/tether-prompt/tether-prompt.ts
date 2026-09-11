// src/app/components/tether-prompt/tether-prompt.ts
//
// "Tether Mobile" bloom dialog — a QR / download (or "open the app") nudge
// floated over the app. Presentational: the PARENT controls visibility (@if)
// and passes `mode`; this component only emits (close). The card chrome
// (overlay, amber-glow border, red cancel disc, 📱, sizing) is byte-identical
// across both modes — only the title/body and QR visibility change.
//
// Renamed from the former MobileAppDialogComponent; its chrome moved here
// verbatim (into tether-prompt.scss). Two independent consumers mount their own
// instance: app-root (foods-panel's "add food" nudge, mode="not-registered")
// and tether-indicator (mode computed at click time).
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { QRCodeComponent } from 'angularx-qrcode';

export type TetherPromptMode = 'not-registered' | 'registered-offline';

@Component({
  selector: 'app-tether-prompt',
  imports: [MatIconModule, MatTooltipModule, QRCodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tp-overlay" (click)="close.emit()">
      <div class="tp-dialog" (click)="$event.stopPropagation()">
        <div class="dialog-discs">
          <button
            type="button"
            class="dialog-disc dialog-disc-cancel"
            matTooltip="Close"
            (click)="close.emit()"
            aria-label="Close">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <div class="tp-icon">📱</div>
        @if (mode() === 'registered-offline') {
          <h2 class="tp-title">Open Regi on your phone</h2>
          <p class="tp-body">Your phone is registered — open the Regi app to connect.</p>
        } @else {
          <h2 class="tp-title">Tether Mobile</h2>
          <p class="tp-body">
            Scan the QR code to install the RegiMenu app on your phone.
          </p>
          <div class="qr-tile">
            <qrcode [qrdata]="mobileAppUrl" [width]="180" [errorCorrectionLevel]="'M'" [margin]="2" colorDark="#000000" colorLight="#ffffff"></qrcode>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./tether-prompt.scss'],
})
export class TetherPromptComponent {
  /** Deep link the QR encodes — opens the mobile app install/landing page. */
  readonly mobileAppUrl = 'https://mobile-app.regimenu.com/?src=qr';
  /** Which copy to show. Chrome is identical across modes. */
  readonly mode = input<TetherPromptMode>('not-registered');
  /** Fired on backdrop click or the red cancel disc. */
  readonly close = output<void>();
}
