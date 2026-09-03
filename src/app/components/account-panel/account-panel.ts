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
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { TabService } from '../../services/tab.service';
import { NotificationService } from '../../services/notification.service';
import { SubscriptionService, SubscriptionStatus } from '../../services/subscription.service';
import { ProfileImageService } from '../../services/profile-image.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { TetherService } from '../../services/tether.service';
import { UserProfileService } from '../../services/user-profile.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-account-panel',
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tab.accountOpen()) {
      <div class="acct-overlay" (click)="onBackdrop()">
        <div class="acct-dialog" (click)="$event.stopPropagation()">
          <!-- Dialog discs (CLAUDE.md): the green Save disc APPEARS only when
               there are unsaved changes (name and/or photo); the red X is always
               present and discards staged edits on close. -->
          <div class="dialog-discs">
            @if (dirty()) {
              <button
                type="button"
                class="dialog-disc dialog-disc-confirm"
                [disabled]="saveBusy()"
                matTooltip="Save changes"
                matTooltipPosition="below"
                (click)="saveAll()"
                aria-label="Save changes">
                <mat-icon>{{ saveBusy() ? 'hourglass_empty' : 'check' }}</mat-icon>
              </button>
            }
            <button
              type="button"
              class="dialog-disc dialog-disc-cancel"
              matTooltip="Close"
              matTooltipPosition="below"
              (click)="close()"
              aria-label="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <h2 class="acct-title">Account</h2>

          <!-- Identity: avatar (with X to drop the photo) + editable display
               name (email fallback) + email. -->
          <div class="acct-identity">
            <div class="acct-avatar">
              <img [src]="displayAvatar()" alt="" class="acct-avatar-img" />
              @if (hasPhoto()) {
                <button
                  type="button"
                  class="acct-avatar-x"
                  matTooltip="Remove photo (back to the apple)"
                  matTooltipPosition="above"
                  (click)="removePhoto()"
                  aria-label="Remove photo">
                  <mat-icon>close</mat-icon>
                </button>
              }
            </div>
            <div class="acct-identity-text">
              <input
                type="text"
                class="acct-name-input"
                [value]="nameDraft()"
                placeholder="Display name"
                maxlength="60"
                aria-label="Display name"
                (input)="onNameInput($any($event.target).value)"
                (keydown.enter)="saveAll()" />
              @if (showEmail()) {
                <span class="acct-email">{{ email() }}</span>
              }
            </div>
          </div>

          <!-- Photo tools: drop / paste / browse (stages a new photo), plus
               phone-camera capture. Staged changes commit on Save. -->
          <div class="acct-photo-section">
            <span class="acct-section-label">Profile photo</span>
            <div
              class="acct-dropzone"
              tabindex="0"
              (dragover)="onDragOver($event)"
              (drop)="onDrop($event)"
              (paste)="onPaste($event)"
              (click)="fileInput.click()">
              <mat-icon class="acct-dropzone-icon">add_photo_alternate</mat-icon>
              <span class="acct-dropzone-title">Drag, paste, or click to add a photo</span>
              <span class="acct-dropzone-sub">JPG / PNG — replaces the apple everywhere</span>
            </div>
            <input #fileInput type="file" accept="image/jpeg,image/png" hidden (change)="onFile(fileInput)" />

            <!-- Camera-over-tether: hidden until the API command channel + mobile
                 handler ship (environment.phoneCaptureEnabled). The wiring stays
                 intact; flipping the flag reveals the button. -->
            @if (phoneCaptureEnabled) {
              <button
                type="button"
                class="acct-phone-btn"
                [disabled]="phoneBusy() || !tether.firstDeviceId()"
                [matTooltip]="tether.firstDeviceId() ? 'Send a photo request to your phone' : 'Register your phone (tether) to use this'"
                matTooltipPosition="above"
                (click)="captureViaPhone()">
                <mat-icon>photo_camera</mat-icon>
                {{ phoneBusy() ? 'Asking your phone…' : 'Take it with my phone' }}
              </button>
            }

            @if (dirty()) {
              <p class="acct-note">Press the green ✓ (top-right) to save your changes.</p>
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
  private userProfile = inject(UserProfileService);

  /** "Take it with my phone" is hidden until the backend command channel ships. */
  readonly phoneCaptureEnabled = environment.phoneCaptureEnabled;

  showConfirmModal = signal(false);
  isDeleting = signal(false);
  subscriptionStatus = signal<SubscriptionStatus | null>(null);
  private statusLoaded = false;

  // ---- Identity (Auth0 + editable override) -------------------------------
  private readonly user = toSignal(this.auth.user$, { initialValue: null });
  /** The effective display name: a saved override wins, else Auth0 name, else
   *  email, else a generic label. This is what the field is seeded from. */
  readonly displayName = computed(
    () =>
      this.userProfile.displayName() ||
      this.user()?.name?.trim() ||
      this.user()?.email?.trim() ||
      'Your account',
  );
  readonly email = computed(() => this.user()?.email?.trim() || null);
  /** Only show the email line when it isn't already the name (email fallback). */
  readonly showEmail = computed(() => {
    const e = this.email();
    return !!e && e !== this.displayName();
  });

  private readonly APPLE = 'images/yeh_logo_dark.png';

  // Editable name field. Seeded from the effective name while the user hasn't
  // typed; resyncs after a save (see the constructor effect).
  readonly nameDraft = signal('');
  private nameTouched = false;
  readonly nameDirty = computed(() => {
    const v = this.nameDraft().trim();
    return v.length > 0 && v !== this.displayName().trim();
  });
  onNameInput(v: string): void {
    this.nameTouched = true;
    this.nameDraft.set(v);
  }

  // ---- Photo (STAGED — commits on Save) -----------------------------------
  // null → no change; {file,preview} → a new photo staged; 'remove' → staged
  // revert to the apple logo.
  private readonly stagedAvatar = signal<{ file: File; preview: string } | 'remove' | null>(null);

  /** Avatar shown in the panel: a staged change wins, else the committed avatar,
   *  else the apple logo. */
  readonly displayAvatar = computed(() => {
    const s = this.stagedAvatar();
    if (s === 'remove') return this.APPLE;
    if (s) return s.preview;
    return this.profileImage.avatarUrl() ?? this.APPLE;
  });
  /** A real photo is showing → offer the X-to-remove. */
  readonly hasPhoto = computed(() => {
    const s = this.stagedAvatar();
    if (s === 'remove') return false;
    if (s) return true;
    return this.profileImage.avatarUrl() != null;
  });
  private readonly photoDirty = computed(() => {
    const s = this.stagedAvatar();
    if (s === 'remove') return this.profileImage.avatarUrl() != null; // removing an existing pic
    return s != null; // a new staged pic
  });

  /** Anything to commit — a name change or a photo change. Drives the green disc. */
  readonly dirty = computed(() => this.nameDirty() || this.photoDirty());

  readonly saveBusy = signal(false);
  readonly phoneBusy = signal(false);

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
  }
  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.stageFile(file);
  }
  onPaste(ev: ClipboardEvent): void {
    const file = ev.clipboardData?.files?.[0];
    if (file) {
      ev.preventDefault();
      this.stageFile(file);
    }
  }
  onFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (file) this.stageFile(file);
  }

  private stageFile(file: File): void {
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      this.notificationService.show('Please use a JPG or PNG image.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.stagedAvatar.set({ file, preview: reader.result as string });
    reader.readAsDataURL(file);
  }

  /** X on the photo: stage a revert to the apple logo (commits on Save). */
  removePhoto(): void {
    this.stagedAvatar.set('remove');
  }

  /** Commit staged changes: upload/clear the photo, PUT the display name, and
   *  reflect both everywhere. Degrades to a session-only apply if the endpoints
   *  aren't live yet. */
  async saveAll(): Promise<void> {
    if (!this.dirty() || this.saveBusy()) return;
    this.saveBusy.set(true);
    let sessionOnly = false;
    try {
      const s = this.stagedAvatar();
      if (s === 'remove') {
        // Persist the clear so it survives a reload; if the endpoint isn't live
        // yet it's a session-only revert (the photo re-hydrates on refresh).
        const cleared = await this.userProfile.clearAvatar();
        this.profileImage.setPreview(null);
        this.profileImage.setPersisted(null);
        if (!cleared) sessionOnly = true;
      } else if (s) {
        try {
          const res = await this.imageUpload.uploadUserAvatar(s.file);
          if (res?.cdn_url) {
            this.profileImage.setPersisted(res.cdn_url);
            this.profileImage.setPreview(null);
          } else {
            this.profileImage.setPreview(s.preview);
            sessionOnly = true;
          }
        } catch {
          this.profileImage.setPreview(s.preview);
          sessionOnly = true;
        }
      }
      if (this.nameDirty()) {
        const name = this.nameDraft().trim();
        const ok = await this.userProfile.updateDisplayName(name);
        this.userProfile.setDisplayName(name);
        if (!ok) sessionOnly = true;
      }
      this.stagedAvatar.set(null);
      this.nameTouched = false; // field resyncs to the committed name
      this.notificationService.show(
        sessionOnly
          ? 'Couldn’t reach your account — your change shows here but may not stick after a refresh.'
          : 'Account updated',
        sessionOnly ? 'error' : 'success',
      );
      // Green check = save AND close (dialog convention).
      this.tab.closeAccount();
    } finally {
      this.saveBusy.set(false);
    }
  }

  /** Issue a DURABLE avatar capture (POST /api/tether/device/{id}/command → 202
   *  {messageId}) to the user's registered phone. Enabled once a phone is registered
   *  (live not required). The web no longer pops the phone camera; we point the user
   *  at the phone's Phone panel, and the TetherService results poll refreshes the
   *  avatar here when the phone's upload lands. */
  async captureViaPhone(): Promise<void> {
    const deviceId = this.tether.firstDeviceId();
    if (deviceId == null) {
      this.notificationService.show('Register your phone (open Regi on it once) to enable phone capture.', 'error');
      return;
    }
    this.phoneBusy.set(true);
    try {
      // Issue OPTIMISTICALLY (durable command — no "device offline" rejection). The
      // uploaded avatar appears when the TetherService results poll resolves the
      // command and refreshes the profile.
      await this.tether.requestCapture(deviceId, { kind: 'avatar', id: null, name: 'Profile photo' });
      this.notificationService.show(
        '📱 Sent to your phone. Open the menu (☰) → Phone to take the picture.',
      );
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      const msg =
        status === 503
          ? 'Phone capture is temporarily unavailable. Please try again later.'
          : status === 404
            ? 'That phone isn’t linked to your account anymore. Re-open Regi on your phone.'
            : 'Couldn’t send the request to your phone. Try again.';
      this.notificationService.show(msg, 'error');
    } finally {
      this.phoneBusy.set(false);
    }
  }

  constructor() {
    // Seed / resync the name field from the effective name while the user hasn't
    // typed (runs on load and after a save clears nameTouched).
    effect(
      () => {
        const n = this.displayName();
        if (!this.nameTouched) this.nameDraft.set(n === 'Your account' ? '' : n);
      },
      { allowSignalWrites: true },
    );

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

  /** Backdrop click closes — unless there are unsaved changes, in which case it's
   *  swallowed so a stray click can't lose work (dialog convention). */
  onBackdrop(): void {
    if (this.dirty()) return;
    this.close();
  }

  close(): void {
    // Discard any staged (uncommitted) photo + name edits, then close.
    this.stagedAvatar.set(null);
    this.nameTouched = false;
    this.nameDraft.set(this.displayName() === 'Your account' ? '' : this.displayName());
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
