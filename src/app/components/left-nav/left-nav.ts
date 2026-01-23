// src/app/components/left-nav/left-nav.ts
import { Component, EventEmitter, Output, ViewChild, inject } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { TabService } from '../../services/tab.service';
import { AuthService } from '@auth0/auth0-angular';
import { map } from 'rxjs/operators';

interface MenuItem {
  label: string;
  icon?: string;  // Emoji icon
  iconImage?: string;  // Image path for logo
  tabId: string;
}

@Component({
  selector: 'app-left-nav',
  standalone: true,
  imports: [CommonModule, AsyncPipe, MatSidenavModule, MatIconModule, MatListModule],
  template: `
    <mat-sidenav-container class="sidenav-container">
      <mat-sidenav
        #drawer
        mode="over"
        [opened]="false"
        class="left-nav">

        <!-- Drawer Header -->
        <div class="drawer-header">
          <div class="user-info">
            <img
              src="images/yeh_logo_dark.png"
              alt="Profile"
              class="drawer-profile-image" />
            <div class="user-details">
              <h3 class="user-name">you eating healthy</h3>
              <p class="user-subtitle">Intelligent Nutrition Planning</p>
            </div>
          </div>
          <button
            mat-icon-button
            (click)="drawer.close()"
            class="close-button"
            aria-label="Close menu">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <!-- Menu Items -->
        <mat-nav-list class="menu-list">
          <mat-list-item
            *ngFor="let item of menuItems"
            (click)="navigateTo(item.tabId, drawer)"
            class="menu-item"
            [class.active]="isTabOpen(item.tabId)">
            @if (item.iconImage) {
              <img [src]="item.iconImage" [alt]="item.label" class="menu-icon-image" />
            } @else {
              <span class="menu-icon">{{ item.icon }}</span>
            }
            <span class="menu-label">{{ item.label }}</span>
          </mat-list-item>
        </mat-nav-list>
      </mat-sidenav>

      <!-- Main Content -->
      <mat-sidenav-content>
        <ng-content></ng-content>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styleUrls: ['./left-nav.scss']
})
export class LeftNavComponent {
  @ViewChild('drawer') drawer!: MatSidenav;
  @Output() drawerToggle = new EventEmitter<void>();

  private auth = inject(AuthService);

  // Get user's first name from Auth0 user profile
  userFirstName$ = this.auth.user$.pipe(
    map(user => {
      if (!user?.name) return 'Your';
      // Extract first name (split by space and take first part)
      const firstName = user.name.split(' ')[0];
      return firstName || 'Your';
    })
  );

  menuItems: MenuItem[] = [
    { label: 'Chat', iconImage: 'images/AI-star.png', tabId: 'chat' },
    { label: 'Regimenu℠', iconImage: 'images/AI-star.png', tabId: 'meal-planning' },
    { label: 'Shopping', icon: '🛒', tabId: 'shop' },
    { label: 'Progress', icon: '📈', tabId: 'review' },
    { label: 'Preferences', icon: '⚙️', tabId: 'preferences' }
  ];

  tabService = inject(TabService);

  toggleDrawer(): void {
    this.drawer.toggle();
  }

  isTabOpen(tabId: string): boolean {
    return this.tabService.tabs().some(tab => tab.id === tabId);
  }

  navigateTo(tabId: string, drawer: MatSidenav): void {
    if (tabId === 'chat') {
      this.tabService.switchToChat();
    } else {
      const menuItem = this.menuItems.find(item => item.tabId === tabId);
      if (menuItem) {
        this.tabService.toggleTab(tabId, menuItem.label);
      }
    }
    drawer.close();
  }
}
