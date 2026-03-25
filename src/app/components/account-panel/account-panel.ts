// src/app/components/account-panel/account-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@auth0/auth0-angular';
import { TabService } from '../../services/tab.service';
import { NotificationService } from '../../services/notification.service';
import { SubscriptionService, SubscriptionStatus } from '../../services/subscription.service';

@Component({
  selector: 'app-account-panel',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <div class="panel-header">
        <h2 class="panel-title">Account</h2>
        <button class="icon-btn close-btn" (click)="close()">✕</button>
      </div>

      <div class="panel-content">
        <!-- Danger Zone Section -->
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
export class AccountPanelComponent implements OnInit {
  private tabService = inject(TabService);
  private notificationService = inject(NotificationService);
  private subscriptionService = inject(SubscriptionService);
  private auth = inject(AuthService);

  showConfirmModal = signal(false);
  isDeleting = signal(false);
  subscriptionStatus = signal<SubscriptionStatus | null>(null);

  ngOnInit(): void {
    // Load subscription status when panel opens
    this.subscriptionService.checkSubscriptionStatus().subscribe(status => {
      this.subscriptionStatus.set(status);
    });
  }

  close(): void {
    this.tabService.closeTab('account');
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
      next: (response) => {
        this.isDeleting.set(false);
        this.showConfirmModal.set(false);
        this.notificationService.show('Account deleted successfully');

        // Log the user out after deactivation
        this.auth.logout({
          logoutParams: { returnTo: window.location.origin }
        });
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
