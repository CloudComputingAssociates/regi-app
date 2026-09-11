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
import {
  CaptureKind,
  CaptureTarget,
  TetherCommandRequest,
  TetherCommandResponse,
  TetherPresenceResponse,
  TetherResult,
  TetherResultsResponse,
} from '../models/tether.models';
import { RotationService } from './rotation.service';
import { UserProfileService } from './user-profile.service';
import { NotificationService } from './notification.service';

/** A capture command's terminal outcome, surfaced to whichever component issued it
 *  so it can close its "waiting" UI. `done` also fires the relevant refresh. */
export interface TetherCaptureEvent {
  messageId: string;
  kind: CaptureKind;
  id: number | null;
  status: 'done' | 'failed' | 'timeout';
  /** The stored image URIs from the phone's upload — present on 'done' so a surface
   *  with no server-side store of its own (e.g. a food) can apply the photo directly. */
  cdnUrl?: string;
  thumbnailUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class TetherService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private rotation = inject(RotationService);
  private userProfile = inject(UserProfileService);
  private notification = inject(NotificationService);
  private baseUrl = environment.apiUrl; // already ends in /api

  /** Poll cadence FLOOR + pre-first-response default. After the first success the
   *  client uses response.pollIntervalSeconds, but never faster than this (15s). */
  private static readonly DEFAULT_POLL_MS = 15000;

  /** Client-side timeout: an expired command produces NO result, so treat any
   *  outstanding command with no result after this long as failed/timed-out. */
  private static readonly COMMAND_TTL_MS = 300_000; // 300s, the server default

  private presenceSignal = signal<TetherPresenceResponse | null>(null);
  readonly presence = this.presenceSignal.asReadonly();

  readonly registered = computed(() => this.presenceSignal()?.registered ?? false);
  readonly anyLive = computed(() => this.presenceSignal()?.anyLive ?? false);
  readonly devices = computed(() => this.presenceSignal()?.devices ?? []);

  /** First registered device id (LIVE not required), or null when the user has no
   *  registered device. Kept for display/tooltip use; issuing a command no longer
   *  needs it (the enqueue is user-level and routes to whichever phone is live). */
  readonly firstDeviceId = computed<number | null>(() => this.devices()[0]?.deviceId ?? null);

  /** Terminal outcome of the most recent capture command — components watch this to
   *  close their "waiting" panel. `done` also triggers the meal/avatar refresh. */
  readonly captureEvent = signal<TetherCaptureEvent | null>(null);

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

  // ---- Command issuance + results poll -------------------------------------
  /** Outstanding commands we issued, keyed by the 202 messageId, so a returned
   *  result can be matched back to its target (and timed out if none arrives). */
  private outstanding = new Map<
    string,
    { kind: CaptureKind; id: number | null; startedAt: number }
  >();
  private resultsTimer: ReturnType<typeof setTimeout> | null = null;
  private resultsRunning = false;

  /** Legacy discriminator per kind (meal/avatar keep their existing type so the
   *  pre-generic API/phone still resolve them during rollout). Unknown kinds fall
   *  back to the generic 'capture'. */
  private static readonly KIND_TO_TYPE: Record<string, TetherCommandRequest['type']> = {
    meal: 'captureMeal',
    food: 'captureFood',
    avatar: 'captureAvatar',
    mealset: 'captureMealset',
  };

  /** POST /api/tether/command — USER-LEVEL enqueue of a photo capture for ANY target
   *  (meal / food / avatar / mealset / …). No deviceId: the API routes to whichever of
   *  the user's phones is LIVE. Gate the caller on presence.anyLive; a 409 means no
   *  phone is connected. Returns the messageId and tracks it; the results poll resolves
   *  it (refreshes the right thing) or times it out. Throws on 409/503/400. */
  async requestCapture(target: CaptureTarget, ttlSeconds?: number): Promise<string> {
    const body: TetherCommandRequest = {
      type: TetherService.KIND_TO_TYPE[target.kind] ?? 'capture',
      capture: target,
      ...(ttlSeconds != null ? { ttlSeconds } : {}),
    };
    const res = await firstValueFrom(
      this.http.post<TetherCommandResponse>(`${this.baseUrl}/tether/command`, body),
    );
    this.track(res.messageId, target.kind, target.id);
    return res.messageId;
  }

  /** Register an issued command and make sure the results poll is running. */
  private track(messageId: string, kind: CaptureKind, id: number | null): void {
    this.outstanding.set(messageId, { kind, id, startedAt: Date.now() });
    this.startResults();
  }

  private startResults(): void {
    if (this.resultsRunning) return;
    this.resultsRunning = true;
    void this.resultsTick();
  }

  /** Poll GET /api/tether/results while any command is outstanding. Each result is
   *  delivered AT-MOST-ONCE, so we resolve on the first (and only) sighting; the loop
   *  stops once nothing is outstanding, and restarts when the next command is issued. */
  private async resultsTick(): Promise<void> {
    if (!this.resultsRunning) return;
    let nextMs = 3000;
    try {
      const res = await firstValueFrom(
        this.http.get<TetherResultsResponse>(`${this.baseUrl}/tether/results`),
      );
      for (const r of res?.results ?? []) this.handleResult(r);
      const secs = res?.pollIntervalSeconds;
      if (typeof secs === 'number' && secs > 0) nextMs = secs * 1000;
    } catch {
      // Silent: keep the interval, keep trying (an indicator must never toast).
    }
    this.expireTimedOut();
    if (this.outstanding.size === 0) {
      this.resultsRunning = false;
      return;
    }
    this.resultsTimer = setTimeout(() => void this.resultsTick(), nextMs);
  }

  /** Match a returned result to an outstanding command; on 'done' fire the relevant
   *  refresh (so the card flips / avatar updates even if the dialog was closed), on
   *  'failed' toast + emit so the waiting UI closes. Ignore unknown messageIds. */
  private handleResult(r: TetherResult): void {
    const cmd = this.outstanding.get(r.messageId);
    if (!cmd) return; // not ours (or already handled) — the cursor still advanced
    this.outstanding.delete(r.messageId);
    if (r.status === 'done') {
      // Kind-routed refresh so the right surface updates even if its dialog closed.
      // meal → flip the card; avatar → reload the profile pic. food/mealset/other
      // refresh in the initiating component off captureEvent (no shared store here).
      if (cmd.kind === 'meal' && cmd.id != null) this.rotation.awaitMealImage(cmd.id);
      else if (cmd.kind === 'avatar') void this.userProfile.refreshAvatar();
      this.captureEvent.set({
        messageId: r.messageId,
        kind: cmd.kind,
        id: cmd.id,
        status: 'done',
        cdnUrl: r.result?.cdnUrl,
        thumbnailUrl: r.result?.thumbnailUrl,
      });
    } else {
      this.notification.show('Your phone couldn’t take the photo. Please try again.', 'error');
      this.captureEvent.set({ messageId: r.messageId, kind: cmd.kind, id: cmd.id, status: 'failed' });
    }
  }

  /** An expired command yields NO result, so drop any outstanding one past its TTL
   *  and surface it as a timeout (the waiting UI closes; a toast explains). */
  private expireTimedOut(): void {
    const now = Date.now();
    for (const [messageId, cmd] of this.outstanding) {
      if (now - cmd.startedAt <= TetherService.COMMAND_TTL_MS) continue;
      this.outstanding.delete(messageId);
      this.notification.show('Your phone didn’t respond in time. Please try again.', 'warning');
      this.captureEvent.set({ messageId, kind: cmd.kind, id: cmd.id, status: 'timeout' });
    }
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
      // Client floor: never poll faster than DEFAULT_POLL_MS, even if the server
      // asks for a shorter interval (presence isn't worth a sub-30s heartbeat).
      nextMs = Math.max(nextMs, TetherService.DEFAULT_POLL_MS);
    } catch {
      // Silent: leave the last state, back off to the default interval, keep
      // trying. If auth dropped mid-flight, the auth effect already called
      // stop(), so the guard below ends the loop.
    }
    if (!this.running) return;
    this.pollTimer = setTimeout(() => void this.tick(), nextMs);
  }
}
