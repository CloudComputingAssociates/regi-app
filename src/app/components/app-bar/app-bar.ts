// src/app/components/app-bar/app-bar.ts
import { Component, Output, EventEmitter, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ProfileMenuComponent } from '../profile-menu/profile-menu';
import { AuthService } from '@auth0/auth0-angular';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-app-bar',
  imports: [CommonModule, AsyncPipe, MatIconModule, MatButtonModule, ProfileMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="app-bar">
      <div class="app-bar-content">
        <button
          mat-icon-button
          class="menu-button"
          (click)="onMenuClick()"
          aria-label="Open navigation menu">
          <mat-icon>menu</mat-icon>
        </button>

        <span class="app-title">{{ titlePrefix$ | async }} Nutrition Plan</span>

        <app-profile-menu />
      </div>
    </header>
  `,
  styleUrls: ['./app-bar.scss']
})
export class AppBarComponent {
  @Output() menuClick = new EventEmitter<void>();

  private auth = inject(AuthService);

  titlePrefix$ = this.auth.user$.pipe(
    map(user => {
      if (!user?.name) return 'YEH';
      const firstName = user.name.split(' ')[0];
      // Capitalize first letter, lowercase rest
      const name = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
      return name ? `${name}'s` : 'YEH';
    })
  );

  onMenuClick(): void {
    this.menuClick.emit();
  }
}
