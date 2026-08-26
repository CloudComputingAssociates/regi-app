// src/app/components/mealset-editor-panel/mealset-editor-panel.ts
//
// MealSet editor — a full-screen TabService overlay (mirrors the recipe editor).
// Mounted once in app.ts; self-gates on TabService.mealsetEditorOpen() AND the
// MealSetOwner role. Launched from the MealSet Studio hub's tiles (edit) or the
// "+ New MealSet" button (create). Holds the set's marketing fields + the dual-list
// meal picker (staged locally, committed on Save). Save = Save & Close; the hub
// reloads its tiles via an effect watching mealsetEditorOpen going false.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';
import { RoleService } from '../../services/role.service';
import { NotificationService } from '../../services/notification.service';
import { MealSetService } from '../../services/mealset.service';
import { ImageDropComponent } from '../image-drop/image-drop';
import {
  MealSet,
  CreateMealSetRequest,
  UpdateMealSetRequest,
  Meal,
} from '../../models';

/** Editor draft — the author-writable set fields, plus display-only price/active. */
interface SetDraft {
  mealSetId: number | null;
  name: string;
  description: string;
  genres: string[];
  pics: [string, string, string, string];
  video1: string;
  price: number;
  active: boolean;
}

@Component({
  selector: 'app-mealset-editor-panel',
  imports: [MatIconModule, MatTooltipModule, DragDropModule, ImageDropComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="mse-backdrop">
        <div class="mse-panel">
          <header class="mse-head">
            <span class="mse-title">
              <mat-icon>restaurant_menu</mat-icon>{{ draft()?.mealSetId ? 'Edit MealSet' : 'New MealSet' }}
            </span>
            <span class="mse-hint">Marketing info for the RegiMenu MealSet gallery</span>
            <button type="button" class="mse-close" matTooltip="Close" (click)="close()">
              <mat-icon>close</mat-icon>
            </button>
          </header>

          @if (draft(); as d) {
            <div class="mse-body">
              <label class="mse-field">
                <span class="mse-label">Name <em>*</em></span>
                <input class="mse-input" type="text" placeholder="e.g. Keto-friendly, high-protein"
                  [value]="d.name" (input)="setField('name', $any($event.target).value)" />
              </label>

              <label class="mse-field">
                <span class="mse-label">Description</span>
                <textarea class="mse-input mse-textarea" rows="2" [value]="d.description"
                  (input)="setField('description', $any($event.target).value)"></textarea>
              </label>

              <div class="mse-field">
                <span class="mse-label">Genres</span>
                <div class="mse-chips">
                  @for (g of d.genres; track g; let i = $index) {
                    <span class="mse-chip">{{ g }}<button type="button" class="mse-chip-x" (click)="removeGenre(i)" aria-label="Remove genre">×</button></span>
                  }
                  <input class="mse-input mse-chip-input" type="text" list="mse-genre-suggestions"
                    placeholder="Add a genre — Enter or comma" [value]="genreInput()"
                    (input)="genreInput.set($any($event.target).value)"
                    (keydown)="onGenreKeydown($event)" (blur)="addGenre(genreInput())" />
                  <datalist id="mse-genre-suggestions">
                    @for (opt of genreSuggestions(); track opt) { <option [value]="opt"></option> }
                  </datalist>
                </div>
              </div>

              <div class="mse-field">
                <span class="mse-label">Marketing promo photos (up to 4)</span>
                <div class="mse-pic-grid">
                  @for (i of [0, 1, 2, 3]; track i) {
                    <app-image-drop name="mealset" [value]="d.pics[i]" (valueChange)="setPic(i, $event)" />
                  }
                </div>
              </div>

              <label class="mse-field">
                <span class="mse-label">Video URL (optional)</span>
                <input class="mse-input" type="url" placeholder="https://…" [value]="d.video1"
                  (input)="setField('video1', $any($event.target).value)" />
              </label>

              <div class="mse-readonly-row">
                <span class="mse-readonly">Price: <strong>{{ d.price > 0 ? ('$' + d.price) : 'Free' }}</strong></span>
                <span class="mse-readonly">Status: <strong>{{ d.active ? 'Live' : 'Inactive' }}</strong></span>
                <span class="mse-readonly-note">(admin-set)</span>
              </div>

              <!-- Meal picker: two lists side by side. Drag across, or select + ▶/◀.
                   Membership is staged locally and committed on Save. -->
              <div class="mse-picker">
                <h4 class="mse-subtitle">Meals in this MealSet</h4>
                <div class="mse-transfer" cdkDropListGroup>
                  <div class="mse-transfer-col">
                    <div class="mse-transfer-head">Your meals</div>
                    <div class="mse-transfer-list" cdkDropList [cdkDropListData]="'available'"
                      (cdkDropListDropped)="onTransferDrop($event)">
                      @for (m of availableMeals(); track m.id) {
                        <div class="mse-transfer-item" [class.sel]="selectedAvailable().has(m.id)"
                          cdkDrag [cdkDragData]="m.id"
                          (click)="toggleSelect('available', m.id)"
                          (dblclick)="assign(m.id)">{{ m.name }}</div>
                      } @empty {
                        <div class="mse-transfer-empty">No meals</div>
                      }
                    </div>
                  </div>

                  <div class="mse-transfer-arrows">
                    <button type="button" class="mse-arrow" matTooltip="Add to set"
                      [disabled]="!selectedAvailable().size" (click)="assignSelected()">&#9654;</button>
                    <button type="button" class="mse-arrow" matTooltip="Remove from set"
                      [disabled]="!selectedInSet().size" (click)="unassignSelected()">&#9664;</button>
                  </div>

                  <div class="mse-transfer-col">
                    <div class="mse-transfer-head">In this MealSet</div>
                    <div class="mse-transfer-list" cdkDropList [cdkDropListData]="'assigned'"
                      (cdkDropListDropped)="onTransferDrop($event)">
                      @for (m of assignedMeals(); track m.id) {
                        <div class="mse-transfer-item" [class.sel]="selectedInSet().has(m.id)"
                          cdkDrag [cdkDragData]="m.id"
                          (click)="toggleSelect('assigned', m.id)"
                          (dblclick)="unassign(m.id)">{{ m.name }}</div>
                      } @empty {
                        <div class="mse-transfer-empty">Drag or ▶ meals here</div>
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer class="mse-foot">
              <div class="mse-foot-btns">
                <button type="button" class="mse-btn ghost" (click)="close()">Cancel</button>
                <button type="button" class="mse-btn primary" [disabled]="savingSet() || !d.name.trim()" (click)="save()">
                  {{ savingSet() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </footer>
          }
        </div>
      </div>
    }
  `,
  styleUrls: ['./mealset-editor-panel.scss'],
})
export class MealsetEditorPanelComponent {
  private tab = inject(TabService);
  private role = inject(RoleService);
  private mealSetService = inject(MealSetService);
  private notification = inject(NotificationService);

  readonly isOpen = computed(
    () => this.tab.mealsetEditorOpen() && this.role.hasRole('MealSetOwner'),
  );

  readonly draft = signal<SetDraft | null>(null);
  readonly savingSet = signal(false);

  // ---- Genres chip input ----------------------------------------------------
  readonly genreInput = signal('');
  readonly genreSuggestions = signal<string[]>([]);
  /** The genre list when the editor opened — PATCH sends genres ONLY when changed. */
  private genresBaseline: string[] = [];

  // ---- Meal picker (dual-list transfer, staged locally) ---------------------
  readonly ownMeals = signal<Meal[]>([]);
  private readonly assignedIds = signal<Set<number>>(new Set());
  private originalAssignedIds = new Set<number>();
  readonly selectedAvailable = signal<Set<number>>(new Set());
  readonly selectedInSet = signal<Set<number>>(new Set());

  readonly availableMeals = computed<Meal[]>(() =>
    this.ownMeals().filter((m) => !this.assignedIds().has(m.id)),
  );
  readonly assignedMeals = computed<Meal[]>(() =>
    this.ownMeals().filter((m) => this.assignedIds().has(m.id)),
  );

  private loadedKey: string | null = null;

  constructor() {
    // Initialize (blank or load) once per open+id — mirrors the recipe editor.
    effect(
      () => {
        const open = this.isOpen();
        const id = this.tab.mealsetEditorId();
        if (!open) { this.loadedKey = null; return; }
        const key = String(id);
        if (this.loadedKey === key) return;
        this.loadedKey = key;
        void this.loadOwnMeals();
        void this.loadGenreSuggestions();
        if (id == null) this.startCreate();
        else void this.openExisting(id);
      },
      { allowSignalWrites: true },
    );
  }

  close(): void { this.tab.closeMealsetEditor(); }

  // ---- Load / init ----------------------------------------------------------
  private startCreate(): void {
    this.resetPicker(new Set());
    this.genreInput.set('');
    this.genresBaseline = [];
    this.draft.set({
      mealSetId: null, name: '', description: '', genres: [],
      pics: ['', '', '', ''], video1: '', price: 0, active: false,
    });
  }

  private editSet(s: MealSet): void {
    this.genreInput.set('');
    this.genresBaseline = [...(s.genres ?? [])];
    this.draft.set({
      mealSetId: s.mealSetId,
      name: s.name ?? '',
      description: s.description ?? '',
      genres: [...(s.genres ?? [])],
      pics: [s.mealSetPic1 ?? '', s.mealSetPic2 ?? '', s.mealSetPic3 ?? '', s.mealSetPic4 ?? ''],
      video1: s.mealSetVideo1 ?? '',
      price: s.price ?? 0,
      active: s.active ?? false,
    });
    void this.loadAssigned(s.mealSetId);
  }

  /** Resolve the set header fields by id (no single-set GET — find in the list). */
  private async openExisting(id: number): Promise<void> {
    try {
      const sets = (await firstValueFrom(this.mealSetService.getAuthored())) ?? [];
      const s = sets.find((x) => x.mealSetId === id);
      if (!s) {
        this.notification.show('MealSet not found.', 'error');
        this.close();
        return;
      }
      this.editSet(s);
    } catch {
      this.notification.show('Could not load the MealSet.', 'error');
      this.close();
    }
  }

  private async loadOwnMeals(): Promise<void> {
    try {
      this.ownMeals.set((await firstValueFrom(this.mealSetService.getOwnMeals())) ?? []);
    } catch {
      this.ownMeals.set([]);
    }
  }

  private async loadGenreSuggestions(): Promise<void> {
    try {
      const catalog = await firstValueFrom(this.mealSetService.getCatalog());
      this.genreSuggestions.set(catalog?.genres ?? []);
    } catch {
      this.genreSuggestions.set([]);
    }
  }

  // ---- Field setters --------------------------------------------------------
  setField(field: 'name' | 'description' | 'video1', value: string): void {
    this.draft.update((d) => (d ? { ...d, [field]: value } : d));
  }

  setPic(index: number, url: string): void {
    this.draft.update((d) => {
      if (!d) return d;
      const pics = [...d.pics] as SetDraft['pics'];
      pics[index] = url;
      return { ...d, pics };
    });
  }

  // ---- Genres ---------------------------------------------------------------
  addGenre(raw: string): void {
    const v = raw.replace(/,+$/, '').trim();
    if (!v) { this.genreInput.set(''); return; }
    this.draft.update((d) => {
      if (!d) return d;
      if (d.genres.some((g) => g.toLowerCase() === v.toLowerCase())) return d;
      return { ...d, genres: [...d.genres, v] };
    });
    this.genreInput.set('');
  }

  removeGenre(idx: number): void {
    this.draft.update((d) => (d ? { ...d, genres: d.genres.filter((_, i) => i !== idx) } : d));
  }

  onGenreKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      this.addGenre(this.genreInput());
    } else if (ev.key === 'Backspace' && this.genreInput() === '') {
      this.draft.update((d) => (d && d.genres.length ? { ...d, genres: d.genres.slice(0, -1) } : d));
    }
  }

  /** Order-insensitive, case-insensitive compare (mirrors the server's normalize). */
  private sameGenres(a: string[], b: string[]): boolean {
    const norm = (x: string[]) =>
      [...new Set(x.map((s) => s.trim().toLowerCase()).filter(Boolean))].sort();
    const na = norm(a);
    const nb = norm(b);
    return na.length === nb.length && na.every((v, i) => v === nb[i]);
  }

  // ---- Meal picker ----------------------------------------------------------
  toggleSelect(list: 'available' | 'assigned', id: number): void {
    const sig = list === 'available' ? this.selectedAvailable : this.selectedInSet;
    sig.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  assign(id: number): void {
    this.assignedIds.update((s) => new Set(s).add(id));
    this.dropSelection(id);
  }

  unassign(id: number): void {
    this.assignedIds.update((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    this.dropSelection(id);
  }

  assignSelected(): void {
    this.assignedIds.update((s) => {
      const next = new Set(s);
      for (const id of this.selectedAvailable()) next.add(id);
      return next;
    });
    this.selectedAvailable.set(new Set());
  }

  unassignSelected(): void {
    this.assignedIds.update((s) => {
      const next = new Set(s);
      for (const id of this.selectedInSet()) next.delete(id);
      return next;
    });
    this.selectedInSet.set(new Set());
  }

  onTransferDrop(event: CdkDragDrop<string>): void {
    if (event.previousContainer === event.container) return;
    const id = event.item.data as number;
    if (event.container.data === 'assigned') this.assign(id);
    else this.unassign(id);
  }

  private dropSelection(id: number): void {
    this.selectedAvailable.update((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    this.selectedInSet.update((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  private resetPicker(ids: Set<number>): void {
    this.assignedIds.set(new Set(ids));
    this.originalAssignedIds = new Set(ids);
    this.selectedAvailable.set(new Set());
    this.selectedInSet.set(new Set());
  }

  private async loadAssigned(setId: number): Promise<void> {
    try {
      const meals = (await firstValueFrom(this.mealSetService.getSetMeals(setId))) ?? [];
      const ids = meals.filter((m) => m.mealSetId === setId).map((m) => m.id);
      this.resetPicker(new Set(ids));
    } catch {
      this.resetPicker(new Set());
    }
  }

  /** Commit staged membership: junction the adds, unjunction the removes. */
  private async commitMembership(setId: number): Promise<void> {
    const target = this.assignedIds();
    const adds = [...target].filter((id) => !this.originalAssignedIds.has(id));
    const removes = [...this.originalAssignedIds].filter((id) => !target.has(id));
    let order = this.originalAssignedIds.size;
    for (const id of adds) {
      await firstValueFrom(this.mealSetService.addMeal(setId, { mealId: id, sortOrder: order++ }));
    }
    for (const id of removes) {
      await firstValueFrom(this.mealSetService.removeMeal(setId, id));
    }
  }

  // ---- Save & Close ---------------------------------------------------------
  private draftToBody(): CreateMealSetRequest & UpdateMealSetRequest {
    const d = this.draft()!;
    return {
      name: d.name.trim(),
      description: d.description.trim() || null,
      mealSetPic1: d.pics[0] || null,
      mealSetPic2: d.pics[1] || null,
      mealSetPic3: d.pics[2] || null,
      mealSetPic4: d.pics[3] || null,
      mealSetVideo1: d.video1.trim() || null,
    };
  }

  async save(): Promise<void> {
    const d = this.draft();
    if (!d || !d.name.trim() || this.savingSet()) return;
    if (this.genreInput().trim()) this.addGenre(this.genreInput());
    const draft = this.draft()!;
    this.savingSet.set(true);
    try {
      let saved: MealSet;
      if (draft.mealSetId) {
        const body: UpdateMealSetRequest = this.draftToBody();
        if (!this.sameGenres(draft.genres, this.genresBaseline)) body.genres = draft.genres;
        saved = await firstValueFrom(this.mealSetService.updateSet(draft.mealSetId, body));
      } else {
        const body: CreateMealSetRequest = this.draftToBody();
        if (draft.genres.length) body.genres = draft.genres;
        saved = await firstValueFrom(this.mealSetService.createSet(body));
      }
      await this.commitMembership(saved.mealSetId);
      this.notification.show('MealSet saved.', 'success');
      this.close(); // Save & Close — hub reloads its tiles on close
    } catch {
      this.notification.show('Could not save the MealSet.', 'error');
    } finally {
      this.savingSet.set(false);
    }
  }
}
