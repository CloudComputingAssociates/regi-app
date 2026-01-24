// src/app/services/chat-status.service.ts
// Service for managing chat status header state
import { Injectable, inject, signal, computed } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root'
})
export class ChatStatusService {
  private auth = inject(AuthService);

  // Whether "Prompt Me" mode is active
  isPromptMeActive = signal(false);

  // Get user's first name from Auth0
  private userFirstName = toSignal(
    this.auth.user$.pipe(
      map(user => {
        if (!user?.name) return 'You';
        const firstName = user.name.split(' ')[0];
        return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
      })
    ),
    { initialValue: 'You' }
  );

  // Computed status message based on mode
  statusMessage = computed(() => {
    if (this.isPromptMeActive()) {
      return `YEH is prompting ${this.userFirstName()}`;
    }
    return 'AI-driven Nutrition Planner';
  });

  togglePromptMe(): void {
    this.isPromptMeActive.update(v => !v);
  }

  setPromptMe(active: boolean): void {
    this.isPromptMeActive.set(active);
  }
}
