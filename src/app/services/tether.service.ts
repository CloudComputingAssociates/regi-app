// src/app/services/tether.service.ts
//
// Phase 1 Mobile Tether — presence only. A SINGLE poll loop over
// GET ${apiUrl}/tether/presence that runs ONLY while authenticated. Exposes the
// last presence snapshot as a readonly signal plus derived registered / anyLive
// / devices. Mirrors the settings / nutrition-tip idiom (inject HttpClient,
// baseUrl = environment.apiUrl, signal + .asReadonly()).
//
// Cadence: hardcoded DEFAULT_POLL_MS until the first successful response, then
// the server-authored response.pollIntervalSeconds. One flat loop, setTimeout-
// chained (not setInterval) so a slow response can't stack calls. Errors are
// SILENT — an indicator must never throw toasts: keep the last state, back off
// to the default cadence, keep trying. Note: environment.apiUrl already ends in
// /api, so the path is `${apiUrl}/tether/presence` (never a second /api).
import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { environment } from '../../environments/environment';
import { TetherPresenceResponse } from '../models/tether.models';

@Injectable({ providedIn: 'root' })
export class TetherService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private baseUrl = environment.apiUrl; // already ends in /api

  /** Pre-first-response default cadence. Client hardcodes ONLY this default;
   *  after the first success it honors response.pollIntervalSeconds. */
  private static readonly DEFAULT_POLL_MS = 30000;

  private presenceSignal = signal<TetherPresenceResponse | null>(null);
  readonly presence = this.presenceSignal.asReadonly();

  readonly registered = computed(() => this.presenceSignal()?.registered ?? false);
  readonly anyLive = computed(() => this.presenceSignal()?.anyLive ?? false);
  readonly devices = computed(() => this.presenceSignal()?.devices ?? []);

  private isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor() {
    // Run the loop ONLY while authenticated: start on true, stop + clear on
    // false (so a logged-out session never spins and never shows stale state).
    effect(
      () => {
        if (this.isAuthenticated()) {
          this.start();
        } else {
          this.stop();
          this.presenceSignal.set(null);
        }
      },
      { allowSignalWrites: true },
    );
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  private stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** One poll iteration; self-chains via setTimeout so a slow response can't
   *  stack calls. Cadence = server pollIntervalSeconds after first success,
   *  else the hardcoded default. */
  private async tick(): Promise<void> {
    if (!this.running) return;
    let nextMs = TetherService.DEFAULT_POLL_MS;
    try {
      const res = await firstValueFrom(
        this.http.get<TetherPresenceResponse>(`${this.baseUrl}/tether/presence`),
      );
      this.presenceSignal.set(res);
      const secs = res?.pollIntervalSeconds;
      if (typeof secs === 'number' && secs > 0) nextMs = secs * 1000;
    } catch {
      // Silent: leave the last state, back off to the default interval, keep
      // trying. If auth dropped mid-flight, the auth effect already called
      // stop(), so the guard below ends the loop.
    }
    if (!this.running) return;
    this.pollTimer = setTimeout(() => void this.tick(), nextMs);
  }
}
