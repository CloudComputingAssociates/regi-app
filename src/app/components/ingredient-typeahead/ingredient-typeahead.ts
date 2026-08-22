// src/app/components/ingredient-typeahead/ingredient-typeahead.ts
//
// Typeahead-first ingredient name field for the recipe editor. As-you-type it
// filters the SAME allowed-foods list the lookaside browses (getAllowedFoodsFull,
// which already honours the user's food-list setting: MyFoods → RegiApproved →
// AllFoods). Enter/click a match binds the row (emits foodPicked). No match →
// the last item is "Add '<text>'…" (or "Look up barcode <digits>") → FatSecret
// candidates (or /barcode) → create → bind. Free text + blur with no pick emits
// nameChange (row stays unbound). Keyboard: ↑↓ navigate, Enter/Tab select, Esc.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { UserFoodService } from '../../services/user-food.service';
import { NotificationService } from '../../services/notification.service';
import { Food } from '../../models/food.model';
import { FatSecretCandidate } from '../../models/fatsecret.model';

/** Normalized pick — a local match or a freshly created food, unified. */
export interface PickedFood {
  foodId: number;
  foodSource: 'food' | 'userfood';
  name: string;
  serving: number;
  unit: string;
  needsPhoto: boolean;
}

@Component({
  selector: 'app-ingredient-typeahead',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ita">
      <input
        #box
        type="text"
        class="ita-input"
        [value]="text()"
        placeholder="Start typing an ingredient…"
        (input)="onInput($any($event.target).value)"
        (keydown)="onKeydown($event, box)"
        (focus)="open.set(true)"
        (blur)="onBlur()" />

      @if (open()) {
        <div class="ita-drop" (mousedown)="$event.preventDefault()">
          @if (mode() === 'matches') {
            @for (m of matches(); track m.id; let i = $index) {
              <button type="button" class="ita-item" [class.hi]="hi() === i" (click)="pickMatch(m, box)">
                <span class="ita-name">{{ nameOf(m) }}</span>
                <span class="ita-tag">{{ tagOf(m) }}</span>
              </button>
            }
            @if (text().trim()) {
              <button type="button" class="ita-item ita-add" [class.hi]="hi() === matches().length"
                (click)="triggerAdd(box)">
                <mat-icon>{{ isBarcode() ? 'qr_code_scanner' : 'add' }}</mat-icon>{{ addLabel() }}
              </button>
            }
            @if (!matches().length && !text().trim()) {
              <div class="ita-empty">Type to search your foods…</div>
            }
          } @else {
            <div class="ita-sub">
              <button type="button" class="ita-back" (click)="backToMatches()"><mat-icon>arrow_back</mat-icon>Results for “{{ text() }}”</button>
            </div>
            @if (loading()) {
              <div class="ita-empty">Searching…</div>
            } @else if (candidates().length) {
              @for (c of candidates(); track c.fatsecretFoodId; let i = $index) {
                <button type="button" class="ita-item ita-cand" [class.hi]="hi() === i" (click)="pickCandidate(c, box)">
                  <span class="ita-name">{{ c.name }}@if (c.brand) { <em> · {{ c.brand }}</em> }</span>
                  <span class="ita-cand-sub">{{ c.servingDescription }}@if (c.calories) { · {{ c.calories }} cal }</span>
                </button>
              }
            } @else {
              <div class="ita-empty">{{ addError() || 'No results — try a name.' }}</div>
            }
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./ingredient-typeahead.scss'],
})
export class IngredientTypeaheadComponent {
  private prefs = inject(FoodPreferencesService);
  private userFoods = inject(UserFoodService);
  private notification = inject(NotificationService);

  /** The line's current ingredient name (seeds the box; syncs on external change). */
  readonly name = input<string>('');
  /** Free-text name edit (blur with no pick) — parent PATCHes ingredientName. */
  readonly nameChange = output<string>();
  /** A food was chosen (match or created) — parent binds the row. */
  readonly foodPicked = output<PickedFood>();

  readonly text = signal('');
  readonly open = signal(false);
  readonly hi = signal(0);
  readonly mode = signal<'matches' | 'candidates'>('matches');
  readonly candidates = signal<FatSecretCandidate[]>([]);
  readonly loading = signal(false);
  readonly addError = signal<string | null>(null);
  private readonly allowed = signal<Food[]>([]);
  private picked = false;

  constructor() {
    // Sync the box from the parent's name (seed + after a pick/blur-patch).
    effect(() => {
      const n = this.name();
      this.text.set(n);
    }, { allowSignalWrites: true });
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.allowed.set((await firstValueFrom(this.prefs.getAllowedFoodsFull())) ?? []);
    } catch {
      this.allowed.set([]);
    }
  }

  readonly isBarcode = computed<boolean>(() => /^\d{8,14}$/.test(this.text().trim()));
  readonly addLabel = computed<string>(() =>
    this.isBarcode() ? `Look up barcode ${this.text().trim()}` : `Add “${this.text().trim()}”…`,
  );

  /** Local matches — substring on name, top 8 (same list the lookaside browses). */
  readonly matches = computed<Food[]>(() => {
    const q = this.text().trim().toLowerCase();
    if (!q) return [];
    return this.allowed()
      .filter((f) => this.nameOf(f).toLowerCase().includes(q))
      .slice(0, 8);
  });

  nameOf(f: Food): string {
    return f.shortDescription?.trim() || f.description || '';
  }
  tagOf(f: Food): string {
    if (f.foodSource === 'userfood') return 'My Foods';
    return f.regiApproved ? 'Regi' : 'Food';
  }
  private servingOf(f: Food): number {
    return f.userServingSize ?? f.servingSize ?? 1;
  }

  onInput(v: string): void {
    this.text.set(v);
    this.open.set(true);
    this.mode.set('matches');
    this.hi.set(0);
  }

  onKeydown(ev: KeyboardEvent, box: HTMLInputElement): void {
    if (!this.open()) {
      if (ev.key === 'ArrowDown') { this.open.set(true); ev.preventDefault(); }
      return;
    }
    const count = this.mode() === 'matches'
      ? this.matches().length + (this.text().trim() ? 1 : 0)
      : this.candidates().length;
    switch (ev.key) {
      case 'ArrowDown': ev.preventDefault(); this.hi.set(Math.min(this.hi() + 1, Math.max(count - 1, 0))); break;
      case 'ArrowUp': ev.preventDefault(); this.hi.set(Math.max(this.hi() - 1, 0)); break;
      case 'Escape': ev.preventDefault(); this.mode() === 'candidates' ? this.backToMatches() : this.open.set(false); break;
      case 'Tab':
      case 'Enter': {
        if (!count && this.mode() === 'matches' && !this.text().trim()) return;
        ev.preventDefault();
        this.commitHighlighted(box);
        break;
      }
    }
  }

  private commitHighlighted(box: HTMLInputElement): void {
    if (this.mode() === 'candidates') {
      const c = this.candidates()[this.hi()];
      if (c) void this.pickCandidate(c, box);
      return;
    }
    const ms = this.matches();
    if (this.hi() < ms.length) this.pickMatch(ms[this.hi()], box);
    else this.triggerAdd(box);
  }

  pickMatch(f: Food, box: HTMLInputElement): void {
    if (f.id == null) return;
    this.emitPick({
      foodId: f.id,
      foodSource: (f.foodSource ?? 'food'),
      name: this.nameOf(f),
      serving: this.servingOf(f),
      unit: f.servingUnit ?? 'serving',
      needsPhoto: false,
    }, box);
  }

  /** "Add …" — barcode lookup for digits, else FatSecret candidate search. */
  async triggerAdd(box: HTMLInputElement): Promise<void> {
    const q = this.text().trim();
    if (!q) return;
    this.addError.set(null);
    if (this.isBarcode()) {
      this.loading.set(true);
      try {
        const res = await firstValueFrom(this.userFoods.lookupBarcode({ upcCode: q }));
        if (res.food?.id != null) this.bindCreated(res, box);
      } catch (err) {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.mode.set('candidates');
          this.candidates.set([]);
          this.addError.set('Not found — try a name.');
        } else {
          this.notification.show('Barcode lookup failed.', 'error');
        }
      } finally {
        this.loading.set(false);
      }
      return;
    }
    // Name add → FatSecret candidates inline.
    this.mode.set('candidates');
    this.hi.set(0);
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.userFoods.searchFatSecret(q, 8));
      this.candidates.set(res?.candidates ?? []);
    } catch {
      this.candidates.set([]);
      this.addError.set('Search failed — try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async pickCandidate(c: FatSecretCandidate, box: HTMLInputElement): Promise<void> {
    this.loading.set(true);
    try {
      // No categoryId (server AI-categorizes) and no nickname — the speed path.
      const res = await firstValueFrom(this.userFoods.createFromFatSecret({ fatsecretFoodId: c.fatsecretFoodId }));
      if (res.food?.id != null) {
        this.bindCreated(res, box);
        // Surface the just-added food at the top of MyFoods.
        this.prefs.setMyFoodsSort('newest');
        void this.load(); // refresh the local allowed list
      }
    } catch {
      this.notification.show('Could not add the food.', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  /** Map a created UserFood (FoodAddResult) → a pick and emit it. */
  private bindCreated(res: { food: import('../../models/user-food.model').UserFood | null; imageStatus?: string }, box: HTMLInputElement): void {
    const uf = res.food;
    if (!uf) return;
    this.emitPick({
      foodId: uf.id,
      foodSource: 'userfood',
      name: uf.shortDescription?.trim() || uf.description || '',
      serving: uf.servingSizeMultiplicand ?? 1,
      unit: uf.servingUnit ?? 'serving',
      needsPhoto: res.imageStatus === 'needed',
    }, box);
  }

  private emitPick(p: PickedFood, box: HTMLInputElement): void {
    this.picked = true;
    this.text.set(p.name);
    this.foodPicked.emit(p);
    this.open.set(false);
    this.mode.set('matches');
    this.candidates.set([]);
    box.blur();
  }

  backToMatches(): void {
    this.mode.set('matches');
    this.hi.set(0);
    this.addError.set(null);
  }

  onBlur(): void {
    // Defer so a dropdown click (mousedown-guarded) registers first.
    setTimeout(() => {
      this.open.set(false);
      this.mode.set('matches');
      // Free text with no pick → save the typed name (row stays unbound).
      if (!this.picked && this.text() !== this.name()) this.nameChange.emit(this.text());
      this.picked = false;
    });
  }
}
