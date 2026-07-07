// src/app/components/food-lookaside/food-lookaside.ts
//
// The right-rail lookaside shown while a meal slot is being edited (replaces
// the Meals binder in the same rail position). Two tabs of foods you can add to
// the editing meal: Picks (your basket picks) and MyFoods (your allowed foods).
// A single click OR a drag onto the editing meal card adds the row's food at
// its resolved default serving — there is no selection/preview/draft. Dark
// chrome mirrors the binder.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { RotationService } from '../../services/rotation.service';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { SettingsService } from '../../services/settings.service';
import { Food } from '../../models/food.model';
import { nutritionLabelScale } from '../../models/food-display';
import { BASKET_KEYS, hydratePicks } from '../../models/picks-hydration';

type LookasidePane = 'picks' | 'myfoods';
type MacroKey = 'protein' | 'carb' | 'fat' | 'fiber';

// The MyFoods categories in the same fixed order + plural labels as the
// foods-panel Edit MyFoods accordion, keyed by raw Food.categoryName. Foods
// whose category isn't one of these don't show (mirrors foods-panel).
const MYFOOD_CATEGORY_ORDER: ReadonlyArray<{ cat: string; label: string }> = [
  { cat: 'Protein', label: 'Proteins' },
  { cat: 'Fat', label: 'Fats' },
  { cat: 'Dairy', label: 'Dairy' },
  { cat: 'Vegetable', label: 'Veggies' },
  { cat: 'Carbohydrate', label: 'Carbs' },
  { cat: 'Fruit', label: 'Fruits' },
  { cat: 'Processed', label: 'Processed' },
  { cat: 'Condiment', label: 'Seasonings' },
];

// The two macro pucks that preview each category — a brief "what is this food
// mostly" cue; the full macros + serving appear once the food is in the meal.
// Protein-forward (Proteins/Dairy) → Protein+Fiber, Fat (Fats) → Fat+Fiber,
// carb-forward (Veggies/Fruits/Carbs/Processed/Seasonings) → Carb+Fiber.
const CATEGORY_PUCKS: Record<string, readonly [MacroKey, MacroKey]> = {
  Protein: ['protein', 'fiber'],
  Dairy: ['protein', 'fiber'],
  Fat: ['fat', 'fiber'],
  Vegetable: ['carb', 'fiber'],
  Fruit: ['carb', 'fiber'],
  Carbohydrate: ['carb', 'fiber'],
  Processed: ['carb', 'fiber'],
  Condiment: ['carb', 'fiber'],
};

const PUCK_LABEL: Record<MacroKey, string> = {
  protein: 'P',
  carb: 'C',
  fat: 'F',
  fiber: 'Fi',
};

// Below this many grams (for the food's default serving) a macro reads as
// "trace" — its puck is omitted entirely (pure oil → no fiber/protein puck,
// pure fiber → no carb puck, etc.).
const PUCK_MIN_G = 1;

@Component({
  selector: 'app-food-lookaside',
  imports: [MatTooltipModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lookaside">
      <div class="lookaside-header">
        <span class="lookaside-title">Foods → Meal {{ slotOrder() }}</span>
        <button
          type="button"
          class="done-btn"
          matTooltip="Done editing"
          (click)="rotation.stopEditing()">
          Done
        </button>
      </div>

      <div class="pane-toggle" role="tablist">
        <button
          type="button"
          class="toggle-btn"
          [class.active]="pane() === 'picks'"
          (click)="pane.set('picks')">
          Picks
        </button>
        <button
          type="button"
          class="toggle-btn"
          [class.active]="pane() === 'myfoods'"
          (click)="pane.set('myfoods')">
          MyFoods
        </button>
      </div>

      @if (pane() === 'myfoods') {
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
      <div
        class="pane-body"
        cdkDropList
        [cdkDropListSortingDisabled]="true">
        @if (pane() === 'picks') {
          @for (group of pickGroups(); track group.key) {
            <div class="group-header">{{ group.key }}</div>
            @for (food of group.foods; track food.id) {
              <div
                class="la-row"
                cdkDrag
                [cdkDragData]="{ food: food, serving: resolvePickServing(food) }"
                [class.busy]="isBusy(food)"
                (click)="onPickClick(food)">
                <span class="la-dot" [class.on]="inMeal(food)"></span>
                <span class="la-name">{{ name(food) }}</span>
                <span class="la-serving">{{ resolvePickServing(food) }} {{ unit(food) }}</span>
              </div>
            }
          } @empty {
            <p class="pane-empty">No picks yet.</p>
          }
        } @else {
          <!-- Grouped into the same category accordions as the Edit MyFoods
               list (no Like/Limit). Rows preview two macro pucks; the serving
               and full macros appear once the food lands in the meal. -->
          @for (group of myFoodGroups(); track group.cat) {
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
                  [cdkDragData]="{ food: food, serving: resolveMyFoodServing(food) }"
                  [class.busy]="isBusy(food)"
                  (click)="onMyFoodClick(food)">
                  <span class="la-dot" [class.on]="inMeal(food)"></span>
                  <span class="la-name">{{ name(food) }}</span>
                  <span class="la-pucks">
                    @for (p of pucksFor(food); track p.key) {
                      <span [class]="'puck ' + p.key">{{ p.label }} {{ p.value }}</span>
                    }
                  </span>
                </div>
              }
            }
          } @empty {
            <p class="pane-empty">No MyFoods match.</p>
          }
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

  /** The slot being edited (rail is only shown when editingSlot is non-null). */
  readonly slotOrder = computed(() => this.rotation.editingSlot()?.slotOrder ?? 0);

  /** Which pane is showing. Picks is the default. */
  readonly pane = signal<LookasidePane>('picks');

  /** MyFoods live substring filter. */
  readonly search = signal('');

  /** Full allowed-foods list (same source foods-panel uses). Loaded on init. */
  private readonly allowedFull = signal<Food[]>([]);

  /** Row keys with an add in flight, so a slow POST can't be double-fired. */
  private readonly busyKeys = signal<Set<string>>(new Set());

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
    // Ensure currentPicks is available for the Picks tab.
    if (!this.settingsService.allSettings()) {
      try {
        await this.settingsService.loadSettings();
      } catch {
        /* leave picks empty — the tab shows its empty state */
      }
    }
  }

  /** Picks hydrated to per-basket Food objects (shared with foods-panel), then
   *  reduced to the non-empty baskets in fixed order Proteins→Fats→Carbs→Other. */
  readonly pickGroups = computed<Array<{ key: string; foods: Food[] }>>(() => {
    const picks = this.settingsService.allSettings()?.currentPicks ?? [];
    const baskets = hydratePicks(picks, this.allowedFull()).baskets;
    return BASKET_KEYS
      .map((key) => ({ key, foods: baskets[key] }))
      .filter((g) => g.foods.length > 0);
  });

  /** Categories collapsed by default (like the foods-panel accordion). */
  private readonly collapsedCats = signal<Set<string>>(
    new Set(MYFOOD_CATEGORY_ORDER.map((c) => c.cat)),
  );

  toggleCat(cat: string): void {
    this.collapsedCats.update((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  /** MyFoods grouped into the fixed category accordion, substring-filtered on
   *  name, alphabetical within each group. Empty categories are omitted; while
   *  a search is active every matching group is force-expanded. */
  readonly myFoodGroups = computed<
    Array<{ cat: string; label: string; foods: Food[]; collapsed: boolean }>
  >(() => {
    const q = this.search().trim().toLowerCase();
    const searching = q.length > 0;
    const collapsed = this.collapsedCats();
    const byCat = new Map<string, Food[]>();
    for (const f of this.allowedFull()) {
      if (q && !this.name(f).toLowerCase().includes(q)) continue;
      const cat = f.categoryName ?? '';
      const arr = byCat.get(cat);
      if (arr) arr.push(f);
      else byCat.set(cat, [f]);
    }
    const groups: Array<{ cat: string; label: string; foods: Food[]; collapsed: boolean }> = [];
    for (const { cat, label } of MYFOOD_CATEGORY_ORDER) {
      const foods = byCat.get(cat);
      if (!foods || foods.length === 0) continue;
      foods.sort((a, b) => this.name(a).localeCompare(this.name(b)));
      groups.push({ cat, label, foods, collapsed: searching ? false : collapsed.has(cat) });
    }
    return groups;
  });

  /** The (up to two) macro pucks previewed for a food, per its category, with
   *  trace macros omitted. Values are grams for the food's default serving. */
  pucksFor(food: Food): Array<{ key: MacroKey; label: string; value: number }> {
    const keys = CATEGORY_PUCKS[food.categoryName ?? ''] ?? (['carb', 'fiber'] as const);
    const out: Array<{ key: MacroKey; label: string; value: number }> = [];
    for (const key of keys) {
      const g = this.macroG(food, key);
      if (g < PUCK_MIN_G) continue; // trace / really low → omit the puck
      out.push({ key, label: PUCK_LABEL[key], value: Math.round(g) });
    }
    return out;
  }

  /** Grams of one macro for the food's default serving (per-100g × scale, the
   *  same math the NF label uses), so pucks match what lands in the meal. */
  private macroG(food: Food, key: MacroKey): number {
    const nf = food.nutritionFacts;
    if (!nf) return 0;
    const scale = nutritionLabelScale(food, this.resolveMyFoodServing(food));
    const per100 =
      key === 'protein'
        ? nf.proteinG
        : key === 'fat'
          ? nf.totalFatG
          : key === 'carb'
            ? nf.totalCarbohydrateG
            : nf.dietaryFiberG;
    return (per100 ?? 0) * scale;
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
  resolvePickServing(food: Food): number {
    return food.pickServingSize ?? food.userServingSize ?? food.servingSize ?? 1;
  }

  resolveMyFoodServing(food: Food): number {
    return food.userServingSize ?? food.servingSize ?? 1;
  }

  onPickClick(food: Food): void {
    void this.add(food, this.resolvePickServing(food));
  }

  onMyFoodClick(food: Food): void {
    void this.add(food, this.resolveMyFoodServing(food));
  }

  /** Funnel both click paths into the service add path, with a per-row busy
   *  guard so a slow POST can't be double-fired. */
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
