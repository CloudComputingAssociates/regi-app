// src/app/app.ts
// Main App Component - Modern Angular with Material Design
import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { Subscription } from 'rxjs';
import { take, switchMap, filter } from 'rxjs/operators';
import { MacrosComponent } from './components/macros/macros';
import { AppBarComponent } from './components/app-bar/app-bar';
import { LeftNavComponent } from './components/left-nav/left-nav';
import { MainBodyComponent } from './components/main-body/main-body';
import { ChatInputComponent } from './components/chat/chat-input/chat-input';
import { PaywallComponent } from './components/paywall/paywall';
import { LoadingOverlayComponent } from './components/loading-overlay/loading-overlay';
import { SubscriptionService } from './services/subscription.service';
import { SettingsService } from './services/settings.service';
import { TabService } from './services/tab.service';
import { ChatService } from './services/chat.service';
import { NotificationService } from './services/notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MacrosComponent,
    AppBarComponent,
    LeftNavComponent,
    MainBodyComponent,
    ChatInputComponent,
    PaywallComponent,
    LoadingOverlayComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-wrapper" [class.disabled-state]="shouldShowGate()">
      <app-left-nav #leftNav>
        <div class="app-container">
          <app-app-bar
            (menuClick)="leftNav.toggleDrawer()">
          </app-app-bar>

          <main class="main-content">
            <app-macros />
            <app-main-body />
            <app-chat-input />
          </main>
        </div>
      </app-left-nav>

      @if (shouldShowGate()) {
        <app-paywall />
      } @else if (subscriptionService.isLoading()) {
        <app-loading-overlay />
      }
    </div>
  `,
  styleUrls: ['./app.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  subscriptionService = inject(SubscriptionService);
  private settingsService = inject(SettingsService);
  private tabService = inject(TabService);
  private chatService = inject(ChatService);
  private notification = inject(NotificationService);
  private errorSub?: Subscription;
  title = 'yeh-web-app';

  ngOnDestroy(): void {
    this.errorSub?.unsubscribe();
  }

  ngOnInit(): void {
    // Listen for Auth0 errors (e.g. missing/expired refresh token) and auto-logout
    this.errorSub = this.auth.error$.subscribe(error => {
      console.error('[Auth0] Error:', error);
      if (error?.message?.includes('Missing Refresh Token') ||
          error?.message?.includes('invalid_grant') ||
          error?.message?.includes('Login required')) {
        this.handleSessionExpired();
      }
    });
    // Wait for Auth0 to finish loading, then check subscription status only if authenticated
    this.auth.isLoading$.pipe(
      // Wait for Auth0 to finish loading (isLoading$ becomes false)
      filter((isLoading: boolean) => !isLoading),
      take(1),
      // Once loaded, check if user is authenticated
      switchMap(() => this.auth.isAuthenticated$.pipe(take(1)))
    ).subscribe(async (isAuthenticated: boolean) => {
      if (isAuthenticated) {
        // Only check subscription status if user is authenticated
        this.subscriptionService.checkSubscriptionStatus().subscribe();

        // Restore tabs: check localStorage first (page refresh), then API (login)
        const localState = localStorage.getItem('yeh_tabState');
        if (localState) {
          try {
            const parsed = JSON.parse(localState);
            this.tabService.restoreFromSettings(parsed.defaultTabs, parsed.activeTabId);
          } catch {
            this.tabService.resetToChat();
          }
          localStorage.removeItem('yeh_tabState');
        } else {
          try {
            const settings = await this.settingsService.loadSettings();
            // Check localStorage for active tab saved on logout
            const savedActiveTab = localStorage.getItem('yeh_activeTabId') ?? undefined;
            localStorage.removeItem('yeh_activeTabId');
            this.tabService.restoreFromSettings(settings.defaultTabs, savedActiveTab);
          } catch (error) {
            console.error('[App] Failed to load settings:', error);
            this.tabService.resetToChat();
          }
        }
      }
      // If not authenticated, do nothing - user will see login button
    });

    // Save tab state to localStorage on page refresh/close
    window.addEventListener('beforeunload', () => {
      const openTabs = this.tabService.getOpenTabIds();
      const activeId = this.tabService.activeTabId();
      if (openTabs.length > 0) {
        localStorage.setItem('yeh_tabState', JSON.stringify({ defaultTabs: openTabs, activeTabId: activeId }));
      }
    });

    // Listen for visibility change to refresh subscription status when user returns from Stripe
    // This handles the case where user completes payment and returns to the app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Page became visible again - user might have returned from Stripe
        // Wait a moment for webhooks to process, then refresh
        setTimeout(() => {
          this.auth.isAuthenticated$.pipe(take(1)).subscribe((isAuth: boolean) => {
            if (isAuth) {
              this.subscriptionService.checkSubscriptionStatus().subscribe();
            }
          });
        }, 2000); // Wait 2 seconds for webhook to process
      }
    });
  }

  /**
   * Determines if the membership gate should be shown
   * Shows gate ONLY if:
   * - User IS authenticated AND
   * - User does NOT have an active subscription
   *
   * Does NOT show gate for unauthenticated users (they see login button instead)
   */
  shouldShowGate(): boolean {
    // If we're still loading subscription status, don't show gate yet
    if (this.subscriptionService.isLoading()) {
      return false;
    }

    const status = this.subscriptionService.subscriptionStatus();

    // Only show gate for authenticated users without subscription
    // isAuthenticated$ is async, so we need to check it synchronously
    let isAuthenticated = false;
    this.auth.isAuthenticated$.pipe(take(1)).subscribe((auth: boolean) => isAuthenticated = auth);

    // Show gate only if authenticated AND no active subscription
    return isAuthenticated && status !== null && !status.hasActiveSubscription;
  }

  private handleSessionExpired(): void {
    this.notification.show('Your session has expired. Logging out...', 'warning');

    // Clear all state
    this.subscriptionService.clearStatus();
    this.chatService.clearSession();
    this.chatService.clearContextSession('regimenu');
    this.chatService.clearContextSession('preferences');
    this.settingsService.clearSettings();
    this.tabService.closeAllTabs();
    localStorage.removeItem('yeh_tabState');
    localStorage.removeItem('yeh_activeTabId');

    // Auto-logout after a brief delay so user sees the notification
    setTimeout(() => {
      this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
    }, 2000);
  }
}