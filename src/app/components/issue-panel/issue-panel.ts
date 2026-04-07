// src/app/components/issue-panel/issue-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
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
  'Week Plan',
  'RegiMenu MealPlans',
  'Shopping List',
  'Food Preferences',
  'Chat',
  'Settings',
  'Account',
  'General'
];

@Component({
  selector: 'app-issue-panel',
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <div class="panel-header">
        <span class="panel-title">Submit Bug</span>
        <button class="icon-btn close-btn" (click)="close()" matTooltip="Close" matTooltipPosition="above">
          ✕
        </button>
      </div>

      <div class="form-area">
        @if (submitted()) {
          <div class="success-state">
            <mat-icon class="success-icon">check_circle</mat-icon>
            <p class="success-text">Issue #{{ ticketId() }} submitted successfully!</p>
            <button class="submit-btn" (click)="resetForm()">Submit Another</button>
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

          <button class="submit-btn"
            [disabled]="submitting() || !subject.trim() || !description.trim()"
            (click)="submitIssue()">
            @if (submitting()) {
              Submitting...
            } @else {
              Submit Bug
            }
          </button>
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
  subject = '';
  description = '';
  appArea = 'General';

  submitting = signal(false);
  submitted = signal(false);
  ticketId = signal(0);

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
          `${environment.apiUrl}/support/defect`,
          {
            subject: this.subject.trim(),
            description: this.description.trim(),
            appArea: this.appArea
          }
        )
      );
      this.ticketId.set(resp.ticketId);
      this.submitted.set(true);
      this.notificationService.show('Issue submitted', 'success');
    } catch {
      this.notificationService.show('Failed to submit issue', 'error');
    } finally {
      this.submitting.set(false);
    }
  }

  resetForm(): void {
    this.subject = '';
    this.description = '';
    this.appArea = 'General';
    this.submitted.set(false);
    this.ticketId.set(0);
  }

  close(): void {
    this.tabService.closeTab('issue');
  }
}
