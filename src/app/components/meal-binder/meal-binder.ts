// src/app/components/meal-binder/meal-binder.ts
//
// Right-hand "Meals" binder. Lists the user's SAVED meals as draggable cards
// (CDK drag-drop) that can be dropped onto empty slots on the board (copy
// semantics — a meal stays in the binder after placing). A top region is
// reserved for unplaced NewMeal candidates (Phase B). The GenMeal button is a
// stub this phase.
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RotationService } from '../../services/rotation.service';

@Component({
  selector: 'app-meal-binder',
  imports: [DragDropModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="binder">
      <div class="binder-header">
        <span class="binder-title">Meals</span>
      </div>

      <button
        type="button"
        class="genmeal-btn"
        matTooltip="Generate another meal"
        (click)="onGenMeal()">
        <img src="images/AI-star.png" alt="" class="genmeal-icon" />
        <span>GenMeal</span>
      </button>

      <!-- Reserved for unplaced NewMeal N candidates (Phase B fills this). -->
      <div class="binder-candidates"></div>

      <div class="binder-list" cdkDropList>
        @if (rotation.binderMeals().length === 0) {
          <p class="binder-empty">No saved meals yet — build some, or generate with GenMeal.</p>
        } @else {
          @for (meal of rotation.binderMeals(); track meal.id) {
            <div class="binder-card" cdkDrag [cdkDragData]="meal">
              <span class="binder-card-name">{{ meal.name }}</span>
              <div class="binder-chips">
                <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
                <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
                <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
                <span class="chip fiber">Fi {{ round(meal.totalFiberG) }}</span>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  styleUrls: ['./meal-binder.scss'],
})
export class MealBinderComponent implements OnInit {
  readonly rotation = inject(RotationService);

  ngOnInit(): void {
    this.rotation.loadBinderMeals();
  }

  round(n: number | undefined): number {
    return Math.round(n ?? 0);
  }

  /** STUB — wired to the meal generator in Phase B. */
  onGenMeal(): void {
    // no-op
  }
}
