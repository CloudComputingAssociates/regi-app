// src/app/services/user-profile.service.ts
//
// The user's profile: editable display name + avatar url, sourced from the API
// (GET /api/user/profile) and edited via PUT /api/user/profile. Auth0 supplies a
// fallback name/email, but the User record is authoritative once set. This
// service holds the display-name override so it shows everywhere at once, hydrates
// name + avatar on login, and owns the save call. If the endpoint isn't reachable
// (not deployed) the calls fail soft and the app falls back to Auth0 + the apple.
import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { environment } from '../../environments/environment';
import { ProfileImageService } from './profile-image.service';

/** GET/PUT /api/user/profile shape. displayName/avatarUrl/avatarThumbnailUrl are
 *  null until set; id + email are always present. */
export interface UserProfile {
  id: number;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarThumbnailUrl: string | null;
}

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private profileImage = inject(ProfileImageService);
  private baseUrl = environment.apiUrl; // already ends in /api

  /** Edited/persisted display name; null → fall back to Auth0's name/email. */
  private readonly override = signal<string | null>(null);
  readonly displayName = this.override.asReadonly();

  private isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });
  private hydrated = false;

  constructor() {
    // Hydrate the profile once, on login: display name + avatar, app-wide.
    effect(() => {
      if (this.isAuthenticated() && !this.hydrated) {
        this.hydrated = true;
        void this.hydrate();
      }
    });
  }

  private async hydrate(): Promise<void> {
    try {
      const p = await firstValueFrom(this.http.get<UserProfile>(`${this.baseUrl}/user/profile`));
      if (p?.displayName?.trim()) this.override.set(p.displayName.trim());
      this.profileImage.setPersisted(p?.avatarUrl ?? null);
    } catch {
      /* endpoint not live yet — fall back to Auth0 name + the apple logo */
    }
  }

  /** Reflect a name everywhere immediately (also used for the session-only path). */
  setDisplayName(name: string | null): void {
    this.override.set(name && name.trim() ? name.trim() : null);
  }

  /** PUT /api/user/profile { displayName } — persist to the User record and adopt
   *  the server's canonical value. Returns true on success, false if the endpoint
   *  isn't reachable yet (caller keeps the name for the session). */
  async updateDisplayName(name: string): Promise<boolean> {
    try {
      const p = await firstValueFrom(
        this.http.put<UserProfile>(`${this.baseUrl}/user/profile`, { displayName: name }),
      );
      this.override.set((p?.displayName ?? name).trim() || null);
      return true;
    } catch {
      return false;
    }
  }
}
