// src/app/services/role.service.ts
// Reads Auth0 roles from the user profile / ID token claims
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { filter, take } from 'rxjs/operators';

// Auth0 roles are stored under a custom namespace claim in the ID token
// You must set up an Auth0 Action/Rule to include roles in the token:
// e.g., api.idToken.setCustomClaim('https://yeh.app/roles', event.authorization?.roles || [])
const ROLES_CLAIM = 'https://yehapi.cloudcomputingassociates.net/roles';

export type AppRole = 'Admin' | 'Developer' | 'QA';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private auth = inject(AuthService);
  private rolesSignal = signal<AppRole[]>([]);
  readonly roles = this.rolesSignal.asReadonly();

  constructor() {
    // Read roles from ID token claims once authenticated
    this.auth.isAuthenticated$.pipe(
      filter(isAuth => isAuth),
      take(1)
    ).subscribe(() => {
      this.auth.idTokenClaims$.pipe(take(1)).subscribe(claims => {
        if (claims) {
          console.log('[RoleService] ID token claims:', JSON.stringify(Object.keys(claims)));
          console.log('[RoleService] Roles claim:', claims[ROLES_CLAIM]);
          const roles = (claims[ROLES_CLAIM] as string[]) ?? [];
          this.rolesSignal.set(roles as AppRole[]);
          console.log('[RoleService] Resolved roles:', roles);
        } else {
          console.log('[RoleService] No claims found');
        }
      });
    });
  }

  hasRole(role: AppRole): boolean {
    return this.rolesSignal().includes(role);
  }

  isDevOrQA(): boolean {
    const r = this.rolesSignal();
    return r.includes('Developer') || r.includes('QA') || r.includes('Admin');
  }
}
