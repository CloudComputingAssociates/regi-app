// src/app/components/food-amount-editor/food-amount-editor.ts
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NutritionFactsLabelComponent } from '../nutrition-facts-label/nutrition-facts-label';
import { MealItem } from '../../models/planning.model';
import { NutritionFacts } from '../../models/food.model';

export type EditorUnit = 'g' | 'oz' | 'lbs' | 'tsp' | 'ml';

const UNIT_LABELS: Record<EditorUnit, string> = {
  g: 'grams',
  oz: 'ounces',
  lbs: 'pounds',
  tsp: 'teaspoons',
  ml: 'milliliters',
};

// Conversion factors TO grams
const TO_GRAMS: Record<EditorUnit, number> = {
  g: 1,
  oz: 28.3495,
  lbs: 453.592,
  tsp: 4.92892,
  ml: 1, // approximate for water-density foods
};

// Default increment per unit
const INCREMENTS: Record<EditorUnit, number> = {
  g: 1,
  oz: 0.5,
  lbs: 0.25,
  tsp: 0.5,
  ml: 5,
};

export interface FoodAmountUpdate {
  itemIndex: number;
  quantityG: number;
  displayUnit: EditorUnit;
  displayQuantity: number;
  scaledCalories: number;
  scaledProteinG: number;
  scaledFatG: number;
  scaledCarbG: number;
  scaledFiberG: number;
  scaledSodiumMg: number;
}

@Component({
  selector: 'app-food-amount-editor',
  imports: [CommonModule, FormsModule, MatIconModule, NutritionFactsLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="editor-backdrop"
      [style.display]="isOpen() ? 'flex' : 'none'"
      (click)="onBackdropClick()">

      <div class="editor-panel" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="editor-header">
          <span class="editor-title">{{ itemName() }}</span>
          <div class="editor-header-actions">
            <button class="editor-btn ok-btn"
                    [disabled]="!hasChanges()"
                    (click)="onConfirm()"
                    aria-label="Apply changes">
              <mat-icon>check</mat-icon>
            </button>
            <button class="editor-btn close-btn"
                    (click)="onClose()"
                    aria-label="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>

        <!-- Controls row -->
        <div class="editor-controls">
          <label class="qty-label">Qty:</label>
          <div class="qty-input-group">
            <input
              type="number"
              class="qty-input"
              [ngModel]="displayQty()"
              (ngModelChange)="onQtyChange($event)"
              [step]="currentIncrement()"
              min="0" />
            <div class="qty-spinners">
              <button class="spin-btn" (click)="increment()" aria-label="Increase">
                <mat-icon>keyboard_arrow_up</mat-icon>
              </button>
              <button class="spin-btn" (click)="decrement()" aria-label="Decrease">
                <mat-icon>keyboard_arrow_down</mat-icon>
              </button>
            </div>
          </div>
          <select class="unit-select"
                  [ngModel]="selectedUnit()"
                  (ngModelChange)="onUnitChange($event)">
            @for (u of units; track u) {
              <option [value]="u">{{ unitLabels[u] }}</option>
            }
          </select>
        </div>

        <!-- Nutrition Facts -->
        <div class="editor-body">
          <yeh-nutrition-label
            [nutritionFacts]="baseNutritionFacts()"
            [scale]="scale()"
            [displayUnit]="selectedUnit()"
            [displayQuantity]="displayQty()" />
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./food-amount-editor.scss']
})
export class FoodAmountEditorComponent {
  // Inputs
  isOpen = input<boolean>(false);
  item = input<MealItem | null>(null);
  itemIndex = input<number>(-1);
  nutritionFacts = input<NutritionFacts | null>(null);
  baseServingSizeG = input<number>(100);

  // Outputs
  amountChanged = output<FoodAmountUpdate>();
  closed = output<void>();

  // Internal state
  selectedUnit = signal<EditorUnit>('g');
  displayQty = signal<number>(0);
  private initialQtyG = 0;

  readonly units: EditorUnit[] = ['g', 'oz', 'lbs', 'tsp', 'ml'];
  readonly unitLabels = UNIT_LABELS;

  itemName = computed(() => {
    const i = this.item();
    return i?.shortDescription || i?.foodName || 'Food';
  });

  currentIncrement = computed(() => INCREMENTS[this.selectedUnit()]);

  // Quantity in grams regardless of display unit
  quantityG = computed(() => {
    return this.displayQty() * TO_GRAMS[this.selectedUnit()];
  });

  // Scale relative to base serving size (nutrition facts are per base serving)
  scale = computed(() => {
    const base = this.baseServingSizeG();
    if (base <= 0) return 1;
    return this.quantityG() / base;
  });

  // The base (unscaled) nutrition facts for the label component
  baseNutritionFacts = computed(() => this.nutritionFacts());

  hasChanges = computed(() => {
    return Math.abs(this.quantityG() - this.initialQtyG) > 0.01;
  });

  constructor() {
    // Sync state when item input changes
    effect(() => {
      const i = this.item();
      const open = this.isOpen();
      if (i && open) {
        const unit = (i.unit as EditorUnit) || 'g';
        // quantity is stored in display units (e.g. 8 oz, not 226.8g)
        const displayQty = i.quantity;
        const qtyG = displayQty * TO_GRAMS[unit];
        this.initialQtyG = qtyG;
        this.selectedUnit.set(unit);
        this.displayQty.set(displayQty);
      }
    });
  }

  onQtyChange(value: number): void {
    if (value < 0) value = 0;
    this.displayQty.set(value);
  }

  onUnitChange(unit: EditorUnit): void {
    // Convert current grams to new unit
    const currentG = this.quantityG();
    this.selectedUnit.set(unit);
    this.displayQty.set(Math.round(currentG / TO_GRAMS[unit] * 100) / 100);
  }

  increment(): void {
    const step = INCREMENTS[this.selectedUnit()];
    this.displayQty.update(v => Math.round((v + step) * 100) / 100);
  }

  decrement(): void {
    const step = INCREMENTS[this.selectedUnit()];
    this.displayQty.update(v => Math.max(0, Math.round((v - step) * 100) / 100));
  }

  onConfirm(): void {
    const nf = this.nutritionFacts();
    const s = this.scale();
    const baseG = this.baseServingSizeG();

    this.amountChanged.emit({
      itemIndex: this.itemIndex(),
      quantityG: this.quantityG(),
      displayUnit: this.selectedUnit(),
      displayQuantity: this.displayQty(),
      scaledCalories: nf?.calories ? Math.round(nf.calories * s) : 0,
      scaledProteinG: nf?.proteinG ? Math.round(nf.proteinG * s * 10) / 10 : 0,
      scaledFatG: nf?.totalFatG ? Math.round(nf.totalFatG * s * 10) / 10 : 0,
      scaledCarbG: nf?.totalCarbohydrateG ? Math.round(nf.totalCarbohydrateG * s * 10) / 10 : 0,
      scaledFiberG: nf?.dietaryFiberG ? Math.round(nf.dietaryFiberG * s * 10) / 10 : 0,
      scaledSodiumMg: nf?.sodiumMG ? Math.round(nf.sodiumMG * s) : 0,
    });

    this.initialQtyG = this.quantityG();
  }

  onBackdropClick(): void {
    this.onClose();
  }

  onClose(): void {
    if (this.hasChanges()) {
      if (!confirm('You have unsaved changes. Discard them?')) {
        return;
      }
    }
    this.closed.emit();
  }
}
