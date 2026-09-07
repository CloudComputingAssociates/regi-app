// src/app/services/flow.service.ts
//
// Conversational "flows" served by regi-api (copy lives in Langfuse, editable without
// redeploy). A flow returns one BEAT — text + typed chips. Single-beat flows (like the
// Help greeting) return sessionId null. The client treats whatever it gets as
// authoritative and holds NO local copy of its own.
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** A tappable chip on a flow beat. `label` is displayed; the rest depend on `kind`:
 *   • message → submit `value` into the chat
 *   • link    → open `url` in a new tab
 *   • answer / call / flow → Phase 2 (not rendered yet). */
export type FlowChipKind = 'message' | 'answer' | 'link' | 'call' | 'flow';

export interface FlowChip {
  label: string;
  kind: FlowChipKind;
  value?: string;
  url?: string;
}

export interface FlowBeat {
  text: string;
  chips: FlowChip[];
}

/** POST /api/flow/start response. Single-beat flows return sessionId null. */
export interface FlowStartResponse {
  sessionId: string | null;
  beat: FlowBeat;
}

@Injectable({ providedIn: 'root' })
export class FlowService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  /** In-memory beat cache keyed by flow name — one fetch per flow per app session
   *  (survives Clear-all; a full app reload refetches). Only SUCCESSFUL beats cache,
   *  so a failed fetch retries on the next request. */
  private cache = new Map<string, FlowBeat>();

  /** Start a flow and return its opening beat. Throws on HTTP failure so the caller
   *  can stay silent + retry later. */
  async startFlow(name: string): Promise<FlowBeat> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const resp = await firstValueFrom(
      this.http.post<FlowStartResponse>(`${this.baseUrl}/flow/start`, { flow: name }),
    );
    const beat: FlowBeat = resp?.beat ?? { text: '', chips: [] };
    this.cache.set(name, beat);
    return beat;
  }
}
