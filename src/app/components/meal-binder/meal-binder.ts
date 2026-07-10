// src/app/components/meal-binder/meal-binder.ts
//
// Right-hand rail for the Menus surface. Two collapsible sections:
//   1. Folder — disposable, unplaced meals (server scope=folder). GenMeal fills
//      this. Grey pin icon: "Save to your Binder."
//   2. Binder — pinned meals (server scope=binder). Alive pin icon: "In your Binder."
// Cards are draggable (CDK) onto empty board slots. Each card carries a Binder
// pin icon (top-left) to save it — the pin icon is the ONLY state signal; card
// bodies always render at full opacity. Cards are NOT redesigned.
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { RotationService } from '../../services/rotation.service';
import { NotificationService } from '../../services/notification.service';
import { TwistIconComponent } from '../twist-icon/twist-icon';
import { Meal } from '../../models';

@Component({
  selector: 'app-meal-binder',
  imports: [DragDropModule, MatTooltipModule, MatIconModule, TwistIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="binder">
      <div class="binder-header">
        <span class="binder-title">Meals</span>
      </div>

      <!-- AI label + generation. The star spins while a generation runs; the new
           meal appears in the Folder below when done. -->
      <div class="genmeal-bar">
        <span class="ai-label" matTooltip="AI meal generation">
          <span class="ai-text">AI</span>
          <img
            src="images/AI-star.png"
            alt=""
            class="ai-logo"
            [class.spinning]="rotation.generating()" />
        </span>
        <button
          type="button"
          class="genmeal-btn"
          matTooltip="Generate a meal with AI"
          [disabled]="rotation.generating()"
          (click)="rotation.generateMeal()">
          Generate Meal
        </button>
      </div>

      <!-- Cuisine "Twist" combobox (unchanged). -->
      <div class="twist-row">
        <span class="twist-label">
          <span class="twist-word">Twist</span>
          <app-twist-icon />
        </span>
        <div class="twist-combo">
          <input
            #twistInput
            type="text"
            class="twist-input"
            [value]="twistValue()"
            placeholder="none"
            (input)="onTwistInput($any($event.target).value)"
            (focus)="twistOpen.set(true)"
            (blur)="onTwistBlur()"
            (keydown.escape)="twistOpen.set(false)" />
          <button
            type="button"
            class="twist-chevron"
            aria-label="Twist options"
            (mousedown)="onChevronMouseDown($event)">▾</button>
          @if (twistOpen()) {
            <ul class="twist-menu">
              @for (opt of twistOptions; track opt) {
                <li
                  class="twist-opt"
                  [class.selected]="opt === twistValue()"
                  (mousedown)="selectTwist(opt, $event)">{{ opt }}</li>
              }
            </ul>
          }
        </div>
      </div>

      <!-- Folder section: disposable, unplaced meals. -->
      <div class="rail-section">
        <button type="button" class="section-head" (click)="folderOpen.set(!folderOpen())">
          <mat-icon class="section-icon">folder</mat-icon>
          <span class="section-label">Folder</span>
          <mat-icon class="section-chevron">{{ folderOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>
        @if (folderOpen()) {
          <div class="section-body" cdkDropList>
            @for (meal of rotation.folderMeals(); track meal.id) {
              <div class="binder-card" cdkDrag [cdkDragData]="meal">
                <button
                  type="button"
                  class="card-pin icon-disc"
                  [class.icon-disc-pinned]="rotation.isPinAlive(meal)"
                  [matTooltip]="rotation.isPinAlive(meal) ? 'In your Binder' : 'Save to your Binder'"
                  (click)="$event.stopPropagation(); onPinMeal(meal)">
                  <mat-icon>menu_book</mat-icon>
                </button>
                <button
                  type="button"
                  class="card-delete icon-disc icon-disc-danger"
                  matTooltip="Discard this meal"
                  (click)="$event.stopPropagation(); rotation.deleteFolderMeal(meal.id)">
                  <mat-icon>delete_outline</mat-icon>
                </button>
                <span class="binder-card-name">{{ cardTitle(meal) }}</span>
                <div class="binder-chips">
                  <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
                  <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
                  <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
                  <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
                </div>
              </div>
            } @empty {
              <p class="binder-empty">No Folder meals — build one by hand or Generate Meal.</p>
            }
          </div>
        }
      </div>

      <!-- Binder section: pinned menus + meals (your saved library). Two
           independently-collapsible groups — Menus on top, Meals below. -->
      <div class="rail-section">
        <button type="button" class="section-head" (click)="binderOpen.set(!binderOpen())">
          <mat-icon class="section-icon">menu_book</mat-icon>
          <span class="section-label">Binder</span>
          <mat-icon class="section-chevron">{{ binderOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>
        @if (binderOpen()) {
          <!-- Menus group -->
          <div class="binder-group">
            <button type="button" class="group-head" (click)="binderMenusOpen.set(!binderMenusOpen())">
              <mat-icon class="group-icon">description</mat-icon>
              <span class="group-label">Menus</span>
              <span class="group-count">{{ rotation.binderMenus().length }}</span>
              <mat-icon class="group-chevron">{{ binderMenusOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
            </button>
            @if (binderMenusOpen()) {
              <div class="group-body">
                @for (menu of rotation.binderMenus(); track menu.id) {
                  <div class="binder-menu-card stacked-card" [attr.data-menu-id]="menu.id">
                    <button
                      type="button"
                      class="card-pin icon-disc icon-disc-pinned"
                      matTooltip="In your Binder">
                      <mat-icon>description</mat-icon>
                    </button>
                    <span class="binder-card-name">{{ menu.name }}</span>
                    <!-- SAME macro disks as meal cards (identical colors + order)
                         PLUS a calories disk, rendered from the menu's cached
                         totals — no client aggregation. -->
                    <div class="binder-chips">
                      <span class="chip protein">P {{ round(menu.totalProteinG) }}</span>
                      <span class="chip carb">C {{ round(menu.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(menu.totalFatG) }}</span>
                      <span class="chip fiber">F {{ round(menu.totalFiberG) }}</span>
                      <span class="chip cals">{{ round(menu.totalCalories) }} cal</span>
                    </div>
                  </div>
                } @empty {
                  <p class="binder-empty">No pinned menus yet — press the sheet icon on a menu to keep it.</p>
                }
                <!-- NOTE (Step 4): Binder-menu delete affordance is deferred this
                     pass — no trashcan on menu cards yet. -->
              </div>
            }
          </div>

          <!-- Meals group -->
          <div class="binder-group">
            <button type="button" class="group-head" (click)="binderMealsOpen.set(!binderMealsOpen())">
              <mat-icon class="group-icon">restaurant</mat-icon>
              <span class="group-label">Meals</span>
              <span class="group-count">{{ rotation.binderMeals().length }}</span>
              <mat-icon class="group-chevron">{{ binderMealsOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
            </button>
            @if (binderMealsOpen()) {
              <div class="group-body" cdkDropList>
                @for (meal of rotation.binderMeals(); track meal.id) {
                  <div class="binder-card" cdkDrag [cdkDragData]="meal">
                    <button
                      type="button"
                      class="card-pin icon-disc icon-disc-pinned"
                      matTooltip="In your Binder"
                      (click)="$event.stopPropagation()">
                      <mat-icon>menu_book</mat-icon>
                    </button>
                    <button
                      type="button"
                      class="card-delete icon-disc icon-disc-danger"
                      matTooltip="Delete this meal"
                      (click)="$event.stopPropagation(); onDeleteBinder(meal)">
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                    <span class="binder-card-name">{{ meal.name }}</span>
                    <div class="binder-chips">
                      <span class="chip protein">P {{ round(meal.totalProteinG) }}</span>
                      <span class="chip carb">C {{ round(meal.totalCarbG) }}</span>
                      <span class="chip fat">F {{ round(meal.totalFatG) }}</span>
                      <span class="chip fiber">F {{ round(meal.totalFiberG) }}</span>
                    </div>
                  </div>
                } @empty {
                  <p class="binder-empty">Nothing saved yet — press the book icon on a meal to keep it.</p>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./meal-binder.scss'],
})
export class MealBinderComponent implements OnInit {
  readonly rotation = inject(RotationService);
  private notification = inject(NotificationService);
  private host = inject(ElementRef<HTMLElement>);

  /** Section expand state — both default open. Bodies scroll independently. */
  readonly folderOpen = signal(true);
  readonly binderOpen = signal(true);
  /** Binder inner groups — both default open. */
  readonly binderMenusOpen = signal(true);
  readonly binderMealsOpen = signal(true);

  constructor() {
    // Step 3: when a menu is pinned, the service sets revealBinderMenuId. Expand
    // the Binder section + its Menus group and scroll the new entry into view.
    effect(
      () => {
        const id = this.rotation.revealBinderMenuId();
        if (id == null) return;
        this.binderOpen.set(true);
        this.binderMenusOpen.set(true);
        // Wait a tick for the group to render, then bring the card into view.
        setTimeout(() => {
          const el = this.host.nativeElement.querySelector(`[data-menu-id="${id}"]`);
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.rotation.loadFolder();
    this.rotation.loadBinder();
    this.rotation.loadBinderMenus();
  }

  /** Pin a Folder meal to the Binder. Alive icon = already in Binder → no-op. */
  onPinMeal(meal: Meal): void {
    if (this.rotation.isPinAlive(meal)) return;
    void this.rotation.pinMeal(meal.id);
  }

  /** Deleting a Binder meal is destructive to your library — confirm. */
  onDeleteBinder(meal: Meal): void {
    this.notification.showConfirmation(
      `Are you sure? Delete your Binder meal "${meal.name}".`,
      'warning',
      () => void this.rotation.deleteBinderMeal(meal.id),
      () => {
        /* keep it */
      },
    );
  }

  round(n: number | null | undefined): number {
    return Math.round(n ?? 0);
  }

  /** Card label: the meal's own name, else the primary protein's short name. */
  cardTitle(meal: Meal): string {
    const name = meal.name?.trim();
    if (name) return name;
    const items = meal.items ?? [];
    const primary = items.find((i) => i.itemRole === 'primary') ?? items[0];
    return (primary?.food?.shortDescription?.trim() || primary?.foodName?.trim()) ?? '';
  }

  // ----- Cuisine "Twist" combobox (unchanged) ------------------------------
  readonly twistOptions = ['none', 'Italian', 'Mexican', 'Mediterranean', 'American', 'Custom...'];

  readonly twistValue = signal('none');
  readonly twistOpen = signal(false);
  private twistBeforeCustom = 'none';
  private twistInputRef = viewChild<ElementRef<HTMLInputElement>>('twistInput');

  onTwistInput(value: string): void {
    this.twistValue.set(value);
  }

  onChevronMouseDown(ev: Event): void {
    ev.preventDefault();
    this.twistOpen.update((v) => !v);
    this.twistInputRef()?.nativeElement.focus();
  }

  selectTwist(opt: string, ev: Event): void {
    ev.preventDefault();
    if (opt === 'Custom...') {
      this.twistBeforeCustom = this.twistValue().trim() || 'none';
      this.twistValue.set('');
      this.twistOpen.set(false);
      queueMicrotask(() => this.twistInputRef()?.nativeElement.focus());
      return;
    }
    this.twistValue.set(opt);
    this.twistOpen.set(false);
  }

  onTwistBlur(): void {
    this.twistOpen.set(false);
    if (this.twistValue().trim() === '') {
      this.twistValue.set(this.twistBeforeCustom);
    }
  }
}
