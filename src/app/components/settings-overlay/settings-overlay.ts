// src/app/components/settings-overlay/settings-overlay.ts
//
// Settings overlay — replaces the old "Settings as a tab" model. Settings is
// a different kind of window: it floats over whichever panel is active at
// 80% of the viewport, with a dim-yellow "bloom" border that's consistent
// with how the phone app surfaces important context. Has a Save / Close
// header in place of a plain X to signal that there's a commit step.
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { PreferencesPanelComponent } from '../preferences-panel/preferences-panel';
import { PreferencesService } from '../../services/preferences.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-settings-overlay',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, PreferencesPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="settings-backdrop" (click)="onBackdropClick()">
        <div class="settings-window" (click)="$event.stopPropagation()">
          <div class="settings-header">
            <span class="settings-title">Settings</span>
            <div class="settings-actions">
              <button
                type="button"
                class="settings-action settings-save"
                [disabled]="!preferencesService.hasDirtyGroups()"
                (click)="onSave()">
                Save
              </button>
              <button
                type="button"
                class="settings-action settings-close"
                (click)="onClose()">
                Close
              </button>
            </div>
          </div>
          <div class="settings-body">
            <app-preferences-panel />
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['./settings-overlay.scss'],
})
export class SettingsOverlayComponent {
  private tabService = inject(TabService);
  preferencesService = inject(PreferencesService);

  /** Open state is read straight from the service so any UI element can
   *  flip it (LeftNav, ProfileMenu, etc.) without needing a template ref. */
  isOpen = this.tabService.settingsOpen;

  onBackdropClick(): void {
    // Don't dismiss on backdrop click if there are unsaved changes — force
    // the user to explicitly Save or Close so a stray click can't lose work.
    if (this.preferencesService.hasDirtyGroups()) return;
    this.tabService.closeSettings();
  }

  onClose(): void {
    // Close = discard semantically. The Save button is the commit path.
    this.preferencesService.resetDirtyGroups();
    this.tabService.closeSettings();
  }

  onSave(): void {
    // The embedded PreferencesPanelComponent owns the actual persistence.
    // Here we just close the overlay; the panel writes through on its own
    // Save flow which is already wired.
    this.tabService.closeSettings();
  }
}
