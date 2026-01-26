// src/app/components/chat/chat.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { ChatOutputComponent } from './chat-output/chat-output';

@Component({
  selector: 'app-chat',
  imports: [CommonModule, ChatOutputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-container">
      <!-- Status header - permanent toast area -->
      <div class="chat-status-header" [class.prompt-mode]="chatService.isPromptMeActive()">
        <span class="status-text">{{ chatService.statusMessage() }}</span>
      </div>

      <!-- Action buttons - top right -->
      <div class="action-buttons">
        <button
          class="icon-btn new-chat-btn"
          (click)="startNewChat()"
          title="New conversation"
          [disabled]="chatService.isLoading()">
          +
        </button>
        <button
          class="icon-btn close-btn"
          (click)="close()"
          title="Close">
          ✕
        </button>
      </div>

      <!-- Chat output area -->
      <app-chat-output />
    </div>
  `,
  styleUrls: ['./chat.scss']
})
export class ChatComponent {
  private tabService = inject(TabService);
  chatService = inject(ChatService);

  close(): void {
    this.tabService.closeTab('chat');
  }

  startNewChat(): void {
    this.chatService.startNewConversation();
  }
}
