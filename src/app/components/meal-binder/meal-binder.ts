// src/app/components/meal-binder/meal-binder.ts
//
// Right-hand "Meals" binder. Lists the user's SAVED meals as draggable cards
// (CDK drag-drop) that can be dropped onto empty slots on the board (copy
// semantics — a meal stays in the binder after placing). A top region is
// reserved for unplaced NewMeal candidates (Phase B). The GenMeal button is a
// stub this phase.
import { ChangeDetectionStrategy, Component, OnInit, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RotationService } from '../../services/rotation.service';
import { TwistIconComponent } from '../twist-icon/twist-icon';
import { Meal } from '../../models';

@Component({
  selector: 'app-meal-binder',
  imports: [DragDropModule, MatTooltipModule, TwistIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="binder">
      <div class="binder-header">
        <span class="binder-title">Meals</span>
      </div>

      <!-- AI label + generation buttons. The star logo spins in place while a
           generation is running (no separate progress line) — the new meals
           just appear in the list below when done. -->
      <div class="genmeal-bar">
        <span class="ai-label" matTooltip="AI meal generation">
          <img
            src="images/AI-star.png"
            alt=""
            class="ai-logo"
            [class.spinning]="rotation.generating()" />
          <span class="ai-text">AI</span>
        </span>
        <button
          type="button"
          class="genmeal-btn"
          matTooltip="Generate another meal"
          [disabled]="rotation.generating()"
          (click)="rotation.generateMeal()">
          GenMeal
        </button>
        <button
          type="button"
          class="genmeal-btn"
          matTooltip="Generate all meals"
          [disabled]="rotation.generating()"
          (click)="onGenAllMeals()">
          GenAll Meals
        </button>
      </div>

      <!-- Second row: cuisine "Twist" — an editable combobox (free typing +
           dropdown). Value feeds the generation prompt as CuisineTwist once the
           API/schema carries it. Custom… clears the field for free entry; if
           left blank on blur it reverts to the prior selection. -->
      <div class="twist-row">
        <span class="twist-label">
          <app-twist-icon />
          <span class="twist-word">Twist</span>
        </span>
        <div class="twist-combo">
          <input
            #twistInput
            type="text"
            class="twist-input"
            [value]="twistValue()"
            placeholder="none"
            (input)="onTwistInput($any($event.target).value)"
            (focus)="twistOpen.set(true)"
            (blur)="onTwistBlur()"
            (keydown.escape)="twistOpen.set(false)" />
          <button
            type="button"
            class="twist-chevron"
            aria-label="Twist options"
            (mousedown)="onChevronMouseDown($event)">▾</button>
          @if (twistOpen()) {
            <ul class="twist-menu">
              @for (opt of twistOptions; track opt) {
                <li
                  class="twist-opt"
                  [class.selected]="opt === twistValue()"
                  (mousedown)="selectTwist(opt, $event)">{{ opt }}</li>
              }
            </ul>
          }
        </div>
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

  /** "GenAll Meals" — placeholder; the user will wire the generate-all flow. */
  onGenAllMeals(): void {
    // no-op stub (to be wired)
  }

  // ----- Cuisine "Twist" combobox -----------------------------------------
  // Editable: the user can pick a preset OR free-type any cuisine. The value
  // (twistValue) will be sent to generation as CuisineTwist once the API schema
  // carries the field; today it's captured locally and ready to wire.

  readonly twistOptions = ['none', 'Italian', 'Mexican', 'Mediterranean', 'American', 'Custom...'];

  /** Committed cuisine twist. 'none' = no twist. */
  readonly twistValue = signal('none');
  readonly twistOpen = signal(false);

  /** The value to fall back to if 'Custom…' is chosen but nothing is typed. */
  private twistBeforeCustom = 'none';

  private twistInputRef = viewChild<ElementRef<HTMLInputElement>>('twistInput');

  onTwistInput(value: string): void {
    this.twistValue.set(value);
  }

  /** Toggle the dropdown from the chevron. mousedown+preventDefault keeps input
   *  focus so the blur handler doesn't fight the toggle. */
  onChevronMouseDown(ev: Event): void {
    ev.preventDefault();
    this.twistOpen.update((v) => !v);
    this.twistInputRef()?.nativeElement.focus();
  }

  /** Pick an option. 'Custom…' clears the field and drops the cursor for free
   *  typing (remembering the prior value to revert to on an empty blur). */
  selectTwist(opt: string, ev: Event): void {
    ev.preventDefault(); // keep focus; avoid the option click blurring first
    if (opt === 'Custom...') {
      this.twistBeforeCustom = this.twistValue().trim() || 'none';
      this.twistValue.set('');
      this.twistOpen.set(false);
      queueMicrotask(() => this.twistInputRef()?.nativeElement.focus());
      return;
    }
    this.twistValue.set(opt);
    this.twistOpen.set(false);
  }

  /** Close the menu on blur; if the field is empty (Custom… with no typing),
   *  revert to the selection prior to Custom…. */
  onTwistBlur(): void {
    this.twistOpen.set(false);
    if (this.twistValue().trim() === '') {
      this.twistValue.set(this.twistBeforeCustom);
    }
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
