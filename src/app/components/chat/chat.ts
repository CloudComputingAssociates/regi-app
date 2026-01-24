// src/app/components/chat/chat.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';
import { ChatStatusService } from '../../services/chat-status.service';

@Component({
  selector: 'app-chat',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-container">
      <!-- Status header - permanent toast area -->
      <div class="chat-status-header" [class.prompt-mode]="chatStatus.isPromptMeActive()">
        <span class="status-text">{{ chatStatus.statusMessage() }}</span>
      </div>

      <!-- Action button - top right (X only for Chat) -->
      <div class="action-buttons">
        <button
          class="icon-btn close-btn"
          (click)="close()"
          title="Close">
          ✕
        </button>
      </div>

      <div class="chat-messages">
        <!-- Chat messages will go here -->
      </div>
    </div>
  `,
  styleUrls: ['./chat.scss']
})
export class ChatComponent {
  private tabService = inject(TabService);
  chatStatus = inject(ChatStatusService);

  close(): void {
    this.tabService.closeTab('chat');
  }
}
