// src/app/components/chat/chat.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { ChatOutputComponent } from './chat-output/chat-output';

@Component({
  selector: 'app-chat',
  imports: [CommonModule, MatIconModule, MatTooltipModule, ChatOutputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-container">
      <!-- Contextual hand-off banner — shown when another surface (e.g.
           Build-a-Meal's "Ask Regi") sent the user here. The Back control returns
           to the origin. Ordinary chat has no banner. -->
      @if (tabService.chatOrigin(); as origin) {
        <div class="chat-origin-banner">
          <button
            type="button"
            class="chat-origin-back"
            (click)="tabService.returnFromChatOrigin()"
            matTooltip="Back to Build-a-Meal"
            matTooltipPosition="below"
            aria-label="Back to Build-a-Meal">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <span class="chat-origin-title">{{ origin.title }}</span>
        </div>
      }

      <!-- Status line — New / Clear keys inline with the status text on ONE row
           (no separate title row, no wasted vertical space). -->
      <div class="chat-status-header" [class.prompt-mode]="chatService.isPromptMeActive()">
        <div class="action-buttons">
          <!-- New -->
          <button
            class="icon-btn new-chat-btn"
            (click)="startNewChat()"
            matTooltip="New conversation"
            matTooltipPosition="above"
            [disabled]="chatService.isLoading()">
            <mat-icon>add</mat-icon>
          </button>
          <!-- Clear — Material clear-all (three lines), not a wastebasket. -->
          <button
            class="icon-btn clear-chat-btn"
            (click)="clearChat()"
            matTooltip="Clear conversation"
            matTooltipPosition="above"
            [disabled]="chatService.isLoading() || chatService.messages().length === 0">
            <mat-icon>clear_all</mat-icon>
          </button>
        </div>
        <span class="status-text">{{ chatService.statusMessage() }}</span>
      </div>

      <!-- Chat output area -->
      <app-chat-output />
    </div>
  `,
  styleUrls: ['./chat.scss']
})
export class ChatComponent {
  protected tabService = inject(TabService);
  chatService = inject(ChatService);

  startNewChat(): void {
    this.chatService.startNewConversation();
  }

  clearChat(): void {
    this.chatService.clearContextSession('chat');
  }
}
