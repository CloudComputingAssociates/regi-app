// src/app/components/main-body/main-body.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TabService } from '../../services/tab.service';
import { PreferencesService } from '../../services/preferences.service';
import { ChatComponent } from '../chat/chat';
import { MealsPanelComponent } from '../meals-panel/meals-panel';
import { ShoppingPanelComponent } from '../shopping-panel/shopping-panel';
import { WeekPlanPanelComponent } from '../week-plan-panel/week-plan-panel';
import { FoodsPanelComponent } from '../foods-panel/foods-panel';
import { AccountPanelComponent } from '../account-panel/account-panel';
import { PreferencesPanelComponent } from '../preferences-panel/preferences-panel';
import { TodayPanelComponent } from '../today-panel/today-panel';
import { NotificationComponent } from '../notification/notification';
import { VideoViewerComponent } from '../video-viewer/video-viewer';
import { RecipeViewerComponent } from '../recipe-viewer/recipe-viewer';
import { IssuePanelComponent } from '../issue-panel/issue-panel';

@Component({
  selector: 'app-main-body',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    ChatComponent,
    MealsPanelComponent,
    ShoppingPanelComponent,
    WeekPlanPanelComponent,
    FoodsPanelComponent,
    AccountPanelComponent,
    PreferencesPanelComponent,
    TodayPanelComponent,
    NotificationComponent,
    VideoViewerComponent,
    RecipeViewerComponent,
    IssuePanelComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="main-body-container">
      @if (tabService.tabs().length === 0) {
        <!-- Empty state with background image -->
        <div class="empty-state">
          <img src="/images/YEH3.png" alt="You Eating Healthy" class="empty-state-image" />
        </div>
      } @else {
        <mat-tab-group
          [selectedIndex]="tabService.activeTabIndex()"
          (selectedIndexChange)="onTabIndexChange($event)"
          class="main-body-tabs">

          @for (tab of tabService.tabs(); track tab.id; let i = $index) {
            <mat-tab>
              <ng-template mat-tab-label>
                <span class="tab-label-content" (mousedown)="onTabLabelClick($event, tab.id)">
                  @if (tab.icon) {
                    <img [src]="tab.icon" alt="" class="tab-icon" />
                  } @else if (tab.emoji) {
                    <span class="tab-emoji">{{ tab.emoji }}</span>
                  }
                  <span class="tab-label-text" [innerHTML]="formatTabLabel(tab.label)"></span>
                  @if (tab.badgeCount) {
                    <span class="tab-badge">({{ tab.badgeCount }})</span>
                  }
                </span>
              </ng-template>

              <!-- Lazy: component only created when tab is first selected -->
              <ng-template matTabContent>
                <div class="tab-content">
                  @if (tab.id === 'today') {
                    <app-today-panel />
                  } @else if (tab.id === 'chat') {
                    <app-chat />
                  } @else if (tab.id === 'meal-planning') {
                    <app-meals-panel />
                  } @else if (tab.id === 'foods') {
                    <app-foods-panel />
                  } @else if (tab.id === 'shop') {
                    <app-shopping-panel />
                  } @else if (tab.id === 'review') {
                    <app-week-plan-panel />
                  } @else if (tab.id === 'preferences') {
                    <app-preferences-panel />
                  } @else if (tab.id === 'account') {
                    <app-account-panel />
                  } @else if (tab.id === 'video-viewer') {
                    <app-video-viewer />
                  } @else if (tab.id === 'web-viewer') {
                    <app-recipe-viewer />
                  } @else if (tab.id === 'issue') {
                    <app-issue-panel />
                  } @else if (tab.id === 'help') {
                    <div class="placeholder-content">
                      <div class="action-buttons">
                        <button
                          class="icon-btn close-btn"
                          (click)="closeTab('help')"
                          title="Close">
                          ✕
                        </button>
                      </div>
                      <p class="placeholder-text">Help - Coming soon</p>
                    </div>
                  }
                </div>
              </ng-template>
            </mat-tab>
          }

        </mat-tab-group>
      }

      <!-- Notification component (always present) -->
      <app-notification />

      @if (tabService.blockedTabSwitch()) {
        <div class="confirm-overlay" (click)="cancelTabSwitch()">
          <div class="confirm-dialog" (click)="$event.stopPropagation()">
            <p>You have unsaved changes. Discard them?</p>
            <div class="confirm-buttons">
              <button class="confirm-btn discard" (click)="confirmTabSwitch()">Discard</button>
              <button class="confirm-btn cancel" (click)="cancelTabSwitch()">Cancel</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./main-body.scss']
})
export class MainBodyComponent {
  tabService = inject(TabService);
  private preferencesService = inject(PreferencesService);

  constructor() {
    // Register guard: block leaving preferences tab when there are unsaved changes
    this.tabService.setBeforeLeaveGuard(() => {
      const currentTabId = this.tabService.activeTabId();
      return currentTabId === 'preferences' && this.preferencesService.hasDirtyGroups();
    });
  }

  formatTabLabel(label: string): string {
    return label.replace('RegiMenu', 'RegiMenu<sup class="sm">SM</sup>');
  }

  onTabLabelClick(event: MouseEvent, tabId: string): void {
    const currentId = this.tabService.activeTabId();
    if (currentId === tabId) return; // clicking the active tab, no guard needed
    if (this.preferencesService.hasDirtyGroups() && currentId === 'preferences') {
      event.preventDefault();
      event.stopPropagation();
      this.tabService.blockSwitch(tabId);
    }
  }

  onTabIndexChange(index: number): void {
    if (this.tabService.hasPendingFocus()) return;
    if (this.tabService.blockedTabSwitch()) return; // guard already intercepted

    const tabs = this.tabService.tabs();
    if (tabs[index]) {
      this.tabService.switchToTab(tabs[index].id);
    }
  }

  confirmTabSwitch(): void {
    this.preferencesService.resetDirtyGroups();
    this.tabService.completeBlockedSwitch();
  }

  cancelTabSwitch(): void {
    this.tabService.cancelBlockedSwitch();
  }

  closeTab(tabId: string): void {
    this.tabService.closeTab(tabId);
  }
}
