// src/app/components/add-food-panel/add-food-panel.ts
//
// Shared "Add a food to My Foods" dialog, mounted by BOTH the Foods-panel "+"
// and the binder food-lookaside "Quik add +". Modeled on the Add Meal dialog
// (numbered yellow-disc options) with a two-stage flow:
//
//   STAGE A — pick a food. Three numbered options:
//     1) Search — one box, a single FatSecret result section ("Food database").
//        Adding means the food isn't already in the system, so this dialog
//        searches FatSecret ONLY; Regi-approved discovery lives in the main
//        foods-panel search, not here.
//     2) Tethered scan — barcode scan on the user's live phone.
//     3) Photo identify — a shared drop zone (drop / paste / browse) that runs
//        POST /userfoods/identify-from-image and seeds the SAME FatSecret list
//        (fatsecretCandidates only — regiMatches from the response are ignored).
//
//   STAGE B — ratify. A vertical splitter appears; the options compress to a left
//     rail and the RHS shows the Nutrition Facts stage: quantity · unit · grams,
//     category, editable name, read-only long description, and a photo block that
//     overwrites via the shared meal-image-source dialog (kind 'food'). A food
//     that lands with no image gets a suggested photo (CDN → Open Food Facts).
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { UserFoodService } from '../../services/user-food.service';
import { FoodsService } from '../../services/foods.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { NotificationService } from '../../services/notification.service';
import { TetherService } from '../../services/tether.service';
import { UserFood } from '../../models/user-food.model';
import { FatSecretCandidate, IdentifiedFood } from '../../models/fatsecret.model';
import {
  MealImageSourceComponent,
  ImageSourceData,
  ImageSourceResult,
} from '../meal-image-source/meal-image-source';

/** The resolved food being ratified in Stage B. `ownedId` is the user's own
 *  UserFood id (null for an un-forked Regi favorite — forked lazily on edit). */
interface Resolved {
  id: number;
  ownedId: number | null;
  foodSource: 'food' | 'userfood';
}

@Component({
  selector: 'app-add-food-panel',
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:paste)': 'onDocPaste($event)' },
  template: `
    <div class="afp-backdrop" [class.inline]="inline()" (click)="onBackdrop()">
      <div class="afp-window" [class.inline]="inline()" [class.stage-b]="!!resolved()" (click)="$event.stopPropagation()">
        <div class="afp-header">
          <img src="images/yeh_logo_dark.png" alt="" class="afp-logo" />
          <span class="afp-title">Add a Food</span>
          <div class="dialog-discs">
            @if (canSave()) {
              <button type="button" class="dialog-disc dialog-disc-confirm"
                matTooltip="Save" matTooltipPosition="below" (click)="onSave()"
                aria-label="Save food">
                <mat-icon>check</mat-icon>
              </button>
            }
            <button type="button" class="dialog-disc dialog-disc-cancel"
              matTooltip="Close" matTooltipPosition="below" (click)="onClose()"
              aria-label="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>

        <div class="afp-body">
          @if (!resolved()) {
            <!-- STAGE A: single column of options -->
            <ng-container [ngTemplateOutlet]="optionsTpl" [ngTemplateOutletContext]="{ compact: false }" />
          } @else {
            <!-- STAGE B: splitter — compact options rail + Nutrition Facts stage -->
            <div class="afp-split" #split>
              <div class="afp-rail" [style.flex]="leftFraction()">
                <ng-container [ngTemplateOutlet]="optionsTpl" [ngTemplateOutletContext]="{ compact: true }" />
              </div>
              <div class="afp-splitter" (mousedown)="onSplitterDown($event)" (touchstart)="onSplitterTouch($event)">
                <div class="afp-splitter-grip"></div>
              </div>
              <div class="afp-nf" [style.flex]="1 - leftFraction()">
                <ng-container [ngTemplateOutlet]="nfTpl" />
              </div>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- ============ Options panel (Stage A full / Stage B rail) ============ -->
    <ng-template #optionsTpl let-compact="compact">
      <div class="afp-options" [class.compact]="compact">
        <!-- Option 1: Search. Kept in the Stage B rail (compact) too — with its
             "1" disc and the textbox reflecting what the user typed — so they can
             re-search and swap the food. Only options 2 (barcode) and 3 (photo)
             drop out of the rail, since they'd just confuse mid-ratify. -->
        <div class="afp-option">
          <span class="option-num">1</span>
          <label class="afp-opt-label">Search for a food</label>
          <input #searchBox type="text" class="afp-search regi-field"
            placeholder="Type a food name…"
            [value]="searchQuery()"
            (input)="onSearchInput($any($event.target).value)" />
          @if (searching()) {
            <mat-icon class="afp-search-spin" aria-hidden="true">autorenew</mat-icon>
          }
        </div>

        @if (!compact) {
          <!-- Option 2: Tethered barcode scan -->
          <div class="afp-option">
            <span class="option-num">2</span>
            <button type="button" class="afp-scan-btn"
              [disabled]="!tether.anyLive()"
              [class.disabled]="!tether.anyLive()"
              [matTooltip]="tether.anyLive() ? 'Scan a barcode with your phone' : 'Open Regi on your phone to enable'"
              matTooltipPosition="below"
              (click)="onScan()">
              <mat-icon>qr_code_scanner</mat-icon>
              <span>Scan a barcode</span>
            </button>
          </div>

          <!-- Option 3: Photo identify — the shared drop zone (its disc is the affordance) -->
          <div class="afp-option">
            <span class="option-num">3</span>
            <div class="afp-drop" tabindex="0"
              [class.busy]="identifying()"
              (dragover)="onDragOver($event)"
              (drop)="onDrop($event)"
              (click)="idInput.click()">
              @if (identifying()) {
                <mat-icon class="afp-drop-icon">hourglass_top</mat-icon>
                <span class="afp-drop-title">Identifying…</span>
              } @else {
                <mat-icon class="afp-drop-icon">add_a_photo</mat-icon>
                <span class="afp-drop-title">Identify from a photo</span>
                <span class="afp-drop-sub">
                  Drop, paste, or
                  <button type="button" class="afp-link" (click)="$event.stopPropagation(); idInput.click()">browse</button>
                  a food photo
                </span>
              }
            </div>
            <input #idInput type="file" accept="image/jpeg,image/png" hidden (change)="onIdFile(idInput)" />
          </div>

          <!-- Phone waiting panel (barcode scan in flight) -->
          @if (phoneWaiting()) {
            <div class="afp-waiting">
              <mat-icon class="afp-wait-icon">phonelink_ring</mat-icon>
              <span class="afp-wait-title">📱 Sent to your phone</span>
              <span class="afp-wait-sub">Open Regi on your phone and scan the barcode — the food drops in when it lands.</span>
              <button type="button" class="afp-wait-btn" (click)="phoneWaiting.set(false)">Close</button>
            </div>
          }

          <!-- Identify read-out -->
          @if (identified(); as idf) {
            <div class="afp-identified">
              Identified: <b>{{ idf.name }}</b>@if (idf.brand) { <span class="afp-brand">· {{ idf.brand }}</span> }
              <span class="afp-conf afp-conf-{{ idf.confidence }}">{{ idf.confidence }} confidence</span>
            </div>
          }
        }

        <!-- FatSecret results (search OR identify). This dialog searches the
             FatSecret food database ONLY — max 5 rows, no badges. -->
        @if (fsResults().length) {
          <div class="afp-results">
            <div class="afp-res-head">Food database</div>
            @for (c of fsResults(); track c.fatsecretFoodId) {
              <button type="button" class="afp-res-row" (click)="pickFatSecret(c)">
                <span class="afp-res-name">
                  {{ c.name }}@if (c.brand) { <span class="afp-brand">· {{ c.brand }}</span> }
                </span>
                @if (c.servingDescription) { <span class="afp-res-sub">{{ c.servingDescription }}</span> }
              </button>
            }
            <p class="afp-fs-credit">data provided by platform.fatsecret.com</p>
          </div>
        } @else if (searching()) {
          <p class="afp-hint">Searching…</p>
        } @else if (searchError()) {
          <p class="afp-hint afp-error">{{ searchError() }}</p>
        } @else if (resolving()) {
          <p class="afp-hint">Adding…</p>
        } @else if (searchQuery().trim().length >= 2) {
          <p class="afp-hint">No matches — try a different name, scan a barcode, or identify from a photo.</p>
        }
      </div>
    </ng-template>

    <!-- ================= Nutrition Facts stage (Stage B RHS) ================= -->
    <ng-template #nfTpl>
      @if (resolved()) {
        <div class="afp-nf-inner">
          <div class="afp-nf-title">Nutrition Facts</div>

          <label class="afp-field">
            <span>Name</span>
            <input type="text" class="afp-input regi-field"
              [value]="nameDraft()" (input)="nameDraft.set($any($event.target).value)" />
          </label>

          @if (longDesc()) {
            <div class="afp-longdesc">{{ longDesc() }}</div>
          }

          <div class="afp-fields">
            <label class="afp-field">
              <span>Quantity</span>
              <input type="number" min="0.01" step="0.25" class="afp-input regi-field"
                [value]="quantity()" (input)="quantity.set(numOf($any($event.target).value, 1))" />
            </label>
            <label class="afp-field">
              <span>Unit</span>
              <input type="text" class="afp-input regi-field" placeholder="e.g. container, cup"
                [value]="unit()" (input)="unit.set($any($event.target).value)" />
            </label>
            <label class="afp-field">
              <span>Grams / unit</span>
              <input type="number" min="0.01" step="1" class="afp-input regi-field"
                [value]="gramsPerUnit() ?? ''" (input)="gramsPerUnit.set(numOrNull($any($event.target).value))" />
            </label>
          </div>

          <label class="afp-field">
            <span>Category</span>
            <select class="afp-input regi-field"
              [value]="categoryId() ?? ''"
              (change)="onCategoryChange($any($event.target).value)">
              @for (c of categories(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </label>

          <div class="afp-nf-title">Per 100 g</div>
          @if (per100(); as m) {
            <div class="afp-macros">
              <div class="afp-macro"><b>{{ m.cal }}</b><span>cal</span></div>
              <div class="afp-macro"><b>{{ m.protein }}g</b><span>protein</span></div>
              <div class="afp-macro"><b>{{ m.fat }}g</b><span>fat</span></div>
              <div class="afp-macro"><b>{{ m.carbs }}g</b><span>carbs</span></div>
            </div>
          } @else {
            <p class="afp-hint">No nutrition on file yet.</p>
          }

          <div class="afp-nf-title afp-nf-title-photo">
            <span>Photo</span>
            @if (photoSearching()) {
              <span class="afp-photo-finding">
                <mat-icon class="afp-photo-finding-spin" aria-hidden="true">autorenew</mat-icon>
                finding image…
              </span>
            }
          </div>
          <div class="afp-photo" [class.suggested]="photoIsSuggestion()">
            @if (photoUrl()) {
              <img [src]="photoUrl()" alt="" class="afp-photo-img" />
            } @else {
              <div class="afp-photo-empty"><mat-icon>image</mat-icon></div>
            }
          </div>
          @if (!photoSearching() && photoIsSuggestion()) {
            <p class="afp-hint">Suggested — Save to keep it, or change it.</p>
          }
          <button type="button" class="afp-photo-change" (click)="onChangePhoto()">
            <mat-icon>photo_camera</mat-icon> Change photo
          </button>
        </div>
      }
    </ng-template>
  `,
  styleUrls: ['./add-food-panel.scss'],
})
export class AddFoodPanelComponent implements OnInit {
  private userFoods = inject(UserFoodService);
  private foodsService = inject(FoodsService);
  private imageUpload = inject(ImageUploadService);
  private notification = inject(NotificationService);
  protected tether = inject(TetherService);
  private dialog = inject(MatDialog);

  /** Optional search term to seed option 1 with (e.g. the My Foods search text). */
  readonly initialQuery = input<string>('');
  /** Inline mode: a plain fill of the host (no backdrop / bloom window). */
  readonly inline = input<boolean>(false);

  /** Fired when the dialog should close (host controls visibility with @if). */
  readonly close = output<void>();
  /** Fired when a food was added/changed — the host reloads its MyFoods list. */
  readonly added = output<void>();

  /** Category vocabulary for the Stage B dropdown. */
  readonly categories = this.foodsService.categories;

  ngOnInit(): void {
    void this.foodsService.loadCategories();
    // Seed option 1 from the opener (inputs are bound by ngOnInit); search if set.
    const q = this.initialQuery().trim();
    if (q) {
      this.searchQuery.set(q);
      void this.runSearch(q);
    }
  }

  private didAdd = false;

  // ---- Option 1: search (FatSecret database ONLY) --------------------------
  /** Search cap — the API default is 8 so branded matches ranking 6th–8th aren't
   *  cut; sending a smaller max would defeat that. */
  private static readonly MAX_SEARCH_RESULTS = 8;
  /** Photo-identify cap — the identify-from-image endpoint caps candidates at 5
   *  server-side, so the list mirrors that. */
  private static readonly MAX_IDENTIFY_RESULTS = 5;
  readonly searchQuery = signal('');
  readonly fsResults = signal<FatSecretCandidate[]>([]);
  readonly resolving = signal(false);
  /** True while a search's HTTP call is in flight (drives the inline spinner). */
  readonly searching = signal(false);
  /** Set when the search failed, so the user sees why instead of a dead box. */
  readonly searchError = signal<string | null>(null);
  private searchSeq = 0;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.identified.set(null);
    const q = value.trim();
    if (this.searchDebounce) { clearTimeout(this.searchDebounce); this.searchDebounce = null; }
    if (q.length < 2) {
      this.fsResults.set([]);
      this.searching.set(false);
      this.searchError.set(null);
      return;
    }
    // 300 ms debounce — coalesce keystrokes into one FatSecret call.
    this.searchDebounce = setTimeout(() => {
      this.searchDebounce = null;
      void this.runSearch(q);
    }, 300);
  }

  private async runSearch(q: string): Promise<void> {
    const seq = ++this.searchSeq;
    this.searching.set(true);
    this.searchError.set(null);
    try {
      const resp = await firstValueFrom(this.userFoods.searchFatSecret(q, AddFoodPanelComponent.MAX_SEARCH_RESULTS));
      if (seq !== this.searchSeq) return; // a newer search superseded this one
      this.fsResults.set((resp.candidates ?? []).slice(0, AddFoodPanelComponent.MAX_SEARCH_RESULTS));
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.fsResults.set([]);
      this.searchError.set('Couldn’t reach the food search — please try again.');
      console.warn('[AddFood] FatSecret search failed', err);
    } finally {
      if (seq === this.searchSeq) this.searching.set(false);
    }
  }

  // ---- Option 2: tethered barcode scan -------------------------------------
  readonly phoneWaiting = signal(false);
  private scanMsgId: string | null = null;

  async onScan(): Promise<void> {
    if (!this.tether.anyLive()) return;
    try {
      this.scanMsgId = await this.tether.requestCapture({ kind: 'scan', id: null, name: 'Scan a barcode' });
      this.phoneWaiting.set(true);
      this.notification.show('📱 Sent to your phone — scan a barcode.', 'info');
    } catch {
      this.notification.show('Could not reach your phone. Please try again.', 'error');
    }
  }

  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  // React to the scan's terminal outcome. effect() reads captureEvent; guarded to
  // our own scan messageId so unrelated captures don't touch this dialog.
  private readonly scanEffect = effect(
    () => {
      const ev = this.tether.captureEvent();
      if (!ev || ev.kind !== 'scan') return;
      if (this.scanMsgId && ev.messageId !== this.scanMsgId) return;
      this.phoneWaiting.set(false);
      this.scanMsgId = null;
      if (ev.status === 'done' && ev.foodResult?.food) {
        this.didAdd = true;
        this.resolveFromUserFood(ev.foodResult.food);
      } else if (ev.status === 'failed' && ev.reason === 'notFound') {
        this.notification.show('That barcode isn’t in the database — try searching by name.', 'warning');
        this.searchBox()?.nativeElement.focus();
      } else if (ev.status === 'failed' || ev.status === 'timeout') {
        this.notification.show('The scan didn’t complete. Please try again.', 'error');
      }
    },
    { allowSignalWrites: true },
  );

  // ---- Option 3: photo identify --------------------------------------------
  readonly identifying = signal(false);
  readonly identified = signal<IdentifiedFood | null>(null);
  /** The dropped/pasted File, kept in memory to re-upload after committing a
   *  userfood that ends up with no image. */
  private readonly stagedPhoto = signal<File | null>(null);

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
  }
  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    const file = ev.dataTransfer?.files?.[0];
    if (file) void this.identify(file);
  }
  onIdFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.identify(file);
  }
  onDocPaste(ev: ClipboardEvent): void {
    if (this.resolved()) return; // Stage B photo paste is handled by the image dialog
    const file = ev.clipboardData?.files?.[0];
    if (file && /^image\//.test(file.type)) {
      ev.preventDefault();
      void this.identify(file);
    }
  }

  private async identify(file: File): Promise<void> {
    if (this.identifying()) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      this.notification.show('Please use a JPG or PNG image.', 'error');
      return;
    }
    this.stagedPhoto.set(file);
    this.identifying.set(true);
    try {
      const resp = await firstValueFrom(this.userFoods.identifyFromImage(file));
      this.identified.set(resp.identified);
      // FatSecret candidates ONLY — regiMatches from the response are ignored
      // (Regi-approved discovery lives in the main foods-panel search).
      const cands = (resp.fatsecretCandidates ?? []).slice(0, AddFoodPanelComponent.MAX_IDENTIFY_RESULTS);
      this.fsResults.set(cands);
      if (!cands.length) {
        this.notification.show('Couldn’t match that photo — try searching by name.', 'warning');
      }
    } catch {
      this.notification.show('Photo identification failed. Please try again.', 'error');
    } finally {
      this.identifying.set(false);
    }
  }

  // ---- Pick → Stage B ------------------------------------------------------
  async pickFatSecret(c: FatSecretCandidate): Promise<void> {
    if (this.resolving()) return;
    this.resolving.set(true);
    try {
      const res = await firstValueFrom(this.userFoods.createFromFatSecret({ fatsecretFoodId: c.fatsecretFoodId }));
      const food = res?.food;
      if (!food) {
        this.notification.show('Could not create that food.', 'error');
        return;
      }
      this.didAdd = true;
      // Photo: the API async-enriches from-fatsecret creates. When imageStatus is
      // 'fetching', the server is already pulling a photo — SKIP the client CDN/OFF
      // chain (which would race the server and set a competing image) and instead
      // poll for the server's image to land. Otherwise ('needed' / absent), run the
      // existing client suggestion chain as before.
      if (!food.foodImage && res.imageStatus === 'fetching') {
        this.resolveFromUserFood(food, /* suggestWhenEmpty */ false);
        void this.pollForServerImage(food.id);
      } else {
        this.resolveFromUserFood(food, /* suggestWhenEmpty */ true);
      }
    } catch {
      this.notification.show('Could not add that food from the database.', 'error');
    } finally {
      this.resolving.set(false);
    }
  }

  // ---- Stage B state -------------------------------------------------------
  readonly resolved = signal<Resolved | null>(null);
  readonly nameDraft = signal('');
  readonly longDesc = signal('');
  readonly unit = signal('');
  readonly gramsPerUnit = signal<number | null>(null);
  readonly quantity = signal(1);
  readonly categoryId = signal<number | null>(null);
  private nfStore = signal<{ calories?: number; proteinG?: number; totalFatG?: number; totalCarbohydrateG?: number } | null>(null);

  readonly photoUrl = signal('');
  readonly photoIsSuggestion = signal(false);
  readonly photoBusy = signal(false);
  readonly photoSearching = signal(false);

  // Baselines for dirty detection.
  private baseName = '';
  private baseUnit = '';
  private baseGrams: number | null = null;
  private baseQty = 1;
  private baseCategoryId: number | null = null;

  private resolveFromUserFood(f: UserFood, suggestWhenEmpty = true): void {
    this.resolved.set({ id: f.id, ownedId: f.id, foodSource: 'userfood' });
    this.seed(
      f.shortDescription ?? '', f.description ?? '',
      f.categoryId ?? null, f.servingUnit ?? '', f.servingGramsPerUnit ?? null,
      f.servingSizeMultiplicand ?? 1, f.foodImage ?? '', f.nutritionFacts, suggestWhenEmpty,
    );
  }

  /** Poll for the server's async-enriched photo after a from-fatsecret create with
   *  imageStatus 'fetching'. Every 2 s, up to 4 attempts; the first non-empty
   *  foodImage wins and is shown as the real (non-suggestion) photo. Bails if the
   *  user has since resolved a different food. No client CDN/OFF fallback — that's
   *  the race this gating exists to avoid. */
  private async pollForServerImage(userFoodId: number): Promise<void> {
    this.photoSearching.set(true);
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (this.resolved()?.ownedId !== userFoodId) return; // superseded
        const f = await this.userFoods.getUserFoodById(userFoodId);
        const img = f?.foodImage ?? '';
        if (img) {
          this.photoUrl.set(img);
          this.photoIsSuggestion.set(false); // the server's real photo, not a suggestion
          return;
        }
      }
    } finally {
      if (this.resolved()?.ownedId === userFoodId) this.photoSearching.set(false);
    }
  }
  private seed(
    name: string, desc: string, categoryId: number | null, unit: string,
    grams: number | null, qty: number, image: string,
    nf: { calories?: number | null; proteinG?: number | null; totalFatG?: number | null; totalCarbohydrateG?: number | null } | null | undefined,
    suggestWhenEmpty: boolean,
  ): void {
    this.nameDraft.set(name.trim() || desc);
    this.longDesc.set(desc);
    this.categoryId.set(categoryId);
    this.unit.set(unit);
    this.gramsPerUnit.set(grams);
    this.quantity.set(qty || 1);
    this.nfStore.set(nf ? {
      calories: nf.calories ?? 0, proteinG: nf.proteinG ?? 0,
      totalFatG: nf.totalFatG ?? 0, totalCarbohydrateG: nf.totalCarbohydrateG ?? 0,
    } : null);
    this.baseName = this.nameDraft();
    this.baseUnit = unit;
    this.baseGrams = grams;
    this.baseQty = qty || 1;
    this.baseCategoryId = categoryId;
    this.photoIsSuggestion.set(false);
    if (image) {
      this.photoUrl.set(image);
    } else {
      this.photoUrl.set('');
      if (suggestWhenEmpty) void this.suggestPhoto(name || desc);
    }
  }

  /** Suggest a photo for a food with none: our CDN by description first, then Open
   *  Food Facts (.org) by name. The two lookups are INDEPENDENTLY guarded — a CDN
   *  miss (which throws) must not skip the .org fallback. */
  private async suggestPhoto(term: string): Promise<void> {
    const q = (term || '').trim();
    if (!q) return;
    this.photoSearching.set(true);
    let url = '';
    try {
      const cdn = await this.imageUpload.lookupImageUrl(q);
      url = cdn?.product_image_url || '';
    } catch {
      /* CDN has no image (throws on 404) — fall through to Open Food Facts */
    }
    if (!url) {
      url = await this.imageUpload.searchOpenFoodFactsImage(q); // own try/catch, returns ''
    }
    if (url) {
      this.photoUrl.set(url);
      this.photoIsSuggestion.set(true);
    }
    this.photoSearching.set(false);
  }

  readonly per100 = computed<{ cal: number; protein: number; fat: number; carbs: number } | null>(() => {
    const nf = this.nfStore();
    if (!nf) return null;
    const r = (n: number | undefined) => Math.round(n ?? 0);
    return { cal: r(nf.calories), protein: r(nf.proteinG), fat: r(nf.totalFatG), carbs: r(nf.totalCarbohydrateG) };
  });

  onCategoryChange(value: string): void {
    const id = Number(value);
    this.categoryId.set(Number.isFinite(id) ? id : null);
  }

  private nameDirty(): boolean { return this.nameDraft().trim() !== this.baseName.trim(); }
  private categoryDirty(): boolean { return this.categoryId() !== this.baseCategoryId; }
  private geometryDirty(): boolean {
    return this.unit().trim() !== this.baseUnit.trim()
      || this.gramsPerUnit() !== this.baseGrams
      || this.quantity() !== this.baseQty;
  }

  /** Green disc: always available in Stage B (Save & Done). */
  readonly canSave = computed<boolean>(() => this.resolved() != null);

  numOf(v: string, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  numOrNull(v: string): number | null {
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
  }

  // ---- Stage B photo overwrite (shared meal-image-source dialog) ------------
  async onChangePhoto(): Promise<void> {
    const ownedId = await this.ensureOwned();
    if (ownedId == null) return;
    const data: ImageSourceData = { kind: 'food', id: ownedId, name: this.nameDraft().trim() || 'food' };
    const ref = this.dialog.open(MealImageSourceComponent, { panelClass: 'meal-image-dialog-panel', autoFocus: false, data });
    const result = (await firstValueFrom(ref.afterClosed())) as ImageSourceResult | undefined;
    if (result?.action === 'uploaded' && result.cdnUrl) {
      this.photoUrl.set(result.cdnUrl);
      this.photoIsSuggestion.set(false);
      this.stagedPhoto.set(null); // the new photo is now on the food
    }
  }

  // ---- Commit / dismiss ----------------------------------------------------
  /** The resolved food's OWN userfood id. Every pick now resolves to a userfood
   *  (FatSecret create / barcode), so the id is always present — there is no
   *  lazy Regi fork any more. */
  private ensureOwned(): number | null {
    return this.resolved()?.ownedId ?? null;
  }

  async onSave(): Promise<void> {
    const s = this.resolved();
    if (!s) return;
    const needsOwn = this.nameDirty() || this.categoryDirty() || this.geometryDirty() || this.stagedPhoto() != null;
    let ownedId = s.ownedId;
    if (needsOwn && ownedId == null) {
      ownedId = await this.ensureOwned();
    }
    if (ownedId != null) {
      if (this.geometryDirty() && this.unit().trim() && this.gramsPerUnit()) {
        try {
          await firstValueFrom(this.foodsService.patchServingGeometry({
            foodId: ownedId, foodSource: 'userfood',
            unitName: this.unit().trim(), gramsPerUnit: this.gramsPerUnit()!, defaultQuantity: this.quantity(),
          }));
        } catch { this.notification.show('Could not save serving units.', 'error'); }
      }
      if (this.nameDirty()) await this.userFoods.setUserFoodName(ownedId, this.nameDraft().trim());
      if (this.categoryDirty() && this.categoryId() != null) await this.userFoods.setUserFoodCategory(ownedId, this.categoryId()!);
      // Photo: prefer a staged (dropped) File; else approve a suggestion.
      const staged = this.stagedPhoto();
      if (staged) {
        try {
          const res = await this.imageUpload.uploadProductImage(ownedId, staged);
          if (res?.cdn_url) this.photoUrl.set(res.cdn_url);
        } catch { /* leave without a photo */ }
        this.stagedPhoto.set(null);
      } else if (this.photoIsSuggestion()) {
        await this.approveSuggestedPhoto(ownedId);
      }
    }
    this.finish();
  }

  /** Fetch a suggested photo, wrap it as a File, and upload it so the food gets a
   *  proper CDN + thumbnail. */
  private async approveSuggestedPhoto(ownedId: number): Promise<void> {
    const url = this.photoUrl();
    if (!url) return;
    this.photoBusy.set(true);
    try {
      const blob = await (await fetch(url)).blob();
      const type = /png(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg';
      const file = new File([await blob.arrayBuffer()], 'suggested-photo', { type });
      const res = await this.imageUpload.uploadProductImage(ownedId, file);
      if (res?.cdn_url) this.photoUrl.set(res.cdn_url);
      this.photoIsSuggestion.set(false);
    } catch {
      /* cross-origin / upload failed — keep the food, skip the photo */
    } finally {
      this.photoBusy.set(false);
    }
  }

  onBackdrop(): void {
    // Clicking off does NOT close — the red X is the explicit dismiss.
  }
  onClose(): void {
    this.finish();
  }
  private finish(): void {
    if (this.didAdd) this.added.emit();
    this.close.emit();
  }

  // ---- Vertical splitter (Stage B) — mirrors the foods-panel pattern --------
  readonly leftFraction = signal(0.42);
  private readonly splitRef = viewChild<ElementRef<HTMLElement>>('split');
  private splitStartX = 0;
  private splitStartFraction = 0.42;

  onSplitterDown(ev: MouseEvent): void {
    ev.preventDefault();
    this.splitStart(ev.clientX);
    const move = (e: MouseEvent) => this.splitUpdate(e.clientX);
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  onSplitterTouch(ev: TouchEvent): void {
    this.splitStart(ev.touches[0].clientX);
    const move = (e: TouchEvent) => this.splitUpdate(e.touches[0].clientX);
    const end = () => { document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); };
    document.addEventListener('touchmove', move);
    document.addEventListener('touchend', end);
  }
  private splitStart(x: number): void {
    this.splitStartX = x;
    this.splitStartFraction = this.leftFraction();
  }
  private splitUpdate(x: number): void {
    const w = this.splitRef()?.nativeElement.clientWidth ?? 1;
    const f = this.splitStartFraction + (x - this.splitStartX) / w;
    this.leftFraction.set(Math.max(0.25, Math.min(0.6, f)));
  }
}
