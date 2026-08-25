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
import { PdfViewService } from '../../services/pdf-view.service';

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
            <!-- No host heading for a PDF (the raw GCP bucket host reads as noise);
                 an empty flex spacer keeps the controls right-aligned. -->
            <span class="wv-host">{{ isPdf() ? '' : hostLabel(url) }}</span>
            <div class="wv-controls">
              <!-- Save/Print (PDFs only): leftmost of the cluster. Hands the PDF
                   to the browser's PDF viewer, where the user saves or prints. -->
              @if (isPdf()) {
                <button
                  type="button"
                  class="wv-disc wv-print"
                  (click)="print()"
                  matTooltip="Save/Print with PDF viewer"
                  matTooltipPosition="below"
                  aria-label="Save or print with PDF viewer">
                  <mat-icon>save</mat-icon>
                </button>
              }
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
          @if (frameSrc(); as src) {
            <iframe class="wv-iframe" [src]="src" referrerpolicy="no-referrer"></iframe>
          } @else {
            <div class="wv-msg">Loading PDF…</div>
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
    .wv-print { background: #4da6ff; }
    .wv-print mat-icon { width: 11px; height: 11px; font-size: 11px; line-height: 11px; color: #fff; }
    .wv-close mat-icon { width: 12px; height: 12px; font-size: 12px; line-height: 12px; color: #000; }
    .wv-iframe { flex: 1; width: 100%; border: 0; background: #ffffff; }
    .wv-msg {
      flex: 1; display: flex; align-items: center; justify-content: center;
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
  private pdfView = inject(PdfViewService);

  /** false = default ~2/3 window, true = full-app overlay. */
  readonly maximized = signal(false);
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  /** True when the target is a PDF (path ends .pdf, query string ignored so the
   *  ?v= cache-bust still matches). PDFs are exempt from the idle auto-close. */
  readonly isPdf = computed<boolean>(() => {
    const url = this.tab.webViewUrl() ?? '';
    return url.split('?')[0].toLowerCase().endsWith('.pdf');
  });

  /** The blob: URL for a PDF target (null until fetched). GCS serves the objects as
   *  downloads, so a raw src downloads — we stream the bytes (bucket CORS now allows
   *  GET from our origin) and frame a blob: URL (application/pdf, no disposition),
   *  which the browser renders inline in the bloom. */
  private readonly pdfBlobUrl = signal<SafeResourceUrl | null>(null);
  private objectUrl: string | null = null;

  /** What the iframe frames: the blob: URL for PDFs, the raw URL for web pages. */
  readonly frameSrc = computed<SafeResourceUrl | null>(() => {
    const url = this.tab.webViewUrl();
    if (!url) return null;
    if (this.isPdf()) return this.pdfBlobUrl(); // null until the blob resolves
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor() {
    // Stream a PDF target into a blob: URL for framing. One-shot per url (no polling).
    // On a fetch/CORS/network failure, fall back to opening the file in a new tab so
    // the PDF is never unreachable, and close the overlay.
    effect(
      (onCleanup) => {
        const url = this.tab.webViewUrl();
        const pdf = this.isPdf();
        this.revokeBlob();
        this.pdfBlobUrl.set(null);
        if (!url || !pdf) return;
        let cancelled = false;
        void this.pdfView
          .toInlineBlobUrl(url)
          .then((blobUrl) => {
            if (cancelled) { URL.revokeObjectURL(blobUrl); return; }
            this.objectUrl = blobUrl;
            this.pdfBlobUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl));
          })
          .catch((err) => {
            if (cancelled) return;
            console.warn('In-app PDF fetch failed; opening in a new tab instead.', err);
            window.open(url, '_blank', 'noopener');
            this.close();
          });
        onCleanup(() => { cancelled = true; });
      },
      { allowSignalWrites: true },
    );

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

  /** Open the rendered PDF in a browser tab for save/print — reuse the same blob so
   *  it opens inline (no download); fall back to the raw url if the fetch fails. */
  async print(): Promise<void> {
    const url = this.tab.webViewUrl();
    if (!url) return;
    try {
      const blobUrl = await this.pdfView.toInlineBlobUrl(url);
      const win = window.open(blobUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(blobUrl), win ? 60_000 : 0);
    } catch (err) {
      console.warn('PDF save/print fetch failed; opening raw url.', err);
      window.open(url, '_blank', 'noopener');
    }
  }

  close(): void {
    this.clearIdle();
    this.revokeBlob();
    this.tab.closeWebView();
  }

  /** Release the framed PDF blob URL (on close / url change). */
  private revokeBlob(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
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
