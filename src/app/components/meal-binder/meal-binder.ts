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
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { RotationService } from '../../services/rotation.service';
import { PreferencesService } from '../../services/preferences.service';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';
import { Meal, Menu } from '../../models';

@Component({
  selector: 'app-meal-binder',
  imports: [DragDropModule, MatTooltipModule, MatIconModule],
  // Releasing the mouse anywhere cancels the "drag" encourager hint.
  host: { '(document:mouseup)': 'clearDragHint()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="binder">
      <!-- Title line: "Meals" + right-justified AI toggle (star + chevron). The
           AI controls live in the collapsible AI accordion below, toggled here. -->
      <div class="binder-header">
        <span class="binder-title"><mat-icon class="binder-title-icon">menu_book</mat-icon>Binder</span>
        <!-- Always-on meal search, right-justified with ample gap from the title.
             Matches meal name + any ingredient (same signal the Filter used). -->
        <input
          type="text"
          class="header-search"
          placeholder="search meal..."
          matTooltip="Search a meal by name, or type any ingredient"
          matTooltipPosition="below"
          [value]="searchText()"
          (input)="searchText.set($any($event.target).value)" />
      </div>

      <!-- One scrollbar for the whole rail. -->
      <div class="rail-scroll">

        <!-- Menus accordion (top-level; larger header). Starts COLLAPSED. -->
        <div class="rail-section">
          <button type="button" class="section-head" (click)="binderMenusOpen.set(!binderMenusOpen())">
            <span class="section-label">Menus</span>
            <span class="section-count">({{ rotation.binderMenus().length }})</span>
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
                    <!-- Dropdown chevron on the far right of the name line. -->
                    <button
                      type="button"
                      class="card-toggle"
                      [matTooltip]="isCardOpen('menu-' + menu.id) ? 'Hide extra macros' : 'Show Calories, Carbs & Fats'"
                      (click)="$event.stopPropagation(); toggleCard('menu-' + menu.id)">
                      <mat-icon>{{ isCardOpen('menu-' + menu.id) ? 'expand_less' : 'expand_more' }}</mat-icon>
                    </button>
                  </div>
                  <!-- Collapsed = name only. Expanding reveals the macros: P /
                       Fiber / cals, then Carbs + Fat + delete underneath. -->
                  @if (isCardOpen('menu-' + menu.id)) {
                    <div class="binder-chips card-macros">
                      <span class="chip protein">P {{ round(menu.totalProteinG) }}</span>
                      <span class="chip fiber">F {{ round(menu.totalFiberG) }}</span>
                      <span class="binder-cals">{{ round(menu.totalCalories) }} cals</span>
                    </div>
                    <div class="binder-chips">
                      <span class="chip carb">C {{ round(menu.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(menu.totalFatG) }}</span>
                      <button
                        type="button"
                        class="card-delete icon-disc icon-disc-danger"
                        matTooltip="Delete this menu"
                        (click)="$event.stopPropagation(); onDeleteBinderMenu(menu)">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    </div>
                  }
                </div>
              } @empty {
                <p class="binder-empty">No saved Menus.</p>
              }
            </div>
          }
        </div>

        <!-- Meals — always expanded. A plain "Create ⌄" toggle sits right-
             justified on the header; opening it reveals the create controls in
             the space above the list. This is the ONLY create surface. -->
        <div class="rail-section">
          <div class="section-head section-head-static section-head-meals">
            <span class="section-label">Meals</span>
            <span class="section-count">({{ rotation.binderMeals().length }})</span>
            <!-- Create: a Material + (add) icon key, same size/shading as the
                 board toolbar keys, sitting right after "Meals (n)" with the same
                 gap the Menus & Meals title has before its keys. Blooms the AI
                 Create Meal overlay over the board. -->
            <button
              type="button"
              class="create-icon-btn"
              matTooltip="AI Create Meal"
              matTooltipPosition="above"
              (click)="createMeal.emit()">
              <mat-icon>add</mat-icon>
            </button>
            <!-- Filter stays right-justified. -->
            <button type="button" class="create-toggle filter-toggle" (click)="toggleFilterPanel()">
              <span class="create-word">Filter</span>
              <mat-icon class="create-chevron">{{ filterOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
            </button>
          </div>
          @if (filterOpen()) {
            <!-- Bordered "Filter" fieldset: search + Clear-all on one row, then
                 SHOW / Only / Sort rows — all inside the frame.
                 SHOW toggles are the persisted "meals in your Binder" prefs
                 (default ON = show everything; uncheck Regi/Community to see only
                 your own) — they pick WHICH SOURCES appear. "Only with recipe" is
                 an orthogonal 2nd-level narrowing filter (recipe-ness is yes/no
                 and independent of source), default OFF. Search matches meal name
                 + any ingredient. -->
            <div class="section-body filter-body">
              <fieldset class="filter-fieldset">
                <legend>Filter</legend>
                <div class="filter-checks">
                  <label class="check-opt">
                    <input
                      type="checkbox"
                      [checked]="preferences.showMyMeals()"
                      (change)="preferences.setShowMyMeals($any($event.target).checked)" />
                    MyMeals
                  </label>
                  <label class="check-opt">
                    <input
                      type="checkbox"
                      [checked]="preferences.showRegiApprovedMeals()"
                      (change)="preferences.setShowRegiApprovedMeals($any($event.target).checked)" />
                    Regi
                  </label>
                  <label class="check-opt">
                    <input
                      type="checkbox"
                      [checked]="preferences.showCommunityMeals()"
                      (change)="preferences.setShowCommunityMeals($any($event.target).checked)" />
                    Community
                  </label>
                  <button
                    type="button"
                    class="filter-clear"
                    matTooltip="Clear all"
                    matTooltipPosition="above"
                    (click)="clearFilter()">
                    <mat-icon>clear_all</mat-icon>
                  </button>
                </div>
                <div class="filter-checks">
                  <label class="check-opt">
                    <input
                      type="checkbox"
                      [checked]="onlyWithRecipe()"
                      (change)="onlyWithRecipe.set($any($event.target).checked)" />
                    only meals with recipe
                  </label>
                </div>
                <div class="sort-row">
                  <span class="filter-label">Sort</span>
                  <select
                    class="sort-select"
                    [value]="sortBy() ?? 'none'"
                    (change)="onSortChange($any($event.target).value)">
                    <option value="none">None</option>
                    <option value="date">Date (newest)</option>
                    <option value="protein">Protein</option>
                    <option value="fiber">Fiber</option>
                  </select>
                </div>
              </fieldset>
            </div>
          }
          <div class="section-body" cdkDropList>
              @for (meal of displayMeals(); track meal.id; let i = $index) {
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
                    <!-- Collapsed row: square thumbnail, title, dropdown arrow.
                         Everything else lives under the dropdown. -->
                    @if (mealThumb(meal); as src) {
                      <img [src]="src" alt="" class="card-thumb" />
                    } @else {
                      <!-- No photo yet — fork & knife placeholder (mobile can add
                           a pic later) rather than a blank square. -->
                      <span class="card-thumb card-thumb-empty">
                        <mat-icon class="card-thumb-icon">restaurant</mat-icon>
                      </span>
                    }
                    @if (editingMealId() === meal.id) {
                      <!-- Inline rename: title becomes editable; pencil → green
                           confirm. Enter or the disc commits the new name. -->
                      <input
                        type="text"
                        class="name-edit"
                        [value]="editDraft()"
                        (click)="$event.stopPropagation()"
                        (mousedown)="$event.stopPropagation()"
                        (input)="editDraft.set($any($event.target).value)"
                        (keydown.enter)="$event.stopPropagation(); confirmRename(meal)"
                        (keydown.escape)="cancelRename()" />
                      <button
                        type="button"
                        class="icon-disc icon-disc-confirm rename-go"
                        matTooltip="Save name"
                        (click)="$event.stopPropagation(); confirmRename(meal)">
                        <mat-icon>check</mat-icon>
                      </button>
                    } @else {
                      <!-- Non-editable name so the whole card is easy to grab +
                           drag. A pencil to rename appears only when expanded. -->
                      <span
                        class="binder-card-name"
                        [matTooltip]="meal.name"
                        [matTooltipDisabled]="!rotation.isCardSelected('meal', meal.id)"
                        matTooltipClass="binder-name-tip"
                        matTooltipPosition="below"
                        [matTooltipShowDelay]="300">{{ meal.name }}</span>
                      @if (isMealOpen(meal)) {
                        <button
                          type="button"
                          class="rename-pencil icon-disc icon-disc-edit"
                          matTooltip="Rename this meal"
                          (click)="$event.stopPropagation(); startRename(meal)">
                          <mat-icon>edit</mat-icon>
                        </button>
                      }
                      <!-- Dropdown chevron on the far right of the name line. -->
                      <button
                        type="button"
                        class="card-toggle"
                        [matTooltip]="isMealOpen(meal) ? 'Hide macros' : 'Show macros'"
                        (click)="$event.stopPropagation(); toggleCard('meal-' + meal.id)">
                        <mat-icon>{{ isMealOpen(meal) ? 'expand_less' : 'expand_more' }}</mat-icon>
                      </button>
                    }
                  </div>
                  <!-- Reveal: all macros in order P, C, F, fiber, cals, then the
                       delete flush right — only visible when dropped down. -->
                  @if (isMealOpen(meal)) {
                    <div class="binder-chips card-reveal">
                      <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
                      <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
                      <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
                      <span class="binder-cals">{{ round(meal.totalCalories) }} cals</span>
                      <button
                        type="button"
                        class="card-delete icon-disc icon-disc-danger"
                        matTooltip="Delete this meal"
                        (click)="$event.stopPropagation(); onDeleteBinder(meal)">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
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
  readonly preferences = inject(PreferencesService);

  /** Header "Create" button — asks the panel to bloom the AI Create Meal overlay
   *  over the board (the create controls no longer live inline in the rail). */
  readonly createMeal = output<void>();

  /** "Filter" accordion — starts COLLAPSED. */
  readonly filterOpen = signal(false);

  /** Toggle the Filter accordion. */
  toggleFilterPanel(): void {
    this.filterOpen.update((v) => !v);
  }

  // ----- Binder Meals filter + sort -----------------------------------------
  /** Keyword typed in the Filter search box (matches meal name + any ingredient). */
  readonly searchText = signal('');
  /** 2nd-level narrowing filter — when ON, hide meals with no recipe link.
   *  Orthogonal to the SHOW source toggles; default OFF (transient per-view). */
  readonly onlyWithRecipe = signal(false);
  /** Active sort, or null for the default alphabetical order. Always descending.
   *  'date' = newest created/modified first — auto-set when a new meal enters the
   *  Binder so the fresh meal surfaces at the very top. */
  readonly sortBy = signal<'protein' | 'fiber' | 'date' | null>(null);

  /** Map the Sort dropdown value to the sort signal. */
  onSortChange(value: string): void {
    this.sortBy.set(
      value === 'protein' ? 'protein' :
      value === 'fiber' ? 'fiber' :
      value === 'date' ? 'date' : null,
    );
  }

  /** The Meals list as displayed: SHOW-gated + keyword-filtered, then either
   *  sorted by the chosen macro / recipe (descending) or in the default order —
   *  default-named meals ("Meal N") first in numeric order, then alphabetical. */
  readonly displayMeals = computed<Meal[]>(() => {
    const q = this.searchText().trim().toLowerCase();
    let list = this.rotation.binderMeals();
    // SHOW gating (Filter "SHOW" row + Menu settings "Meals" row — same persisted
    // prefs): drop meal categories the user has hidden. All default ON, so the
    // default view shows everything. The three buckets are mutually exclusive:
    // MyMeals = the user's own (neither flag), Regi = isRegiApproved, Community =
    // shareApproved.
    if (!this.preferences.showMyMeals()) {
      list = list.filter((m) => m.isRegiApproved === true || m.shareApproved === true);
    }
    if (!this.preferences.showCommunityMeals()) {
      list = list.filter((m) => m.shareApproved !== true);
    }
    if (!this.preferences.showRegiApprovedMeals()) {
      list = list.filter((m) => m.isRegiApproved !== true);
    }
    if (q) {
      // Match meal name OR any ingredient. ingredientNames is a space-joined,
      // already-lowercased string of the meal's item food names, populated by
      // the list endpoint (scope=binder/folder). primaryProteinName is kept as a
      // fallback for the rare row that arrives without ingredientNames.
      list = list.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          (m.ingredientNames ?? '').includes(q) ||
          (m.primaryProteinName ?? '').toLowerCase().includes(q),
      );
    }
    // 2nd-level refine: narrow to recipe-linked meals only (any source).
    if (this.onlyWithRecipe()) {
      list = list.filter((m) => (m.recipeLink ?? '').trim() !== '');
    }
    const sort = this.sortBy();
    const sorted = [...list];
    if (sort === 'protein') {
      sorted.sort((a, b) => (b.totalProteinG ?? 0) - (a.totalProteinG ?? 0));
    } else if (sort === 'fiber') {
      sorted.sort((a, b) => (b.totalFiberG ?? 0) - (a.totalFiberG ?? 0));
    } else if (sort === 'date') {
      // Newest created OR modified first (max of the two timestamps).
      const ts = (m: Meal) =>
        Math.max(Date.parse(m.updatedAt ?? '') || 0, Date.parse(m.createdAt ?? '') || 0);
      sorted.sort((a, b) => ts(b) - ts(a));
    } else {
      sorted.sort((a, b) => this.defaultMealOrder(a, b));
    }
    return sorted;
  });

  /** Default order: unnamed "Meal N" first (numeric), then alphabetical by name. */
  private defaultMealOrder(a: Meal, b: Meal): number {
    const na = this.defaultMealNum(a.name);
    const nb = this.defaultMealNum(b.name);
    if (na != null && nb != null) return na - nb;
    if (na != null) return -1;
    if (nb != null) return 1;
    return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
  }

  /** The N from a default "Meal N" name, or null if it's a real (renamed) name. */
  private defaultMealNum(name: string | undefined): number | null {
    const m = /^meal\s+(\d+)$/i.exec((name ?? '').trim());
    return m ? Number(m[1]) : null;
  }

  /** Clear the filter back to its default "show everything" state: reset the
   *  search + sort, re-check all three SHOW source toggles (MyMeals / Regi /
   *  Community — persisted, so this writes through), and collapse every Meal card. */
  clearFilter(): void {
    this.searchText.set('');
    this.onlyWithRecipe.set(false);
    this.sortBy.set(null);
    this.preferences.setShowMyMeals(true);
    this.preferences.setShowRegiApprovedMeals(true);
    this.preferences.setShowCommunityMeals(true);
    this.expandedCards.update((s) => {
      const next = new Set(s);
      for (const key of next) if (key.startsWith('meal-')) next.delete(key);
      return next;
    });
  }

  /** Top-level accordion open state — both default open. */
  readonly binderMenusOpen = signal(false);

  /** Per-card macro-chip expansion, keyed `menu-{id}` / `meal-{id}`. Chips are
   *  hidden by default (calories stay visible as text); a chevron reveals them. */
  private readonly expandedCards = signal<Set<string>>(new Set());

  /** Baseline of Binder meal ids, seeded on first load. Null until seeded so the
   *  initial population doesn't count as "new". Used to detect a freshly created
   *  meal (import / AI / pin) entering the Binder and float it to the top. */
  private knownBinderMealIds: Set<number> | null = null;

  isCardOpen(key: string): boolean {
    return this.expandedCards().has(key);
  }

  /** A meal card is open only when the user has explicitly expanded it. No
   *  sort-driven auto-expansion — it read as confusing. */
  isMealOpen(meal: Meal): boolean {
    return this.expandedCards().has('meal-' + meal.id);
  }

  // ----- Inline rename (pencil → green confirm) ------------------------------
  readonly editingMealId = signal<number | null>(null);
  readonly editDraft = signal('');

  startRename(meal: Meal): void {
    this.editDraft.set(meal.name ?? '');
    this.editingMealId.set(meal.id);
  }

  cancelRename(): void {
    this.editingMealId.set(null);
    this.editDraft.set('');
  }

  async confirmRename(meal: Meal): Promise<void> {
    const name = this.editDraft().trim();
    if (name && name !== meal.name) {
      await this.rotation.updateMealName(meal.id, name);
    }
    this.cancelRename();
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

    // When a freshly created meal enters the Binder — by recipe import, AI
    // create, or pin — force the "Date (newest)" sort so it surfaces at the very
    // top. We only set the sort signal (the Filter dropdown reflects it); we do
    // NOT open the Filter panel. The first non-empty load is the baseline and
    // does not reorder.
    effect(
      () => {
        const meals = this.rotation.binderMeals();
        if (this.knownBinderMealIds === null) {
          if (meals.length > 0) this.knownBinderMealIds = new Set(meals.map((m) => m.id));
          return;
        }
        const hasNew = meals.some((m) => !this.knownBinderMealIds!.has(m.id));
        this.knownBinderMealIds = new Set(meals.map((m) => m.id));
        if (hasNew) this.sortBy.set('date');
      },
      { allowSignalWrites: true },
    );
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
}
