// src/app/services/tab.service.ts
import { Injectable, signal, computed } from '@angular/core';

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
  readonly blockedTabSwitch = signal<{ targetTabId: string } | null>(null);

  /** Register a guard that can block leaving the current tab */
  setBeforeLeaveGuard(guard: (() => boolean) | null): void {
    this._beforeLeaveGuard = guard;
  }

  /** Check guard and block if needed; returns true if blocked */
  private guardLeave(targetTabId: string): boolean {
    if (this._beforeLeaveGuard && this._beforeLeaveGuard()) {
      this.blockedTabSwitch.set({ targetTabId });
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

  /** Cancel a blocked tab switch */
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
  // Left nav: today, review (Week Plans), meal-planning, shop (Shopping List), foods (Food Preferences), chat
  // Right nav (profile menu): account, preferences (Settings), help
  private menuOrder = ['today', 'review', 'meal-planning', 'shop', 'foods', 'chat', 'preferences', 'account', 'help'];

  // Tabs that get an image icon
  private tabIcons: Record<string, string> = {
    'chat': '/images/AI-star.png',
    'meal-planning': '/images/AI-star.png',
    'foods': '/favicon.ico',
    'preferences': '/images/AI-star.png'
  };

  // Tabs that get an emoji icon
  private tabEmojis: Record<string, string> = {
    'today': '📋',
    'shop': '🛒',
    'review': '📅'
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
        closeable: tabId !== 'today',
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
        closeable: tabId !== 'today',
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

  /** Reset to initial state with Today tab open - used on login */
  resetToChat(): void {
    this.tabsSignal.set([
      { id: 'today', label: 'Today', closeable: false, emoji: this.tabEmojis['today'] }
    ]);
    this.activeTabIndexSignal.set(0);
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
    if (!tabIds || tabIds.length === 0) {
      // Fall back to default (just Chat)
      this.resetToChat();
      return;
    }

    // Map of tab ID to label
    const tabLabels: Record<string, string> = {
      'today': 'Today',
      'chat': 'Chat',
      'meal-planning': 'RegiMenu Meals',
      'shop': 'Shopping List',
      'foods': 'Food Preferences',
      'review': 'Week Plans',
      'preferences': 'Settings',
      'account': 'Account',
      'help': 'Help'
    };

    // Create tabs in the order they were saved, but sorted by menuOrder
    const tabs: Tab[] = [];

    // Sort tab IDs by menu order
    const sortedTabIds = [...tabIds].sort((a, b) => {
      const aIndex = this.menuOrder.indexOf(a);
      const bIndex = this.menuOrder.indexOf(b);
      return aIndex - bIndex;
    });

    // Ensure 'today' is always included
    if (!sortedTabIds.includes('today')) {
      sortedTabIds.unshift('today');
    }

    for (const tabId of sortedTabIds) {
      const label = tabLabels[tabId];
      if (label) {
        tabs.push({
          id: tabId,
          label,
          closeable: tabId !== 'today',
          icon: this.tabIcons[tabId],
          emoji: this.tabEmojis[tabId]
        });
      }
    }

    if (tabs.length === 0) {
      // No valid tabs, fall back to default
      this.resetToChat();
      return;
    }

    this.tabsSignal.set(tabs);

    // Restore the previously active tab, or default to first tab
    let activeIndex = 0;
    if (activeTabId) {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx !== -1) {
        activeIndex = idx;
      }
    }
    this.activeTabIndexSignal.set(activeIndex);
    console.log('[TabService] Restored tabs from settings:', tabIds, 'active:', activeTabId ?? tabs[0].id);
  }
}
