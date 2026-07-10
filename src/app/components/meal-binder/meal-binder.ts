// src/app/components/meal-binder/meal-binder.ts
//
// Right-hand rail for the Menus surface. Vertically compact for laptops:
//   - The "Meals" title line carries a right-justified AI toggle (star + chevron).
//   - Three top-level accordions: AI (revealed by the toggle), Menus, Meals.
//   - AI body is a single row: ✦ Create + Twist combobox.
// The Folder (AI-generated, unplaced meals) is out of scope for V1.0, so it is
// not shown here. Cards carry a pin icon (yellow = in your Binder) + a trash.
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { RotationService } from '../../services/rotation.service';
import { TwistIconComponent } from '../twist-icon/twist-icon';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';
import { Meal, Menu } from '../../models';

@Component({
  selector: 'app-meal-binder',
  imports: [DragDropModule, MatTooltipModule, MatIconModule, TwistIconComponent],
  // Releasing the mouse anywhere cancels the "drag" encourager hint.
  host: { '(document:mouseup)': 'clearDragHint()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="binder">
      <!-- Title line: "Meals" + right-justified AI toggle (star + chevron). The
           AI controls live in the collapsible AI accordion below, toggled here. -->
      <div class="binder-header">
        <span class="binder-title">Menus &amp; Meals</span>
        <button
          type="button"
          class="ai-toggle"
          matTooltip="AI meal generation"
          (click)="aiOpen.set(!aiOpen())">
          <img src="images/AI-star.png" alt="" class="ai-logo" [class.spinning]="rotation.generating()" />
          <mat-icon class="ai-toggle-chevron">{{ aiOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>
      </div>

      <!-- One scrollbar for the whole rail. -->
      <div class="rail-scroll">

        <!-- AI accordion — revealed by the title toggle. Star icon in front (vs
             the fork/knife on Meals). Body is a single compact row. -->
        @if (aiOpen()) {
          <div class="rail-section">
            <button type="button" class="section-head" (click)="aiOpen.set(false)">
              <img src="images/AI-star.png" alt="" class="section-ai-logo" [class.spinning]="rotation.generating()" />
              <span class="section-label">AI</span>
              <mat-icon class="section-chevron">expand_less</mat-icon>
            </button>
            <div class="section-body ai-body">
              <button
                type="button"
                class="genmeal-btn"
                matTooltip="Generate a meal with AI"
                [disabled]="rotation.generating()"
                (click)="rotation.generateMeal()">
                <img src="images/AI-star.png" alt="" class="btn-star" />Create
              </button>
              <span class="twist-label"><span class="twist-word">Twist</span><app-twist-icon /></span>
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
          </div>
        }

        <!-- Menus accordion (top-level; larger header). -->
        <div class="rail-section">
          <button type="button" class="section-head" (click)="binderMenusOpen.set(!binderMenusOpen())">
            <mat-icon class="section-icon">description</mat-icon>
            <span class="section-label">Menus</span>
            <span class="section-count">{{ rotation.binderMenus().length }}</span>
            <mat-icon class="section-chevron">{{ binderMenusOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
          @if (binderMenusOpen()) {
            <div class="section-body" cdkDropList>
              @for (menu of rotation.binderMenus(); track menu.id) {
                <div
                  class="binder-menu-card stacked-card"
                  [class.selected]="rotation.isCardSelected('menu', menu.id ?? -1)"
                  [attr.data-menu-id]="menu.id"
                  cdkDrag
                  [cdkDragData]="menu"
                  (cdkDragStarted)="rotation.dragging.set('menu'); clearDragHint()"
                  (cdkDragEnded)="rotation.dragging.set(null)"
                  (mousedown)="onCardMouseDown()"
                  (click)="rotation.selectCard('menu', menu.id ?? -1)">
                  <div class="card-head">
                    <button
                      type="button"
                      class="card-pin icon-disc icon-disc-pinned"
                      matTooltip="In your Binder">
                      <mat-icon>description</mat-icon>
                    </button>
                    <span class="binder-card-name">{{ menu.name }}</span>
                    <span class="card-cals">{{ round(menu.totalCalories) }} cals</span>
                    <button
                      type="button"
                      class="card-toggle"
                      [matTooltip]="isCardOpen('menu-' + menu.id) ? 'Hide macros' : 'Show macros'"
                      (click)="$event.stopPropagation(); toggleCard('menu-' + menu.id)">
                      <mat-icon>{{ isCardOpen('menu-' + menu.id) ? 'expand_less' : 'expand_more' }}</mat-icon>
                    </button>
                    <button
                      type="button"
                      class="card-delete icon-disc icon-disc-danger"
                      matTooltip="Delete this menu"
                      (click)="$event.stopPropagation(); onDeleteBinderMenu(menu)">
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                  <!-- Macro disks hidden until the chevron is flipped; same colors
                       + order as meal cards. Calories shown as blue text above. -->
                  @if (isCardOpen('menu-' + menu.id)) {
                    <div class="binder-chips">
                      <span class="chip protein">P {{ round(menu.totalProteinG) }}</span>
                      <span class="chip carb">C {{ round(menu.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(menu.totalFatG) }}</span>
                      <span class="chip fiber">F {{ round(menu.totalFiberG) }}</span>
                    </div>
                  }
                </div>
              } @empty {
                <p class="binder-empty">No pinned menus yet — press the sheet icon on a menu to keep it.</p>
              }
            </div>
          }
        </div>

        <!-- Meals accordion. -->
        <div class="rail-section">
          <button type="button" class="section-head" (click)="binderMealsOpen.set(!binderMealsOpen())">
            <mat-icon class="section-icon">restaurant</mat-icon>
            <span class="section-label">Meals</span>
            <span class="section-count">{{ rotation.binderMeals().length }}</span>
            <mat-icon class="section-chevron">{{ binderMealsOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
          @if (binderMealsOpen()) {
            <div class="section-body" cdkDropList>
              @for (meal of rotation.binderMeals(); track meal.id) {
                <div
                  class="binder-card"
                  [class.selected]="rotation.isCardSelected('meal', meal.id)"
                  cdkDrag
                  [cdkDragData]="meal"
                  (cdkDragStarted)="rotation.dragging.set('meal'); clearDragHint()"
                  (cdkDragEnded)="rotation.dragging.set(null)"
                  (mousedown)="onCardMouseDown()"
                  (click)="rotation.selectCard('meal', meal.id)">
                  <div class="card-head">
                    <button
                      type="button"
                      class="card-pin icon-disc icon-disc-pinned"
                      matTooltip="In your Binder"
                      (click)="$event.stopPropagation()">
                      <mat-icon>restaurant</mat-icon>
                    </button>
                    <span class="binder-card-name">{{ meal.name }}</span>
                    <span class="card-cals">{{ round(meal.totalCalories) }} cals</span>
                    <button
                      type="button"
                      class="card-toggle"
                      [matTooltip]="isCardOpen('meal-' + meal.id) ? 'Hide macros' : 'Show macros'"
                      (click)="$event.stopPropagation(); toggleCard('meal-' + meal.id)">
                      <mat-icon>{{ isCardOpen('meal-' + meal.id) ? 'expand_less' : 'expand_more' }}</mat-icon>
                    </button>
                    <button
                      type="button"
                      class="card-delete icon-disc icon-disc-danger"
                      matTooltip="Delete this meal"
                      (click)="$event.stopPropagation(); onDeleteBinder(meal)">
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                  @if (isCardOpen('meal-' + meal.id)) {
                    <div class="binder-chips">
                      <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
                      <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
                      <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
                    </div>
                  }
                </div>
              } @empty {
                <p class="binder-empty">Nothing saved yet — press the book icon on a meal to keep it.</p>
              }
            </div>
          }
        </div>

      </div>
    </div>
  `,
  styleUrls: ['./meal-binder.scss'],
})
export class MealBinderComponent implements OnInit {
  readonly rotation = inject(RotationService);
  private dialog = inject(MatDialog);
  private host = inject(ElementRef<HTMLElement>);

  /** AI accordion (Create + Twist) — collapsed by default to save vertical room. */
  readonly aiOpen = signal(false);
  /** Top-level accordion open state — both default open. */
  readonly binderMenusOpen = signal(true);
  readonly binderMealsOpen = signal(true);

  /** Per-card macro-chip expansion, keyed `menu-{id}` / `meal-{id}`. Chips are
   *  hidden by default (calories stay visible as text); a chevron reveals them. */
  private readonly expandedCards = signal<Set<string>>(new Set());

  isCardOpen(key: string): boolean {
    return this.expandedCards().has(key);
  }

  // --- Drag "encourager": while a card is held down (before motion), a center-
  // screen hint appears. It shows after a short hold (so a quick click-select
  // doesn't flash it) and is cleared on drag-motion or mouse release. ---
  private hintTimer: ReturnType<typeof setTimeout> | null = null;

  onCardMouseDown(): void {
    this.clearHintTimer();
    this.hintTimer = setTimeout(() => this.rotation.showDragHint.set(true), 180);
  }

  clearDragHint(): void {
    this.clearHintTimer();
    this.rotation.showDragHint.set(false);
  }

  private clearHintTimer(): void {
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
  }

  toggleCard(key: string): void {
    this.expandedCards.update((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  constructor() {
    // When a menu is pinned, the service sets revealBinderMenuId. Expand the
    // Menus accordion and scroll the new entry into view.
    effect(
      () => {
        const id = this.rotation.revealBinderMenuId();
        if (id == null) return;
        this.binderMenusOpen.set(true);
        // Wait a tick for the accordion to render, then bring the card into view.
        setTimeout(() => {
          const el = this.host.nativeElement.querySelector(`[data-menu-id="${id}"]`);
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.rotation.loadBinder();
    this.rotation.loadBinderMenus();
  }

  /** Deleting a Binder menu — ask whether its associated meals go too.
   *  Yes = delete the menu AND its meals; No = delete the menu, keep the meals
   *  in your Binder; Cancel = nothing. */
  onDeleteBinderMenu(menu: Menu): void {
    const id = menu.id;
    if (id == null) return;
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        title: `Delete "${menu.name}"`,
        message: 'Do you want all associated meals deleted?',
        confirmLabel: 'Yes',
        onConfirm: () => void this.rotation.deleteBinderMenu(id, true),
        secondaryLabel: 'No',
        onSecondary: () => void this.rotation.deleteBinderMenu(id, false),
      },
    });
  }

  /** Deleting a Binder meal — same dark confirm dialog as the menu delete (no
   *  orange system-alert toast for a routine operation). */
  onDeleteBinder(meal: Meal): void {
    const id = meal.id;
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        title: `Delete "${meal.name}"`,
        message: 'Delete this meal from your Binder?',
        confirmLabel: 'Delete',
        onConfirm: () => void this.rotation.deleteBinderMeal(id),
      },
    });
  }

  round(n: number | null | undefined): number {
    return Math.round(n ?? 0);
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
