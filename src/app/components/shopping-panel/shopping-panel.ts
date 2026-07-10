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

type StapleCategory = 'proteins' | 'produce' | 'bulk' | 'dairy' | 'aisles' | 'non_food';

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
      <!-- Top row: source note (left) + Scale/persons stepper (right). The Scale
           shares the same persisted persons value as the Menus toolbar, so
           scaling here (and future quantity re-adjustment) stays in sync. -->
      <div class="shopping-top">
        <p class="shopping-note">Shopping List from your active rotation of Menus &amp; Meals</p>
        <div class="top-right">
          @if (isSaving()) {
            <span class="auto-save-indicator">saving...</span>
          }
          <div
            class="scale-control"
            matTooltip="People to scale the plan (and shopping quantities) for"
            matTooltipPosition="below">
            <span class="scale-label">Scale</span>
            <button
              type="button"
              class="scale-step"
              [disabled]="rotation.persons() <= 1"
              (click)="rotation.setPersons(rotation.persons() - 1)">
              −
            </button>
            <span class="scale-count">{{ rotation.persons() }}</span>
            <button
              type="button"
              class="scale-step"
              [disabled]="rotation.persons() >= 12"
              (click)="rotation.setPersons(rotation.persons() + 1)">
              +
            </button>
          </div>
        </div>
      </div>

      <!-- Staples (live, persisted to user settings) -->
      <div class="staples-pane">
        <div class="staples-header">
          <span class="staples-title">Staples &amp; One-Time purchases</span>
          <span class="staples-title buy-column-label">Need</span>
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
                  <div class="add-row">
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

                  <!-- Staple rows -->
                  @for (staple of getCategoryItems(cat.id); track staple.id) {
                    <div class="staple-row" [class.not-needed]="staple.needed === false" [class.picked-up]="staple.pickedUp && staple.needed !== false">
                      <input type="checkbox"
                        class="picked-up-check"
                        [checked]="staple.pickedUp || staple.needed === false"
                        [disabled]="staple.needed === false"
                        (change)="togglePickedUp(staple)" />

                      <input type="text"
                        class="staple-qty"
                        [value]="staple.qty || ''"
                        (change)="updateField(staple, 'qty', $event)"
                        placeholder="Qty" />

                      <input type="text"
                        class="staple-item"
                        [value]="staple.item"
                        (change)="updateField(staple, 'item', $event)" />

                      <input type="text"
                        class="staple-store"
                        [value]="staple.store || ''"
                        (change)="updateField(staple, 'store', $event)"
                        placeholder="Store" />

                      <label class="toggle-slider" [class.on]="staple.needed !== false">
                        <input type="checkbox"
                          [checked]="staple.needed !== false"
                          (change)="toggleNeeded(staple)" />
                        <span class="toggle-track">
                          <span class="toggle-thumb"></span>
                        </span>
                      </label>

                      <button class="delete-btn"
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

  // Staple accordion state
  private openCategories = signal<Set<StapleCategory>>(new Set(['proteins']));

  // New item text per category
  private newItemTexts = signal<Record<string, string>>({});

  categories: CategorySection[] = [
    { id: 'proteins', label: 'Proteins' },
    { id: 'produce', label: 'Produce/Vegetables' },
    { id: 'bulk', label: 'Bulk' },
    { id: 'dairy', label: 'Dairy' },
    { id: 'aisles', label: 'Aisles' },
    { id: 'non_food', label: 'Non-Food Items' }
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

  getCategoryItems(category: StapleCategory): ShoppingStaple[] {
    return this.staples()
      .filter(s => s.category === category)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
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
