// src/app/components/menu-card-row/menu-card-row.ts
//
// Horizontal row of menu cards for the active rotation. Each card shows the
// menu name and its planned day count; the selected card gets a blue border.
// A badge tallies planned days against the rotation span, and a disabled
// "+ Add menu" stub marks the Phase-1 affordance.
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
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
      <!-- Left nav — appears ONLY once scrolled off the start. Tall bar. -->
      @if (!atStart()) {
        <button
          type="button"
          class="strip-nav strip-nav-left"
          matTooltip="Scroll menus left"
          matTooltipPosition="above"
          (click)="scrollByCards(-1)">
          <mat-icon>chevron_left</mat-icon>
        </button>
      }
      <div class="cards" #scroller (scroll)="updateScrollState()">
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
                [matTooltip]="menu.pinned ? 'Save name' : 'Save to notebook'"
                matTooltipPosition="above"
                (mousedown)="$event.preventDefault()"
                (click)="$event.stopPropagation(); onSaveCheck(menu, i)">
                <mat-icon>check</mat-icon>
              </button>
              <!-- Trash — outline glyph. Deletes/clears this menu and its meal
                   slots (parent confirms Delete-from-Notebook vs Clear). -->
              <button
                type="button"
                class="menu-clear"
                matTooltip="Delete or clear Menu, and mealslots"
                matTooltipPosition="above"
                (click)="$event.stopPropagation(); deleteMenu.emit(menu.menuId)">
                <mat-icon>delete_outline</mat-icon>
              </button>
            </div>
          </div>
        }

        <!-- "+ Add menu" only while under the Menu-days cap (User Settings). At the
             cap it disappears — no more days can be added until the cap is raised. -->
        @if (menus().length < spanDays()) {
          <div
            class="add-menu-link"
            [class.bloom]="menuTargetHot()"
            cdkDropList
            [cdkDropListEnterPredicate]="menuDropPredicate"
            (cdkDropListDropped)="onMenuDrop($event)">
            @if (menuTargetHot()) {
              <span class="dnd-text">Drag &amp; drop<br />a menu here</span>
            } @else {
              <span class="add-menu-text">
                <span class="add-menu-main">+ Add menu</span>
                <span class="add-menu-sub">(<button type="button" class="am-link" (click)="addMenu.emit()">click here</button> or drag a saved <button type="button" class="am-link" (click)="rotation.openBinderTab('menus')">Menu</button>)</span>
              </span>
            }
          </div>
        }
      </div>
      <!-- Right nav — appears while more cards sit past the right edge. Tall bar. -->
      @if (!atEnd()) {
        <button
          type="button"
          class="strip-nav strip-nav-right"
          matTooltip="Scroll menus right"
          matTooltipPosition="above"
          (click)="scrollByCards(1)">
          <mat-icon>chevron_right</mat-icon>
        </button>
      }
    </div>
    <!-- Embossed area watermark, pinned DEAD CENTER of the strip (fixed — it never
         reflows with the cards; tiles simply overlay it as a one-time training cue).
         Same lowercase Fredoka face as the macro labels. -->
    <span class="area-watermark">menus</span>
  `,
  styleUrls: ['./menu-card-row.scss'],
  host: { '(window:resize)': 'updateScrollState()' },
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

  /** Menu ids the user has RENAMED this session — the green save lights for these
   *  (until they're saved to the Binder). A drag-in / duplicate does NOT set this,
   *  so a freshly dragged menu never falsely offers a save (which had created a
   *  duplicate Binder menu). */
  private readonly renamedMenus = signal<Set<number>>(new Set());

  private markRenamed(menuId: number): void {
    this.renamedMenus.update((s) => (s.has(menuId) ? s : new Set(s).add(menuId)));
  }

  /** Menu tiles whose macro-chip dropdown is COLLAPSED (keyed by menuId). The
   *  reveal defaults OPEN — so meal + menu cards line up the same on load — hence
   *  we track the collapsed exceptions. The Protein + Fiber summary discs stay
   *  visible either way. */
  private readonly collapsedMenus = signal<Set<number>>(new Set());

  // ----- Horizontal scroll navigation (tall < / > bars) --------------------
  /** The scrolling cards container. */
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  /** True when the strip is scrolled to the far left (hide the left arrow). */
  readonly atStart = signal(true);
  /** True when the strip is scrolled to the far right / fits (hide the right arrow). */
  readonly atEnd = signal(true);

  /** Recompute which nav arrows are needed from the scroller's geometry. */
  updateScrollState(): void {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    this.atStart.set(el.scrollLeft <= 1);
    this.atEnd.set(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }

  private scrollAnim: number | null = null;

  /** Scroll by ~one viewport (min one card) in the given direction (-1 left, +1
   *  right) with a custom eased animation — slower + smoother than the browser's
   *  native smooth-scroll (which reads choppy on the wide cards). */
  scrollByCards(dir: number): void {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.8, 264); // ~one card width floor
    const start = el.scrollLeft;
    const max = el.scrollWidth - el.clientWidth;
    const target = Math.max(0, Math.min(max, start + dir * step));
    const dist = target - start;
    if (dist === 0) return;
    if (this.scrollAnim != null) cancelAnimationFrame(this.scrollAnim);
    const duration = 550; // ms — deliberately slow + smooth
    const t0 = performance.now();
    const easeInOutQuad = (p: number): number =>
      p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const tick = (now: number): void => {
      const p = Math.min(1, (now - t0) / duration);
      el.scrollLeft = start + dist * easeInOutQuad(p);
      this.updateScrollState();
      this.scrollAnim = p < 1 ? requestAnimationFrame(tick) : null;
    };
    this.scrollAnim = requestAnimationFrame(tick);
  }

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
  /** The Day number of a menu named "Day N", else null. Drives NUMERIC ordering so
   *  Day 1, Day 2, … Day 10 sort correctly (a plain string sort gives Day 1, 10, 2). */
  private dayNumber(m: RotationMenuEntry): number | null {
    const match = /^day\s+(\d+)$/i.exec((m.menuName?.trim() ?? '').replace(/(\s*\(copy\))+\s*$/i, '').trim());
    return match ? Number(match[1]) : null;
  }

  readonly sortedMenus = computed<RotationMenuEntry[]>(() =>
    [...this.menus()].sort((a, b) => {
      // Day-named menus lead, ordered NUMERICALLY (Day 1 … Day N).
      const da = this.dayNumber(a);
      const db = this.dayNumber(b);
      if (da != null && db != null) return da - db;
      if (da != null) return -1;
      if (db != null) return 1;
      // Then the rest: still-unnamed ("Menu N") first, custom names alphabetical.
      const ua = this.isUnnamedMenu(a);
      const ub = this.isUnnamedMenu(b);
      if (ua !== ub) return ua ? -1 : 1;
      if (ua && ub) return 0;
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

    // Nav-arrow visibility: measure once mounted, then re-measure after the card
    // list changes (a card added/removed shifts the overflow). rAF lets layout
    // settle before we read scrollWidth/clientWidth.
    afterNextRender(() => this.updateScrollState());
    effect(() => {
      this.sortedMenus(); // re-run when the card set changes
      requestAnimationFrame(() => this.updateScrollState());
    });
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

  /** The green save-check is ONLY for a NAME change now. Meal adds/removes autosave
   *  on their own (write-through back to the notebook), so composition never lights
   *  the check. It shows while a real, changed name sits in the box, or for a menu
   *  the user renamed this session that isn't pinned to the notebook yet. */
  showSaveCheck(menu: RotationMenuEntry, index: number): boolean {
    const shown = this.displayName(menu, index);
    // While editing: a real, CHANGED name in the box lights the check immediately.
    if (this.editingMenuId() === menu.menuId) {
      const draft = this.nameDraft().trim();
      if (draft !== '' && draft !== shown && !/^menu\s+\d+$/i.test(draft)) return true;
    }
    // A menu the user RENAMED this session (and hasn't saved to the notebook yet).
    return this.renamedMenus().has(menu.menuId) && !menu.pinned;
  }

  /** Green check pressed. Fires on mousedown-preventDefault (the name box keeps
   *  focus), so it commits the work itself: persist a pending name change, and pin
   *  a not-yet-saved menu to the notebook. (Composition already autosaves.) */
  onSaveCheck(menu: RotationMenuEntry, index: number): void {
    const draft = this.nameDraft().trim();
    if (draft !== '' && draft !== this.displayName(menu, index)) {
      this.renameMenu.emit({ menuId: menu.menuId, name: draft });
      this.markRenamed(menu.menuId);
      this.flashSaveHint(menu.menuId);
    }
    // A not-yet-saved menu gets pinned to the notebook; a pinned menu's rename
    // already persisted above.
    if (!menu.pinned) this.pinMenu.emit(menu.menuId);
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
    this.markRenamed(menu.menuId); // keeps the save check lit until saved to Binder
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
    if (base && !/^menu\s+\d+$/i.test(base)) {
      // Show just the real name — NEVER the server's "(copy)" suffix. Placing a
      // named menu forks it to "<name> (copy)" server-side; the user shouldn't see
      // that noise (the amber badge marks a copy, not the name).
      return base;
    }
    // Default menus show "Day 1" / "Day 2" … by position (the server's "Menu N"
    // seed is treated as unnamed; the box shows the friendly Day label instead).
    return `Day ${index + 1}`;
  }

  /** Display label by position: 0→A, 1→B, … Menus are lettered (Menu A/B/C);
   *  meal slots within a menu are numbered (Meal 1/2/3). */
  letter(i: number): string {
    return String.fromCharCode(65 + i);
  }
}
