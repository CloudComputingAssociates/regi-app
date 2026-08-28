// src/app/services/profile-image.service.ts
//
// Holds the current user's avatar image so every avatar surface (profile menu,
// left-nav drawer) can replace the default YEH-apple logo with it. Two sources:
//   - a persisted CDN url (from the user profile) — once the API exposes it;
//   - a session-only preview (a data: URL) set the moment a photo is dropped in
//     the Account panel, so the swap is visible immediately even before the
//     avatar-upload endpoint exists.
// When the profile endpoint (GET /api/user/profile → avatarUrl) ships, hydrate
// setPersisted() at startup and the same signal drives the whole app.
import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ProfileImageService {
  /** Server-persisted avatar (CDN url). Null until the profile API provides one. */
  private readonly persisted = signal<string | null>(null);
  /** Session preview (data: URL) shown before/without server persistence. */
  private readonly preview = signal<string | null>(null);

  /** The avatar to render, or null to fall back to the default logo. Preview wins
   *  (it's the freshest thing the user just chose this session). */
  readonly avatarUrl = computed<string | null>(() => this.preview() ?? this.persisted());

  /** Set from the profile API (avatarUrl) at startup / after an upload. */
  setPersisted(url: string | null): void {
    this.persisted.set(url && url.trim() ? url : null);
  }

  /** Set an immediate session preview (data: URL or CDN url). */
  setPreview(url: string | null): void {
    this.preview.set(url && url.trim() ? url : null);
  }
}
