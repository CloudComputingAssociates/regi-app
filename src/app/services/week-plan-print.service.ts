// src/app/services/week-plan-print.service.ts
import { Injectable } from '@angular/core';
import { WeekPlan, DayPlan, Meal, MealItem } from '../models/planning.model';

export interface PrintOptions {
  includeMeals: boolean;
  includeShoppingList: boolean;
  userName: string;
  eatingStartTime: string;
  mealsPerDay: number;
  fastingType: string;
}

interface AggregatedFood {
  foodName: string;
  displayName: string;
  totalQty: number;
  unit: string;
  categoryName: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Injectable({ providedIn: 'root' })
export class WeekPlanPrintService {

  print(wp: WeekPlan, options: PrintOptions): void {
    const html = this.buildHtml(wp, options);
    const popup = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    // Auto-trigger print after rendering
    popup.onload = () => setTimeout(() => popup.print(), 300);
  }

  private buildHtml(wp: WeekPlan, options: PrintOptions): string {
    const activeDays = (wp.days || [])
      .filter(d => d.meals?.length > 0)
      .sort((a, b) => new Date(a.planDate).getTime() - new Date(b.planDate).getTime());

    const totalDays = activeDays.length;
    let bodyContent = '';

    if (options.includeMeals) {
      activeDays.forEach((day, idx) => {
        bodyContent += this.buildDaySection(day, idx + 1, totalDays, wp, options);
      });
    }

    if (options.includeShoppingList) {
      bodyContent += this.buildShoppingList(wp, totalDays);
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this.escHtml(wp.name)} - Meal Plan</title>
  <style>${this.getStyles()}</style>
</head>
<body>
  ${bodyContent}
  <script>
    // Update page numbers after render
    const pages = document.querySelectorAll('.page');
    const total = pages.length;
    pages.forEach((p, i) => {
      p.querySelector('.page-num').textContent = (i + 1) + ' of ' + total;
    });
  </script>
</body>
</html>`;
  }

  private buildDaySection(day: DayPlan, dayNum: number, totalDays: number, wp: WeekPlan, options: PrintOptions): string {
    const date = new Date(day.planDate + 'T00:00:00');
    const dayName = DAYS[date.getDay()];

    // Calculate targets from meals
    let totalCal = 0, totalPro = 0, totalFat = 0, totalCarb = 0;
    for (const dpm of day.meals || []) {
      if (!dpm.meal) continue;
      totalCal += dpm.meal.totalCalories ?? 0;
      totalPro += Math.round(dpm.meal.totalProteinG ?? 0);
      totalFat += Math.round(dpm.meal.totalFatG ?? 0);
      totalCarb += Math.round(dpm.meal.totalCarbG ?? 0);
    }

    const macroTotal = totalPro * 4 + totalFat * 9 + totalCarb * 4;
    const proPct = macroTotal > 0 ? Math.round((totalPro * 4 / macroTotal) * 100) : 0;
    const fatPct = macroTotal > 0 ? Math.round((totalFat * 9 / macroTotal) * 100) : 0;
    const carbPct = macroTotal > 0 ? Math.round((totalCarb * 4 / macroTotal) * 100) : 0;

    // Build meal sections
    const sortedMeals = [...(day.meals || [])].sort((a, b) => a.mealSlot - b.mealSlot);
    let mealsHtml = '';

    sortedMeals.forEach((dpm, i) => {
      if (!dpm.meal) return;
      const mealTime = this.calculateMealTime(options.eatingStartTime, i, options.mealsPerDay, options.fastingType);
      mealsHtml += this.buildMealSection(dpm.meal, dpm.mealSlot, mealTime);
    });

    const dateFormatted = this.formatDateDisplay(day.planDate);

    return `
    <div class="page">
      ${this.buildHeader(dateFormatted)}
      <div class="day-name">${dayName} <span class="day-num">(Day ${dayNum} of ${totalDays})</span></div>
      <div class="plan-name-line">${this.escHtml(wp.name)}</div>
      <div class="daily-targets">
        Daily Targets: ${totalCal} calories | ${totalPro}g protein (${proPct}%) | ${totalCarb}g carbs (${carbPct}%) | ${totalFat}g fat (${fatPct}%)
      </div>
      ${mealsHtml}
      ${this.buildFooter(options.userName)}
    </div>`;
  }

  private buildMealSection(meal: Meal, slot: number, time: string): string {
    const mCal = meal.totalCalories ?? 0;
    const mPro = Math.round(meal.totalProteinG ?? 0);
    const mFat = Math.round(meal.totalFatG ?? 0);
    const mCarb = Math.round(meal.totalCarbG ?? 0);

    let rows = '';
    for (const item of meal.items || []) {
      rows += `
        <tr>
          <td>${this.escHtml(item.shortDescription || item.foodName)}</td>
          <td>${this.formatQty(item.quantity)} ${this.escHtml(item.unit)}</td>
          <td class="num">${item.calories ?? 0}</td>
          <td class="num">${Math.round(item.proteinG ?? 0)}g</td>
          <td class="num">${Math.round(item.carbG ?? 0)}g</td>
          <td class="num">${Math.round(item.fatG ?? 0)}g</td>
        </tr>`;
    }

    return `
    <div class="meal-section">
      <div class="meal-title">${time} Meal ${slot} - ${this.escHtml(meal.name)}</div>
      <div class="meal-totals">
        Total: ${mCal} calories | ${mPro}g protein | ${mCarb}g carbs | ${mFat}g fat
      </div>
      <table class="food-table">
        <thead>
          <tr><th>Food Item</th><th>Amount</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  private buildShoppingList(wp: WeekPlan, dayCount: number): string {
    const foods = this.aggregateFoods(wp);

    // Group by category
    const categories = new Map<string, AggregatedFood[]>();
    for (const food of foods) {
      const cat = food.categoryName || 'Other';
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(food);
    }

    let sectionsHtml = '';
    for (const [catName, items] of categories) {
      const sortedItems = items.sort((a, b) => a.displayName.localeCompare(b.displayName));
      let itemsHtml = '';
      for (const item of sortedItems) {
        itemsHtml += `
          <div class="shopping-item">
            <span class="shopping-check">&#9633;</span>
            <span class="shopping-name">${this.escHtml(item.displayName)}</span>
            <span class="shopping-qty"> - ${this.formatQty(item.totalQty)} ${this.escHtml(item.unit)}</span>
          </div>`;
      }
      sectionsHtml += `
        <div class="shopping-category">
          <h3>${this.escHtml(catName)}</h3>
          ${itemsHtml}
        </div>`;
    }

    const startDate = this.formatDateDisplay(wp.startDate);

    return `
    <div class="page">
      ${this.buildHeader(startDate)}
      <div class="day-name">${dayCount} Day Shopping List</div>
      <div class="plan-name-line">${this.escHtml(wp.name)}</div>
      ${sectionsHtml}
      ${this.buildFooter('')}
    </div>`;
  }

  private aggregateFoods(wp: WeekPlan): AggregatedFood[] {
    const map = new Map<number, AggregatedFood>();
    for (const day of wp.days || []) {
      for (const dpm of day.meals || []) {
        if (!dpm.meal?.items) continue;
        for (const item of dpm.meal.items) {
          const existing = map.get(item.foodId);
          if (existing) {
            existing.totalQty += item.quantity;
          } else {
            map.set(item.foodId, {
              foodName: item.foodName,
              displayName: item.shortDescription || item.foodName,
              totalQty: item.quantity,
              unit: item.unit,
              categoryName: item.categoryName || 'Other'
            });
          }
        }
      }
    }
    return Array.from(map.values());
  }

  private buildHeader(planName: string): string {
    return `
      <div class="header">
        <div class="header-title">${this.escHtml(planName)}</div>
        <img src="/images/yeh_logo_dark.png" class="header-logo" alt="YEH" />
      </div>`;
  }

  private buildFooter(userName: string): string {
    const userLine = userName ? ` for ${this.escHtml(userName)}` : '';
    return `
      <div class="footer">
        <div class="footer-left">
          <img src="/images/yeh_logo_dark.png" class="footer-logo" alt="" />
          <span>: <strong>RegiMenu&trade;</strong> MealPlan${userLine}</span>
        </div>
        <span class="page-num"></span>
      </div>`;
  }

  private calculateMealTime(startTime: string, index: number, mealsPerDay: number, fastingType: string): string {
    const windowHours = this.getEatingWindowHours(fastingType);
    const spacingMinutes = mealsPerDay > 1 ? (windowHours * 60) / (mealsPerDay - 1) : 0;
    const [hours, mins] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + Math.round(index * spacingMinutes);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${displayH}${period}` : `${displayH}:${String(m).padStart(2, '0')}${period}`;
  }

  private getEatingWindowHours(fastingType: string): number {
    switch (fastingType) {
      case '16_8': return 8;
      case '18_6': return 6;
      case '20_4': return 4;
      case 'omad': return 0;
      default: return 14;
    }
  }

  private formatDateDisplay(planDate: string): string {
    const d = new Date(planDate + 'T00:00:00');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${d.getFullYear()}`;
  }

  private formatQty(qty: number): string {
    if (Number.isInteger(qty)) return String(qty);
    return String(Math.round(qty * 100) / 100);
  }

  private escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private getStyles(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; }

      .page {
        page-break-after: always;
        min-height: 100vh;
        padding: 30px 40px;
        position: relative;
        display: flex;
        flex-direction: column;
      }
      .page:last-child { page-break-after: avoid; }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
        border-bottom: 3px solid #4a7fb5;
        padding-bottom: 8px;
      }
      .header-title {
        font-size: 28px;
        font-weight: 800;
        color: #333;
      }
      .header-logo {
        width: 60px;
        height: auto;
      }

      .day-name {
        font-size: 22px;
        font-weight: 700;
        color: #4a7fb5;
        margin: 4px 0 2px;
      }
      .day-num {
        font-size: 14px;
        font-weight: 400;
        color: #888;
      }
      .plan-name-line {
        font-size: 12px;
        color: #888;
        margin-bottom: 8px;
      }

      .daily-targets {
        font-size: 12px;
        font-weight: 600;
        color: #555;
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid #ddd;
      }

      .meal-section {
        margin-bottom: 20px;
      }
      .meal-title {
        font-size: 18px;
        font-weight: 700;
        color: #4a7fb5;
        border-bottom: 2px solid #4a7fb5;
        padding-bottom: 4px;
        margin-bottom: 4px;
      }
      .meal-totals {
        font-size: 12px;
        font-weight: 600;
        color: #555;
        margin-bottom: 8px;
      }

      .food-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        margin-bottom: 8px;
      }
      .food-table th {
        text-align: left;
        border-bottom: 1px solid #999;
        padding: 4px 8px;
        font-weight: 600;
        color: #333;
      }
      .food-table td {
        padding: 3px 8px;
        border-bottom: 1px solid #eee;
      }
      .food-table .num { text-align: right; }

      .footer {
        margin-top: auto;
        padding-top: 12px;
        border-top: 2px solid #4a7fb5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: #888;
      }
      .footer-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .footer-logo {
        width: 30px;
        height: auto;
      }
      .page-num {
        font-size: 11px;
        color: #888;
      }

      /* Shopping list */
      .shopping-category { margin-bottom: 16px; }
      .shopping-category h3 {
        font-size: 16px;
        font-weight: 700;
        color: #4a7fb5;
        margin-bottom: 6px;
        border-bottom: 1px solid #ddd;
        padding-bottom: 2px;
      }
      .shopping-item {
        padding: 2px 0 2px 20px;
        font-size: 13px;
      }
      .shopping-check {
        margin-right: 8px;
        font-size: 14px;
      }
      .shopping-name { font-weight: 600; }
      .shopping-qty { color: #666; }

      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { padding: 20px 30px; }
        @page { margin: 0.5in; }
      }
    `;
  }
}
