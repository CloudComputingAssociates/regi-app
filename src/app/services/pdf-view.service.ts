// src/app/services/pdf-view.service.ts
//
// Inline PDF viewing for our GCP-hosted recipe PDFs. Those objects are served with
// a download disposition (Content-Disposition: attachment) — so a plain anchor or
// a raw iframe src makes the browser DOWNLOAD them instead of rendering. The fix
// is client-side: stream the bytes (CORS is allowed — the print path already does
// this) and hand the browser a blob: URL forced to application/pdf. Blob URLs carry
// no Content-Disposition, so the built-in PDF viewer renders them inline.
import { Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class PdfViewService {
  private notification = inject(NotificationService);

  /** Fetch the PDF and return an inline-rendering blob: URL (forced application/pdf).
   *  The CALLER owns revocation (URL.revokeObjectURL) once it's done with it. */
  async toInlineBlobUrl(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.blob();
    return URL.createObjectURL(new Blob([raw], { type: 'application/pdf' }));
  }

  /** Open the PDF inline in a new tab. The tab is opened SYNCHRONOUSLY (inside the
   *  click gesture, so popup blockers don't fire) and pointed at the blob URL once
   *  the fetch resolves. On failure the blank tab is closed and we toast. */
  async openInline(url: string): Promise<void> {
    const tab = window.open('', '_blank');
    try {
      const blobUrl = await this.toInlineBlobUrl(url);
      if (tab) tab.location.href = blobUrl;
      else window.open(blobUrl, '_blank', 'noopener'); // popup-blocked fallback
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      if (tab) tab.close();
      this.notification.show('Could not open the PDF.', 'error');
    }
  }
}
