// src/app/components/main-body/main-body.ts
//
// Single-active panel host. There is no longer a tab strip — the left-nav
// is the navigator. Once a panel is visited (open from the left-nav at
// least once), its component stays mounted but hidden so its internal state
// (filters, scroll, signals) is preserved across hide/show.
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';
import { PreferencesService } from '../../services/preferences.service';
import { ChatComponent } from '../chat/chat';
import { MealsPanelComponent } from '../meals-panel/meals-panel';
import { ShoppingPanelComponent } from '../shopping-panel/shopping-panel';
import { WeekPlanPanelComponent } from '../week-plan-panel/week-plan-panel';
import { FoodsPanelComponent } from '../foods-panel/foods-panel';
import { AccountPanelComponent } from '../account-panel/account-panel';
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
    ChatComponent,
    MealsPanelComponent,
    ShoppingPanelComponent,
    WeekPlanPanelComponent,
    FoodsPanelComponent,
    AccountPanelComponent,
    TodayPanelComponent,
    NotificationComponent,
    VideoViewerComponent,
    RecipeViewerComponent,
    IssuePanelComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="main-body-container">
      <!-- Splash background — shown whenever no panel is the active one
           (no left-nav item highlighted). The user toggles back here by
           clicking the active nav item again. -->
      @if (tabService.activeTabId() === null) {
        <div class="empty-state">
          <img src="/images/YEH3.png" alt="You Eating Healthy" class="empty-state-image" />
        </div>
      }

      <!-- Each panel is mounted once (the first time it's visited) and stays
           in the DOM thereafter, hidden via [hidden] when not active. This
           is the "keepalive" — state preservation without a router. -->
      @if (tabService.hasVisited('today')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'today'">
          <app-today-panel />
        </div>
      }
      @if (tabService.hasVisited('chat')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'chat'">
          <app-chat />
        </div>
      }
      @if (tabService.hasVisited('meal-planning')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'meal-planning'">
          <app-meals-panel />
        </div>
      }
      @if (tabService.hasVisited('foods')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'foods'">
          <app-foods-panel />
        </div>
      }
      @if (tabService.hasVisited('shop')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'shop'">
          <app-shopping-panel />
        </div>
      }
      @if (tabService.hasVisited('review')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'review'">
          <app-week-plan-panel />
        </div>
      }
      @if (tabService.hasVisited('account')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'account'">
          <app-account-panel />
        </div>
      }
      @if (tabService.hasVisited('video-viewer')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'video-viewer'">
          <app-video-viewer />
        </div>
      }
      @if (tabService.hasVisited('web-viewer')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'web-viewer'">
          <app-recipe-viewer />
        </div>
      }
      @if (tabService.hasVisited('issue')) {
        <div class="panel-host" [hidden]="tabService.activeTabId() !== 'issue'">
          <app-issue-panel />
        </div>
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
    // Register guard: block leaving Settings when there are unsaved changes.
    // Settings now lives in an overlay (see SettingsOverlayComponent), but
    // the guard is still useful if any caller invokes switchToTab/closePanel
    // while preferences are dirty.
    this.tabService.setBeforeLeaveGuard(() => {
      const currentTabId = this.tabService.activeTabId();
      return currentTabId === 'preferences' && this.preferencesService.hasDirtyGroups();
    });
  }

  confirmTabSwitch(): void {
    this.preferencesService.resetDirtyGroups();
    this.tabService.completeBlockedSwitch();
  }

  cancelTabSwitch(): void {
    this.tabService.cancelBlockedSwitch();
  }
}
