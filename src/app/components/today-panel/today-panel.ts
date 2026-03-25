// src/app/components/today-panel/today-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, ElementRef, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChatOutputComponent } from '../chat/chat-output/chat-output';

@Component({
  selector: 'app-today-panel',
  imports: [CommonModule, MatTooltipModule, ChatOutputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container" #panelContainer>

      <!-- Top pane: Content -->
      <div class="content-pane" [style.flex]="aiPanelOpen() ? topFlex() : '1 1 0%'">
        <div class="panel-content">
          <!-- Action buttons -->
          <div class="action-buttons">
            <div class="action-left">
              <button
                class="icon-btn ai-btn"
                [class.ai-active]="aiPanelOpen()"
                (click)="toggleAiPanel()"
                matTooltip="AI assist"
                matTooltipPosition="above"
                [matTooltipShowDelay]="300">
                <img src="/images/AI-star-white.png" alt="AI" class="ai-btn-icon" />
              </button>
              <span class="ai-label">AI assistant</span>
            </div>
            <div class="action-right">
              <button
                class="icon-btn save-btn"
                [class.has-changes]="hasChanges()"
                [disabled]="isSaving()"
                (click)="save()"
                matTooltip="Save"
                matTooltipPosition="above"
                [matTooltipShowDelay]="300">
                @if (isSaving()) {
                  <span class="save-spinner"></span>
                } @else {
                  ✓
                }
              </button>
            </div>
          </div>

          <!-- Today content placeholder -->
          <div class="today-placeholder">
            Today — coming soon
          </div>
        </div>
      </div>

      @if (aiPanelOpen()) {
        <!-- Draggable splitter -->
        <div
          class="splitter-bar"
          (mousedown)="onSplitterMouseDown($event)"
          (touchstart)="onSplitterTouchStart($event)">
          <span class="splitter-grip">⇕</span>
        </div>

        <!-- Bottom pane: AI Output -->
        <div class="chat-pane" [style.flex]="bottomFlex()">
          <div class="chat-pane-header">
            <span class="chat-pane-label">Today AI Output</span>
          </div>
          <app-chat-output context="today" [condensed]="true" />
        </div>
      }
    </div>
  `,
  styleUrls: ['./today-panel.scss']
})
export class TodayPanelComponent implements OnDestroy {
  private tabService = inject(TabService);
  chatService = inject(ChatService);
  private el = inject(ElementRef);
  private ngZone = inject(NgZone);

  isSaving = signal(false);
  hasChanges = signal(false);
  aiPanelOpen = signal(false);

  // Splitter state: default 2/3 top, 1/3 bottom
  topFlex = signal('2 1 0%');
  bottomFlex = signal('1 1 0%');

  private isDragging = false;
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: (() => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: (() => void) | null = null;

  ngOnDestroy(): void {
    this.cleanupDragListeners();
  }

  toggleAiPanel(): void {
    this.aiPanelOpen.update(v => !v);
  }

  save(): void {
    // Placeholder for future save logic
  }

  close(): void {
    this.tabService.closeTab('today');
  }

  // --- Splitter drag logic ---

  onSplitterMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.startDrag();

    this.boundMouseMove = (e: MouseEvent) => this.onDrag(e.clientY);
    this.boundMouseUp = () => this.stopDrag();

    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  onSplitterTouchStart(event: TouchEvent): void {
    event.preventDefault();
    this.startDrag();

    this.boundTouchMove = (e: TouchEvent) => this.onDrag(e.touches[0].clientY);
    this.boundTouchEnd = () => this.stopDrag();

    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd);
  }

  private startDrag(): void {
    this.isDragging = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  private onDrag(clientY: number): void {
    if (!this.isDragging) return;

    const container = this.el.nativeElement.querySelector('.panel-container') as HTMLElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    let ratio = (clientY - rect.top) / rect.height;
    ratio = Math.max(0.2, Math.min(0.8, ratio));

    const topRatio = ratio;
    const bottomRatio = 1 - ratio;

    this.ngZone.run(() => {
      this.topFlex.set(`${topRatio} 1 0%`);
      this.bottomFlex.set(`${bottomRatio} 1 0%`);
    });
  }

  private stopDrag(): void {
    this.isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.cleanupDragListeners();
  }

  private cleanupDragListeners(): void {
    if (this.boundMouseMove) {
      document.removeEventListener('mousemove', this.boundMouseMove);
      this.boundMouseMove = null;
    }
    if (this.boundMouseUp) {
      document.removeEventListener('mouseup', this.boundMouseUp);
      this.boundMouseUp = null;
    }
    if (this.boundTouchMove) {
      document.removeEventListener('touchmove', this.boundTouchMove);
      this.boundTouchMove = null;
    }
    if (this.boundTouchEnd) {
      document.removeEventListener('touchend', this.boundTouchEnd);
      this.boundTouchEnd = null;
    }
  }
}
