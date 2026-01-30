import { Component, Input, ChangeDetectionStrategy, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '@auth0/auth0-angular';
import { SubscriptionService } from '../../services/subscription.service';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-profile-menu',
  standalone: true,
  imports: [AsyncPipe, MatIconModule, MatButtonModule, MatMenuModule, MatDividerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.isLoading$ | async) {
      <!-- While Auth0 is loading, show nothing to avoid flicker -->
      <div class="auth-loading"></div>
    } @else if (auth.isAuthenticated$ | async) {
      <button class="profile-btn" [matMenuTriggerFor]="menu">
        <img [src]="defaultImage" alt="Profile" class="profile-img" />
      </button>

      <mat-menu #menu="matMenu" class="profile-menu" [overlapTrigger]="false">
        @if (auth.user$ | async; as user) {
          <div class="user-info">
            <img [src]="defaultImage" alt="Profile" class="menu-img" />
            <div class="details">
              <div class="name">{{ user.name }}</div>
              <div class="email">{{ user.email }}</div>
            </div>
          </div>
        }

        <mat-divider></mat-divider>

        <button mat-menu-item class="menu-item" (click)="toggleAccount()">
          <mat-icon>person</mat-icon>
          <span>Account</span>
        </button>

        <button mat-menu-item class="menu-item" (click)="toggleHelp()">
          <mat-icon>help_outline</mat-icon>
          <span>Help</span>
        </button>

        <mat-divider></mat-divider>

        <button mat-menu-item class="menu-item" (click)="logout()">
          <mat-icon>logout</mat-icon>
          <span>Logout</span>
        </button>
      </mat-menu>
    } @else {
      <button mat-raised-button (click)="login()" class="login-btn">
        Login
      </button>
    }
  `,
  styleUrls: ['./profile-menu.scss']
})
export class ProfileMenuComponent {
  @Input() defaultImage = 'images/yeh_logo_dark.png';
  auth = inject(AuthService);
  subscriptionService = inject(SubscriptionService);
  private tabService = inject(TabService);
  private chatService = inject(ChatService);
  private settingsService = inject(SettingsService);

  login(): void {
    // Just redirect to Auth0 - settings will be loaded after auth completes in app.ts
    this.auth.loginWithRedirect();
  }

  async logout(): Promise<void> {
    // Save current tabs to settings before logout
    const openTabs = this.tabService.getOpenTabIds();
    if (openTabs.length > 0) {
      try {
        const activeId = this.tabService.activeTabId() ?? undefined;
        await this.settingsService.saveOpenTabs(openTabs, activeId);
      } catch (error) {
        console.error('[ProfileMenu] Failed to save tabs on logout:', error);
        // Continue with logout even if save fails
      }
    }

    // Clear all state before logging out
    this.subscriptionService.clearStatus();
    this.chatService.clearSession();
    this.settingsService.clearSettings();
    this.tabService.closeAllTabs();
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
  }

  toggleAccount(): void {
    this.tabService.toggleTab('account', 'Account');
  }

  toggleHelp(): void {
    this.tabService.toggleTab('help', 'Help');
  }
}