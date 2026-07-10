// src/app/components/mobile-app-dialog/mobile-app-dialog.ts
//
// Small "Tether Mobile" bloom dialog — a QR / download nudge floated over the
// app. Opened from the profile menu's "Mobile App" entry (tabService.
// mobileAppOpen); closed by the red X disc or a backdrop click. The web app
// can't add MyFoods directly — that flow lives in the phone app — so this just
// points the user at the QR / download.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-mobile-app-dialog',
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tab.mobileAppOpen()) {
      <div class="ma-overlay" (click)="tab.closeMobileApp()">
        <div class="ma-dialog" (click)="$event.stopPropagation()">
          <div class="dialog-discs">
            <button
              type="button"
              class="dialog-disc dialog-disc-cancel"
              matTooltip="Close"
              (click)="tab.closeMobileApp()"
              aria-label="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="ma-icon">📱</div>
          <h2 class="ma-title">Tether Mobile</h2>
          <p class="ma-body">
            Scan the QR code or download the RegiMenu app to add your own foods.
          </p>
          <div class="ma-qr" aria-hidden="true">QR</div>
        </div>
      </div>
    }
  `,
  styles: [`
    .ma-overlay {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.6);
    }
    .ma-dialog {
      position: relative;
      width: 300px;
      box-sizing: border-box;
      padding: 24px 20px;
      text-align: center;
      background: #2a2a2a;
      border: 2px solid #ffd54f;
      border-radius: 12px;
      box-shadow:
        0 0 16px rgba(255, 213, 79, 0.85),
        0 0 32px rgba(255, 193, 7, 0.45),
        0 8px 24px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }
    .dialog-discs {
      position: absolute;
      top: 6px;
      right: 6px;
      display: flex;
      gap: 6px;
    }
    .ma-icon { font-size: 42px; line-height: 1; margin-bottom: 8px; }
    .ma-title { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #ffffff; }
    .ma-body { margin: 0 0 16px; font-size: 13px; line-height: 1.45; color: #cfcfcf; }
    .ma-qr {
      width: 120px;
      height: 120px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      letter-spacing: 1px;
      color: #888;
      background: #1a1a1a;
      border: 1px dashed #555;
      border-radius: 8px;
    }
  `],
})
export class MobileAppDialogComponent {
  readonly tab = inject(TabService);
}
