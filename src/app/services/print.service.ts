// src/app/services/print.service.ts
import { Injectable } from '@angular/core';
import { WeekPlan } from '../models/planning.model';

interface AggregatedFood {
  foodName: string;
  displayName: string;
  totalQty: number;
  unit: string;
  categoryName: string;
}

@Injectable({ providedIn: 'root' })
export class PrintService {

  print(wp: WeekPlan): void {
    const html = this.buildHtml(wp);
    const popup = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    popup.onload = () => setTimeout(() => popup.print(), 300);
  }

  private buildHtml(wp: WeekPlan): string {
    const activeDays = (wp.days || []).filter(d => d.meals?.length > 0);
    const totalDays = activeDays.length;
    const bodyContent = this.buildShoppingList(wp, totalDays);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this.escHtml(wp.name)} - Shopping List</title>
  <style>${this.getStyles()}</style>
</head>
<body>
  ${bodyContent}
  <script>
    const pages = document.querySelectorAll('.page');
    const total = pages.length;
    pages.forEach((p, i) => {
      p.querySelector('.page-num').textContent = (i + 1) + ' of ' + total;
    });
  </script>
</body>
</html>`;
  }

  private buildShoppingList(wp: WeekPlan, dayCount: number): string {
    const foods = this.aggregateFoods(wp);

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

    return `
    <div class="page">
      <div class="header">
        <div class="header-left">
          <span class="header-day">${dayCount} Day Shopping List</span>
        </div>
        <img src="/images/yeh_logo_dark.png" class="header-logo" alt="YEH" />
      </div>
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

  private buildFooter(userName: string): string {
    const userLine = userName ? ` for ${this.escHtml(userName)}` : '';
    return `
      <div class="footer">
        <div class="footer-left">
          <img src="/images/yeh_logo_dark.png" class="footer-logo" alt="" />
          <span>: <strong>RegiMenu&trade;</strong> Shopping List${userLine}</span>
        </div>
        <span class="page-num"></span>
      </div>`;
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
        padding: 30px 40px;
        position: relative;
        display: flex;
        flex-direction: column;
      }
      .page:last-child { page-break-after: avoid; }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 3px solid #4a7fb5;
        padding-bottom: 6px;
        margin-bottom: 4px;
      }
      .header-left {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .header-day {
        font-size: 22px;
        font-weight: 700;
        color: #333;
      }
      .header-logo {
        width: 60px;
        height: auto;
      }

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
