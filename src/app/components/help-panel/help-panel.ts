// src/app/components/help-panel/help-panel.ts
//
// The Help panel — a Menus & Meals-style header bar (a big "?" glyph + "Help", a
// Clear-all key, and the red-X close) over the chat conversation view. No macros
// bar here (that's gated to the menus tab; Help is its own tab). The persistent
// chat input at the bottom of the shell drives the conversation.
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { ChatOutputComponent } from '../chat/chat-output/chat-output';

@Component({
  selector: 'app-help-panel',
  imports: [MatIconModule, MatTooltipModule, ChatOutputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="help-panel-container">
      <!-- Header bar — same chrome as the Menus & Meals toolbar. -->
      <div class="help-toolbar">
        <span class="toolbar-title">
          <span class="help-q" aria-hidden="true">?</span>Help
        </span>
        <div class="toolbar-buttons">
          <!-- Clear all — wipe the conversation. -->
          <button
            type="button"
            class="wipe-help-btn"
            matTooltip="Clear the conversation"
            matTooltipPosition="above"
            [disabled]="chatService.messages().length === 0"
            (click)="onClearAll()">
            <mat-icon class="wipe-icon" aria-hidden="true">clear_all</mat-icon>
          </button>
        </div>
        <!-- Exit — red X disc, far right (matches Menus & Meals). -->
        <button
          type="button"
          class="dialog-disc dialog-disc-cancel help-close-disc"
          matTooltip="Close Help panel"
          matTooltipPosition="above"
          aria-label="Close Help panel"
          (click)="tabService.closePanel()">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </div>

      <app-chat-output />
    </div>
  `,
  styleUrls: ['./help-panel.scss'],
})
export class HelpPanelComponent {
  protected tabService = inject(TabService);
  protected chatService = inject(ChatService);

  onClearAll(): void {
    this.chatService.clearContextSession('chat');
  }
}
