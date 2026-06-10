// src/app/services/langfuse-prompt.service.ts
// Thin client for POST /api/ai/langfuse/{promptName}. Reusable for any
// Langfuse-authored prompt — caller supplies the prompt name and the
// variables map; the server fetches the template, substitutes, calls the LLM.
import { Injectable, inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LangfusePromptOptions {
  label?: string;
  version?: number;
  modelOverrides?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
}

export interface LangfusePromptResult {
  text: string;
  promptName: string;
  promptVersion: number;
  modelUsed: string;
}

export type LangfusePromptErrorKind =
  | 'missing_variables'
  | 'invalid_request'
  | 'prompt_not_found'
  | 'llm_failed'
  | 'unauthorized'
  | 'network';

export class LangfusePromptError extends Error {
  constructor(
    public kind: LangfusePromptErrorKind,
    message: string,
    public status?: number,
    public missingVariables?: string[],
  ) {
    super(message);
    this.name = 'LangfusePromptError';
  }
}

@Injectable({ providedIn: 'root' })
export class LangfusePromptService {
  private auth = inject(AuthService);
  private baseUrl = environment.apiUrl;

  async run(
    promptName: string,
    variables: Record<string, string>,
    options?: LangfusePromptOptions,
  ): Promise<LangfusePromptResult> {
    const token = await firstValueFrom(this.auth.getAccessTokenSilently());

    const qs = new URLSearchParams();
    if (options?.label) qs.set('label', options.label);
    if (options?.version != null) qs.set('version', String(options.version));
    const query = qs.toString();
    const url = `${this.baseUrl}/ai/langfuse/${encodeURIComponent(promptName)}${query ? '?' + query : ''}`;

    const body: Record<string, unknown> = { variables };
    if (options?.modelOverrides) body['modelOverrides'] = options.modelOverrides;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new LangfusePromptError('network', (e as Error).message ?? 'network error');
    }

    if (resp.ok) {
      return resp.json() as Promise<LangfusePromptResult>;
    }

    // Map server error envelopes to typed kinds so callers can branch
    // without re-parsing.
    const payload = await resp.json().catch(() => ({}));
    const kind = (payload?.error as LangfusePromptErrorKind | undefined) ?? 'invalid_request';
    const message: string =
      payload?.message ??
      (kind === 'prompt_not_found' ? `Prompt "${promptName}" not found` : `Request failed (${resp.status})`);
    throw new LangfusePromptError(kind, message, resp.status, payload?.variables);
  }
}
