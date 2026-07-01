// src/app/components/issue-panel/issue-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { take } from 'rxjs/operators';
import { TabService } from '../../services/tab.service';
import { NotificationService } from '../../services/notification.service';
import { environment } from '../../../environments/environment';

const APP_AREAS = [
  'Today',
  'Menu Planning',
  'Foods',
  'Chat',
  'Settings',
  'Account',
  'Mobile-Journal',
  'Mobile UPC scan',
  'Mobile Command-Bloom',
  'Mobile Chat/Wake/PTT',
  'Mobile Install/Tethering'
];

@Component({
  selector: 'app-issue-panel',
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <div class="form-area">
        @if (submitted()) {
          <div class="success-state">
            <mat-icon class="success-icon">check_circle</mat-icon>
            <p class="success-text">Issue #{{ ticketId() }} submitted successfully!</p>
            <button class="submit-btn" (click)="resetForm()">New Bug</button>
          </div>
        } @else {
          <div class="form-group">
            <label class="form-label">Subject</label>
            <input type="text" class="form-input" [(ngModel)]="subject" placeholder="Brief description of what's wrong" />
          </div>

          <div class="form-group">
            <label class="form-label">App Area</label>
            <select class="form-input form-select" [(ngModel)]="appArea">
              @for (area of appAreas; track area) {
                <option [value]="area">{{ area }}</option>
              }
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-input form-textarea" [(ngModel)]="description" rows="6"
              placeholder="Steps to reproduce and what's wrong..."></textarea>
          </div>

          <div class="form-group readonly-group">
            <div class="readonly-row">
              <span class="readonly-label">Label:</span>
              <span class="readonly-value">bug</span>
            </div>
            <div class="readonly-row">
              <span class="readonly-label">Status:</span>
              <span class="readonly-value">Open</span>
            </div>
            <div class="readonly-row">
              <span class="readonly-label">Reporter:</span>
              <span class="readonly-value">{{ userName() }}</span>
            </div>
          </div>

          @if (submitting()) {
            <div class="submitting-hint">Submitting…</div>
          }
        }
      </div>
    </div>
  `,
  styleUrls: ['./issue-panel.scss']
})
export class IssuePanelComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private tabService = inject(TabService);
  private notificationService = inject(NotificationService);

  appAreas = APP_AREAS;

  // model() signals so the wrapping BugOverlayComponent's green-check disc
  // can reactively gate on form validity via the public canSubmit computed
  // below. Plain string properties wouldn't notify the parent's change
  // detection when the user typed.
  subject = model('');
  description = model('');
  appArea = model('Today');

  submitting = signal(false);
  submitted = signal(false);
  ticketId = signal(0);

  /** Public so the wrapping overlay can gate its green-check disc.
   *  False when the form is in flight, already submitted, or missing
   *  required fields. */
  readonly canSubmit = computed(() =>
    !this.submitting()
    && !this.submitted()
    && this.subject().trim().length > 0
    && this.description().trim().length > 0
  );

  userName = signal('');

  constructor() {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      this.userName.set(user?.name ?? 'Unknown');
    });
  }

  async submitIssue(): Promise<void> {
    this.submitting.set(true);
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ticketId: number; message: string }>(
          `${environment.apiUrl}/support/issue`,
          {
            subject: this.subject().trim(),
            description: this.description().trim(),
            appArea: this.appArea(),
          }
        )
      );
      this.ticketId.set(resp.ticketId);
      this.submitted.set(true);
      this.notificationService.show('Issue submitted', 'success');
    } catch (err: unknown) {
      // Toast stays terse — the raw server body (which can include nested
      // upstream JSON from GitHub) goes to the console for triage but
      // never crowds the UI. Power-user diagnostics live in DevTools.
      console.error('[IssuePanel] submit failed:', err);
      this.notificationService.show(
        'Couldn\'t submit the ticket. Try again in a moment.',
        'error',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  resetForm(): void {
    this.subject.set('');
    this.description.set('');
    this.appArea.set('Today');
    this.submitted.set(false);
    this.ticketId.set(0);
  }

}
