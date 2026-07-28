// src/app/components/menus-meals/menus-meals.ts
//
// The meals grid for the selected Menu: a responsive auto-fit grid of meal
// cards. Each slot is now a MULTI-MEAL card (0–4 stacked meals) — app-meal reads
// slot.meals[] and pulls each meal's items straight from RotationService.
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Menu, MealItem, MenuSlot } from '../../models';
import { RotationService, TEACH_SAVE_LINE } from '../../services/rotation.service';
import { NotificationService } from '../../services/notification.service';
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
            [editing]="isEditing(slot.slotOrder)"
            [resolvingItemId]="resolvingItemId()"
            [dropHighlight]="dropHighlightFor(slot.slotOrder)"
            (placeMeal)="onPlace($event)"
            (removeMeal)="onRemoveMeal($event)"
            (deleteMeal)="onDelete($event)"
            (toggleAdd)="onToggleAdd(slot, $event)"
            (renameMeal)="rotation.updateMealName($event.mealId, $event.name)"
            (pinMeal)="onPinMeal($event)"
            (editItem)="onEditItem($event)"
            (removeItem)="onRemoveItem($event)"
            (dropFood)="rotation.addFoodToEditingMeal($event.food, $event.serving)" />
        }
      </div>
      <div class="area-watermark">meals</div>
    }
  `,
  styleUrls: ['./menus-meals.scss'],
})
export class MenusMealsComponent {
  readonly rotation = inject(RotationService);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);

  readonly menu = input.required<Menu | undefined>();

  /** The item id whose food is being resolved for the serving popup. */
  readonly resolvingItemId = input<number | null>(null);

  /** ✎ on a food row — bubble the item + its meal id so the panel can host the
   *  serving popup. */
  readonly editItem = output<{ mealId: number; item: MealItem }>();

  /** Should this empty slot "bloom" as a meal target? */
  dropHighlightFor(slotOrder: number): boolean {
    if (this.rotation.dragging() === 'meal') return true;
    return (
      this.rotation.selectedCard()?.kind === 'meal' &&
      this.rotation.nextEmptySlotOrder() === slotOrder
    );
  }

  /** True when this menu's slot is the one being edited (food add target). */
  isEditing(slotOrder: number): boolean {
    const e = this.rotation.editingSlot();
    return e != null && e.menuId === this.menu()?.id && e.slotOrder === slotOrder;
  }

  /** A binder meal was dropped on a slot (empty placeholder or front grid) —
   *  append it to that slot. */
  onPlace(e: { slotOrder: number; mealId: number }): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    void this.rotation.placeMealInSlot(menuId, e.slotOrder, e.mealId);
  }

  /** Per-tile trash — remove one meal from the slot. */
  onRemoveMeal(e: { slotOrder: number; mealId: number }): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    void this.rotation.removeMealFromSlot(menuId, e.slotOrder, e.mealId);
  }

  /** Header trash — clear the WHOLE slot (all meals). Confirm; teach line when any
   *  meal in it holds unsaved work. */
  onDelete(slotOrder: number): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    const slot = this.menu()?.slots.find((s) => s.slotOrder === slotOrder);
    const teach = (slot?.meals ?? []).some((m) => {
      const meal = this.rotation.getMeal(m.mealId);
      return meal ? this.rotation.shouldTeachSave(meal) : false;
    });
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        message: `Clear all meals from the Meal ${slotOrder} slot?`,
        teachLine: teach ? TEACH_SAVE_LINE : undefined,
        confirmLabel: 'Clear',
        onConfirm: () => this.rotation.clearSlot(menuId, slotOrder),
      },
    });
  }

  /** + on a meal (back face) — toggle it as the lookaside food-add target. */
  onToggleAdd(slot: MenuSlot, mealId: number): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    const e = this.rotation.editingSlot();
    if (e && e.menuId === menuId && e.slotOrder === slot.slotOrder && e.mealId === mealId) {
      this.rotation.stopEditing();
    } else {
      this.rotation.beginEditingSlot(menuId, slot.slotOrder, mealId);
    }
  }

  /** Green check — save a stacked meal. A fork updates its Binder origin; a fresh
   *  meal saves to the Binder (with a real-name nudge). Never a duplicate. */
  onPinMeal(mealId: number | null | undefined): void {
    if (mealId == null) return;
    const sourceName = this.rotation.forkSourceName(mealId);
    if (!sourceName) {
      const name = (this.rotation.getMeal(mealId)?.name ?? '').trim();
      if (name === '' || /^meal\s*\d+$/i.test(name)) {
        this.notification.show(
          'Give your meal a real name (not "Meal 2") before saving it to your Binder.',
          'warning',
        );
        return;
      }
      void this.rotation.pinMeal(mealId);
      return;
    }
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        title: 'Save changes',
        message: `Save these changes to your Binder meal "${sourceName}"?`,
        confirmLabel: 'Update binder meal',
        onConfirm: () => void this.rotation.saveForkBackToBinder(mealId),
      },
    });
  }

  /** ✕ on a food row — remove that item from its meal. */
  onRemoveItem(e: { mealId: number; item: MealItem }): void {
    if (e.item.id == null) return;
    void this.rotation.deleteMealItem(e.mealId, e.item.id);
  }

  /** ✎ on a food row — open the serving popup for that item (via the panel). */
  onEditItem(e: { mealId: number; item: MealItem }): void {
    this.editItem.emit(e);
  }
}
