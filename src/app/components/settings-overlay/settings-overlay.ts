// src/app/components/settings-overlay/settings-overlay.ts
//
// Settings overlay — replaces the old "Settings as a tab" model. Settings is
// a different kind of window: it floats over whichever panel is active at
// 80% of the viewport, with a dim-yellow "bloom" border that's consistent
// with how the phone app surfaces important context. Dialog controls follow
// the project convention (CLAUDE.md > Dialog conventions): round 20×20
// green-check / red-X discs hanging off the outside top-right corner.
import { Component, ChangeDetectionStrategy, inject, viewChild, signal } from '@angular/core';
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
          <!-- Dialog controls — round Mac-style discs INSIDE the top-right
               corner per CLAUDE.md. The Save text button sits immediately
               to the left of the discs so the two commit surfaces read as
               paired "Save" affordances. Per the dialog convention, the
               green disc APPEARS only when there's something to commit
               (not greyed-out — absent). The Save text button is always
               present but disabled until dirty so the label reinforces
               what the disc means once it materializes. Both pulse in
               sync when active. -->
          <div class="dialog-discs">
            <button
              type="button"
              class="settings-save-btn"
              [class.is-dirty]="preferencesService.hasDirtyGroups()"
              [disabled]="!preferencesService.hasDirtyGroups()"
              (click)="onSave()"
              aria-label="Save settings">
              Save
            </button>
            @if (preferencesService.hasDirtyGroups()) {
              <button
                type="button"
                class="dialog-disc dialog-disc-confirm is-dirty"
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

          <!-- Save-or-discard confirm. Inline modal (not the toast service)
               because the toast has a 10s auto-cancel that would silently
               discard the user's work if they hesitated. Modal forces an
               explicit choice. -->
          @if (showConfirmClose()) {
            <div class="confirm-overlay" (click)="onConfirmCancel()">
              <div class="confirm-dialog" (click)="$event.stopPropagation()">
                <p>Changes have been made — do you want to save?</p>
                <div class="confirm-buttons">
                  <button class="confirm-btn save" (click)="onConfirmSave()">Save</button>
                  <button class="confirm-btn cancel" (click)="onConfirmCancel()">Cancel</button>
                </div>
              </div>
            </div>
          }
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

  /** Inline save-or-discard confirm visibility. */
  showConfirmClose = signal(false);

  onBackdropClick(): void {
    // Don't dismiss on backdrop click if there are unsaved changes — force
    // the user to explicitly Save or Close so a stray click can't lose work.
    if (this.preferencesService.hasDirtyGroups()) return;
    this.tabService.closeSettings();
  }

  onClose(): void {
    // Red X with no changes = just close. With changes = prompt; nothing
    // gets thrown away silently. resetDirtyGroups() alone would leave the
    // in-memory edits intact (they'd reappear on next open), so we use
    // preferencesService.discardChanges() in the Cancel path to actually
    // revert to the cached server state.
    if (!this.preferencesService.hasDirtyGroups()) {
      this.tabService.closeSettings();
      return;
    }
    this.showConfirmClose.set(true);
  }

  async onConfirmSave(): Promise<void> {
    this.showConfirmClose.set(false);
    await this.runSave();
    this.tabService.closeSettings();
  }

  onConfirmCancel(): void {
    this.showConfirmClose.set(false);
    this.preferencesService.discardChanges();
    this.tabService.closeSettings();
  }

  async onSave(): Promise<void> {
    if (!this.preferencesService.hasDirtyGroups()) return;
    await this.runSave();
    this.tabService.closeSettings();
  }

  private async runSave(): Promise<void> {
    try {
      await this.panel().save();
    } catch (err) {
      console.error('[SettingsOverlay] panel save failed:', err);
    }
  }
}
