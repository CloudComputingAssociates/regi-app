// src/app/chat/chat-input.ts
import { Component, signal, ChangeDetectionStrategy, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-input-container">
      <div class="input-wrapper">
        
        <!-- Prompt Me Button (Left) -->
        <button
          class="prompt-me-btn"
          [class.active]="isPromptMeActive()"
          (click)="togglePromptMe()"
          [attr.aria-label]="isPromptMeActive() ? 'Stop prompt mode' : 'Start prompt mode'"
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
  messageText = '';
  placeholder = signal('yeh? ');
  isPromptMeActive = signal(false);
  isTTSActive = signal(false);

  messageSubmit = output<string>();
  promptMeToggle = output<boolean>();
  ttsToggle = output<boolean>();

  togglePromptMe(): void {
    const newMode = !this.isPromptMeActive();
    this.isPromptMeActive.set(newMode);
    this.promptMeToggle.emit(newMode);
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
    if (text) {
      this.messageSubmit.emit(text);
      this.messageText = '';
    }
  }
}