// src/app/components/shopping-panel/shopping-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { TabService } from '../../services/tab.service';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../services/notification.service';
import { ShoppingStaple } from '../../models/settings.models';

type StapleCategory = 'produce' | 'proteins' | 'dairy' | 'aisles';

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
      <!-- Action buttons - top right -->
      <div class="action-buttons">
        <button
          class="icon-btn save-btn"
          [class.has-changes]="hasChanges()"
          [disabled]="isSaving()"
          (click)="save()"
          matTooltip="Save"
          matTooltipPosition="above"
          [matTooltipShowDelay]="300">
          @if (isSaving()) {
            <span class="save-spinner"></span>
          } @else {
            ✓
          }
        </button>
        <button
          class="icon-btn close-btn"
          (click)="close()"
          matTooltip="Close"
          matTooltipPosition="above"
          [matTooltipShowDelay]="300">
          ✕
        </button>
      </div>

      <!-- Scrollable content -->
      <div class="panel-content">
        <!-- Week Plan list area (future) -->
        <div class="week-plan-area">
          <p class="section-placeholder">Week Plan Items — coming soon</p>
        </div>

        <!-- Staples section -->
        <div class="staples-section">
          <div class="staples-header">
            <span class="staples-title">Staples</span>
          </div>

          @for (cat of categories; track cat.id) {
            <div class="accordion-section">
              <button class="accordion-header" (click)="toggleCategory(cat.id)">
                <mat-icon class="accordion-arrow" [class.open]="isCategoryOpen(cat.id)">chevron_right</mat-icon>
                <span class="accordion-title">{{ cat.label }}</span>
                <span class="accordion-count">({{ getCategoryItems(cat.id).length }})</span>
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
                    <div class="staple-row">
                      <input type="checkbox"
                        class="picked-up-check"
                        [checked]="staple.pickedUp"
                        (change)="togglePickedUp(staple)" />

                      <label class="toggle-slider" [class.on]="staple.needed !== false">
                        <input type="checkbox"
                          [checked]="staple.needed !== false"
                          (change)="toggleNeeded(staple)" />
                        <span class="toggle-track">
                          <span class="toggle-thumb"></span>
                        </span>
                      </label>

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
export class ShoppingPanelComponent implements OnInit {
  private tabService = inject(TabService);
  private settingsService = inject(SettingsService);
  private notificationService = inject(NotificationService);

  isSaving = signal(false);
  private dirty = signal(false);

  // Staples data
  staples = signal<ShoppingStaple[]>([]);

  // Accordion state
  private openCategories = signal<Set<StapleCategory>>(new Set(['produce']));

  // New item text per category
  private newItemTexts = signal<Record<string, string>>({});

  categories: CategorySection[] = [
    { id: 'produce', label: 'Produce' },
    { id: 'proteins', label: 'Proteins' },
    { id: 'dairy', label: 'Dairy' },
    { id: 'aisles', label: 'Aisles' }
  ];

  ngOnInit(): void {
    const all = this.settingsService.allSettings();
    if (all?.shoppingStaples) {
      this.staples.set([...all.shoppingStaples]);
    }
  }

  hasChanges(): boolean {
    return this.dirty();
  }

  // --- Accordion ---

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
    this.dirty.set(true);
  }

  // --- Row actions ---

  togglePickedUp(staple: ShoppingStaple): void {
    this.staples.update(list =>
      list.map(s => s.id === staple.id ? { ...s, pickedUp: !s.pickedUp } : s)
    );
    this.dirty.set(true);
  }

  toggleNeeded(staple: ShoppingStaple): void {
    this.staples.update(list =>
      list.map(s => s.id === staple.id ? { ...s, needed: s.needed === false ? true : false } : s)
    );
    this.dirty.set(true);
  }

  updateField(staple: ShoppingStaple, field: 'qty' | 'item' | 'store', event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.staples.update(list =>
      list.map(s => s.id === staple.id ? { ...s, [field]: val } : s)
    );
    this.dirty.set(true);
  }

  deleteItem(staple: ShoppingStaple): void {
    this.staples.update(list => list.filter(s => s.id !== staple.id));
    this.dirty.set(true);
  }

  // --- Save / Close ---

  async save(): Promise<void> {
    if (!this.hasChanges()) return;
    this.isSaving.set(true);
    try {
      await this.settingsService.saveShoppingStaples(this.staples());
      this.isSaving.set(false);
      this.dirty.set(false);
      this.notificationService.show('Shopping staples saved', 'success');
    } catch {
      this.isSaving.set(false);
      this.notificationService.show('Failed to save staples', 'error');
    }
  }

  close(): void {
    this.tabService.closeTab('shop');
  }
}
