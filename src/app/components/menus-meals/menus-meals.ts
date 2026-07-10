// src/app/components/menus-meals/menus-meals.ts
//
// The meals grid for the selected Menu: a responsive auto-fit grid of meal
// cards (targets 2-up at laptop width). Resolves each slot's meal items from
// RotationService and passes them down to the meal cards.
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Menu, MealItem, MenuSlot } from '../../models';
import { RotationService, TEACH_SAVE_LINE } from '../../services/rotation.service';
import { MealComponent } from '../meal/meal';
import { WipeConfirmDialogComponent } from '../wipe-confirm-dialog/wipe-confirm-dialog';

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
            [pinAlive]="pinAliveFor(slot.mealId)"
            [dropHighlight]="rotation.dragging() === 'meal'"
            (placeMeal)="onPlace($event)"
            (deleteMeal)="onDelete($event)"
            (toggleAdd)="onToggleAdd(slot)"
            (renameMeal)="rotation.updateMealName($event.mealId, $event.name)"
            (pinMeal)="onPinMeal(slot.mealId)"
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
  private dialog = inject(MatDialog);

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

  /** Pin icon state for a slotted meal, resolved from the cached Meal. */
  pinAliveFor(mealId: number | null | undefined): boolean {
    if (mealId == null) return false;
    const meal = this.rotation.getMeal(mealId);
    return meal ? this.rotation.isPinAlive(meal) : false;
  }

  /** Book icon on a slotted meal — pin it to the Binder. */
  onPinMeal(mealId: number | null | undefined): void {
    if (mealId == null) return;
    void this.rotation.pinMeal(mealId);
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

  /** Trash on an in-slot meal — confirm, then clear that slot. The server deletes
   *  the occupant if unpinned, unlinks it (kept in the Binder) if pinned. Teach
   *  line appended when the occupant holds diverged/session-edited work. */
  onDelete(slotOrder: number): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    const slot = this.menu()?.slots.find((s) => s.slotOrder === slotOrder);
    const meal = slot?.mealId != null ? this.rotation.getMeal(slot.mealId) : null;
    const teachLine = meal && this.rotation.shouldTeachSave(meal) ? TEACH_SAVE_LINE : undefined;
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        message: `Remove meal from Meal ${slotOrder} slot?`,
        teachLine,
        confirmLabel: 'Remove',
        onConfirm: () => this.rotation.clearSlot(menuId, slotOrder),
      },
    });
  }

  /** + on a slot — toggle it as the lookaside add target (open/close the
   *  food list on this meal). */
  onToggleAdd(slot: MenuSlot): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    if (this.isEditing(slot.slotOrder)) this.rotation.stopEditing();
    else this.rotation.beginEditingSlot(menuId, slot.slotOrder, slot.mealId ?? null);
  }

  /** ✕ on a food row — remove that item from the meal (works directly, no
   *  add target needed). */
  onRemoveItem(mealId: number | null | undefined, item: MealItem): void {
    if (mealId == null || item.id == null) return;
    this.rotation.deleteMealItem(mealId, item.id);
  }

  /** ✎ on a food row — open the serving popup for that item directly. */
  onEditItem(slot: MenuSlot, item: MealItem): void {
    if (slot.mealId == null) return;
    this.editItem.emit({ mealId: slot.mealId, item });
  }
}
