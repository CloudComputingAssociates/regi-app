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
      <!-- One panel at a time — fresh mount every open. No keepalive: when
           you switch panels (or toggle the active one off via the left-nav)
           the previous component is destroyed, so reopening always lands in
           its default state. Splash renders when nothing is active. -->
      @switch (tabService.activeTabId()) {
        @case ('today') { <app-today-panel /> }
        @case ('chat') { <app-chat /> }
        @case ('meal-planning') { <app-meals-panel /> }
        @case ('foods') { <app-foods-panel /> }
        @case ('shop') { <app-shopping-panel /> }
        @case ('review') { <app-week-plan-panel /> }
        @case ('account') { <app-account-panel /> }
        @case ('video-viewer') { <app-video-viewer /> }
        @case ('web-viewer') { <app-recipe-viewer /> }
        @case ('issue') { <app-issue-panel /> }
        @default {
          <div class="empty-state">
            <img src="/images/YEH3.png" alt="You Eating Healthy" class="empty-state-image" />
          </div>
        }
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
