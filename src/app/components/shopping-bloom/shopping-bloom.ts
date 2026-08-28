// src/app/components/shopping-bloom/shopping-bloom.ts
//
// The Shopping List as a bloom overlay floated over the Menus & Meals board
// (launched from that toolbar; it's no longer a left-nav panel on web). This is
// a thin bloom SHELL — backdrop + yellow-glow window + Print — wrapping the
// existing ShoppingPanelComponent for its content.
import {
  ChangeDetectionStrategy,
  Component,
  output,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ShoppingPanelComponent } from '../shopping-panel/shopping-panel';

@Component({
  selector: 'app-shopping-bloom',
  imports: [MatIconModule, MatTooltipModule, ShoppingPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Backdrop dims the board; click-out closes (nothing here is dirty-guarded
         since the panel auto-saves). -->
    <div class="shopping-bloom-backdrop" (click)="close.emit()">
      <div class="shopping-bloom-window" (click)="$event.stopPropagation()">
        <!-- Title + controls row. Print + close live top-right; the panel body
             scrolls below. -->
        <div class="shopping-bloom-head no-print">
          <span class="bloom-title">
            <mat-icon class="bloom-title-icon">list_alt</mat-icon>Shopping List
          </span>
          <div class="shopping-bloom-actions">
            <button
              type="button"
              class="shopping-print-btn"
              matTooltip="Print / Save as PDF"
              matTooltipPosition="below"
              (click)="print()">
              <mat-icon>print</mat-icon>Print
            </button>
            <div class="dialog-discs">
              <button
                type="button"
                class="dialog-disc dialog-disc-cancel"
                matTooltip="Close"
                matTooltipPosition="below"
                aria-label="Close"
                (click)="close.emit()">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          </div>
        </div>

        <div class="shopping-bloom-body">
          <app-shopping-panel />
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./shopping-bloom.scss'],
})
export class ShoppingBloomComponent {
  /** Close the bloom (X or backdrop click). */
  readonly close = output<void>();

  private readonly panel = viewChild.required(ShoppingPanelComponent);

  /** Prefer the server-rendered PDF (POST …/shopping-list/pdf) — it merges the
   *  computed list with the user's staples and formats consistently. If that
   *  endpoint is unavailable, fall back to a browser print of the on-screen list. */
  async print(): Promise<void> {
    if (await this.panel().downloadPdf()) return;
    this.clientPrint();
  }

  /** Fallback: expand every category, then invoke the browser print dialog (the
   *  user can "Save as PDF"). A body class isolates the bloom window for print
   *  (see the @media print block in styles.scss). */
  private clientPrint(): void {
    this.panel().openAllCategories();
    document.body.classList.add('printing-shopping-list');
    const cleanup = (): void => {
      document.body.classList.remove('printing-shopping-list');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    // Let the expanded categories paint before the print snapshot.
    setTimeout(() => window.print(), 60);
  }
}
