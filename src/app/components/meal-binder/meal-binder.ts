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
      </div>

      <!-- One scrollbar for the whole rail. -->
      <div class="rail-scroll">

        <!-- Menus accordion (top-level; larger header). Starts COLLAPSED. -->
        <div class="rail-section">
          <button type="button" class="section-head" (click)="binderMenusOpen.set(!binderMenusOpen())">
            <mat-icon class="section-icon section-icon-binder">description</mat-icon>
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
                  <!-- Always-visible macro row: P, Fiber, cals — left-aligned. -->
                  <div class="binder-chips card-macros">
                    <span class="chip protein">P {{ round(menu.totalProteinG) }}</span>
                    <span class="chip fiber">F {{ round(menu.totalFiberG) }}</span>
                    <span class="binder-cals">{{ round(menu.totalCalories) }} cals</span>
                  </div>
                  <!-- Reveal: Carbs + Fat align UNDER the row above (quadrant);
                       the delete sits flush right, only visible when dropped down. -->
                  @if (isCardOpen('menu-' + menu.id)) {
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
            <mat-icon class="section-icon section-icon-binder">restaurant</mat-icon>
            <span class="section-label">Meals</span>
            <span class="section-count">({{ rotation.binderMeals().length }})</span>
            <div class="header-toggles">
              <button type="button" class="create-toggle" (click)="toggleCreatePanel()">
                <img src="images/AI-star.png" alt="" class="btn-star" />
                <span class="create-word">Create</span>
                <mat-icon class="create-chevron">{{ createNewOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
              </button>
              <button type="button" class="create-toggle" (click)="toggleFilterPanel()">
                <span class="create-word">Filter</span>
                <mat-icon class="create-chevron">{{ filterOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
              </button>
            </div>
          </div>
          @if (createNewOpen()) {
            <div class="section-body create-body">
              <!-- Generate from the user's picks, with an optional Cuisine.
                   Disabled while a recipe import is in flight. -->
              <div class="ai-body" [class.area-disabled]="uploading()">
                <span class="genmeal-label">Create</span>
                <div class="twist-group">
                  <div class="twist-combo">
                    <input
                      #twistInput
                      type="text"
                      class="twist-input"
                      [value]="twistValue()"
                      placeholder="cuisine"
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
                  <button
                    type="button"
                    class="icon-disc icon-disc-confirm genmeal-go"
                    matTooltip="Meals from Foods you picked"
                    [disabled]="rotation.generating() || uploading()"
                    (click)="rotation.generateMeal()">
                    <mat-icon>check</mat-icon>
                  </button>
                </div>
              </div>
              <div class="or-divider">-or-</div>
              <!-- Import a recipe — drag & drop a file onto the zone, or browse.
                   PDF / JPEG / PNG. -->
              <div
                class="import-dropzone"
                [class.dragging]="dragOver()"
                [class.busy]="uploading()"
                (dragover)="onDragOver($event)"
                (dragleave)="onDragLeave($event)"
                (drop)="onDropFile($event)">
                @if (uploading()) {
                  <img src="images/AI-star.png" alt="" class="dz-ai-spin" />
                  <span class="dz-title">{{ processingMessages[processingMsgIndex()] }}</span>
                } @else {
                  <mat-icon class="dz-icon">note_add</mat-icon>
                  <span class="dz-title">Drag &amp; Drop a Recipe</span>
                  <span class="dz-sub">
                    PDF, JPEG or PNG — or
                    <button type="button" class="dz-link" (click)="recipeInput.click()">browse files</button>
                  </span>
                }
              </div>
              <input
                #recipeInput
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                hidden
                (change)="onRecipeFileSelected(recipeInput)" />
            </div>
          }
          @if (filterOpen()) {
            <!-- Two lines, left-justified:
                   FILTER [search box]
                   SORT   ○ Protein  ○ Fiber            [Clear]
                 Search matches meal name + primary protein (all the list carries);
                 the radios sort the whole list highest-first + auto-expand top 3. -->
            <div class="section-body filter-body">
              <div class="filter-row">
                <span class="filter-label">FILTER</span>
                <input
                  type="text"
                  class="filter-search"
                  placeholder="ingredient or meal keyword"
                  [value]="searchText()"
                  (input)="searchText.set($any($event.target).value)" />
              </div>
              <div class="filter-row">
                <span class="filter-label">SORT</span>
                <label class="sort-opt">
                  <input
                    type="radio"
                    name="binderSort"
                    [checked]="sortBy() === 'protein'"
                    (change)="sortBy.set('protein')" />
                  Protein
                </label>
                <label class="sort-opt">
                  <input
                    type="radio"
                    name="binderSort"
                    [checked]="sortBy() === 'fiber'"
                    (change)="sortBy.set('fiber')" />
                  Fiber
                </label>
                <button type="button" class="filter-clear" (click)="clearFilter()">Clear</button>
              </div>
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
                      <span class="card-thumb card-thumb-empty"></span>
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
                      @if (isMealOpen(meal, i)) {
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
                        [matTooltip]="isMealOpen(meal, i) ? 'Hide macros' : 'Show macros'"
                        (click)="$event.stopPropagation(); toggleCard('meal-' + meal.id)">
                        <mat-icon>{{ isMealOpen(meal, i) ? 'expand_less' : 'expand_more' }}</mat-icon>
                      </button>
                    }
                  </div>
                  <!-- Reveal: all macros in order P, C, F, fiber, cals, then the
                       delete flush right — only visible when dropped down. -->
                  @if (isMealOpen(meal, i)) {
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
  private recipeService = inject(RecipeService);
  private watcher = inject(RecipeImportWatcher);
  private notification = inject(NotificationService);

  /** Single-flight lock for the "From recipe…" button. Goes true on PDF select,
   *  reads "Importing…" while true, and blocks a second import. Released in
   *  EXACTLY two places, one per stage: the finally around the upload POST
   *  (below), and the watcher.settled subscription (in the constructor) for the
   *  background parse. No other code touches it — so it can't be stranded. */
  readonly uploading = signal(false);

  /** Rotating status shown in the drop zone while a recipe is importing. Cycles
   *  through the phases, then repeats, until the import settles. Purely a UI
   *  animation — it does NOT reflect the real backend stage. */
  readonly processingMessages = [
    'AI importing… will take a few minutes',
    'AI processing…',
    'AI ingredient lookup…',
  ];
  readonly processingMsgIndex = signal(0);
  private msgTimer: ReturnType<typeof setInterval> | null = null;

  /** PDF chosen from the "From recipe…" picker — upload it, then watch the import
   *  to completion. The 202 carries the recipeId to poll. The finally releases
   *  the lock for the upload stage on every path (including a failed/errored
   *  upload that never starts a watch); the watcher.settled subscription releases
   *  it for the parse stage. */
  /** True while a file is dragged over the import zone (drives the bloom border). */
  readonly dragOver = signal(false);

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(true);
  }
  onDragLeave(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
  }
  onDropFile(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    void this.importRecipeFile(ev.dataTransfer?.files?.[0] ?? null);
  }

  onRecipeFileSelected(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    input.value = ''; // let the same file be re-picked after a failure
    void this.importRecipeFile(file);
  }

  /** Upload a chosen/dropped recipe file (PDF / JPEG / PNG), then watch the import
   *  to completion. The finally releases the single-flight lock for the upload
   *  stage; watcher.settled releases it for the background parse. */
  private async importRecipeFile(file: File | null): Promise<void> {
    if (!file) return;
    // One recipe at a time — the lock stays held through the whole import
    // (upload + background AI parse), so a second file is gated until the first
    // concludes. The dropzone shows "AI processing…" for the duration.
    if (this.uploading()) {
      this.notification.show('One recipe at a time — please wait for the current import to finish.', 'info');
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      this.notification.show('Please choose a PDF, JPEG, or PNG recipe file.', 'error');
      return;
    }
    this.uploading.set(true);
    try {
      const res = await firstValueFrom(this.recipeService.importRecipe(file));
      if (res?.recipeId != null) {
        // Keep the lock held: watcher.settled releases it when the background
        // parse concludes (parsed / failed / timeout / 404), reverting the
        // dropzone to its active "Drag & Drop" state.
        this.watcher.watch(res.recipeId);
      } else {
        // Nothing to watch — release now.
        this.uploading.set(false);
      }
    } catch {
      this.notification.show('Recipe import failed — could not upload the file.', 'error');
      this.uploading.set(false);
    }
  }

  /** "Create new" accordion — starts COLLAPSED. */
  readonly createNewOpen = signal(false);

  /** "Filter" accordion — starts COLLAPSED. */
  readonly filterOpen = signal(false);

  /** Create + Filter are mutually exclusive — opening one closes the other. */
  toggleCreatePanel(): void {
    this.createNewOpen.update((v) => !v);
    if (this.createNewOpen()) this.filterOpen.set(false);
  }
  toggleFilterPanel(): void {
    this.filterOpen.update((v) => !v);
    if (this.filterOpen()) this.createNewOpen.set(false);
  }

  // ----- Binder Meals filter + sort -----------------------------------------
  /** Keyword typed in the Filter search box (matches name + primary protein). */
  readonly searchText = signal('');
  /** Active sort, or null for the default alphabetical order. Always descending. */
  readonly sortBy = signal<'protein' | 'fiber' | null>(null);
  /** How many top meals auto-expand when a sort is active. */
  private readonly SORT_EXPAND_TOP = 3;

  /** The Meals list as displayed: keyword-filtered, then either sorted by the
   *  chosen macro (descending) or in the default order — default-named meals
   *  ("Meal N") first in numeric order, then everything else alphabetical. */
  readonly displayMeals = computed<Meal[]>(() => {
    const q = this.searchText().trim().toLowerCase();
    let list = this.rotation.binderMeals();
    if (q) {
      list = list.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          (m.primaryProteinName ?? '').toLowerCase().includes(q),
      );
    }
    const sort = this.sortBy();
    const sorted = [...list];
    if (sort === 'protein') {
      sorted.sort((a, b) => (b.totalProteinG ?? 0) - (a.totalProteinG ?? 0));
    } else if (sort === 'fiber') {
      sorted.sort((a, b) => (b.totalFiberG ?? 0) - (a.totalFiberG ?? 0));
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

  /** Reset all filter/sort state and collapse every Meal card. */
  clearFilter(): void {
    this.searchText.set('');
    this.sortBy.set(null);
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

  isCardOpen(key: string): boolean {
    return this.expandedCards().has(key);
  }

  /** A meal card is open if the user expanded it OR a sort is active and it's in
   *  the auto-expanded top N of the sorted list. */
  isMealOpen(meal: Meal, index: number): boolean {
    if (this.expandedCards().has('meal-' + meal.id)) return true;
    return this.sortBy() !== null && index < this.SORT_EXPAND_TOP;
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
    // Parse-stage release of the import lock: the watcher's terminal signal fires
    // once for EVERY import exit (parsed / failed / timeout / 404), so the button
    // can never strand waiting on a branch that doesn't emit a toast event.
    this.watcher.settled
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.uploading.set(false));

    // Cycle the drop-zone status through its phases while an import is in
    // flight; stop and reset when it settles. UI animation only.
    effect(
      () => {
        if (this.uploading()) {
          if (this.msgTimer == null) {
            this.processingMsgIndex.set(0);
            this.msgTimer = setInterval(() => {
              this.processingMsgIndex.update(
                (i) => (i + 1) % this.processingMessages.length,
              );
            }, 6000);
          }
        } else if (this.msgTimer != null) {
          clearInterval(this.msgTimer);
          this.msgTimer = null;
          this.processingMsgIndex.set(0);
        }
      },
      { allowSignalWrites: true },
    );

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

  readonly twistValue = signal('');
  readonly twistOpen = signal(false);
  private twistBeforeCustom = '';
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
      this.twistBeforeCustom = this.twistValue().trim();
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
