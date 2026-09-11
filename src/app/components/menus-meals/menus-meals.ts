// src/app/components/menus-meals/menus-meals.ts
//
// The meals grid for the selected Menu: a responsive auto-fit grid of meal
// cards. Each slot is now a MULTI-MEAL card (0–4 stacked meals) — app-meal reads
// slot.meals[] and pulls each meal's items straight from RotationService.
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Menu, MealItem, MenuSlot } from '../../models';
import { RotationService, TEACH_SAVE_LINE } from '../../services/rotation.service';
import { TabService } from '../../services/tab.service';
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
            (buildAMeal)="onBuildAMeal(slot)"
            (placeMeal)="onPlace($event)"
            (removeMeal)="onRemoveMeal($event)"
            (deleteMeal)="onDelete($event)"
            (toggleAdd)="onToggleAdd(slot, $event)"
            (renameMeal)="rotation.updateMealName($event.mealId, $event.name)"
            (pinMeal)="onPinMeal($event)"
            (editItem)="onEditItem($event)"
            (removeItem)="onRemoveItem($event)"
            (slotDragEnded)="onSlotDragEnded($event)"
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
  private tabService = inject(TabService);
  private dialog = inject(MatDialog);

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

  /** "My Foods | Build-a-Meal" on an empty slot — jump to the Foods panel's
   *  Build-a-Meal, remembering THIS slot so the built meal lands here (and in the
   *  Binder). Meals are no longer created empty in the board. */
  onBuildAMeal(slot: MenuSlot): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    this.rotation.buildMealRequest.set({ slot: { menuId, slotOrder: slot.slotOrder } });
    this.tabService.openPanel('foods', 'My Foods');
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
        message: `Clear all meals from Slot ${slotOrder}?`,
        teachLine: teach ? TEACH_SAVE_LINE : undefined,
        confirmLabel: 'Clear',
        onConfirm: () => this.rotation.clearSlot(menuId, slotOrder),
      },
    });
  }

  /** A slot photo was dragged and released. Route geometrically by what's under
   *  the release point (the slot-meal drag is rejected by every drop-list
   *  predicate, so nothing else consumes it):
   *    • "+ Add menu" tile   → move it into a brand-new menu
   *    • an EMPTY slot        → move it there (source slot clears)
   *    • the same/occupied slot → no-op
   *    • the Binder rail / a dialog → no-op (guard against accidental clears)
   *    • anything else (macro bar / dead board space) → CLEAR the source slot
   *  Clear keeps the Binder copy — same as the back-face clear key. */
  onSlotDragEnded(e: { slotOrder: number; mealId: number; point: { x: number; y: number } }): void {
    const menuId = this.menu()?.id;
    if (menuId == null) return;
    const el = document.elementFromPoint(e.point.x, e.point.y) as HTMLElement | null;

    // Dropped on ANOTHER menu tile in the strip → move the meal into that menu
    // (its first empty slot). Dropping on the source menu's own tile is a no-op.
    const menuCard = el?.closest('.menu-card') as HTMLElement | null;
    if (menuCard) {
      const targetMenuId = Number(menuCard.getAttribute('data-menu-id'));
      if (Number.isNaN(targetMenuId) || targetMenuId === menuId) return;
      void this.rotation.moveMealToMenu(menuId, e.slotOrder, e.mealId, targetMenuId);
      return;
    }
    // The "+ Add menu" tile OR elsewhere in the menu strip → start a new menu with
    // this meal. (The strip is a small target, so accept the whole row, not just
    // the dashed tile.)
    if (el?.closest('.add-menu-link') || el?.closest('app-menu-card-row')) {
      void this.rotation.moveMealToNewMenu(menuId, e.slotOrder, e.mealId);
      return;
    }

    const slotEl = el?.closest('.slot-card') as HTMLElement | null;
    if (slotEl) {
      const targetOrder = Number(slotEl.getAttribute('data-slot-order'));
      const targetEmpty = slotEl.getAttribute('data-slot-empty') === 'true';
      // Same slot, an occupied slot, or an unreadable target → no-op.
      if (Number.isNaN(targetOrder) || targetOrder === e.slotOrder || !targetEmpty) return;
      void this.rotation.moveMealToEmptySlot(menuId, e.slotOrder, targetOrder, e.mealId);
      return;
    }

    // Released over the Binder or an open dialog → snap back, don't clear.
    if (el?.closest('app-meal-binder') || el?.closest('.cdk-overlay-container')) return;

    // Out of the slot area entirely → clear this slot (keep the Binder copy).
    void this.rotation.removeMealFromSlot(menuId, e.slotOrder, e.mealId);
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

  /** Save disc — the meal's FOOD changes are already saved to the slot instance
   *  (write-through). Confirm whether to ALSO push them to the Binder permanently.
   *  Confirm → saveSlottedCopy (NAME decides: overwrite the original in place, or
   *  pin as a new independent Binder meal). Cancel → leave the change on the slot
   *  instance only (the meal stays "modified"). A rename never reaches here — it
   *  auto-saves to the Binder on blur without a prompt. */
  onPinMeal(mealId: number | null | undefined): void {
    if (mealId == null) return;
    // The dialog is ONLY for food quantity/unit overrides (slot-local until the
    // user confirms pushing them to the Binder). Metadata — type / name / notes —
    // already auto-saves to the Binder, so a metadata-only save must NOT pop this
    // "save food changes?" prompt (that was the confusing part).
    if (!this.rotation.hasUnsavedFoodChanges(mealId)) return;
    this.dialog.open(WipeConfirmDialogComponent, {
      panelClass: 'wipe-dialog-panel',
      data: {
        message:
          'Changes saved to slot instance. Would you like to save food changes to notebook, permanently?',
        confirmLabel: 'Save to notebook',
        onConfirm: () => void this.rotation.saveSlottedCopy(mealId),
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
