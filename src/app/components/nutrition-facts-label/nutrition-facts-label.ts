// src/app/components/nutrition-facts-label/nutrition-facts-label.ts
import { Component, ChangeDetectionStrategy, input, output, computed, signal, ElementRef, viewChild, effect } from '@angular/core';
import { NutritionFacts } from '../../models/food.model';

// FDA 2020 Daily Reference Values
const DV = {
  totalFatG: 78,
  saturatedFatG: 20,
  cholesterolMG: 300,
  sodiumMG: 2300,
  totalCarbohydrateG: 275,
  dietaryFiberG: 28,
  addedSugarsG: 50,
  vitaminDMcg: 20,
  calciumMG: 1300,
  ironMG: 18,
  potassiumMG: 4700,
};

function dvPercent(actual: number | undefined | null, reference: number): number {
  if (!actual) return 0;
  return Math.round((actual / reference) * 100);
}

@Component({
  selector: 'regi-nutrition-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nf-label">
      <div class="nf-title">Nutrition Facts</div>
      <div class="nf-divider-hair"></div>

      <div class="nf-servings">
        <div class="nf-servings-line">
          <span>{{ data().servingsPerContainer ?? 1 }} servings per container</span>
        </div>
        <div class="nf-serving-size">
          <span class="nf-serving-label">Serving size</span>
          @if (editable()) {
            <div class="nf-serving-steppers" aria-label="Adjust serving size">
              <button
                type="button"
                class="nf-serving-step nf-serving-step-up"
                (click)="onStepUp($event)"
                aria-label="Increase serving">
                <svg viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M0 6 L5 0 L10 6 Z" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                class="nf-serving-step nf-serving-step-down"
                (click)="onStepDown($event)"
                aria-label="Decrease serving">
                <svg viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M0 0 L5 6 L10 0 Z" fill="currentColor" />
                </svg>
              </button>
            </div>
          }
          @if (editable() && editing()) {
            <input
              #editInput
              type="number"
              inputmode="decimal"
              class="nf-serving-edit-input"
              [value]="editValue()"
              (input)="onEditInput($any($event.target).value)"
              (blur)="onEditBlur()"
              (keydown.enter)="commitIfValid()"
              (keydown.escape)="cancelEdit()"
              aria-label="Serving size value" />
            <button
              type="button"
              class="nf-serving-commit"
              [class.enabled]="isCommitValid()"
              [disabled]="!isCommitValid()"
              (mousedown)="onCommitMouseDown($event)"
              (click)="commitIfValid()"
              aria-label="Confirm serving size">
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 7 L6 10 L11 4" fill="none" stroke="currentColor"
                      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <span class="nf-serving-unit-suffix">{{ displayUnit() }} ({{ data().servingSizeG ?? 0 }}g)</span>
          } @else {
            <span
              class="nf-serving-value"
              [class.nf-serving-clickable]="editable()"
              (click)="onValueClick()">{{ servingSizeDisplay() }}</span>
          }
        </div>
      </div>

      <div class="nf-divider-thick"></div>

      <div class="nf-calories-section">
        <div class="nf-amount-label">Amount per serving</div>
        <div class="nf-calories-row">
          <span class="nf-calories-label">Calories</span>
          <span class="nf-calories-value">{{ data().calories ?? 0 }}</span>
        </div>
      </div>

      <div class="nf-divider-medium"></div>

      <div class="nf-dv-header">
        <span>% Daily Value*</span>
      </div>

      <div class="nf-divider-hair"></div>

      <!-- Total Fat -->
      <div class="nf-row">
        <span><strong>Total Fat</strong> {{ data().totalFatG ?? 0 }}g</span>
        <span class="nf-dv"><strong>{{ dv().totalFat }}%</strong></span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Saturated Fat -->
      <div class="nf-row nf-indent">
        <span>Saturated Fat {{ data().saturatedFatG ?? 0 }}g</span>
        <span class="nf-dv"><strong>{{ dv().saturatedFat }}%</strong></span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Trans Fat -->
      @if (data().transFatG !== null && data().transFatG !== undefined) {
        <div class="nf-row nf-indent">
          <span><em>Trans</em> Fat {{ data().transFatG }}g</span>
          <span class="nf-dv"></span>
        </div>
        <div class="nf-divider-hair"></div>
      }

      <!-- Cholesterol -->
      <div class="nf-row">
        <span><strong>Cholesterol</strong> {{ data().cholesterolMG ?? 0 }}mg</span>
        <span class="nf-dv"><strong>{{ dv().cholesterol }}%</strong></span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Sodium -->
      <div class="nf-row">
        <span><strong>Sodium</strong> {{ data().sodiumMG ?? 0 }}mg</span>
        <span class="nf-dv"><strong>{{ dv().sodium }}%</strong></span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Total Carbohydrate -->
      <div class="nf-row">
        <span><strong>Total Carbohydrate</strong> {{ data().totalCarbohydrateG ?? 0 }}g</span>
        <span class="nf-dv"><strong>{{ dv().totalCarb }}%</strong></span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Dietary Fiber -->
      <div class="nf-row nf-indent">
        <span>Dietary Fiber {{ data().dietaryFiberG ?? 0 }}g</span>
        <span class="nf-dv"><strong>{{ dv().dietaryFiber }}%</strong></span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Total Sugars -->
      <div class="nf-row nf-indent">
        <span>Total Sugars {{ data().totalSugarsG ?? 0 }}g</span>
        <span class="nf-dv"></span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Added Sugars -->
      @if (data().addedSugarsG !== null && data().addedSugarsG !== undefined) {
        <div class="nf-row nf-indent2">
          <span>Includes {{ data().addedSugarsG }}g Added Sugars</span>
          <span class="nf-dv"><strong>{{ dv().addedSugars }}%</strong></span>
        </div>
        <div class="nf-divider-hair"></div>
      }

      <!-- Protein -->
      <div class="nf-row">
        <span><strong>Protein</strong> {{ data().proteinG ?? 0 }}g</span>
        <span class="nf-dv"></span>
      </div>

      <div class="nf-divider-thick"></div>

      <!-- Vitamin D -->
      <div class="nf-row">
        <span>Vitamin D {{ data().vitaminDMcg ?? 0 }}mcg</span>
        <span class="nf-dv">{{ dv().vitaminD }}%</span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Calcium -->
      <div class="nf-row">
        <span>Calcium {{ data().calciumMG ?? 0 }}mg</span>
        <span class="nf-dv">{{ dv().calcium }}%</span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Iron -->
      <div class="nf-row">
        <span>Iron {{ data().ironMG ?? 0 }}mg</span>
        <span class="nf-dv">{{ dv().iron }}%</span>
      </div>
      <div class="nf-divider-hair"></div>

      <!-- Potassium -->
      <div class="nf-row">
        <span>Potassium {{ data().potassiumMG ?? 0 }}mg</span>
        <span class="nf-dv">{{ dv().potassium }}%</span>
      </div>

      <div class="nf-divider-medium"></div>

      <div class="nf-footer">
        * The % Daily Value (DV) tells you how much a nutrient in a
        serving of food contributes to a daily diet. 2,000 calories
        a day is used for general nutrition advice.
      </div>
    </div>
  `,
  styles: [`
    .nf-label {
      width: 280px;
      padding: 4px 8px 8px;
      border: 2px solid #000000;
      background: #ffffff;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      box-sizing: border-box;
    }

    .nf-title {
      font-size: 28px;
      font-weight: 900;
      line-height: 1.1;
      margin-bottom: 2px;
    }

    .nf-servings {
      margin: 2px 0;
    }
    .nf-servings-line { font-size: 11px; }
    .nf-serving-size {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-weight: 700;
      font-size: 13px;
    }

    // Up / down arrow pair, vertically stacked, sized small so they sit
    // between "Serving size" and the displayed quantity without inflating
    // the row height significantly. Pure CSS — no Material dep — so the
    // label stays self-contained.
    .nf-serving-steppers {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      margin-left: auto;
    }

    .nf-serving-step {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 11px;
      padding: 0;
      background: transparent;
      border: 1px solid #777;
      border-radius: 2px;
      color: #000;
      cursor: pointer;
      transition: background 0.1s ease, border-color 0.1s ease;

      svg {
        width: 9px;
        height: 5px;
        display: block;
      }

      &:hover {
        background: #e8e8e8;
        border-color: #000;
      }
      &:active {
        background: #d0d0d0;
      }
    }

    // Value column sits to the right of the steppers. flex-shrink:0 keeps
    // the "(81g)" portion intact even on a narrower popup.
    .nf-serving-value {
      flex-shrink: 0;
    }

    // In editable mode the displayed value reads as tap-to-edit. Subtle
    // dotted underline + pointer cursor signals it without dominating.
    .nf-serving-clickable {
      cursor: pointer;
      border-bottom: 1px dotted rgba(0, 0, 0, 0.45);
      padding-bottom: 1px;
    }

    // Edit-mode input. Sized to match the displayed value's footprint so
    // the row doesn't reflow as the user toggles in and out of edit. Strip
    // the spinner Chrome injects on number inputs — we own the steppers.
    .nf-serving-edit-input {
      flex-shrink: 0;
      width: 56px;
      padding: 1px 4px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      color: #000;
      background: #fff;
      border: 1px solid #777;
      border-radius: 2px;
      outline: none;

      &:focus {
        border-color: #000;
      }

      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      &[type='number'] {
        -moz-appearance: textfield;
      }
    }

    // Green check button. Disabled state desaturates to grey + drops opacity
    // so it reads as "you need to type something different first."
    .nf-serving-commit {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      background: #bdbdbd;
      border: 1px solid #999;
      border-radius: 50%;
      color: #fff;
      cursor: not-allowed;
      transition: background 0.1s ease, border-color 0.1s ease, opacity 0.1s ease;
      opacity: 0.6;

      svg {
        width: 14px;
        height: 14px;
        display: block;
      }

      &.enabled {
        background: #2e7d32;
        border-color: #1b5e20;
        cursor: pointer;
        opacity: 1;

        &:hover  { background: #388e3c; }
        &:active { background: #1b5e20; }
      }
    }

    // Unit suffix shown alongside the input in edit mode (e.g. "whole (78g)").
    // Mirrors the trailing portion of .nf-serving-value when not editing so
    // the user still sees the unit context while typing.
    .nf-serving-unit-suffix {
      flex-shrink: 0;
      font-weight: 700;
      font-size: 13px;
      color: #000;
    }

    .nf-divider-thick {
      height: 8px;
      background: #000000;
      margin: 2px 0;
    }
    .nf-divider-medium {
      height: 4px;
      background: #000000;
      margin: 1px 0;
    }
    .nf-divider-hair {
      height: 1px;
      background: #000000;
      margin: 0;
    }

    .nf-calories-section {
      margin: 2px 0;
    }
    .nf-amount-label {
      font-size: 10px;
      font-weight: 700;
    }
    .nf-calories-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .nf-calories-label {
      font-size: 18px;
      font-weight: 900;
    }
    .nf-calories-value {
      font-size: 28px;
      font-weight: 900;
      line-height: 1;
    }

    .nf-dv-header {
      text-align: right;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 0;
    }

    .nf-row {
      display: flex;
      justify-content: space-between;
      padding: 1px 0;
      font-size: 12px;
    }
    .nf-indent { padding-left: 16px; }
    .nf-indent2 { padding-left: 32px; }
    .nf-dv {
      white-space: nowrap;
      text-align: right;
    }

    .nf-footer {
      font-size: 9px;
      line-height: 1.3;
      margin-top: 4px;
    }
  `]
})
export class NutritionFactsLabelComponent {
  nutritionFacts = input<NutritionFacts | null>(null);

  // Scale factor — 1.0 = base serving, can be changed externally
  scale = input<number>(1);

  // Display unit and quantity (shown on serving size line)
  displayUnit = input<string>('g');
  displayQuantity = input<number | null>(null);

  // Editable mode renders ▲ / ▼ stepper buttons next to the serving-size
  // line AND makes the value tap-to-edit. The label is intentionally dumb
  // about unit semantics — it emits direction (`adjust`) or a typed value
  // (`commit`); the parent owns the ladder-snap step + persistence.
  editable = input<boolean>(false);
  adjust = output<'up' | 'down'>();
  commit = output<number>();

  // ----- Edit-mode state ---------------------------------------------------
  // `editing` flips true on tap of the displayed value. `editValue` carries
  // the in-flight typed text (kept as a string so partial input like "0."
  // doesn't get parsed prematurely; we coerce on commit).
  editing = signal(false);
  editValue = signal('');
  // Suppresses the upcoming blur-revert when the user is clicking the green
  // commit button — mousedown fires first, sets the flag, the input's blur
  // then sees it and skips the revert. Flag cleared on the next tick.
  private commitInFlight = false;

  private editInputRef = viewChild<ElementRef<HTMLInputElement>>('editInput');

  // Auto-focus the input the moment editing flips true.
  private focusEditInputEffect = effect(() => {
    if (this.editing()) {
      queueMicrotask(() => this.editInputRef()?.nativeElement.focus());
    }
  });

  /** Tap the displayed value → enter edit mode, prime the input with the
   *  current committed quantity. */
  onValueClick(): void {
    if (!this.editable()) return;
    const dq = this.displayQuantity();
    this.editValue.set(dq != null ? String(dq) : '');
    this.editing.set(true);
  }

  onEditInput(value: string): void {
    this.editValue.set(value);
  }

  /** Parse the in-flight value. Returns null on NaN / non-numeric. */
  private parsedEditValue(): number | null {
    const raw = this.editValue().trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /** Commit is enabled only when the typed value is a positive number AND
   *  differs from what's currently committed. */
  isCommitValid = computed(() => {
    if (!this.editing()) return false;
    const parsed = this.parsedEditValue();
    if (parsed === null || parsed <= 0) return false;
    return parsed !== this.displayQuantity();
  });

  /** Capture mousedown so the input's blur handler can tell this commit
   *  click apart from a click-elsewhere blur (which should revert). */
  onCommitMouseDown(ev: Event): void {
    ev.preventDefault(); // keep focus on the input through the click
    this.commitInFlight = true;
  }

  commitIfValid(): void {
    if (!this.isCommitValid()) return;
    const parsed = this.parsedEditValue();
    if (parsed === null) return;
    this.commit.emit(parsed);
    this.editing.set(false);
    this.commitInFlight = false;
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.commitInFlight = false;
  }

  /** Blur without commit reverts. The commitInFlight flag (set by the green
   *  check's mousedown) means "blur is firing because we're committing —
   *  don't revert." */
  onEditBlur(): void {
    if (this.commitInFlight) {
      this.commitInFlight = false;
      return;
    }
    this.editing.set(false);
  }

  onStepUp(ev: Event): void {
    ev.stopPropagation();
    // Stepping while typing cancels the edit; the next step works from the
    // committed value, not from whatever was being typed.
    if (this.editing()) this.cancelEdit();
    this.adjust.emit('up');
  }
  onStepDown(ev: Event): void {
    ev.stopPropagation();
    if (this.editing()) this.cancelEdit();
    this.adjust.emit('down');
  }

  servingSizeDisplay = computed(() => {
    const dq = this.displayQuantity();
    const du = this.displayUnit();
    const d = this.data();
    if (dq !== null && du !== 'g') {
      return `${dq} ${du} (${d.servingSizeG ?? 0}g)`;
    }
    const household = d.servingSizeHousehold;
    if (household && /\(\d+g?\)/.test(household)) {
      return household;
    }
    return household
      ? `${household} (${d.servingSizeG ?? 0}g)`
      : `(${d.servingSizeG ?? 0}g)`;
  });

  data = computed(() => {
    const nf = this.nutritionFacts();
    const s = this.scale();
    if (!nf) return {} as NutritionFacts;
    return {
      foodName: nf.foodName,
      servingSizeHousehold: nf.servingSizeHousehold,
      // Macros are stored per-100g (per the SQL fixup script that sets
      // servingSizeMultiplicand = servingSizeG / 100). So the effective
      // grams of the displayed serving = scale × 100. Don't multiply
      // nf.servingSizeG by scale — that double-scales and gives nonsense
      // values like 8g instead of 28g for a 1 oz beef serving.
      servingSizeG: Math.round(s * 100),
      servingsPerContainer: nf.servingsPerContainer,
      calories: nf.calories ? Math.round(nf.calories * s) : 0,
      totalFatG: nf.totalFatG ? Math.round(nf.totalFatG * s * 10) / 10 : 0,
      saturatedFatG: nf.saturatedFatG ? Math.round(nf.saturatedFatG * s * 10) / 10 : 0,
      transFatG: nf.transFatG != null ? Math.round(nf.transFatG * s * 10) / 10 : null,
      cholesterolMG: nf.cholesterolMG ? Math.round(nf.cholesterolMG * s) : 0,
      sodiumMG: nf.sodiumMG ? Math.round(nf.sodiumMG * s) : 0,
      totalCarbohydrateG: nf.totalCarbohydrateG ? Math.round(nf.totalCarbohydrateG * s * 10) / 10 : 0,
      dietaryFiberG: nf.dietaryFiberG ? Math.round(nf.dietaryFiberG * s * 10) / 10 : 0,
      totalSugarsG: nf.totalSugarsG ? Math.round(nf.totalSugarsG * s * 10) / 10 : 0,
      addedSugarsG: nf.addedSugarsG != null ? Math.round(nf.addedSugarsG * s * 10) / 10 : null,
      proteinG: nf.proteinG ? Math.round(nf.proteinG * s * 10) / 10 : 0,
      vitaminDMcg: nf.vitaminDMcg ? Math.round(nf.vitaminDMcg * s * 10) / 10 : 0,
      calciumMG: nf.calciumMG ? Math.round(nf.calciumMG * s) : 0,
      ironMG: nf.ironMG ? Math.round(nf.ironMG * s * 10) / 10 : 0,
      potassiumMG: nf.potassiumMG ? Math.round(nf.potassiumMG * s) : 0,
    };
  });

  dv = computed(() => {
    const d = this.data();
    return {
      totalFat: dvPercent(d.totalFatG, DV.totalFatG),
      saturatedFat: dvPercent(d.saturatedFatG, DV.saturatedFatG),
      cholesterol: dvPercent(d.cholesterolMG, DV.cholesterolMG),
      sodium: dvPercent(d.sodiumMG, DV.sodiumMG),
      totalCarb: dvPercent(d.totalCarbohydrateG, DV.totalCarbohydrateG),
      dietaryFiber: dvPercent(d.dietaryFiberG, DV.dietaryFiberG),
      addedSugars: dvPercent(d.addedSugarsG, DV.addedSugarsG),
      vitaminD: dvPercent(d.vitaminDMcg, DV.vitaminDMcg),
      calcium: dvPercent(d.calciumMG, DV.calciumMG),
      iron: dvPercent(d.ironMG, DV.ironMG),
      potassium: dvPercent(d.potassiumMG, DV.potassiumMG),
    };
  });
}
