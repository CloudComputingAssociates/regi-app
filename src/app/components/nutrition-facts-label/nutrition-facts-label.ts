// src/app/components/nutrition-facts-label/nutrition-facts-label.ts
import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
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
          <span class="nf-serving-value">{{ servingSizeDisplay() }}</span>
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
      justify-content: space-between;
      font-weight: 700;
      font-size: 13px;
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
      servingSizeG: nf.servingSizeG ? Math.round(nf.servingSizeG * s) : undefined,
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
