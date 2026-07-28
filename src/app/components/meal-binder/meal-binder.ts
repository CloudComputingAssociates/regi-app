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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { RotationService } from '../../services/rotation.service';
import { RecipeService } from '../../services/recipe.service';
import { RecipeImportWatcher } from '../../services/recipe-import-watcher.service';
import { NotificationService } from '../../services/notification.service';
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
        <span class="binder-title"><mat-icon class="binder-title-icon">menu_book</mat-icon>Binder</span>
      </div>

      <!-- One scrollbar for the whole rail. -->
      <div class="rail-scroll">

        <!-- "Create new" — collapsible (starts collapsed). Holds the two ways to
             create a meal (From picks / Import recipe) + the Cuisine modifier. -->
        <div class="rail-section">
          <button type="button" class="section-head" (click)="createNewOpen.set(!createNewOpen())">
            <mat-icon class="section-icon section-icon-binder">auto_awesome</mat-icon>
            <span class="section-label">Create new</span>
            <mat-icon class="section-chevron">{{ createNewOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
          @if (createNewOpen()) {
            <div class="section-body create-body">
              <!-- Generate from the user's picks, with an optional Cuisine. -->
              <div class="ai-body">
                <button
                  type="button"
                  class="genmeal-btn"
                  matTooltip="Meals from Foods you picked"
                  [disabled]="rotation.generating()"
                  (click)="rotation.generateMeal()">
                  <img src="images/AI-star.png" alt="" class="btn-star" />From picks
                </button>
                <div class="twist-group">
                  <span class="twist-label"><span class="twist-word">Cuisine</span></span>
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
                      aria-label="Cuisine options"
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
                  <span class="twist-mark">
                    @if (twistValue() !== 'none' && twistValue().trim() !== '') {
                      <app-twist-icon />
                    }
                  </span>
                </div>
              </div>
              <!-- Build a meal by hand — opens the food picker on a fresh slot. -->
              <button
                type="button"
                class="genmeal-btn scratch-btn"
                matTooltip="Build a new meal by hand"
                (click)="rotation.createScratchMeal()">
                <span class="scratch-line1">Create</span>
                <span class="scratch-line2">from scratch</span>
              </button>
              <!-- Import a recipe PDF. Same shading as From picks; no icon. -->
              <button
                type="button"
                class="genmeal-btn recipe-import-btn"
                [disabled]="uploading()"
                matTooltip="Import a recipe PDF into a saved meal"
                matTooltipPosition="below"
                (click)="recipeInput.click()">
                {{ uploading() ? 'Importing…' : 'Import recipe…' }}
              </button>
              <input
                #recipeInput
                type="file"
                accept="application/pdf"
                hidden
                (change)="onRecipeFileSelected(recipeInput)" />
            </div>
          }
        </div>

        <!-- Detached grey divider closing off the Create-new area. -->
        <div class="rail-divider"></div>

        <!-- Menus accordion (top-level; larger header). -->
        <div class="rail-section">
          <button type="button" class="section-head" (click)="binderMenusOpen.set(!binderMenusOpen())">
            <mat-icon class="section-icon section-icon-binder">description</mat-icon>
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
                    <!-- Non-editable name so the whole card is easy to grab + drag.
                         Rename happens on the board (menu strip) after placing. -->
                    <span
                      class="binder-card-name"
                      [matTooltip]="menuDisplayName(menu)"
                      [matTooltipDisabled]="!rotation.isCardSelected('menu', menu.id ?? -1)"
                      matTooltipClass="binder-name-tip"
                      matTooltipPosition="below"
                      [matTooltipShowDelay]="300">{{ menuDisplayName(menu) }}</span>
                    <!-- Browse-by summary: the chevron in front of the Protein +
                         Fiber discs; carbs/fat/cals demoted into the reveal. -->
                    <button
                      type="button"
                      class="card-toggle"
                      [matTooltip]="isCardOpen('menu-' + menu.id) ? 'Hide extra macros' : 'Show Calories, Carbs & Fats'"
                      (click)="$event.stopPropagation(); toggleCard('menu-' + menu.id)">
                      <mat-icon>{{ isCardOpen('menu-' + menu.id) ? 'expand_less' : 'expand_more' }}</mat-icon>
                    </button>
                    <span class="chip protein">P {{ round(menu.totalProteinG) }}</span>
                    <span class="chip fiber">F {{ round(menu.totalFiberG) }}</span>
                    <button
                      type="button"
                      class="card-delete icon-disc icon-disc-danger"
                      matTooltip="Delete this menu"
                      (click)="$event.stopPropagation(); onDeleteBinderMenu(menu)">
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                  <!-- Reveal: the OTHER macros — Carbs, Fat, Cals — hidden until
                       the chevron is flipped (Protein + Fiber show up above). -->
                  @if (isCardOpen('menu-' + menu.id)) {
                    <div class="binder-chips">
                      <span class="chip carb">C {{ round(menu.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(menu.totalFatG) }}</span>
                      <span class="binder-cals">{{ round(menu.totalCalories) }} cals</span>
                    </div>
                  }
                </div>
              } @empty {
                <p class="binder-empty">No saved Menus.</p>
              }
            </div>
          }
        </div>

        <!-- Meals accordion. -->
        <div class="rail-section">
          <button type="button" class="section-head" (click)="binderMealsOpen.set(!binderMealsOpen())">
            <mat-icon class="section-icon section-icon-binder">restaurant</mat-icon>
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
                  (click)="rotation.selectCard('meal', meal.id)"
                  (dblclick)="rotation.placeBinderMeal(meal.id)">
                  <div class="card-head">
                    <!-- Non-editable name so the whole card is easy to grab + drag.
                         Rename happens on the board (flip the meal tile) after placing. -->
                    <span
                      class="binder-card-name"
                      [matTooltip]="meal.name"
                      [matTooltipDisabled]="!rotation.isCardSelected('meal', meal.id)"
                      matTooltipClass="binder-name-tip"
                      matTooltipPosition="below"
                      [matTooltipShowDelay]="300">{{ meal.name }}</span>
                    <!-- Browse-by summary: the chevron in front of the Protein +
                         Fiber discs; carbs/fat/cals demoted into the reveal. -->
                    <button
                      type="button"
                      class="card-toggle"
                      [matTooltip]="isCardOpen('meal-' + meal.id) ? 'Hide extra macros' : 'Show Calories, Carbs & Fats'"
                      (click)="$event.stopPropagation(); toggleCard('meal-' + meal.id)">
                      <mat-icon>{{ isCardOpen('meal-' + meal.id) ? 'expand_less' : 'expand_more' }}</mat-icon>
                    </button>
                    <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
                    <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
                    <button
                      type="button"
                      class="card-delete icon-disc icon-disc-danger"
                      matTooltip="Delete this meal"
                      (click)="$event.stopPropagation(); onDeleteBinder(meal)">
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                  <!-- Reveal: the OTHER macros — Carbs, Fat, Cals — hidden until
                       the chevron is flipped (Protein + Fiber show up above). -->
                  @if (isCardOpen('meal-' + meal.id)) {
                    <div class="binder-chips">
                      <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
                      <span class="binder-cals">{{ round(meal.totalCalories) }} cals</span>
                    </div>
                  }
                  <!-- Drag preview: the meal's PHOTO (name over a scrim), so the
                       thing you drag reads as the pictured meal it'll become in the
                       slot. Falls back to a named chip when the meal has no image. -->
                  <ng-template cdkDragPreview>
                    <div class="drag-meal-preview" [class.no-photo]="!mealThumb(meal)">
                      @if (mealThumb(meal); as src) {
                        <img [src]="src" alt="" class="dmp-img" />
                        <div class="dmp-scrim"></div>
                      }
                      <span class="dmp-name">{{ meal.name }}</span>
                    </div>
                  </ng-template>
                </div>
              } @empty {
                <p class="binder-empty">No saved Meals.</p>
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
  private recipeService = inject(RecipeService);
  private watcher = inject(RecipeImportWatcher);
  private notification = inject(NotificationService);

  /** Single-flight lock for the "From recipe…" button. Goes true on PDF select,
   *  reads "Importing…" while true, and blocks a second import. Released in
   *  EXACTLY two places, one per stage: the finally around the upload POST
   *  (below), and the watcher.settled subscription (in the constructor) for the
   *  background parse. No other code touches it — so it can't be stranded. */
  readonly uploading = signal(false);

  /** PDF chosen from the "From recipe…" picker — upload it, then watch the import
   *  to completion. The 202 carries the recipeId to poll. The finally releases
   *  the lock for the upload stage on every path (including a failed/errored
   *  upload that never starts a watch); the watcher.settled subscription releases
   *  it for the parse stage. */
  async onRecipeFileSelected(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // let the same file be re-picked after a failure
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.notification.show('Please choose a PDF recipe file.', 'error');
      return;
    }
    this.uploading.set(true);
    this.notification.show('Importing recipe…', 'info');
    try {
      const res = await firstValueFrom(this.recipeService.importRecipe(file));
      if (res?.recipeId != null) this.watcher.watch(res.recipeId);
    } catch {
      this.notification.show('Recipe import failed — could not upload the PDF.', 'error');
    } finally {
      this.uploading.set(false);
    }
  }

  /** "Create new" accordion — starts COLLAPSED. */
  readonly createNewOpen = signal(false);

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
    // Parse-stage release of the import lock: the watcher's terminal signal fires
    // once for EVERY import exit (parsed / failed / timeout / 404), so the button
    // can never strand waiting on a branch that doesn't emit a toast event.
    this.watcher.settled
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.uploading.set(false));

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

    // Empty Binder sections collapse themselves — an empty accordion is just
    // wasted vertical space (nothing but the "No saved …" line). Populated
    // sections open; a manual collapse sticks until the count next changes.
    effect(() => this.binderMenusOpen.set(this.rotation.binderMenus().length > 0), {
      allowSignalWrites: true,
    });
    effect(() => this.binderMealsOpen.set(this.rotation.binderMeals().length > 0), {
      allowSignalWrites: true,
    });
  }

  ngOnInit(): void {
    this.rotation.loadBinder();
    this.rotation.loadBinderMenus();
  }

  /** Deleting a Binder menu is a fully destructive mini-wipe — the menu AND all
   *  its saved meals go. Warn explicitly. */
  onDeleteBinderMenu(menu: Menu): void {
    const id = menu.id;
    if (id == null) return;
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        title: `Delete "${menu.name}"`,
        message: 'Delete Menu and all saved meals?',
        confirmLabel: 'Delete',
        onConfirm: () => void this.rotation.deleteBinderMenu(id, true),
      },
    });
  }

  /** Deleting a Binder meal. A plain meal is cheap to re-add, so it deletes
   *  immediately with no confirm. But only the ORIGINAL import-created meal
   *  carries a recipeLink (copies/clones never do), so a non-empty link means
   *  this meal is the last thing referencing that recipe — deleting it orphans
   *  the recipe. In that case, confirm and offer to remove the recipe + its PDF
   *  too (emphasis on deleting both, so no unreachable recipe is left behind). */
  onDeleteBinder(meal: Meal): void {
    if (!meal.recipeLink?.trim()) {
      void this.rotation.deleteBinderMeal(meal.id);
      return;
    }
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        title: `Delete "${meal.name}"`,
        message:
          'This meal was created from an imported recipe. Delete the recipe and its PDF too? This permanently removes them and cannot be undone.',
        confirmLabel: 'Delete meal & recipe',
        onConfirm: () => void this.rotation.deleteBinderMeal(meal.id, true),
        secondaryLabel: 'Delete meal only',
        onSecondary: () => void this.rotation.deleteBinderMeal(meal.id, false),
      },
    });
  }

  round(n: number | null | undefined): number {
    return Math.round(n ?? 0);
  }

  /** Thumbnail URL for a Binder meal (thumbnail preferred, full image fallback),
   *  '' when it has no picture. Drives the drag preview. */
  mealThumb(meal: Meal): string {
    return (meal.mealImageThumbnail ?? meal.mealImage ?? '').trim();
  }

  /** Display name for a Binder menu — mirrors the board's menu-card lettering so
   *  the SAME menu reads "Menu A" in both places. Server-default numeric names
   *  ("Menu 6") are treated as unnamed and shown as the positional letter from
   *  the rotation (index → A/B/C). A real custom name is shown verbatim; an
   *  unplaced saved menu (not in the rotation) falls back to its stored name. */
  menuDisplayName(menu: Menu): string {
    const name = menu.name?.trim();
    if (name && !/^menu\s+\d+$/i.test(name)) return name;
    const idx = this.rotation.menus().findIndex((e) => e.menuId === menu.id);
    if (idx >= 0) return `Menu ${String.fromCharCode(65 + idx)}`;
    return name || 'Menu';
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
