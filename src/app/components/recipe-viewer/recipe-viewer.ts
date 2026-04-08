// src/app/components/recipe-viewer/recipe-viewer.ts
import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-recipe-viewer',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="recipe-viewer-container">
      <div class="recipe-toolbar">
        <span class="recipe-title">Recipe</span>
        <a class="recipe-url" [href]="recipeUrl()" target="_blank" rel="noopener">{{ recipeUrl() }}</a>
        <button class="close-btn" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="recipe-frame-wrapper">
        @if (safeUrl()) {
          <iframe
            class="recipe-frame"
            [src]="safeUrl()"
            sandbox="allow-scripts allow-same-origin allow-popups"
            referrerpolicy="no-referrer">
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
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  close(): void {
    this.tabService.closeTab('recipe-viewer');
  }
}
