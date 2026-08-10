// src/app/services/tab.service.ts
import { Injectable, signal, computed, WritableSignal } from '@angular/core';

export interface Tab {
  id: string;
  label: string;
  closeable: boolean;
  icon?: string;
  emoji?: string;
  badgeCount?: number;
}

@Injectable({
  providedIn: 'root'
})
export class TabService {
  // Start with no tabs - Chat tab is added on login via resetToChat()
  private tabsSignal = signal<Tab[]>([]);

  private activeTabIndexSignal = signal<number>(-1);  // No active tab until login
  private _pendingActiveIndex: number | null = null;

  /** Optional guard: returns true if leaving the current tab should be blocked */
  private _beforeLeaveGuard: (() => boolean) | null = null;
  /** Fires when a guarded tab switch is blocked; listeners show confirmation UI */
  readonly blockedTabSwitch = signal<{ targetTabId: string; sourceIndex: number } | null>(null);
  /** True while restoring tab after cancel — suppresses guard re-entry */
  private _restoringTab = false;

  /** Register a guard that can block leaving the current tab */
  setBeforeLeaveGuard(guard: (() => boolean) | null): void {
    this._beforeLeaveGuard = guard;
  }

  /** Block a tab switch (called from mousedown before Material processes) */
  blockSwitch(targetTabId: string): void {
    const sourceIndex = this.activeTabIndexSignal();
    this.blockedTabSwitch.set({ targetTabId, sourceIndex });
  }

  /** Check guard and block if needed; returns true if blocked */
  private guardLeave(targetTabId: string): boolean {
    if (this._restoringTab) return false;
    if (this._beforeLeaveGuard && this._beforeLeaveGuard()) {
      const sourceIndex = this.activeTabIndexSignal();
      this.blockedTabSwitch.set({ targetTabId, sourceIndex });
      return true;
    }
    return false;
  }

  /** Complete a previously blocked tab switch */
  completeBlockedSwitch(): void {
    const blocked = this.blockedTabSwitch();
    if (blocked) {
      this.blockedTabSwitch.set(null);
      this._switchToTabInternal(blocked.targetTabId);
    }
  }

  /** Cancel a blocked tab switch — stays on current tab */
  cancelBlockedSwitch(): void {
    this.blockedTabSwitch.set(null);
  }

  /** Focus a tab by index */
  private _focusTab(index: number): void {
    this.activeTabIndexSignal.set(index);
  }

  private _switchToTabInternal(tabId: string): void {
    const currentTabs = this.tabsSignal();
    const tabIndex = currentTabs.findIndex(t => t.id === tabId);
    if (tabIndex !== -1) {
      this.activeTabIndexSignal.set(tabIndex);
    }
  }

  // Expose signals as readonly
  tabs = this.tabsSignal.asReadonly();
  activeTabIndex = this.activeTabIndexSignal.asReadonly();

  /** The ID of the currently active tab */
  activeTabId = computed(() => {
    const index = this.activeTabIndexSignal();
    const allTabs = this.tabsSignal();
    return allTabs[index]?.id ?? null;
  });

  /** True while a deferred tab focus is queued (prevents stale selectedIndexChange) */
  hasPendingFocus(): boolean {
    return this._pendingActiveIndex !== null;
  }

  // Define menu order - this determines tab insertion order
  // Left nav: chat, menus (Menus), foods (Food Preferences), shop (Shopping List)
  // Right nav (profile menu): account, preferences (Settings), help
  private menuOrder = ['chat', 'menus', 'foods', 'shop', 'mealsets', 'video-viewer', 'web-viewer', 'issue', 'preferences', 'account', 'help'];

  /** URL for the video-viewer tab (set before opening the tab) */
  videoViewerUrl: WritableSignal<string> = signal('');

  /** URL for the web-viewer tab (set before opening the tab) */
  webViewerUrl: WritableSignal<string> = signal('');

  // Tabs that get an image icon
  private tabIcons: Record<string, string> = {
    'chat': '/images/AI-star.png',
    'menus': '/images/AI-star.png',
    'foods': '/favicon.ico',
    'preferences': '/images/AI-star.png'
  };

  // Tabs that get an emoji icon
  private tabEmojis: Record<string, string> = {
    'shop': '🛒'
  };

  toggleTab(tabId: string, label: string): void {
    const currentTabs = this.tabsSignal();
    const existingTabIndex = currentTabs.findIndex(t => t.id === tabId);

    if (existingTabIndex !== -1) {
      // Tab exists - close it (regardless of whether it's active)
      this.closeTab(tabId);
    } else {
      // Opening a new tab also leaves current tab
      const currentId = this.activeTabId();
      if (currentId && this.guardLeave(tabId)) return;
      // Tab doesn't exist - add it in the correct position based on menu order
      const newTab: Tab = {
        id: tabId,
        label,
        closeable: true,
        icon: this.tabIcons[tabId],
        emoji: this.tabEmojis[tabId]
      };

      // Find the correct insertion position based on menu order
      let insertIndex = currentTabs.length; // Default to end
      const menuIndex = this.menuOrder.indexOf(tabId);

      if (menuIndex !== -1) {
        // Find where to insert based on menu order
        for (let i = 0; i < currentTabs.length; i++) {
          const currentTabMenuIndex = this.menuOrder.indexOf(currentTabs[i].id);
          if (currentTabMenuIndex > menuIndex) {
            insertIndex = i;
            break;
          }
        }
      }

      // If inserting before the current active tab, shift the active index
      // so it keeps pointing at the same tab (avoids signal dedup when we
      // later set the index to the new tab's position).
      const currentActive = this.activeTabIndexSignal();
      if (insertIndex <= currentActive) {
        this.activeTabIndexSignal.set(currentActive + 1);
      }

      // Insert the tab at the correct position
      const newTabs = [...currentTabs];
      newTabs.splice(insertIndex, 0, newTab);
      this.tabsSignal.set(newTabs);

      // Defer focus to the new tab so mat-tab-group renders it first.
      this._pendingActiveIndex = insertIndex;
      setTimeout(() => {
        if (this._pendingActiveIndex !== null) {
          this.activeTabIndexSignal.set(this._pendingActiveIndex);
          setTimeout(() => {
            this._pendingActiveIndex = null;
          }, 0);
        }
      }, 0);
    }
  }

  openTab(tabId: string, label: string): void {
    const currentTabs = this.tabsSignal();
    const existingTabIndex = currentTabs.findIndex(t => t.id === tabId);

    if (existingTabIndex !== -1) {
      // Tab already exists, switch to it
      this._focusTab(existingTabIndex);
    } else {
      // Find the correct insertion position based on menu order
      let insertIndex = currentTabs.length;
      const menuIndex = this.menuOrder.indexOf(tabId);
      if (menuIndex !== -1) {
        for (let i = 0; i < currentTabs.length; i++) {
          const currentTabMenuIndex = this.menuOrder.indexOf(currentTabs[i].id);
          if (currentTabMenuIndex > menuIndex) {
            insertIndex = i;
            break;
          }
        }
      }

      // Shift active index if inserting before it (avoids signal dedup)
      const currentActive = this.activeTabIndexSignal();
      if (insertIndex <= currentActive) {
        this.activeTabIndexSignal.set(currentActive + 1);
      }

      const newTabs = [...currentTabs];
      newTabs.splice(insertIndex, 0, {
        id: tabId,
        label,
        closeable: true,
        icon: this.tabIcons[tabId],
        emoji: this.tabEmojis[tabId]
      });
      this.tabsSignal.set(newTabs);

      // Defer focus so mat-tab-group renders the new tab first
      this._pendingActiveIndex = insertIndex;
      setTimeout(() => {
        if (this._pendingActiveIndex !== null) {
          this.activeTabIndexSignal.set(this._pendingActiveIndex);
          setTimeout(() => {
            this._pendingActiveIndex = null;
          }, 0);
        }
      }, 0);
    }
  }

  closeTab(tabId: string): void {
    const currentTabs = this.tabsSignal();
    const tabIndex = currentTabs.findIndex(t => t.id === tabId);

    if (tabIndex === -1 || !currentTabs[tabIndex].closeable) {
      return;
    }

    // Remove the tab
    const newTabs = currentTabs.filter(t => t.id !== tabId);
    this.tabsSignal.set(newTabs);

    // Adjust active tab index if needed
    const currentActiveIndex = this.activeTabIndexSignal();
    if (newTabs.length === 0) {
      // All tabs closed
      this.activeTabIndexSignal.set(-1);
    } else if (currentActiveIndex === tabIndex) {
      // Closed the active tab, switch to first available tab
      this.activeTabIndexSignal.set(0);
    } else if (currentActiveIndex > tabIndex) {
      // Active tab is after the closed tab, decrement index
      this.activeTabIndexSignal.set(currentActiveIndex - 1);
    }
  }

  // ============================================================
  // Settings overlay — separate from the single-active panel stack.
  // ============================================================
  // Settings doesn't live in the panel keepalive set; it's a modal that
  // floats over whichever panel is active. UI components (LeftNav,
  // ProfileMenu) call openSettings() to show it; the overlay's own Save /
  // Close buttons call closeSettings().
  readonly settingsOpen = signal(false);
  openSettings(): void { this.settingsOpen.set(true); }
  closeSettings(): void { this.settingsOpen.set(false); }

  // Bug-ticket overlay — same model as settings: floats over whichever panel
  // is active. Profile menu's "Bug" entry flips this; the overlay's own
  // Close button (or backdrop click) flips it back.
  readonly bugOpen = signal(false);
  openBug(): void { this.bugOpen.set(true); }
  closeBug(): void { this.bugOpen.set(false); }

  // Mobile-app "tether" bloom dialog — a small QR/download nudge floated over
  // the app. Profile menu's "Mobile App" entry flips this; the dialog's red X
  // (or backdrop click) flips it back.
  readonly mobileAppOpen = signal(false);
  openMobileApp(): void { this.mobileAppOpen.set(true); }
  closeMobileApp(): void { this.mobileAppOpen.set(false); }

  // Account — a small bloom overlay (limited to "delete account" for now), NOT
  // a full left-nav-style panel. Profile menu's "Account" flips this.
  readonly accountOpen = signal(false);
  openAccount(): void { this.accountOpen.set(true); }
  closeAccount(): void { this.accountOpen.set(false); }

  // In-app web viewer — opens an external page in a bloom iframe overlay instead
  // of a new browser tab (so the user never leaves the app). null = closed.
  readonly webViewUrl = signal<string | null>(null);
  openWebView(url: string): void { this.webViewUrl.set(url); }
  closeWebView(): void { this.webViewUrl.set(null); }

  // ============================================================
  // Single-active panel APIs (replaces the mat-tab strip model)
  // ============================================================
  // These methods preserve the "visited" panel set in `tabsSignal` so that
  // hidden panels stay mounted (and keep their internal state) when the user
  // toggles them off. The left-nav uses togglePanel for its open/close
  // semantics: clicking the currently active item closes back to splash.

  /** Open a panel. Adds it to the visited set if it's not there yet. Always
   *  sets it as the active panel. State is preserved across hide/show. */
  openPanel(tabId: string, label: string): void {
    const currentTabs = this.tabsSignal();
    const existingIndex = currentTabs.findIndex(t => t.id === tabId);
    if (existingIndex !== -1) {
      // Already visited — just activate.
      this._switchToTabInternal(tabId);
      return;
    }
    // First visit — append (or insert per menuOrder).
    let insertIndex = currentTabs.length;
    const menuIndex = this.menuOrder.indexOf(tabId);
    if (menuIndex !== -1) {
      for (let i = 0; i < currentTabs.length; i++) {
        const currentMenuIndex = this.menuOrder.indexOf(currentTabs[i].id);
        if (currentMenuIndex > menuIndex) { insertIndex = i; break; }
      }
    }
    const newTabs = [...currentTabs];
    newTabs.splice(insertIndex, 0, {
      id: tabId,
      label,
      closeable: true,
      icon: this.tabIcons[tabId],
      emoji: this.tabEmojis[tabId],
    });
    this.tabsSignal.set(newTabs);
    this.activeTabIndexSignal.set(insertIndex);
  }

  /** Close the active panel back to the splash (no panel visible). The
   *  closed panel stays in the visited set so its state is preserved when
   *  the user reopens it. */
  closePanel(): void {
    this.activeTabIndexSignal.set(-1);
  }

  /** Toggle a panel: if it's currently active, close it (back to splash);
   *  otherwise, open it. Used by the left-nav single-active model. */
  togglePanel(tabId: string, label: string): void {
    if (this.activeTabId() === tabId) {
      this.closePanel();
    } else {
      this.openPanel(tabId, label);
    }
  }


  switchToChat(): void {
    this.activeTabIndexSignal.set(0);
  }

  switchToTab(tabId: string): void {
    const currentId = this.activeTabId();
    if (currentId !== tabId && this.guardLeave(tabId)) return;
    this._switchToTabInternal(tabId);
  }

  /** Close all tabs - used on logout */
  closeAllTabs(): void {
    this.tabsSignal.set([]);
    this.activeTabIndexSignal.set(-1);
  }

  /** Reset to initial state — used on login. No panels visited, no active
   *  panel: the user lands on the splash screen and chooses what to open
   *  from the left-nav. (A future "default-landing panel" preference will
   *  override this; for now splash is the deterministic post-login state.) */
  resetToChat(): void {
    this.tabsSignal.set([]);
    this.activeTabIndexSignal.set(-1);
  }

  /** Open the video viewer tab with the given URL */
  openVideoViewer(url: string): void {
    this.videoViewerUrl.set(url);
    this.openTab('video-viewer', 'YouTube');
  }

  /** Open the web viewer tab with the given URL and optional label */
  openWebViewer(url: string, label?: string): void {
    this.webViewerUrl.set(url);
    const tabLabel = label ?? (url.toLowerCase().endsWith('.pdf') ? 'Viewer(PDF)' : 'Viewer(Web)');
    this.openTab('web-viewer', tabLabel);
  }

  /** Update the badge count shown on a tab label */
  updateTabBadge(tabId: string, count: number): void {
    const currentTabs = this.tabsSignal();
    const tab = currentTabs.find(t => t.id === tabId);
    if (!tab) return;
    const newBadge = count > 0 ? count : undefined;
    if (tab.badgeCount === newBadge) return;
    const updated = currentTabs.map(t =>
      t.id === tabId ? { ...t, badgeCount: newBadge } : t
    );
    this.tabsSignal.set(updated);
  }

  /** Get current open tab IDs - used for saving settings */
  getOpenTabIds(): string[] {
    return this.tabsSignal().map(tab => tab.id);
  }

  /** Restore tabs from saved settings - used on login */
  restoreFromSettings(tabIds: string[], activeTabId?: string): void {
    // Map of tab ID to label
    const tabLabels: Record<string, string> = {
      'chat': 'Chat',
      'menus': 'Menus & Meals',
      'shop': 'Shopping List',
      'foods': 'My Foods',
      'mealsets': 'MealSets',
      'preferences': 'Settings',
      'account': 'Account',
      'help': 'Help',
      'video-viewer': 'YouTube',
      'issue': 'Bug'
    };

    // Build the visited set from tabIds, sorted by menuOrder so the underlying
    // list stays in menu order regardless of save order.
    const tabs: Tab[] = [];
    const sortedTabIds = [...(tabIds ?? [])].sort((a, b) => {
      const aIndex = this.menuOrder.indexOf(a);
      const bIndex = this.menuOrder.indexOf(b);
      return aIndex - bIndex;
    });
    for (const tabId of sortedTabIds) {
      const label = tabLabels[tabId];
      if (label) {
        tabs.push({
          id: tabId,
          label,
          closeable: true,
          icon: this.tabIcons[tabId],
          emoji: this.tabEmojis[tabId]
        });
      }
    }

    // Ensure the previously-active panel is in the visited set even if it
    // wasn't sent in defaultTabs.
    if (activeTabId && tabLabels[activeTabId] && !tabs.find(t => t.id === activeTabId)) {
      tabs.push({
        id: activeTabId,
        label: tabLabels[activeTabId],
        closeable: true,
        icon: this.tabIcons[activeTabId],
        emoji: this.tabEmojis[activeTabId],
      });
    }

    if (tabs.length === 0) {
      // Nothing saved and no active id — fall back to the post-login default.
      this.resetToChat();
      return;
    }

    this.tabsSignal.set(tabs);

    // Activate the saved panel. After the graft above, the activeTabId is
    // guaranteed to be in `tabs` when one was provided.
    let activeIndex = -1;
    if (activeTabId) {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx !== -1) activeIndex = idx;
    }
    this.activeTabIndexSignal.set(activeIndex);
    console.log('[TabService] Restored tabs from settings:', tabIds, 'active:', activeTabId ?? '(splash)');
  }
}
