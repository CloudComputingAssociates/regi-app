// src/app/components/regimenu-panel/regimenu-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-regimenu-panel',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Confirmation dialog -->
      @if (showConfirmDialog()) {
        <div class="confirm-overlay" (click)="cancelClose()">
          <div class="confirm-dialog" (click)="$event.stopPropagation()">
            <p>You have unsaved changes. Close without saving?</p>
            <div class="confirm-buttons">
              <button class="confirm-btn discard" (click)="confirmClose()">Discard</button>
              <button class="confirm-btn cancel" (click)="cancelClose()">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- Action buttons - top right -->
      <div class="action-buttons">
        <button
          class="icon-btn close-btn"
          (click)="close()"
          title="Close without saving">
          ✕
        </button>
        <button
          class="icon-btn save-btn"
          [class.has-changes]="hasChanges()"
          (click)="saveAndClose()"
          title="Save and close">
          ✓
        </button>
      </div>

      <!-- Main content area -->
      <div class="panel-content">
        <div class="content-placeholder">
          <p class="placeholder-text">Regimenu℠</p>
          <p class="placeholder-subtext">Intelligent meal planning powered by AI</p>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./regimenu-panel.scss']
})
export class RegimenuPanelComponent {
  private tabService = inject(TabService);

  showConfirmDialog = signal(false);
  private changesExist = signal(false);

  hasChanges(): boolean {
    return this.changesExist();
  }

  close(): void {
    if (this.hasChanges()) {
      this.showConfirmDialog.set(true);
    } else {
      this.tabService.closeTab('meal-planning');
    }
  }

  confirmClose(): void {
    this.showConfirmDialog.set(false);
    this.tabService.closeTab('meal-planning');
  }

  cancelClose(): void {
    this.showConfirmDialog.set(false);
  }

  saveAndClose(): void {
    // TODO: Implement save logic when meal planning data exists
    this.changesExist.set(false);
    this.tabService.closeTab('meal-planning');
  }
}
