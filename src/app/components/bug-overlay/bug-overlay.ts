// src/app/components/bug-overlay/bug-overlay.ts
//
// Bug-ticket overlay — wraps the IssuePanelComponent in a floating, halo-
// bordered window that matches the SettingsOverlayComponent shape. Same UX
// affordance: dim backdrop, dim-yellow bloom border around an 80vw card,
// title + Close header. Triggered from the Profile menu's "Bug" entry via
// TabService.bugOpen.
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IssuePanelComponent } from '../issue-panel/issue-panel';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-bug-overlay',
  imports: [CommonModule, MatIconModule, MatTooltipModule, IssuePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="bug-backdrop" (click)="onBackdropClick()">
        <div class="bug-window" (click)="$event.stopPropagation()">
          <!-- Dialog controls — green-check (submit) + red-X (close) discs
               hanging off the outside top-right corner per CLAUDE.md >
               Dialog conventions. The green disc is the ONLY submit
               affordance; the panel has no inline submit button. Disabled
               when the form isn't ready (empty fields, mid-submit, or
               already-submitted success state) via the panel's public
               canSubmit() computed. -->
          <div class="dialog-discs">
            <button
              type="button"
              class="dialog-disc dialog-disc-confirm"
              [disabled]="!panel.canSubmit()"
              (click)="onSubmit(panel)"
              matTooltip="Submit"
              matTooltipPosition="below"
              [matTooltipShowDelay]="300"
              aria-label="Submit bug">
              <mat-icon>check</mat-icon>
            </button>
            <button
              type="button"
              class="dialog-disc dialog-disc-cancel"
              (click)="onClose()"
              matTooltip="Close"
              matTooltipPosition="below"
              [matTooltipShowDelay]="300"
              aria-label="Close bug form">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="bug-header">
            <span class="bug-title">Bug — Ticket Submission Form</span>
          </div>
          <div class="bug-body">
            <app-issue-panel #panel />
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['./bug-overlay.scss'],
})
export class BugOverlayComponent {
  private tabService = inject(TabService);

  isOpen = this.tabService.bugOpen;

  onBackdropClick(): void {
    this.tabService.closeBug();
  }

  onClose(): void {
    this.tabService.closeBug();
  }

  /** Fire the panel's submit. The panel owns its own success/error toast
   *  and updates its internal `submitted` signal — overlay stays open so
   *  the user can see the success state and either close or submit
   *  another. (No auto-close on success: a closing animation would steal
   *  the confirmation feedback.) Uses the template-ref instance for
   *  symmetry with the [disabled] binding above. */
  async onSubmit(panel: IssuePanelComponent): Promise<void> {
    await panel.submitIssue();
  }
}
