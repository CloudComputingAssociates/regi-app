// src/app/components/meal-picker/meal-picker.ts
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  output,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { PlanningService } from '../../services/planning.service';
import { PreferencesService } from '../../services/preferences.service';
import { getMealSlotName, MealSummary } from '../../models/planning.model';

/** A staged meal assignment before committing */
export interface StagedMeal {
  slotNum: number;
  mealId: number;
  mealName: string;
}

/** Emitted when the user commits their selections */
export interface MealPickerResult {
  slots: StagedMeal[];
}

/** Emitted when swapping a single slot */
export interface MealSwapResult {
  slotNum: number;
  mealId: number;
  mealName: string;
}

@Component({
  selector: 'app-meal-picker',
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker-overlay" (click)="onClose()">
      <div class="picker-dialog" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="picker-header">
          <h3>
            @if (swapSlot()) {
              Swap {{ getMealSlotName(swapSlot()!) }}
            } @else {
              Fill Meals · {{ stagedSlots().length }} of {{ totalSlots() }}
            }
          </h3>
          <div class="picker-header-actions">
            <button class="picker-ok-btn"
                    [disabled]="stagedSlots().length === 0 && !swapSlot()"
                    (click)="commit()">
              <mat-icon>check</mat-icon>
            </button>
            <button class="picker-close-btn" (click)="onClose()">✕</button>
          </div>
        </div>

        <!-- Staged meals (reorderable) -->
        @if (!swapSlot() && stagedSlots().length > 0) {
          <div class="picker-staged">
            @for (ps of stagedSlots(); track ps.slotNum; let i = $index) {
              <div class="picker-staged-row">
                <span class="staged-slot">{{ getMealSlotName(ps.slotNum) }}</span>
                <span class="staged-name">{{ ps.mealName }}</span>
                <button class="staged-btn"
                        [disabled]="i === 0"
                        (click)="moveSlot(i, -1)"
                        title="Move up">
                  <mat-icon>arrow_upward</mat-icon>
                </button>
                <button class="staged-btn"
                        [disabled]="i === stagedSlots().length - 1"
                        (click)="moveSlot(i, 1)"
                        title="Move down">
                  <mat-icon>arrow_downward</mat-icon>
                </button>
                <button class="staged-btn remove"
                        (click)="unstageSlot(i)"
                        title="Remove">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>
        }

        <!-- Meal list -->
        <div class="picker-list">
          @for (meal of meals(); track meal.id) {
            <div class="picker-meal-row">
              <button class="picker-add-btn"
                      [disabled]="!canAdd()"
                      (click)="addMeal(meal)"
                      title="Add">
                <mat-icon>add</mat-icon>
              </button>
              <span class="picker-meal-name"
                    (dblclick)="addMeal(meal)">{{ meal.name }}</span>
              <span class="picker-meal-info">{{ meal.totalCalories ?? '—' }} cal</span>
            </div>
          } @empty {
            <div class="picker-empty">No meals available</div>
          }
        </div>

      </div>
    </div>
  `,
  styleUrls: ['./meal-picker.scss']
})
export class MealPickerComponent implements OnInit {
  private planningService = inject(PlanningService);
  private prefs = inject(PreferencesService);

  readonly getMealSlotName = getMealSlotName;

  /** If set, picker is in swap mode for a single slot */
  swapSlot = input<number | null>(null);

  /** Emitted when user commits staged meals (fill mode) */
  committed = output<MealPickerResult>();

  /** Emitted when user picks a meal in swap mode */
  swapped = output<MealSwapResult>();

  /** Emitted when user closes/cancels */
  closed = output<void>();

  meals = signal<MealSummary[]>([]);
  stagedSlots = signal<StagedMeal[]>([]);

  totalSlots = computed(() => this.prefs.mealsPerDay());

  canAdd = computed(() => {
    if (this.swapSlot()) return true;
    return this.stagedSlots().length < this.totalSlots();
  });

  async ngOnInit(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.planningService.listMeals({ limit: 100 })
      );
      this.meals.set(result ?? []);
    } catch {
      this.meals.set([]);
    }
  }

  addMeal(meal: MealSummary): void {
    // Swap mode: emit immediately
    if (this.swapSlot()) {
      this.swapped.emit({
        slotNum: this.swapSlot()!,
        mealId: meal.id,
        mealName: meal.name
      });
      return;
    }

    // Fill mode: stage the meal
    if (!this.canAdd()) return;

    const current = this.stagedSlots();
    const nextSlot = current.length + 1;
    this.stagedSlots.set([...current, {
      slotNum: nextSlot,
      mealId: meal.id,
      mealName: meal.name
    }]);
  }

  moveSlot(index: number, direction: -1 | 1): void {
    const slots = [...this.stagedSlots()];
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;

    [slots[index], slots[target]] = [slots[target], slots[index]];
    this.stagedSlots.set(slots.map((s, i) => ({ ...s, slotNum: i + 1 })));
  }

  unstageSlot(index: number): void {
    const slots = this.stagedSlots().filter((_, i) => i !== index);
    this.stagedSlots.set(slots.map((s, i) => ({ ...s, slotNum: i + 1 })));
  }

  commit(): void {
    if (this.stagedSlots().length === 0) return;
    this.committed.emit({ slots: this.stagedSlots() });
  }

  onClose(): void {
    this.closed.emit();
  }
}
