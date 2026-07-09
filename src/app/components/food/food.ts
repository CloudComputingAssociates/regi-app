// src/app/components/food/food.ts
//
// One food line inside a meal card: "{name} … {quantity} {unit}". Hovering
// reveals two affordances that operate on the food DIRECTLY (no meal edit
// mode): a pencil (edit — opens the serving popup for this item) and an ✕
// (remove — deletes this food line from the meal).
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MealItem } from '../../models';

@Component({
  selector: 'app-food',
  imports: [MatTooltipModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="food-row">
      <!-- Name first (2/3, clipped) then serving (1/3, clipped); the edit/remove
           actions sit outside this split and reveal on hover. Same discs as the
           meal-card header. -->
      <span class="food-name">{{ item().food?.shortDescription?.trim() || item().foodName }}</span>
      <span class="food-qty">{{ item().quantity }} {{ item().unit }}</span>
      <span class="food-actions">
        <!-- Pencil hidden for items whose food can't be resolved to a full
             Food (e.g. foodSource 'pending' — no persisted row to price). -->
        @if (canEditServing()) {
          <button
            type="button"
            class="icon-disc icon-disc-edit"
            [class.busy]="resolving()"
            [disabled]="resolving()"
            matTooltip="Edit serving"
            matTooltipPosition="left"
            (click)="editItem.emit(item())">
            <mat-icon>edit</mat-icon>
          </button>
        }
        <button
          type="button"
          class="icon-disc icon-disc-danger"
          matTooltip="Remove food from meal"
          matTooltipPosition="left"
          (click)="removeItem.emit(item())">
          <mat-icon>delete_outline</mat-icon>
        </button>
      </span>
    </div>
  `,
  styleUrls: ['./food.scss'],
})
export class FoodComponent {
  readonly item = input.required<MealItem>();

  /** True while this item's food is being fetched to open the serving popup —
   *  the ✎ pencil shows a brief busy state and can't be re-clicked. */
  readonly resolving = input<boolean>(false);

  /** ✎ — open the serving popup for this exact item. */
  readonly editItem = output<MealItem>();

  /** ✕ — remove this food line from the meal. */
  readonly removeItem = output<MealItem>();

  /** Whether the edit-serving pencil is offered. Pending items carry no
   *  resolved food record (`food` is null), so there's nothing to price. */
  readonly canEditServing = computed<boolean>(() => this.item().food != null);
}
