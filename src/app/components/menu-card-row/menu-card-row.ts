// src/app/components/menu-card-row/menu-card-row.ts
//
// Horizontal row of menu cards for the active rotation. Each card shows the
// menu name and its planned day count; the selected card gets a blue border.
// A badge tallies planned days against the rotation span, and a disabled
// "+ Add menu" stub marks the Phase-1 affordance.
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
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
        @for (menu of sortedMenus(); track menu.menuId; let i = $index) {
          <div
            class="menu-card"
            [class.selected]="menu.menuId === selectedMenuId()"
            [attr.data-menu-id]="menu.menuId"
            (click)="menuSelect.emit(menu.menuId)">
            <!-- Single centered row: "Menu" label · white name box · square Clear
                 key · permanent save check (green only when the name is real). No
                 calories / macro chips / dropdown — this is a slim name+save row. -->
            <div class="card-top">
              <span class="menu-label">Menu</span>
              <!-- Inline rename — edits in place; saves on blur or Enter. -->
              <input
                #nameBox
                type="text"
                class="menu-name-box"
                [value]="displayName(menu, i)"
                (focus)="onNameFocus(menu.menuId, nameBox)"
                (input)="nameDraft.set(nameBox.value)"
                (keydown.enter)="nameBox.blur()"
                (keydown.escape)="nameBox.value = displayName(menu, i); nameBox.blur()"
                (blur)="onNameBlur(menu, i, nameBox)"
                aria-label="Menu name" />
              <!-- Permanent save check: GREEN + clickable only when the box holds a
                   REAL name (Binder saves happen for named menus only); grey + inert
                   for the "Menu N" seed, so an errant char that's backspaced away
                   never saves. -->
              <button
                type="button"
                class="menu-save"
                [class.active]="showSaveCheck(menu, i)"
                [class.save-hint]="isSaveHintMenu(menu.menuId) && !menu.pinned && showSaveCheck(menu, i)"
                [disabled]="!showSaveCheck(menu, i)"
                [matTooltip]="menu.pinned ? 'Save name' : 'Save to Binder'"
                matTooltipPosition="above"
                (mousedown)="$event.preventDefault()"
                (click)="$event.stopPropagation(); onSaveCheck(menu, i)">
                <mat-icon>check</mat-icon>
              </button>
              <!-- Square Clear key — removes this menu from the plan. -->
              <button
                type="button"
                class="menu-clear"
                matTooltip="Clear this Menu"
                matTooltipPosition="above"
                (click)="$event.stopPropagation(); deleteMenu.emit(menu.menuId)">
                <mat-icon>clear_all</mat-icon>
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
          (click)="addMenu.emit()">{{ menuTargetHot() ? 'Drag & Drop Menu' : '+ Add menu' }}</div>
      </div>
    </div>
    <!-- Embossed area watermark, pinned DEAD CENTER of the strip (fixed — it never
         reflows with the cards; tiles simply overlay it as a one-time training cue).
         Same lowercase Fredoka face as the macro labels. -->
    <span class="area-watermark">menus</span>
    <!-- Planned-days tally — right-justified in the strip, bottom-aligned with the
         "menus" watermark (moved here from the toolbar). -->
    <div
      class="span-badge"
      [class.complete]="plannedDays() === spanDays()"
      matTooltip="You set the # of menus, in User Settings by Menu-Days"
      matTooltipPosition="above">
      <span class="check">✓</span>{{ plannedDays() }}/{{ spanDays() }} menus
    </div>
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

  /** Total planned menu-days — a menu counts ONLY once it holds at least one
   *  meal (an empty menu isn't a planned menu-day yet). Drives the tally badge. */
  readonly plannedDays = computed<number>(() =>
    this.menus().reduce(
      (sum, m) => sum + (this.rotation.menuHasMeals(m.menuId) ? (m.plannedCount ?? 0) : 0),
      0,
    ),
  );

  /** Unnamed = still on the server default ("Menu N") or blank — no real custom
   *  name yet. Drives sort-to-front so the user sees which menus still need naming. */
  private isUnnamedMenu(m: RotationMenuEntry): boolean {
    const base = (m.menuName?.trim() ?? '').replace(/(\s*\(copy\))+\s*$/i, '').trim();
    return !base || /^menu\s+\d+$/i.test(base);
  }

  /** Display order: UNNAMED (default) menus FIRST — kept in their existing order so
   *  they letter cleanly as Menu A / B / C — so it's obvious they need a name; then
   *  the named menus, alphabetically. Purely cosmetic (letters are display-only);
   *  selection / drag use menuId, so reordering is safe. */
  readonly sortedMenus = computed<RotationMenuEntry[]>(() =>
    [...this.menus()].sort((a, b) => {
      const ua = this.isUnnamedMenu(a);
      const ub = this.isUnnamedMenu(b);
      if (ua !== ub) return ua ? -1 : 1; // unnamed first
      if (ua && ub) return 0; // stable — keep add order among the unnamed
      return (a.menuName ?? '').localeCompare(b.menuName ?? '', undefined, { sensitivity: 'base' });
    }),
  );

  /** Baseline menu ids, seeded on the first non-empty load. Null until seeded so
   *  the initial set keeps the default-open state; menus added AFTER start
   *  collapsed (name only). */
  private knownMenuIds: Set<number> | null = null;

  constructor() {
    // A menu added after the initial load appears COLLAPSED. The first non-empty
    // menu set is the baseline (stays open); only later-added ids get collapsed.
    effect(
      () => {
        const ids = this.menus().map((m) => m.menuId);
        if (this.knownMenuIds === null) {
          if (ids.length > 0) this.knownMenuIds = new Set(ids);
          return;
        }
        const fresh = ids.filter((id) => !this.knownMenuIds!.has(id));
        this.knownMenuIds = new Set(ids);
        if (fresh.length) {
          this.collapsedMenus.update((s) => {
            const next = new Set(s);
            for (const id of fresh) next.add(id);
            return next;
          });
        }
      },
      { allowSignalWrites: true },
    );
  }

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

  /** The green save-check is ONLY for saving a menu to the Binder as a "Named
   *  Menu" — so it appears solely once the user has given the menu a REAL custom
   *  name (not the positional default "Menu A" / a bare "Menu N"). Slot/meal edits
   *  autosave on their own (write-through), so a default-named menu needs no check.
   *  Shows when that named menu isn't yet saved (unpinned), or when a saved menu's
   *  name was just changed in the box. */
  showSaveCheck(menu: RotationMenuEntry, index: number): boolean {
    const editing = this.editingMenuId() === menu.menuId;
    const draft = this.nameDraft().trim();
    const defaultName = `Menu ${this.letter(index)}`; // box seed is the full "Menu A"
    // The name the user has given: the live draft while editing, else the shown name.
    const typed = editing && draft !== '' ? draft : this.displayName(menu, index);
    const hasCustomName = typed !== defaultName && !/^menu\s+\d+$/i.test(typed);
    if (!hasCustomName) return false;
    if (!menu.pinned) return true; // named, not yet saved to the Binder
    // Saved menu whose name was just changed → offer the check to re-save.
    return editing && draft !== '' && draft !== this.displayName(menu, index);
  }

  /** Green check pressed. It fires on mousedown-preventDefault (the name box keeps
   *  focus, so no blur), so it commits the work itself: persist a pending name
   *  change, and for an unsaved menu also save it to the Binder. */
  onSaveCheck(menu: RotationMenuEntry, index: number): void {
    const draft = this.nameDraft().trim();
    if (draft !== '' && draft !== this.displayName(menu, index)) {
      this.renameMenu.emit({ menuId: menu.menuId, name: draft });
      this.flashSaveHint(menu.menuId);
    }
    if (!menu.pinned) this.onPin(menu);
    this.editingMenuId.set(null);
  }

  onNameFocus(menuId: number, el: HTMLInputElement): void {
    this.editingMenuId.set(menuId);
    this.nameDraft.set(el.value);
    // Highlight the whole title on the focusing click so typing replaces it.
    // Deferred past the click's cursor-placement; a second click (already
    // focused, no refocus) drops the cursor normally to edit in place.
    setTimeout(() => el.select());
  }

  onNameBlur(menu: RotationMenuEntry, index: number, el: HTMLInputElement): void {
    this.editingMenuId.set(null);
    const name = el.value.trim();
    // A menu is ALWAYS named: if the box was cleared, restore the default name in
    // it (never leave it blank). Nothing persists, so the save arrow stays grey.
    if (!name) {
      el.value = this.displayName(menu, index);
      return;
    }
    if (name === this.displayName(menu, index)) return; // unchanged default → no-op
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
    // Default menus show the FULL "Menu A" / "Menu B" in the box (redundant with the
    // "Menu" label, but per request the box holds the whole default name).
    return `Menu ${this.letter(index)}`;
  }

  /** Display label by position: 0→A, 1→B, … Menus are lettered (Menu A/B/C);
   *  meal slots within a menu are numbered (Meal 1/2/3). */
  letter(i: number): string {
    return String.fromCharCode(65 + i);
  }
}
