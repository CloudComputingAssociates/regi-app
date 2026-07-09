// src/app/components/menu-card-row/menu-card-row.ts
//
// Horizontal row of menu cards for the active rotation. Each card shows the
// menu name and its planned day count; the selected card gets a blue border.
// A badge tallies planned days against the rotation span, and a disabled
// "+ Add menu" stub marks the Phase-1 affordance.
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { RotationMenuEntry } from '../../models';

@Component({
  selector: 'app-menu-card-row',
  imports: [MatTooltipModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="strip">
      <div class="cards">
        @for (menu of menus(); track menu.menuId; let i = $index) {
          <div
            class="menu-card"
            [class.selected]="menu.menuId === selectedMenuId()"
            (click)="select.emit(menu.menuId)">
            <button
              type="button"
              class="menu-pin icon-disc"
              [class.icon-disc-pinned]="menu.pinned"
              [matTooltip]="menu.pinned ? 'In your Binder' : 'Save to your Binder'"
              matTooltipPosition="above"
              (click)="$event.stopPropagation(); onPin(menu)">
              <mat-icon>description</mat-icon>
            </button>
            <button
              type="button"
              class="menu-delete icon-disc icon-disc-danger"
              matTooltip="Clear this menu."
              matTooltipPosition="above"
              (click)="$event.stopPropagation(); deleteMenu.emit(menu.menuId)">
              <mat-icon>delete_outline</mat-icon>
            </button>
            <span class="menu-name">Menu {{ letter(i) }}</span>
            <div class="menu-days">
              <button
                type="button"
                class="days-step"
                matTooltip="Fewer days"
                [disabled]="menu.plannedCount <= 1"
                (click)="$event.stopPropagation(); setDays.emit({ menuId: menu.menuId, plannedCount: menu.plannedCount - 1 })">
                −
              </button>
              <span class="days-value">{{ menu.plannedCount }} days</span>
              <button
                type="button"
                class="days-step"
                matTooltip="More days"
                [disabled]="menu.plannedCount >= spanDays()"
                (click)="$event.stopPropagation(); setDays.emit({ menuId: menu.menuId, plannedCount: menu.plannedCount + 1 })">
                +
              </button>
            </div>
          </div>
        }

        <button type="button" class="add-menu-link" (click)="addMenu.emit()">+ Add menu</button>
      </div>
    </div>
  `,
  styleUrls: ['./menu-card-row.scss'],
})
export class MenuCardRowComponent {
  readonly menus = input.required<RotationMenuEntry[]>();
  readonly selectedMenuId = input.required<number>();
  readonly spanDays = input.required<number>();

  readonly select = output<number>();
  /** Trash on a menu tile (emits the menuId). */
  readonly deleteMenu = output<number>();
  /** Menu-tile pin icon clicked (emits the menuId) — pin the menu to the Binder. */
  readonly pinMenu = output<number>();
  /** "+ Add menu" clicked. */
  readonly addMenu = output<void>();
  /** Change a menu's planned days (plannedCount). */
  readonly setDays = output<{ menuId: number; plannedCount: number }>();

  /** Tile pin icon — emit pin unless the entry is already pinned. */
  onPin(menu: RotationMenuEntry): void {
    if (menu.pinned) return;
    this.pinMenu.emit(menu.menuId);
  }

  /** Display label by position: 0→A, 1→B, … Menus are lettered (Menu A/B/C);
   *  meal slots within a menu are numbered (Meal 1/2/3). */
  letter(i: number): string {
    return String.fromCharCode(65 + i);
  }
}
