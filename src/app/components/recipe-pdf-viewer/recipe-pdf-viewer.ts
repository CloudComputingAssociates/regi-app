// src/app/components/recipe-pdf-viewer/recipe-pdf-viewer.ts
//
// Thin wrapper around ngx-extended-pdf-viewer (Mozilla PDF.js). It renders the PDF
// BYTES to a canvas client-side — immune to the GCS download disposition, the
// blob-in-iframe block, and CORS being needed for a plain navigation (the fetch
// CORS is allowed). This component is LAZY-LOADED via @defer in the web-view
// overlay, so PDF.js stays out of the main bundle until a recipe PDF is opened.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';

@Component({
  selector: 'app-recipe-pdf-viewer',
  imports: [NgxExtendedPdfViewerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngx-extended-pdf-viewer
      [src]="src()"
      height="100%"
      backgroundColor="#1a1a1a"
      [textLayer]="true"
      [showToolbar]="true"
      [showSidebarButton]="true"
      [showFindButton]="true"
      [showPagingButtons]="true"
      [showZoomButtons]="true"
      [showPresentationModeButton]="true"
      [showDownloadButton]="true"
      [showPrintButton]="true"
      [showOpenFileButton]="false"
      [showSecondaryToolbarButton]="true">
    </ngx-extended-pdf-viewer>
  `,
  styles: [`:host { display: block; flex: 1 1 auto; min-height: 0; }`],
})
export class RecipePdfViewerComponent {
  /** The PDF URL (raw CDN url incl. its ?v= cache-bust); PDF.js fetches + renders it. */
  readonly src = input.required<string>();
}
