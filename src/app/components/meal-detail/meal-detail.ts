// src/app/components/meal-detail/meal-detail.ts
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WeekPlanMacrosService } from '../../services/week-plan-macros.service';
import { Meal } from '../../models/planning.model';

@Component({
  selector: 'app-meal-detail',
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="detail-overlay" (click)="onClose()">
      <div class="detail-dialog" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="detail-header">
          <h3>{{ meal()?.name ?? 'Meal' }}</h3>
          <button class="detail-close-btn" (click)="onClose()">✕</button>
        </div>

        <!-- Summary line -->
        @if (meal(); as m) {
          <div class="detail-summary">
            {{ m.totalCalories ?? 0 }} cal
            · {{ m.totalFiberG ?? 0 | number:'1.0-0' }}g fiber
            · {{ m.totalSodiumMg ?? 0 }}mg salt
          </div>
        }

        <!-- Item list -->
        <div class="detail-list">
          @if (meal(); as m) {
            @for (item of m.items; track item.id) {
              <div class="detail-item">
                <div class="detail-thumbnail">
                  @if (item.foodImageThumbnail) {
                    <img [src]="item.foodImageThumbnail" alt="" class="thumbnail-img">
                  } @else {
                    <div class="thumbnail-placeholder"></div>
                  }
                </div>
                <div class="detail-item-info">
                  <span class="detail-item-name">{{ item.shortDescription || item.foodName }}</span>
                  <span class="detail-item-qty">{{ item.quantity }} {{ item.unit }}</span>
                </div>
                <span class="detail-item-cal">{{ item.calories ?? '—' }} cal</span>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./meal-detail.scss']
})
export class MealDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private weekPlanMacros = inject(WeekPlanMacrosService);

  /** The meal ID to display */
  mealId = input.required<number>();

  /** Emitted when the panel is closed */
  closed = output<void>();

  meal = signal<Meal | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const m = await firstValueFrom(
        this.http.get<Meal>(`${environment.apiUrl}/meal/${this.mealId()}`)
      );
      this.meal.set(m);

      // Push this meal's macros to the macros component
      if (m) {
        this.weekPlanMacros.setTotals({
          proteinG: m.totalProteinG ?? 0,
          fatG: m.totalFatG ?? 0,
          carbG: m.totalCarbG ?? 0
        });
      }
    } catch {
      this.meal.set(null);
    }
    document.body.style.cursor = '';
  }

  onClose(): void {
    this.closed.emit();
  }
}
