// src/app/components/menu-card-row/menu-card-row.ts
//
// Horizontal row of menu cards for the active rotation. Each card shows the
// menu name and its planned day count; the selected card gets a blue border.
// A badge tallies planned days against the rotation span, and a disabled
// "+ Add menu" stub marks the Phase-1 affordance.
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { RotationMenuEntry } from '../../models';
import { RotationService } from '../../services/rotation.service';

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
            (click)="menuSelect.emit(menu.menuId)">
            <!-- Top strip: the rename box leads; a bare green check sits just to
                 its RIGHT (save to Binder), delete pins to the upper-right. -->
            <div class="card-top">
              <!-- Inline rename — edits in place; saves on blur or Enter. -->
              <div class="name-wrap">
                <input
                  #nameBox
                  type="text"
                  class="menu-name-box regi-field"
                  [value]="displayName(menu, i)"
                  (focus)="onNameFocus(menu.menuId, nameBox)"
                  (input)="nameDraft.set(nameBox.value)"
                  (keydown.enter)="nameBox.blur()"
                  (keydown.escape)="nameBox.value = displayName(menu, i); nameBox.blur()"
                  (blur)="onNameBlur(menu, i, nameBox.value)"
                  aria-label="Menu name" />
                <!-- Save = bare green check (no disc). Present ONLY when there's
                     something to save: (1) a pending name change, or (2) an
                     unsaved menu still being built. A saved menu absorbs slot
                     changes automatically, so no check is shown for it. -->
                @if (showSaveCheck(menu, i)) {
                  <button
                    type="button"
                    class="icon-disc icon-disc-confirm"
                    [class.save-hint]="isSaveHintMenu(menu.menuId) && !menu.pinned"
                    matTooltip="Save to Binder"
                    matTooltipPosition="above"
                    (mousedown)="$event.preventDefault()"
                    (click)="$event.stopPropagation(); onPin(menu)">
                    <mat-icon>check</mat-icon>
                  </button>
                }
              </div>
              <button
                type="button"
                class="menu-delete icon-disc icon-disc-danger"
                matTooltip="Delete this Menu"
                matTooltipPosition="above"
                (click)="$event.stopPropagation(); deleteMenu.emit(menu.menuId)">
                <mat-icon>delete_outline</mat-icon>
              </button>
            </div>
            <!-- Macro line (ONE row): orig/copy tag leads (swapped with the
                 chevron); then Protein, Carbs, Fat, Fiber (order P C Fat Fiber),
                 cals trailing, and the dropdown chevron back on the far RIGHT. -->
            <div class="menu-foot">
              @if (isOpen(menu.menuId)) {
                <!-- orig/copy tag on the LEFT (server names a copy "<name> (copy)").
                     Origin reads quiet blue; copy reads grey. -->
                @if (copyRoleFor(menu); as role) {
                  <span class="copy-badge" [class.is-copy]="role === 'copy'">{{ role }}</span>
                }
              }
              <span class="chip protein">P {{ round(rotation.menuTotals(menu.menuId).proteinG) }}</span>
              @if (isOpen(menu.menuId)) {
                <span class="chip carb">C {{ round(rotation.menuTotals(menu.menuId).carbG) }}</span>
                <span class="chip fat">F {{ round(rotation.menuTotals(menu.menuId).fatG) }}</span>
              }
              <span class="chip fiber">F {{ round(rotation.menuTotals(menu.menuId).fiberG) }}</span>
              @if (isOpen(menu.menuId)) {
                <span class="menu-cals">{{ round(rotation.menuTotals(menu.menuId).calories) }} cals</span>
              }
              <button
                type="button"
                class="card-toggle"
                [matTooltip]="isOpen(menu.menuId) ? 'Hide extra macros' : 'Show Calories, Carbs & Fats'"
                matTooltipPosition="above"
                (click)="$event.stopPropagation(); toggleMacros(menu.menuId)">
                <mat-icon>{{ isOpen(menu.menuId) ? 'expand_less' : 'expand_more' }}</mat-icon>
              </button>
            </div>
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
    <!-- Embossed area watermark, pinned DEAD CENTER of the strip (fixed — it never
         reflows with the cards; tiles simply overlay it as a one-time training cue).
         Same lowercase Fredoka face as the macro labels. -->
    <span class="area-watermark">menus</span>
  `,
  styleUrls: ['./menu-card-row.scss'],
})
export class MenuCardRowComponent {
  /** Source of live per-menu macro totals for the cals readout + chip dropdown. */
  readonly rotation = inject(RotationService);

  readonly menus = input.required<RotationMenuEntry[]>();
  readonly selectedMenuId = input.required<number>();
  readonly spanDays = input.required<number>();
  /** True when a Binder menu is selected or being dragged — the +Add menu tile
   *  blooms to advertise it as the drop target. */
  readonly menuTargetHot = input<boolean>(false);

  /** A menu card was clicked — select it. NOT named `select`: that collides with
   *  the native DOM `select` event the name <input> fires, which bubbled up and
   *  called the handler with a DOM Event (→ GET /menu/[object Event], blank board). */
  readonly menuSelect = output<number>();
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
  /** Foot "Copy" clicked — duplicate this menu into a new card (emits the menuId).
   *  The parent duplicates it server-side and links the copy into the rotation. */
  readonly duplicateMenu = output<number>();

  /** Which tile's name box currently has focus (drives its green commit arrow). */
  private readonly editingMenuId = signal<number | null>(null);
  /** Live text in the focused name box. */
  readonly nameDraft = signal('');

  /** Menu tiles whose macro-chip dropdown is COLLAPSED (keyed by menuId). The
   *  reveal defaults OPEN — so meal + menu cards line up the same on load — hence
   *  we track the collapsed exceptions. The Protein + Fiber summary discs stay
   *  visible either way. */
  private readonly collapsedMenus = signal<Set<number>>(new Set());

  isOpen(menuId: number): boolean {
    return !this.collapsedMenus().has(menuId);
  }

  toggleMacros(menuId: number): void {
    this.collapsedMenus.update((s) => {
      const next = new Set(s);
      next.has(menuId) ? next.delete(menuId) : next.add(menuId);
      return next;
    });
  }

  round(n: number | null | undefined): number {
    return Math.round(n ?? 0);
  }

  /** orig/copy lineage across the strip, inferred from the server's "<name>
   *  (copy)" duplicate naming (there's no persisted source-menu link): an entry
   *  whose name ends in "(copy)" is a 'copy'; the entry sharing that base name is
   *  the 'orig'. Only meaningful when at least one copy is present — otherwise the
   *  map is empty and no badge shows. Survives reloads via the persisted name. */
  private readonly copyRoles = computed<Map<number, 'orig' | 'copy'>>(() => {
    const roles = new Map<number, 'orig' | 'copy'>();
    const list = this.menus();
    const isCopyName = (n: string) => /\(copy\)\s*$/i.test(n);
    const baseOf = (n: string) => n.replace(/\s*\(copy\)\s*$/i, '').trim();
    const baseNames = new Set(
      list.filter((m) => isCopyName(m.menuName ?? '')).map((m) => baseOf(m.menuName ?? '')),
    );
    if (baseNames.size === 0) return roles;
    for (const m of list) {
      const name = (m.menuName ?? '').trim();
      if (isCopyName(name)) roles.set(m.menuId, 'copy');
      else if (baseNames.has(name)) roles.set(m.menuId, 'orig');
    }
    return roles;
  });

  copyRoleFor(menu: RotationMenuEntry): 'orig' | 'copy' | null {
    return this.copyRoles().get(menu.menuId) ?? null;
  }

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

  /** The green save-check appears on EXACTLY two conditions:
   *   1) a pending name change in the box (draft differs from the shown name), or
   *   2) an unsaved (unpinned) menu still being built.
   *  A saved (pinned) menu shows no check — its slot changes save automatically.
   *  In BOTH cases the check is withheld until every slot meal is a Binder meal
   *  (rotation.menuAllSlotsClean) — a pre-click mirror of pinMenu's all-Binder
   *  rule, so the click can't reach pinMenu just to fail on a toast. pinMenu keeps
   *  its own check as the real backstop; this only hides the button early. */
  showSaveCheck(menu: RotationMenuEntry, index: number): boolean {
    if (!this.rotation.menuAllSlotsClean(menu.menuId)) return false;
    if (!menu.pinned) return true; // (2) unsaved menu
    const draft = this.nameDraft().trim();
    return (
      this.editingMenuId() === menu.menuId &&
      draft !== '' &&
      draft !== this.displayName(menu, index)
    ); // (1) pending rename on a saved menu
  }

  onNameFocus(menuId: number, el: HTMLInputElement): void {
    this.editingMenuId.set(menuId);
    this.nameDraft.set(el.value);
    // Highlight the whole title on the focusing click so typing replaces it.
    // Deferred past the click's cursor-placement; a second click (already
    // focused, no refocus) drops the cursor normally to edit in place.
    setTimeout(() => el.select());
  }

  onNameBlur(menu: RotationMenuEntry, index: number, value: string): void {
    this.editingMenuId.set(null);
    const name = value.trim();
    // No-op on empty or unchanged (the fallback "Menu A" is not a real name).
    if (!name || name === this.displayName(menu, index)) return;
    this.renameMenu.emit({ menuId: menu.menuId, name });
    this.flashSaveHint(menu.menuId);
  }

  // Green "save me" pulse on the menu pin — fired ONLY on a name change (not on
  // meal-add: too much motion). Per-menu, auto-clears after 3s. Mirrors the meal
  // card's save-hint bloom.
  private readonly saveHintMenus = signal<Set<number>>(new Set());
  private hintTimers = new Map<number, ReturnType<typeof setTimeout>>();

  isSaveHintMenu(menuId: number): boolean {
    return this.saveHintMenus().has(menuId);
  }

  private flashSaveHint(menuId: number): void {
    this.saveHintMenus.update((s) => new Set(s).add(menuId));
    const existing = this.hintTimers.get(menuId);
    if (existing) clearTimeout(existing);
    this.hintTimers.set(
      menuId,
      setTimeout(() => {
        this.saveHintMenus.update((s) => {
          const next = new Set(s);
          next.delete(menuId);
          return next;
        });
        this.hintTimers.delete(menuId);
      }, 3000),
    );
  }

  /** Tile label: a real custom name if set, else the positional "Menu A/B/C".
   *  Server defaults are numeric ("Menu 4") and a duplicate appends " (copy)"
   *  ("Menu 4 (copy)"); both are treated as unnamed → show the LETTER instead, so
   *  the strip always reads Menu A, B, C, … across (the amber "copy" badge is
   *  what marks a duplicate, not the name). A real custom name still wins, with
   *  any trailing "(copy)" stripped for display. */
  displayName(menu: RotationMenuEntry, index: number): string {
    const raw = menu.menuName?.trim() ?? '';
    const base = raw.replace(/(\s*\(copy\))+\s*$/i, '').trim(); // drop copy chain
    if (base && !/^menu\s+\d+$/i.test(base)) return base;
    return `Menu ${this.letter(index)}`;
  }

  /** Display label by position: 0→A, 1→B, … Menus are lettered (Menu A/B/C);
   *  meal slots within a menu are numbered (Meal 1/2/3). */
  letter(i: number): string {
    return String.fromCharCode(65 + i);
  }
}
