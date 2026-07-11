// src/app/components/chat/chat.ts
import { Component, ChangeDetectionStrategy, OnDestroy, inject, signal } from '@angular/core';
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
      <!-- Header: New / Clear keys on the LEFT, "Chat with Regi" embossed +
           centered (engraved like CURATED FOODS). -->
      <div class="chat-header">
        <div class="action-buttons">
          <!-- New (left) -->
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
        <span class="chat-title" [class.animate]="titleAnimating()">Chat with Regi</span>
      </div>

      <!-- Status toast (permanent area) — AI symbol removed. -->
      <div class="chat-status-header" [class.prompt-mode]="chatService.isPromptMeActive()">
        <span class="status-text">{{ chatService.statusMessage() }}</span>
      </div>

      <!-- Chat output area -->
      <app-chat-output />
    </div>
  `,
  styleUrls: ['./chat.scss']
})
export class ChatComponent implements OnDestroy {
  private tabService = inject(TabService);
  chatService = inject(ChatService);

  /** "Chat with Regi" gets a brief flourish at a random 5–20s cadence — Regi
   *  feels alive (unfurl → pop) without nagging. */
  readonly titleAnimating = signal(false);
  private titleTimer: ReturnType<typeof setTimeout> | null = null;
  private titleOffTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.scheduleTitleFlourish();
  }

  ngOnDestroy(): void {
    if (this.titleTimer) clearTimeout(this.titleTimer);
    if (this.titleOffTimer) clearTimeout(this.titleOffTimer);
  }

  private scheduleTitleFlourish(): void {
    const delay = 5000 + Math.random() * 15000; // 5–20s
    this.titleTimer = setTimeout(() => {
      this.titleAnimating.set(true);
      this.titleOffTimer = setTimeout(() => this.titleAnimating.set(false), 1500);
      this.scheduleTitleFlourish();
    }, delay);
  }

  startNewChat(): void {
    this.chatService.startNewConversation();
  }

  clearChat(): void {
    this.chatService.clearContextSession('chat');
  }
}
