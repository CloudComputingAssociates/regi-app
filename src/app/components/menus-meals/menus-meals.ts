// src/app/components/menus-meals/menus-meals.ts
//
// The meals grid for the selected Menu: a responsive auto-fit grid of meal
// cards (targets 2-up at laptop width). Resolves each slot's meal items from
// RotationService and passes them down to the meal cards.
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Menu, MealItem } from '../../models';
import { RotationService } from '../../services/rotation.service';
import { MealComponent } from '../meal/meal';

@Component({
  selector: 'app-menus-meals',
  imports: [MealComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (menu(); as m) {
      <div class="canvas-grid">
        @for (slot of m.slots; track slot.slotOrder) {
          <app-meal
            [slot]="slot"
            [items]="itemsFor(slot.mealId)"
            (placeMeal)="onPlace($event)" />
        }
      </div>
    }
  `,
  styleUrls: ['./menus-meals.scss'],
})
export class MenusMealsComponent {
  private rotation = inject(RotationService);

  readonly menu = input.required<Menu | undefined>();

  itemsFor(mealId: number | null | undefined): MealItem[] {
    return this.rotation.slotItems(mealId);
  }

  /** A binder meal was dropped on an empty slot — assign it to this menu. */
  onPlace(e: { slotOrder: number; mealId: number }): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    this.rotation.placeMealInSlot(menuId, e.slotOrder, e.mealId);
  }
}
