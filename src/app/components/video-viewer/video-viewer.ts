// src/app/components/video-viewer/video-viewer.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-video-viewer',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="video-viewer-container">
      <div class="video-toolbar">
        <span class="video-title">YouTube Player</span>
        <button class="close-btn" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="video-frame-wrapper">
        @if (safeUrl()) {
          <iframe
            class="video-frame"
            [src]="safeUrl()"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen>
          </iframe>
        } @else {
          <div class="no-video">
            <mat-icon class="no-video-icon">videocam_off</mat-icon>
            <p>No video URL provided</p>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./video-viewer.scss']
})
export class VideoViewerComponent {
  private sanitizer = inject(DomSanitizer);
  private tabService = inject(TabService);

  readonly videoUrl = this.tabService.videoViewerUrl;

  readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.videoUrl();
    if (!url) return null;
    const embedUrl = this.toEmbedUrl(url);
    return embedUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl) : null;
  });

  close(): void {
    this.tabService.closeTab('video-viewer');
  }

  private toEmbedUrl(url: string): string | null {
    // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
    let videoId: string | null = null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com')) {
        if (parsed.pathname.startsWith('/embed/')) {
          return url; // Already an embed URL
        }
        videoId = parsed.searchParams.get('v');
      } else if (parsed.hostname === 'youtu.be') {
        videoId = parsed.pathname.slice(1);
      }
    } catch {
      return null;
    }
    if (videoId) {
      return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
    }
    // Non-YouTube URL: try embedding directly
    return url;
  }
}
