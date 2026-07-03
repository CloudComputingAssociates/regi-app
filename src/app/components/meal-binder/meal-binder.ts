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
import { Meal } from '../../models';

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
        [disabled]="rotation.generating()"
        (click)="rotation.generateMeal()">
        <img src="images/AI-star.png" alt="" class="genmeal-icon" />
        <span>GenMeal</span>
      </button>

      <!-- Candidate region: generation progress indicator. -->
      <div class="binder-candidates">
        @if (rotation.generating()) {
          <div class="generating">
            <img src="images/AI-star.png" alt="" class="generating-icon spin" />
            <span>generating meal…</span>
          </div>
        }
      </div>

      <div class="binder-list" cdkDropList>
        <!-- Unplaced AI candidates first, then saved meals. Both are cdkDrag
             in the same drop list, so they place into slots identically. -->
        @for (meal of rotation.candidateMeals(); track meal.id; let i = $index) {
          <div class="binder-card candidate" cdkDrag [cdkDragData]="meal">
            <button
              type="button"
              class="card-delete"
              matTooltip="Discard this meal"
              (click)="$event.stopPropagation(); rotation.removeCandidate(meal.id)">
              🗑
            </button>
            <span class="binder-card-name">{{ i + 1 }} {{ candidateTitle(meal) }}</span>
            <div class="binder-chips">
              <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
              <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
              <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
              <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
            </div>
          </div>
        }

        @for (meal of rotation.binderMeals(); track meal.id) {
          <div class="binder-card" cdkDrag [cdkDragData]="meal">
            <span class="binder-card-name">{{ meal.name }}</span>
            <div class="binder-chips">
              <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
              <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
              <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
              <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
            </div>
          </div>
        }

        @if (rotation.candidateMeals().length === 0 && rotation.binderMeals().length === 0 && !rotation.generating()) {
          <p class="binder-empty">No saved meals yet — build some, or generate with GenMeal.</p>
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

  /** GenMeal candidate label: the primary protein's short name
   *  (shortDescription, else foodName). Rendered as "{n} {name}". */
  candidateTitle(meal: Meal): string {
    const items = meal.items ?? [];
    const primary = items.find((i) => i.itemRole === 'primary') ?? items[0];
    if (primary) return (primary.shortDescription?.trim() || primary.foodName?.trim()) ?? '';
    return meal.name ?? '';
  }
}
