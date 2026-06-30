// src/app/components/menus-panel/menu-canvas.ts
//
// The canvas for the selected Menu: a responsive auto-fit grid of meal-slot
// cards (targets 2-up at laptop width). Resolves each slot's meal items from
// RotationService and passes them down to the slot cards.
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Menu, MealItem } from '../../models';
import { RotationService } from '../../services/rotation.service';
import { MealSlotCardComponent } from './meal-slot-card';

@Component({
  selector: 'app-menu-canvas',
  imports: [MealSlotCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (menu(); as m) {
      <div class="canvas-grid">
        @for (slot of m.slots; track slot.slotOrder) {
          <app-meal-slot-card [slot]="slot" [items]="itemsFor(slot.mealId)" />
        }
      </div>
    }
  `,
  styleUrls: ['./menu-canvas.scss'],
})
export class MenuCanvasComponent {
  private rotation = inject(RotationService);

  readonly menu = input.required<Menu | undefined>();

  itemsFor(mealId: number | null | undefined): MealItem[] {
    return this.rotation.slotItems(mealId);
  }
}
