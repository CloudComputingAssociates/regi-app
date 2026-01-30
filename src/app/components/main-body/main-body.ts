// src/app/components/main-body/main-body.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TabService } from '../../services/tab.service';
import { ChatComponent } from '../chat/chat';
import { RegimenuPanelComponent } from '../regimenu-panel/regimenu-panel';
import { ShoppingPanelComponent } from '../shopping-panel/shopping-panel';
import { ProgressPanelComponent } from '../progress-panel/progress-panel';
import { FoodsPanelComponent } from '../foods-panel/foods-panel';
import { AccountPanelComponent } from '../account-panel/account-panel';
import { PreferencesPanelComponent } from '../preferences-panel/preferences-panel';
import { NotificationComponent } from '../notification/notification';

@Component({
  selector: 'app-main-body',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    ChatComponent,
    RegimenuPanelComponent,
    ShoppingPanelComponent,
    ProgressPanelComponent,
    FoodsPanelComponent,
    AccountPanelComponent,
    PreferencesPanelComponent,
    NotificationComponent
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
                <span class="tab-label-content">
                  @if (tab.icon) {
                    <img [src]="tab.icon" alt="" class="tab-icon" />
                  } @else if (tab.emoji) {
                    <span class="tab-emoji">{{ tab.emoji }}</span>
                  }
                  <span class="tab-label-text">{{ tab.label }}</span>
                </span>
              </ng-template>

              <div class="tab-content">
                @if (tab.id === 'chat') {
                  <app-chat />
                } @else if (tab.id === 'meal-planning') {
                  <app-regimenu-panel />
                } @else if (tab.id === 'foods') {
                  <app-foods-panel />
                } @else if (tab.id === 'shop') {
                  <app-shopping-panel />
                } @else if (tab.id === 'review') {
                  <app-progress-panel />
                } @else if (tab.id === 'preferences') {
                  <app-preferences-panel />
                } @else if (tab.id === 'account') {
                  <app-account-panel />
                } @else if (tab.id === 'help') {
                  <div class="placeholder-content">
                    <p class="placeholder-text">Help - Coming soon</p>
                  </div>
                }
              </div>
            </mat-tab>
          }

        </mat-tab-group>
      }

      <!-- Notification component (always present) -->
      <app-notification />
    </div>
  `,
  styleUrls: ['./main-body.scss']
})
export class MainBodyComponent {
  tabService = inject(TabService);

  onTabIndexChange(index: number): void {
    // Skip stale emissions from mat-tab-group during tab addition
    if (this.tabService.hasPendingFocus()) return;

    // When user manually clicks a tab, update the service
    const tabs = this.tabService.tabs();
    if (tabs[index]) {
      this.tabService.switchToTab(tabs[index].id);
    }
  }
}
