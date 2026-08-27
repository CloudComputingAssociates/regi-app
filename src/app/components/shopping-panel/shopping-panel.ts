// src/app/components/shopping-panel/shopping-panel.ts
//
// The legacy "Plan Foods" surface was removed: it drove off the planning
// endpoints that the rotation refactor deleted from the API, so it was
// non-functional. The rotation-based shopping list is not wired yet, so the
// top of the panel is an honest placeholder. The Staples pane below is live,
// persisted user data (via SettingsService) and is kept.
import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../services/notification.service';
import { RotationService } from '../../services/rotation.service';
import { ShoppingStaple } from '../../models/settings.models';

type StapleCategory = 'proteins' | 'produce' | 'bulk' | 'dairy' | 'aisles' | 'non_food' | 'fruits';

interface CategorySection {
  id: StapleCategory;
  label: string;
}

@Component({
  selector: 'app-shopping-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Top row: quantity basis — either the recipe's own servings, or an
           explicit scale factor (defaults to 1, overridable). Either/or radio. -->
      <div class="shopping-top no-print">
        <div class="scale-radio">
          <label class="scale-opt">
            <input
              type="radio"
              name="scaleMode"
              [checked]="scaleMode() === 'recipe'"
              (change)="scaleMode.set('recipe')" />
            <span>Recipe Servings</span>
          </label>
          <label class="scale-opt">
            <input
              type="radio"
              name="scaleMode"
              [checked]="scaleMode() === 'custom'"
              (change)="scaleMode.set('custom')" />
            <span>Scale:</span>
            <input
              type="number"
              class="scale-input"
              min="1"
              [value]="scaleValue()"
              (focus)="scaleMode.set('custom')"
              (input)="onScaleInput($event)" />
          </label>
        </div>
        @if (isSaving()) {
          <span class="auto-save-indicator">saving...</span>
        }
      </div>

      <!-- Staples (live, persisted to user settings) -->
      <div class="staples-pane">
        <div class="staples-header">
          <span class="staples-title">Staples &amp; One-Time purchases</span>
          <span class="staples-title buy-column-label no-print">Need</span>
        </div>

        <div class="staples-content">
          @for (cat of categories; track cat.id) {
            <div class="accordion-section">
              <button class="accordion-header" (click)="toggleCategory(cat.id)">
                <mat-icon class="accordion-arrow" [class.open]="isCategoryOpen(cat.id)">chevron_right</mat-icon>
                <span class="accordion-title">{{ cat.label }}</span>
              </button>

              @if (isCategoryOpen(cat.id)) {
                <div class="accordion-body">
                  <!-- Add row -->
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

                  <!-- Staple rows — alphabetical. Form shows quantity + unit +
                       item + Need slider (no checkbox). The empty checkbox square
                       is print-only (see the @media print block) and sits in
                       front of the quantity for ticking off while shopping. -->
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
                        <span class="toggle-track">
                          <span class="toggle-thumb"></span>
                        </span>
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
      </div>
    </div>
  `,
  styleUrls: ['./shopping-panel.scss']
})
export class ShoppingPanelComponent {
  private settingsService = inject(SettingsService);
  private notificationService = inject(NotificationService);
  readonly rotation = inject(RotationService);

  isSaving = signal(false);

  // Staples data
  staples = signal<ShoppingStaple[]>([]);

  // Quantity basis for the list: 'recipe' = each recipe's own servings;
  // 'custom' = an explicit scale factor (default 1, overridable). Local UI state
  // — the scaling MATH runs once the rotation-derived list is wired (the live
  // content today is the persisted Staples below).
  readonly scaleMode = signal<'recipe' | 'custom'>('recipe');
  readonly scaleValue = signal<number>(1);

  onScaleInput(event: Event): void {
    const n = Math.max(1, Math.floor(Number((event.target as HTMLInputElement).value) || 1));
    this.scaleValue.set(n);
    this.scaleMode.set('custom');
  }

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

  /** Expand every category — used before printing so the whole list renders. */
  openAllCategories(): void {
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
