// src/app/components/menus-meals/menus-meals.ts
//
// The meals grid for the selected Menu: a responsive auto-fit grid of meal
// cards (targets 2-up at laptop width). Resolves each slot's meal items from
// RotationService and passes them down to the meal cards.
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Menu, MealItem, MenuSlot } from '../../models';
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
            [editing]="isEditing(slot.slotOrder)"
            [resolvingItemId]="resolvingItemId()"
            (placeMeal)="onPlace($event)"
            (deleteMeal)="onDelete($event)"
            (editSlot)="onEditSlot(slot)"
            (doneEdit)="rotation.stopEditing()"
            (removeItem)="onRemoveItem(slot.mealId, $event)"
            (editItem)="onEditItem(slot, $event)"
            (dropFood)="rotation.addFoodToEditingMeal($event.food, $event.serving)" />
        }
      </div>
    }
  `,
  styleUrls: ['./menus-meals.scss'],
})
export class MenusMealsComponent {
  readonly rotation = inject(RotationService);

  readonly menu = input.required<Menu | undefined>();

  /** The item id whose food is being resolved for the serving popup (drives the
   *  row pencil's busy state). Threaded down from the panel. */
  readonly resolvingItemId = input<number | null>(null);

  /** ✎ on a food row (edit mode) — bubble the item + its meal id so the panel
   *  can host the serving popup. */
  readonly editItem = output<{ mealId: number; item: MealItem }>();

  itemsFor(mealId: number | null | undefined): MealItem[] {
    return this.rotation.slotItems(mealId);
  }

  /** True when this menu's slot is the one being edited. */
  isEditing(slotOrder: number): boolean {
    const e = this.rotation.editingSlot();
    return e != null && e.menuId === this.menu()?.id && e.slotOrder === slotOrder;
  }

  /** A binder meal was dropped on an empty slot — assign it to this menu. */
  onPlace(e: { slotOrder: number; mealId: number }): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    this.rotation.placeMealInSlot(menuId, e.slotOrder, e.mealId);
  }

  /** Trash on an in-slot meal — clear that slot. */
  onDelete(slotOrder: number): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    this.rotation.clearSlot(menuId, slotOrder);
  }

  /** ✎ on a slot — enter edit mode for it (rail swaps to the lookaside). */
  onEditSlot(slot: MenuSlot): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    this.rotation.beginEditingSlot(menuId, slot.slotOrder, slot.mealId ?? null);
  }

  /** ✕ on a food row (edit mode) — remove that item from the meal. */
  onRemoveItem(mealId: number | null | undefined, item: MealItem): void {
    if (mealId == null || item.id == null) return;
    this.rotation.deleteMealItem(mealId, item.id);
  }

  /** ✎ on a food row — only the editing slot's pencil opens the serving popup
   *  (the non-edit-mode hover pencil in other slots stays inert). */
  onEditItem(slot: MenuSlot, item: MealItem): void {
    if (!this.isEditing(slot.slotOrder) || slot.mealId == null) return;
    this.editItem.emit({ mealId: slot.mealId, item });
  }
}
