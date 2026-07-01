// src/app/components/app-bar/app-bar.ts
//
// Layout: [hamburger] · breathing space · [RegiMenu^SM] · [active panel name] · [profile menu]
// The RegiMenu logo sits left-of-center next to the hamburger with ample
// padding. The active panel name (from TabService) renders in the same font
// and size to its right, like a breadcrumb.
import { Component, Output, EventEmitter, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule, AsyncPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ProfileMenuComponent } from '../profile-menu/profile-menu';
import { AuthService } from '@auth0/auth0-angular';
import { TabService } from '../../services/tab.service';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-app-bar',
  imports: [CommonModule, AsyncPipe, MatIconModule, MatButtonModule, ProfileMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="app-bar">
      <div class="app-bar-content">
        @if (isAuthenticated()) {
          <button
            mat-icon-button
            class="menu-button"
            (click)="onMenuClick()"
            aria-label="Open navigation menu">
            <mat-icon>menu</mat-icon>
          </button>
        } @else {
          <div class="menu-button-placeholder"></div>
        }

        <!-- Left-aligned title block: RegiMenu logo + active panel name.
             Breathing room handled by .title-area's padding-left so the
             logo doesn't crowd the hamburger. -->
        <div class="title-area">
          <span class="app-title" [innerHTML]="title$ | async"></span>
          @if (activePanelLabel(); as label) {
            <span class="app-active-panel" aria-label="Active panel">{{ label }}</span>
          }
        </div>

        <app-profile-menu />
      </div>
    </header>
  `,
  styleUrls: ['./app-bar.scss']
})
export class AppBarComponent {
  @Output() menuClick = new EventEmitter<void>();

  private auth = inject(AuthService);
  private tabService = inject(TabService);

  isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });

  // Always render the branded "RegiMenu^SM" mark — logged-in and logged-out
  // states share the same logo treatment so the title strip doesn't shift
  // between sessions.
  title$ = this.auth.user$.pipe(
    map(() => 'RegiMenu<sup class="sm">SM</sup>')
  );

  /** The label of the currently active panel, or null when nothing is open
   *  (splash visible). Renders next to the RegiMenu logo in the app bar. */
  activePanelLabel = computed(() => {
    const id = this.tabService.activeTabId();
    if (!id) return null;
    return this.tabService.tabs().find(t => t.id === id)?.label ?? null;
  });

  onMenuClick(): void {
    this.menuClick.emit();
  }
}
