// src/app/components/left-nav/left-nav.ts
import { Component, EventEmitter, Output, ViewChild, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { TabService } from '../../services/tab.service';
import { RoleService } from '../../services/role.service';
import { AuthService } from '@auth0/auth0-angular';
import { map } from 'rxjs/operators';

interface MenuItem {
  label: string;
  icon?: string;  // Emoji icon
  iconImage?: string;  // Image path for logo
  matIcon?: string;  // Material icon name (monochrome, tintable via `color`)
  color?: string;    // Tint for the matIcon
  tabId: string;
}

@Component({
  selector: 'app-left-nav',
  standalone: true,
  imports: [CommonModule, MatSidenavModule, MatIconModule, MatListModule],
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
              <h3 class="user-name">RegiMenu<sup class="sm">SM</sup></h3>
              <p class="user-subtitle">Stop tracking, start planning</p>
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

        <!-- Menu Items (only when authenticated) -->
        @if (isAuthenticated()) {
          <mat-nav-list class="menu-list">
            <mat-list-item
              *ngFor="let item of menuItems()"
              (click)="navigateTo(item.tabId, drawer)"
              class="menu-item"
              [class.active]="isTabOpen(item.tabId)">
              <div class="menu-item-content">
                @if (item.matIcon) {
                  <mat-icon class="menu-mat-icon" [style.color]="item.color">{{ item.matIcon }}</mat-icon>
                } @else if (item.iconImage) {
                  <img [src]="item.iconImage" [alt]="item.label" class="menu-icon-image" />
                } @else {
                  <span class="menu-icon">{{ item.icon }}</span>
                }
                <span class="menu-label" [innerHTML]="formatLabel(item.label)"></span>
              </div>
            </mat-list-item>
          </mat-nav-list>
        } @else {
          <div class="login-prompt">
            <p>Please log in to access features</p>
          </div>
        }
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
  isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });

  // Get user's first name from Auth0 user profile
  userFirstName$ = this.auth.user$.pipe(
    map(user => {
      if (!user?.name) return 'Your';
      // Extract first name (split by space and take first part)
      const firstName = user.name.split(' ')[0];
      return firstName || 'Your';
    })
  );

  private roleService = inject(RoleService);

  private readonly baseMenuItems: MenuItem[] = [
    { label: 'Chat', matIcon: 'forum', color: '#ff8c1a', tabId: 'chat' },
    { label: 'Menus & Meals', matIcon: 'restaurant', color: '#43c13a', tabId: 'menus' },
    { label: 'My Foods', iconImage: 'favicon.ico', tabId: 'foods' },
    { label: 'Shopping List', matIcon: 'shopping_cart', color: '#a53ee0', tabId: 'shop' }
  ];

  /** Nav items — the MealSets authoring entry is appended only for MealSetOwners
   *  (cosmetic; the server enforces the role on every owner endpoint). */
  readonly menuItems = computed<MenuItem[]>(() =>
    this.roleService.hasRole('MealSetOwner')
      ? [...this.baseMenuItems, { label: 'MealSets Studio', matIcon: 'restaurant_menu', color: '#ffd54f', tabId: 'mealsets' }]
      : this.baseMenuItems
  );

  tabService = inject(TabService);

  toggleDrawer(): void {
    this.drawer.toggle();
  }

  formatLabel(label: string): string {
    return label.replace('RegiMenu', 'RegiMenu<sup class="sm">SM</sup>');
  }

  /** True if this nav item's panel is the currently active one. Used to
   *  highlight the active item in the drawer. */
  isTabOpen(tabId: string): boolean {
    return this.tabService.activeTabId() === tabId;
  }

  /** Click a left-nav item:
   *   - If the clicked panel is already active → close it (returns to splash).
   *   - Otherwise → open it (mounts on first visit, swaps to it on later).
   *  Panel state is preserved across hide/show via the visited set. */
  navigateTo(tabId: string, drawer: MatSidenav): void {
    const menuItem = this.menuItems().find(item => item.tabId === tabId);
    if (menuItem) {
      this.tabService.togglePanel(tabId, menuItem.label);
    }
    drawer.close();
  }
}
