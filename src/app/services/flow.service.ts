// src/app/services/flow.service.ts
//
// Conversational "flows" served by regi-api (copy lives in Langfuse, editable without
// redeploy). A flow returns one BEAT — text + typed chips. Single-beat flows (like the
// Help greeting) return sessionId null. Multi-beat flows carry a sessionId that the
// client advances via /flow/advance. The client treats whatever it gets as
// authoritative and holds NO local copy of its own.
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** A tappable chip on a flow beat. `label` is displayed; the rest depend on `kind`:
 *   • message → submit `value` into the chat
 *   • answer  → advance the flow with `value`
 *   • link    → open `url` in a new tab
 *   • call    → open a widget (`widget`/`renderIntent`) and/or fire `call`
 *   • flow    → start `flowName` (bypassing the opener cache). */
export type FlowChipKind = 'message' | 'answer' | 'link' | 'call' | 'flow';

/** An HTTP action a `call` chip / vessel can carry. Omitted for surfacing-only
 *  (navigation) chips. */
export interface FlowCallSpec {
  method: string;
  endpoint: string;
  body?: unknown;
}

export interface FlowChip {
  label: string;
  kind: FlowChipKind;
  /** message / answer */
  value?: string;
  /** link */
  url?: string;
  /** call */
  widget?: string;
  renderIntent?: string;
  call?: FlowCallSpec;
  /** flow */
  flowName?: string;
}

export interface FlowBeat {
  text: string;
  chips: FlowChip[];
}

/** The action payload a completed walk can hand back. `call` is the writing HTTP
 *  action to fire; the widget/renderIntent drive in-app navigation. */
export interface FlowVessel {
  understood: boolean;
  widget?: string;
  command?: string;
  renderIntent?: string;
  requiresConfirmation?: boolean;
  confidence?: number;
  call?: FlowCallSpec;
}

/** POST /api/flow/start response. Single-beat flows return sessionId null. */
export interface FlowStartResponse {
  sessionId: string | null;
  beat: FlowBeat;
}

/** POST /api/flow/advance response. On a didn't-catch, `beat` is the CURRENT beat
 *  again. A 410 is surfaced as the typed `{ restart: true }` shape instead. */
export interface AdvanceResult {
  done: boolean;
  beat?: FlowBeat;
  vessel?: FlowVessel;
  /** Set only when the session expired/invalid (HTTP 410) — restart the flow. */
  restart?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FlowService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  /** In-memory OPENER cache keyed by flow name — one fetch per flow per app session
   *  (survives Clear-all; a full app reload refetches). Only SUCCESSFUL openers cache,
   *  so a failed fetch retries on the next request. Advance results are NEVER cached. */
  private cache = new Map<string, FlowStartResponse>();

  /** Start a flow and return its opening beat + sessionId. Cached per flow name unless
   *  `fresh` is set (flow chips always refetch a clean opener). Throws on HTTP failure
   *  so the caller can stay silent + retry later. */
  async startFlow(name: string, opts?: { fresh?: boolean }): Promise<FlowStartResponse> {
    if (!opts?.fresh) {
      const cached = this.cache.get(name);
      if (cached) return cached;
    }

    const resp = await firstValueFrom(
      this.http.post<FlowStartResponse>(`${this.baseUrl}/flow/start`, { flow: name }),
    );
    const result: FlowStartResponse = {
      sessionId: resp?.sessionId ?? null,
      beat: resp?.beat ?? { text: '', chips: [] },
    };
    this.cache.set(name, result);
    return result;
  }

  /** Advance a walk. No caching. A 410 maps to `{ done:true, restart:true }` so the
   *  caller can silently restart; other HTTP errors throw. */
  async advance(sessionId: string, input: { value: string } | { text: string }): Promise<AdvanceResult> {
    try {
      const resp = await firstValueFrom(
        this.http.post<AdvanceResult>(`${this.baseUrl}/flow/advance`, { sessionId, ...input }),
      );
      return { done: !!resp?.done, beat: resp?.beat, vessel: resp?.vessel };
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 410) {
        return { done: true, restart: true };
      }
      throw err;
    }
  }

  /** Fire a `call` spec relayed from a chip/vessel (the API tells us exactly what to
   *  send — this is a pass-through of a typed FlowCallSpec, not a hand-authored body).
   *  Relative endpoints are resolved against the API base; absolute URLs pass through. */
  async fireCall(spec: FlowCallSpec): Promise<unknown> {
    const url = /^https?:\/\//i.test(spec.endpoint)
      ? spec.endpoint
      : `${this.baseUrl}${spec.endpoint.startsWith('/') ? '' : '/'}${spec.endpoint}`;
    return firstValueFrom(this.http.request(spec.method, url, { body: spec.body }));
  }
}
