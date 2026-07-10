// src/app/components/menu-card-row/menu-card-row.ts
//
// Horizontal row of menu cards for the active rotation. Each card shows the
// menu name and its planned day count; the selected card gets a blue border.
// A badge tallies planned days against the rotation span, and a disabled
// "+ Add menu" stub marks the Phase-1 affordance.
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { RotationMenuEntry } from '../../models';

@Component({
  selector: 'app-menu-card-row',
  imports: [DragDropModule, MatTooltipModule, MatIconModule],
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
              matTooltip="Delete this Menu"
              matTooltipPosition="above"
              (click)="$event.stopPropagation(); deleteMenu.emit(menu.menuId)">
              <mat-icon>delete_outline</mat-icon>
            </button>
            <!-- Inline rename — same field/commit pattern as the meal name box.
                 Committing writes the label only; the pin state is untouched. -->
            <div class="name-wrap">
              <input
                #nameBox
                type="text"
                class="menu-name-box"
                [class.editing]="showCommitFor(menu.menuId)"
                [value]="displayName(menu, i)"
                (focus)="onNameFocus(menu.menuId, nameBox.value)"
                (input)="nameDraft.set(nameBox.value)"
                (keydown.enter)="nameBox.blur()"
                (keydown.escape)="nameBox.value = displayName(menu, i); nameBox.blur()"
                (blur)="onNameBlur(menu, i, nameBox.value)"
                aria-label="Menu name" />
              @if (showCommitFor(menu.menuId)) {
                <button
                  type="button"
                  class="name-commit"
                  matTooltip="Save name"
                  matTooltipPosition="above"
                  (mousedown)="$event.preventDefault()"
                  (click)="$event.stopPropagation(); nameBox.blur()">
                  <mat-icon>keyboard_return</mat-icon>
                </button>
              }
            </div>
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
            <!-- Grey etched positional watermark (like "Meal N" on meal cards). -->
            <div class="menu-watermark">Menu {{ letter(i) }}</div>
          </div>
        }

        <div
          class="add-menu-link"
          [class.bloom]="menuTargetHot()"
          cdkDropList
          [cdkDropListEnterPredicate]="menuDropPredicate"
          (cdkDropListDropped)="onMenuDrop($event)"
          (click)="addMenu.emit()">+ Add menu</div>
      </div>
    </div>
  `,
  styleUrls: ['./menu-card-row.scss'],
})
export class MenuCardRowComponent {
  readonly menus = input.required<RotationMenuEntry[]>();
  readonly selectedMenuId = input.required<number>();
  readonly spanDays = input.required<number>();
  /** True when a Binder menu is selected or being dragged — the +Add menu tile
   *  blooms to advertise it as the drop target. */
  readonly menuTargetHot = input<boolean>(false);

  readonly select = output<number>();
  /** A Binder menu was dropped on +Add menu (emits its menuId to add it). */
  readonly dropMenu = output<number>();
  /** Trash on a menu tile (emits the menuId). */
  readonly deleteMenu = output<number>();
  /** Menu-tile pin icon clicked (emits the menuId) — pin the menu to the Binder. */
  readonly pinMenu = output<number>();
  /** Inline name box committed — parent persists the new menu name. */
  readonly renameMenu = output<{ menuId: number; name: string }>();
  /** "+ Add menu" clicked. */
  readonly addMenu = output<void>();
  /** Change a menu's planned days (plannedCount). */
  readonly setDays = output<{ menuId: number; plannedCount: number }>();

  /** Which tile's name box currently has focus (drives its green commit arrow). */
  private readonly editingMenuId = signal<number | null>(null);
  /** Live text in the focused name box. */
  readonly nameDraft = signal('');

  /** Tile pin icon — emit pin unless the entry is already pinned. */
  onPin(menu: RotationMenuEntry): void {
    if (menu.pinned) return;
    this.pinMenu.emit(menu.menuId);
  }

  /** +Add menu accepts ONLY menu drags (a Menu carries `slots`; a Meal doesn't). */
  readonly menuDropPredicate = (drag: CdkDrag): boolean => {
    const d = drag.data as unknown;
    return !!d && typeof d === 'object' && 'slots' in d;
  };

  /** A Binder menu dropped on +Add menu → add it to the rotation. */
  onMenuDrop(event: CdkDragDrop<unknown>): void {
    const menu = event.item.data as { id?: number } | undefined;
    if (menu?.id != null) this.dropMenu.emit(menu.id);
  }

  /** Show the green commit arrow for the focused tile once it has text. */
  showCommitFor(menuId: number): boolean {
    return this.editingMenuId() === menuId && this.nameDraft().trim() !== '';
  }

  onNameFocus(menuId: number, current: string): void {
    this.editingMenuId.set(menuId);
    this.nameDraft.set(current);
  }

  onNameBlur(menu: RotationMenuEntry, index: number, value: string): void {
    this.editingMenuId.set(null);
    const name = value.trim();
    // No-op on empty or unchanged (the fallback "Menu A" is not a real name).
    if (!name || name === this.displayName(menu, index)) return;
    this.renameMenu.emit({ menuId: menu.menuId, name });
  }

  /** Tile label: a real custom name if set, else the positional "Menu A/B/C".
   *  Server defaults are numeric ("Menu 4"), which we treat as unnamed and show
   *  the LETTER instead — menus are lettered so they never look like numbered
   *  meals. */
  displayName(menu: RotationMenuEntry, index: number): string {
    const name = menu.menuName?.trim();
    if (name && !/^menu\s+\d+$/i.test(name)) return name;
    return `Menu ${this.letter(index)}`;
  }

  /** Display label by position: 0→A, 1→B, … Menus are lettered (Menu A/B/C);
   *  meal slots within a menu are numbered (Meal 1/2/3). */
  letter(i: number): string {
    return String.fromCharCode(65 + i);
  }
}
