// src/app/components/chat/chat.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-chat',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-container">
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
        <div class="placeholder-content">
          <p class="placeholder-text">AI-driven Nutrition Planning</p>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./chat.scss']
})
export class ChatComponent {
  private tabService = inject(TabService);

  close(): void {
    this.tabService.closeTab('chat');
  }
}
