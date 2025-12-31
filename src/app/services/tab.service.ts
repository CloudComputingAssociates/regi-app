// src/app/services/tab.service.ts
import { Injectable, signal } from '@angular/core';

export interface Tab {
  id: string;
  label: string;
  closeable: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TabService {
  private tabsSignal = signal<Tab[]>([
    {
      id: 'chat',
      label: 'Chat',
      closeable: false
    },
    {
      id: 'meal-planning',
      label: 'Regimenu™',
      closeable: true
    }
  ]);

  private activeTabIndexSignal = signal<number>(1);  // Default to Regimenu (index 1)

  // Expose signals as readonly
  tabs = this.tabsSignal.asReadonly();
  activeTabIndex = this.activeTabIndexSignal.asReadonly();

  // Define menu order - this determines tab insertion order
  // Left nav: meal-planning, foods, shop (Shopping List), review, preferences
  // Right nav (profile menu): account, help
  private menuOrder = ['chat', 'meal-planning', 'foods', 'shop', 'review', 'preferences', 'account', 'help'];

  toggleTab(tabId: string, label: string): void {
    const currentTabs = this.tabsSignal();
    const existingTabIndex = currentTabs.findIndex(t => t.id === tabId);

    if (existingTabIndex !== -1) {
      // Tab exists - always close it when menu item is clicked
      this.closeTab(tabId);
    } else {
      // Tab doesn't exist - add it in the correct position based on menu order
      const newTab = {
        id: tabId,
        label,
        closeable: true
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
    if (currentActiveIndex === tabIndex) {
      // Closed the active tab, switch to Chat (index 0)
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
}
