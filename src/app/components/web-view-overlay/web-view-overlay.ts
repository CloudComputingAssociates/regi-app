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
import { RecipePdfViewerComponent } from '../recipe-pdf-viewer/recipe-pdf-viewer';

const IDLE_MS = 30_000;

@Component({
  selector: 'app-web-view-overlay',
  imports: [MatIconModule, MatTooltipModule, RecipePdfViewerComponent],
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
            <!-- No host heading for a PDF (the raw GCP bucket host reads as noise);
                 an empty flex spacer keeps the controls right-aligned. -->
            <span class="wv-host">{{ isPdf() ? '' : hostLabel(url) }}</span>
            <div class="wv-controls">
              <!-- Maximize / restore toggle (one clear button, not two discs). -->
              <button type="button" class="wv-btn" (click)="maximized.set(!maximized())"
                [matTooltip]="maximized() ? 'Restore size' : 'Maximize'" matTooltipPosition="below"
                [attr.aria-label]="maximized() ? 'Restore size' : 'Maximize'">
                <mat-icon>{{ maximized() ? 'fullscreen_exit' : 'fullscreen' }}</mat-icon>
              </button>
              <!-- Close. -->
              <button type="button" class="wv-btn wv-btn-close" (click)="close()"
                matTooltip="Close" matTooltipPosition="below" aria-label="Close">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          </div>
          @if (isPdf()) {
            <!-- PDF.js viewer, lazy-loaded on demand (kept out of the main bundle).
                 It renders the bytes to a canvas — its own toolbar carries download,
                 print, zoom, page nav and search. -->
            @defer (on immediate) {
              <app-recipe-pdf-viewer [src]="url" />
            } @placeholder {
              <div class="wv-msg">Loading viewer…</div>
            } @loading (minimum 150ms) {
              <div class="wv-msg">Loading viewer…</div>
            } @error {
              <div class="wv-msg">
                Couldn’t load the PDF viewer —
                <a class="wv-external" [href]="url" target="_blank" rel="noopener">open in browser ↗</a>
              </div>
            }
          } @else {
            <iframe class="wv-iframe" [src]="safeUrl()" referrerpolicy="no-referrer"
              (error)="onLoadError()"></iframe>
          }
          <div class="wv-foot">
            <span class="wv-idle">{{ isPdf() ? 'Recipe PDF' : 'Closes itself after 30s idle' }}</span>
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
      /* Above the recipe-editor overlay (z 1400) so "PDF · View" from inside the
         editor shows the viewer on top rather than behind it. */
      z-index: 1500;
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
    .wv-controls { flex-shrink: 0; display: flex; align-items: center; gap: 8px; }
    /* Proper app-style buttons (not traffic-light discs). */
    .wv-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 26px; padding: 0; cursor: pointer;
      color: #e8e8e8; background: linear-gradient(180deg, #565656, #434343);
      border: 1px solid #262626; border-top-color: #6f6f6f; border-radius: 6px;
      transition: filter 0.1s ease;
      mat-icon { width: 18px; height: 18px; font-size: 18px; }
    }
    .wv-btn:hover { filter: brightness(1.14); }
    .wv-btn-close:hover {
      color: #fff; background: linear-gradient(180deg, #e0625f, #c0433f); border-color: #a5322f;
    }
    .wv-iframe { flex: 1; width: 100%; border: 0; background: #ffffff; }
    .wv-msg {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
      padding: 16px; text-align: center; font-size: 13px; color: #cfcfcf; background: #1a1a1a;
    }
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

  /** True when the target is a PDF (path ends .pdf, query string ignored so the
   *  ?v= cache-bust still matches). PDFs are exempt from the idle auto-close. */
  readonly isPdf = computed<boolean>(() => {
    if (this.tab.webViewIsPdf()) return true; // forced (e.g. a blob: URL PDF)
    const url = this.tab.webViewUrl() ?? '';
    return url.split('?')[0].toLowerCase().endsWith('.pdf');
  });

  /** Frame the raw CDN URL directly (incl. its ?v= cache-bust). The server now
   *  serves recipe PDFs with Content-Disposition: inline, so the browser renders
   *  them natively in the iframe — no fetch/blob (CORS-irrelevant for a plain
   *  navigation), no Google viewer. Web pages frame the same way. */
  readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.tab.webViewUrl();
    if (!url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor() {
    // Re-arm the idle timer each time the viewer opens; disarm when it closes.
    // PDFs (recipes) never auto-close — you read them at your own pace, and
    // iframe-internal scrolling wouldn't reach the parent to reset the timer.
    effect(
      () => {
        if (this.tab.webViewUrl()) {
          this.maximized.set(false);
          if (this.isPdf()) this.clearIdle();
          else this.armIdle();
        } else {
          this.clearIdle();
        }
      },
      { allowSignalWrites: true },
    );
  }

  onActivity(): void {
    if (this.tab.webViewUrl() && !this.isPdf()) this.armIdle();
  }

  /** Iframe couldn't load the target — fall back to a browser tab so the PDF/page is
   *  never unreachable. (Rare: the inline-served CDN URL renders directly.) */
  onLoadError(): void {
    const url = this.tab.webViewUrl();
    if (!url) return;
    console.warn('In-app viewer iframe failed to load; opening in a new tab.', url);
    window.open(url, '_blank', 'noopener');
    this.close();
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
