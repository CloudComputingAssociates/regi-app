// src/app/components/web-view-overlay/web-view-overlay.ts
//
// In-app web viewer — opens an external page (e.g. a "bites" article link) in a
// bloom (yellow-border) iframe overlay so the user never leaves the app or gets
// a new browser window. Traffic-light controls, macOS-ish but app-standard:
//   • Red X (close)  — outermost
//   • Green (+)      — maximize to the full app overlay
//   • Yellow (−)     — restore to the ~2/3 default size
// Vertical + horizontal scrolling come free from the iframe. As a safety valve
// for a user who "freaks out", the overlay AUTO-CLOSES after 30s with no
// pointer/keyboard activity (window blur counts as activity — that's the user
// clicking into the iframe).
//
// CAVEAT: many sites send X-Frame-Options / CSP frame-ancestors and refuse to
// be framed — the iframe then shows blank. The "Open in browser" foot link is
// the fallback for those.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';

const IDLE_MS = 30_000;

@Component({
  selector: 'app-web-view-overlay',
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:mousemove)': 'onActivity()',
    '(document:keydown)': 'onActivity()',
    // Focus leaving the app window = the user clicked into the iframe → active.
    '(window:blur)': 'onActivity()',
  },
  template: `
    @if (tab.webViewUrl(); as url) {
      <div class="wv-backdrop" (click)="close()">
        <div class="wv-window" [class.maximized]="maximized()" (click)="$event.stopPropagation()">
          <div class="wv-titlebar">
            <span class="wv-host">{{ hostLabel(url) }}</span>
            <div class="wv-controls">
              <!-- Restore (yellow −): back to the default ~2/3 size. -->
              <button
                type="button"
                class="wv-disc wv-min"
                [disabled]="!maximized()"
                (click)="maximized.set(false)"
                matTooltip="Restore size"
                matTooltipPosition="below"
                aria-label="Restore size"></button>
              <!-- Maximize (green +): fill the whole app. -->
              <button
                type="button"
                class="wv-disc wv-max"
                [disabled]="maximized()"
                (click)="maximized.set(true)"
                matTooltip="Maximize"
                matTooltipPosition="below"
                aria-label="Maximize"></button>
              <!-- Close (red X): outermost. -->
              <button
                type="button"
                class="wv-disc wv-close"
                (click)="close()"
                matTooltip="Close"
                matTooltipPosition="below"
                aria-label="Close">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          </div>
          <iframe class="wv-iframe" [src]="safeUrl()" referrerpolicy="no-referrer"></iframe>
          <div class="wv-foot">
            <span class="wv-idle">Closes itself after 30s idle</span>
            <a class="wv-external" [href]="url" target="_blank" rel="noopener">Open in browser ↗</a>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .wv-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1300;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.55);
    }
    .wv-window {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 66%;
      height: 66%;
      background: #1a1a1a;
      border: 2px solid #ffd54f;
      border-radius: 12px;
      box-shadow:
        0 0 18px rgba(255, 213, 79, 0.85),
        0 0 40px rgba(255, 193, 7, 0.4),
        0 10px 30px rgba(0, 0, 0, 0.6);
      overflow: hidden;
    }
    .wv-window.maximized {
      width: 100%;
      height: 100%;
      border-radius: 0;
    }
    .wv-titlebar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 34px;
      padding: 0 8px 0 12px;
      background: #2a2a2a;
      border-bottom: 1px solid rgba(255, 213, 79, 0.6);
    }
    .wv-host {
      flex: 1;
      min-width: 0;
      font-size: 12px;
      color: #cfcfcf;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wv-controls { flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
    .wv-disc {
      width: 18px;
      height: 18px;
      padding: 0;
      border-radius: 50%;
      border: 1px solid rgba(0, 0, 0, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.25), 0 1px 1px rgba(0, 0, 0, 0.35);
      transition: transform 0.1s ease, filter 0.1s ease, opacity 0.1s ease;
    }
    .wv-disc:hover:not(:disabled) { transform: scale(1.12); filter: brightness(1.12); }
    .wv-disc:disabled { opacity: 0.35; cursor: default; }
    .wv-min { background: #fff59d; }
    .wv-max { background: #28c941; }
    .wv-close { background: #ff5f57; }
    .wv-close mat-icon { width: 12px; height: 12px; font-size: 12px; line-height: 12px; color: #000; }
    .wv-iframe { flex: 1; width: 100%; border: 0; background: #ffffff; }
    .wv-foot {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 26px;
      padding: 0 12px;
      background: #2a2a2a;
      border-top: 1px solid #3a3a3a;
    }
    .wv-idle { font-size: 11px; color: #808080; }
    .wv-external { font-size: 11px; color: #4da6ff; text-decoration: none; }
    .wv-external:hover { text-decoration: underline; }
  `],
})
export class WebViewOverlayComponent {
  readonly tab = inject(TabService);
  private sanitizer = inject(DomSanitizer);

  /** false = default ~2/3 window, true = full-app overlay. */
  readonly maximized = signal(false);
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.tab.webViewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  constructor() {
    // Re-arm the idle timer each time the viewer opens; disarm when it closes.
    effect(
      () => {
        if (this.tab.webViewUrl()) {
          this.maximized.set(false);
          this.armIdle();
        } else {
          this.clearIdle();
        }
      },
      { allowSignalWrites: true },
    );
  }

  onActivity(): void {
    if (this.tab.webViewUrl()) this.armIdle();
  }

  close(): void {
    this.clearIdle();
    this.tab.closeWebView();
  }

  hostLabel(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  private armIdle(): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => this.close(), IDLE_MS);
  }

  private clearIdle(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
