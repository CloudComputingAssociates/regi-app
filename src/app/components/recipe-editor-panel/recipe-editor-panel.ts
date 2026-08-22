// src/app/components/recipe-editor-panel/recipe-editor-panel.ts
//
// Recipe authoring editor — a full-screen TabService overlay (no router). Mounted
// once in app.ts; self-gates on TabService.recipeEditorOpen() AND the MealSetOwner
// role. Launched from the Author Studio's RecipeBox; recipeAuthorEditorId() null =
// new draft, else edit an existing recipe.
//
// Save model: create once on first save (POST), then PATCH the header. Ingredient
// lines are server-managed (POST add / PATCH edit / DELETE remove / PUT reorder).
// Directions + tips are PLAIN TEXT — '\n' preserved verbatim (no rich text).
// Publish is a draft-first gate: disabled client-side until >=1 line + non-empty
// directions; a server 422 shows inline. isRegiApproved / recipePdfLink /
// pdfRenderedUtc are read-only wire fields — never editable.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TabService } from '../../services/tab.service';
import { RoleService } from '../../services/role.service';
import { NotificationService } from '../../services/notification.service';
import { RecipeAuthoringService } from '../../services/recipe-authoring.service';
import { RotationService } from '../../services/rotation.service';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';
import { FoodLookasideComponent } from '../food-lookaside/food-lookaside';
import { Food } from '../../models/food.model';
import {
  CreateRecipeRequest,
  Recipe,
  RecipeIngredient,
  RecipeIngredientFoodSource,
  RecipeResponse,
  RecipeType,
  UpdateRecipeIngredientRequest,
  UpdateRecipeRequest,
} from '../../models';

/** Header form — numeric fields held as strings, converted on submit. */
interface EditorForm {
  title: string;
  tagline: string;
  yieldNote: string;
  servingsBase: string;
  prepTimeMin: string;
  cookTimeMin: string;
  heroImageLink: string;
  attributionAuthor: string;
  attributionLink: string;
  directions: string;
  tips: string;
  summaryCal: string;
  summaryProteinG: string;
  summaryFiberG: string;
  summaryFatG: string;
  summaryCarbG: string;
}

const BLANK_FORM: EditorForm = {
  title: '', tagline: '', yieldNote: '', servingsBase: '', prepTimeMin: '', cookTimeMin: '',
  heroImageLink: '', attributionAuthor: '', attributionLink: '', directions: '', tips: '',
  summaryCal: '', summaryProteinG: '', summaryFiberG: '', summaryFatG: '', summaryCarbG: '',
};

interface AddRow { displayQuantity: string; ingredientName: string; note: string; }

@Component({
  selector: 'app-recipe-editor-panel',
  imports: [DatePipe, MatIconModule, MatTooltipModule, FoodLookasideComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="rep-backdrop">
        <div class="rep-panel">
          <!-- Header bar -->
          <header class="rep-head">
            <span class="rep-title">
              <mat-icon>edit_note</mat-icon>{{ recipeId() ? 'Edit Recipe' : 'New Recipe' }}
              <span class="rep-badge type">{{ recipeType() }}</span>
              @if (isPublished()) { <span class="rep-badge published">Published</span> }
              @if (isArchived()) { <span class="rep-badge archived">Archived</span> }
              @if (isRegiApproved()) { <span class="rep-badge regi">REGI-approved</span> }
            </span>
            @if (pdfHref(); as href) {
              <a class="rep-pdf" [href]="href" target="_blank" rel="noopener">
                <mat-icon>picture_as_pdf</mat-icon>View PDF
              </a>
            }
            <a class="rep-mylink" (click)="myRecipes()">RecipeBox</a>
            <button type="button" class="rep-close" matTooltip="Close" (click)="close()">
              <mat-icon>close</mat-icon>
            </button>
          </header>

          <div class="rep-body">
            <div class="rep-main">
            <!-- ===== Header fields ===== -->
            <label class="rep-field">
              <span class="rep-label">Title <em>*</em></span>
              <input class="rep-input" type="text" [value]="form().title"
                (input)="set('title', $any($event.target).value)" placeholder="Recipe title" />
            </label>
            <label class="rep-field">
              <span class="rep-label">Tagline</span>
              <input class="rep-input" type="text" [value]="form().tagline"
                (input)="set('tagline', $any($event.target).value)" placeholder="Editorial header line" />
            </label>
            <div class="rep-row3">
              <label class="rep-field">
                <span class="rep-label">Yield note</span>
                <input class="rep-input" type="text" [value]="form().yieldNote"
                  (input)="set('yieldNote', $any($event.target).value)" placeholder="Makes 12 muffins" />
              </label>
              <label class="rep-field">
                <span class="rep-label">Servings (base)</span>
                <input class="rep-input" type="number" [value]="form().servingsBase"
                  (input)="set('servingsBase', $any($event.target).value)" />
              </label>
            </div>
            <div class="rep-row3">
              <label class="rep-field">
                <span class="rep-label">Prep (min)</span>
                <input class="rep-input" type="number" [value]="form().prepTimeMin"
                  (input)="set('prepTimeMin', $any($event.target).value)" />
              </label>
              <label class="rep-field">
                <span class="rep-label">Cook (min)</span>
                <input class="rep-input" type="number" [value]="form().cookTimeMin"
                  (input)="set('cookTimeMin', $any($event.target).value)" />
              </label>
            </div>
            <label class="rep-field">
              <span class="rep-label">Hero image URL</span>
              <input class="rep-input" type="url" [value]="form().heroImageLink"
                (input)="set('heroImageLink', $any($event.target).value)" placeholder="https://…" />
            </label>
            <div class="rep-row3">
              <label class="rep-field">
                <span class="rep-label">Attribution author</span>
                <input class="rep-input" type="text" [value]="form().attributionAuthor"
                  (input)="set('attributionAuthor', $any($event.target).value)" />
              </label>
              <label class="rep-field">
                <span class="rep-label">Attribution link</span>
                <input class="rep-input" type="url" [value]="form().attributionLink"
                  (input)="set('attributionLink', $any($event.target).value)" placeholder="https://…" />
              </label>
            </div>

            <!-- ===== Directions (plain text) ===== -->
            <label class="rep-field">
              <span class="rep-label">Directions <em>*</em></span>
              <textarea class="rep-input rep-textarea" rows="8" [value]="form().directions"
                (input)="set('directions', $any($event.target).value)"
                placeholder="Write the directions. Line breaks are preserved exactly."></textarea>
            </label>
            <label class="rep-field">
              <span class="rep-label">Tips</span>
              <textarea class="rep-input rep-textarea" rows="4" [value]="form().tips"
                (input)="set('tips', $any($event.target).value)"
                placeholder="Optional tips / notes."></textarea>
            </label>

            <!-- ===== Per-serving fallback macros (collapsible) ===== -->
            <div class="rep-field">
              <button type="button" class="rep-collapse" (click)="summaryOpen.set(!summaryOpen())">
                <mat-icon>{{ summaryOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
                Per-serving fallback macros
              </button>
              @if (summaryOpen()) {
                <div class="rep-macros">
                  <label><span>Cal</span><input class="rep-input" type="number" [value]="form().summaryCal" (input)="set('summaryCal', $any($event.target).value)" /></label>
                  <label><span>Protein g</span><input class="rep-input" type="number" [value]="form().summaryProteinG" (input)="set('summaryProteinG', $any($event.target).value)" /></label>
                  <label><span>Fiber g</span><input class="rep-input" type="number" [value]="form().summaryFiberG" (input)="set('summaryFiberG', $any($event.target).value)" /></label>
                  <label><span>Fat g</span><input class="rep-input" type="number" [value]="form().summaryFatG" (input)="set('summaryFatG', $any($event.target).value)" /></label>
                  <label><span>Carb g</span><input class="rep-input" type="number" [value]="form().summaryCarbG" (input)="set('summaryCarbG', $any($event.target).value)" /></label>
                </div>
              }
            </div>

            <!-- ===== Ingredients ===== -->
            <div class="rep-field">
              <span class="rep-label">Ingredients</span>
              @if (reorderError()) { <p class="rep-inline-err">{{ reorderError() }}</p> }
              <ul class="rep-ings">
                @for (ing of ingredients(); track ing.recipeIngredientId; let i = $index) {
                  <li class="rep-ing" [class.selected]="selectedLineId() === ing.recipeIngredientId" [class.bound]="lineBound(ing)">
                    <div class="rep-ing-main">
                      <button type="button" class="rep-ing-btn bind" [class.on]="selectedLineId() === ing.recipeIngredientId"
                        matTooltip="Select this line, then pick a food on the right"
                        (click)="selectLine(ing.recipeIngredientId)">
                        <mat-icon>{{ selectedLineId() === ing.recipeIngredientId ? 'my_location' : 'link' }}</mat-icon>
                      </button>
                      <input class="rep-input qty" type="text" [value]="ing.displayQuantity ?? ''"
                        placeholder="1½ cups"
                        (blur)="patchLine(ing, 'displayQuantity', $any($event.target).value)" />
                      <input class="rep-input name" type="text" [value]="ing.ingredientName"
                        placeholder="Ingredient"
                        (blur)="patchLine(ing, 'ingredientName', $any($event.target).value)" />
                      <input class="rep-input note" type="text" [value]="ing.note ?? ''"
                        placeholder="(finely chopped)"
                        (blur)="patchLine(ing, 'note', $any($event.target).value)" />
                      <button type="button" class="rep-ing-btn" matTooltip="Move up"
                        [disabled]="i === 0" (click)="move(i, -1)"><mat-icon>arrow_upward</mat-icon></button>
                      <button type="button" class="rep-ing-btn" matTooltip="Move down"
                        [disabled]="i === ingredients().length - 1" (click)="move(i, 1)"><mat-icon>arrow_downward</mat-icon></button>
                      <button type="button" class="rep-ing-btn del" matTooltip="Remove"
                        (click)="removeLine(ing)"><mat-icon>delete_outline</mat-icon></button>
                      <button type="button" class="rep-ing-btn" matTooltip="Amount"
                        (click)="toggleExpand(ing.recipeIngredientId)"><mat-icon>{{ isExpanded(ing.recipeIngredientId) ? 'expand_less' : 'tune' }}</mat-icon></button>
                    </div>
                    <!-- Bind status: pending (unbound) vs bound (resolved food + qty/unit). -->
                    <div class="rep-ing-status">
                      @if (lineBound(ing)) {
                        <span class="rep-bound"><mat-icon>check_circle</mat-icon>{{ boundLabel(ing) }}
                          @if (ing.quantity != null) { <span class="rep-bound-qty">· {{ ing.quantity }} {{ ing.unit }}</span> }
                        </span>
                        <button type="button" class="rep-unbind" matTooltip="Unbind this line" (click)="unbindLine(ing)">
                          <mat-icon>link_off</mat-icon>Unbind
                        </button>
                      } @else {
                        <span class="rep-pending"><mat-icon>radio_button_unchecked</mat-icon>Pending — select, then pick a food</span>
                      }
                    </div>
                    @if (isExpanded(ing.recipeIngredientId)) {
                      <div class="rep-ing-num">
                        <label><span>Qty</span><input class="rep-input" type="number" [value]="ing.quantity ?? ''"
                          (blur)="patchLineNum(ing, 'quantity', $any($event.target).value)" /></label>
                        <label><span>Unit</span><input class="rep-input" type="text" [value]="ing.unit ?? ''"
                          (blur)="patchLine(ing, 'unit', $any($event.target).value)" /></label>
                      </div>
                    }
                  </li>
                }
              </ul>
              <!-- Add row: POSTs on Add (server appends sortOrder). -->
              <div class="rep-ing-add">
                <input class="rep-input qty" type="text" [value]="addRow().displayQuantity"
                  placeholder="1½ cups" (input)="setAdd('displayQuantity', $any($event.target).value)" />
                <input class="rep-input name" type="text" [value]="addRow().ingredientName"
                  placeholder="Add an ingredient" (input)="setAdd('ingredientName', $any($event.target).value)"
                  (keydown.enter)="addLine()" />
                <input class="rep-input note" type="text" [value]="addRow().note"
                  placeholder="(note)" (input)="setAdd('note', $any($event.target).value)" />
                <button type="button" class="rep-add-btn" [disabled]="!addRow().ingredientName.trim()"
                  (click)="addLine()"><mat-icon>add</mat-icon>Add</button>
              </div>
              @if (addError()) { <p class="rep-inline-err">{{ addError() }}</p> }
            </div>

            <!-- ===== Assign & Create Meal ===== -->
            <div class="rep-field rep-createmeal">
              <span class="rep-label">Create a meal from this recipe</span>
              <div class="rep-cm-row">
                <input class="rep-input" type="text" [value]="mealName()"
                  (input)="mealName.set($any($event.target).value)" placeholder="Meal name" />
                <button type="button" class="rep-btn primary"
                  [disabled]="creatingMeal() || !allBound()"
                  [matTooltip]="allBound() ? '' : 'Bind every ingredient to a food first'"
                  matTooltipPosition="above" (click)="createMeal()">
                  {{ creatingMeal() ? 'Creating…' : 'Create Meal' }}
                </button>
              </div>
              @if (!allBound() && ingredients().length) {
                <p class="rep-cm-hint">Still pending: {{ pendingLineNames().join(', ') }}</p>
              }
              @if (createMealError()) { <p class="rep-inline-err">{{ createMealError() }}</p> }
            </div>

            <!-- ===== Read-only wire fields ===== -->
            @if (recipePdfLink()) {
              <div class="rep-readonly">
                Recipe PDF: <a [href]="recipePdfLink()" target="_blank" rel="noopener">open</a>
                @if (pdfRenderedUtc()) { <span> · rendered {{ pdfRenderedUtc() | date: 'MMM d, y' }}</span> }
              </div>
            }
            </div>

            <!-- Docked food search (reused from Create Meal; emits picks instead
                 of adding to a meal). Binds to the selected ingredient line. -->
            <aside class="rep-dock">
              <div class="rep-dock-hint">
                @if (selectedLineId()) {
                  <mat-icon>my_location</mat-icon> Pick a food to bind to the selected line.
                } @else {
                  <mat-icon>info</mat-icon> Select an ingredient line, then pick a food.
                }
              </div>
              <app-food-lookaside [emitSelection]="true" (foodSelected)="onFoodSelected($event)" />
            </aside>
          </div>

          <!-- Footer actions -->
          <footer class="rep-foot">
            @if (publishError()) { <span class="rep-inline-err foot">{{ publishError() }}</span> }
            <div class="rep-foot-btns">
              @if (recipeId()) {
                <button type="button" class="rep-btn ghost" (click)="toggleArchive()">
                  {{ isArchived() ? 'Unarchive' : 'Archive' }}
                </button>
              }
              @if (isPublished()) {
                <button type="button" class="rep-btn" [disabled]="saving()" (click)="unpublish()">Unpublish</button>
              } @else {
                <button type="button" class="rep-btn publish" [disabled]="saving() || !canPublish()"
                  [matTooltip]="canPublish() ? '' : 'Add at least one ingredient and directions to publish'"
                  matTooltipPosition="above" (click)="publish()">Publish</button>
              }
              <button type="button" class="rep-btn primary" [disabled]="saving() || !form().title.trim()"
                (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
            </div>
          </footer>
        </div>
      </div>
    }
  `,
  styleUrls: ['./recipe-editor-panel.scss'],
})
export class RecipeEditorPanelComponent {
  private tab = inject(TabService);
  private role = inject(RoleService);
  private notification = inject(NotificationService);
  private authoring = inject(RecipeAuthoringService);
  private rotation = inject(RotationService);
  private dialog = inject(MatDialog);

  readonly isOpen = computed(
    () => this.tab.recipeEditorOpen() && this.role.hasRole('MealSetOwner'),
  );

  readonly form = signal<EditorForm>({ ...BLANK_FORM });
  readonly recipeId = signal<number | null>(null);
  readonly ingredients = signal<RecipeIngredient[]>([]);
  readonly isPublished = signal(false);
  readonly isArchived = signal(false);
  readonly isRegiApproved = signal(false);
  readonly recipeType = signal<RecipeType>('authored');
  readonly recipePdfLink = signal<string | null>(null);
  readonly pdfRenderedUtc = signal<string | null>(null);
  readonly saving = signal(false);
  readonly summaryOpen = signal(false);
  readonly addRow = signal<AddRow>({ displayQuantity: '', ingredientName: '', note: '' });
  readonly addError = signal<string | null>(null);
  readonly publishError = signal<string | null>(null);
  readonly reorderError = signal<string | null>(null);
  private expanded = signal<Set<number>>(new Set());

  // ---- Food binding (Step 1) ----
  /** The ingredient line currently targeted by a food pick, or null. */
  readonly selectedLineId = signal<number | null>(null);
  /** Client-side memory of the picked food's name per line (the wire line carries
   *  foodId, not a name) — for the "bound" display. */
  private readonly boundNames = signal<Map<number, string>>(new Map());

  // ---- Create Meal (Step 2) ----
  readonly mealName = signal('');
  readonly creatingMeal = signal(false);
  readonly createMealError = signal<string | null>(null);

  /** A line is BOUND once it has a resolved food (foodId set, not pending). */
  lineBound(ing: RecipeIngredient): boolean {
    return ing.foodId != null && ing.foodSource !== 'pending';
  }
  /** Every line bound (and at least one line) — the client mirror of the server
   *  create-meal gate. */
  readonly allBound = computed<boolean>(() => {
    const lines = this.ingredients();
    return lines.length > 0 && lines.every((l) => this.lineBound(l));
  });
  /** Names of the lines still pending — shown on the disabled Create Meal action. */
  readonly pendingLineNames = computed<string[]>(() =>
    this.ingredients().filter((l) => !this.lineBound(l)).map((l) => l.ingredientName),
  );
  /** Display label for a bound line: the picked food name if we have it, else the
   *  as-written ingredient name. */
  boundLabel(ing: RecipeIngredient): string {
    return this.boundNames().get(ing.recipeIngredientId) ?? ing.ingredientName;
  }

  /** The published recipe PDF href with a ?v= cache-bust, or null. */
  readonly pdfHref = computed<string | null>(() => {
    const link = this.recipePdfLink();
    if (!link) return null;
    const v = this.pdfRenderedUtc();
    if (!v) return link;
    return link + (link.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(v);
  });

  private loadedKey: string | null = null;

  constructor() {
    // Initialize (blank or load) once per open+id.
    effect(() => {
      const open = this.isOpen();
      const id = this.tab.recipeAuthorEditorId();
      if (!open) { this.loadedKey = null; return; }
      const key = String(id);
      if (this.loadedKey === key) return;
      this.loadedKey = key;
      if (id == null) this.initBlank();
      else void this.loadRecipe(id);
    });
  }

  set<K extends keyof EditorForm>(field: K, value: string): void {
    this.form.update((f) => ({ ...f, [field]: value }));
  }
  setAdd<K extends keyof AddRow>(field: K, value: string): void {
    this.addRow.update((r) => ({ ...r, [field]: value }));
  }

  // ---- Load / init ----------------------------------------------------------
  private initBlank(): void {
    this.form.set({ ...BLANK_FORM });
    this.recipeId.set(null);
    this.ingredients.set([]);
    this.isPublished.set(false);
    this.isArchived.set(false);
    this.isRegiApproved.set(false);
    this.recipeType.set('authored');
    this.recipePdfLink.set(null);
    this.pdfRenderedUtc.set(null);
    this.mealName.set('');
    this.resetTransient();
  }

  private async loadRecipe(id: number): Promise<void> {
    try {
      const res = await firstValueFrom(this.authoring.getRecipe(id));
      this.populateFromRecipe(res.recipe);
      this.ingredients.set(res.ingredients ?? []);
      this.applyServerFlags(res.recipe);
      this.resetTransient();
    } catch {
      this.notification.show('Could not load the recipe.', 'error');
      this.close();
    }
  }

  private populateFromRecipe(r: Recipe): void {
    this.form.set({
      title: r.title ?? '',
      tagline: r.tagline ?? '',
      yieldNote: r.yieldNote ?? '',
      servingsBase: this.numStr(r.servingsBase),
      prepTimeMin: this.numStr(r.prepTimeMin),
      cookTimeMin: this.numStr(r.cookTimeMin),
      heroImageLink: r.heroImageLink ?? '',
      attributionAuthor: r.attributionAuthor ?? '',
      attributionLink: r.attributionLink ?? '',
      directions: r.directions ?? '',
      tips: r.tips ?? '',
      summaryCal: this.numStr(r.summaryCal),
      summaryProteinG: this.numStr(r.summaryProteinG),
      summaryFiberG: this.numStr(r.summaryFiberG),
      summaryFatG: this.numStr(r.summaryFatG),
      summaryCarbG: this.numStr(r.summaryCarbG),
    });
    // Prefill the Create-Meal name with the recipe title (editable).
    this.mealName.set(r.title ?? '');
  }

  /** Apply server-owned state WITHOUT touching the text form (avoids cursor jumps
   *  mid-edit). Used after saves / publishes / line ops. */
  private applyServerFlags(r: Recipe): void {
    this.recipeId.set(r.recipeId);
    this.isPublished.set(!!r.isPublished);
    this.isArchived.set(!!r.isArchived);
    this.isRegiApproved.set(!!r.isRegiApproved);
    this.recipeType.set(r.recipeType);
    this.recipePdfLink.set(r.recipePdfLink ?? null);
    this.pdfRenderedUtc.set(r.pdfRenderedUtc ?? null);
  }

  private resetTransient(): void {
    this.addRow.set({ displayQuantity: '', ingredientName: '', note: '' });
    this.addError.set(null);
    this.publishError.set(null);
    this.reorderError.set(null);
    this.createMealError.set(null);
    this.selectedLineId.set(null);
    this.boundNames.set(new Map());
    this.expanded.set(new Set());
  }

  // ---- Header persist -------------------------------------------------------
  private headerBody(): CreateRecipeRequest & UpdateRecipeRequest {
    const f = this.form();
    return {
      title: f.title.trim(),
      tagline: f.tagline.trim() || null,
      directions: f.directions.length ? f.directions : null,
      tips: f.tips.length ? f.tips : null,
      yieldNote: f.yieldNote.trim() || null,
      servingsBase: this.strNum(f.servingsBase),
      prepTimeMin: this.strNum(f.prepTimeMin),
      cookTimeMin: this.strNum(f.cookTimeMin),
      heroImageLink: f.heroImageLink.trim() || null,
      attributionAuthor: f.attributionAuthor.trim() || null,
      attributionLink: f.attributionLink.trim() || null,
      summaryCal: this.strNum(f.summaryCal),
      summaryProteinG: this.strNum(f.summaryProteinG),
      summaryFiberG: this.strNum(f.summaryFiberG),
      summaryFatG: this.strNum(f.summaryFatG),
      summaryCarbG: this.strNum(f.summaryCarbG),
    };
  }

  /** Create (first save) or PATCH the header. Returns success; no toast. */
  private async persistHeader(): Promise<boolean> {
    const body = this.headerBody();
    try {
      const id = this.recipeId();
      const res: RecipeResponse = id == null
        ? await firstValueFrom(this.authoring.createRecipe(body))
        : await firstValueFrom(this.authoring.updateRecipe(id, body));
      this.applyServerFlags(res.recipe);
      this.ingredients.set(res.ingredients ?? this.ingredients());
      return true;
    } catch (err) {
      this.notification.show(
        RecipeAuthoringService.messageFor(err, 'Could not save the recipe.'),
        'error',
      );
      return false;
    }
  }

  async save(): Promise<void> {
    if (this.saving() || !this.form().title.trim()) return;
    this.saving.set(true);
    const ok = await this.persistHeader();
    this.saving.set(false);
    if (ok) this.notification.show('Recipe saved.', 'success');
  }

  // ---- Publish (draft-first gate) -------------------------------------------
  canPublish(): boolean {
    return this.ingredients().length >= 1 && this.form().directions.trim() !== '';
  }

  async publish(): Promise<void> {
    if (this.saving()) return;
    this.publishError.set(null);
    this.saving.set(true);
    try {
      // Persist header first so directions are saved before the server gate.
      if (!(await this.persistHeader())) return;
      const res = await firstValueFrom(
        this.authoring.updateRecipe(this.recipeId()!, { isPublished: true }),
      );
      this.applyServerFlags(res.recipe);
      this.notification.show('Recipe published.', 'success');
      // Surface the rendered recipePdfLink (?v= cache-bust) in the header.
      await this.refreshServerState();
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 422) {
        this.publishError.set(
          RecipeAuthoringService.messageFor(
            err,
            'Cannot publish yet — add at least one ingredient and directions.',
          ),
        );
      } else {
        this.notification.show(RecipeAuthoringService.messageFor(err, 'Could not publish.'), 'error');
      }
    } finally {
      this.saving.set(false);
    }
  }

  async unpublish(): Promise<void> {
    if (this.saving() || this.recipeId() == null) return;
    this.saving.set(true);
    try {
      const res = await firstValueFrom(
        this.authoring.updateRecipe(this.recipeId()!, { isPublished: false }),
      );
      this.applyServerFlags(res.recipe);
      this.notification.show('Recipe unpublished.', 'success');
    } catch (err) {
      this.notification.show(RecipeAuthoringService.messageFor(err, 'Could not unpublish.'), 'error');
    } finally {
      this.saving.set(false);
    }
  }

  // ---- Archive / Unarchive (confirm) ----------------------------------------
  toggleArchive(): void {
    const id = this.recipeId();
    if (id == null) return;
    const archiving = !this.isArchived();
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        message: archiving
          ? 'Archive this recipe? It will be hidden from your active list but not deleted.'
          : 'Unarchive this recipe and return it to your active list?',
        confirmLabel: archiving ? 'Archive' : 'Unarchive',
        onConfirm: async () => {
          try {
            const res = await firstValueFrom(
              this.authoring.updateRecipe(id, { isArchived: archiving }),
            );
            this.applyServerFlags(res.recipe);
            this.notification.show(archiving ? 'Recipe archived.' : 'Recipe unarchived.', 'success');
          } catch (err) {
            this.notification.show(
              RecipeAuthoringService.messageFor(err, 'Could not update the recipe.'),
              'error',
            );
          }
        },
      },
    });
  }

  // ---- Ingredient lines -----------------------------------------------------
  async addLine(): Promise<void> {
    const row = this.addRow();
    const name = row.ingredientName.trim();
    if (!name) return;
    this.addError.set(null);
    // The recipe must exist before a line can be appended.
    if (this.recipeId() == null) {
      if (!this.form().title.trim()) {
        this.addError.set('Enter a title, then Save, before adding ingredients.');
        return;
      }
      if (!(await this.persistHeader())) return;
    }
    try {
      const res = await firstValueFrom(
        this.authoring.addIngredient(this.recipeId()!, {
          ingredientName: name,
          displayQuantity: row.displayQuantity.trim() || null,
          note: row.note.trim() || null,
        }),
      );
      this.ingredients.set(res.ingredients ?? []);
      this.addRow.set({ displayQuantity: '', ingredientName: '', note: '' });
    } catch (err) {
      this.addError.set(RecipeAuthoringService.messageFor(err, 'Could not add the ingredient.'));
    }
  }

  patchLine(ing: RecipeIngredient, field: 'displayQuantity' | 'ingredientName' | 'note' | 'unit', value: string): void {
    const id = this.recipeId();
    if (id == null) return;
    const v = value.trim();
    const cur = (ing[field] ?? '') as string;
    if (v === cur) return; // no-op on unchanged blur
    if (field === 'ingredientName' && !v) return; // name can't be cleared
    void this.commitLine(id, ing.recipeIngredientId, { [field]: v || (field === 'ingredientName' ? v : null) });
  }

  patchLineNum(ing: RecipeIngredient, field: 'quantity', value: string): void {
    const id = this.recipeId();
    if (id == null) return;
    const num = this.strNum(value);
    if (num === (ing.quantity ?? null)) return;
    void this.commitLine(id, ing.recipeIngredientId, { [field]: num });
  }

  private async commitLine(id: number, iid: number, patch: Record<string, unknown>): Promise<void> {
    try {
      const res = await firstValueFrom(this.authoring.updateIngredient(id, iid, patch));
      this.ingredients.set(res.ingredients ?? this.ingredients());
    } catch (err) {
      this.notification.show(RecipeAuthoringService.messageFor(err, 'Could not update the line.'), 'error');
    }
  }

  async removeLine(ing: RecipeIngredient): Promise<void> {
    const id = this.recipeId();
    if (id == null) return;
    try {
      await firstValueFrom(this.authoring.deleteIngredient(id, ing.recipeIngredientId));
      // DELETE returns 204 — drop it locally.
      this.ingredients.update((list) => list.filter((l) => l.recipeIngredientId !== ing.recipeIngredientId));
    } catch (err) {
      this.notification.show(RecipeAuthoringService.messageFor(err, 'Could not remove the line.'), 'error');
    }
  }

  /** Move a line up (-1) / down (+1) and PUT the full id permutation. 409 → reload. */
  async move(index: number, delta: number): Promise<void> {
    const id = this.recipeId();
    if (id == null) return;
    const list = [...this.ingredients()];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    this.ingredients.set(list); // optimistic
    this.reorderError.set(null);
    try {
      const res = await firstValueFrom(
        this.authoring.reorderIngredients(id, { ingredientIds: list.map((l) => l.recipeIngredientId) }),
      );
      this.ingredients.set(res.ingredients ?? list);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.reorderError.set(
          RecipeAuthoringService.messageFor(err, 'The ingredient list changed — reloaded the current order.'),
        );
      } else {
        this.notification.show(RecipeAuthoringService.messageFor(err, 'Could not reorder.'), 'error');
      }
      // Reload authoritative lines either way.
      try {
        const fresh = await firstValueFrom(this.authoring.getRecipe(id));
        this.ingredients.set(fresh.ingredients ?? []);
      } catch { /* leave optimistic */ }
    }
  }

  toggleExpand(iid: number): void {
    this.expanded.update((s) => {
      const n = new Set(s);
      n.has(iid) ? n.delete(iid) : n.add(iid);
      return n;
    });
  }
  isExpanded(iid: number): boolean {
    return this.expanded().has(iid);
  }

  // ---- Food binding (Step 1) ------------------------------------------------
  /** Select / deselect a line as the food-pick target. */
  selectLine(id: number): void {
    this.selectedLineId.set(this.selectedLineId() === id ? null : id);
  }

  /** A food was chosen in the docked lookaside — bind it to the selected line via
   *  the line PATCH (foodId/foodSource/quantity/unit). */
  async onFoodSelected(e: { food: Food; serving: number }): Promise<void> {
    const rid = this.recipeId();
    const lineId = this.selectedLineId();
    if (rid == null) return;
    if (lineId == null) {
      this.notification.show('Select an ingredient line first, then pick a food.', 'warning');
      return;
    }
    const food = e.food;
    const patch: UpdateRecipeIngredientRequest = {
      foodId: food.id ?? null,
      foodSource: (food.foodSource ?? 'food') as RecipeIngredientFoodSource,
      quantity: e.serving,
      unit: food.servingUnit ?? 'serving',
    };
    try {
      const res = await firstValueFrom(this.authoring.updateIngredient(rid, lineId, patch));
      this.ingredients.set(res.ingredients ?? this.ingredients());
      const name = food.shortDescription?.trim() || food.description || '';
      this.boundNames.update((m) => new Map(m).set(lineId, name));
    } catch (err) {
      this.notification.show(RecipeAuthoringService.messageFor(err, 'Could not bind the food.'), 'error');
    }
  }

  /** Reset a line to pending (foodSource='pending', foodId=null). */
  async unbindLine(ing: RecipeIngredient): Promise<void> {
    const rid = this.recipeId();
    if (rid == null) return;
    try {
      const res = await firstValueFrom(
        this.authoring.updateIngredient(rid, ing.recipeIngredientId, {
          foodId: null,
          foodSource: 'pending',
        }),
      );
      this.ingredients.set(res.ingredients ?? this.ingredients());
      this.boundNames.update((m) => {
        const n = new Map(m);
        n.delete(ing.recipeIngredientId);
        return n;
      });
    } catch (err) {
      this.notification.show(RecipeAuthoringService.messageFor(err, 'Could not unbind the line.'), 'error');
    }
  }

  // ---- Create Meal (Step 2) -------------------------------------------------
  async createMeal(): Promise<void> {
    const rid = this.recipeId();
    if (rid == null || this.creatingMeal()) return;
    this.createMealError.set(null);
    if (!this.allBound()) {
      this.createMealError.set('Bind every ingredient first. Still pending: ' + this.pendingLineNames().join(', '));
      return;
    }
    this.creatingMeal.set(true);
    try {
      await firstValueFrom(
        this.authoring.createMealFromRecipe(rid, { mealName: this.mealName().trim() || null }),
      );
      this.notification.show('Meal created — added to your notebook.', 'success');
      // Reuse the import-complete pattern: refresh the binder so the meal shows.
      void this.rotation.loadBinder();
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 422) {
        this.createMealError.set(
          RecipeAuthoringService.messageFor(err, 'Some ingredients are still unresolved.'),
        );
      } else {
        this.notification.show(RecipeAuthoringService.messageFor(err, 'Could not create the meal.'), 'error');
      }
    } finally {
      this.creatingMeal.set(false);
    }
  }

  /** Re-read server-owned state (flags, ingredients, recipePdfLink) without
   *  touching the text form — used after publish to surface the rendered PDF. */
  private async refreshServerState(): Promise<void> {
    const id = this.recipeId();
    if (id == null) return;
    try {
      const res = await firstValueFrom(this.authoring.getRecipe(id));
      this.applyServerFlags(res.recipe);
      this.ingredients.set(res.ingredients ?? this.ingredients());
    } catch {
      /* keep current state */
    }
  }

  // ---- Nav ------------------------------------------------------------------
  // Closing returns to the Author Studio's RecipeBox (which reloads on close).
  myRecipes(): void { this.tab.closeRecipeEditor(); }
  close(): void { this.tab.closeRecipeEditor(); }

  // ---- helpers --------------------------------------------------------------
  private numStr(n: number | null | undefined): string {
    return n == null ? '' : String(n);
  }
  private strNum(s: string): number | null {
    const t = s.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
}
