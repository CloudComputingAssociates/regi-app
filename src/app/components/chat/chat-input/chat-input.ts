// src/app/components/chat/chat-input/chat-input.ts
import { Component, signal, ChangeDetectionStrategy, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChatService } from '../../../services/chat.service';

@Component({
  selector: 'app-chat-input',
  imports: [CommonModule, FormsModule, MatButtonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-input-container">
      <div class="input-wrapper">

        <!-- Prompt Me Button (Left) -->
        <button
          class="prompt-me-btn"
          [class.active]="chatService.isPromptMeActive()"
          (click)="togglePromptMe()"
          [disabled]="chatService.isLoading()"
          [attr.aria-label]="chatService.isPromptMeActive() ? 'Stop prompt mode' : 'Start prompt mode'"
          matTooltip="Reverse: prompt me"
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

        <!-- TTS Button (Right) -->
        <button
          class="tts-btn"
          [class.active]="isTTSActive()"
          (click)="toggleTTS()"
          [attr.aria-label]="isTTSActive() ? 'Disable voice' : 'Enable voice'"
          matTooltip="Voice input/output"
          matTooltipPosition="above"
          [matTooltipShowDelay]="500"
          [matTooltipHideDelay]="5000">
          <img src="/images/speak-icon.png" alt="Voice" class="tts-icon" />
        </button>

      </div>
    </div>
  `,
  styleUrls: ['./chat-input.scss']
})
export class ChatInputComponent {
  chatService = inject(ChatService);

  messageText = '';
  placeholder = signal('yeh? ');
  isTTSActive = signal(false);

  messageSubmit = output<string>();
  promptMeToggle = output<boolean>();
  ttsToggle = output<boolean>();

  togglePromptMe(): void {
    this.chatService.togglePromptMe();
    this.promptMeToggle.emit(this.chatService.isPromptMeActive());
  }

  toggleTTS(): void {
    const newMode = !this.isTTSActive();
    this.isTTSActive.set(newMode);
    this.ttsToggle.emit(newMode);
  }

  onKeyDown(event: KeyboardEvent): void {
    // Submit on Enter (without Shift)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submitMessage();
    }
  }

  submitMessage(): void {
    const text = this.messageText.trim();
    if (text && !this.chatService.isLoading()) {
      // Send directly to chat service
      this.chatService.sendMessage(text);
      this.messageSubmit.emit(text);
      this.messageText = '';
    }
  }
}
