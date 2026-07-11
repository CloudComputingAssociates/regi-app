// src/app/components/account-panel/account-panel.ts
//
// Account is a small BLOOM overlay (like Settings / Bug / Mobile App), NOT a
// full left-nav panel — no macros bar, no chat input. Limited to the "delete
// account" danger zone for now. Opened from the profile menu (TabService.
// accountOpen); closed by the red X disc or a backdrop click.
import { Component, ChangeDetectionStrategy, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@auth0/auth0-angular';
import { TabService } from '../../services/tab.service';
import { NotificationService } from '../../services/notification.service';
import { SubscriptionService, SubscriptionStatus } from '../../services/subscription.service';

@Component({
  selector: 'app-account-panel',
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tab.accountOpen()) {
      <div class="acct-overlay" (click)="close()">
        <div class="acct-dialog" (click)="$event.stopPropagation()">
          <div class="dialog-discs">
            <button
              type="button"
              class="dialog-disc dialog-disc-cancel"
              matTooltip="Close"
              (click)="close()"
              aria-label="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <h2 class="acct-title">Account</h2>

          <div class="danger-zone">
            <h3 class="section-title">Danger Zone</h3>
            <p class="section-description">
              Permanently delete your account and all associated data.
            </p>
            <button
              class="delete-account-btn"
              (click)="showDeleteConfirmation()"
              [disabled]="isDeleting()">
              Delete Account
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Delete Confirmation Modal -->
    @if (showConfirmModal()) {
      <div class="modal-overlay" (click)="cancelDelete()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <h3 class="modal-title">Delete Account</h3>

          <div class="modal-body">
            @if (subscriptionStatus(); as status) {
              @if (status.hasActiveSubscription) {
                <p class="warning-text">
                  Your subscription will be cancelled. You will not be billed further.
                </p>
                <p class="info-text">
                  Your current subscription
                  <strong>({{ status.subscriptionType === 'annual' ? 'Annual' : 'Monthly' }})</strong>
                  will remain active until
                  <strong>{{ formatExpiryDate(status.expiresAt) }}</strong>.
                </p>
              } @else {
                <p class="info-text">
                  Your account will be deactivated immediately.
                </p>
              }
            } @else {
              <p class="info-text">
                Your account will be deactivated.
              </p>
            }

            <p class="confirmation-text">
              Are you sure you want to delete your account? This action cannot be undone.
            </p>
          </div>

          <div class="modal-actions">
            <button
              class="cancel-btn"
              (click)="cancelDelete()"
              [disabled]="isDeleting()">
              Cancel
            </button>
            <button
              class="confirm-delete-btn"
              (click)="confirmDelete()"
              [disabled]="isDeleting()">
              @if (isDeleting()) {
                Deleting...
              } @else {
                Yes, Delete My Account
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['./account-panel.scss']
})
export class AccountPanelComponent {
  readonly tab = inject(TabService);
  private notificationService = inject(NotificationService);
  private subscriptionService = inject(SubscriptionService);
  private auth = inject(AuthService);

  showConfirmModal = signal(false);
  isDeleting = signal(false);
  subscriptionStatus = signal<SubscriptionStatus | null>(null);
  private statusLoaded = false;

  constructor() {
    // Load subscription status the first time the overlay opens (drives the
    // delete-confirmation copy).
    effect(() => {
      if (this.tab.accountOpen() && !this.statusLoaded) {
        this.statusLoaded = true;
        this.subscriptionService.checkSubscriptionStatus().subscribe((status) => {
          this.subscriptionStatus.set(status);
        });
      }
    });
  }

  close(): void {
    this.tab.closeAccount();
  }

  showDeleteConfirmation(): void {
    this.showConfirmModal.set(true);
  }

  cancelDelete(): void {
    this.showConfirmModal.set(false);
  }

  confirmDelete(): void {
    this.isDeleting.set(true);

    this.subscriptionService.deactivateAccount().subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.showConfirmModal.set(false);
        this.tab.closeAccount();
        this.notificationService.show('Account deleted successfully');
        this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
      },
      error: (error) => {
        this.isDeleting.set(false);
        console.error('Failed to delete account:', error);
        this.notificationService.show('Failed to delete account. Please try again.');
      }
    });
  }

  formatExpiryDate(dateStr?: string): string {
    if (!dateStr) return 'the end of your billing period';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
