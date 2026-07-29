// src/app/services/recipe-import-watcher.service.ts
//
// Watches in-flight recipe imports to completion. ONE timer drives every active
// watch (not a timer per recipe): a 1s master tick evaluates each watch against
// its own schedule — poll every 3s for the first 60s, then every 6s, give up at
// 4 minutes. Terminal states (parsed / failed / timeout / 404) drop the watch;
// the timer stops when no watches remain.
//
// In-flight ids persist under regi.recipeImport.pending.{auth0 sub} so a browser
// refresh mid-import resumes watching and still notifies. Completion is emitted
// as discrete events on a Subject (see `events`) — the app root subscribes and
// runs the Binder refresh + toast (Step 3). Discrete one-shot events are a
// stream, not state, so this is a Subject rather than a signal even though most
// services here lean on signals; a state signal would risk coalescing two
// completions landing in the same tick.
import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { RecipeService } from './recipe.service';
import { RecipeStatus } from '../models/recipe.model';

export type RecipeImportEvent =
  | { kind: 'parsed'; recipeId: number; mealId: number | null; mealName: string | null }
  | { kind: 'failed'; recipeId: number; parseError: string | null }
  | { kind: 'timeout'; recipeId: number };

interface Watch {
  recipeId: number;
  startedAt: number;
  lastPolledAt: number;
}

const TICK_MS = 1000;
const FAST_MS = 3000;
const SLOW_MS = 6000;
const BACKOFF_AFTER_MS = 60_000;
const GIVE_UP_MS = 4 * 60_000;

@Injectable({ providedIn: 'root' })
export class RecipeImportWatcher {
  private recipes = inject(RecipeService);
  private auth = inject(AuthService);

  private readonly events$ = new Subject<RecipeImportEvent>();
  /** Completion stream: parsed / failed / timeout (drives the toasts). */
  readonly events = this.events$.asObservable();

  private readonly settled$ = new Subject<{ recipeId: number }>();
  /** Terminal stream: fires ONCE on EVERY watch exit — parsed, failed, timeout,
   *  AND the 404 silent-drop — meaning only "this import concluded, for any
   *  reason." Emitted from drop() (the single watch-removal path) so no terminal
   *  branch can miss it. Separate from `events`; the import button listens here
   *  to release its single-flight lock without stranding. */
  readonly settled = this.settled$.asObservable();

  private readonly watches = new Map<number, Watch>();
  private readonly inFlight = new Set<number>(); // getStatus calls currently open
  private timer: ReturnType<typeof setInterval> | null = null;
  private sub: string | null = null;

  constructor() {
    // Track the auth0 sub for per-user keys. On the FIRST time the sub becomes
    // known (login or post-refresh rehydrate), resume any persisted in-flight
    // ids. Guard on wasNull so a later token refresh doesn't re-resume.
    this.auth.user$.subscribe((u) => {
      const next = u?.sub ?? null;
      const wasNull = this.sub === null;
      this.sub = next;
      if (next && wasNull) this.resume();
    });
  }

  /** Begin watching a recipe import to completion. Deduped by recipeId. */
  watch(recipeId: number): void {
    if (this.watches.has(recipeId)) return;
    const now = Date.now();
    // lastPolledAt = now so the first poll lands one FAST interval later (the
    // 202 just told us it's awaiting_parse — no point hitting it instantly).
    this.watches.set(recipeId, { recipeId, startedAt: now, lastPolledAt: now });
    this.persistPending();
    this.startTimer();
  }

  /** Rehydrate persisted in-flight ids and resume watching (called once the
   *  auth0 sub is known — covers a browser refresh mid-import). */
  private resume(): void {
    for (const id of this.readPending()) this.watch(id);
  }

  // ---- One timer driving all watches ------------------------------------

  private startTimer(): void {
    if (this.timer != null || this.watches.size === 0) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimerIfIdle(): void {
    if (this.timer != null && this.watches.size === 0) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    for (const w of [...this.watches.values()]) {
      const age = now - w.startedAt;
      if (age >= GIVE_UP_MS) {
        this.events$.next({ kind: 'timeout', recipeId: w.recipeId });
        this.drop(w.recipeId);
        continue;
      }
      const interval = age < BACKOFF_AFTER_MS ? FAST_MS : SLOW_MS;
      if (!this.inFlight.has(w.recipeId) && now - w.lastPolledAt >= interval) {
        w.lastPolledAt = now;
        this.poll(w.recipeId);
      }
    }
  }

  private poll(recipeId: number): void {
    this.inFlight.add(recipeId);
    this.recipes.getStatus(recipeId).subscribe({
      next: (status) => {
        this.inFlight.delete(recipeId);
        // The watch may have been dropped (timeout) while the call was open.
        if (this.watches.has(recipeId)) this.handle(status);
      },
      error: (err: unknown) => {
        this.inFlight.delete(recipeId);
        // 404 is terminal: the recipe was deleted or isn't ours — drop silently.
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.drop(recipeId);
        }
        // Any other error is transient; leave the watch to retry next interval.
      },
    });
  }

  private handle(status: RecipeStatus): void {
    if (status.parseState === 'parsed') {
      this.events$.next({
        kind: 'parsed',
        recipeId: status.recipeId,
        mealId: status.mealId,
        mealName: status.mealName,
      });
      this.drop(status.recipeId);
    } else if (status.parseState === 'failed') {
      this.events$.next({
        kind: 'failed',
        recipeId: status.recipeId,
        parseError: status.parseError,
      });
      this.drop(status.recipeId);
    }
    // awaiting_parse / parsing → keep waiting.
  }

  private drop(recipeId: number): void {
    if (!this.watches.has(recipeId)) return; // idempotent → exactly one settle per watch
    this.watches.delete(recipeId);
    this.persistPending();
    this.stopTimerIfIdle();
    // Single terminal signal for EVERY exit path (parsed / failed / timeout /
    // 404). Fired here, from the one place a watch is removed, so no branch misses it.
    this.settled$.next({ recipeId });
  }

  // ---- Per-user persistence ---------------------------------------------

  private pendingKey(): string | null {
    return this.sub ? `regi.recipeImport.pending.${this.sub}` : null;
  }

  private suppressKey(): string | null {
    return this.sub ? `regi.recipeImport.toastSuppressed.${this.sub}` : null;
  }

  private readPending(): number[] {
    const key = this.pendingKey();
    if (!key) return [];
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((n) => typeof n === 'number') : [];
    } catch {
      return [];
    }
  }

  private persistPending(): void {
    const key = this.pendingKey();
    if (!key) return; // no sub yet → nothing to persist against
    const ids = [...this.watches.keys()];
    if (ids.length) localStorage.setItem(key, JSON.stringify(ids));
    else localStorage.removeItem(key);
  }

  /** Whether the user has opted out of the ingest toast ("Don't show again"). */
  isToastSuppressed(): boolean {
    const key = this.suppressKey();
    return key ? localStorage.getItem(key) === 'true' : false;
  }

  /** Persist the "Don't show this again" choice for the ingest toast. */
  setToastSuppressed(): void {
    const key = this.suppressKey();
    if (key) localStorage.setItem(key, 'true');
  }
}
