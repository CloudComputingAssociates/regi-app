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
import { RoleService } from '../../services/role.service';

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
      <!-- Just the avatar (the logo) opens the menu — name + pawn removed. -->
      <div class="profile-trigger">
        <button class="profile-btn" [matMenuTriggerFor]="menu" aria-label="Open menu">
          <img [src]="defaultImage" alt="Profile" class="profile-img" />
        </button>
      </div>

      <mat-menu #menu="matMenu" class="profile-menu" [overlapTrigger]="false">
        <!-- Tuxedo-black spacer bar at the top of the menu (just a spacer). -->
        <div class="menu-tux-spacer"></div>

        <button mat-menu-item class="menu-item" [class.active]="tabService.accountOpen()" (click)="toggleAccount()">
          <mat-icon>person</mat-icon>
          <span>Account</span>
        </button>

        <button mat-menu-item class="menu-item" [class.active]="tabService.mobileAppOpen()" (click)="toggleMobileApp()">
          <mat-icon>phone_android</mat-icon>
          <span>Mobile App</span>
        </button>

        <button mat-menu-item class="menu-item" [class.active]="isTabOpen('preferences')" (click)="toggleSettings()">
          <mat-icon>settings</mat-icon>
          <span>Settings</span>
        </button>

        <!-- Suggestion path for ALL users (the Bug item below is dev/QA-only).
             Both open the same feedback overlay. -->
        <button mat-menu-item class="menu-item" [class.active]="tabService.bugOpen()" (click)="toggleBug()">
          <mat-icon>lightbulb_outline</mat-icon>
          <span>Submit suggestion</span>
        </button>

        @if (roleService.isDevOrQA()) {
          <button mat-menu-item class="menu-item" [class.active]="tabService.bugOpen()" (click)="toggleBug()">
            <mat-icon>bug_report</mat-icon>
            <span>Bug</span>
          </button>
        }

        <button mat-menu-item class="menu-item" [class.active]="isTabOpen('help')" (click)="toggleHelp()">
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
  roleService = inject(RoleService);
  // Public so the template can read tabService.bugOpen() for the Bug menu
  // item's active state. Other tab queries still go through isTabOpen().
  tabService = inject(TabService);
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

  isTabOpen(tabId: string): boolean {
    // For panels in the single-active model, "open" means active.
    if (tabId === 'preferences') return this.tabService.settingsOpen();
    return this.tabService.activeTabId() === tabId;
  }

  toggleAccount(): void {
    if (this.tabService.accountOpen()) {
      this.tabService.closeAccount();
    } else {
      this.tabService.openAccount();
    }
  }

  toggleSettings(): void {
    // Settings is the overlay — flip the service-level signal instead of
    // pushing a panel onto the active-panel stack.
    if (this.tabService.settingsOpen()) {
      this.tabService.closeSettings();
    } else {
      this.tabService.openSettings();
    }
  }

  toggleMobileApp(): void {
    if (this.tabService.mobileAppOpen()) {
      this.tabService.closeMobileApp();
    } else {
      this.tabService.openMobileApp();
    }
  }

  toggleHelp(): void {
    this.tabService.togglePanel('help', 'Help');
  }

  toggleBug(): void {
    // Bug is the overlay (mirrors Settings) — flip the service-level signal
    // instead of pushing a panel onto the active-panel stack.
    if (this.tabService.bugOpen()) {
      this.tabService.closeBug();
    } else {
      this.tabService.openBug();
    }
  }
}