// src/app/components/mealsets-panel/mealsets-panel.ts
//
// MealSetOwner authoring surface. Left-nav "MealSets" entry mounts this panel
// (gated on the MealSetOwner role — cosmetic; the server enforces it). Sections:
//   - Author profile (bio / credentials / author pic upload)
//   - Read-only revenue-share deal (hidden when there's no contract)
//   - "My Sets" list + create/edit form (name, description, genre, 4 pics, 1 video)
//   - Per-set meal picker (assign/unassign the author's own meals via junctions)
// All writes go straight to the API — no client caching. "Rotation" never appears.
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@auth0/auth0-angular';
import { TabService } from '../../services/tab.service';
import { NotificationService } from '../../services/notification.service';
import { MealSetService } from '../../services/mealset.service';
import { RecipeAuthoringService } from '../../services/recipe-authoring.service';
import { RecipeService } from '../../services/recipe.service';
import { RecipeImportWatcher } from '../../services/recipe-import-watcher.service';
import { ImageDropComponent } from '../image-drop/image-drop';
import {
  MealSet,
  MealSetContractView,
  CreateMealSetRequest,
  UpdateMealSetRequest,
  Meal,
  RecipeSummary,
} from '../../models';

/** Editor draft — mirrors the author-writable set fields, plus the display-only
 *  price/active shown non-editable. mealSetId null = creating a new set. */
interface SetDraft {
  mealSetId: number | null;
  name: string;
  description: string;
  genres: string[];
  pics: [string, string, string, string];
  video1: string;
  price: number;
  active: boolean;
}

@Component({
  selector: 'app-mealsets-panel',
  imports: [DatePipe, MatIconModule, MatTooltipModule, DragDropModule, ImageDropComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="msp">
      <header class="msp-header">
        <span class="msp-title"><mat-icon class="msp-title-icon">restaurant_menu</mat-icon>Author Studio</span>
        <button
          type="button"
          class="msp-close"
          matTooltip="Close MealSets"
          matTooltipPosition="below"
          (click)="tabService.closePanel()">
          <mat-icon>logout</mat-icon>
        </button>
      </header>

      <div class="msp-body">
        <!-- ============ Author profile ============ -->
        <section class="msp-card">
          <div class="msp-card-head">
            <h3 class="msp-card-title">Author profile
              <span
                class="msp-info"
                matTooltip="Fill in required fields, and save before you can add MealSets. Information is displayed in the MealSet Gallery on RegiMenu's Website — the area for purchasing MealSets."
                matTooltipPosition="right">&#9432;</span>
            </h3>
            @if (profileSaved()) {
              <button
                type="button"
                class="msp-collapse"
                [matTooltip]="profileCollapsed() ? 'Expand profile' : 'Collapse profile'"
                (click)="profileCollapsed.set(!profileCollapsed())">
                <mat-icon>{{ profileCollapsed() ? 'expand_more' : 'expand_less' }}</mat-icon>
              </button>
            }
          </div>
          @if (profileCollapsed()) {
            <div class="msp-collapsed-summary">{{ profileAuthorName() || accountName() || 'Your profile' }}</div>
          } @else {
          <label class="msp-field">
            <span class="msp-label">Author name <span class="msp-req">* required</span></span>
            <input
              class="msp-input"
              type="text"
              [placeholder]="accountName() || 'Your display name'"
              [value]="profileAuthorName()"
              (input)="profileAuthorName.set($any($event.target).value)" />
          </label>
          <label class="msp-field">
            <span class="msp-label">Bio <span class="msp-req">* required</span></span>
            <textarea
              class="msp-input msp-textarea"
              rows="2"
              [value]="profileBio()"
              (input)="profileBio.set($any($event.target).value)"></textarea>
          </label>
          <label class="msp-field">
            <span class="msp-label">Credentials <span class="msp-opt">(optional)</span></span>
            <textarea
              class="msp-input msp-textarea"
              rows="2"
              [value]="profileCredentials()"
              (input)="profileCredentials.set($any($event.target).value)"></textarea>
          </label>
          <div class="msp-field">
            <span class="msp-label">Author photo <span class="msp-req">* required</span></span>
            <app-image-drop name="author" [value]="profilePic()" (valueChange)="profilePic.set($event)" />
          </div>

          <label class="msp-field">
            <span class="msp-label">Backlink URL<span
                class="msp-info"
                matTooltip="Use Backlink to your Amazon book, your services website, or your YouTube channel"
                matTooltipPosition="right">&#9432;</span> <span class="msp-opt">(optional)</span></span>
            <input
              class="msp-input"
              type="url"
              placeholder="https://your-site-or-social"
              [value]="backLink()"
              (input)="backLink.set($any($event.target).value)" />
          </label>
          <div class="msp-field">
            <span class="msp-label">Backlink photo <span class="msp-opt">(optional)</span></span>
            <app-image-drop name="backlink" [value]="backLinkPhoto()" (valueChange)="backLinkPhoto.set($event)" />
          </div>

          <div class="msp-actions">
            <button type="button" class="msp-btn primary" [disabled]="savingProfile()" (click)="saveProfile()">
              {{ savingProfile() ? 'Saving…' : 'Save profile' }}
            </button>
          </div>
          }
        </section>

        <!-- ============ Read-only deal (hidden with no contract) ============ -->
        @if (contract(); as c) {
          <section class="msp-card msp-deal">
            <h3 class="msp-card-title">Your deal</h3>
            <div class="msp-deal-row">
              <span class="msp-label">Revenue share</span>
              <span class="msp-deal-val">{{ c.revSharePercent != null ? c.revSharePercent + '%' : '—' }}</span>
            </div>
            <div class="msp-deal-row">
              <span class="msp-label">Pricing terms</span>
              <span class="msp-deal-val">{{ c.pricingTerms || '—' }}</span>
            </div>
            @if (c.status) {
              <div class="msp-deal-row">
                <span class="msp-label">Status</span>
                <span class="msp-deal-val">{{ c.status }}</span>
              </div>
            }
          </section>
        }

        <!-- ============ My Sets ============ -->
        <!-- Whole section greyed + inert until a complete profile is saved (the
             title, (i) tooltip and button are ALL disabled, not just the button). -->
        <section class="msp-card" [class.msp-disabled]="!profileComplete()">
          <div class="msp-card-head">
            <h3 class="msp-card-title">My MealSets
              <span
                class="msp-info"
                matTooltip="MealSets require you to have created meals already. If you haven't, go to Menus & Meals and import from recipes or composite your meals first."
                matTooltipPosition="right">&#9432;</span>
            </h3>
            <button
              type="button"
              class="msp-btn primary"
              [disabled]="!profileComplete()"
              [matTooltip]="profileComplete() ? '' : 'Save a complete Author profile (Bio + photo) to create a MealSet'"
              matTooltipPosition="above"
              (click)="startCreate()">+ New MealSet</button>
          </div>
          @if (authoredSets().length) {
            <ul class="msp-set-list">
              @for (s of authoredSets(); track s.mealSetId) {
                <li
                  class="msp-set-item"
                  [class.selected]="draft()?.mealSetId === s.mealSetId"
                  (click)="editSet(s)">
                  <span class="msp-set-name">{{ s.name }}</span>
                  @if (s.genres.length) {
                    <span class="msp-set-genres">
                      @for (g of s.genres; track g) { <span class="msp-set-genre">{{ g }}</span> }
                    </span>
                  }
                  <span class="msp-set-flags">
                    <span
                      class="msp-flag"
                      [class.on]="s.active"
                      matTooltip="Active status is admin-set (catalog visibility)"
                      matTooltipPosition="above">{{ s.active ? 'Active' : 'Inactive' }}</span>
                    <span class="msp-flag price">{{ s.price > 0 ? ('$' + s.price) : 'Free' }}</span>
                  </span>
                </li>
              }
            </ul>
          } @else {
            <p class="msp-empty">No sets yet — create your first.</p>
          }
        </section>

        <!-- ============ Set editor ============ -->
        @if (draft(); as d) {
          <section class="msp-card msp-editor">
            <div class="msp-editor-head">
              <h3 class="msp-card-title">{{ d.mealSetId ? 'Edit MealSet' : 'New MealSet' }}</h3>
              <span class="msp-editor-hint">Enter Marketing info for Website promotion and display</span>
            </div>
            <label class="msp-field">
              <span class="msp-label">Name</span>
              <input class="msp-input" type="text" placeholder="e.g. Keto-friendly, high-protein" [value]="d.name" (input)="setField('name', $any($event.target).value)" />
            </label>
            <label class="msp-field">
              <span class="msp-label">Description</span>
              <textarea class="msp-input msp-textarea" rows="2" [value]="d.description"
                (input)="setField('description', $any($event.target).value)"></textarea>
            </label>
            <div class="msp-field">
              <span class="msp-label">Genres</span>
              <div class="msp-chips">
                @for (g of d.genres; track g; let i = $index) {
                  <span class="msp-chip">{{ g }}<button type="button" class="msp-chip-x" (click)="removeGenre(i)" aria-label="Remove genre">×</button></span>
                }
                <input
                  class="msp-input msp-chip-input"
                  type="text"
                  list="msp-genre-suggestions"
                  placeholder="Add a genre — Enter or comma"
                  [value]="genreInput()"
                  (input)="genreInput.set($any($event.target).value)"
                  (keydown)="onGenreKeydown($event)"
                  (blur)="addGenre(genreInput())" />
                <datalist id="msp-genre-suggestions">
                  @for (opt of genreSuggestions(); track opt) { <option [value]="opt"></option> }
                </datalist>
              </div>
            </div>

            <div class="msp-field">
              <span class="msp-label">Marketing Promo Photos (up to 4)</span>
              <div class="msp-pic-grid">
                @for (i of [0, 1, 2, 3]; track i) {
                  <app-image-drop name="mealset" [value]="d.pics[i]" (valueChange)="setPic(i, $event)" />
                }
              </div>
            </div>

            <label class="msp-field">
              <span class="msp-label">Video URL (optional)</span>
              <input class="msp-input" type="url" placeholder="https://…" [value]="d.video1"
                (input)="setField('video1', $any($event.target).value)" />
            </label>

            <div class="msp-field msp-readonly-row">
              <span class="msp-readonly">Price: <strong>{{ d.price > 0 ? ('$' + d.price) : 'Free' }}</strong></span>
              <span class="msp-readonly">Status: <strong>{{ d.active ? 'Active' : 'Inactive' }}</strong></span>
              <span class="msp-readonly-note">(admin-set)</span>
            </div>

            <div class="msp-actions">
              <button type="button" class="msp-btn primary" [disabled]="savingSet() || !d.name.trim()" (click)="saveSet()">
                {{ savingSet() ? 'Saving…' : 'OK' }}
              </button>
              <button type="button" class="msp-btn" (click)="draft.set(null)">Cancel</button>
            </div>

            <!-- Meal picker: two lists side by side. Drag a meal across, or select
                 and use the ▶ / ◀ arrows. Membership is staged locally and saved
                 with the set when you press OK (no separate assign step). -->
            <div class="msp-picker">
              <h4 class="msp-subtitle">Meals in this MealSet</h4>
              <div class="msp-transfer" cdkDropListGroup>
                <div class="msp-transfer-col">
                  <div class="msp-transfer-head">Your meals</div>
                  <div
                    class="msp-transfer-list"
                    cdkDropList
                    [cdkDropListData]="'available'"
                    (cdkDropListDropped)="onTransferDrop($event)">
                    @for (m of availableMeals(); track m.id) {
                      <div
                        class="msp-transfer-item"
                        [class.sel]="selectedAvailable().has(m.id)"
                        cdkDrag
                        [cdkDragData]="m.id"
                        (click)="toggleSelect('available', m.id)"
                        (dblclick)="assign(m.id)">{{ m.name }}</div>
                    } @empty {
                      <div class="msp-transfer-empty">No meals</div>
                    }
                  </div>
                </div>

                <div class="msp-transfer-arrows">
                  <button
                    type="button"
                    class="msp-arrow"
                    matTooltip="Add to set"
                    [disabled]="!selectedAvailable().size"
                    (click)="assignSelected()">&#9654;</button>
                  <button
                    type="button"
                    class="msp-arrow"
                    matTooltip="Remove from set"
                    [disabled]="!selectedInSet().size"
                    (click)="unassignSelected()">&#9664;</button>
                </div>

                <div class="msp-transfer-col">
                  <div class="msp-transfer-head">In this MealSet</div>
                  <div
                    class="msp-transfer-list"
                    cdkDropList
                    [cdkDropListData]="'assigned'"
                    (cdkDropListDropped)="onTransferDrop($event)">
                    @for (m of assignedMeals(); track m.id) {
                      <div
                        class="msp-transfer-item"
                        [class.sel]="selectedInSet().has(m.id)"
                        cdkDrag
                        [cdkDragData]="m.id"
                        (click)="toggleSelect('assigned', m.id)"
                        (dblclick)="unassign(m.id)">{{ m.name }}</div>
                    } @empty {
                      <div class="msp-transfer-empty">Drag or ▶ meals here</div>
                    }
                  </div>
                </div>
              </div>
            </div>
          </section>
        }

        <!-- ============ RecipeBox ============ -->
        <section class="msp-card">
          <div class="msp-card-head">
            <h3 class="msp-card-title">RecipeBox
              <span
                class="msp-info"
                matTooltip="Author your own recipes. They appear here as drafts until you publish them."
                matTooltipPosition="right">&#9432;</span>
            </h3>
            <button type="button" class="msp-btn primary" (click)="newRecipe()">+ New Recipe</button>
          </div>
          <!-- Import a recipe from a PDF (or JPEG/PNG) — same background AI import
               regular users get in "Add Meals". Lands as a meal in the binder. -->
          <div class="rb-import" [class.dragover]="rbDragOver()"
            (dragover)="onRbDragOver($event)" (dragleave)="onRbDragLeave($event)" (drop)="onRbDrop($event)"
            (click)="rbFile.click()">
            <mat-icon>upload_file</mat-icon>
            <span>Import from a recipe PDF — drop a file or click</span>
            <input #rbFile type="file" accept="application/pdf,image/jpeg,image/png" hidden
              (change)="onRbFileSelected(rbFile)" />
          </div>
          @if (recipes().length) {
            <!-- Client-side, as-you-type title filter over the loaded list. -->
            <div class="rb-search">
              <mat-icon class="rb-search-icon">search</mat-icon>
              <input
                class="msp-input rb-search-input"
                type="text"
                placeholder="Search recipes by title…"
                [value]="recipeSearch()"
                (input)="recipeSearch.set($any($event.target).value)" />
              @if (recipeSearch()) {
                <button type="button" class="rb-search-clear" matTooltip="Clear" (click)="recipeSearch.set('')">
                  <mat-icon>close</mat-icon>
                </button>
              }
            </div>
            @if (filteredRecipes().length) {
              <ul class="msp-set-list">
                @for (r of filteredRecipes(); track r.id) {
                  <li class="msp-set-item" (click)="openRecipe(r.id)">
                    <span class="msp-set-name">{{ r.title }}</span>
                    @if (r.isPublished) {
                      <span class="msp-set-genre rb-badge published">Published</span>
                    } @else {
                      <span class="msp-set-genre rb-badge draft">Draft</span>
                    }
                    @if (r.isArchived) { <span class="msp-set-genre rb-badge archived">Archived</span> }
                    <span class="msp-set-flags">
                      <span class="msp-flag">{{ r.updatedAt | date: 'MMM d, y' }}</span>
                    </span>
                  </li>
                }
              </ul>
            } @else {
              <p class="msp-empty">No recipes match “{{ recipeSearch() }}”.</p>
            }
          } @else {
            <p class="msp-empty">No recipes yet — create your first.</p>
          }
        </section>
      </div>
    </div>
  `,
  styleUrls: ['./mealsets-panel.scss'],
})
export class MealsetsPanelComponent implements OnInit {
  protected tabService = inject(TabService);
  private mealSetService = inject(MealSetService);
  private authoring = inject(RecipeAuthoringService);
  private recipeService = inject(RecipeService);
  private importWatcher = inject(RecipeImportWatcher);
  private notification = inject(NotificationService);
  private auth = inject(AuthService);

  // ---- RecipeBox (authored recipes list) -----------------------------------
  readonly recipes = signal<RecipeSummary[]>([]);
  /** As-you-type title filter — client-side, case-insensitive substring. */
  readonly recipeSearch = signal('');
  readonly filteredRecipes = computed<RecipeSummary[]>(() => {
    const q = this.recipeSearch().trim().toLowerCase();
    const list = this.recipes();
    return q ? list.filter((r) => (r.title ?? '').toLowerCase().includes(q)) : list;
  });

  constructor() {
    // Reload the recipe list whenever the editor closes (a save/create there
    // should surface here) and on first mount. Fires only when the flag changes.
    effect(() => {
      if (!this.tabService.recipeEditorOpen()) void this.loadRecipes();
    });
  }

  private async loadRecipes(): Promise<void> {
    try {
      // RecipeBox shows AUTHORED recipes only — imports live in the meal binder.
      const res = await firstValueFrom(this.authoring.listRecipes('authored'));
      this.recipes.set(res?.recipes ?? []);
    } catch {
      this.recipes.set([]);
    }
  }

  newRecipe(): void { this.tabService.openRecipeEditor(null); }
  openRecipe(id: number): void { this.tabService.openRecipeEditor(id); }

  // ---- Import a recipe from a PDF (reuses the users' import pipeline) --------
  readonly rbDragOver = signal(false);
  onRbDragOver(ev: DragEvent): void { ev.preventDefault(); this.rbDragOver.set(true); }
  onRbDragLeave(ev: DragEvent): void { ev.preventDefault(); this.rbDragOver.set(false); }
  onRbDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.rbDragOver.set(false);
    this.importPdf(ev.dataTransfer?.files?.[0] ?? null);
  }
  onRbFileSelected(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    input.value = ''; // allow re-picking the same file after a failure
    this.importPdf(file);
  }

  /** Validate + kick off the same background recipe import users get. */
  private importPdf(file: File | null): void {
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      this.notification.show('Please choose a PDF, JPEG, or PNG recipe file.', 'error');
      return;
    }
    if (file.type === 'application/pdf') {
      this.notification.show(
        "Queued for processing, we'll take it from here. Notification will be sent when finished importing and AI processing.",
        'warning',
        10000,
      );
    }
    void this.uploadRecipe(file);
  }
  private async uploadRecipe(file: File): Promise<void> {
    try {
      const res = await firstValueFrom(this.recipeService.importRecipe(file));
      if (res?.recipeId != null) this.importWatcher.watch(res.recipeId);
    } catch {
      this.notification.show('Recipe import failed — could not upload the file.', 'error');
    }
  }

  /** The name on the user's account (Auth0 profile) — the default author name. */
  readonly accountName = toSignal(this.auth.user$.pipe(map((u) => u?.name ?? '')), {
    initialValue: '',
  });

  // ---- Authored sets + editor ----------------------------------------------
  readonly authoredSets = signal<MealSet[]>([]);
  readonly draft = signal<SetDraft | null>(null);
  readonly savingSet = signal(false);

  /** Store a returned CDN url into one of the set's 4 promo photo slots. */
  setPic(index: number, url: string): void {
    this.draft.update((d) => {
      if (!d) return d;
      const pics = [...d.pics] as SetDraft['pics'];
      pics[index] = url;
      return { ...d, pics };
    });
  }

  // ---- Meal picker (dual-list transfer, staged locally) ---------------------
  /** The author's own meals — the whole pool for the two lists. */
  readonly ownMeals = signal<Meal[]>([]);
  /** Staged membership for the OPEN set; committed (diffed vs the baseline) on OK. */
  private readonly assignedIds = signal<Set<number>>(new Set());
  /** Baseline membership loaded from the server, for diffing adds/removes on save. */
  private originalAssignedIds = new Set<number>();
  /** Row selection in each list (drives the ▶ / ◀ arrows). */
  readonly selectedAvailable = signal<Set<number>>(new Set());
  readonly selectedInSet = signal<Set<number>>(new Set());

  /** Left list: own meals NOT yet in the set. */
  readonly availableMeals = computed<Meal[]>(() =>
    this.ownMeals().filter((m) => !this.assignedIds().has(m.id)),
  );
  /** Right list: own meals currently staged into the set. */
  readonly assignedMeals = computed<Meal[]>(() =>
    this.ownMeals().filter((m) => this.assignedIds().has(m.id)),
  );

  toggleSelect(list: 'available' | 'assigned', id: number): void {
    const sig = list === 'available' ? this.selectedAvailable : this.selectedInSet;
    sig.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /** Move one meal into the set (drag-drop target / double-click). */
  assign(id: number): void {
    this.assignedIds.update((s) => new Set(s).add(id));
    this.dropSelection(id);
  }

  /** Move one meal out of the set (drag-drop target / double-click). */
  unassign(id: number): void {
    this.assignedIds.update((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    this.dropSelection(id);
  }

  /** ▶ — move every selected available meal into the set. */
  assignSelected(): void {
    this.assignedIds.update((s) => {
      const next = new Set(s);
      for (const id of this.selectedAvailable()) next.add(id);
      return next;
    });
    this.selectedAvailable.set(new Set());
  }

  /** ◀ — move every selected in-set meal back to the pool. */
  unassignSelected(): void {
    this.assignedIds.update((s) => {
      const next = new Set(s);
      for (const id of this.selectedInSet()) next.delete(id);
      return next;
    });
    this.selectedInSet.set(new Set());
  }

  /** Drag between the two lists: direction is decided by the drop container. */
  onTransferDrop(event: CdkDragDrop<string>): void {
    if (event.previousContainer === event.container) return; // reorder within a list — ignore
    const id = event.item.data as number;
    if (event.container.data === 'assigned') this.assign(id);
    else this.unassign(id);
  }

  private dropSelection(id: number): void {
    this.selectedAvailable.update((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    this.selectedInSet.update((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  // ---- Owner profile --------------------------------------------------------
  /** Author display name override; blank = flow through the account name. */
  readonly profileAuthorName = signal('');
  readonly profileBio = signal('');
  readonly profileCredentials = signal('');
  readonly profilePic = signal('');
  /** Optional single marketing backlink + its optional image (upload or paste). */
  readonly backLink = signal('');
  readonly backLinkPhoto = signal('');
  readonly savingProfile = signal(false);
  /** True once a SAVED profile has both a Bio and an Author photo — gates the
   *  "+ New MealSet" button so every author's catalog card carries their info. */
  readonly profileComplete = signal(false);
  /** True once a profile row exists (has any saved content, or was just saved).
   *  Only then does the profile card become collapsible. */
  readonly profileSaved = signal(false);
  /** Collapsed state of the Author-profile card — defaults collapsed for a
   *  returning author (a profile already exists) so they land near My MealSets. */
  readonly profileCollapsed = signal(false);

  // ---- Read-only contract ---------------------------------------------------
  readonly contract = signal<MealSetContractView | null>(null);

  ngOnInit(): void {
    void this.loadAuthored();
    void this.loadOwnMeals();
    void this.loadProfile();
    void this.loadContract();
    void this.loadGenreSuggestions();
  }

  /** Fetch the catalog's distinct genres once for the chip autocomplete. Public
   *  endpoint; a failure just leaves the suggestion list empty (free-text still
   *  works). */
  private async loadGenreSuggestions(): Promise<void> {
    try {
      const catalog = await firstValueFrom(this.mealSetService.getCatalog());
      this.genreSuggestions.set(catalog?.genres ?? []);
    } catch {
      this.genreSuggestions.set([]);
    }
  }

  private async loadAuthored(): Promise<void> {
    try {
      this.authoredSets.set((await firstValueFrom(this.mealSetService.getAuthored())) ?? []);
    } catch {
      this.authoredSets.set([]);
    }
  }

  private async loadOwnMeals(): Promise<void> {
    try {
      this.ownMeals.set((await firstValueFrom(this.mealSetService.getOwnMeals())) ?? []);
    } catch {
      this.ownMeals.set([]);
    }
  }

  private async loadProfile(): Promise<void> {
    try {
      const p = await firstValueFrom(this.mealSetService.getOwnerProfile());
      this.profileAuthorName.set(p?.authorName ?? '');
      this.profileBio.set(p?.authorBio ?? '');
      this.profileCredentials.set(p?.authorCredentials ?? '');
      this.profilePic.set(p?.authorPic ?? '');
      this.backLink.set(p?.backLink ?? '');
      this.backLinkPhoto.set(p?.backLinkPhoto ?? '');
      this.profileComplete.set(!!(p?.authorBio?.trim() && p?.authorPic));
      // A saved profile row = any author content present. Returning authors land
      // with it collapsed so they don't scroll past it to reach My MealSets.
      const hasContent = !!(
        p?.authorBio?.trim() ||
        p?.authorPic ||
        p?.authorName?.trim() ||
        p?.authorCredentials?.trim() ||
        p?.backLink?.trim()
      );
      this.profileSaved.set(hasContent);
      this.profileCollapsed.set(hasContent);
    } catch {
      // No profile yet — start blank + expanded (New MealSet stays disabled).
      this.profileComplete.set(false);
      this.profileSaved.set(false);
      this.profileCollapsed.set(false);
    }
  }

  private async loadContract(): Promise<void> {
    try {
      this.contract.set(await firstValueFrom(this.mealSetService.getContract()));
    } catch {
      // 404 (no contract) or any other error → hide the deal panel cleanly.
      this.contract.set(null);
    }
  }

  // ---- Editor: create / edit / save ----------------------------------------
  startCreate(): void {
    this.resetPicker(new Set());
    this.genreInput.set('');
    this.genresBaseline = [];
    this.draft.set({
      mealSetId: null,
      name: '',
      description: '',
      genres: [],
      pics: ['', '', '', ''],
      video1: '',
      price: 0,
      active: false,
    });
  }

  editSet(s: MealSet): void {
    this.genreInput.set('');
    this.genresBaseline = [...(s.genres ?? [])]; // baseline for the PATCH dirty check
    this.draft.set({
      mealSetId: s.mealSetId,
      name: s.name ?? '',
      description: s.description ?? '',
      genres: [...(s.genres ?? [])],
      pics: [s.mealSetPic1 ?? '', s.mealSetPic2 ?? '', s.mealSetPic3 ?? '', s.mealSetPic4 ?? ''],
      video1: s.mealSetVideo1 ?? '',
      price: s.price ?? 0,
      active: s.active ?? false,
    });
    void this.loadAssigned(s.mealSetId);
  }

  setField(field: 'name' | 'description' | 'video1', value: string): void {
    this.draft.update((d) => (d ? { ...d, [field]: value } : d));
  }

  // ---- Genres chip input ----------------------------------------------------
  /** Live text in the genre chip input. */
  readonly genreInput = signal('');
  /** Distinct genres in use across active sets — autocomplete suggestions. */
  readonly genreSuggestions = signal<string[]>([]);
  /** The genre list when the editor opened — the PATCH sends genres ONLY when the
   *  current chips differ from this (replace-vs-untouched contract). */
  private genresBaseline: string[] = [];

  /** Add the text as a chip (trimmed; case-insensitive de-dupe). */
  addGenre(raw: string): void {
    const v = raw.replace(/,+$/, '').trim();
    if (!v) { this.genreInput.set(''); return; }
    this.draft.update((d) => {
      if (!d) return d;
      if (d.genres.some((g) => g.toLowerCase() === v.toLowerCase())) return d;
      return { ...d, genres: [...d.genres, v] };
    });
    this.genreInput.set('');
  }

  removeGenre(idx: number): void {
    this.draft.update((d) => (d ? { ...d, genres: d.genres.filter((_, i) => i !== idx) } : d));
  }

  /** Enter / comma commit a chip; Backspace on an empty box pops the last chip. */
  onGenreKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      this.addGenre(this.genreInput());
    } else if (ev.key === 'Backspace' && this.genreInput() === '') {
      this.draft.update((d) => (d && d.genres.length ? { ...d, genres: d.genres.slice(0, -1) } : d));
    }
  }

  /** Order-insensitive, case-insensitive compare (mirrors the server's normalize). */
  private sameGenres(a: string[], b: string[]): boolean {
    const norm = (x: string[]) =>
      [...new Set(x.map((s) => s.trim().toLowerCase()).filter(Boolean))].sort();
    const na = norm(a);
    const nb = norm(b);
    return na.length === nb.length && na.every((v, i) => v === nb[i]);
  }

  private draftToBody(): CreateMealSetRequest & UpdateMealSetRequest {
    const d = this.draft()!;
    return {
      name: d.name.trim(),
      description: d.description.trim() || null,
      mealSetPic1: d.pics[0] || null,
      mealSetPic2: d.pics[1] || null,
      mealSetPic3: d.pics[2] || null,
      mealSetPic4: d.pics[3] || null,
      mealSetVideo1: d.video1.trim() || null,
    };
  }

  async saveSet(): Promise<void> {
    const d = this.draft();
    if (!d || !d.name.trim() || this.savingSet()) return;
    // Commit any half-typed genre still in the box before saving.
    if (this.genreInput().trim()) this.addGenre(this.genreInput());
    const draft = this.draft()!;
    this.savingSet.set(true);
    try {
      let saved: MealSet;
      if (draft.mealSetId) {
        // PATCH: send genres ONLY when the chip set changed (present = REPLACE).
        const body: UpdateMealSetRequest = this.draftToBody();
        if (!this.sameGenres(draft.genres, this.genresBaseline)) body.genres = draft.genres;
        saved = await firstValueFrom(this.mealSetService.updateSet(draft.mealSetId, body));
      } else {
        // CREATE: include genres when any were entered (omit = uncategorized).
        const body: CreateMealSetRequest = this.draftToBody();
        if (draft.genres.length) body.genres = draft.genres;
        saved = await firstValueFrom(this.mealSetService.createSet(body));
      }
      // Commit staged meal membership now that the set has an id.
      await this.commitMembership(saved.mealSetId);
      await this.loadAuthored();
      this.editSet(saved); // re-open the saved set with a fresh membership baseline
      this.notification.show('MealSet saved.', 'success');
    } catch {
      this.notification.show('Could not save the MealSet.', 'error');
    } finally {
      this.savingSet.set(false);
    }
  }

  // ---- Owner profile save ---------------------------------------------------
  async saveProfile(): Promise<void> {
    if (this.savingProfile()) return;
    this.savingProfile.set(true);
    try {
      await firstValueFrom(
        this.mealSetService.updateOwnerProfile({
          // Blank name flows through the account name (still stored on the row,
          // so an author can later diverge from their Auth0 signup name).
          authorName: this.profileAuthorName().trim() || this.accountName() || null,
          authorBio: this.profileBio().trim() || null,
          authorCredentials: this.profileCredentials().trim() || null,
          authorPic: this.profilePic() || null,
          backLink: this.backLink().trim() || null,
          backLinkPhoto: this.backLinkPhoto().trim() || null,
        }),
      );
      this.profileComplete.set(!!(this.profileBio().trim() && this.profilePic()));
      this.profileSaved.set(true); // profile now collapsible
      this.profileCollapsed.set(true); // shrink it right away on save
      this.notification.show('Author profile saved.', 'success');
    } catch {
      this.notification.show('Could not save the author profile.', 'error');
    } finally {
      this.savingProfile.set(false);
    }
  }

  // ---- Meal picker junctions ------------------------------------------------
  /** Seed the picker's staged + baseline membership (and clear selections). */
  private resetPicker(ids: Set<number>): void {
    this.assignedIds.set(new Set(ids));
    this.originalAssignedIds = new Set(ids);
    this.selectedAvailable.set(new Set());
    this.selectedInSet.set(new Set());
  }

  private async loadAssigned(setId: number): Promise<void> {
    try {
      const meals = (await firstValueFrom(this.mealSetService.getSetMeals(setId))) ?? [];
      // Set-sourced entries carry mealSetId === this set; those are the assigned.
      const ids = meals.filter((m) => m.mealSetId === setId).map((m) => m.id);
      this.resetPicker(new Set(ids));
    } catch {
      this.resetPicker(new Set());
    }
  }

  /** Commit staged membership changes: junction the adds, unjunction the removes,
   *  diffed against the baseline loaded when the set was opened. */
  private async commitMembership(setId: number): Promise<void> {
    const target = this.assignedIds();
    const adds = [...target].filter((id) => !this.originalAssignedIds.has(id));
    const removes = [...this.originalAssignedIds].filter((id) => !target.has(id));
    let order = this.originalAssignedIds.size;
    for (const id of adds) {
      await firstValueFrom(this.mealSetService.addMeal(setId, { mealId: id, sortOrder: order++ }));
    }
    for (const id of removes) {
      await firstValueFrom(this.mealSetService.removeMeal(setId, id));
    }
  }
}
