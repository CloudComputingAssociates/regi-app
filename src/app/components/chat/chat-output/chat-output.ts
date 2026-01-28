// src/app/components/chat/chat-output/chat-output.ts
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  ElementRef,
  viewChild,
  effect,
  Pipe,
  PipeTransform
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../../../services/chat.service';

/**
 * Simple markdown pipe for basic formatting
 * Handles: **bold**, *italic*, `code`, ```code blocks```, - lists
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';

    let html = this.escapeHtml(value);

    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // Inline code (`...`)
    html = html.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');

    // Bold (**...** or __...__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic (*...* or _..._)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Unordered lists (- item)
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists (1. item)
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up extra breaks inside pre/ul
    html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
      return '<pre><code>' + code.replace(/<br>/g, '\n') + '</code></pre>';
    });
    html = html.replace(/<ul>([\s\S]*?)<\/ul>/g, (match, items) => {
      return '<ul>' + items.replace(/<br>/g, '') + '</ul>';
    });

    return html;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

@Component({
  selector: 'app-chat-output',
  imports: [CommonModule, MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-output-container" #scrollContainer>
      <div class="messages-list">
        @for (message of chatService.messages(); track $index) {
          <div class="message" [class.user]="message.role === 'user'" [class.assistant]="message.role === 'assistant'">
            <div class="message-avatar">
              @if (message.role === 'user') {
                <span class="avatar-name">YOU</span>
              } @else {
                <img src="/images/YEH3.png" alt="YEH" class="avatar-img" />
              }
            </div>
            <div class="message-content" [innerHTML]="message.content | markdown"></div>
          </div>
        }

        <!-- Streaming response -->
        @if (chatService.streamingContent()) {
          <div class="message assistant streaming">
            <div class="message-avatar">
              <img src="/images/YEH3.png" alt="YEH" class="avatar-img" />
            </div>
            <div class="message-content" [innerHTML]="chatService.streamingContent() | markdown">
            </div>
            <span class="typing-indicator">▋</span>
          </div>
        }

        <!-- Loading indicator when waiting for stream to start -->
        @if (chatService.isLoading() && !chatService.streamingContent()) {
          <div class="message assistant loading">
            <div class="message-avatar">
              <img src="/images/YEH3.png" alt="YEH" class="avatar-img" />
            </div>
            <div class="message-content">
              <span class="loading-dots">
                <span>.</span><span>.</span><span>.</span>
              </span>
            </div>
          </div>
        }

        <!-- Empty state -->
        @if (chatService.messages().length === 0 && !chatService.isLoading()) {
          <div class="empty-state">
            <img src="/images/YEH3.png" alt="YEH" class="empty-logo" />
            <p class="empty-text">Ask me anything about nutrition!</p>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./chat-output.scss']
})
export class ChatOutputComponent {
  chatService = inject(ChatService);

  private scrollContainer = viewChild<ElementRef<HTMLDivElement>>('scrollContainer');

  constructor() {
    // Auto-scroll to bottom when messages change or streaming updates
    effect(() => {
      // Track these signals to trigger effect
      this.chatService.messages();
      this.chatService.streamingContent();

      // Use requestAnimationFrame to scroll after DOM update
      requestAnimationFrame(() => this.scrollToBottom());
    });
  }

  private scrollToBottom(): void {
    const container = this.scrollContainer()?.nativeElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}
