// src/app/services/pdf-view.service.ts
//
// Inline PDF viewing for our GCS-hosted recipe PDFs. The objects are served with a
// download disposition (Content-Disposition: attachment), so a plain link/iframe src
// DOWNLOADS them. We stream the bytes and hand the browser a blob: URL forced to
// application/pdf — blob URLs carry no Content-Disposition, so the built-in viewer
// renders them inline (in our bloom overlay iframe). This requires the bucket to
// allow cross-origin GET from our origin, which it now does.
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PdfViewService {
  /** Fetch the PDF and return an inline-rendering blob: URL (forced application/pdf).
   *  The CALLER owns revocation (URL.revokeObjectURL) once done. Throws on a
   *  network/CORS failure so callers can fall back to a plain navigation open. */
  async toInlineBlobUrl(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.blob();
    return URL.createObjectURL(new Blob([raw], { type: 'application/pdf' }));
  }
}
