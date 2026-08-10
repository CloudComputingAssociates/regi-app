// src/app/components/mealsets-panel/mealsets-panel.ts
//
// MealSetOwner authoring surface. Left-nav "MealSets" entry mounts this panel
// (gated on the MealSetOwner role — cosmetic; the server enforces it). Sections:
//   - Author profile (bio / credentials / author pic upload)
//   - Read-only revenue-share deal (hidden when there's no contract)
//   - "My Sets" list + create/edit form (name, description, genre, 4 pics, 1 video)
//   - Per-set meal picker (assign/unassign the author's own meals via junctions)
// All writes go straight to the API — no client caching. "Rotation" never appears.
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';
import { NotificationService } from '../../services/notification.service';
import { MealSetService } from '../../services/mealset.service';
import {
  MealSet,
  MealSetContractView,
  CreateMealSetRequest,
  UpdateMealSetRequest,
  Meal,
} from '../../models';

/** Editor draft — mirrors the author-writable set fields, plus the display-only
 *  price/active shown non-editable. mealSetId null = creating a new set. */
interface SetDraft {
  mealSetId: number | null;
  name: string;
  description: string;
  genre: string;
  pics: [string, string, string, string];
  video1: string;
  price: number;
  active: boolean;
}

@Component({
  selector: 'app-mealsets-panel',
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="msp">
      <header class="msp-header">
        <span class="msp-title"><mat-icon class="msp-title-icon">restaurant_menu</mat-icon>MealSets</span>
        <button
          type="button"
          class="msp-close"
          matTooltip="Close MealSets"
          matTooltipPosition="below"
          (click)="tabService.closePanel()">
          <mat-icon>logout</mat-icon>
        </button>
      </header>

      <div class="msp-body">
        <!-- ============ Author profile ============ -->
        <section class="msp-card">
          <h3 class="msp-card-title">Author profile</h3>
          <label class="msp-field">
            <span class="msp-label">Bio</span>
            <textarea
              class="msp-input msp-textarea"
              rows="2"
              [value]="profileBio()"
              (input)="profileBio.set($any($event.target).value)"></textarea>
          </label>
          <label class="msp-field">
            <span class="msp-label">Credentials</span>
            <input
              class="msp-input"
              type="text"
              [value]="profileCredentials()"
              (input)="profileCredentials.set($any($event.target).value)" />
          </label>
          <div class="msp-field">
            <span class="msp-label">Author photo</span>
            <div class="msp-pic-slot">
              @if (profilePic()) {
                <img [src]="profilePic()" alt="" class="msp-pic-thumb" />
              } @else {
                <span class="msp-pic-empty"><mat-icon>person</mat-icon></span>
              }
              <button type="button" class="msp-btn" [disabled]="uploadingProfilePic()" (click)="profilePicInput.click()">
                {{ uploadingProfilePic() ? 'Uploading…' : 'Upload' }}
              </button>
              <input #profilePicInput type="file" accept="image/jpeg,image/png" hidden
                (change)="onProfilePic(profilePicInput)" />
            </div>
          </div>
          <div class="msp-actions">
            <button type="button" class="msp-btn primary" [disabled]="savingProfile()" (click)="saveProfile()">
              {{ savingProfile() ? 'Saving…' : 'Save profile' }}
            </button>
          </div>
        </section>

        <!-- ============ Read-only deal (hidden with no contract) ============ -->
        @if (contract(); as c) {
          <section class="msp-card msp-deal">
            <h3 class="msp-card-title">Your deal</h3>
            <div class="msp-deal-row">
              <span class="msp-label">Revenue share</span>
              <span class="msp-deal-val">{{ c.revSharePercent != null ? c.revSharePercent + '%' : '—' }}</span>
            </div>
            <div class="msp-deal-row">
              <span class="msp-label">Pricing terms</span>
              <span class="msp-deal-val">{{ c.pricingTerms || '—' }}</span>
            </div>
            @if (c.status) {
              <div class="msp-deal-row">
                <span class="msp-label">Status</span>
                <span class="msp-deal-val">{{ c.status }}</span>
              </div>
            }
          </section>
        }

        <!-- ============ My Sets ============ -->
        <section class="msp-card">
          <div class="msp-card-head">
            <h3 class="msp-card-title">My Sets</h3>
            <button type="button" class="msp-btn primary" (click)="startCreate()">+ New set</button>
          </div>
          @if (authoredSets().length) {
            <ul class="msp-set-list">
              @for (s of authoredSets(); track s.mealSetId) {
                <li
                  class="msp-set-item"
                  [class.selected]="draft()?.mealSetId === s.mealSetId"
                  (click)="editSet(s)">
                  <span class="msp-set-name">{{ s.name }}</span>
                  @if (s.genre) { <span class="msp-set-genre">{{ s.genre }}</span> }
                  <span class="msp-set-flags">
                    {{ s.active ? 'Active' : 'Inactive' }} · {{ s.price > 0 ? ('$' + s.price) : 'Free' }}
                  </span>
                </li>
              }
            </ul>
          } @else {
            <p class="msp-empty">No sets yet — create your first.</p>
          }
        </section>

        <!-- ============ Set editor ============ -->
        @if (draft(); as d) {
          <section class="msp-card msp-editor">
            <h3 class="msp-card-title">{{ d.mealSetId ? 'Edit set' : 'New set' }}</h3>
            <label class="msp-field">
              <span class="msp-label">Name</span>
              <input class="msp-input" type="text" [value]="d.name" (input)="setField('name', $any($event.target).value)" />
            </label>
            <label class="msp-field">
              <span class="msp-label">Description</span>
              <textarea class="msp-input msp-textarea" rows="2" [value]="d.description"
                (input)="setField('description', $any($event.target).value)"></textarea>
            </label>
            <label class="msp-field">
              <span class="msp-label">Genre</span>
              <input class="msp-input" type="text" placeholder="e.g. Keto, GLP-1 friendly" [value]="d.genre"
                (input)="setField('genre', $any($event.target).value)" />
            </label>

            <div class="msp-field">
              <span class="msp-label">Photos (up to 4)</span>
              <div class="msp-pic-grid">
                @for (i of [0, 1, 2, 3]; track i) {
                  <div class="msp-pic-slot">
                    @if (d.pics[i]) {
                      <img [src]="d.pics[i]" alt="" class="msp-pic-thumb" />
                    } @else {
                      <span class="msp-pic-empty"><mat-icon>add_photo_alternate</mat-icon></span>
                    }
                    <button type="button" class="msp-btn small" [disabled]="uploadingPic() === i" (click)="picInput.click()">
                      {{ uploadingPic() === i ? '…' : (d.pics[i] ? 'Replace' : 'Upload') }}
                    </button>
                    <input #picInput type="file" accept="image/jpeg,image/png" hidden (change)="onPic(i, picInput)" />
                  </div>
                }
              </div>
            </div>

            <label class="msp-field">
              <span class="msp-label">Video URL</span>
              <input class="msp-input" type="url" placeholder="https://…" [value]="d.video1"
                (input)="setField('video1', $any($event.target).value)" />
            </label>

            <div class="msp-field msp-readonly-row">
              <span class="msp-readonly">Price: <strong>{{ d.price > 0 ? ('$' + d.price) : 'Free' }}</strong></span>
              <span class="msp-readonly">Status: <strong>{{ d.active ? 'Active' : 'Inactive' }}</strong></span>
              <span class="msp-readonly-note">(admin-set)</span>
            </div>

            <div class="msp-actions">
              <button type="button" class="msp-btn primary" [disabled]="savingSet() || !d.name.trim()" (click)="saveSet()">
                {{ savingSet() ? 'Saving…' : (d.mealSetId ? 'Save set' : 'Create set') }}
              </button>
              <button type="button" class="msp-btn" (click)="draft.set(null)">Cancel</button>
            </div>

            <!-- Meal picker — only for a saved set (needs an id to junction). -->
            @if (d.mealSetId) {
              <div class="msp-picker">
                <h4 class="msp-subtitle">Meals in this set</h4>
                @if (ownMeals().length) {
                  <ul class="msp-meal-list">
                    @for (m of ownMeals(); track m.id) {
                      <li class="msp-meal-item">
                        <label class="msp-meal-opt">
                          <input type="checkbox" [checked]="isAssigned(m.id)"
                            [disabled]="pendingMeal() === m.id"
                            (change)="toggleMeal(m, $any($event.target).checked)" />
                          <span class="msp-meal-name">{{ m.name }}</span>
                        </label>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="msp-empty">You have no saved meals to assign yet.</p>
                }
              </div>
            }
          </section>
        }
      </div>
    </div>
  `,
  styleUrls: ['./mealsets-panel.scss'],
})
export class MealsetsPanelComponent implements OnInit {
  protected tabService = inject(TabService);
  private mealSetService = inject(MealSetService);
  private notification = inject(NotificationService);

  // ---- Authored sets + editor ----------------------------------------------
  readonly authoredSets = signal<MealSet[]>([]);
  readonly draft = signal<SetDraft | null>(null);
  readonly savingSet = signal(false);
  readonly uploadingPic = signal<number | null>(null);

  // ---- Meal picker ----------------------------------------------------------
  readonly ownMeals = signal<Meal[]>([]);
  private readonly assignedIds = signal<Set<number>>(new Set());
  readonly pendingMeal = signal<number | null>(null);

  isAssigned(id: number): boolean {
    return this.assignedIds().has(id);
  }

  // ---- Owner profile --------------------------------------------------------
  readonly profileBio = signal('');
  readonly profileCredentials = signal('');
  readonly profilePic = signal('');
  readonly savingProfile = signal(false);
  readonly uploadingProfilePic = signal(false);

  // ---- Read-only contract ---------------------------------------------------
  readonly contract = signal<MealSetContractView | null>(null);

  ngOnInit(): void {
    void this.loadAuthored();
    void this.loadOwnMeals();
    void this.loadProfile();
    void this.loadContract();
  }

  private async loadAuthored(): Promise<void> {
    try {
      this.authoredSets.set((await firstValueFrom(this.mealSetService.getAuthored())) ?? []);
    } catch {
      this.authoredSets.set([]);
    }
  }

  private async loadOwnMeals(): Promise<void> {
    try {
      this.ownMeals.set((await firstValueFrom(this.mealSetService.getOwnMeals())) ?? []);
    } catch {
      this.ownMeals.set([]);
    }
  }

  private async loadProfile(): Promise<void> {
    try {
      const p = await firstValueFrom(this.mealSetService.getOwnerProfile());
      this.profileBio.set(p?.authorBio ?? '');
      this.profileCredentials.set(p?.authorCredentials ?? '');
      this.profilePic.set(p?.authorPic ?? '');
    } catch {
      // No profile yet — start blank.
    }
  }

  private async loadContract(): Promise<void> {
    try {
      this.contract.set(await firstValueFrom(this.mealSetService.getContract()));
    } catch {
      // 404 (no contract) or any other error → hide the deal panel cleanly.
      this.contract.set(null);
    }
  }

  // ---- Editor: create / edit / save ----------------------------------------
  startCreate(): void {
    this.assignedIds.set(new Set());
    this.draft.set({
      mealSetId: null,
      name: '',
      description: '',
      genre: '',
      pics: ['', '', '', ''],
      video1: '',
      price: 0,
      active: false,
    });
  }

  editSet(s: MealSet): void {
    this.draft.set({
      mealSetId: s.mealSetId,
      name: s.name ?? '',
      description: s.description ?? '',
      genre: s.genre ?? '',
      pics: [s.mealSetPic1 ?? '', s.mealSetPic2 ?? '', s.mealSetPic3 ?? '', s.mealSetPic4 ?? ''],
      video1: s.mealSetVideo1 ?? '',
      price: s.price ?? 0,
      active: s.active ?? false,
    });
    void this.loadAssigned(s.mealSetId);
  }

  setField(field: 'name' | 'description' | 'genre' | 'video1', value: string): void {
    this.draft.update((d) => (d ? { ...d, [field]: value } : d));
  }

  private draftToBody(): CreateMealSetRequest & UpdateMealSetRequest {
    const d = this.draft()!;
    return {
      name: d.name.trim(),
      description: d.description.trim() || null,
      genre: d.genre.trim() || null,
      mealSetPic1: d.pics[0] || null,
      mealSetPic2: d.pics[1] || null,
      mealSetPic3: d.pics[2] || null,
      mealSetPic4: d.pics[3] || null,
      mealSetVideo1: d.video1.trim() || null,
    };
  }

  async saveSet(): Promise<void> {
    const d = this.draft();
    if (!d || !d.name.trim() || this.savingSet()) return;
    this.savingSet.set(true);
    try {
      const saved = d.mealSetId
        ? await firstValueFrom(this.mealSetService.updateSet(d.mealSetId, this.draftToBody()))
        : await firstValueFrom(this.mealSetService.createSet(this.draftToBody()));
      await this.loadAuthored();
      this.editSet(saved); // re-open the saved set (now with an id → meal picker)
      this.notification.show('Meal set saved.', 'success');
    } catch {
      this.notification.show('Could not save the meal set.', 'error');
    } finally {
      this.savingSet.set(false);
    }
  }

  // ---- Pic uploads ----------------------------------------------------------
  onPic(index: number, input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    this.uploadingPic.set(index);
    void this.uploadInto(file, (url) => {
      this.draft.update((d) => {
        if (!d) return d;
        const pics = [...d.pics] as SetDraft['pics'];
        pics[index] = url;
        return { ...d, pics };
      });
    }).finally(() => this.uploadingPic.set(null));
  }

  onProfilePic(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    this.uploadingProfilePic.set(true);
    void this.uploadInto(file, (url) => this.profilePic.set(url)).finally(() =>
      this.uploadingProfilePic.set(false),
    );
  }

  private async uploadInto(file: File, store: (url: string) => void): Promise<void> {
    try {
      const res = await firstValueFrom(this.mealSetService.uploadImage(file));
      if (res?.cdn_url) {
        store(res.cdn_url);
      } else {
        this.notification.show('Upload failed — no URL returned.', 'error');
      }
    } catch {
      this.notification.show('Image upload failed.', 'error');
    }
  }

  // ---- Owner profile save ---------------------------------------------------
  async saveProfile(): Promise<void> {
    if (this.savingProfile()) return;
    this.savingProfile.set(true);
    try {
      await firstValueFrom(
        this.mealSetService.updateOwnerProfile({
          authorBio: this.profileBio().trim() || null,
          authorCredentials: this.profileCredentials().trim() || null,
          authorPic: this.profilePic() || null,
        }),
      );
      this.notification.show('Author profile saved.', 'success');
    } catch {
      this.notification.show('Could not save the author profile.', 'error');
    } finally {
      this.savingProfile.set(false);
    }
  }

  // ---- Meal picker junctions ------------------------------------------------
  private async loadAssigned(setId: number): Promise<void> {
    try {
      const meals = (await firstValueFrom(this.mealSetService.getSetMeals(setId))) ?? [];
      // Set-sourced entries carry mealSetId === this set; those are the assigned.
      const ids = meals.filter((m) => m.mealSetId === setId).map((m) => m.id);
      this.assignedIds.set(new Set(ids));
    } catch {
      this.assignedIds.set(new Set());
    }
  }

  async toggleMeal(meal: Meal, checked: boolean): Promise<void> {
    const d = this.draft();
    if (!d?.mealSetId || this.pendingMeal() === meal.id) return;
    this.pendingMeal.set(meal.id);
    try {
      if (checked) {
        await firstValueFrom(
          this.mealSetService.addMeal(d.mealSetId, { mealId: meal.id, sortOrder: this.assignedIds().size }),
        );
        this.assignedIds.update((s) => new Set(s).add(meal.id));
      } else {
        await firstValueFrom(this.mealSetService.removeMeal(d.mealSetId, meal.id));
        this.assignedIds.update((s) => {
          const next = new Set(s);
          next.delete(meal.id);
          return next;
        });
      }
    } catch {
      this.notification.show('Could not update the set membership.', 'error');
    } finally {
      this.pendingMeal.set(null);
    }
  }
}
