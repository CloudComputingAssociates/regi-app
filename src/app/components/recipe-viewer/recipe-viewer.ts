// src/app/components/recipe-viewer/recipe-viewer.ts
import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-recipe-viewer',
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="recipe-viewer-container">
      <div class="recipe-toolbar">
        <span class="recipe-title">Recipe</span>
        <span class="recipe-url-display">{{ recipeUrl() }}</span>
        <button class="toolbar-btn" (click)="print()"
          matTooltip="Print recipe" matTooltipPosition="below">
          <mat-icon>print</mat-icon>
        </button>
        <button class="toolbar-btn" (click)="close()"
          matTooltip="Close" matTooltipPosition="below">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="recipe-frame-wrapper">
        @if (safeUrl()) {
          <iframe
            class="recipe-frame"
            [src]="safeUrl()">
          </iframe>
        } @else {
          <div class="no-recipe">
            <mat-icon class="no-recipe-icon">link_off</mat-icon>
            <p>No recipe URL provided</p>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./recipe-viewer.scss']
})
export class RecipeViewerComponent {
  private sanitizer = inject(DomSanitizer);
  private tabService = inject(TabService);

  readonly recipeUrl = this.tabService.recipeViewerUrl;

  readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.recipeUrl();
    if (!url) return null;
    if (url.toLowerCase().endsWith('.pdf')) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
      );
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  async print(): Promise<void> {
    const url = this.recipeUrl();
    if (!url) return;
    try {
      // Fetch PDF as blob, create same-origin URL, print from hidden iframe
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const printFrame = document.createElement('iframe');
      printFrame.style.display = 'none';
      printFrame.src = blobUrl;
      document.body.appendChild(printFrame);
      printFrame.onload = () => {
        printFrame.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(printFrame);
          URL.revokeObjectURL(blobUrl);
        }, 1000);
      };
    } catch {
      window.open(url, '_blank');
    }
  }

  close(): void {
    this.tabService.closeTab('recipe-viewer');
  }
}
