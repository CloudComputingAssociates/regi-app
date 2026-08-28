// src/app/components/account-panel/account-panel.ts
//
// Account is a small BLOOM overlay (like Settings / Bug / Mobile App), NOT a
// full left-nav panel. Three stacked sections: identity (avatar + display name +
// email) up top, the photo tools (drop/paste/browse + "take it with my phone")
// in the middle, and the delete-account Danger Zone fenced off at the bottom.
// Opened from the profile menu (TabService.accountOpen); closed by the red X disc
// or a backdrop click.
//
// Avatar persistence is a pending API handoff (no avatar column / upload endpoint
// / GET profile yet). So a dropped photo shows immediately as a SESSION preview
// (swapping the YEH-apple everywhere via ProfileImageService) and also attempts
// the real upload — which just works once POST /api/image/upload/avatar ships.
import { Component, ChangeDetectionStrategy, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@auth0/auth0-angular';
import { TabService } from '../../services/tab.service';
import { NotificationService } from '../../services/notification.service';
import { SubscriptionService, SubscriptionStatus } from '../../services/subscription.service';
import { ProfileImageService } from '../../services/profile-image.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { TetherService } from '../../services/tether.service';

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

          <!-- Identity: avatar + display name (email fallback) + email. -->
          <div class="acct-identity">
            <div class="acct-avatar">
              <img [src]="avatarSrc()" alt="" class="acct-avatar-img" />
            </div>
            <div class="acct-identity-text">
              <span class="acct-name">{{ displayName() }}</span>
              @if (showEmail()) {
                <span class="acct-email">{{ email() }}</span>
              }
            </div>
          </div>

          <!-- Photo tools: drop / paste / browse, plus phone-camera capture. -->
          <div class="acct-photo-section">
            <span class="acct-section-label">Profile photo</span>
            <div
              class="acct-dropzone"
              tabindex="0"
              [class.busy]="photoBusy()"
              (dragover)="onDragOver($event)"
              (drop)="onDrop($event)"
              (paste)="onPaste($event)"
              (click)="fileInput.click()">
              <mat-icon class="acct-dropzone-icon">{{ photoBusy() ? 'hourglass_empty' : 'add_photo_alternate' }}</mat-icon>
              <span class="acct-dropzone-title">{{ photoBusy() ? 'Uploading…' : 'Drag, paste, or click to add a photo' }}</span>
              <span class="acct-dropzone-sub">JPG / PNG — replaces the apple everywhere</span>
            </div>
            <input #fileInput type="file" accept="image/jpeg,image/png" hidden (change)="onFile(fileInput)" />

            <button
              type="button"
              class="acct-phone-btn"
              [disabled]="phoneBusy()"
              [matTooltip]="tether.anyLive() ? 'Open the camera on your tethered phone' : 'Connect your phone (tether) to use this'"
              matTooltipPosition="above"
              (click)="captureViaPhone()">
              <mat-icon>photo_camera</mat-icon>
              {{ phoneBusy() ? 'Asking your phone…' : 'Take it with my phone' }}
            </button>

            @if (sessionOnly()) {
              <p class="acct-note">Showing for this session — it’ll sync to your account once photo sync is enabled.</p>
            }
          </div>

          <hr class="acct-divider" />

          <!-- Danger Zone — fenced off at the bottom. -->
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
  private profileImage = inject(ProfileImageService);
  private imageUpload = inject(ImageUploadService);
  readonly tether = inject(TetherService);

  showConfirmModal = signal(false);
  isDeleting = signal(false);
  subscriptionStatus = signal<SubscriptionStatus | null>(null);
  private statusLoaded = false;

  // ---- Identity (from Auth0) ----------------------------------------------
  private readonly user = toSignal(this.auth.user$, { initialValue: null });
  /** Display name, falling back to email, then a generic label. */
  readonly displayName = computed(
    () => this.user()?.name?.trim() || this.user()?.email?.trim() || 'Your account',
  );
  readonly email = computed(() => this.user()?.email?.trim() || null);
  /** Only show the email line when it isn't already the heading (email fallback). */
  readonly showEmail = computed(() => {
    const e = this.email();
    return !!e && e !== this.displayName();
  });

  /** The avatar to show — the user's photo (session or persisted) or the apple. */
  readonly avatarSrc = computed(() => this.profileImage.avatarUrl() ?? 'images/yeh_logo_dark.png');

  // ---- Photo tools ---------------------------------------------------------
  readonly photoBusy = signal(false);
  readonly phoneBusy = signal(false);
  /** True when the photo is only a local preview (the upload endpoint isn't live). */
  readonly sessionOnly = signal(false);

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
  }
  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.handleFile(file);
  }
  onPaste(ev: ClipboardEvent): void {
    const file = ev.clipboardData?.files?.[0];
    if (file) {
      ev.preventDefault();
      this.handleFile(file);
    }
  }
  onFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (file) this.handleFile(file);
  }

  private handleFile(file: File): void {
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      this.notificationService.show('Please use a JPG or PNG image.', 'error');
      return;
    }
    // Immediate session preview so the swap is visible everywhere at once.
    const reader = new FileReader();
    reader.onload = () => this.profileImage.setPreview(reader.result as string);
    reader.readAsDataURL(file);
    void this.uploadAvatar(file);
  }

  private async uploadAvatar(file: File): Promise<void> {
    this.photoBusy.set(true);
    this.sessionOnly.set(false);
    try {
      const res = await this.imageUpload.uploadUserAvatar(file);
      if (res?.cdn_url) {
        this.profileImage.setPersisted(res.cdn_url);
        this.profileImage.setPreview(null); // persisted wins from here
        this.notificationService.show('Profile photo updated');
      } else {
        this.sessionOnly.set(true);
      }
    } catch {
      // Endpoint not live yet — keep the local preview; it'll sync once it ships.
      this.sessionOnly.set(true);
    } finally {
      this.photoBusy.set(false);
    }
  }

  /** Fire the camera-capture command to the user's live tethered phone. */
  async captureViaPhone(): Promise<void> {
    const deviceId = this.tether.firstLiveDeviceId();
    if (deviceId == null) {
      this.notificationService.show('Open the app on your phone first (tether it), then try again.', 'error');
      return;
    }
    this.phoneBusy.set(true);
    try {
      await this.tether.requestAvatarCapture(deviceId);
      this.notificationService.show('Check your phone — open the camera to take your photo.');
    } catch {
      this.notificationService.show("Couldn't reach your phone yet — this turns on when phone capture ships.", 'error');
    } finally {
      this.phoneBusy.set(false);
    }
  }

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
