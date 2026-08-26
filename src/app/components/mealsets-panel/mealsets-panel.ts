// src/app/components/mealsets-panel/mealsets-panel.ts
//
// MealSet Studio HUB (MealSetOwner surface, left-nav "MealSets", role-gated).
// A calm overview of the author's functional areas — editing drills into focused
// overlays (mirrors the recipe editor):
//   - Author profile (bio / credentials / author pic) — collapsible card
//   - Read-only revenue-share deal (hidden when there's no contract)
//   - My MealSets — promo-photo tiles; a tile / "+ New MealSet" opens the
//     full-screen MealSet editor overlay (mealset-editor-panel)
//   - RecipeBox — import a PDF OR author a recipe; the list opens the recipe editor
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
import { MealSet, MealSetContractView, RecipeSummary } from '../../models';

@Component({
  selector: 'app-mealsets-panel',
  imports: [DatePipe, MatIconModule, MatTooltipModule, ImageDropComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="msp">
      <header class="msp-header">
        <span class="msp-title"><mat-icon class="msp-title-icon">restaurant_menu</mat-icon>MealSet Studio</span>
        <button type="button" class="msp-close" matTooltip="Close MealSets" matTooltipPosition="below"
          (click)="tabService.closePanel()">
          <mat-icon>logout</mat-icon>
        </button>
      </header>

      <div class="msp-body">
        <!-- ============ Author profile ============ -->
        <section class="msp-card">
          <div class="msp-card-head">
            <h3 class="msp-card-title">Author profile
              <span class="msp-info"
                matTooltip="Fill in required fields, and save before you can add MealSets. Information is displayed in the MealSet Gallery on RegiMenu's Website — the area for purchasing MealSets."
                matTooltipPosition="right">&#9432;</span>
            </h3>
            @if (profileSaved()) {
              <button type="button" class="msp-collapse"
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
              <input class="msp-input" type="text" [placeholder]="accountName() || 'Your display name'"
                [value]="profileAuthorName()" (input)="profileAuthorName.set($any($event.target).value)" />
            </label>
            <label class="msp-field">
              <span class="msp-label">Bio <span class="msp-req">* required</span></span>
              <textarea class="msp-input msp-textarea" rows="2" [value]="profileBio()"
                (input)="profileBio.set($any($event.target).value)"></textarea>
            </label>
            <label class="msp-field">
              <span class="msp-label">Credentials <span class="msp-opt">(optional)</span></span>
              <textarea class="msp-input msp-textarea" rows="2" [value]="profileCredentials()"
                (input)="profileCredentials.set($any($event.target).value)"></textarea>
            </label>
            <div class="msp-field">
              <span class="msp-label">Author photo <span class="msp-req">* required</span></span>
              <app-image-drop name="author" [value]="profilePic()" (valueChange)="profilePic.set($event)" />
            </div>
            <label class="msp-field">
              <span class="msp-label">Backlink URL<span class="msp-info"
                  matTooltip="Use Backlink to your Amazon book, your services website, or your YouTube channel"
                  matTooltipPosition="right">&#9432;</span> <span class="msp-opt">(optional)</span></span>
              <input class="msp-input" type="url" placeholder="https://your-site-or-social"
                [value]="backLink()" (input)="backLink.set($any($event.target).value)" />
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

        <!-- ============ My MealSets (promo-photo tiles → editor overlay) ============ -->
        <section class="msp-card" [class.msp-disabled]="!profileComplete()">
          <div class="msp-card-head">
            <h3 class="msp-card-title">My MealSets
              <span class="msp-info"
                matTooltip="MealSets require you to have created meals already. If you haven't, go to Menus & Meals and import from recipes or composite your meals first."
                matTooltipPosition="right">&#9432;</span>
            </h3>
            <button type="button" class="msp-btn primary" [disabled]="!profileComplete()"
              [matTooltip]="profileComplete() ? '' : 'Save a complete Author profile (Bio + photo) to create a MealSet'"
              matTooltipPosition="above" (click)="tabService.openMealsetEditor(null)">+ New MealSet</button>
          </div>
          @if (authoredSets().length) {
            <div class="msp-tiles">
              @for (s of authoredSets(); track s.mealSetId) {
                <button type="button" class="msp-tile" (click)="tabService.openMealsetEditor(s.mealSetId)">
                  <span class="msp-tile-cover">
                    @if (s.mealSetPic1) {
                      <img [src]="s.mealSetPic1" [alt]="s.name" />
                    } @else {
                      <mat-icon>restaurant_menu</mat-icon>
                    }
                  </span>
                  <span class="msp-tile-name">{{ s.name }}</span>
                  @if (s.genres.length) {
                    <span class="msp-tile-genres">
                      @for (g of s.genres; track g) { <span class="msp-set-genre">{{ g }}</span> }
                    </span>
                  }
                  <span class="msp-tile-flags">
                    <span class="msp-flag" [class.on]="s.active"
                      matTooltip="Live status is admin-set (catalog visibility)" matTooltipPosition="above">{{ s.active ? 'Live' : 'Inactive' }}</span>
                    <span class="msp-flag price">{{ s.price > 0 ? ('$' + s.price) : 'Free' }}</span>
                  </span>
                </button>
              }
            </div>
          } @else {
            <p class="msp-empty">No MealSets yet — create your first.</p>
          }
        </section>

        <!-- ============ RecipeBox ============ -->
        <section class="msp-card">
          <div class="msp-card-head">
            <h3 class="msp-card-title">RecipeBox
              <span class="msp-info"
                matTooltip="Author your own recipes, or import from a PDF. They appear here as drafts until you publish them."
                matTooltipPosition="right">&#9432;</span>
            </h3>
          </div>

          <!-- Two intake modes, side by side: import a PDF — or — author from scratch. -->
          <div class="rb-intake">
            <div class="rb-dropzone" [class.dragover]="rbDragOver()"
              (dragover)="onRbDragOver($event)" (dragleave)="onRbDragLeave($event)" (drop)="onRbDrop($event)"
              (click)="rbFile.click()">
              <mat-icon>upload_file</mat-icon>
              <span class="rb-dz-title">Import a recipe</span>
              <span class="rb-dz-sub">Drag &amp; drop a PDF, JPEG or PNG — or click to browse</span>
              <input #rbFile type="file" accept="application/pdf,image/jpeg,image/png" hidden
                (change)="onRbFileSelected(rbFile)" />
            </div>
            <div class="rb-or"><span>or</span></div>
            <button type="button" class="rb-create" (click)="newRecipe()">
              <mat-icon>edit_note</mat-icon>
              <span class="rb-dz-title">Create recipe</span>
              <span class="rb-dz-sub">Author your own from scratch</span>
            </button>
          </div>

          @if (recipes().length) {
            <div class="rb-search">
              <mat-icon class="rb-search-icon">search</mat-icon>
              <input class="msp-input rb-search-input" type="text" placeholder="Search recipes by title…"
                [value]="recipeSearch()" (input)="recipeSearch.set($any($event.target).value)" />
              @if (recipeSearch()) {
                <button type="button" class="rb-search-clear" matTooltip="Clear" (click)="recipeSearch.set('')">
                  <mat-icon>close</mat-icon>
                </button>
              }
            </div>
            @if (filteredRecipes().length) {
              <ul class="msp-set-list">
                @for (r of filteredRecipes(); track r.id; let i = $index) {
                  <li class="msp-set-item" (click)="openRecipe(r.id)">
                    <span class="rb-num">{{ i + 1 }}.</span>
                    <span class="msp-set-name">{{ r.title }}</span>
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

  // ---- Authored sets (tiles) ------------------------------------------------
  readonly authoredSets = signal<MealSet[]>([]);

  // ---- RecipeBox (authored recipes list) ------------------------------------
  readonly recipes = signal<RecipeSummary[]>([]);
  readonly recipeSearch = signal('');
  readonly filteredRecipes = computed<RecipeSummary[]>(() => {
    const q = this.recipeSearch().trim().toLowerCase();
    const list = this.recipes();
    return q ? list.filter((r) => (r.title ?? '').toLowerCase().includes(q)) : list;
  });

  /** The name on the user's account (Auth0 profile) — the default author name. */
  readonly accountName = toSignal(this.auth.user$.pipe(map((u) => u?.name ?? '')), {
    initialValue: '',
  });

  constructor() {
    // Reload the recipe list whenever the recipe editor closes (a save/create there
    // should surface here) and on first mount.
    effect(() => {
      if (!this.tabService.recipeEditorOpen()) void this.loadRecipes();
    });
    // Reload the MealSet tiles whenever the MealSet editor overlay closes.
    effect(() => {
      if (!this.tabService.mealsetEditorOpen()) void this.loadAuthored();
    });
  }

  ngOnInit(): void {
    void this.loadAuthored();
    void this.loadProfile();
    void this.loadContract();
  }

  private async loadAuthored(): Promise<void> {
    try {
      this.authoredSets.set((await firstValueFrom(this.mealSetService.getAuthored())) ?? []);
    } catch {
      this.authoredSets.set([]);
    }
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

  // ---- Owner profile --------------------------------------------------------
  readonly profileAuthorName = signal('');
  readonly profileBio = signal('');
  readonly profileCredentials = signal('');
  readonly profilePic = signal('');
  readonly backLink = signal('');
  readonly backLinkPhoto = signal('');
  readonly savingProfile = signal(false);
  /** True once a SAVED profile has both a Bio and an Author photo — gates "+ New MealSet". */
  readonly profileComplete = signal(false);
  /** True once a profile row exists — only then is the profile card collapsible. */
  readonly profileSaved = signal(false);
  /** Collapsed state — defaults collapsed for a returning author. */
  readonly profileCollapsed = signal(false);

  // ---- Read-only contract ---------------------------------------------------
  readonly contract = signal<MealSetContractView | null>(null);

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
      this.profileComplete.set(false);
      this.profileSaved.set(false);
      this.profileCollapsed.set(false);
    }
  }

  private async loadContract(): Promise<void> {
    try {
      this.contract.set(await firstValueFrom(this.mealSetService.getContract()));
    } catch {
      this.contract.set(null);
    }
  }

  async saveProfile(): Promise<void> {
    if (this.savingProfile()) return;
    this.savingProfile.set(true);
    try {
      await firstValueFrom(
        this.mealSetService.updateOwnerProfile({
          authorName: this.profileAuthorName().trim() || this.accountName() || null,
          authorBio: this.profileBio().trim() || null,
          authorCredentials: this.profileCredentials().trim() || null,
          authorPic: this.profilePic() || null,
          backLink: this.backLink().trim() || null,
          backLinkPhoto: this.backLinkPhoto().trim() || null,
        }),
      );
      this.profileComplete.set(!!(this.profileBio().trim() && this.profilePic()));
      this.profileSaved.set(true);
      this.profileCollapsed.set(true);
      this.notification.show('Author profile saved.', 'success');
    } catch {
      this.notification.show('Could not save the author profile.', 'error');
    } finally {
      this.savingProfile.set(false);
    }
  }
}
