// src/app/components/meal-binder/meal-binder.ts
//
// Right-hand rail for the Menus surface. Two collapsible sections:
//   1. Folder — disposable, unplaced meals (server scope=folder). GenMeal fills
//      this. Grey/ghosted: "you'd lose this."
//   2. Binder — pinned meals (server scope=binder). Alive: "in your Binder."
// Cards are draggable (CDK) onto empty board slots. Each card carries a Binder
// pin icon (top-left) to save it. Cards are NOT redesigned — same markup/chips.
import { ChangeDetectionStrategy, Component, OnInit, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { RotationService } from '../../services/rotation.service';
import { NotificationService } from '../../services/notification.service';
import { TwistIconComponent } from '../twist-icon/twist-icon';
import { Meal } from '../../models';

@Component({
  selector: 'app-meal-binder',
  imports: [DragDropModule, MatTooltipModule, MatIconModule, TwistIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="binder">
      <div class="binder-header">
        <span class="binder-title">Meals</span>
      </div>

      <!-- AI label + generation. The star spins while a generation runs; the new
           meal appears in the Folder below when done. -->
      <div class="genmeal-bar">
        <span class="ai-label" matTooltip="AI meal generation">
          <span class="ai-text">AI</span>
          <img
            src="images/AI-star.png"
            alt=""
            class="ai-logo"
            [class.spinning]="rotation.generating()" />
        </span>
        <button
          type="button"
          class="genmeal-btn"
          matTooltip="Generate a meal with AI"
          [disabled]="rotation.generating()"
          (click)="rotation.generateMeal()">
          Generate Meal
        </button>
      </div>

      <!-- Cuisine "Twist" combobox (unchanged). -->
      <div class="twist-row">
        <span class="twist-label">
          <span class="twist-word">Twist</span>
          <app-twist-icon />
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

      <!-- Folder section: disposable, unplaced meals. -->
      <div class="rail-section">
        <button type="button" class="section-head" (click)="folderOpen.set(!folderOpen())">
          <mat-icon class="section-icon">folder</mat-icon>
          <span class="section-label">Folder</span>
          <mat-icon class="section-chevron">{{ folderOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>
        @if (folderOpen()) {
          <div class="section-body" cdkDropList>
            @for (meal of rotation.folderMeals(); track meal.id) {
              <div class="binder-card" [class.ghost]="!rotation.isPinAlive(meal)" cdkDrag [cdkDragData]="meal">
                <button
                  type="button"
                  class="card-pin"
                  [class.alive]="rotation.isPinAlive(meal)"
                  [matTooltip]="rotation.isPinAlive(meal) ? 'In your Binder' : 'Save to your Binder'"
                  (click)="$event.stopPropagation(); onPinMeal(meal)">
                  <mat-icon>menu_book</mat-icon>
                </button>
                <button
                  type="button"
                  class="card-delete"
                  matTooltip="Discard this meal"
                  (click)="$event.stopPropagation(); rotation.deleteFolderMeal(meal.id)">
                  <mat-icon>delete_outline</mat-icon>
                </button>
                <span class="binder-card-name">{{ cardTitle(meal) }}</span>
                <div class="binder-chips">
                  <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
                  <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
                  <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
                  <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
                </div>
              </div>
            } @empty {
              <p class="binder-empty">No Folder meals — build one by hand or Generate Meal.</p>
            }
          </div>
        }
      </div>

      <!-- Binder section: pinned meals (your saved library). -->
      <div class="rail-section">
        <button type="button" class="section-head" (click)="binderOpen.set(!binderOpen())">
          <mat-icon class="section-icon">menu_book</mat-icon>
          <span class="section-label">Binder</span>
          <mat-icon class="section-chevron">{{ binderOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>
        @if (binderOpen()) {
          <div class="section-body" cdkDropList>
            @for (meal of rotation.binderMeals(); track meal.id) {
              <div class="binder-card" cdkDrag [cdkDragData]="meal">
                <button
                  type="button"
                  class="card-pin alive"
                  matTooltip="In your Binder"
                  (click)="$event.stopPropagation()">
                  <mat-icon>menu_book</mat-icon>
                </button>
                <button
                  type="button"
                  class="card-delete"
                  matTooltip="Delete this meal"
                  (click)="$event.stopPropagation(); onDeleteBinder(meal)">
                  <mat-icon>delete_outline</mat-icon>
                </button>
                <span class="binder-card-name">{{ meal.name }}</span>
                <div class="binder-chips">
                  <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
                  <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
                  <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
                  <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
                </div>
              </div>
            } @empty {
              <p class="binder-empty">Nothing saved yet — press the book icon on a meal to keep it.</p>
            }
          </div>
        }
      </div>
      <!-- NOTE (Step 4): pinned MENUS are not listed in this rail today (menus
           live in the board's menu-card-row). If a Binder menu list is added
           later, render it under this Binder section. Deferred. -->
    </div>
  `,
  styleUrls: ['./meal-binder.scss'],
})
export class MealBinderComponent implements OnInit {
  readonly rotation = inject(RotationService);
  private notification = inject(NotificationService);

  /** Section expand state — both default open. Bodies scroll independently. */
  readonly folderOpen = signal(true);
  readonly binderOpen = signal(true);

  ngOnInit(): void {
    this.rotation.loadFolder();
    this.rotation.loadBinder();
  }

  /** Pin a Folder meal to the Binder. Alive icon = already in Binder → no-op. */
  onPinMeal(meal: Meal): void {
    if (this.rotation.isPinAlive(meal)) return;
    void this.rotation.pinMeal(meal.id);
  }

  /** Deleting a Binder meal is destructive to your library — confirm. */
  onDeleteBinder(meal: Meal): void {
    this.notification.showConfirmation(
      `Are you sure? Delete your Binder meal "${meal.name}".`,
      'warning',
      () => void this.rotation.deleteBinderMeal(meal.id),
      () => {
        /* keep it */
      },
    );
  }

  round(n: number | undefined): number {
    return Math.round(n ?? 0);
  }

  /** Card label: the meal's own name, else the primary protein's short name. */
  cardTitle(meal: Meal): string {
    const name = meal.name?.trim();
    if (name) return name;
    const items = meal.items ?? [];
    const primary = items.find((i) => i.itemRole === 'primary') ?? items[0];
    return (primary?.food?.shortDescription?.trim() || primary?.foodName?.trim()) ?? '';
  }

  // ----- Cuisine "Twist" combobox (unchanged) ------------------------------
  readonly twistOptions = ['none', 'Italian', 'Mexican', 'Mediterranean', 'American', 'Custom...'];

  readonly twistValue = signal('none');
  readonly twistOpen = signal(false);
  private twistBeforeCustom = 'none';
  private twistInputRef = viewChild<ElementRef<HTMLInputElement>>('twistInput');

  onTwistInput(value: string): void {
    this.twistValue.set(value);
  }

  onChevronMouseDown(ev: Event): void {
    ev.preventDefault();
    this.twistOpen.update((v) => !v);
    this.twistInputRef()?.nativeElement.focus();
  }

  selectTwist(opt: string, ev: Event): void {
    ev.preventDefault();
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

  onTwistBlur(): void {
    this.twistOpen.set(false);
    if (this.twistValue().trim() === '') {
      this.twistValue.set(this.twistBeforeCustom);
    }
  }
}
