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
import { UserProfileService } from '../../services/user-profile.service';
import { RotationService } from '../../services/rotation.service';
import { TabService } from '../../services/tab.service';
import { MealSetService } from '../../services/mealset.service';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';
import { ShoppingPanelComponent } from '../shopping-panel/shopping-panel';
import { Meal, Menu, MealSetSummary } from '../../models';

@Component({
  selector: 'app-meal-binder',
  imports: [DragDropModule, MatTooltipModule, MatIconModule, ShoppingPanelComponent],
  // Releasing the mouse anywhere cancels the "drag" encourager hint.
  host: { '(document:mouseup)': 'clearDragHint()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="binder">
      <!-- Title line: "Meals" + right-justified AI toggle (star + chevron). The
           AI controls live in the collapsible AI accordion below, toggled here. -->
      <div class="binder-header">
        <span class="binder-title">{{ notebookTitle() }}</span>
        <!-- Red X disc — closes (slides off) the Notebook, top-right corner. -->
        <button
          type="button"
          class="dialog-disc dialog-disc-cancel on-light binder-close-disc"
          matTooltip="Close Notebook"
          matTooltipPosition="below"
          aria-label="Close Notebook"
          (click)="rotation.hideBinder()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- One scrollbar for the whole rail. -->
      <div class="rail-scroll">

        <!-- Meals · Menus · Shopping as real side-by-side tabs. The active tab's
             content fills the single sheet below. Meals is first (the landing tab);
             Shopping is generated from the meals when its tab is shown. -->
        <div class="binder-tabs" role="tablist">
          <button
            type="button"
            class="binder-tab meals"
            role="tab"
            [class.active]="activeTab() === 'meals'"
            [attr.aria-selected]="activeTab() === 'meals'"
            (click)="activeTab.set('meals')">
            <span class="section-label">meals</span>
            <span class="section-count">({{ rotation.binderMeals().length }})</span>
          </button>
          <button
            type="button"
            class="binder-tab menus"
            role="tab"
            [class.active]="activeTab() === 'menus'"
            [attr.aria-selected]="activeTab() === 'menus'"
            (click)="activeTab.set('menus')">
            <span class="section-label">menus</span>
            <span class="section-count">({{ rotation.binderMenus().length }})</span>
          </button>
          <button
            type="button"
            class="binder-tab shopping"
            role="tab"
            [class.active]="activeTab() === 'shopping'"
            [attr.aria-selected]="activeTab() === 'shopping'"
            (click)="activeTab.set('shopping')">
            <span class="section-label">$ buy</span>
            @if (rotation.shoppingItemCount() !== null) {
              <span class="section-count">({{ rotation.shoppingItemCount() }})</span>
            }
          </button>
        </div>

        @if (activeTab() === 'menus') {
          <div class="rail-section">
            @if (rotation.binderMenus().length > 1) {
              <!-- Icon-only sort squares: alphabetical (A–Z toggle) + date (newest
                   first toggle). Default is A–Z so menus read Menu 1, Menu 2, … -->
              <div class="binder-sort-row">
                <button
                  type="button"
                  class="sort-square"
                  [class.active]="menuSortKind() === 'alpha'"
                  [matTooltip]="menuSort() === 'za' ? 'Sorted Z→A' : 'Sorted A→Z'"
                  matTooltipPosition="above"
                  (click)="toggleAlphaSort()">
                  <mat-icon [class.flip]="menuSort() === 'za'">sort_by_alpha</mat-icon>
                </button>
                <button
                  type="button"
                  class="sort-square"
                  [class.active]="menuSortKind() === 'date'"
                  [matTooltip]="menuSort() === 'oldest' ? 'Oldest first' : 'Newest first'"
                  matTooltipPosition="above"
                  (click)="toggleDateSort()">
                  <mat-icon>{{ menuSort() === 'oldest' ? 'arrow_upward' : menuSort() === 'newest' ? 'arrow_downward' : 'swap_vert' }}</mat-icon>
                </button>
              </div>
            }
            <div class="section-body" cdkDropList>
              @for (menu of displayBinderMenus(); track menu.id) {
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
                      <span class="binder-cals">{{ round(menu.totalCalories) }} cals</span>
                      <span class="chip protein">P {{ round(menu.totalProteinG) }}</span>
                      <span class="chip carb">C {{ round(menu.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(menu.totalFatG) }}</span>
                      <span class="chip fiber">F {{ round(menu.totalFiberG) }}</span>
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
          </div>
        } @else if (activeTab() === 'meals') {
          <!-- Meals tab controls: one row — Sort · Filter · ＋ Add meals (left) ·
               collapse-all (right). Search now lives INSIDE the Filter panel. -->
          <div class="rail-section">
            <div class="meals-controls">
              <div class="meals-ctrl-row meals-ctrl-actions">
                <!-- Order: + Add meals · Filter (middle) · Sort. -->
                <button
                  type="button"
                  class="create-toggle add-meals-btn"
                  matTooltip="Add meals to your notebook"
                  matTooltipPosition="above"
                  (click)="createMeal.emit()">
                  <mat-icon>add</mat-icon><span class="create-word">Add meals</span>
                </button>
                <button type="button" class="create-toggle filter-toggle" [class.filter-on]="filterActive()" (click)="toggleFilterPanel()">
                  <span class="create-word">Filter{{ filterActive() ? ' on' : '' }}</span>
                  <mat-icon class="create-chevron">{{ filterOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
                </button>
                <!-- Sort — first-class control (independent of Filter; sorts within
                     whatever the filter shows). Starts Off. -->
                <label class="sort-inline">
                  <span class="sort-inline-label">Sort</span>
                  <select
                    class="sort-inline-select"
                    [value]="sortBy() ?? 'none'"
                    (change)="onSortChange($any($event.target).value)">
                    <option value="none">Off</option>
                    <option value="protein">Protein</option>
                    <option value="fiber">Fiber</option>
                    <option value="recipes">Recipes</option>
                    <option value="date">By Date</option>
                    <option value="newest">Newest</option>
                  </select>
                </label>
                <button
                  type="button"
                  class="collapse-all-btn"
                  matTooltip="Collapse all"
                  matTooltipPosition="below"
                  (click)="collapseAll()">
                  <mat-icon>unfold_less</mat-icon>
                </button>
              </div>
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
                <!-- Search is a filtration — the FIRST control inside the filter.
                     Clear-filter (right) resets search + MealSet (not Sort). -->
                <div class="filter-search-row">
                  <input
                    type="text"
                    class="filter-search"
                    placeholder="Search meals..."
                    matTooltip="Search a meal by name, or type any ingredient"
                    matTooltipPosition="above"
                    [value]="searchText()"
                    (input)="searchText.set($any($event.target).value)"
                    (keydown.enter)="filterOpen.set(false)" />
                  <button
                    type="button"
                    class="filter-clear"
                    matTooltip="Clear filter"
                    matTooltipPosition="above"
                    (click)="clearFilter()">
                    <mat-icon>filter_alt_off</mat-icon>
                  </button>
                </div>
                <!-- MealSet filter — narrow to meals from one of your MealSets. Shown
                     only when loaded meals carry a sourceMealSetId. Snaps the filter
                     panel closed on select (compound filters: reopen + pick again). -->
                @if (sourceSetOptions().length) {
                  <div class="mealset-row">
                    <label class="filter-label">MealSet</label>
                    <select
                      class="sort-select"
                      [value]="sourceSetFilter()"
                      (change)="onSourceSetChange($any($event.target).value)">
                      <option value="all">All</option>
                      @for (opt of sourceSetOptions(); track opt.id) {
                        <option [value]="opt.id">{{ opt.name }}</option>
                      }
                    </select>
                    <!-- Only when a specific set is chosen: wipe all its materialized
                         meals from the binder (ownership unaffected). -->
                    @if (selectedSourceSet(); as sel) {
                      <button
                        type="button"
                        class="wipe-set-btn"
                        matTooltip="Remove MealSet meals from your notebook. You own them to re-add back at any time."
                        matTooltipPosition="above"
                        (click)="onWipeMealSet(sel)">
                        <mat-icon>delete</mat-icon>
                      </button>
                    }
                  </div>
                }
                <!-- Meal Type filter — snaps the panel closed on select too. -->
                <div class="mealset-row">
                  <label class="filter-label">Type</label>
                  <select
                    class="sort-select"
                    [value]="mealTypeFilter()"
                    (change)="onMealTypeFilterChange($any($event.target).value); filterOpen.set(false)">
                    <option value="all">All types</option>
                    @for (t of rotation.mealTypeOptions; track t) {
                      <option [value]="t">{{ t }}</option>
                    }
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
                  matTooltip="Drag a meal to a meal slot, or double-click"
                  matTooltipPosition="above"
                  [matTooltipShowDelay]="400"
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
                        [matTooltip]="capName(meal.name)"
                        [matTooltipDisabled]="!rotation.isCardSelected('meal', meal.id)"
                        matTooltipClass="binder-name-tip"
                        matTooltipPosition="below"
                        [matTooltipShowDelay]="300">{{ capName(meal.name) }}</span>
                      <!-- Set-sourced meals carry a set badge and are READ-ONLY
                           in place (no rename / delete) — opening + saving one
                           clones it to My Meals via the existing flow. -->
                      @if (meal.mealSetName) {
                        <span class="set-badge" [matTooltip]="'From ' + meal.mealSetName">{{ meal.mealSetName }}</span>
                      }
                      <!-- Provenance badge: this OWNED meal was materialized from a
                           MealSet (sourceMealSetId). Reuses the set-badge chip. -->
                      @if (meal.sourceMealSetId != null) {
                        <span class="set-badge" [matTooltip]="'From MealSet: ' + meal.sourceMealSetName">{{ meal.sourceMealSetName }}</span>
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
                  <!-- Meal TYPE assignment lives on the meal card (back face), not
                       here — removed from the notebook card as redundant. -->

                  <!-- Reveal: all macros in order P, C, F, fiber, cals, then the
                       delete flush right — only visible when dropped down. -->
                  @if (isMealOpen(meal)) {
                    <div class="binder-chips card-reveal">
                      <span class="binder-cals">{{ round(meal.totalCalories) }} cals</span>
                      <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
                      <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
                      <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
                      <!-- Action discs — ONE right-aligned row of uniform 24px discs:
                           Print (PDF) · Restore · Delete, all the same outline style
                           (colored glyph, fills on hover). Restore shows ONLY when a
                           set meal has DIVERGED (the user edited it). -->
                      <span class="card-actions">
                        @if (meal.recipeLink?.trim()) {
                          <button type="button" class="card-pdf icon-disc"
                            matTooltip="Open PDF"
                            (click)="$event.stopPropagation(); openRecipe(meal.recipeLink)">
                            <mat-icon>print</mat-icon>
                          </button>
                        }
                        @if (meal.sourceMealSetId != null && rotation.isDiverged(meal)) {
                          <button type="button" class="card-restore icon-disc icon-disc-edit"
                            matTooltip="Restore to the MealSet original"
                            (click)="$event.stopPropagation(); onRestoreMeal(meal)">
                            <mat-icon>restore</mat-icon>
                          </button>
                        }
                        @if (!meal.mealSetId) {
                          <button type="button" class="card-delete icon-disc icon-disc-danger"
                            matTooltip="Delete this meal"
                            (click)="$event.stopPropagation(); onDeleteBinder(meal)">
                            <mat-icon>delete_outline</mat-icon>
                          </button>
                        }
                      </span>
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
        } @else {
          <!-- Shopping tab — the list is generated from the current menus' meals
               (the panel refetches off the rotation). Controls + Print live in the
               panel's own compact top row. -->
          <div class="rail-section shopping-section">
            <app-shopping-panel />
          </div>
        }

      </div>
    </div>
  `,
  styleUrls: ['./meal-binder.scss'],
})
export class MealBinderComponent implements OnInit {
  readonly rotation = inject(RotationService);
  private tabs = inject(TabService);
  private dialog = inject(MatDialog);
  private host = inject(ElementRef<HTMLElement>);
  private mealSetService = inject(MealSetService);
  private auth = inject(AuthService);
  private userProfile = inject(UserProfileService);

  /** Open a meal's source recipe PDF in the in-app web viewer (same as the slot). */
  openRecipe(url: string | null | undefined): void {
    // In-app viewer overlay — renders the PDF via Google's Docs Viewer (server-side
    // fetch), the only path that displays these download-served, CORS-blocked GCS
    // PDFs inline instead of downloading them.
    if (url?.trim()) this.tabs.openWebView(url.trim());
  }

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

  /** Dropdown label: "Name — genres" when any genre is present, else just the name. */
  setLabel(set: MealSetSummary): string {
    const g = (set.genres ?? []).join(', ');
    return g ? `${set.name} — ${g}` : set.name;
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
    // Either/or: turning ON the mix-in clears the "From MealSet" provenance filter.
    if (ids.length > 0) this.sourceSetFilter.set('all');
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
  readonly sortBy = signal<'protein' | 'fiber' | 'date' | 'newest' | 'recipes' | null>(null);

  /** Map the Sort dropdown value to the sort signal. */
  onSortChange(value: string): void {
    this.sortBy.set(
      value === 'protein' ? 'protein' :
      value === 'fiber' ? 'fiber' :
      value === 'recipes' ? 'recipes' :
      value === 'date' ? 'date' :
      value === 'newest' ? 'newest' : null,
    );
  }

  // ----- MealSet PROVENANCE filter (owned meals materialized FROM a set) ------
  /** Selected source-MealSet id, or 'all' (default). DISTINCT from the entitled-
   *  sets multi-select above: that mixes catalog set meals in via the server;
   *  THIS narrows the loaded list to owned meals whose sourceMealSetId matches. */
  readonly sourceSetFilter = signal<number | 'all'>('all');

  /** Distinct (id, name) source-MealSets across the loaded binder meals, sorted
   *  by name. Empty when no loaded meal carries sourceMealSetId — the row is then
   *  not shown (the entitled-sets row keeps its "No MealSets available" state). */
  readonly sourceSetOptions = computed<{ id: number; name: string }[]>(() => {
    const seen = new Map<number, string>();
    for (const m of this.rotation.binderMeals()) {
      if (m.sourceMealSetId != null && !seen.has(m.sourceMealSetId)) {
        seen.set(m.sourceMealSetId, m.sourceMealSetName ?? `Set ${m.sourceMealSetId}`);
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  });

  /** Map the "From MealSet" dropdown value to the provenance filter signal. */
  onSourceSetChange(value: string): void {
    const sel = value === 'all' ? 'all' : Number(value);
    this.sourceSetFilter.set(sel);
    // Rollup EXCEPTION: picking a specific MealSet reveals its trash (remove-from-
    // notebook) inside the panel — DON'T snap the filter closed, or the user never
    // sees it. It stays open (and applied); "All" behaves normally and closes.
    if (sel === 'all') this.filterOpen.set(false);
    // Either/or: choosing a "From MealSet" filter turns OFF the mix-in (reload as
    // My Meals only) so the two are never combined.
    if (sel !== 'all' && this.selectedSetIds().length > 0) {
      this.selectedSetIds.set([]);
      this.persistSelected([]);
      void this.rotation.loadBinder([]);
    }
  }

  /** Meal-type filter (from the Filter panel); 'all' = no filter. */
  readonly mealTypeFilter = signal<string>('all');
  onMealTypeFilterChange(value: string): void {
    this.mealTypeFilter.set(value || 'all');
  }

  /** The selected source-set (id, name, and count of loaded binder meals from it),
   *  or null when "All" is selected — gates + feeds the "Remove all" action. */
  readonly selectedSourceSet = computed<{ id: number; name: string; count: number } | null>(() => {
    const sel = this.sourceSetFilter();
    if (sel === 'all') return null;
    const opt = this.sourceSetOptions().find((o) => o.id === sel);
    if (!opt) return null;
    const count = this.rotation.binderMeals().filter((m) => m.sourceMealSetId === sel).length;
    return { id: opt.id, name: opt.name, count };
  });

  /** Remove ALL binder meals materialized from the selected set — confirm first
   *  (placements clear + edits lost; ownership is untouched). On confirm, wipe via
   *  the service then reset the provenance filter back to All. */
  onWipeMealSet(sel: { id: number; name: string; count: number }): void {
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        message: `Remove all ${sel.count} meals from ${sel.name} from your binder? Your edits to them will be lost. You still own this MealSet and can re-download it anytime from the MealSets marketplace.`,
        confirmLabel: 'Remove all',
        onConfirm: async () => {
          await this.rotation.wipeMealSet(sel.id);
          this.sourceSetFilter.set('all');
        },
      },
    });
  }

  /** True when the filter is doing anything (not the cleared default): a search
   *  term, an active Sort / Recipes-Only mode, or one or more Meal Sets mixed in.
   *  Drives the "Filter (ON)" label on the header button. */
  // "Filter on" reflects only actual FILTERS (search + MealSet) — NOT Sort, which is
  // a separate first-class control.
  readonly filterActive = computed<boolean>(() =>
    this.searchText().trim() !== '' ||
    this.selectedSetIds().length > 0 ||
    this.sourceSetFilter() !== 'all' ||
    this.mealTypeFilter() !== 'all',
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
    // De-dupe against your OWN copies. When a purchased set is mixed in and you
    // already have your own materialized copy of a meal (it carries a
    // sourceMealSetId backlink — and possibly your edited quantities), show ONLY
    // that owned copy and drop the raw mixed-in set meal, so it isn't listed
    // twice. Match on (set id + name), the only shared key the meals carry.
    const ownedFromSet = new Set(
      list
        .filter((m) => m.sourceMealSetId != null)
        .map((m) => `${m.sourceMealSetId}:${(m.name ?? '').trim().toLowerCase()}`),
    );
    if (ownedFromSet.size > 0) {
      list = list.filter(
        (m) =>
          !(
            m.mealSetId != null &&
            m.sourceMealSetId == null &&
            ownedFromSet.has(`${m.mealSetId}:${(m.name ?? '').trim().toLowerCase()}`)
          ),
      );
    }
    // Provenance filter: narrow to owned meals materialized from the chosen set.
    const setSel = this.sourceSetFilter();
    if (setSel !== 'all') {
      list = list.filter((m) => m.sourceMealSetId === setSel);
    }
    // Meal-type filter.
    const typeSel = this.mealTypeFilter();
    if (typeSel !== 'all') {
      list = list.filter((m) => (m.mealType ?? '').trim() === typeSel);
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
    } else if (sort === 'newest') {
      // Strictly createdAt descending; a missing createdAt (0) sorts LAST.
      const ct = (m: Meal) => Date.parse(m.createdAt ?? '') || 0;
      sorted.sort((a, b) => ct(b) - ct(a));
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

  /** Clear the FILTER back to default: reset search, drop all Meal Set selections
   *  (→ My Meals only, reloaded), collapse every card, and close the filter region.
   *  Sort is now a first-class control OUTSIDE the filter — deliberately NOT reset
   *  here, so a sort survives a filter clear (they work in conjunction). */
  clearFilter(): void {
    this.searchText.set('');
    this.sourceSetFilter.set('all');
    this.mealTypeFilter.set('all');
    this.selectedSetIds.set([]);
    this.persistSelected([]);
    void this.rotation.loadBinder([]);
    this.filterOpen.set(false);
    this.expandedCards.update((s) => {
      const next = new Set(s);
      for (const key of next) if (key.startsWith('meal-')) next.delete(key);
      return next;
    });
  }

  /** Restore a set-materialized meal to its MealSet original — confirm first, the
   *  edits are discarded. The service's 200 merge refreshes the card. */
  onRestoreMeal(meal: Meal): void {
    if (meal.id == null) return;
    const id = meal.id;
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        message: `Restore this meal to the original from ${meal.sourceMealSetName}? Your changes to it will be lost.`,
        confirmLabel: 'Restore original',
        onConfirm: () => void this.rotation.restoreMeal(id),
      },
    });
  }


  /** Top-level accordion open state — both default open. */
  readonly binderMenusOpen = signal(false);

  /** Active Notebook tab. Meals · Menus · Shopping render as real side-by-side
   *  tabs; this drives which one's content fills the sheet. Meals is the default
   *  landing tab. Shopping generates its list from the meals when shown. */
  readonly activeTab = signal<'meals' | 'menus' | 'shopping'>('meals');


  // ----- Binder MENUS sort (icon-only squares) -------------------------------
  /** Active menu sort. Default 'az' so the list reads Menu 1, Menu 2, … */
  readonly menuSort = signal<'az' | 'za' | 'newest' | 'oldest'>('az');
  /** Which square is "active" — for the highlight. */
  readonly menuSortKind = computed<'alpha' | 'date'>(() =>
    this.menuSort() === 'az' || this.menuSort() === 'za' ? 'alpha' : 'date',
  );

  /** Alpha square: switch to alphabetical, toggling A→Z ↔ Z→A. */
  toggleAlphaSort(): void {
    this.menuSort.update((s) => (s === 'az' ? 'za' : 'az'));
  }
  /** Date square: switch to date, toggling newest ↔ oldest. */
  toggleDateSort(): void {
    this.menuSort.update((s) => (s === 'newest' ? 'oldest' : 'newest'));
  }

  /** Binder menus in display order per the active sort square (default A→Z). */
  readonly displayBinderMenus = computed<Menu[]>(() => {
    const list = [...this.rotation.binderMenus()];
    const s = this.menuSort();
    const name = (m: Menu) => this.menuDisplayName(m).toLowerCase();
    const ct = (m: Menu) => Date.parse(m.createdAt ?? '') || 0;
    if (s === 'za') return list.sort((a, b) => name(b).localeCompare(name(a)));
    if (s === 'newest') return list.sort((a, b) => ct(b) - ct(a));
    if (s === 'oldest') return list.sort((a, b) => ct(a) - ct(b));
    return list.sort((a, b) => name(a).localeCompare(name(b))); // 'az' default
  });

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

  /** Collapse everything: every expanded menu/meal card's macro-reveal AND the
   *  whole Menus accordion. */
  collapseAll(): void {
    this.expandedCards.set(new Set());
    this.binderMenusOpen.set(false);
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
    // The Menus toolbar (or elsewhere) can request a specific Notebook tab — e.g.
    // the Shopping key opens the Binder and focuses Shopping. Consume + reset.
    effect(
      () => {
        const tab = this.rotation.requestedBinderTab();
        if (tab == null) return;
        this.activeTab.set(tab);
        this.rotation.requestedBinderTab.set(null);
      },
      { allowSignalWrites: true },
    );

    // Mirror the active tab into the service so toolbar keys can toggle a tab
    // open/closed (they can't read this component's local signal directly).
    effect(
      () => this.rotation.activeBinderTab.set(this.activeTab()),
      { allowSignalWrites: true },
    );

    // When a menu is pinned, the service sets revealBinderMenuId. Expand the
    // Menus accordion and scroll the new entry into view.
    effect(
      () => {
        const id = this.rotation.revealBinderMenuId();
        if (id == null) return;
        this.binderMenusOpen.set(true);
        this.activeTab.set('menus'); // surface the newly pinned menu on its tab
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
      this.displayName.set(u?.name?.trim() ?? '');
      this.maybeRestoreSelection();
    });
  }

  /** Auth0's name/email — the fallback when the user hasn't set a display name.
   *  Empty until auth resolves. */
  readonly displayName = signal<string>('');
  /** The notebook title prefers the user's EDITED display name (set in Account →
   *  "Marty's Notebook") over Auth0's raw name/email, and updates live when the
   *  name changes. Falls back to plain "Notebook" when neither is known. */
  readonly notebookTitle = computed<string>(() => {
    const name = this.userProfile.displayName() || this.displayName();
    return name ? `${name}'s Notebook` : 'Notebook';
  });

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

  /** Deleting a Binder menu removes ONLY the menu (and its slotting) — the saved
   *  meals stay in the Notebook and are deleted separately by the user. */
  onDeleteBinderMenu(menu: Menu): void {
    const id = menu.id;
    if (id == null) return;
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        message: `Delete "${menu.name}"?`,
        confirmLabel: 'Delete',
        onConfirm: () => void this.rotation.deleteBinderMenu(id, false),
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
    if (meal.id == null) return;
    // In a menu? Menus are throwaway — deleting the meal takes its menu(s) with it
    // (the menu's other meals survive in the notebook). One plain Yes/Cancel.
    if (this.rotation.menusContainingMeal(meal.id).length > 0) {
      const mealId = meal.id;
      this.dialog.open(WipeConfirmDialogComponent, {
        panelClass: 'wipe-dialog-panel',
        data: {
          title: `Delete "${meal.name}"`,
          message: "If you delete this meal, we'll delete the Menu containing it as well.",
          confirmLabel: 'Yes',
          onConfirm: () => void this.rotation.deleteMealAndContainingMenus(mealId),
        },
      });
      return;
    }
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

  /** Display an ALL-CAPS name in Initial Caps (title case); leave mixed-case as-is. */
  capName(name: string | null | undefined): string {
    const n = (name ?? '').trim();
    if (n && !/[a-z]/.test(n) && /[A-Z]/.test(n)) {
      return n.toLowerCase().replace(/\b([a-z])/g, (_m, c: string) => c.toUpperCase());
    }
    return name ?? '';
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
