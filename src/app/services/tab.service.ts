// src/app/services/tab.service.ts
import { Injectable, signal, computed } from '@angular/core';

export interface Tab {
  id: string;
  label: string;
  closeable: boolean;
  icon?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TabService {
  // Start with no tabs - Chat tab is added on login via resetToChat()
  private tabsSignal = signal<Tab[]>([]);

  private activeTabIndexSignal = signal<number>(-1);  // No active tab until login

  // Expose signals as readonly
  tabs = this.tabsSignal.asReadonly();
  activeTabIndex = this.activeTabIndexSignal.asReadonly();

  /** The ID of the currently active tab */
  activeTabId = computed(() => {
    const index = this.activeTabIndexSignal();
    const allTabs = this.tabsSignal();
    return allTabs[index]?.id ?? null;
  });

  // Define menu order - this determines tab insertion order
  // Left nav: meal-planning, foods, shop (Shopping List), review, preferences
  // Right nav (profile menu): account, help
  private menuOrder = ['chat', 'meal-planning', 'foods', 'shop', 'review', 'preferences', 'account', 'help'];

  // Tabs that get an icon
  private tabIcons: Record<string, string> = {
    'chat': '/images/AI-star.png',
    'meal-planning': '/images/AI-star.png'
  };

  toggleTab(tabId: string, label: string): void {
    const currentTabs = this.tabsSignal();
    const existingTabIndex = currentTabs.findIndex(t => t.id === tabId);

    if (existingTabIndex !== -1) {
      // Tab exists - always close it when menu item is clicked
      this.closeTab(tabId);
    } else {
      // Tab doesn't exist - add it in the correct position based on menu order
      const newTab: Tab = {
        id: tabId,
        label,
        closeable: true,
        icon: this.tabIcons[tabId]
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

      // Insert the tab at the correct position
      const newTabs = [...currentTabs];
      newTabs.splice(insertIndex, 0, newTab);
      this.tabsSignal.set(newTabs);

      // Switch to the new tab
      this.activeTabIndexSignal.set(insertIndex);
    }
  }

  openTab(tabId: string, label: string): void {
    const currentTabs = this.tabsSignal();
    const existingTabIndex = currentTabs.findIndex(t => t.id === tabId);

    if (existingTabIndex !== -1) {
      // Tab already exists, just switch to it
      this.activeTabIndexSignal.set(existingTabIndex);
    } else {
      // Add new tab
      this.tabsSignal.set([
        ...currentTabs,
        {
          id: tabId,
          label,
          closeable: true
        }
      ]);
      // Switch to the new tab
      this.activeTabIndexSignal.set(currentTabs.length);
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
    const currentTabs = this.tabsSignal();
    const tabIndex = currentTabs.findIndex(t => t.id === tabId);
    if (tabIndex !== -1) {
      this.activeTabIndexSignal.set(tabIndex);
    }
  }

  /** Close all tabs - used on logout */
  closeAllTabs(): void {
    this.tabsSignal.set([]);
    this.activeTabIndexSignal.set(-1);
  }

  /** Reset to initial state with Chat tab open - used on login */
  resetToChat(): void {
    this.tabsSignal.set([
      { id: 'chat', label: 'Chat', closeable: true, icon: this.tabIcons['chat'] }
    ]);
    this.activeTabIndexSignal.set(0);
  }

  /** Get current open tab IDs - used for saving settings */
  getOpenTabIds(): string[] {
    return this.tabsSignal().map(tab => tab.id);
  }

  /** Restore tabs from saved settings - used on login */
  restoreFromSettings(tabIds: string[]): void {
    if (!tabIds || tabIds.length === 0) {
      // Fall back to default (just Chat)
      this.resetToChat();
      return;
    }

    // Map of tab ID to label
    const tabLabels: Record<string, string> = {
      'chat': 'Chat',
      'meal-planning': 'Regimenu℠',
      'foods': 'Foods',
      'shop': 'Shopping List',
      'review': 'Review',
      'preferences': 'Preferences',
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

    for (const tabId of sortedTabIds) {
      const label = tabLabels[tabId];
      if (label) {
        tabs.push({
          id: tabId,
          label,
          closeable: true,
          icon: this.tabIcons[tabId]
        });
      }
    }

    if (tabs.length === 0) {
      // No valid tabs, fall back to default
      this.resetToChat();
      return;
    }

    this.tabsSignal.set(tabs);
    this.activeTabIndexSignal.set(0);
    console.log('[TabService] Restored tabs from settings:', tabIds);
  }
}
