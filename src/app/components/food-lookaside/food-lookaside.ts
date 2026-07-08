// src/app/components/food-lookaside/food-lookaside.ts
//
// The right-rail lookaside shown while a meal slot is being edited (replaces
// the Meals binder in the same rail position). Two tabs — Picks and MyFoods —
// each a category accordion (start collapsed) of foods you can add to the
// editing meal. A single click OR a drag onto the editing meal card adds the
// row's food at its resolved default serving. Dark chrome mirrors the binder.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { RotationService } from '../../services/rotation.service';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { SettingsService } from '../../services/settings.service';
import { Food } from '../../models/food.model';
import { BASKET_KEYS, hydratePicks } from '../../models/picks-hydration';

type LookasidePane = 'picks' | 'myfoods';

interface FoodGroup {
  cat: string;
  label: string;
  foods: Food[];
  collapsed: boolean;
}

// The food categories in fixed order + plural labels — the same accordion the
// foods-panel Edit MyFoods list uses. Both tabs group by this. Foods whose
// category isn't one of these don't show (mirrors foods-panel).
const CATEGORY_ORDER: ReadonlyArray<{ cat: string; label: string }> = [
  { cat: 'Protein', label: 'Proteins' },
  { cat: 'Fat', label: 'Fats' },
  { cat: 'Dairy', label: 'Dairy' },
  { cat: 'Vegetable', label: 'Veggies' },
  { cat: 'Carbohydrate', label: 'Carbs' },
  { cat: 'Fruit', label: 'Fruits' },
  { cat: 'Processed', label: 'Processed' },
  { cat: 'Condiment', label: 'Seasonings' },
];

@Component({
  selector: 'app-food-lookaside',
  imports: [MatTooltipModule, MatIconModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lookaside">
      <!-- Tabs up top; the red X (same size as the meal card's green check)
           closes the lookaside. -->
      <div class="lookaside-header">
        <!-- MyFoods is primary/default; Picks second. With no picks there's
             nothing to toggle to — just show the MyFoods label. -->
        @if (hasPicks()) {
          <div class="pane-toggle" role="tablist">
            <button
              type="button"
              class="toggle-btn"
              [class.active]="effectivePane() === 'myfoods'"
              (click)="pane.set('myfoods')">
              MyFoods
            </button>
            <button
              type="button"
              class="toggle-btn"
              [class.active]="effectivePane() === 'picks'"
              (click)="pane.set('picks')">
              Picks
            </button>
          </div>
        } @else {
          <span class="lookaside-label">MyFoods</span>
        }
        <button
          type="button"
          class="icon-disc icon-disc-cancel close-btn"
          matTooltip="Close"
          matTooltipPosition="below"
          (click)="rotation.stopEditing()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      @if (effectivePane() === 'myfoods') {
        <div class="search-row">
          <input
            type="text"
            class="search-input"
            [value]="search()"
            (input)="search.set($any($event.target).value)"
            placeholder="Search foods…" />
        </div>
      }

      <!-- The rail is inside the menus-layout cdkDropListGroup, so rows drag
           onto the editing meal card. Sorting is off — this list is a drag
           SOURCE only; drops within it are a no-op. -->
      <div class="pane-body" cdkDropList [cdkDropListSortingDisabled]="true">
        @for (group of currentGroups(); track group.cat) {
          <div class="cat-header" (click)="toggleCat(group.cat)">
            <span class="cat-caret" [class.open]="!group.collapsed">›</span>
            <span class="cat-name">{{ group.label }}</span>
            <span class="cat-count">({{ group.foods.length }})</span>
          </div>
          @if (!group.collapsed) {
            @for (food of group.foods; track food.id) {
              <div
                class="la-row"
                cdkDrag
                [cdkDragData]="{ food: food, serving: resolveServing(food) }"
                [class.busy]="isBusy(food)"
                (click)="onRowClick(food)">
                <span class="la-dot" [class.on]="inMeal(food)"></span>
                <span class="la-name">{{ name(food) }}</span>
                <span class="la-units">{{ resolveServing(food) }} {{ unit(food) }}</span>
              </div>
            }
          }
        } @empty {
          <p class="pane-empty">{{ effectivePane() === 'picks' ? 'No picks yet.' : 'No MyFoods match.' }}</p>
        }
      </div>
    </div>
  `,
  styleUrls: ['./food-lookaside.scss'],
})
export class FoodLookasideComponent {
  readonly rotation = inject(RotationService);
  private preferencesService = inject(FoodPreferencesService);
  private settingsService = inject(SettingsService);

  /** The tab the user picked. MyFoods is the default/primary. */
  readonly pane = signal<LookasidePane>('myfoods');

  /** MyFoods live substring filter. */
  readonly search = signal('');

  /** Full allowed-foods list (same source foods-panel uses). Loaded on init. */
  private readonly allowedFull = signal<Food[]>([]);

  /** Row keys with an add in flight, so a slow POST can't be double-fired. */
  private readonly busyKeys = signal<Set<string>>(new Set());

  /** Categories collapsed by default — everything starts collapsed. */
  private readonly collapsedCats = signal<Set<string>>(
    new Set(CATEGORY_ORDER.map((c) => c.cat)),
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const foods = await firstValueFrom(this.preferencesService.getAllowedFoodsFull());
      this.allowedFull.set(foods ?? []);
    } catch {
      this.allowedFull.set([]);
    }
    if (!this.settingsService.allSettings()) {
      try {
        await this.settingsService.loadSettings();
      } catch {
        /* leave picks empty — the tab shows its empty state */
      }
    }
  }

  toggleCat(cat: string): void {
    this.collapsedCats.update((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  /** Picks hydrated to Food objects (shared with foods-panel), flattened across
   *  baskets — grouped by category (below) exactly like MyFoods. */
  private readonly pickFoods = computed<Food[]>(() => {
    const picks = this.settingsService.allSettings()?.currentPicks ?? [];
    const baskets = hydratePicks(picks, this.allowedFull()).baskets;
    return BASKET_KEYS.flatMap((k) => baskets[k]);
  });

  /** Whether the user has any hydrated picks — gates the Picks tab entirely. */
  readonly hasPicks = computed<boolean>(() => this.pickFoods().length > 0);

  /** The pane actually shown: falls back to MyFoods when there are no picks. */
  readonly effectivePane = computed<LookasidePane>(() =>
    this.hasPicks() ? this.pane() : 'myfoods',
  );

  /** The active tab's foods grouped into the category accordion. MyFoods honors
   *  the search box (and force-expands matching groups); Picks isn't searched. */
  readonly currentGroups = computed<FoodGroup[]>(() => {
    const myfoods = this.effectivePane() === 'myfoods';
    const foods = myfoods ? this.allowedFull() : this.pickFoods();
    const q = myfoods ? this.search().trim().toLowerCase() : '';
    return this.groupByCategory(foods, q);
  });

  private groupByCategory(foods: Food[], q: string): FoodGroup[] {
    const searching = q.length > 0;
    const collapsed = this.collapsedCats();
    const byCat = new Map<string, Food[]>();
    for (const f of foods) {
      if (q && !this.name(f).toLowerCase().includes(q)) continue;
      const cat = f.categoryName ?? '';
      const arr = byCat.get(cat);
      if (arr) arr.push(f);
      else byCat.set(cat, [f]);
    }
    const groups: FoodGroup[] = [];
    for (const { cat, label } of CATEGORY_ORDER) {
      const arr = byCat.get(cat);
      if (!arr || arr.length === 0) continue;
      arr.sort((a, b) => this.name(a).localeCompare(this.name(b)));
      groups.push({ cat, label, foods: arr, collapsed: searching ? false : collapsed.has(cat) });
    }
    return groups;
  }

  /** (foodId, foodSource) keys of the items already in the editing meal — drives
   *  the in-meal dot. foodSource missing → 'food', matching add-path semantics. */
  private readonly inMealKeys = computed<Set<string>>(() => {
    const items = this.rotation.slotItems(this.rotation.editingSlot()?.mealId);
    return new Set(
      items
        .filter((i) => i.food)
        .map((i) => `${i.food!.foodId}:${i.food!.foodSource ?? 'food'}`),
    );
  });

  private key(food: Food): string {
    return `${food.id}:${food.foodSource ?? 'food'}`;
  }

  inMeal(food: Food): boolean {
    return this.inMealKeys().has(this.key(food));
  }

  isBusy(food: Food): boolean {
    return this.busyKeys().has(this.key(food));
  }

  name(food: Food): string {
    return food.shortDescription?.trim() || food.description || '';
  }

  unit(food: Food): string {
    return food.servingUnit ?? 'serving';
  }

  // Resolved default serving — display only; re-resolved at add time below.
  resolveServing(food: Food): number {
    return this.effectivePane() === 'picks'
      ? (food.pickServingSize ?? food.userServingSize ?? food.servingSize ?? 1)
      : (food.userServingSize ?? food.servingSize ?? 1);
  }

  onRowClick(food: Food): void {
    void this.add(food, this.resolveServing(food));
  }

  /** Funnel both click + drag paths into the service add path, with a per-row
   *  busy guard so a slow POST can't be double-fired. */
  private async add(food: Food, serving: number): Promise<void> {
    const k = this.key(food);
    if (this.busyKeys().has(k)) return;
    this.busyKeys.update((s) => new Set(s).add(k));
    try {
      await this.rotation.addFoodToEditingMeal(food, serving);
    } finally {
      this.busyKeys.update((s) => {
        const next = new Set(s);
        next.delete(k);
        return next;
      });
    }
  }
}
