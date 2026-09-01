// src/app/components/shopping-panel/shopping-panel.ts
//
// Shopping List panel. The star is the CONSOLIDATED list computed server-side
// from every tracked meal item across the current rotation's menus
// (GET /api/rotation/{id}/shopping-list) — deduped, summed, retail-rounded, and
// grouped by category. Columns: Qty · Unit · Item, plus a per-row "Need" slider
// (ON by default) whose off-state persists via the shopping-progress endpoint.
// The quantity basis is either each recipe's own servings, or an explicit Scale
// factor. The old per-category "Staples & one-time" add-boxes are still here but
// demoted to a collapsed section below (persisted user data via SettingsService).
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../services/notification.service';
import { RotationService } from '../../services/rotation.service';
import { TabService } from '../../services/tab.service';
import { ShoppingStaple } from '../../models/settings.models';
import { ShoppingListResponse, ShoppingListPdfRequest } from '../../models/generated/shopping.schema';

type StapleCategory = 'proteins' | 'produce' | 'bulk' | 'dairy' | 'aisles' | 'non_food' | 'fruits';

interface CategorySection {
  id: StapleCategory;
  label: string;
}

/** A computed row flattened for display (with a stable identity key). */
interface ListRow {
  key: string;
  name: string;
  quantity: string;
  unit: string;
}
interface ListGroup {
  category: string;
  label: string;
  items: ListRow[];
}
/** A display banner. Most banners wrap ONE category; the "Produce" banner wraps the
 *  produce (Vegetables) + fruits (Fruits) categories as sub-headed sub-groups, the
 *  way a grocery store shelves produce together. */
interface ListSection {
  key: string;
  label: string;
  subGroups: ListGroup[]; // length > 1 → render the sub-headers
}

// Server category token → display label + preferred display order.
const CAT_LABEL: Record<string, string> = {
  produce: 'Vegetables',
  fruits: 'Fruits',
  proteins: 'Proteins',
  dairy: 'Dairy',
  bulk: 'Carbs',
  aisles: 'Processed / Aisles',
};
const CAT_RANK: Record<string, number> = {
  produce: 0, fruits: 1, proteins: 2, dairy: 3, bulk: 4, aisles: 5,
};

@Component({
  selector: 'app-shopping-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Quantity basis — either each recipe's own servings, OR an explicit
           scale factor. The "-or-" makes the either/or unmistakable. -->
      <div class="shopping-top no-print">
        <!-- Order: boxed toggle group · Print · collapse-all (far right). -->
        <div class="scale-radio">
          <label
            class="scale-opt"
            [matTooltip]="'Always scale to ' + scaleValue()"
            matTooltipPosition="below">
            <input
              type="radio"
              name="scaleMode"
              [checked]="scaleMode() === 'custom'"
              (change)="scaleMode.set('custom')" />
            <span>Scale</span>
            <input
              type="number"
              class="scale-input"
              min="1"
              [value]="scaleValue()"
              (focus)="scaleMode.set('custom')"
              (change)="onScaleInput($event)" />
          </label>
          <label
            class="scale-opt"
            matTooltip="Use Servings from recipe, and Scale value otherwise"
            matTooltipPosition="below">
            <input
              type="radio"
              name="scaleMode"
              [checked]="scaleMode() === 'recipe'"
              (change)="scaleMode.set('recipe')" />
            <span>Servings</span>
          </label>
        </div>
        <button
          type="button"
          class="shopping-print-btn"
          matTooltip="Print / Save as PDF"
          matTooltipPosition="below"
          (click)="print()">
          <mat-icon>print</mat-icon>
        </button>
        @if (isSaving()) {
          <span class="auto-save-indicator">saving...</span>
        }
        <button
          type="button"
          class="shopping-collapse-all"
          matTooltip="Collapse / expand all sections"
          matTooltipPosition="below"
          (click)="toggleAllCats()">
          <mat-icon>{{ allCatsCollapsed() ? 'unfold_more' : 'unfold_less' }}</mat-icon>
        </button>
      </div>

      <!-- Computed shopping list (from the rotation's meals/recipes). A deep-green
           "Meals" banner separates this from the Staples box below (both are green
           collapsible sections inside their own 2px green border). -->
      <div class="list-pane section-box">
        <button type="button" class="section-banner no-print" (click)="mealsOpen.set(!mealsOpen())">
          <span class="section-banner-title">meals</span>
          <mat-icon class="accordion-arrow" [class.open]="mealsOpen()">expand_more</mat-icon>
        </button>
        @if (mealsOpen()) {
        @if (listLoading()) {
          <p class="list-msg">Building your list…</p>
        } @else if (listError()) {
          <p class="list-msg">
            Couldn't build the shopping list.
            <button type="button" class="link-btn" (click)="reloadList()">Retry</button>
          </p>
        } @else if (computedGroups().length === 0) {
          <p class="list-msg">No meals in this rotation yet — add meals to your menus and they'll roll up here.</p>
        } @else {
          <div class="staples-content">
            @for (section of displaySections(); track section.key; let first = $first) {
              <!-- Collapsible banner (PRODUCE, PROTEINS, …). Caret on the RIGHT, a
                   rule line between the label and it. -->
              <button type="button" class="list-cat" (click)="toggleCat(section.key)">
                <span class="cat-label">{{ section.label }}</span>
                <span class="cat-rule"></span>
                <mat-icon class="cat-caret" [class.open]="!isCatCollapsed(section.key)">expand_more</mat-icon>
              </button>
              <!-- Column headings tuck under the FIRST banner, between its title
                   and the first item row (not a separate row at the very top). -->
              @if (first && !isCatCollapsed(section.key)) {
                <div class="list-col-head no-print">
                  <span class="pdf-check" aria-hidden="true"></span>
                  <span class="staple-qty">Qty</span>
                  <span class="staple-unit">Unit</span>
                  <span class="staple-item">Item</span>
                  <span class="col-need">Need</span>
                </div>
              }
              @if (!isCatCollapsed(section.key)) {
                @for (sub of section.subGroups; track sub.category) {
                  <!-- Sub-header only when the banner holds more than one category
                       (i.e. Produce → Vegetables / Fruits). -->
                  @if (section.subGroups.length > 1) {
                    <div class="list-subcat"><span class="subcat-label">{{ sub.label }}</span></div>
                  }
                  @for (item of sub.items; track item.key) {
                    <div class="staple-row" [class.not-needed]="!isNeeded(item.key)">
                      <span class="pdf-check" aria-hidden="true"></span>
                      <span class="staple-qty">{{ item.quantity }}</span>
                      <span class="staple-unit">{{ item.unit }}</span>
                      <span class="staple-item">{{ item.name }}</span>
                      <label class="toggle-slider no-print" [class.on]="isNeeded(item.key)">
                        <input type="checkbox"
                          [checked]="isNeeded(item.key)"
                          (change)="toggleNeed(item.key)" />
                        <span class="toggle-track"><span class="toggle-thumb"></span></span>
                      </label>
                    </div>
                  }
                }
              }
            }
          </div>
        }
        }
      </div>

      <!-- One-time & staples — demoted, collapsed by default (persisted user
           data). Expanded automatically before printing. Same green banner + 2px
           green box as the Meals section, so the two read as distinct areas. -->
      <div class="staples-pane section-box">
        <button type="button" class="section-banner no-print" (click)="staplesOpen.set(!staplesOpen())">
          <span class="section-banner-title">staples</span>
          <mat-icon class="accordion-arrow" [class.open]="staplesOpen()">expand_more</mat-icon>
        </button>

        @if (staplesOpen()) {
          <div class="staples-content">
            @for (cat of categories; track cat.id) {
              <div class="accordion-section">
                <!-- Each staple sub-category collapses/expands on its own, exactly
                     like the computed-list meal categories (caret + rule line). -->
                <button type="button" class="list-cat" (click)="toggleStaple(cat.id)">
                  <span class="cat-label">{{ cat.label }}</span>
                  <span class="cat-rule"></span>
                  <mat-icon class="cat-caret" [class.open]="!isStapleCollapsed(cat.id)">expand_more</mat-icon>
                </button>
                @if (!isStapleCollapsed(cat.id)) {
                <div class="accordion-body">
                    <div class="add-row no-print">
                      <input
                        type="text"
                        class="add-input"
                        [placeholder]="'Add ' + cat.label.toLowerCase() + ' item...'"
                        [value]="getNewItemText(cat.id)"
                        (input)="onNewItemInput(cat.id, $event)"
                        (keydown.enter)="addItem(cat.id)" />
                      <button
                        class="add-btn"
                        [disabled]="!getNewItemText(cat.id)"
                        (click)="addItem(cat.id)"
                        matTooltip="Add item"
                        matTooltipPosition="above"
                        [matTooltipShowDelay]="300">
                        +
                      </button>
                    </div>

                    @for (staple of getCategoryItems(cat.id); track staple.id) {
                      <div class="staple-row" [class.not-needed]="staple.needed === false">
                        <span class="pdf-check" aria-hidden="true"></span>
                        <input type="text"
                          class="staple-qty"
                          [value]="staple.qty || ''"
                          (change)="updateField(staple, 'qty', $event)"
                          placeholder="Qty" />
                        <input type="text"
                          class="staple-unit"
                          [value]="staple.store || ''"
                          (change)="updateField(staple, 'store', $event)"
                          placeholder="unit" />
                        <input type="text"
                          class="staple-item"
                          [value]="staple.item"
                          (change)="updateField(staple, 'item', $event)" />
                        <label class="toggle-slider no-print" [class.on]="staple.needed !== false">
                          <input type="checkbox"
                            [checked]="staple.needed !== false"
                            (change)="toggleNeeded(staple)" />
                          <span class="toggle-track"><span class="toggle-thumb"></span></span>
                        </label>
                        <button class="delete-btn no-print"
                          (click)="deleteItem(staple)"
                          matTooltip="Delete"
                          matTooltipPosition="above"
                          [matTooltipShowDelay]="300">
                          <mat-icon class="delete-icon">delete</mat-icon>
                        </button>
                      </div>
                    }
                </div>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./shopping-panel.scss']
})
export class ShoppingPanelComponent {
  private settingsService = inject(SettingsService);
  private notificationService = inject(NotificationService);
  readonly rotation = inject(RotationService);
  private tab = inject(TabService);

  isSaving = signal(false);

  // ---- Computed shopping list (from the rotation) --------------------------
  readonly listLoading = signal(false);
  readonly listError = signal(false);
  private readonly listResponse = signal<ShoppingListResponse | null>(null);
  /** Item keys ticked OFF (not needed) — held on the SERVICE so it survives this
   *  panel being destroyed on tab-switch. Absent ⇒ needed (ON). */
  private readonly checkedKeys = this.rotation.shoppingCheckedKeys;

  // Quantity basis: 'custom' = an explicit scale factor (the DEFAULT); 'recipe' =
  // each recipe's own servings ("Use Servings"). These drive ?basis=&factor=.
  readonly scaleMode = signal<'recipe' | 'custom'>('custom');
  readonly scaleValue = signal<number>(1);
  /** True once the user types a scale by hand — after that we stop tracking the
   *  standing People count so a manual override sticks. */
  private scaleTouched = false;
  /** Seed the Scale value from the People setting (regiMenu.persons) — that setting
   *  exists to scale the shopping list — until the user overrides it by hand. */
  private readonly seedScaleFromPeople = effect(
    () => {
      const people = this.rotation.persons();
      untracked(() => {
        if (!this.scaleTouched) this.scaleValue.set(people);
      });
    },
    { allowSignalWrites: true },
  );

  // ---- Collapsible computed-list categories (PROTEINS, PRODUCE, …) ----------
  readonly collapsedCats = signal<Set<string>>(new Set());
  isCatCollapsed(cat: string): boolean { return this.collapsedCats().has(cat); }
  // Staple sub-categories collapse independently — their ids (produce, proteins, …)
  // collide with the computed-list section keys, so they need their own set.
  readonly collapsedStaples = signal<Set<string>>(new Set());
  isStapleCollapsed(id: string): boolean { return this.collapsedStaples().has(id); }
  toggleStaple(id: string): void {
    this.collapsedStaples.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  toggleCat(cat: string): void {
    this.collapsedCats.update((s) => {
      const next = new Set(s);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }
  readonly allCatsCollapsed = computed<boolean>(() => {
    const keys = this.displaySections().map((s) => s.key);
    return keys.length > 0 && keys.every((k) => this.collapsedCats().has(k));
  });
  toggleAllCats(): void {
    this.collapsedCats.set(
      this.allCatsCollapsed() ? new Set() : new Set(this.displaySections().map((s) => s.key)),
    );
  }

  onScaleInput(event: Event): void {
    const n = Math.max(1, Math.floor(Number((event.target as HTMLInputElement).value) || 1));
    this.scaleTouched = true; // manual override — stop following the People setting
    this.scaleValue.set(n);
    this.scaleMode.set('custom');
  }

  // Refetch whenever the rotation or the basis/factor changes. Server is the
  // source of truth (write-through) — no client caching.
  private loadSeq = 0;
  private listEffect = effect(() => {
    const id = this.rotation.rotation()?.id ?? null;
    const basis: 'recipe' | 'scale' = this.scaleMode() === 'recipe' ? 'recipe' : 'scale';
    const factor = this.scaleValue();
    this.rotation.shoppingRefreshTick(); // refetch when meal/menu composition changes
    if (id == null) {
      this.listResponse.set(null);
      return;
    }
    void this.loadList(id, basis, factor);
  }, { allowSignalWrites: true });

  private async loadList(id: number, basis: 'recipe' | 'scale', factor: number): Promise<void> {
    const seq = ++this.loadSeq;
    this.listLoading.set(true);
    this.listError.set(false);
    try {
      const res = await firstValueFrom(this.rotation.getShoppingList(id, basis, factor));
      if (seq !== this.loadSeq) return; // a newer request superseded this one
      this.listResponse.set(res ?? null);
      // (The Shopping tab count is a computed on the service — see shoppingItemCount —
      //  fed by an eager list fetch + the checked-keys, so we don't set it here.)
    } catch {
      if (seq !== this.loadSeq) return;
      this.listError.set(true);
      this.listResponse.set(null);
    } finally {
      if (seq === this.loadSeq) this.listLoading.set(false);
    }
  }

  reloadList(): void {
    const id = this.rotation.rotation()?.id;
    if (id == null) return;
    void this.loadList(id, this.scaleMode() === 'recipe' ? 'recipe' : 'scale', this.scaleValue());
  }

  /** Fetch the server-rendered PDF (computed items + staples merged) and present
   *  it — open in a new tab, or download if the popup is blocked. Returns false
   *  on any failure so the caller can fall back to browser print. Sends the same
   *  basis/factor as the on-screen list; staples come from the panel so the PDF
   *  matches what the user sees. */
  async downloadPdf(): Promise<boolean> {
    const id = this.rotation.rotation()?.id;
    if (id == null) return false;
    const body: ShoppingListPdfRequest = {
      basis: this.scaleMode() === 'recipe' ? 'recipe' : 'scale',
      factor: this.scaleValue(),
      // settings.models ShoppingStaple is structurally identical to the generated
      // one; only a json2ts index signature differs, so bridge it explicitly.
      staples: this.staples() as unknown as ShoppingListPdfRequest['staples'],
    };
    try {
      const blob = await firstValueFrom(this.rotation.downloadShoppingListPdf(id, body));
      if (!blob || blob.size === 0) return false;
      // Open it in the SAME bloom PDF viewer recipes use — fully rendered, with a
      // print/download toolbar — instead of a browser download. The tab service
      // owns the blob URL and revokes it when the viewer closes.
      const url = URL.createObjectURL(blob);
      this.tab.openPdf(url, true);
      return true;
    } catch {
      return false;
    }
  }

  /** Print / Save-as-PDF from the Shopping tab: prefer the server-rendered PDF
   *  (staples merged); fall back to the browser print dialog if it fails. */
  async print(): Promise<void> {
    this.staplesOpen.set(true); // expand staples so a browser-print fallback shows them
    this.collapsedStaples.set(new Set()); // and expand every staple sub-category
    const ok = await this.downloadPdf();
    if (!ok) window.print();
  }

  /** The computed list flattened into display groups (preferred category order). */
  readonly computedGroups = computed<ListGroup[]>(() => {
    const res = this.listResponse();
    if (!res?.categories?.length) return [];
    return res.categories
      .map((c) => ({
        category: c.category,
        label: CAT_LABEL[c.category] ?? c.category,
        items: (c.items ?? []).map((it) => ({
          key: this.itemKey(it.foodId ?? null, it.foodSource ?? null, it.name),
          name: it.name,
          quantity: this.fmtQty(it.quantity),
          unit: it.unit,
        })),
      }))
      .filter((g) => g.items.length > 0)
      .sort((a, b) => (CAT_RANK[a.category] ?? 99) - (CAT_RANK[b.category] ?? 99));
  });

  /** Banners for display: produce (Vegetables) + fruits (Fruits) collapse into ONE
   *  "Produce" banner (store-style), each shown as a sub-header beneath; every other
   *  category is its own single-subgroup banner. Order follows CAT_RANK, so Produce
   *  leads (produce rank 0). Empty categories are already dropped upstream. */
  readonly displaySections = computed<ListSection[]>(() => {
    const groups = this.computedGroups();
    const produceSubs = groups.filter((g) => g.category === 'produce' || g.category === 'fruits');
    const sections: ListSection[] = [];
    let producePlaced = false;
    for (const g of groups) {
      if (g.category === 'produce' || g.category === 'fruits') {
        // Emit the umbrella once, at the position of the first produce/fruits group.
        if (!producePlaced) {
          producePlaced = true;
          sections.push({ key: 'produce', label: 'Produce', subGroups: produceSubs });
        }
        continue;
      }
      sections.push({ key: g.category, label: g.label, subGroups: [g] });
    }
    return sections;
  });

  /** Stable identity for a computed row — mirrors the server's foodIdentity so a
   *  persisted "checked" key still matches after a recompute. */
  private itemKey(foodId: number | null, foodSource: string | null, name: string): string {
    return foodId != null ? `f:${foodId}:${foodSource ?? 'food'}` : `n:${name.trim().toLowerCase()}`;
  }

  private fmtQty(n: number): string {
    const r = Math.round(n * 100) / 100;
    return String(r);
  }

  isNeeded(key: string): boolean {
    return !this.checkedKeys().has(key);
  }

  /** Flip a computed item's Need state and persist the checked set (write-through). */
  toggleNeed(key: string): void {
    this.checkedKeys.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    void this.persistProgress();
  }

  private async persistProgress(): Promise<void> {
    const id = this.rotation.rotation()?.id;
    if (id == null) return;
    this.isSaving.set(true);
    try {
      await firstValueFrom(this.rotation.saveShoppingProgress(id, [...this.checkedKeys()]));
    } catch {
      /* best-effort; the toggle stays reflected in the UI */
    } finally {
      this.isSaving.set(false);
    }
  }

  // ---- Staples (persisted user data) ---------------------------------------
  staples = signal<ShoppingStaple[]>([]);
  /** Staples pane collapsed by default — the computed list is the primary view. */
  readonly staplesOpen = signal(false);
  /** The computed "Meals" list section — collapsible, open by default. */
  readonly mealsOpen = signal(true);

  // Staple accordion state — all categories open by default (usable list up-front).
  private openCategories = signal<Set<StapleCategory>>(
    new Set(['produce', 'fruits', 'proteins', 'dairy', 'bulk', 'aisles']),
  );

  // New item text per category
  private newItemTexts = signal<Record<string, string>>({});

  // Display buckets, in the requested order. Stored tokens map to labels:
  // produce→Vegetables, fruits→Fruits, proteins→Proteins, dairy→Dairy,
  // bulk→Carbs, aisles→Processed/Aisles (legacy non_food folds into Processed).
  categories: CategorySection[] = [
    { id: 'produce', label: 'Vegetables' },
    { id: 'fruits', label: 'Fruits' },
    { id: 'proteins', label: 'Proteins' },
    { id: 'dairy', label: 'Dairy' },
    { id: 'bulk', label: 'Carbs' },
    { id: 'aisles', label: 'Processed / Aisles' }
  ];

  // Watch for settings to load (handles page refresh race condition)
  private settingsEffect = effect(() => {
    const all = this.settingsService.allSettings();
    if (all?.shoppingStaples && this.staples().length === 0) {
      this.staples.set([...all.shoppingStaples]);
    }
  });

  // --- Auto-save ---

  private async autoSave(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.settingsService.saveShoppingStaples(this.staples());
    } catch {
      this.notificationService.show('Failed to save staples', 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  // --- Staple accordion ---

  toggleCategory(id: StapleCategory): void {
    const current = this.openCategories();
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.openCategories.set(next);
  }

  isCategoryOpen(id: StapleCategory): boolean {
    return this.openCategories().has(id);
  }

  /** Expand everything (staples pane + every category) before printing so the
   *  whole list renders in the print snapshot. */
  openAllCategories(): void {
    this.staplesOpen.set(true);
    this.openCategories.set(new Set(this.categories.map((c) => c.id)));
  }

  getCategoryItems(category: StapleCategory): ShoppingStaple[] {
    return this.staples()
      // Legacy 'non_food' rows fold into the Processed/Aisles bucket.
      .filter(s => s.category === category || (category === 'aisles' && s.category === 'non_food'))
      .sort((a, b) => a.item.localeCompare(b.item)); // alphabetical
  }

  // --- New item ---

  getNewItemText(category: string): string {
    return this.newItemTexts()[category] || '';
  }

  onNewItemInput(category: string, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.newItemTexts.update(texts => ({ ...texts, [category]: val }));
  }

  addItem(category: StapleCategory): void {
    const text = this.getNewItemText(category).trim();
    if (!text) return;

    const categoryItems = this.getCategoryItems(category);
    const newStaple: ShoppingStaple = {
      id: crypto.randomUUID(),
      category,
      item: text,
      qty: '1',
      needed: true,
      pickedUp: false,
      sortOrder: categoryItems.length
    };

    this.staples.update(list => [...list, newStaple]);
    this.newItemTexts.update(texts => ({ ...texts, [category]: '' }));
    this.autoSave();
  }

  // --- Staple row actions ---

  togglePickedUp(staple: ShoppingStaple): void {
    this.staples.update(list =>
      list.map(s => s.id === staple.id ? { ...s, pickedUp: !s.pickedUp } : s)
    );
    this.autoSave();
  }

  toggleNeeded(staple: ShoppingStaple): void {
    const wasNeeded = staple.needed !== false;
    this.staples.update(list =>
      list.map(s => s.id === staple.id
        ? { ...s, needed: !wasNeeded, pickedUp: wasNeeded ? true : false }
        : s
      )
    );
    this.autoSave();
  }

  updateField(staple: ShoppingStaple, field: 'qty' | 'item' | 'store', event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.staples.update(list =>
      list.map(s => s.id === staple.id ? { ...s, [field]: val } : s)
    );
    this.autoSave();
  }

  deleteItem(staple: ShoppingStaple): void {
    this.staples.update(list => list.filter(s => s.id !== staple.id));
    this.autoSave();
  }
}
