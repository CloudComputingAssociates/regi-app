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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@auth0/auth0-angular';
import { RotationService } from '../../services/rotation.service';
import { MealSetService } from '../../services/mealset.service';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';
import { Meal, Menu, MealSetSummary } from '../../models';

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
        <span class="binder-title">My binder</span>
        <!-- Always-on meal search, right-justified with ample gap from the title.
             Matches meal name + any ingredient (same signal the Filter used). -->
        <input
          type="text"
          class="header-search"
          placeholder="Search meals..."
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
            <span class="section-tab menus">
              <span class="section-label">Menus</span>
              <span class="section-count">({{ rotation.binderMenus().length }})</span>
            </span>
            @if (rotation.binderMenus().length) {
              <mat-icon class="section-chevron">{{ binderMenusOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
            }
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
                    <!-- Open-book "menu" glyph — a visible grab handle for the drag. -->
                    <mat-icon class="menu-grip" aria-hidden="true">menu_book</mat-icon>
                    <!-- Non-editable name so the whole card is easy to grab + drag.
                         Rename happens on the board (menu strip) after placing. -->
                    <span
                      class="binder-card-name"
                      [matTooltip]="menuDisplayName(menu)"
                      [matTooltipDisabled]="!rotation.isCardSelected('menu', menu.id ?? -1)"
                      matTooltipClass="binder-name-tip"
                      matTooltipPosition="below"
                      [matTooltipShowDelay]="300">{{ menuDisplayName(menu) }}</span>
                    <!-- Cals moved DOWN into the reveal (next to the discs), matching
                         the meal card. -->
                    <!-- Dropdown chevron on the far right of the name line. -->
                    <button
                      type="button"
                      class="card-toggle"
                      [matTooltip]="isCardOpen('menu-' + menu.id) ? 'Hide macros' : 'Show macros'"
                      (click)="$event.stopPropagation(); toggleCard('menu-' + menu.id)">
                      <mat-icon>{{ isCardOpen('menu-' + menu.id) ? 'expand_less' : 'expand_more' }}</mat-icon>
                    </button>
                  </div>
                  <!-- Collapsed = name only. Expanding reveals all macros (P C F F)
                       and the delete, on ONE aligned row. -->
                  @if (isCardOpen('menu-' + menu.id)) {
                    <div class="binder-chips card-reveal">
                      <span class="chip protein">P {{ round(menu.totalProteinG) }}</span>
                      <span class="chip carb">C {{ round(menu.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(menu.totalFatG) }}</span>
                      <span class="chip fiber">F {{ round(menu.totalFiberG) }}</span>
                      <span class="binder-cals">{{ round(menu.totalCalories) }} cals</span>
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
            <span class="section-tab meals">
              <span class="section-label">Meals</span>
              <span class="section-count">({{ rotation.binderMeals().length }})</span>
            </span>
            <!-- Create: a Material + (add) icon key, same size/shading as the
                 board toolbar keys, sitting right after "Meals (n)" with the same
                 gap the Menus & Meals title has before its keys. Blooms the AI
                 Create Meal overlay over the board. -->
            <button
              type="button"
              class="create-icon-btn"
              matTooltip="Add meals to your Binder"
              matTooltipPosition="above"
              (click)="createMeal.emit()">
              <span class="create-word">Add</span>
              <mat-icon>add</mat-icon>
            </button>
            <!-- Filter stays right-justified. -->
            <button type="button" class="create-toggle filter-toggle" [class.filter-on]="filterActive()" (click)="toggleFilterPanel()">
              <span class="create-word">Filter{{ filterActive() ? ' on' : '' }}</span>
              <mat-icon class="create-chevron">{{ filterOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
            </button>
          </div>
          @if (filterOpen()) {
            <!-- Bordered "Filter" fieldset. My Meals are ALWAYS shown; the
                 multi-select mixes in meals from any of the user's entitled Meal
                 Sets (CTRL-click for multiples — the listbox stays expanded).
                 Clear-all resets to My Meals only. Sort applies to the merged
                 list; search matches meal name + any ingredient. -->
            <div class="section-body filter-body">
              <fieldset class="filter-fieldset">
                <legend>Filter</legend>
                <div class="sort-row">
                  <span class="filter-label">Sort</span>
                  <select
                    class="sort-select"
                    [value]="sortBy() ?? 'none'"
                    (change)="onSortChange($any($event.target).value)">
                    <option value="none">Off</option>
                    <option value="protein">Protein</option>
                    <option value="fiber">Fiber</option>
                    <option value="recipes">Recipes Only</option>
                    <option value="date">By Date</option>
                  </select>
                  <button
                    type="button"
                    class="filter-clear"
                    matTooltip="Remove filters"
                    matTooltipPosition="above"
                    (click)="clearFilter()">
                    <mat-icon>clear_all</mat-icon>
                  </button>
                </div>
                <div class="mealset-row">
                  <label class="filter-label">MealSet</label>
                  @if (entitledSets().length) {
                    <select
                      class="mealset-select"
                      multiple
                      size="4"
                      (change)="onMealSetsChange($any($event.target))">
                      @for (set of entitledSets(); track set.mealSetId) {
                        <option [value]="set.mealSetId" [selected]="isSetSelected(set.mealSetId)">
                          {{ setLabel(set) }}
                        </option>
                      }
                    </select>
                  } @else {
                    <span class="mealset-empty">No MealSets available</span>
                  }
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
                      <!-- Set-sourced meals carry a set badge and are READ-ONLY
                           in place (no rename / delete) — opening + saving one
                           clones it to My Meals via the existing flow. -->
                      @if (meal.mealSetName) {
                        <span class="set-badge" [matTooltip]="'From ' + meal.mealSetName">{{ meal.mealSetName }}</span>
                      }
                      @if (isMealOpen(meal) && !meal.mealSetId) {
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
                      @if (!meal.mealSetId) {
                        <button
                          type="button"
                          class="card-delete icon-disc icon-disc-danger"
                          matTooltip="Delete this meal"
                          (click)="$event.stopPropagation(); onDeleteBinder(meal)">
                          <mat-icon>delete_outline</mat-icon>
                        </button>
                      }
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
                <p class="binder-empty">{{ rotation.binderMeals().length ? 'No filtered results.' : 'No saved Meals.' }}</p>
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
  private mealSetService = inject(MealSetService);
  private auth = inject(AuthService);

  /** Header "Create" button — asks the panel to bloom the AI Create Meal overlay
   *  over the board (the create controls no longer live inline in the rail). */
  readonly createMeal = output<void>();

  /** "Filter" accordion — starts COLLAPSED. */
  readonly filterOpen = signal(false);

  // ----- MealSets: mix entitled sets into the (always-shown) My Meals list ----
  /** The caller's entitled Meal Sets (GET /api/mealset) — the dropdown options. */
  readonly entitledSets = signal<MealSetSummary[]>([]);
  /** Currently chosen set ids; drives mealSetIds on the Binder meal load. */
  readonly selectedSetIds = signal<number[]>([]);

  /** auth0 sub for the per-user selection key; null until resolved. */
  private sub: string | null = null;
  /** Guards a single restore once BOTH the sub and the entitled list are ready. */
  private entitledLoaded = false;
  private selectionRestored = false;

  /** Dropdown label: "Name — genre" when a genre is present, else just the name. */
  setLabel(set: MealSetSummary): string {
    return set.genre ? `${set.name} — ${set.genre}` : set.name;
  }

  isSetSelected(id: number): boolean {
    return this.selectedSetIds().includes(id);
  }

  /** Native multi-select change — CTRL-click keeps the listbox open. Reloads the
   *  Binder as the union of My Meals + the chosen sets, and persists the choice. */
  onMealSetsChange(select: HTMLSelectElement): void {
    const ids = Array.from(select.selectedOptions)
      .map((o) => Number(o.value))
      .filter((n) => !Number.isNaN(n));
    this.selectedSetIds.set(ids);
    this.persistSelected(ids);
    void this.rotation.loadBinder(ids);
  }

  // ---- Per-user persistence of the set selection ----------------------------
  private selectedKey(): string | null {
    return this.sub ? `regi.mealsets.selected.${this.sub}` : null;
  }

  private readSelected(): number[] {
    const key = this.selectedKey();
    if (!key) return [];
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((n) => typeof n === 'number') : [];
    } catch {
      return [];
    }
  }

  private persistSelected(ids: number[]): void {
    const key = this.selectedKey();
    if (!key) return;
    if (ids.length) localStorage.setItem(key, JSON.stringify(ids));
    else localStorage.removeItem(key);
  }

  /** Restore the persisted selection ONCE both the sub and entitled list are
   *  known — pruning ids no longer entitled, then reloading if any survive. */
  private maybeRestoreSelection(): void {
    if (this.selectionRestored || this.sub === null || !this.entitledLoaded) return;
    this.selectionRestored = true;
    const entitled = new Set(this.entitledSets().map((s) => s.mealSetId));
    const pruned = this.readSelected().filter((id) => entitled.has(id));
    this.selectedSetIds.set(pruned);
    this.persistSelected(pruned); // write back the pruned list
    if (pruned.length) void this.rotation.loadBinder(pruned);
  }

  /** Toggle the Filter accordion. Filters only apply while the box is visible —
   *  collapsing it (the up-arrow) removes them (same as "Remove filters"). */
  toggleFilterPanel(): void {
    const willOpen = !this.filterOpen();
    this.filterOpen.set(willOpen);
    if (!willOpen) this.clearFilter();
  }

  // ----- Binder Meals filter + sort -----------------------------------------
  /** Keyword typed in the Filter search box (matches meal name + any ingredient). */
  readonly searchText = signal('');
  /** Active sort/refine mode, or null for the default order. Always descending.
   *  'date' = newest created/modified first — auto-set when a new meal enters the
   *  Binder so the fresh meal surfaces at the very top. 'recipes' is really a
   *  FILTER (narrow to recipe-linked meals) parked in the Sort control to save
   *  vertical space; it doesn't reorder and composes with the SHOW toggles. */
  readonly sortBy = signal<'protein' | 'fiber' | 'date' | 'recipes' | null>(null);

  /** Map the Sort dropdown value to the sort signal. */
  onSortChange(value: string): void {
    this.sortBy.set(
      value === 'protein' ? 'protein' :
      value === 'fiber' ? 'fiber' :
      value === 'recipes' ? 'recipes' :
      value === 'date' ? 'date' : null,
    );
  }

  /** True when the filter is doing anything (not the cleared default): a search
   *  term, an active Sort / Recipes-Only mode, or one or more Meal Sets mixed in.
   *  Drives the "Filter (ON)" label on the header button. */
  readonly filterActive = computed<boolean>(() =>
    this.searchText().trim() !== '' ||
    this.sortBy() !== null ||
    this.selectedSetIds().length > 0,
  );

  /** The Meals list as displayed (My Meals + any mixed-in set meals, straight
   *  from the server), keyword-filtered, then either sorted by the chosen macro /
   *  recipe (descending) or in the default order — default-named meals ("Meal N")
   *  first in numeric order, then alphabetical. */
  readonly displayMeals = computed<Meal[]>(() => {
    const q = this.searchText().trim().toLowerCase();
    let list = this.rotation.binderMeals();
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
    const sort = this.sortBy();
    // "Recipes Only" is a filter dressed as a Sort option: narrow to
    // recipe-linked meals (any source). It doesn't reorder — the default order
    // applies below — and it stacks on top of the SHOW toggles + search.
    if (sort === 'recipes') {
      list = list.filter((m) => (m.recipeLink ?? '').trim() !== '');
    }
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

  /** Clear the filter back to its default state: reset search + sort, drop all
   *  Meal Set selections (→ My Meals only, reloaded), and collapse every card. */
  clearFilter(): void {
    this.searchText.set('');
    this.sortBy.set(null);
    this.selectedSetIds.set([]);
    this.persistSelected([]);
    void this.rotation.loadBinder([]);
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

    // Resolve the auth0 sub for the per-user MealSet selection key, then restore
    // the saved selection once the entitled list has also loaded.
    this.auth.user$.pipe(takeUntilDestroyed()).subscribe((u) => {
      this.sub = u?.sub ?? null;
      this.maybeRestoreSelection();
    });
  }

  ngOnInit(): void {
    this.rotation.loadBinder();
    this.rotation.loadBinderMenus();
    // Entitled Meal Sets drive the filter dropdown; restore the saved selection
    // once loaded (guarded so it runs after the sub is also known).
    this.mealSetService.getEntitled().subscribe({
      next: (sets) => {
        this.entitledSets.set(sets ?? []);
        this.entitledLoaded = true;
        this.maybeRestoreSelection();
      },
      error: () => {
        this.entitledSets.set([]);
        this.entitledLoaded = true;
        this.maybeRestoreSelection();
      },
    });
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
