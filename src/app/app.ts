// src/app/app.ts
// Main App Component - Modern Angular with Material Design
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, OnInit, OnDestroy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { SettingsOverlayComponent } from './components/settings-overlay/settings-overlay';
import { BugOverlayComponent } from './components/bug-overlay/bug-overlay';
import { TetherPromptComponent } from './components/tether-prompt/tether-prompt';
import { WebViewOverlayComponent } from './components/web-view-overlay/web-view-overlay';
import { AccountPanelComponent } from './components/account-panel/account-panel';
import { NotificationComponent } from './components/notification/notification';
import { SubscriptionService } from './services/subscription.service';
import { SettingsService } from './services/settings.service';
import { TabService } from './services/tab.service';
import { ChatService } from './services/chat.service';
import { NotificationService } from './services/notification.service';
import { RotationService } from './services/rotation.service';
import { RecipeImportWatcher, RecipeImportEvent } from './services/recipe-import-watcher.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NutritionTipService } from './services/nutrition-tip.service';

// Panel IDs that are part of the left-nav navigator. Only these are
// remembered across page refresh — profile-menu overlays (Settings, Account,
// Help, Bug) are deliberately excluded so a stale overlay never re-opens.
const LEFT_NAV_PANEL_IDS = new Set([
  'chat',
  'menus',
  'foods',
  'shop',
]);

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
    LoadingOverlayComponent,
    SettingsOverlayComponent,
    BugOverlayComponent,
    TetherPromptComponent,
    WebViewOverlayComponent,
    AccountPanelComponent,
    NotificationComponent,
    MatTooltipModule
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
            <!-- Macros bar renders above the active panel except on Foods
                 (reclaims space), Chat (no macros context), and the splash
                 screen. The "bites" tip-of-the-day is Chat-only. The
                 chat-input below shows on every panel except Foods. -->
            @if (isAuthenticated() && hasMacros()) {
              <app-macros />
            }
            @if (isAuthenticated() && hasTipBar()) {
              @if (!tipDismissed() && tipService.tip(); as tip) {
                <div class="nutrition-tip-bar">
                  <img src="/images/bites-logo.png" alt="Bites" class="tip-bar-logo"
                    matTooltip="News, Insights, AI Chats ~ your daily 'bites'" matTooltipPosition="below" />
                  <div class="tip-bar-inset">
                    @if (tip.imageUrl) {
                      <img [src]="tip.imageUrl" alt="" class="tip-bar-thumb" />
                    }
                    <!-- Opens in a NEW TAB (the app tab stays alive). Many
                         article sites send X-Frame-Options and refuse to load
                         in the in-app iframe viewer, so we don't use it here. -->
                    <a [href]="tip.articleUrl" target="_blank" rel="noopener" class="tip-bar-title">{{ tip.title }}</a>
                  </div>
                  <button class="tip-bar-close" (click)="dismissTip()">✕</button>
                </div>
              }
            }
            <app-main-body />
            @if (isAuthenticated() && hasChatInput()) {
              <app-chat-input />
            }
          </main>
        </div>
      </app-left-nav>

      @if (shouldShowGate()) {
        <app-paywall />
      } @else if (subscriptionService.isLoading()) {
        <app-loading-overlay />
      }

      <!-- Settings overlay floats above everything when triggered. Its
           open state lives on TabService so any UI element can flip it. -->
      <app-settings-overlay />
      <app-bug-overlay />
      <!-- foods-panel's "add food" nudge routes through the shared tether prompt
           (mode not-registered), gated on the existing TabService signal. -->
      @if (tabService.mobileAppOpen()) {
        <app-tether-prompt mode="not-registered" (close)="tabService.closeMobileApp()" />
      }
      <app-web-view-overlay />
      <app-account-panel />
      <!-- Notification toast lives at the app root (not inside main-body)
           so its z-index: 9999 punches above the overlays' z-index: 1100.
           Mounted inside main-body, it was trapped in main-body's stacking
           context and rendered behind the Settings dialog backdrop, making
           the confirmation buttons unclickable. -->
      <app-notification />
    </div>
  `,
  styleUrls: ['./app.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });
  subscriptionService = inject(SubscriptionService);
  tipService = inject(NutritionTipService);
  private settingsService = inject(SettingsService);
  tabService = inject(TabService);
  private chatService = inject(ChatService);
  private notification = inject(NotificationService);
  private rotation = inject(RotationService);
  private recipeWatcher = inject(RecipeImportWatcher);
  private errorSub?: Subscription;
  private recipeSub?: Subscription;

  tipDismissed = signal(this.isTipDismissedToday());

  /** True when the active panel should render the macros bar above it.
   *  False on splash, Foods (reclaims the vertical space), and Chat
   *  (no macros context applies). */
  hasMacros = computed(() => {
    const id = this.tabService.activeTabId();
    return id !== null && id !== 'foods' && id !== 'chat';
  });

  /** True when the "bites" tip-of-the-day bar should render. Chat only. */
  hasTipBar = computed(() => this.tabService.activeTabId() === 'chat');

  /** True when the active panel should render the chat-input bar below it.
   *  False on splash, Foods (reclaims the vertical space), and Menus. */
  hasChatInput = computed(() => {
    const id = this.tabService.activeTabId();
    return id !== null && id !== 'foods' && id !== 'menus';
  });

  // ------------------------------------------------------------------
  // Auto-save the active left-nav panel to UserSettings.TabSettings on
  // every change. The old model only saved at explicit logout, which
  // meant browser-close / crash / session-expiry lost the user's last
  // panel selection. With this effect the server is always-current, so
  // login always lands on whatever panel the user last had open.
  //
  // Debounced 800 ms so a click-through (foods → review → meals) collapses
  // into one PUT instead of three. Empty-state writes are suppressed so the
  // closeAllTabs() inside logout / handleSessionExpired can't clobber the
  // genuine state that profile-menu just persisted.
  // ------------------------------------------------------------------
  private autoSavePanelTimer: ReturnType<typeof setTimeout> | null = null;
  private autoSavePanelEffect = effect(() => {
    // Track the signals so any panel change re-runs the effect.
    const activeId = this.tabService.activeTabId();
    const tabIds = this.tabService.tabs().map(t => t.id);

    if (!this.isAuthenticated()) return;

    const filteredTabs = tabIds.filter(id => LEFT_NAV_PANEL_IDS.has(id));
    const filteredActive = activeId && LEFT_NAV_PANEL_IDS.has(activeId) ? activeId : undefined;

    // Guard against the closeAllTabs() race during logout / session-expiry.
    // profile-menu.logout() awaits its own saveOpenTabs first, then clears
    // the in-memory tabs — we don't want a deferred auto-save to write
    // {defaultTabs:[]} on top of the state that was just persisted.
    if (filteredTabs.length === 0 && !filteredActive) return;

    if (this.autoSavePanelTimer) clearTimeout(this.autoSavePanelTimer);
    this.autoSavePanelTimer = setTimeout(() => {
      this.autoSavePanelTimer = null;
      this.settingsService.saveOpenTabs(filteredTabs, filteredActive).catch(err => {
        console.warn('[App] Auto-save panel state failed:', err);
      });
    }, 800);
  });

  dismissTip(): void {
    this.tipDismissed.set(true);
    localStorage.setItem('yeh_tipDismissed', new Date().toDateString());
  }

  private isTipDismissedToday(): boolean {
    const stored = localStorage.getItem('yeh_tipDismissed');
    return stored === new Date().toDateString();
  }
  title = 'regi-app';

  ngOnDestroy(): void {
    this.errorSub?.unsubscribe();
    this.recipeSub?.unsubscribe();
    if (this.autoSavePanelTimer) clearTimeout(this.autoSavePanelTimer);
  }

  /** Handle a recipe-import completion event (see RecipeImportWatcher).
   *  - parsed:  ALWAYS refresh the Binder (same path as a successful pin), then
   *             show the ingest toast unless the user suppressed it.
   *  - failed:  ALWAYS toast the error (suppression never applies), no refresh.
   *  - timeout: warn and refresh the Binder. */
  private onRecipeEvent(ev: RecipeImportEvent): void {
    if (ev.kind === 'parsed') {
      void this.rotation.loadBinder();
      if (!this.recipeWatcher.isToastSuppressed()) {
        const name = ev.mealName?.trim() || 'your imported meal';
        this.notification.showIngest(
          `Recipe Ingested to Saved Meal, ${name}`,
          dontShowAgain => {
            if (dontShowAgain) this.recipeWatcher.setToastSuppressed();
          },
        );
      }
    } else if (ev.kind === 'failed') {
      this.notification.show(`Recipe import failed — ${ev.parseError ?? 'unknown error'}`, 'error');
    } else {
      this.notification.show(
        'Recipe import failed — it timed out after 4 minutes. Please try again.',
        'error',
      );
      void this.rotation.loadBinder();
    }
  }

  ngOnInit(): void {
    // Recipe-import completions. The watcher self-resumes persisted imports once
    // the auth0 sub is known, so subscribing here covers both live imports and
    // ones resumed after a mid-import browser refresh.
    this.recipeSub = this.recipeWatcher.events.subscribe(ev => this.onRecipeEvent(ev));

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
        this.tipService.fetchTip();

        // Restore the previously-active panel. Only left-nav panels are
        // remembered across refresh — Settings / Account / Help / Bug live
        // in the profile-menu overlay model and are not auto-reopened.
        const localState = localStorage.getItem('yeh_tabState');
        if (localState) {
          try {
            const parsed = JSON.parse(localState);
            const filtered = (parsed.defaultTabs ?? []).filter(
              (id: string) => LEFT_NAV_PANEL_IDS.has(id),
            );
            const activeId = LEFT_NAV_PANEL_IDS.has(parsed.activeTabId)
              ? parsed.activeTabId
              : undefined;
            this.tabService.restoreFromSettings(filtered, activeId);
          } catch {
            this.tabService.resetToChat();
          }
          localStorage.removeItem('yeh_tabState');
          this.settingsService.loadSettings().catch(err =>
            console.error('[App] Failed to load settings on refresh:', err),
          );
        } else {
          try {
            const allSettings = await this.settingsService.loadSettings();
            const tabs = allSettings.tabs;
            const filtered = (tabs?.defaultTabs ?? []).filter(
              id => LEFT_NAV_PANEL_IDS.has(id),
            );
            const activeId = tabs?.activeTabId && LEFT_NAV_PANEL_IDS.has(tabs.activeTabId)
              ? tabs.activeTabId
              : undefined;
            this.tabService.restoreFromSettings(filtered, activeId);
          } catch (error) {
            console.error('[App] Failed to load settings:', error);
            this.tabService.resetToChat();
          }
        }
      }
      // If not authenticated, do nothing - user will see login button
    });

    // Save tab state to localStorage on page refresh/close. Filtered to
    // left-nav panels only so a stale Settings / Account overlay can't
    // re-open after a refresh.
    window.addEventListener('beforeunload', () => {
      const openTabs = this.tabService.getOpenTabIds()
        .filter(id => LEFT_NAV_PANEL_IDS.has(id));
      const rawActive = this.tabService.activeTabId();
      const activeId = rawActive && LEFT_NAV_PANEL_IDS.has(rawActive)
        ? rawActive
        : undefined;
      if (openTabs.length > 0 || activeId) {
        localStorage.setItem(
          'yeh_tabState',
          JSON.stringify({ defaultTabs: openTabs, activeTabId: activeId }),
        );
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

    // Auto-logout after a brief delay so user sees the notification
    setTimeout(() => {
      this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
    }, 2000);
  }
}