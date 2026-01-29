// src/app/services/chat.service.ts
// Unified chat service: status, AI streaming, multi-context session management
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

export type ChatContext = 'chat' | 'regimenu' | 'preferences';

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const STORAGE_KEYS: Record<ChatContext, string> = {
  chat: 'yeh_chat_session_id',
  regimenu: 'yeh_regimenu_session_id',
  preferences: 'yeh_preferences_session_id'
};

const SESSION_TYPES: Record<ChatContext, 'CHAT' | 'REGIMENU' | 'PREFERENCES'> = {
  chat: 'CHAT',
  regimenu: 'REGIMENU',
  preferences: 'PREFERENCES'
};

interface StoredSession {
  sessionId: string;
  lastActivity: number;
}

interface ContextState {
  messages: ChatMessage[];
  streamingContent: string;
  isLoading: boolean;
  sessionId: string | null;
  tokensRemaining: number;
  sessionStatus: SessionStatus;
}

function createDefaultState(): ContextState {
  return {
    messages: [],
    streamingContent: '',
    isLoading: false,
    sessionId: null,
    tokensRemaining: 28000,
    sessionStatus: 'ACTIVE'
  };
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
  // MULTI-CONTEXT CHAT STATE
  // ============================================

  /** Per-context state signals */
  private chatState = signal<ContextState>(createDefaultState());
  private regimenuState = signal<ContextState>(createDefaultState());
  private preferencesState = signal<ContextState>(createDefaultState());

  /** Get state signal for a context */
  private getStateSignal(ctx: ChatContext) {
    if (ctx === 'regimenu') return this.regimenuState;
    if (ctx === 'preferences') return this.preferencesState;
    return this.chatState;
  }

  // --- Public accessors per context ---

  /** Get messages for a context */
  getMessages(ctx: ChatContext) {
    return this.getStateSignal(ctx)().messages;
  }

  /** Get streaming content for a context */
  getStreamingContent(ctx: ChatContext) {
    return this.getStateSignal(ctx)().streamingContent;
  }

  /** Get loading state for a context */
  getIsLoading(ctx: ChatContext) {
    return this.getStateSignal(ctx)().isLoading;
  }

  // --- Backward-compatible signals for Chat tab (default context) ---

  /** All messages in current chat conversation */
  messages = computed(() => this.chatState().messages);

  /** Current streaming content for chat */
  streamingContent = computed(() => this.chatState().streamingContent);

  /** Whether chat request is in progress */
  isLoading = computed(() => this.chatState().isLoading);

  /** Tokens remaining for chat */
  tokensRemaining = computed(() => this.chatState().tokensRemaining);

  /** Session status for chat */
  sessionStatus = computed(() => this.chatState().sessionStatus);

  // --- Regimenu signals ---

  /** Regimenu messages */
  regimenuMessages = computed(() => this.regimenuState().messages);

  /** Regimenu streaming content */
  regimenuStreamingContent = computed(() => this.regimenuState().streamingContent);

  /** Regimenu loading state */
  regimenuIsLoading = computed(() => this.regimenuState().isLoading);

  // --- Preferences signals ---

  /** Preferences messages */
  preferencesMessages = computed(() => this.preferencesState().messages);

  /** Preferences streaming content */
  preferencesStreamingContent = computed(() => this.preferencesState().streamingContent);

  /** Preferences loading state */
  preferencesIsLoading = computed(() => this.preferencesState().isLoading);

  constructor() {
    this.loadSession('chat');
    this.loadSession('regimenu');
    this.loadSession('preferences');
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /** Load session from localStorage if valid */
  private loadSession(ctx: ChatContext): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS[ctx]);
      if (stored) {
        const session: StoredSession = JSON.parse(stored);
        const elapsed = Date.now() - session.lastActivity;

        if (elapsed < SESSION_TIMEOUT_MS) {
          this.updateState(ctx, { sessionId: session.sessionId });
          this.loadSessionHistory(ctx, session.sessionId);
        } else {
          this.clearContextSession(ctx);
        }
      }
    } catch {
      this.clearContextSession(ctx);
    }
  }

  /** Save session to localStorage for a context */
  private saveContextSession(ctx: ChatContext, id: string): void {
    const session: StoredSession = {
      sessionId: id,
      lastActivity: Date.now()
    };
    localStorage.setItem(STORAGE_KEYS[ctx], JSON.stringify(session));
    this.updateState(ctx, { sessionId: id });
  }

  /** Clear session for a specific context */
  clearContextSession(ctx: ChatContext): void {
    localStorage.removeItem(STORAGE_KEYS[ctx]);
    const stateSignal = this.getStateSignal(ctx);
    stateSignal.set(createDefaultState());
  }

  /** Clear the default chat session (backward compat) */
  clearSession(): void {
    this.clearContextSession('chat');
  }

  /** Load message history for existing session */
  private async loadSessionHistory(ctx: ChatContext, sessionId: string): Promise<void> {
    try {
      const token = await firstValueFrom(this.auth.getAccessTokenSilently());
      const url = `${this.baseUrl}/ai/chat/sessions/${sessionId}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const session = await response.json();
        const displayMessages = session.messages.filter(
          (m: ChatMessage) => m.role !== 'system'
        );
        this.updateState(ctx, {
          messages: displayMessages,
          sessionStatus: session.status
        });
      } else if (response.status === 404) {
        this.clearContextSession(ctx);
      }
    } catch (error) {
      console.error(`Failed to load ${ctx} session history:`, error);
      this.clearContextSession(ctx);
    }
  }

  // ============================================
  // CHAT API - SSE STREAMING
  // ============================================

  /** Send a message in a specific context */
  async sendMessage(message: string, ctx: ChatContext = 'chat'): Promise<void> {
    const state = this.getStateSignal(ctx)();
    if (state.isLoading || !message.trim()) return;

    this.updateState(ctx, { isLoading: true, streamingContent: '' });

    const userMessage: ChatMessage = {
      role: 'user',
      content: message.trim()
    };
    this.updateState(ctx, {
      messages: [...state.messages, userMessage]
    });

    try {
      const token = await firstValueFrom(this.auth.getAccessTokenSilently());

      const request: ChatRequest = {
        message: message.trim(),
        sessionType: SESSION_TYPES[ctx]
      };

      const currentSessionId = this.getStateSignal(ctx)().sessionId;
      if (currentSessionId) {
        request.sessionId = currentSessionId;
        console.log(`[ChatService:${ctx}] Sending message with sessionId:`, currentSessionId);
      } else {
        console.log(`[ChatService:${ctx}] Sending message - new session`);
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
        if (response.status === 401) {
          // Token expired - Auth0 error$ listener in app.ts will handle logout.
          // Trigger a silent token refresh attempt to surface the error.
          this.auth.getAccessTokenSilently().subscribe({ error: () => {} });
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await this.processSSEStream(response, ctx);

    } catch (error) {
      console.error(`${ctx} chat error:`, error);
      this.notification.show('Failed to send message. Please try again.', 'error');

      // Remove the user message on error
      const currentMessages = this.getStateSignal(ctx)().messages;
      this.updateState(ctx, { messages: currentMessages.slice(0, -1) });
    } finally {
      this.updateState(ctx, { isLoading: false });
    }
  }

  /** Process SSE stream from response */
  private async processSSEStream(response: Response, ctx: ChatContext): Promise<void> {
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

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr) {
              try {
                const event: StreamEvent = JSON.parse(jsonStr);
                this.handleStreamEvent(event, ctx);

                if (event.type === 'content' && event.delta) {
                  fullContent += event.delta;
                  this.updateState(ctx, { streamingContent: fullContent });
                }

                if (event.type === 'done') {
                  const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: fullContent
                  };
                  const currentMessages = this.getStateSignal(ctx)().messages;
                  this.updateState(ctx, {
                    messages: [...currentMessages, assistantMessage],
                    streamingContent: ''
                  });
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
  private handleStreamEvent(event: StreamEvent, ctx: ChatContext): void {
    if (event.sessionId) {
      this.saveContextSession(ctx, event.sessionId);
    } else {
      const currentId = this.getStateSignal(ctx)().sessionId;
      if (currentId) {
        this.saveContextSession(ctx, currentId);
      }
    }

    if (event.type === 'done') {
      console.log(`[ChatService:${ctx}] Stream done - sessionId:`, this.getStateSignal(ctx)().sessionId, 'status:', event.sessionStatus);

      const updates: Partial<ContextState> = {};
      if (event.tokensRemaining !== undefined) {
        updates.tokensRemaining = event.tokensRemaining;
      }
      if (event.sessionStatus) {
        updates.sessionStatus = event.sessionStatus;
      }
      if (Object.keys(updates).length > 0) {
        this.updateState(ctx, updates);
      }

      if (event.contextWarning) {
        this.notification.show(event.contextWarning, 'warning');
      }

      if (event.sessionStatus === 'CONTEXT_LIMIT_REACHED') {
        this.notification.show('Context limit reached. Starting a new session.', 'warning');
        this.clearContextSession(ctx);
      } else if (event.sessionStatus === 'TIMEOUT_INACTIVE') {
        this.notification.show('Session timed out. Starting a new session.', 'warning');
        this.clearContextSession(ctx);
      }
    }

    if (event.type === 'error') {
      console.error('Stream error:', event.error);
      this.notification.show(event.error || 'An error occurred', 'error');
    }
  }

  // ============================================
  // STATE HELPERS
  // ============================================

  private updateState(ctx: ChatContext, partial: Partial<ContextState>): void {
    const stateSignal = this.getStateSignal(ctx);
    stateSignal.update(current => ({ ...current, ...partial }));
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /** Start a new conversation for a context */
  startNewConversation(ctx: ChatContext = 'chat'): void {
    this.clearContextSession(ctx);
    this.notification.show('Started new conversation', 'success');
  }

  /** Get current session ID (for debugging/display) */
  getCurrentSessionId(ctx: ChatContext = 'chat'): string | null {
    return this.getStateSignal(ctx)().sessionId;
  }
}
