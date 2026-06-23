// src/app/components/settings-overlay/settings-overlay.ts
//
// Settings overlay — replaces the old "Settings as a tab" model. Settings is
// a different kind of window: it floats over whichever panel is active at
// 80% of the viewport, with a dim-yellow "bloom" border that's consistent
// with how the phone app surfaces important context. Dialog controls follow
// the project convention (CLAUDE.md > Dialog conventions): round 20×20
// green-check / red-X discs hanging off the outside top-right corner.
import { Component, ChangeDetectionStrategy, inject, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PreferencesPanelComponent } from '../preferences-panel/preferences-panel';
import { PreferencesService } from '../../services/preferences.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-settings-overlay',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, PreferencesPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="settings-backdrop" (click)="onBackdropClick()">
        <div class="settings-window" (click)="$event.stopPropagation()">
          <!-- Dialog controls — round Mac-style discs hanging off the
               outside top-right corner. Green check APPEARS only when
               there's something to save (no disabled-grey state — the
               disc is either fully alive or absent). Red X is always
               present and serves as both "close" and "cancel". -->
          <div class="dialog-discs">
            @if (preferencesService.hasDirtyGroups()) {
              <button
                type="button"
                class="dialog-disc dialog-disc-confirm"
                (click)="onSave()"
                matTooltip="Save"
                matTooltipPosition="below"
                [matTooltipShowDelay]="300"
                aria-label="Save settings">
                <mat-icon>check</mat-icon>
              </button>
            }
            <button
              type="button"
              class="dialog-disc dialog-disc-cancel"
              (click)="onClose()"
              matTooltip="Close"
              matTooltipPosition="below"
              [matTooltipShowDelay]="300"
              aria-label="Close settings">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="settings-header">
            <span class="settings-title">Settings</span>
          </div>
          <div class="settings-body">
            <app-preferences-panel #panel />
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

  /** Handle on the embedded PreferencesPanelComponent so the green-check
   *  disc can trigger its save() flow. The panel owns the persistence; the
   *  overlay just sequences "save → close." */
  private panel = viewChild.required(PreferencesPanelComponent);

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
    // Red X = discard semantically. The green check is the commit path.
    this.preferencesService.resetDirtyGroups();
    this.tabService.closeSettings();
  }

  async onSave(): Promise<void> {
    // Trigger the panel's save flow then close. Close happens regardless of
    // save outcome; the panel surfaces its own error toast on failure.
    try {
      await this.panel().save();
    } catch (err) {
      console.error('[SettingsOverlay] panel save failed:', err);
    }
    this.tabService.closeSettings();
  }
}
