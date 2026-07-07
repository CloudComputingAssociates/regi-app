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
import { BASKET_KEYS, hydratePicks } from '../../models/picks-hydration';

type LookasidePane = 'picks' | 'myfoods';

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
          @for (food of myFoods(); track food.id) {
            <div
              class="la-row"
              cdkDrag
              [cdkDragData]="{ food: food, serving: resolveMyFoodServing(food) }"
              [class.busy]="isBusy(food)"
              (click)="onMyFoodClick(food)">
              <span class="la-dot" [class.on]="inMeal(food)"></span>
              <span class="la-name">{{ name(food) }}</span>
              <span class="la-serving">{{ resolveMyFoodServing(food) }} {{ unit(food) }}</span>
            </div>
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

  /** MyFoods = allowed foods, substring-filtered on name, alphabetical. */
  readonly myFoods = computed<Food[]>(() => {
    const q = this.search().trim().toLowerCase();
    const all = this.allowedFull();
    const filtered = q ? all.filter((f) => this.name(f).toLowerCase().includes(q)) : all;
    return [...filtered].sort((a, b) => this.name(a).localeCompare(this.name(b)));
  });

  /** (foodId, foodSource) keys of the items already in the editing meal — drives
   *  the in-meal dot. foodSource missing → 'food', matching add-path semantics. */
  private readonly inMealKeys = computed<Set<string>>(() => {
    const items = this.rotation.slotItems(this.rotation.editingSlot()?.mealId);
    return new Set(items.map((i) => `${i.foodId}:${i.foodSource ?? 'food'}`));
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
