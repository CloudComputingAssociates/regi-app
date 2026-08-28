// src/app/services/user-profile.service.ts
//
// The user's editable display name. Auth0 supplies the initial name/email, but
// the app lets the user rename themselves and save it to the User record via
// PUT /api/user/profile { displayName }. This service holds the override so the
// new name shows everywhere at once (app-bar link, account panel), and owns the
// save call. The endpoint is part of the pending profile handoff — until it
// deploys the PUT 404s and we keep the name for the session only.
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl; // already ends in /api

  /** Edited/persisted display name; null → fall back to Auth0's name/email. */
  private readonly override = signal<string | null>(null);
  readonly displayName = this.override.asReadonly();

  /** Reflect a name everywhere immediately (also used to hydrate from the profile
   *  API once GET /api/user/profile ships). */
  setDisplayName(name: string | null): void {
    this.override.set(name && name.trim() ? name.trim() : null);
  }

  /** PUT /api/user/profile { displayName } — persist to the User record. Returns
   *  true on success, false if the endpoint isn't reachable yet. */
  async updateDisplayName(name: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.put(`${this.baseUrl}/user/profile`, { displayName: name }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
