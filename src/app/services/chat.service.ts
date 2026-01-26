// src/app/services/chat.service.ts
// Unified chat service: status, AI streaming, session management
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { NotificationService } from './notification.service';
import {
  ChatMessage,
  ChatRequest,
  StreamEvent,
  SessionStatus
} from '../models/generated/chat.schema';

const SESSION_STORAGE_KEY = 'yeh_chat_session_id';
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface StoredSession {
  sessionId: string;
  lastActivity: number; // timestamp
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private baseUrl = environment.apiUrl;

  // ============================================
  // STATUS (merged from chat-status.service)
  // ============================================

  /** Whether "Prompt Me" mode is active */
  isPromptMeActive = signal(false);

  /** User's first name from Auth0 */
  private userFirstName = toSignal(
    this.auth.user$.pipe(
      map(user => {
        if (!user?.name) return 'You';
        const firstName = user.name.split(' ')[0];
        return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
      })
    ),
    { initialValue: 'You' }
  );

  /** Status message for header display */
  statusMessage = computed(() => {
    if (this.isPromptMeActive()) {
      return `YEH is prompting ${this.userFirstName()}`;
    }
    return 'AI-driven Nutrition Planner';
  });

  togglePromptMe(): void {
    this.isPromptMeActive.update(v => !v);
  }

  setPromptMe(active: boolean): void {
    this.isPromptMeActive.set(active);
  }

  // ============================================
  // CHAT STATE
  // ============================================

  /** All messages in current conversation */
  messages = signal<ChatMessage[]>([]);

  /** Current streaming content (while receiving) */
  streamingContent = signal<string>('');

  /** Whether a request is in progress */
  isLoading = signal(false);

  /** Current session ID */
  private sessionId = signal<string | null>(null);

  /** Tokens remaining in context window */
  tokensRemaining = signal<number>(28000); // PracticalLimit from API

  /** Session status */
  sessionStatus = signal<SessionStatus>('ACTIVE');

  constructor() {
    this.loadSession();
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /** Load session from localStorage if valid */
  private loadSession(): void {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const session: StoredSession = JSON.parse(stored);
        const elapsed = Date.now() - session.lastActivity;

        if (elapsed < SESSION_TIMEOUT_MS) {
          this.sessionId.set(session.sessionId);
          // Optionally load message history from API
          this.loadSessionHistory(session.sessionId);
        } else {
          // Session timed out
          this.clearSession();
        }
      }
    } catch {
      this.clearSession();
    }
  }

  /** Save session to localStorage */
  private saveSession(id: string): void {
    const session: StoredSession = {
      sessionId: id,
      lastActivity: Date.now()
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    this.sessionId.set(id);
  }

  /** Clear session from localStorage */
  clearSession(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    this.sessionId.set(null);
    this.messages.set([]);
    this.sessionStatus.set('ACTIVE');
    this.tokensRemaining.set(28000);
  }

  /** Load message history for existing session */
  private async loadSessionHistory(sessionId: string): Promise<void> {
    try {
      const token = await firstValueFrom(this.auth.getAccessTokenSilently());
      const url = `${this.baseUrl}/ai/chat/sessions/${sessionId}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const session = await response.json();
        // Filter out system messages for display
        const displayMessages = session.messages.filter(
          (m: ChatMessage) => m.role !== 'system'
        );
        this.messages.set(displayMessages);
        this.sessionStatus.set(session.status);
      } else if (response.status === 404) {
        // Session not found, start fresh
        this.clearSession();
      }
    } catch (error) {
      console.error('Failed to load session history:', error);
      this.clearSession();
    }
  }

  // ============================================
  // CHAT API - SSE STREAMING
  // ============================================

  /** Send a message and stream the response */
  async sendMessage(message: string): Promise<void> {
    if (this.isLoading() || !message.trim()) return;

    this.isLoading.set(true);
    this.streamingContent.set('');

    // Add user message to display immediately
    const userMessage: ChatMessage = {
      role: 'user',
      content: message.trim()
    };
    this.messages.update(msgs => [...msgs, userMessage]);

    try {
      const token = await firstValueFrom(this.auth.getAccessTokenSilently());

      const request: ChatRequest = {
        message: message.trim()
      };

      // Include session ID if we have one
      const currentSessionId = this.sessionId();
      if (currentSessionId) {
        request.sessionId = currentSessionId;
        console.log('[ChatService] Sending message with sessionId:', currentSessionId);
      } else {
        console.log('[ChatService] Sending message - new session (no sessionId)');
      }

      const response = await fetch(`${this.baseUrl}/ai/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await this.processSSEStream(response);

    } catch (error) {
      console.error('Chat error:', error);
      this.notification.show('Failed to send message. Please try again.', 'error');

      // Remove the user message on error
      this.messages.update(msgs => msgs.slice(0, -1));
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Process SSE stream from response */
  private async processSSEStream(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr) {
              try {
                const event: StreamEvent = JSON.parse(jsonStr);
                this.handleStreamEvent(event, fullContent);

                if (event.type === 'content' && event.delta) {
                  fullContent += event.delta;
                  this.streamingContent.set(fullContent);
                }

                if (event.type === 'done') {
                  // Finalize the assistant message
                  const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: fullContent
                  };
                  this.messages.update(msgs => [...msgs, assistantMessage]);
                  this.streamingContent.set('');
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE event:', jsonStr);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** Handle individual stream events */
  private handleStreamEvent(event: StreamEvent, currentContent: string): void {
    // Capture session ID from first event
    if (event.sessionId && !this.sessionId()) {
      console.log('[ChatService] Captured new sessionId:', event.sessionId);
      this.saveSession(event.sessionId);
    }

    // Update session on activity
    if (this.sessionId()) {
      this.saveSession(this.sessionId()!);
    }

    // Debug: Log session tracking on done events
    if (event.type === 'done') {
      console.log('[ChatService] Stream done - sessionId:', this.sessionId(), 'status:', event.sessionStatus);
    }

    if (event.type === 'done') {
      // Update context tracking
      if (event.tokensRemaining !== undefined) {
        this.tokensRemaining.set(event.tokensRemaining);
      }

      if (event.sessionStatus) {
        this.sessionStatus.set(event.sessionStatus);
      }

      // Show context warnings
      if (event.contextWarning) {
        this.notification.show(event.contextWarning, 'warning');
      }

      // Handle session status changes
      if (event.sessionStatus === 'CONTEXT_LIMIT_REACHED') {
        this.notification.show('Context limit reached. Starting a new session.', 'warning');
        this.clearSession();
      } else if (event.sessionStatus === 'TIMEOUT_INACTIVE') {
        this.notification.show('Session timed out. Starting a new session.', 'warning');
        this.clearSession();
      }
    }

    if (event.type === 'error') {
      console.error('Stream error:', event.error);
      this.notification.show(event.error || 'An error occurred', 'error');
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /** Start a new conversation */
  startNewConversation(): void {
    this.clearSession();
    this.notification.show('Started new conversation', 'success');
  }

  /** Get current session ID (for debugging/display) */
  getCurrentSessionId(): string | null {
    return this.sessionId();
  }
}
