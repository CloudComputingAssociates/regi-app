// src/app/components/recipe-list-panel/recipe-list-panel.ts
//
// "My Recipes" — a full-screen TabService panel (no router) listing the author's
// recipes (ListRecipesResponse). Opens the authoring editor on click. Mounted
// once in app.ts; self-gates on TabService.recipeAuthorView() === 'list' AND the
// MealSetOwner role.
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { TabService } from '../../services/tab.service';
import { RoleService } from '../../services/role.service';
import { RecipeAuthoringService } from '../../services/recipe-authoring.service';
import { RecipeSummary } from '../../models';

@Component({
  selector: 'app-recipe-list-panel',
  imports: [DatePipe, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="rlp-backdrop" (click)="close()">
        <div class="rlp-panel" (click)="$event.stopPropagation()">
          <header class="rlp-head">
            <span class="rlp-title"><mat-icon>menu_book</mat-icon>My Recipes</span>
            <button type="button" class="rlp-new" (click)="newRecipe()">
              <mat-icon>add</mat-icon>New recipe
            </button>
            <button type="button" class="rlp-close" matTooltip="Close" (click)="close()">
              <mat-icon>close</mat-icon>
            </button>
          </header>

          <div class="rlp-body">
            @if (loading()) {
              <p class="rlp-muted">Loading…</p>
            } @else if (recipes().length) {
              <ul class="rlp-list">
                @for (r of recipes(); track r.id) {
                  <li class="rlp-item" (click)="open(r.id)">
                    <span class="rlp-item-title">{{ r.title }}</span>
                    <span class="rlp-badge type">{{ r.recipeType }}</span>
                    @if (r.isPublished) {
                      <span class="rlp-badge published">Published</span>
                    } @else {
                      <span class="rlp-badge draft">Draft</span>
                    }
                    @if (r.isArchived) { <span class="rlp-badge archived">Archived</span> }
                    <span class="rlp-updated">{{ r.updatedAt | date: 'MMM d, y' }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="rlp-muted">No recipes yet — create your first.</p>
            }
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['./recipe-list-panel.scss'],
})
export class RecipeListPanelComponent {
  private tab = inject(TabService);
  private role = inject(RoleService);
  private authoring = inject(RecipeAuthoringService);

  readonly isOpen = computed(
    () => this.tab.recipeAuthorView() === 'list' && this.role.hasRole('MealSetOwner'),
  );
  readonly loading = signal(false);
  readonly recipes = signal<RecipeSummary[]>([]);

  constructor() {
    // Load fresh each time the list opens.
    effect(() => {
      if (this.isOpen()) void this.load();
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.authoring.listRecipes());
      this.recipes.set(res?.recipes ?? []);
    } catch {
      this.recipes.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  open(id: number): void {
    this.tab.openRecipeEditor(id);
  }
  newRecipe(): void {
    this.tab.openRecipeEditor(null);
  }
  close(): void {
    this.tab.closeRecipeAuthor();
  }
}
