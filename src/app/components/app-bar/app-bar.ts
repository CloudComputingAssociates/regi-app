// src/app/components/app-bar/app-bar.ts
//
// Layout: [hamburger] · breathing space · [RegiMenu^SM] · [active panel name] · [profile menu]
// The RegiMenu logo sits left-of-center next to the hamburger with ample
// padding. The active panel name (from TabService) renders in the same font
// and size to its right, like a breadcrumb.
import { Component, Output, EventEmitter, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule, AsyncPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProfileMenuComponent } from '../profile-menu/profile-menu';
import { TetherIndicatorComponent } from '../tether-indicator/tether-indicator';
import { MacrosComponent } from '../macros/macros';
import { AuthService } from '@auth0/auth0-angular';
import { TabService } from '../../services/tab.service';
import { ThisWeekMacrosService } from '../../services/this-week-macros.service';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-app-bar',
  imports: [CommonModule, AsyncPipe, MatIconModule, MatButtonModule, MatTooltipModule, ProfileMenuComponent, TetherIndicatorComponent, MacrosComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="app-bar">
      <div class="app-bar-content" [class.logged-out]="!isAuthenticated()" [class.centered-title]="!showMacrosBar()">
        @if (isAuthenticated()) {
          <button
            mat-icon-button
            class="menu-button"
            (click)="onMenuClick()"
            aria-label="Open navigation menu">
            <mat-icon>menu</mat-icon>
          </button>
        } @else {
          <div class="menu-button-placeholder"></div>
        }

        <!-- Left-aligned title block: RegiMenu logo + active panel name.
             Breathing room handled by .title-area's padding-left so the
             logo doesn't crowd the hamburger. -->
        <div class="title-area">
          <span class="app-title" [innerHTML]="title$ | async"></span>
          @if (activePanelLabel(); as label) {
            <span class="app-active-panel" aria-label="Active panel">{{ label }}</span>
          }
        </div>

        <!-- Macros bar lives IN the banner on the Menus tab, and on the Foods tab
             while Build-a-Meal is open — pushed toward the right so it sits in the
             space before the tether / user name. -->
        @if (showMacrosBar()) {
          <div class="app-bar-macros"><app-macros /></div>
        }

        <!-- Right zone ≈ the notebook rail width. The tether pins to the LEFT of
             this band (right at the macros' edge, with the macros' own right
             margin as padding); a flex spacer pushes the display name + avatar to
             the far right (the name right-justified up to the circle). -->
        <div class="app-bar-right">
          @if (isAuthenticated()) {
            <app-tether-indicator />
            <!-- Quick Help entry — a yellow "?" the same size as the RegiMenu mark.
                 Sits BETWEEN the tether (phone) and the name cluster, equidistant:
                 the tether's 32px right margin is the left gap, the button's own
                 32px right margin the right gap. Toggles the Help panel.
                 DISABLED until the help system is reimplemented — flip @if to
                 isAuthenticated() to restore. -->
            @if (false) {
              <button
                type="button"
                class="help-q-btn"
                matTooltip="Help (AI chat-based help)"
                matTooltipPosition="below"
                aria-label="Toggle Help"
                (click)="onHelpClick()">?</button>
            }
          }
          <app-profile-menu />
        </div>
      </div>
    </header>
  `,
  styleUrls: ['./app-bar.scss']
})
export class AppBarComponent {
  @Output() menuClick = new EventEmitter<void>();

  private auth = inject(AuthService);
  protected tabService = inject(TabService);
  private thisWeekMacros = inject(ThisWeekMacrosService);

  isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });

  /** Active tab id — drives whether the banner hosts the macros bar. */
  readonly activeTabId = this.tabService.activeTabId;

  /** Show the global macros bar on the Menus tab always, and on the Foods tab
   *  while Build-a-Meal is driving totals (ThisWeekMacrosService.active) — so the
   *  My Foods + Build-a-Meal view mirrors the Menus & Meals top bar exactly. */
  readonly showMacrosBar = computed(() =>
    this.isAuthenticated() &&
    (this.activeTabId() === 'menus' ||
      (this.activeTabId() === 'foods' && this.thisWeekMacros.active())),
  );

  // Always render the branded "RegiMenu^SM" mark — logged-in and logged-out
  // states share the same logo treatment so the title strip doesn't shift
  // between sessions.
  title$ = this.auth.user$.pipe(
    map(() => 'RegiMenu<sup class="sm">SM</sup>')
  );

  /** The label of the currently active panel, or null when nothing is open
   *  (splash visible). Renders next to the RegiMenu logo in the app bar. */
  activePanelLabel = computed(() => {
    const id = this.tabService.activeTabId();
    if (!id) return null;
    // Menus & Meals shows its own title in the board toolbar, so don't duplicate
    // it up here in the app bar.
    if (id === 'menus') return null;
    // My Foods shows its own "My Foods" heading inside the panel now, so don't
    // duplicate it in the app bar next to the RegiMenu mark.
    if (id === 'foods') return null;
    // MealSets has its own "MealSets" header inside the panel — don't repeat it.
    if (id === 'mealsets') return null;
    // Help shows its own "? Help" header inside the panel — don't repeat it, and
    // the lone RegiMenu mark then centers on the hamburger (see .centered-title).
    if (id === 'help') return null;
    return this.tabService.tabs().find(t => t.id === id)?.label ?? null;
  });

  onMenuClick(): void {
    this.menuClick.emit();
  }

  /** Quick-Help "?" in the app bar — toggles Help; a second click (or its X) closes
   *  and returns to the panel that was active when Help opened. */
  onHelpClick(): void {
    this.tabService.toggleHelp();
  }
}
