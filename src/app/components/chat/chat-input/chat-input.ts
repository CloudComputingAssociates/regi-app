// src/app/components/chat/chat-input/chat-input.ts
import { Component, signal, computed, effect, ChangeDetectionStrategy, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChatService, ChatContext, ChatEntryContext } from '../../../services/chat.service';
import { TabService } from '../../../services/tab.service';

@Component({
  selector: 'app-chat-input',
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-input-container">

      <!-- Context area (grows above input when entry context is set) -->
      @if (entryContext(); as ctx) {
        <div class="context-area">
          @if (ctx.type === 'ai-recipe') {
            <div class="context-row">
              <img src="images/AI-star.png" alt="AI" class="context-icon" />
              <span class="context-label">Cooking method:</span>
              <select class="context-select"
                      [ngModel]="selectedCookingMethod()"
                      (ngModelChange)="selectedCookingMethod.set($event)">
                @for (method of cookingMethods(); track method) {
                  <option [value]="method">{{ method }}</option>
                }
              </select>
              <button class="context-dismiss" (click)="dismissContext()" aria-label="Dismiss">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
        </div>
      }

      <div class="input-wrapper">

        <!-- Prompt Me Button (Left) -->
        <button
          class="prompt-me-btn"
          [class.active]="chatService.isPromptMeActive()"
          (click)="togglePromptMe()"
          [disabled]="chatService.isLoading()"
          [attr.aria-label]="chatService.isPromptMeActive() ? 'Stop prompt mode' : 'Start prompt mode'"
          matTooltip="Prompt me"
          matTooltipPosition="above"
          [matTooltipShowDelay]="500"
          [matTooltipHideDelay]="5000">
          <img src="/images/prompt-me.png" alt="Prompt me" class="prompt-me-icon" />
        </button>

        <!-- Text Input (Center) -->
        <textarea
          #textInput
          class="message-input"
          [(ngModel)]="messageText"
          (keydown)="onKeyDown($event)"
          [placeholder]="placeholder()"
          [disabled]="chatService.isLoading()"
          [attr.aria-label]="'Message input'"
          rows="2"></textarea>

        <!-- Send Button (Right) -->
        <button
          class="send-btn"
          (click)="submitMessage()"
          [disabled]="chatService.isLoading()"
          aria-label="Send message"
          matTooltip="Send"
          matTooltipPosition="above"
          [matTooltipShowDelay]="500">
          <mat-icon>keyboard_return</mat-icon>
        </button>

      </div>
    </div>
  `,
  styleUrls: ['./chat-input.scss']
})
export class ChatInputComponent {
  chatService = inject(ChatService);
  private tabService = inject(TabService);

  messageText = '';
  placeholder = signal('yeh? ');
  messageSubmit = output<string>();
  promptMeToggle = output<boolean>();

  // Entry context from ChatService
  entryContext = this.chatService.entryContext;
  selectedCookingMethod = signal('stovetop');

  cookingMethods = computed(() => {
    const ctx = this.entryContext();
    if (ctx?.type === 'ai-recipe' && ctx.data?.['cookingMethods']) {
      return ctx.data['cookingMethods'] as string[];
    }
    return [];
  });

  constructor() {
    // When entry context arrives, prefill the input
    effect(() => {
      const ctx = this.chatService.entryContext();
      if (ctx?.prefill) {
        this.messageText = ctx.prefill;
        this.selectedCookingMethod.set('stovetop');
      }
    });
  }

  /** Determine chat context from active tab */
  private activeContext = computed((): ChatContext => {
    const tabId = this.tabService.activeTabId();
    if (tabId === 'meal-planning') return 'regimenu';
    if (tabId === 'preferences') return 'preferences';
    return 'chat';
  });

  togglePromptMe(): void {
    this.chatService.togglePromptMe();
    this.promptMeToggle.emit(this.chatService.isPromptMeActive());
  }

  onKeyDown(event: KeyboardEvent): void {
    // Submit on Enter (without Shift)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submitMessage();
    }
  }

  submitMessage(): void {
    let text = this.messageText.trim();
    const ctx = this.activeContext();

    // Weave in context data (e.g., cooking method) before sending
    const entry = this.chatService.entryContext();
    if (entry?.type === 'ai-recipe' && text) {
      text = `${text}\n\nCooking method: ${this.selectedCookingMethod()}`;
    }

    if (text && !this.chatService.getIsLoading(ctx)) {
      // Open and focus the chat tab if sending to main chat context
      if (ctx === 'chat') {
        this.tabService.openTab('chat', 'Chat');
        this.tabService.switchToTab('chat');
      }
      this.chatService.sendMessage(text, ctx);
      this.messageSubmit.emit(text);
      this.messageText = '';
      this.chatService.clearEntryContext();
    }
  }

  dismissContext(): void {
    this.chatService.clearEntryContext();
    this.messageText = '';
  }

}
