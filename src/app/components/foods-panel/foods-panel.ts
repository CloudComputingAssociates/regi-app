// src/app/components/foods-panel/foods-panel.ts
import { Component, ChangeDetectionStrategy, signal, computed, inject, viewChild, effect, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { NutritionFactsLabelComponent } from '../nutrition-facts-label/nutrition-facts-label';
import { CurateWizardComponent } from '../curate-wizard/curate-wizard';
import { AddFoodPanelComponent } from '../add-food-panel/add-food-panel';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { UserFoodService } from '../../services/user-food.service';
import { FoodsService, FoodList } from '../../services/foods.service';
import { TabService } from '../../services/tab.service';
import { LangfusePromptService, LangfusePromptError } from '../../services/langfuse-prompt.service';
import { SettingsService } from '../../services/settings.service';
import { Food, MealRole } from '../../models/food.model';
import { CurrentPick } from '../../models/settings.models';
import {
  BasketKey,
  BASKET_KEYS,
  ThisWeekBaskets,
  emptyBaskets,
  hydratePicks,
} from '../../models/picks-hydration';
import { nutritionLabelScale, snapServing } from '../../models/food-display';

// 'myfoods' and 'restricted' are special: they pull from the user-preferences
// service. Any other value is treated as the handle of a curated list and
// loaded via FoodsService.getListItems(). Lists are discovered at runtime via
// FoodsService.getLists() and appear in the dropdown below a separator.
type SpinSource = 'myfoods' | 'restricted' | string;

const CAROUSEL_CATEGORIES = [
  'Protein', 'Fat', 'Dairy', 'Vegetable',
  'Carbohydrate', 'Fruit', 'Processed', 'Condiment',
] as const;

const LS_MYFOODS = 'regi.foods.myfoods';
// Legacy basket localStorage key — kept ONLY so we can purge it on startup
// for users who upgraded across the picks-on-server rollout. Read once in
// the constructor and removed; nothing else in the code references it.
const LS_LEGACY_THISWEEK_BASKETS = 'regi.foods.thisweek.buckets';

// BasketKey / BASKET_KEYS / ThisWeekBaskets / emptyBaskets + the pick hydration
// now live in ../../models/picks-hydration (shared with the menus food-lookaside).

// Food.categoryName → basket. Per the spec: Dairy → Fats, Vegetables/Carbs/Fruits
// → Carbs, Processed/Condiments → Other.
const CATEGORY_TO_BASKET: Record<string, BasketKey> = {
  Protein: 'Proteins',
  Fat: 'Fats',
  Dairy: 'Fats',
  Vegetable: 'Carbs',
  Carbohydrate: 'Carbs',
  Fruit: 'Carbs',
  Processed: 'Other',
  Condiment: 'Other',
};

// Labels for the two preference-driven sources. Curated lists are labelled
// dynamically from their .description (see typeLabel computed below).
const TYPE_LABELS: Record<string, string> = {
  'myfoods': 'MyFoods',
  'restricted': 'My Restricted Foods',
};

const CATEGORY_PLURALS: Record<string, string> = {
  Protein: 'Proteins',
  Fat: 'Fats',
  Dairy: 'Dairy',
  Vegetable: 'Veggies',
  Carbohydrate: 'Carbs',
  Fruit: 'Fruits',
  Processed: 'Processed',
  Condiment: 'Seasonings',
};

// Filter-bar groups. Each group is a single button that toggles one or more
// raw categories together. We combine Fat+Dairy and Vegetable+Fruit so the
// filter UI nudges users to think of them as paired choices — dairy belongs
// with fats nutritionally, and fruits/veggies are the volume foods that
// must not get crowded out by carbs (carbs stays its own button so a 50g
// carb cap can't masquerade as a green-vegetable allowance).
type FilterGroup = { readonly key: string; readonly label: string; readonly cats: readonly string[] };
const FILTER_GROUPS: readonly FilterGroup[] = [
  { key: 'Protein',      label: 'Proteins',         cats: ['Protein'] },
  { key: 'FatsDairy',    label: 'Fats & Dairy',     cats: ['Fat', 'Dairy'] },
  { key: 'FruitsVeg',    label: 'Fruits & Veggies', cats: ['Vegetable', 'Fruit'] },
  { key: 'Carbohydrate', label: 'Carbs',            cats: ['Carbohydrate'] },
  { key: 'Processed',    label: 'Processed',        cats: ['Processed'] },
  { key: 'Condiment',    label: 'Seasonings',       cats: ['Condiment'] },
];

@Component({
  selector: 'app-foods-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule, NutritionFactsLabelComponent, CurateWizardComponent, AddFoodPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="foods-panel-container">
      <!-- No close X on this panel — the left-nav is now the navigator.
           Select another nav item to switch, or toggle the active nav
           item to close back to splash. -->

      <!-- Side-by-side main area: carousel on the LEFT, basket/list stack on
           the RIGHT, with a draggable vertical splitter between them. Starts
           50/50, persists nothing — the user can drag mid-session. -->
      <div class="main-area">

        <!-- LEFT PANE
             1. Blue "MyFoods" section title.
             2. FILTER gray-gradient bar (rounded), matching the DISPLAY bar
                on the right pane.
             3. Rounded carousel "card" that holds the search row + the
                carousel cards as a single visual unit, mirroring the basket-
                card on the right pane. -->
        <div class="left-pane" [style.flex]="leftPaneFlex()">
          <!-- Left-pane header mirrors "Focus Foods" across the way: the
               "My Foods" heading + the Edit… button share the section-title bar
               so both pane headers sit on one baseline. -->
          <div class="section-title">
            <span class="section-title-text">
              <span
                matTooltip="Your food library — the foods Planning draws from"
                matTooltipPosition="below"
                [matTooltipShowDelay]="350">
                My Foods
              </span>
            </span>
            <!-- Curate Wizard — the swipe deck for quickly favoriting Regi-approved
                 foods into MyFoods. -->
            <button
              type="button"
              class="bar-icon-btn curate-wizard-btn"
              (click)="wizardOpen.set(true)"
              matTooltip="Curate Wizard — swipe to build MyFoods"
              matTooltipPosition="below"
              [matTooltipShowDelay]="350"
              aria-label="Curate Wizard">
              <mat-icon aria-hidden="true">auto_fix_high</mat-icon>
            </button>
            <!-- Edit My Foods — toggles the editor split on the RHS (MyFoods stays
                 on the left). Insets while active. -->
            <button
              type="button"
              class="bar-icon-btn"
              [class.pressed]="focusEditOpen()"
              [attr.aria-pressed]="focusEditOpen()"
              (click)="toggleEdit()"
              [matTooltip]="focusEditOpen() ? 'Close Edit MyFoods' : 'Edit MyFoods'"
              matTooltipPosition="below"
              [matTooltipShowDelay]="350"
              aria-label="Edit My Foods">
              <mat-icon aria-hidden="true">tune</mat-icon>
            </button>
            <!-- Leave-panel key — red X disc (consistent with the Notebook + Menus
                 close). Lives here so it's ALWAYS available to close the panel. -->
            <div class="title-right">
              <button
                type="button"
                class="dialog-disc dialog-disc-cancel myfoods-close-disc"
                matTooltip="Close My Foods panel"
                matTooltipPosition="below"
                (click)="tabService.closePanel()"
                aria-label="Close panel">
                <mat-icon aria-hidden="true">close</mat-icon>
              </button>
            </div>
          </div>

          <div class="pane-card carousel-card">
            <div class="carousel-top-bar">
              <span class="search-label">SEARCH</span>
              <input
                type="text"
                class="carousel-search-input regi-field"
                [value]="searchQuery()"
                (input)="onSearchInput($any($event.target).value)"
                placeholder="type food name…" />
              @if (searchQuery()) {
                <button
                  type="button"
                  class="carousel-search-clear"
                  (click)="searchQuery.set('')"
                  matTooltip="Clear search"
                  matTooltipPosition="below"
                  aria-label="Clear search">
                  <mat-icon>cancel</mat-icon>
                </button>
              }
              <span class="top-bar-spacer"></span>
              <!-- Edit Nutrition Facts (scale serving/units) for the highlighted
                   food — a pencil just LEFT of the trash. -->
              <button
                type="button"
                class="bar-icon-btn myfoods-edit"
                [disabled]="!selectedFood()"
                (click)="onSelectedTileEdit()"
                matTooltip="Edit nutrition facts"
                matTooltipPosition="below"
                aria-label="Edit nutrition facts">
                <mat-icon aria-hidden="true">edit</mat-icon>
              </button>
              <!-- Remove-from-MyFoods trashcan — greyed until a food is highlighted;
                   then a grey button with a red trashcan to pare the list down. -->
              <button
                type="button"
                class="bar-icon-btn myfoods-remove"
                [disabled]="!selectedFood()"
                (click)="removeSelectedFromMyFoods($event)"
                matTooltip="Remove from MyFoods"
                matTooltipPosition="below"
                aria-label="Remove from MyFoods">
                <mat-icon aria-hidden="true">delete_outline</mat-icon>
              </button>
              <span class="top-bar-total">Total ({{ carouselSpinnerFoods().length }})</span>
            </div>
            <!-- Category filters — moved beneath the search, inside the card. -->
            <div class="carousel-filter-row">
              <span class="filter-bar-label">FILTER</span>
              <div class="category-radio-panel" role="group" aria-label="Category filter">
                <!-- Clear all filters — icon key in front of the first category. -->
                <button
                  type="button"
                  class="category-radio-btn filter-clear-btn"
                  matTooltip="Clear filter"
                  matTooltipPosition="below"
                  [matTooltipShowDelay]="350"
                  (click)="clearFilters()"
                  aria-label="Clear filter">
                  <mat-icon aria-hidden="true">filter_alt_off</mat-icon>
                </button>
                @for (group of filterGroups; track group.key) {
                  <button
                    type="button"
                    class="category-radio-btn"
                    [class.pressed]="isFilterGroupActive(group)"
                    [attr.aria-pressed]="isFilterGroupActive(group)"
                    (click)="toggleFilterGroup(group)">
                    {{ group.label }}
                  </button>
                }
              </div>
            </div>
            <!-- Tile grid replaces the old spinning carousel. Tiles fill
                 left-to-right and wrap to the next row; the grid scrolls
                 vertically when the food set exceeds the visible area.
                 Single-click selects (yellow halo), single-click on the
                 selected tile unselects, double-click activates (adds to
                 the active picker — Refine is closed first if open),
                 drag works exactly like the old carousel cards. -->
            <div class="tile-grid">
              @for (food of carouselSpinnerFoods(); track food.id) {
                <div
                  class="food-tile"
                  [class.selected]="selectedFood()?.id === food.id"
                  [draggable]="addTo() !== 'right'"
                  (click)="onTileClick(food)"
                  (dragstart)="onTileDragStart(food, $event)">
                  <div class="food-tile-image">
                    @if (foodThumb(food); as src) {
                      <img [src]="src" alt="" draggable="false" />
                    }
                  </div>
                  <div class="food-tile-label">
                    {{ food.shortDescription || food.description }}
                  </div>
                </div>
              } @empty {
                <div class="tile-grid-empty">{{ carouselEmptyMessage() }}</div>
              }
            </div>
          </div>
        </div>

        <!-- EDIT MODE: MyFoods stays on the LHS; the RHS (with a splitter) holds
             the Edit-My-Foods editor. The Edit button toggles this split. The
             Focus Foods baskets are parked behind the editor overlay (not shown).
             Nothing deleted — restore that view later by dropping the overlay. -->
        @if (focusEditOpen()) {
        <!-- VERTICAL SPLITTER — drag horizontally to resize the two panes. -->
        <div
          #vSplitter
          class="pane-splitter-v"
          (mousedown)="onVSplitterMouseDown($event)"
          (touchstart)="onVSplitterTouchStart($event)">
          <div class="splitter-grip-v"></div>
        </div>
        <!-- RIGHT PANE — the Edit-My-Foods editor (Focus Foods baskets parked
             behind its overlay). -->
        <div class="right-pane" [style.flex]="rightPaneFlex()">
          <!-- RHS title:
               - Baskets mode (default): just "Baskets (n)" — no close.
                 Baskets is the home state and can't be dismissed; the user
                 closes the entire Foods panel via the left-nav.
               - Curate mode: "Curation (n)" with an X close on the right
                 that flips back to Baskets. The Curate LHS pill stays in
                 sync as the same toggle. -->
          <div class="section-title">
            <span class="section-title-text">
              <span
                matTooltip="You pick 'Focus Foods', as a baseline for Planning your menus"
                matTooltipPosition="below"
                [matTooltipShowDelay]="350">
                Focus Foods
              </span>
            </span>
            <!-- Clear-all-focus-foods key — empties all four baskets
                 (auto-persists via persistThisWeek). -->
            <button
              type="button"
              class="bar-icon-btn"
              matTooltip="Clear all picks"
              matTooltipPosition="below"
              (click)="clearAllPicks()"
              aria-label="Clear all picks">
              <mat-icon aria-hidden="true">clear_all</mat-icon>
            </button>
            <div class="title-right">
              <!-- Leave-panel key — closes the whole My Foods panel. -->
              <button
                type="button"
                class="bar-icon-btn"
                matTooltip="Close My Foods panel"
                matTooltipPosition="below"
                (click)="tabService.closePanel()"
                aria-label="Close panel">
                <mat-icon aria-hidden="true">logout</mat-icon>
              </button>
            </div>
          </div>

          <!-- 4 baskets in a 2×2 grid — always shown; Edit is now an overlay. -->
          <div class="pane-card basket-card">
            <div class="basket-grid">
              @for (key of basketKeys; track key) {
                <div
                  class="basket"
                  [class.drag-over]="dragOverBasket() === key"
                  [class.focused]="focusedBasket() === key"
                  (dragenter)="onBasketDragEnter($event, key)"
                  (dragover)="onBasketDragOver($event)"
                  (dragleave)="onBasketDragLeave($event, key)"
                  (drop)="onBasketDrop($event, key)">
                  <!-- Header row: blue title + one right-aligned control cluster
                       (pencil, trash, then the collapse/expand discs) sharing a
                       single centerline. -->
                  <div class="basket-face">
                    <span class="basket-title">
                      {{ basketLabel(key) }} ({{ thisWeekBaskets()[key].length }})
                    </span>
                    <!-- Pencil + trash CENTERED on the card, deliberately kept
                         away from the collapse/expand discs. -->
                    <div class="basket-center-controls">
                      <button
                        type="button"
                        class="basket-ctl basket-ctl-edit"
                        [disabled]="!isSelectedInBasket(key)"
                        (click)="onHeaderEditSelected()"
                        matTooltip="Edit nutrition & serving"
                        matTooltipPosition="above">
                        <mat-icon class="basket-ctl-icon">edit</mat-icon>
                      </button>
                      <!-- Empty-basket delete — same red icon-disc as the Menus
                           & Meals card delete. Always present; disabled (dimmed)
                           when the basket is empty, exactly like the pencil. -->
                      <button
                        type="button"
                        class="icon-disc icon-disc-danger"
                        [disabled]="thisWeekBaskets()[key].length === 0"
                        (click)="clearBasket(key)"
                        matTooltip="Empty Basket"
                        matTooltipPosition="above">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    </div>
                    <!-- Collapse/expand discs pinned at the right, on the same
                         centerline as the centered pencil/trash. -->
                    <div class="basket-lights">
                      <!-- Collapse (−): disabled until the basket is expanded. -->
                      <button
                        type="button"
                        class="basket-light basket-light-min"
                        [disabled]="focusedBasket() !== key"
                        (click)="focusedBasket.set(null)"
                        matTooltip="Restore"
                        matTooltipPosition="above">
                      </button>
                      <!-- Expand (+): grows the basket, then disables itself. -->
                      <button
                        type="button"
                        class="basket-light basket-light-max"
                        [disabled]="focusedBasket() === key"
                        (click)="focusedBasket.set(key)"
                        matTooltip="Expand"
                        matTooltipPosition="above">
                      </button>
                    </div>
                  </div>
                  @if (thisWeekBaskets()[key].length === 0) {
                    <div class="basket-empty-hint">
                      <span class="basket-empty-hint-text">{{ basketEmptyHint(key) }}</span>
                    </div>
                  } @else {
                    <div class="basket-tiles">
                      @for (food of thisWeekBaskets()[key]; track food.id) {
                        <div
                          class="basket-mini-card"
                          [class.selected]="selectedBasketFood()?.id === food.id"
                          [matTooltip]="food.shortDescription || food.description"
                          matTooltipPosition="above"
                          [draggable]="true"
                          (dragstart)="onBasketTileDragStart(food, key, $event)"
                          (dragend)="onBasketTileDragEnd($event)"
                          (click)="onBasketTileClick(food)">
                          <!-- Hover-revealed red X — explicit remove affordance.
                               stopPropagation so clicking it doesn't fire the
                               card's (click) select handler. -->
                          <button
                            type="button"
                            class="basket-mini-remove"
                            (click)="removeFoodFromBasket(key, food.id); $event.stopPropagation()"
                            matTooltip="Remove from basket"
                            matTooltipPosition="above"
                            aria-label="Remove">
                            ✕
                          </button>
                          <div class="basket-mini-card-image">
                            @if (foodThumb(food); as src) {
                              <img [src]="src" alt="" />
                            }
                          </div>
                          <!-- Meal-role overlay: hollow yellow-glow P/S over the
                               image (AnyUse shows nothing). -->
                          @if (food.mealRole === 'PrimaryFood' || food.mealRole === 'SecondaryFood') {
                            <span class="basket-role-badge">{{ food.mealRole === 'PrimaryFood' ? 'P' : 'S' }}</span>
                          }
                          <div class="basket-mini-card-label">
                            <span class="basket-mini-card-label-text">
                              {{ food.shortDescription || food.description }}
                            </span>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
            </div>
          @if (addTo() === 'right') {
            <!-- Edit MyFoods overlay — pops over the panel (consistent with the
                 Meals-area edit). Backdrop click or the Red X disc closes it,
                 revealing Focus Foods again. position:fixed lifts it out of the
                 pane flow to cover the whole panel. -->
            <div class="edit-overlay">
              <div class="edit-overlay-panel">
                <div class="edit-overlay-header">
                  <span class="edit-overlay-title">Edit MyFoods</span>
                  <div class="dialog-discs">
                    <button
                      type="button"
                      class="dialog-disc dialog-disc-cancel"
                      (click)="closeEditOverlay()"
                      matTooltip="Close Edit"
                      matTooltipPosition="below"
                      aria-label="Close Edit">
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                </div>
                <!-- TYPE row: LIST · dropdown · + · Search · Total. -->
                <div class="type-row">
                  <span class="type-row-label">LIST</span>
                  <select
                    class="spin-source-select regi-field"
                    [ngModel]="spinSource()"
                    (ngModelChange)="onSpinSourceChange($event)">
                    <!-- Order: My Foods (default) · curated lists (Regi/YEH
                         Approved, GLP-1 favorites) · separator · Restricted. -->
                    <option value="myfoods">My Foods</option>
                    @for (list of orderedLists(); track list.name) {
                      <option [value]="list.name">{{ list.description }}</option>
                    }
                    <option disabled>──────────────</option>
                    <option value="restricted">Restricted</option>
                  </select>
                  <!-- Add a food to MyFoods — opens the shared Add-Food dialog.
                       Only meaningful for the MyFoods list. -->
                  @if (spinSource() === 'myfoods') {
                    <button
                      type="button"
                      class="bar-icon-btn add-food-btn"
                      (click)="onAddFood()"
                      matTooltip="Add a food to My Foods"
                      matTooltipPosition="below"
                      aria-label="Add a food to My Foods">
                      <mat-icon aria-hidden="true">add</mat-icon>
                    </button>
                  }
                  <input
                    type="text"
                    class="picker-search-input regi-field"
                    [value]="pickerSearchQuery()"
                    (input)="onPickerSearchInput($any($event.target).value)"
                    placeholder="Search foods…" />
                  @if (pickerSearchQuery()) {
                    <button
                      type="button"
                      class="picker-search-clear"
                      (click)="pickerSearchQuery.set('')"
                      matTooltip="Clear search"
                      matTooltipPosition="below"
                      aria-label="Clear search">
                      ✕
                    </button>
                  }
                  <!-- Collapse/expand ALL category accordions for the current list
                       (works for any list — MyFoods, curated, Restricted). -->
                  <button
                    type="button"
                    class="bar-icon-btn curate-collapse-all"
                    [class.pressed]="allCategoriesCollapsed()"
                    (click)="allCategoriesCollapsed() ? expandAllCategories() : collapseAllCategories()"
                    [matTooltip]="allCategoriesCollapsed() ? 'Expand all categories' : 'Collapse all categories'"
                    matTooltipPosition="below"
                    aria-label="Collapse or expand all categories">
                    <mat-icon aria-hidden="true">{{ allCategoriesCollapsed() ? 'unfold_more' : 'unfold_less' }}</mat-icon>
                  </button>
                  <span class="top-bar-total picker-search-total">Total ({{ bottomListLength() }})</span>
                </div>
            <div class="pane-card list-card">
            <div class="right-pane-list" #bottomList>
              @if (spinSource() === 'myfoods') {
            <!-- TYPE=MyFoods on right side: accordion view of curated MyFoods -->
            @if (allMyFoods().length === 0) {
              <div class="bottom-empty">
                Favorite a Regi Approved food (or double-click it) to add it to MyFoods.
              </div>
            } @else {
              @for (group of groupedMyFoods(); track group.category; let i = $index) {
                <div class="category-header"
                     (click)="toggleMyFoodsCategory(group.category)">
                  <mat-icon class="collapse-icon" [class.collapsed]="group.collapsed">expand_more</mat-icon>
                  <span class="category-name">{{ categoryLabel(group.category) }}</span>
                  <span class="category-count">({{ group.foods.length }})</span>
                  <span class="category-action-hint">{{ columnHeaderText() }}</span>
                </div>
                @if (!group.collapsed) {
                  @for (food of group.foods; track food.id) {
                    <div class="selected-food-row"
                         [class.selected]="selectedMyFood()?.id === food.id"
                         (click)="onMyFoodRowClick(food)">
                      @if (selectedMyFood()?.id === food.id) {
                        <!-- Centered AI Health Info badge overlay (row doesn't
                             grow — it overlays the row). Edit/Delete live in the
                             row's action strip below. -->
                        <div class="myfood-select-overlay">
                          <button
                            type="button"
                            class="myfood-health-info"
                            (click)="$event.stopPropagation(); openHealthBenefits(food)"
                            matTooltip="Click for AI Health Info"
                            matTooltipPosition="above"
                            aria-label="Health info">
                            <img src="/images/Health%20Benefits.png" alt="Health Info" class="myfood-health-info-bg" />
                            <span class="myfood-health-info-ai" aria-hidden="true"></span>
                          </button>
                        </div>
                      }
                      <div class="selected-food-thumb"
                           (mousedown)="onThumbHoldStart($event, food)"
                           (mouseup)="onThumbHoldEnd()"
                           (mouseleave)="onThumbHoldEnd()"
                           (touchstart)="onThumbHoldStart($event, food)"
                           (touchend)="onThumbHoldEnd()"
                           (touchcancel)="onThumbHoldEnd()">
                        @if (foodThumb(food); as src) {
                          <img [src]="src" alt="" draggable="false" />
                        } @else {
                          <div class="selected-food-thumb-placeholder"></div>
                        }
                      </div>
                      <span class="selected-food-name">
                        {{ food.shortDescription || food.description }}
                      </span>
                      @if (selectedMyFood()?.id === food.id) {
                        <mat-icon
                          class="row-action edit"
                          (click)="$event.stopPropagation(); onSelectedMyFoodEdit()"
                          matTooltip="Edit food"
                          matTooltipPosition="above">edit</mat-icon>
                        @if (isUserAddedFood(food)) {
                          <mat-icon
                            class="row-action trash"
                            (click)="$event.stopPropagation(); onSelectedMyFoodDelete($event)"
                            matTooltip="Delete food"
                            matTooltipPosition="above">delete</mat-icon>
                        }
                      }
                      <mat-icon
                        class="row-action favorite"
                        [class.active]="preferencesService.isAllowed(food.id)"
                        [class.disabled]="isUserAddedFood(food)"
                        (click)="isUserAddedFood(food) ? $event.stopPropagation() : toggleFavorite($event, food)"
                        [matTooltip]="isUserAddedFood(food)
                          ? 'A food you added stays favorited — restrict it to exclude, or delete it'
                          : 'Favorite'"
                        matTooltipPosition="left">
                        {{ preferencesService.isAllowed(food.id) ? 'star' : 'star_border' }}
                      </mat-icon>
                      <mat-icon
                        class="row-action restrict"
                        [class.active]="preferencesService.isRestricted(food.id)"
                        (click)="toggleRestricted($event, food.id)"
                        matTooltip="Restrict"
                        matTooltipPosition="left">
                        block
                      </mat-icon>
                      <!-- Per-row trash removed — deletion is now the top-bar
                           red trash acting on the single-selected row. -->
                    </div>
                  }
                }
              }
            }
          } @else {
            <!-- TYPE=YEH Approved or Restricted: always rendered as a
                 collapsible accordion grouped by category, same shape as the
                 MyFoods view above so the curate experience feels consistent
                 regardless of which TYPE is selected. -->
            @if (carouselFoods().length === 0) {
              <div class="bottom-empty">
                @if (spinSource() === 'restricted') {
                  No restricted foods match.
                } @else {
                  No foods in {{ typeLabel() }} match.
                }
              </div>
            } @else {
              @for (group of groupedCarouselFoods(); track group.category) {
                <div class="category-header"
                     (click)="toggleCarouselCategory(group.category)">
                  <mat-icon class="collapse-icon" [class.collapsed]="group.collapsed">expand_more</mat-icon>
                  <span class="category-name">{{ categoryLabel(group.category) }}</span>
                  <span class="category-count">({{ group.foods.length }})</span>
                  <span class="category-action-hint">{{ columnHeaderText() }}</span>
                </div>
                @if (!group.collapsed) {
                  @for (food of group.foods; track food.id) {
                    <div class="selected-food-row">
                      <div class="selected-food-thumb">
                        @if (foodThumb(food); as src) {
                          <img [src]="src" alt="" />
                        } @else {
                          <div class="selected-food-thumb-placeholder"></div>
                        }
                      </div>
                      <span class="selected-food-name">
                        {{ food.shortDescription || food.description }}
                      </span>
                      <mat-icon
                        class="row-action favorite"
                        [class.active]="preferencesService.isAllowed(food.id)"
                        (click)="toggleFavorite($event, food)"
                        matTooltip="Favorite (adds to MyFoods)"
                        matTooltipPosition="left">
                        {{ preferencesService.isAllowed(food.id) ? 'star' : 'star_border' }}
                      </mat-icon>
                      <mat-icon
                        class="row-action restrict"
                        [class.active]="preferencesService.isRestricted(food.id)"
                        (click)="toggleRestricted($event, food.id)"
                        matTooltip="Restrict"
                        matTooltipPosition="left">
                        block
                      </mat-icon>
                    </div>
                  }
                }
              }
              }
              }
            </div>
            </div>
              </div>
            </div>
          }
        </div>
        }
      </div>

      <!-- Nutrition Facts popup. Opens in view mode by default (read-only).
           Opens in edit mode only from the RHS Edit MyFoods row, where a
           Green Save button persists changes to UserFoodPreferences.ServingSize. -->
      @if (nfPopupFood()) {
        <div class="nf-popup-overlay" (click)="onNfPopupClose()">
          <div class="nf-popup" (click)="$event.stopPropagation()">
            <!-- Canonical confirm/cancel discs (see CLAUDE.md > Dialog
                 conventions): green confirm LEFT of red cancel, red in the
                 corner. Health Info is shifted left to make room. -->
            <div class="dialog-discs">
              @if (nfPopupCanSave()) {
                <button
                  type="button"
                  class="dialog-disc dialog-disc-confirm"
                  (click)="onNfSave()"
                  matTooltip="Save serving size"
                  matTooltipPosition="below"
                  aria-label="Save serving size">
                  <mat-icon>check</mat-icon>
                </button>
              }
              <button
                type="button"
                class="dialog-disc dialog-disc-cancel"
                (click)="onNfPopupClose()"
                matTooltip="Close"
                matTooltipPosition="below"
                aria-label="Close">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <!-- Health Info badge intentionally removed from the NF popup — it
                 now lives centered on a selected Edit-MyFoods row. -->
            <!-- Scroll lives on this inner wrapper so the outer .nf-popup can
                 be overflow:visible and let the Health Info badge overhang
                 above without being clipped. -->
            <div class="nf-popup-inner">
              <div class="nf-popup-header">
                @if (nfPopupFood()!.productPurchaseLink) {
                  <a class="nf-popup-title nf-popup-title-link"
                     (click)="openProductLink(nfPopupFood()!)">
                    {{ nfPopupFood()!.shortDescription || nfPopupFood()!.description }}
                  </a>
                } @else {
                  <span class="nf-popup-title">
                    {{ nfPopupFood()!.shortDescription || nfPopupFood()!.description }}
                  </span>
                }
              </div>
              @if (nfPopupMode() === 'edit') {
                <select
                  class="nf-popup-category"
                  [value]="nfPopupCategory()"
                  [disabled]="(nfPopupFood()!.foodSource ?? 'food') !== 'userfood'"
                  (change)="onNfCategoryChange($any($event.target).value)"
                  aria-label="Food category">
                  @for (name of nfCategoryOptions(); track name) {
                    <option [value]="name">{{ name }}</option>
                  }
                </select>
              }
              <regi-nutrition-label
                [nutritionFacts]="nfPopupFood()!.nutritionFacts ?? null"
                [scale]="nfPopupScale()"
                [displayUnit]="nfPopupFood()!.servingUnit || 'g'"
                [displayQuantity]="nfPopupServingSize()"
                [editable]="nfPopupMode() === 'edit'"
                [showSave]="false"
                (adjust)="onNfAdjust($event)"
                (commit)="onNfCommit($event)"
                (save)="onNfSave()" />
            </div>
            <!-- Dev-side data-trace, OUTSIDE the inner scroll area so it
                 rides on the popup's dark bottom chrome instead of inside
                 the white nutrition label. Food ID + source ("USDA" for
                 canonical rows, "User" for phone-app-created ones). -->
            <div class="nf-popup-trace">
              {{ traceLabel(nfPopupFood()!) }}
            </div>
          </div>
        </div>
      }

      <!-- Press-and-hold zoom overlay. Activated by single-press + hold on
           a food thumbnail in the Edit MyFoods accordion. Released the
           moment the user lets go (mouseup / mouseleave / touchend). -->
      @if (zoomImageUrl(); as url) {
        <div class="thumb-zoom-overlay" (click)="onThumbHoldEnd()">
          <img [src]="url" alt="" class="thumb-zoom-image" draggable="false" />
        </div>
      }

      <!-- Health Benefits popup. Content comes from the Langfuse "health-
           benefits" prompt by way of POST /api/ai/langfuse/{promptName}. -->
      @if (showHealthBenefits()) {
        <div class="hb-overlay" (click)="showHealthBenefits.set(false)">
          <div class="hb-popup" (click)="$event.stopPropagation()">
            <button
              type="button"
              class="hb-close"
              (click)="showHealthBenefits.set(false)"
              aria-label="Close">
              ✕
            </button>
            <div class="hb-header">
              <img src="/images/AI-star-white.png" alt="" class="hb-ai-icon" />
              <span class="hb-header-text">Health Info</span>
            </div>
            @if (healthBenefitsFood(); as food) {
              <div class="hb-title">{{ food.shortDescription || food.description }}</div>
            }
            <div class="hb-content">
              @if (healthBenefitsLoading()) {
                <div class="hb-loading">Prompting AI for health benefits…</div>
              } @else if (healthBenefitsError(); as err) {
                <div class="hb-error">{{ err }}</div>
              } @else if (healthBenefitsText(); as text) {
                <div class="hb-text">{{ text }}</div>
              }
            </div>
          </div>
        </div>
      }

      <!-- "Make MyFoods default match the pick?" alert dialog. Backdrop click
           and the red X both behave as "No" — the pick override always
           saves; the only question is whether the MyFoods baseline tags
           along. -->
      @if (baselineDialog(); as d) {
        <div class="dialog-overlay" (click)="onBaselineDialogNo()">
          <div class="alert-dialog" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
            <div class="alert-dialog-titlebar">
              <span class="alert-dialog-title">Update MyFoods baseline?</span>
              <button
                type="button"
                class="alert-dialog-close"
                (click)="onBaselineDialogNo()"
                aria-label="Close">✕</button>
            </div>
            <div class="alert-dialog-body">
              Make MyFoods default {{ d.draft }} {{ d.unit }} as well?
            </div>
            <div class="alert-dialog-actions">
              <button
                type="button"
                class="alert-dialog-btn alert-dialog-btn-yes"
                (click)="onBaselineDialogYes()">Yes</button>
              <button
                type="button"
                class="alert-dialog-btn alert-dialog-btn-no"
                (click)="onBaselineDialogNo()">No</button>
            </div>
          </div>
        </div>
      }

      <!-- (The phone-app "Tether Mobile" handoff moved to a global bloom dialog
           opened from the profile menu's "Mobile App" entry — see
           mobile-app-dialog + TabService.mobileAppOpen.) -->

      <!-- Curate Wizard — swipe deck over the panel. On close it reloads MyFoods
           so newly-favorited foods appear. -->
      @if (wizardOpen()) {
        <app-curate-wizard (close)="onWizardClose()" />
      }

      <!-- Shared Add-Food dialog — the same panel the binder's "+" opens. On
           add it reloads MyFoods so the new food appears. -->
      @if (addFoodPanelOpen()) {
        <app-add-food-panel (close)="addFoodPanelOpen.set(false)" (added)="onAddFoodAdded()" />
      }
    </div>
  `,
  styleUrls: ['./foods-panel.scss']
})
export class FoodsPanelComponent {
  constructor() {
    // Eager-load server-side allowed foods so the MY FOODS bottom list is populated
    // immediately, even before the user flips TYPE to MyFoods.
    this.refreshServerMyFoods();
    // Populate the local Allowed/Restricted ID sets so the row icons (star /
    // block) reflect each YEH food's actual state as the user scrolls. Without
    // this call those signals stay empty and every row reads as "not favorited".
    this.preferencesService.getAllPreferences().subscribe({
      error: (err) => console.error('Failed to load food preferences:', err),
    });
    // Pull the curated-list catalog so the Food List dropdown can show
    // every list the API publishes (regi-approved, glp-1-friendly, …).
    this.foodsService.getLists().subscribe({
      next: (resp) => {
        const lists = resp?.lists ?? [];
        this.availableLists.set(lists);
        // LIST dropdown defaults to My Foods (top of the menu) — do NOT auto-switch
        // to the Regi Approved list; the user selects a curated list explicitly.
      },
      error: () => this.availableLists.set([]),
    });
    // Hydrate baskets from server-side CurrentPicks. Sequenced after the
    // allowed-foods load so we can intersect picks with the user's actual
    // MyFoods set and silently drop stale (un-favorited) entries.
    void this.hydratePicksFromServer();
    // One-shot purge of the pre-server-persistence localStorage cache so
    // users upgrading from the localStorage era don't have a parallel set
    // of picks lingering on disk.
    try { localStorage.removeItem(LS_LEGACY_THISWEEK_BASKETS); } catch { /* ignore */ }
  }

  /** Reads UserSettings via SettingsService, intersects each pick with the
   *  user's allowed-foods cache, builds the four baskets, and stamps each
   *  basket entry with `pickAddedAt` / `pickServingSize` so the round-trip
   *  back to the server preserves order and per-basket overrides. Picks that
   *  reference foods the user has since un-favorited are silently dropped
   *  (warn-logged) AND a cleaned list is saved back so the dead reference
   *  doesn't keep showing up on every login.
   *
   *  Safety guard against the slow-network partial-load failure mode: if we
   *  had picks but matched ZERO of them, that's a strong signal the
   *  allowed-foods cache didn't finish loading in our polling window. We do
   *  NOT save the empty list back in that case — leaving the server-side
   *  picks intact and the retry loop will hydrate cleanly later. */
  private async hydratePicksFromServer(): Promise<void> {
    try {
      // Prefer the already-loaded settings signal if app startup populated it;
      // otherwise round-trip. Avoids a redundant GET every time the user
      // switches into the Foods tab.
      const all = this.settingsService.allSettings()
        ?? await this.settingsService.loadSettings();
      const picks = all.currentPicks ?? [];
      // Wait for the allowed-foods cache to be populated. We need its full
      // Food blobs to rebuild the basket entries; refreshServerMyFoods runs
      // concurrent to this method, so retry briefly before giving up.
      let allowed = this.serverMyFoods();
      for (let attempt = 0; attempt < 20 && allowed.length === 0 && picks.length > 0; attempt++) {
        await new Promise<void>(r => setTimeout(r, 100));
        allowed = this.serverMyFoods();
      }
      // Shared hydration (also used by the menus food-lookaside): map picks to
      // per-basket Food objects. `dropped` = picks whose food is no longer in
      // the allowed set (stale, un-favorited).
      const { baskets, kept, dropped } = hydratePicks(picks, allowed);
      for (const p of dropped) {
        console.warn('[FoodsPanel] dropping stale pick — food no longer in MyFoods', p);
      }
      this.thisWeekBaskets.set(baskets);
      // Save-back guard. Only push the cleaned list when at least one pick
      // matched. "Had picks but matched zero" is the partial-load signature
      // — saving in that case would silently destroy server-side data.
      if (dropped.length > 0 && kept.length > 0) {
        void this.settingsService.saveCurrentPicks(kept).catch(err => {
          console.warn('[FoodsPanel] failed to save cleaned pick list', err);
        });
        this.hydrationSucceeded.set(true);
      } else if (dropped.length > 0 && kept.length === 0 && picks.length > 0) {
        // Partial-load signature — leave server alone. Leave hydration flag
        // FALSE so any user interaction is gated out (no risk of wiping the
        // real server data with empty baskets). User must refresh to retry.
        console.warn(
          `[FoodsPanel] hydration matched 0 of ${picks.length} picks — ` +
          `assuming partial allowed-foods load, NOT saving back. Refresh to retry.`,
        );
        this.notificationService.show('Couldn\'t load your picks. Refresh to retry.', 'error', 4000);
      } else {
        this.hydrationSucceeded.set(true);
      }
    } catch (err) {
      console.error('[FoodsPanel] hydratePicksFromServer failed', err);
      this.notificationService.show('Server unavailable. Try again later.', 'error', 4000);
      // CRITICAL: do NOT flip hydrationSucceeded on error. Writes stay
      // gated so a transient outage cannot wipe server-side picks.
    }
  }

  /** Serialize the four baskets to the CurrentPicks wire shape. addedAt
   *  defaults to NOW for entries that lack pickAddedAt (newly dropped foods
   *  that haven't been round-tripped yet). pickServingSize honors the
   *  basket-local override; null = no override (follow MyFoods baseline). */
  private picksFromBaskets(): CurrentPick[] {
    const out: CurrentPick[] = [];
    const baskets = this.thisWeekBaskets();
    const now = new Date().toISOString();
    for (const k of BASKET_KEYS) {
      for (const f of baskets[k]) {
        out.push({
          foodId: f.id,
          foodSource: (f.foodSource as 'food' | 'userfood') ?? 'food',
          basketKey: k,
          pickServingSize: f.pickServingSize ?? null,
          mealRole: f.mealRole ?? 'AnyUse',
          addedAt: f.pickAddedAt ?? now,
        });
      }
    }
    return out;
  }

  /** Write-through save — every basket mutation fires the PUT immediately.
   *  No debounce, no retry, no batching. Gated on hydrationSucceeded so a
   *  failed init GET can never wipe server-side picks. On failure: log,
   *  toast, move on. The next user mutation will fire another PUT with the
   *  latest state.
   *  Policy: see CLAUDE.md > Optimizations — no client-side caching or
   *  request coalescing in new code. */
  private async savePicks(): Promise<void> {
    if (!this.hydrationSucceeded()) return;
    try {
      await this.settingsService.saveCurrentPicks(this.picksFromBaskets());
    } catch (err) {
      console.error('[FoodsPanel] failed to save currentPicks', err);
      this.notificationService.show('Server unavailable. Try again later.', 'error', 4000);
    }
  }

  private async refreshServerMyFoods(): Promise<void> {
    try {
      const server = await firstValueFrom(this.preferencesService.getAllowedFoodsFull());
      this.serverMyFoods.set(server);
    } catch {
      // Service unavailable — leave the cache as-is so local-only still works.
    }
  }

  protected tabService = inject(TabService);
  protected preferencesService = inject(FoodPreferencesService);

  /** Curate Wizard swipe-deck bloom. */
  readonly wizardOpen = signal(false);
  /** On close, reload MyFoods so newly-favorited foods appear immediately. */
  async onWizardClose(): Promise<void> {
    this.wizardOpen.set(false);
    await this.refreshServerMyFoods();
  }
  private notificationService = inject(NotificationService);
  private userFoodService = inject(UserFoodService);
  protected foodsService = inject(FoodsService);
  private langfusePromptService = inject(LangfusePromptService);
  private settingsService = inject(SettingsService);

  // Spin carousel state
  readonly carouselCategories = CAROUSEL_CATEGORIES;
  readonly filterGroups = FILTER_GROUPS;
  // Default TYPE for the Refine Foods pane = MyFoods, since that's the
  // primary list users come here to curate.
  spinSource = signal<SpinSource>('myfoods');
  // Curated lists fetched from GET /api/lists. Populated once on construction
  // and rendered below the MyFoods / Restricted entries in the Food List
  // dropdown. Empty array if the endpoint fails — the special sources still
  // work, you just won't see the curated catalog.
  availableLists = signal<FoodList[]>([]);
  selectedCategories = signal<Set<string>>(new Set());
  private rawCarouselFoods = signal<Food[]>([]);

  // Display label for the current TYPE. For the two preference-driven sources
  // we use the TYPE_LABELS map; for everything else (curated lists) we look
  // the handle up in availableLists() and return its description.
  typeLabel = computed<string>(() => {
    const src = this.spinSource();
    if (TYPE_LABELS[src]) return TYPE_LABELS[src];
    return this.availableLists().find(l => l.name === src)?.description ?? src;
  });

  // Curated-list order for the LIST dropdown: Regi Approved first (default +
  // top), then GLP-1 Friendly, then any others.
  readonly orderedLists = computed<FoodList[]>(() => {
    const rank = (l: FoodList): number => {
      const d = (l.description || '').toLowerCase();
      if (/regi|approved/.test(d)) return 0;
      if (/glp/.test(d)) return 1;
      return 2;
    };
    return [...this.availableLists()].sort((a, b) => rank(a) - rank(b));
  });

  // Count shown next to the right-pane section title. Honors the picker
  // search box so the number matches what's actually rendered — for MyFoods
  // we count the type-ahead-filtered subset of allMyFoods, and for
  // YEH/Restricted we use carouselFoods (which is already filtered).
  bottomListLength = computed<number>(() => {
    if (this.spinSource() === 'myfoods') {
      const q = this.pickerSearchQuery().trim();
      if (!q) return this.allMyFoods().length;
      return this.allMyFoods().filter(f => this.matchesPickerSearch(f)).length;
    }
    return this.carouselFoods().length;
  });

  // Heading shown in the bottom-pane title strip when the slider is on the
  // right side. Adds "Foods" unless the label already ends in "Foods" (avoids
  // the double "MyFoods Foods" trap).
  collectionHeading = computed<string>(() => {
    const src = this.spinSource();
    if (src === 'restricted') return 'Restricted Foods';
    const label = this.typeLabel();
    return label.toLowerCase().endsWith('foods') ? label : `${label} Foods`;
  });

  // Hint label shown above the action-icon column at the right edge of each
  // row. MyFoods rows also have a delete column; curated lists do not, so
  // the heading shrinks to "Fave / Restrict" when delete isn't applicable.
  columnHeaderText = computed<string>(() => 'LIKE / BAN');

  // Search: filters the carousel locally (no API round-trip per keystroke)
  searchQuery = signal('');

  // Independent type-ahead for the Food Picker (RHS). Driven by the SEARCH
  // input that lives in the right pane above the accordion. Stays in its
  // own signal so toggling Curate on/off doesn't entangle with the LHS
  // carousel search.
  pickerSearchQuery = signal('');

  onPickerSearchInput(value: string): void {
    this.pickerSearchQuery.set(value);
  }

  /** Edit MyFoods toggle. Clears the picker search bar every time we *enter*
   *  Edit mode so the user isn't squinting at a list filtered by a query
   *  they left in there from the last session.  */
  /** Open the Edit MyFoods library overlay (its own header icon). The overlay is
   *  a position:fixed popover hosted inside the Focus Foods right pane, so ensure
   *  that pane is rendered (focusEditOpen) before showing it. */
  openEditOverlay(): void {
    this.pickerSearchQuery.set('');
    this.focusEditOpen.set(true);
    this.addTo.set('right');
  }

  /** Close the Edit overlay back to the default full-width MyFoods view (Focus
   *  Foods stays parked — un-render its host pane). */
  closeEditOverlay(): void {
    this.addTo.set('left');
    this.focusEditOpen.set(false);
  }

  /** Substring match against description + shortDescription, case-insensitive.
   *  Used by both grouped accordions on the RHS. */
  private matchesPickerSearch(food: Food): boolean {
    const q = this.pickerSearchQuery().trim().toLowerCase();
    if (!q) return true;
    return food.description.toLowerCase().includes(q)
      || (food.shortDescription?.toLowerCase().includes(q) ?? false);
  }

  // RHS Food Picker list. NOT filtered by the LHS carousel SEARCH box. It IS
  // filtered by the picker's own search (above the accordion) when typed.
  // Sorted alphabetically by the same label the UI shows, matching the
  // MyFoods source — so curated lists (Regi Approved, GLP-1, …) and the
  // Restricted list both read in alpha order regardless of API insertion
  // order, and the order is stable across favorite/restrict toggles.
  carouselFoods = computed<Food[]>(() => {
    const raw = this.rawCarouselFoods();
    const q = this.pickerSearchQuery().trim().toLowerCase();
    const filtered = q
      ? raw.filter(f =>
          f.description.toLowerCase().includes(q)
          || (f.shortDescription?.toLowerCase().includes(q) ?? false),
        )
      : raw;
    return [...filtered].sort((a, b) => {
      const aName = (a.shortDescription || a.description || '').toLowerCase();
      const bName = (b.shortDescription || b.description || '').toLowerCase();
      return aName.localeCompare(bName);
    });
  });

  // Carousel destination + local lists (persisted to localStorage).
  // 'left' = Baskets (the home view, always default), 'right' = Curate
  // overlay. The user lands on Baskets and toggles Curate when they want
  // to curate their MyFoods.
  addTo = signal<'left' | 'right'>('left');
  myFoodsLocal = signal<Food[]>(this.loadLocal(LS_MYFOODS));

  // Four-basket This Week store (Proteins/Fats/Carbs/Other). Server-backed
  // via UserSettings.CurrentPicks — starts empty, hydrated by
  // hydratePicksFromServer() in the constructor once allowed-foods finish
  // loading. Each mutation triggers the debounced save effect below.
  //
  // Multi-tab note: this component uses last-write-wins for currentPicks.
  // Editing baskets in two tabs concurrently will let the later PUT clobber
  // the earlier tab's additions. Documented limitation — fix would require
  // ETag/If-Match on the API or BroadcastChannel cross-tab notification.
  //
  // Tab-switch note: Angular re-instantiates this component on tab switch,
  // so the constructor and hydration run again. Cache-first via
  // SettingsService.allSettings() keeps it cheap; user may see a sub-100ms
  // empty-basket flash before re-population.
  readonly basketKeys = BASKET_KEYS;
  thisWeekBaskets = signal<ThisWeekBaskets>(emptyBaskets());

  /** Only flips to true on a CONFIRMED-SUCCESSFUL hydration GET. Gates every
   *  write path — `persistThisWeek` effect bails when this is false, so a
   *  failed hydration cannot trigger a save of empty baskets that would
   *  overwrite the user's good server-side state. This is a data-integrity
   *  guard, not an optimization; do not remove without replacing.
   *  (See CLAUDE.md > Optimizations.) */
  private hydrationSucceeded = signal<boolean>(false);

  // Convenience: total foods across all four baskets.
  thisWeekTotal = computed<number>(() => {
    const b = this.thisWeekBaskets();
    return b.Proteins.length + b.Fats.length + b.Carbs.length + b.Other.length;
  });

  // Drag-over basket key (for visual highlight on the drop target)
  dragOverBasket = signal<BasketKey | null>(null);

  // Tracks a basket tile being dragged so dragend can detect a canceled drop
  // (released outside any droppable area) and remove the food — a second-way
  // delete that mirrors the explicit ✕ button.
  private draggingBasketSource = signal<{ key: BasketKey; foodId: number } | null>(null);

  // Which basket (if any) is in "expanded" focus mode. When set, that basket
  // takes the full basket-grid area; the others collapse out of view. Green
  // traffic-light sets it; yellow restores to null (all four visible 2 × 2).
  focusedBasket = signal<BasketKey | null>(null);

  // Health Benefits overlay is shown only when the active filter is a category
  // where macro-grade health claims are meaningful: Proteins, Fats, Dairy,
  // Vegetables, Carbohydrates, Fruits. Hidden when nothing is pressed (the
  // "all" view doesn't have a single category to make claims about) and
  // hidden when Processed or Condiment is pressed (those are accent foods, no
  // health-benefit pitch).
  showHealthBenefitsForFilter = computed<boolean>(() => {
    const cats = this.selectedCategories();
    if (cats.size === 0) return false;
    if (cats.has('Processed') || cats.has('Condiment')) return false;
    return true;
  });

  // Tracks whether the most recent load failed (e.g., expired token / 401)
  // so we can surface a more useful empty-state than "no items".
  private loadFailed = signal(false);

  carouselEmptyMessage = computed<string>(() => {
    if (this.loadFailed()) return 'Couldn\'t load foods — your session may have expired. Try refreshing.';
    const cats = this.selectedCategories();
    if (cats.size === 0 || cats.size === CAROUSEL_CATEGORIES.length) {
      return 'No foods to spin yet.';
    }
    const group = FILTER_GROUPS.find(g => this.isFilterGroupActive(g));
    const label = group ? group.label : this.categoryLabel([...cats][0]);
    return `No ${label} in this list.`;
  });

  // Server-side MyFoods cache (the user's existing allowed foods from
  // FoodPreferencesService). Loaded eagerly on construction and refreshed
  // whenever the carousel pulls them, so the bottom MyFoods list reflects the
  // same set the carousel does when TYPE=MyFoods.
  private serverMyFoods = signal<Food[]>([]);

  // All MyFoods = local picks + unique server favorites, then filtered against
  // the user's CURRENT allowed/favorited set. Reading
  // preferencesService.allowedFoods() registers a reactive dependency on the
  // service's localAllowedFoods signal, so unfavoriting a food on the RHS
  // (which mutates that signal synchronously) immediately drops it from the
  // LHS tile grid — no need to wait for the 500 ms autosave + server refresh
  // round-trip to complete. Local takes precedence on dedupe so any edits on
  // the local copy aren't overwritten by a server entry.
  allMyFoods = computed<Food[]>(() => {
    const local = this.myFoodsLocal();
    const server = this.serverMyFoods();
    const allowed = this.preferencesService.allowedFoods();
    const seenIds = new Set(local.map(f => f.id));
    return [...local, ...server.filter(f => !seenIds.has(f.id))]
      .filter(f => allowed.has(f.id))
      // Alphabetical by the same label the UI shows (shortDescription, falling
      // back to description). Case-insensitive, locale-aware. Sorted at the
      // source so every downstream view — the LHS tile grid, the RHS
      // groupedMyFoods accordion, every category filter — is alphabetical
      // without each consumer re-sorting. Add/remove still land in their
      // alphabetical slot instead of "wherever the user toggled them."
      .sort((a, b) => {
        const aName = (a.shortDescription || a.description || '').toLowerCase();
        const bName = (b.shortDescription || b.description || '').toLowerCase();
        return aName.localeCompare(bName);
      });
  });

  // MyFoods display follows the same category Filters as the carousel.
  // (Header count uses allMyFoods().length — the unfiltered total.)
  filteredMyFoods = computed<Food[]>(() => {
    const all = this.allMyFoods();
    const cats = this.selectedCategories();
    if (cats.size === 0 || cats.size === CAROUSEL_CATEGORIES.length) return all;
    return all.filter(f => cats.has(f.categoryName ?? ''));
  });

  // Group ALL MyFoods (not filteredMyFoods) by category for the accordion
  // view on the right pane. The category radio filter at the top only applies
  // to the carousel — the right-hand list keeps every food visible behind
  // collapsible category dividers, which already give the user navigation by
  // category without needing the filter to gate the list.
  // Default: every category collapsed. The user expands what they want via
  // the per-row header arrow or the "+" all-expand control in the type-row.
  collapsedMyFoodsCategories = signal<Set<string>>(new Set(CAROUSEL_CATEGORIES));

  groupedMyFoods = computed<Array<{ category: string; foods: Food[]; collapsed: boolean }>>(() => {
    const all = this.allMyFoods();
    const collapsed = this.collapsedMyFoodsCategories();
    // While a search is active, force every category open so matches show live.
    const searching = this.pickerSearchQuery().trim() !== '';
    const map = new Map<string, Food[]>();
    for (const food of all) {
      // Pre-filter by the picker's type-ahead so the accordion narrows live.
      if (!this.matchesPickerSearch(food)) continue;
      const cat = food.categoryName || 'Uncategorized';
      const arr = map.get(cat);
      if (arr) arr.push(food);
      else map.set(cat, [food]);
    }
    const result: Array<{ category: string; foods: Food[]; collapsed: boolean }> = [];
    for (const cat of CAROUSEL_CATEGORIES) {
      const foods = map.get(cat);
      if (foods && foods.length > 0) {
        result.push({ category: cat, foods, collapsed: searching ? false : collapsed.has(cat) });
        map.delete(cat);
      }
    }
    for (const [cat, foods] of map.entries()) {
      result.push({ category: cat, foods, collapsed: searching ? false : collapsed.has(cat) });
    }
    return result;
  });

  toggleMyFoodsCategory(cat: string): void {
    this.collapsedMyFoodsCategories.update(set => {
      const next = new Set(set);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // Group carouselFoods by category for the YEH-Approved / Restricted
  // accordion view. Includes per-category collapse state, mirroring the
  // MyFoods accordion. Order follows CAROUSEL_CATEGORIES; anything
  // uncategorized is appended at the end.
  // Default: every category collapsed. Mirrors the MyFoods accordion default.
  collapsedCarouselCategories = signal<Set<string>>(new Set(CAROUSEL_CATEGORIES));

  groupedCarouselFoods = computed<Array<{ category: string; foods: Food[]; collapsed: boolean }>>(() => {
    const all = this.carouselFoods();
    const collapsed = this.collapsedCarouselCategories();
    // While a search is active, force every category open so matches show live.
    const searching = this.pickerSearchQuery().trim() !== '';
    const map = new Map<string, Food[]>();
    for (const food of all) {
      const cat = food.categoryName || 'Uncategorized';
      const arr = map.get(cat);
      if (arr) arr.push(food);
      else map.set(cat, [food]);
    }
    const result: Array<{ category: string; foods: Food[]; collapsed: boolean }> = [];
    for (const cat of CAROUSEL_CATEGORIES) {
      const foods = map.get(cat);
      if (foods && foods.length > 0) {
        result.push({ category: cat, foods, collapsed: searching ? false : collapsed.has(cat) });
        map.delete(cat);
      }
    }
    for (const [cat, foods] of map.entries()) {
      result.push({ category: cat, foods, collapsed: searching ? false : collapsed.has(cat) });
    }
    return result;
  });

  toggleCarouselCategory(cat: string): void {
    this.collapsedCarouselCategories.update(set => {
      const next = new Set(set);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  /** True when every CAROUSEL_CATEGORY is in the collapsed set for the
   *  currently-active TYPE — drives the pressed-look on the "−" button so
   *  the user can see at a glance which fold-state they're in. */
  allCategoriesCollapsed = computed<boolean>(() => {
    const set = this.spinSource() === 'myfoods'
      ? this.collapsedMyFoodsCategories()
      : this.collapsedCarouselCategories();
    return CAROUSEL_CATEGORIES.every(c => set.has(c));
  });

  /** Collapse every category in the currently-active TYPE accordion. */
  collapseAllCategories(): void {
    const allCollapsed = new Set<string>(CAROUSEL_CATEGORIES);
    if (this.spinSource() === 'myfoods') {
      this.collapsedMyFoodsCategories.set(allCollapsed);
    } else {
      this.collapsedCarouselCategories.set(allCollapsed);
    }
  }

  /** Expand every category in the currently-active TYPE accordion. */
  expandAllCategories(): void {
    const empty = new Set<string>();
    if (this.spinSource() === 'myfoods') {
      this.collapsedMyFoodsCategories.set(empty);
    } else {
      this.collapsedCarouselCategories.set(empty);
    }
  }

  /** Food List dropdown change handler. Picking a new list opens that list's
   *  accordion fully expanded so the user sees every category right away. */
  /** Add food (+): flip the list to MyFoods, then open the shared Add-Food
   *  dialog (the same panel the binder's "+" opens). Search a food, ratify its
   *  serving/units + photo, and it lands in MyFoods. */
  readonly addFoodPanelOpen = signal(false);
  onAddFood(): void {
    this.onSpinSourceChange('myfoods');
    this.addFoodPanelOpen.set(true);
  }
  /** The Add-Food dialog added/changed a food — reload MyFoods so it appears. */
  async onAddFoodAdded(): Promise<void> {
    await this.refreshServerMyFoods();
  }

  onSpinSourceChange(value: SpinSource): void {
    this.spinSource.set(value);
    // Clear the search so the previous list's type-ahead doesn't silently
    // keep auto-filtering (and auto-expanding) the new list.
    this.pickerSearchQuery.set('');
    // Expand against the NEW value, not the prior one — clear both sets so
    // whichever accordion renders is wide open.
    const empty = new Set<string>();
    this.collapsedMyFoodsCategories.set(empty);
    this.collapsedCarouselCategories.set(empty);
  }

  // Scroll target for the bottom list (used after add to bring new/moved row into view)
  private bottomListRef = viewChild<ElementRef<HTMLElement>>('bottomList');
  // Used during vertical-splitter drag to measure the main-area width so
  // pixel deltas can be converted to fraction-of-pane.
  private vSplitterRef = viewChild<ElementRef<HTMLElement>>('vSplitter');

  // Vertical splitter — left pane width as a fraction of the main-area width
  // (0.1 … 0.9). Defaults to 0.5 so the panes start equally sized.
  leftPaneWidthFraction = signal(0.5);
  rightPaneFlex = computed(() => 1 - this.leftPaneWidthFraction());

  /** Focus Foods edit mode. Default OFF: MyFoods fills the panel and the Focus
   *  Foods pane + splitter are parked. The MyFoods-header pencil toggles it back
   *  to the 50/50 split. See the FOCUS-FOODS marker in the template. */
  readonly focusEditOpen = signal(false);
  /** LHS flex: full width by default; the draggable split fraction while editing
   *  (MyFoods stays on the left, the editor takes the RHS). */
  readonly leftPaneFlex = computed(() =>
    this.focusEditOpen() ? this.leftPaneWidthFraction() : 1,
  );

  /** Edit button toggle: open the editor split, or close it. */
  toggleEdit(): void {
    if (this.focusEditOpen()) this.closeEditOverlay();
    else this.openEditOverlay();
  }
  private splitterStartX = 0;
  private splitterStartFraction = 0;

  categoryLabel(cat: string): string {
    return CATEGORY_PLURALS[cat] ?? cat;
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
  }

  // Auto-load whenever source, filter, OR the merged MyFoods set changes (so
  // adding/removing local picks or refreshing the server cache reloads the
  // carousel when TYPE=MyFoods).
  private autoLoadCarousel = effect(() => {
    const source = this.spinSource();
    const cats = this.selectedCategories();
    this.allMyFoods(); // ensure local + server changes trigger a reload
    this.loadCarouselFoods(source, cats);
  });

  // Persist lists whenever they change
  private persistMyFoods = effect(() => {
    this.saveLocal(LS_MYFOODS, this.myFoodsLocal());
  });
  /** Write-through to the server on every basket mutation. The
   *  hydrationSucceeded gate prevents the initial empty-baskets state
   *  (before the GET resolves) from being PUT back as authoritative. */
  private persistThisWeek = effect(() => {
    this.thisWeekBaskets(); // read for dependency tracking
    if (!this.hydrationSucceeded()) return;
    void this.savePicks();
  });

  // ----- image-carousel: SpinnerItem mapping + outputs -----

  // The carousel ALWAYS spins MyFoods (regardless of TYPE). TYPE only drives
  // which collection the right-hand Curate view is editing. This is filtered
  // by the active category radio + search box, same as before.
  carouselSpinnerFoods = computed<Food[]>(() => {
    const filtered = this.filteredMyFoods();
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(f =>
      f.description.toLowerCase().includes(q) ||
      (f.shortDescription?.toLowerCase().includes(q) ?? false),
    );
  });

  // ----- Tile-grid selection / interaction -----

  /** The currently-selected tile in the left-pane tile grid. Yellow halo
   *  on the tile in the template; the Nutrition Facts and Health Info
   *  buttons in the top bar act on this food. */
  selectedFood = signal<Food | null>(null);

  /** Single-click selection for the RHS "Edit MyFoods" list rows. Drives the
   *  row highlight, the centered Health Info overlay, and the top-bar
   *  edit-pencil / delete-trash (grey → green/red when a row is selected). */
  selectedMyFood = signal<Food | null>(null);

  private myFoodClickTimer: ReturnType<typeof setTimeout> | null = null;

  /** Single vs double click on an Edit-MyFoods row. A lone click (after a short
   *  window) toggles selection — revealing the edit/delete actions + Health
   *  Info badge. A fast second click is a DOUBLE-click: it opens the NF editor
   *  directly and does NOT select (no actions/badge flash). */
  onMyFoodRowClick(food: Food): void {
    if (this.myFoodClickTimer) {
      clearTimeout(this.myFoodClickTimer);
      this.myFoodClickTimer = null;
      this.selectedMyFood.set(null); // double-click never leaves it selected
      this.onEditMyFoodsRowDblClick(food);
      return;
    }
    this.myFoodClickTimer = setTimeout(() => {
      this.myFoodClickTimer = null;
      this.selectedMyFood.update((cur) => (cur?.id === food.id ? null : food));
    }, 220);
  }

  /** Green pencil — edit the selected MyFood's Nutrition Facts. */
  onSelectedMyFoodEdit(): void {
    const food = this.selectedMyFood();
    if (food) this.openNfPopupForFood(food, 'edit', 'myfoods');
  }

  /** Red trash (top bar) — delete the selected MyFood (user-added only). */
  onSelectedMyFoodDelete(event: Event): void {
    const food = this.selectedMyFood();
    if (!food || !this.isUserAddedFood(food)) return;
    void this.deleteUserFood(event, food);
    this.selectedMyFood.set(null);
  }

  /** Carousel trashcan — pare the highlighted food out of MyFoods. A brought-in
   *  (user-added) food is PERMANENTLY deleted after a confirm (deleteUserFood);
   *  a system food is simply un-favorited (removed from the MyFoods allowed list). */
  removeSelectedFromMyFoods(event: Event): void {
    const food = this.selectedFood();
    if (!food) return;
    if (this.isUserAddedFood(food)) {
      void this.deleteUserFood(event, food).then(() => this.selectedFood.set(null));
      return;
    }
    if (this.preferencesService.isAllowed(food.id)) {
      this.toggleFavorite(event, food); // currently allowed → toggles OFF (removes)
    }
    this.selectedFood.set(null);
  }

  /** Single-click on a LHS food tile = "Pick this" → drops it straight into
   *  the appropriate basket. Idempotent: clicking a food that's already in
   *  its basket is a silent no-op (addFoodToBasket dedupes by id), so a
   *  trailing double-click won't add the same food twice.
   *
   *  While the Edit overlay is open the Focus Foods baskets are hidden, so a
   *  carousel click is view/select-only: it must NOT flip out of edit and must
   *  NOT silently drop the food into a covered basket. The user picks foods
   *  only from the default (non-edit) view. */
  /** Image source for a food tile/row: prefer the small thumbnail, but fall
   *  back to the full image when the thumbnail is missing. FoodImage and
   *  FoodImageThumbnail are independent nullable columns server-side, so some
   *  foods carry a picture with no generated thumbnail — without this fallback
   *  those tiles render blank even though an image exists. */
  protected foodThumb(food: Food): string | null | undefined {
    return food.foodImageThumbnail || food.foodImage;
  }

  private myFoodTileClickTimer: ReturnType<typeof setTimeout> | null = null;

  /** Single vs double click on a My Foods tile. A lone click (after a short
   *  window) TOGGLES selection — a 2nd click on the SAME tile deselects — and, on
   *  select, drops the food into its basket (unless we're in select-only mode). A
   *  fast second click is a DOUBLE-click: it opens the Nutrition Facts editor and
   *  never leaves the tile selected. */
  onTileClick(food: Food): void {
    if (this.myFoodTileClickTimer) {
      clearTimeout(this.myFoodTileClickTimer);
      this.myFoodTileClickTimer = null;
      this.selectedFood.set(null); // a double-click never leaves it selected
      this.onTileDblClick(food);
      return;
    }
    this.myFoodTileClickTimer = setTimeout(() => {
      this.myFoodTileClickTimer = null;
      const wasSelected = this.selectedFood()?.id === food.id;
      this.selectedFood.set(wasSelected ? null : food);
      if (wasSelected) return; // 2nd click on the same tile = deselect only
      if (this.addTo() === 'right') return;
      const basket = this.basketForFood(food);
      this.addFoodToBasket(food, basket);
    }, 220);
  }

  /** Pencil (top bar) — open the Nutrition Facts editor for the highlighted food. */
  onSelectedTileEdit(): void {
    const food = this.selectedFood();
    if (food) this.openNfPopupForFood(food, 'edit', 'myfoods');
  }

  /** Double-click on a LHS tile is now a no-op for NF popups — edits live
   *  under the Edit MyFoods flow only. The first click of the double-click
   *  already added to the basket; addFoodToBasket's dedupe makes the second
   *  click a silent no-op, so this method intentionally does nothing.
   *  Kept as an explicit handler so future intent (e.g. confirmation flash)
   *  has an obvious home. */
  /** Double-click a My Food → the Nutrition Facts editor: edit the serving size /
   *  units to SCALE the values (the other facts stay read-only), saved as the
   *  food's baseline in MyFoods. Same editor the pencil + RHS list use. */
  onTileDblClick(food: Food): void {
    this.openNfPopupForFood(food, 'edit', 'myfoods');
  }

  /** Double-click on a row in the Edit MyFoods accordion → open the NF
   *  popup in EDIT mode. This is the only path that hands the user the
   *  steppers + Green Save button. */
  onEditMyFoodsRowDblClick(food: Food): void {
    this.openNfPopupForFood(food, 'edit', 'myfoods');
  }

  // ----- Press-and-hold zoom on Edit MyFoods row thumbnail ----------------
  // Single press + hold (≥ 450 ms) on the food picture pops a full-image
  // overlay so the user can see the food clearly. Release the hold (mouseup,
  // mouseleave, touchend, touchcancel) to dismiss.
  zoomImageUrl = signal<string | null>(null);
  private thumbHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly THUMB_HOLD_DELAY_MS = 450;

  onThumbHoldStart(event: Event, food: Food): void {
    // Image-only zoom — bail if the food has no full-size image to show.
    const url = food.foodImage || food.foodImageThumbnail;
    if (!url) return;
    // Prevent text selection / image-drag during the hold gesture.
    event.preventDefault();
    this.cancelThumbHold();
    this.thumbHoldTimer = setTimeout(() => {
      this.thumbHoldTimer = null;
      this.zoomImageUrl.set(url);
    }, FoodsPanelComponent.THUMB_HOLD_DELAY_MS);
  }

  onThumbHoldEnd(): void {
    this.cancelThumbHold();
    this.zoomImageUrl.set(null);
  }

  private cancelThumbHold(): void {
    if (this.thumbHoldTimer) {
      clearTimeout(this.thumbHoldTimer);
      this.thumbHoldTimer = null;
    }
  }

  /** Drag-and-drop preserves the existing transfer shape — a JSON-encoded
   *  Food blob on application/json — so the basket drop handlers don't
   *  need to change. */
  onTileDragStart(food: Food, event: DragEvent): void {
    event.dataTransfer?.setData('application/json', JSON.stringify(food));
    event.dataTransfer!.effectAllowed = 'copy';
  }

  /** Where the open Nf popup was opened FROM. Drives Save routing: a
   *  `'myfoods'`-origin save writes to UserFoodPreferences (the MyFoods
   *  baseline); a `'picks'`-origin save writes the per-basket pickServingSize
   *  override and (when the draft differs from the baseline) prompts whether
   *  to also update the MyFoods default. */
  nfPopupOrigin = signal<'myfoods' | 'picks' | null>(null);

  /** Open the NF popup for a food and prime the adjustable-serving state.
   *  Initial serving size for a Picks-origin popup starts at the pick's own
   *  override (`pickServingSize`) when present, then falls through to the
   *  user's saved MyFoods override (`userServingSize`), then to the food's
   *  curated `servingSize` baseline, then 1. For a MyFoods-origin popup the
   *  pickServingSize branch is skipped (the popup is editing the baseline,
   *  not a pick). */
  private openNfPopupForFood(food: Food, mode: 'view' | 'edit' = 'view', origin: 'myfoods' | 'picks' | null = null): void {
    let initial: number;
    if (origin === 'picks' && food.pickServingSize != null) {
      initial = food.pickServingSize;
    } else {
      initial = this.preferencesService.userServingSize(food.id)
        ?? food.servingSize
        ?? 1;
    }
    this.nfPopupServingSize.set(initial);
    this.nfPopupOriginalServingSize.set(initial);
    this.nfPopupMode.set(mode);
    this.nfPopupOrigin.set(origin);
    this.nfPopupFood.set(food);

    // Edit mode: seed the dropdown from the food's actual category name (the
    // same value the accordion groups it under) and load the options list.
    const cur = (food.categoryName ?? '').trim();
    this.nfPopupCategory.set(cur);
    this.nfPopupOriginalCategory.set(cur);
    if (mode === 'edit') {
      void this.foodsService.loadCategories();
    }
  }

  /** Category dropdown change (edit mode) — draft only. Persisted on the green
   *  Save disc (onNfSave), so it appears only when something actually changed. */
  onNfCategoryChange(name: string): void {
    if (!name) return;
    this.nfPopupCategory.set(name);
  }

  /** Update a food's category in the local MyFoods caches (local + server) so
   *  the accordion regroups it live, and expand the destination category so the
   *  moved food is visible without a page refresh. */
  private applyLocalCategory(foodId: number, categoryId: number, categoryName: string): void {
    const patch = (f: Food): Food =>
      f.id === foodId ? { ...f, categoryId, categoryName } : f;
    this.myFoodsLocal.update((list) => list.map(patch));
    this.serverMyFoods.update((list) => list.map(patch));
    this.collapsedMyFoodsCategories.update((set) => {
      const next = new Set(set);
      next.delete(categoryName);
      return next;
    });
  }

  /** Close handler for the NF popup. Always reverts the draft to the
   *  original value so that a draft change in edit mode that wasn't saved
   *  doesn't bleed back into the cached value next time the popup opens. */
  onNfPopupClose(): void {
    this.nfPopupServingSize.set(this.nfPopupOriginalServingSize());
    this.nfPopupMode.set('view');
    this.nfPopupOrigin.set(null);
    this.nfPopupFood.set(null);
  }

  /** Green Save button handler. Routes by the popup's origin:
   *
   *  - `myfoods` (Edit MyFoods row dbl-click) → writes to UserFoodPreferences,
   *    same as it always has. food.foodSource is passed so the preference row
   *    gets the correct discriminator (was missing — created duplicate rows
   *    with FoodSource='food' for UserFoods).
   *
   *  - `picks` (basket dbl-click) → writes pickServingSize to the basket
   *    entry. If the draft differs from the MyFoods baseline, also prompts
   *    whether to make the MyFoods default match. If the draft matches the
   *    baseline, the override is cleared (pickServingSize=null) and no
   *    prompt — there's nothing meaningful to override.
   *
   *  Disabled in the template via [disabled]="!nfPopupCanSave()" so this
   *  shouldn't fire when there's nothing to save. */
  onNfSave(): void {
    const food = this.nfPopupFood();
    if (!food || !this.nfPopupCanSave()) return;
    const draft = this.nfPopupServingSize();
    const origin = this.nfPopupOrigin();

    // Persist a category change (userfoods only) via the category-only PATCH.
    const newCat = this.nfPopupCategory().trim();
    if (newCat && newCat.toLowerCase() !== this.nfPopupOriginalCategory().trim().toLowerCase()) {
      const cat = this.foodsService.categories().find(
        (c) => c.name.toLowerCase() === newCat.toLowerCase(),
      );
      if (cat && (food.foodSource ?? 'food') === 'userfood' && food.id != null) {
        void this.userFoodService.setUserFoodCategory(food.id, cat.id);
        this.nfPopupFood.update((f) => (f ? { ...f, categoryId: cat.id, categoryName: cat.name } : f));
        // Reflect the move in the local caches so the accordion regroups the
        // food immediately — no page refresh — and expand the destination.
        this.applyLocalCategory(food.id, cat.id, cat.name);
      }
      this.nfPopupOriginalCategory.set(newCat);
    }

    if (origin === 'picks') {
      const baseline = this.preferencesService.userServingSize(food.id)
        ?? food.servingSize
        ?? 1;
      // If the draft matches the baseline, the user has no real override —
      // clear pickServingSize so the basket entry follows the baseline going
      // forward. No prompt — there's nothing to ask about.
      const newOverride = draft === baseline ? null : draft;
      this.setPickServingSize(food, newOverride);
      this.nfPopupOriginalServingSize.set(draft);
      this.nfPopupMode.set('view');
      this.nfPopupOrigin.set(null);
      this.nfPopupFood.set(null);
      if (newOverride !== null) {
        this.baselineDialog.set({ food, draft, unit: food.servingUnit ?? 'unit' });
      }
      return;
    }

    // Default / 'myfoods' origin: write the MyFoods baseline directly.
    this.preferencesService.setUserServingSize(food.id, draft, food.foodSource);
    this.nfPopupOriginalServingSize.set(draft);
    this.nfPopupMode.set('view');
    this.nfPopupOrigin.set(null);
    this.nfPopupFood.set(null);
  }

  /** Mutate the basket-local pickServingSize for the food currently being
   *  edited. Walks all four baskets so the food gets updated wherever it
   *  lives (currently the UI only allows a food in one basket at a time,
   *  but the helper is defensive). The basket-signal write triggers the
   *  debounced server PUT via persistThisWeek. */
  private setPickServingSize(food: Food, override: number | null): void {
    this.thisWeekBaskets.update(b => {
      const next = { ...b } as ThisWeekBaskets;
      for (const k of this.basketKeys) {
        next[k] = b[k].map(f =>
          f.id === food.id && (f.foodSource ?? 'food') === (food.foodSource ?? 'food')
            ? { ...f, pickServingSize: override }
            : f,
        );
      }
      return next;
    });
  }

  /** Adjust handler emitted by the NF label's ▲ / ▼ steppers. Ladder-snap via
   *  the shared SERVING_SIZE_LADDER (models/food-display). No-op if already at
   *  the bound. Updates the DRAFT signal only — Save persists. */
  onNfAdjust(direction: 'up' | 'down'): void {
    if (!this.nfPopupFood() || this.nfPopupMode() !== 'edit') return;
    const next = snapServing(this.nfPopupServingSize(), direction);
    if (next === undefined) return; // already at the top or bottom of the ladder
    this.nfPopupServingSize.set(Number(next.toFixed(4)));
  }

  /** Commit handler emitted by the NF label's typed-input mode. The label
   *  has already validated the value is a positive number; we accept off-
   *  ladder typed values (e.g. 0.4, 1.3) since the ladder is for the
   *  steppers only. Updates the draft only — Save persists. */
  onNfCommit(value: number): void {
    if (!this.nfPopupFood() || this.nfPopupMode() !== 'edit') return;
    this.nfPopupServingSize.set(Number(value.toFixed(4)));
  }

  /** Returns true when the NF popup was opened on a food sitting in one of
   *  the four baskets. Retained for any future basket-aware logic, though
   *  the popup itself is view-only on the basket side now. */
  private isFoodFromBasketContext(food: Food): boolean {
    const baskets = this.thisWeekBaskets();
    for (const key of this.basketKeys) {
      if (baskets[key].some(f => f.id === food.id)) return true;
    }
    return false;
  }

  // ----- RHS basket-tile selection + P/S meal-role designation -----

  /** The currently-selected food in a basket on the right pane (yellow halo). */
  selectedBasketFood = signal<Food | null>(null);

  /** Single-vs-double click discrimination. A tight window catches the expert
   *  double-click (→ Nutrition Facts) vs. a lone select/deselect click. */
  private tileClickTimer: ReturnType<typeof setTimeout> | null = null;

  /** Basket tile click. A fast second click (within the tight window) is a
   *  double-click → Nutrition Facts (edit serving). A lone click just toggles
   *  the tile's selection (yellow halo). Meal-role (Primary/Secondary) is set
   *  by AI later, not by clicking through here. */
  onBasketTileClick(food: Food): void {
    if (this.tileClickTimer) {
      clearTimeout(this.tileClickTimer);
      this.tileClickTimer = null;
      this.selectedBasketFood.set(food);
      this.openNfPopupForFood(food, 'edit', 'picks');
      return;
    }
    this.tileClickTimer = setTimeout(() => {
      this.tileClickTimer = null;
      const selected = this.selectedBasketFood();
      this.selectedBasketFood.set(selected?.id === food.id ? null : food);
    }, 220);
  }

  /** Header pencil — open Nutrition Facts (edit serving) for the selected pick. */
  onHeaderEditSelected(): void {
    const food = this.selectedBasketFood();
    if (!food) return;
    this.openNfPopupForFood(food, 'edit', 'picks');
  }

  /** True when the selected pick lives in the given basket — gates that
   *  basket's P / S / pencil header controls. */
  isSelectedInBasket(key: BasketKey): boolean {
    const sel = this.selectedBasketFood();
    if (!sel) return false;
    return this.thisWeekBaskets()[key].some(
      f => f.id === sel.id && (f.foodSource ?? 'food') === (sel.foodSource ?? 'food'),
    );
  }

  // ----- Basket helpers -----

  /** Coaching text shown inside an empty basket. Embedded `\n` characters
   *  are honored as hard line breaks via `white-space: pre-line` on the
   *  text span, so the longer strings split intentionally at a chosen
   *  point instead of wrapping wherever the basket width happens to land.
   *  The 2-line CSS clamp still applies as a safety net. */
  basketEmptyHint(key: BasketKey): string {
    switch (key) {
      case 'Proteins': return 'Pick 6 or more proteins';
      case 'Fats':     return 'Add fats you use,\nand dairy will go here';
      case 'Carbs':    return 'Try for 8+ vegetables,\nand 2+ fruits';
      case 'Other':    return 'Limit processed foods,\nadd ideas for seasonings';
    }
  }

  /** Display label for a basket title. Fats holds dairy, and Carbs holds
   *  veggies + fruits in addition to grains/starches, so surface that in
   *  the title — keeps users from thinking a 50g carb allowance is a
   *  green-vegetable allowance. */
  basketLabel(key: BasketKey): string {
    switch (key) {
      case 'Fats':  return 'Fats';
      case 'Carbs': return 'Carbs';
      default:      return key;
    }
  }

  private basketForFood(food: Food): BasketKey {
    return CATEGORY_TO_BASKET[food.categoryName ?? ''] ?? 'Other';
  }

  private addFoodToBasket(food: Food, key: BasketKey): void {
    const baskets = this.thisWeekBaskets();
    const exists = baskets[key].some(f => f.id === food.id);
    if (exists) {
      // No-op (silent); user already picked this one for that basket.
      return;
    }
    // Stamp pickAddedAt at the moment the food lands in a basket so the
    // server round-trip and any future cross-device sync preserve the order
    // foods were chosen — bottom-up basket tile stack reads from this.
    const stamped: Food = {
      ...food,
      pickAddedAt: food.pickAddedAt ?? new Date().toISOString(),
      pickServingSize: food.pickServingSize ?? null,
      mealRole: food.mealRole ?? 'AnyUse',
    };
    // Append (oldest first, newest last) — the basket-tiles flex layout uses
    // `wrap-reverse` so the first item lands bottom-left and the stack grows
    // upward as foods are added.
    this.thisWeekBaskets.update(b => ({
      ...b,
      [key]: [...b[key], stamped],
    }));
  }

  private onRightSideAdd(food: Food): void {
    const source = this.spinSource();
    if (source === 'myfoods') {
      this.myFoodsLocal.update(list => {
        const filtered = list.filter(f => f.id !== food.id);
        return [food, ...filtered];
      });
    } else if (source === 'restricted') {
      if (this.preferencesService.isRestricted(food.id)) {
        this.preferencesService.toggleRestrictedLocal(food.id);
      }
      if (!this.preferencesService.isAllowed(food.id)) {
        this.preferencesService.toggleFavoriteLocal(food.id);
      }
      this.refreshServerMyFoods();
      this.notificationService.show(`${food.shortDescription || food.description} → MyFoods`, 'success');
    } else {
      // Curated list (regi-approved, glp-1-friendly, …) — favorite the food
      // into MyFoods, matching the previous YEH-approved behavior.
      if (!this.preferencesService.isAllowed(food.id)) {
        this.preferencesService.toggleFavoriteLocal(food.id);
        this.refreshServerMyFoods();
        this.notificationService.show(`${food.shortDescription || food.description} → MyFoods`, 'success');
      } else {
        this.notificationService.show('Already a MyFood', 'info');
      }
    }
    queueMicrotask(() => {
      this.bottomListRef()?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /** Empty all four Picks baskets at once. Drops the selection and resets to
   *  empty baskets; the persistThisWeek effect saves the cleared state. */
  clearAllPicks(): void {
    this.selectedBasketFood.set(null);
    this.thisWeekBaskets.set(emptyBaskets());
  }

  clearBasket(key: BasketKey): void {
    // Drop the selection if the selected food is about to disappear
    // along with the rest of this basket's contents.
    const selected = this.selectedBasketFood();
    if (selected && this.thisWeekBaskets()[key].some(f => f.id === selected.id)) {
      this.selectedBasketFood.set(null);
    }
    this.thisWeekBaskets.update(b => ({ ...b, [key]: [] }));
  }

  removeFoodFromBasket(key: BasketKey, foodId: number): void {
    // If the selected food is the one being removed, clear the selection
    // so the yellow halo doesn't point at a phantom row.
    if (this.selectedBasketFood()?.id === foodId) {
      this.selectedBasketFood.set(null);
    }
    this.thisWeekBaskets.update(b => ({
      ...b,
      [key]: b[key].filter(f => f.id !== foodId),
    }));
  }

  // ----- Basket drop-zone handlers -----

  onBasketDragEnter(ev: DragEvent, key: BasketKey): void {
    ev.preventDefault();
    this.dragOverBasket.set(key);
  }

  onBasketDragOver(ev: DragEvent): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  }

  onBasketDragLeave(_ev: DragEvent, key: BasketKey): void {
    if (this.dragOverBasket() === key) this.dragOverBasket.set(null);
  }

  onBasketDrop(ev: DragEvent, key: BasketKey): void {
    ev.preventDefault();
    this.dragOverBasket.set(null);
    const json = ev.dataTransfer?.getData('application/json');
    if (!json) return;
    try {
      const food = JSON.parse(json) as Food;
      // Always route to the food's correct basket — even if the user dropped
      // it on the "wrong" one. The food floats to where it belongs; no
      // scolding, no rejected drop. The dropped-on basket is just a hint.
      const targetBasket = this.basketForFood(food);
      this.addFoodToBasket(food, targetBasket);
    } catch {
      // ignore malformed payload
    }
  }

  /** Second-way delete: dragging a basket tile out of the basket area and
   *  releasing over empty space removes it from the basket. effectAllowed
   *  matches the carousel tile drag so dropping on another basket still
   *  works (the food's category routes it correctly). */
  onBasketTileDragStart(food: Food, key: BasketKey, event: DragEvent): void {
    event.dataTransfer?.setData('application/json', JSON.stringify(food));
    event.dataTransfer!.effectAllowed = 'copy';
    this.draggingBasketSource.set({ key, foodId: food.id });
  }

  onBasketTileDragEnd(event: DragEvent): void {
    const source = this.draggingBasketSource();
    this.draggingBasketSource.set(null);
    if (!source) return;
    // dropEffect === 'none' means the user released outside any drop target
    // (or onto a non-droppable area) — treat that as "drag out to delete".
    if (event.dataTransfer?.dropEffect === 'none') {
      this.removeFoodFromBasket(source.key, source.foodId);
    }
  }

  // ----- Per-row actions -----

  toggleFavorite(event: Event, food: Food): void {
    event.stopPropagation();
    const wasAllowed = this.preferencesService.isAllowed(food.id);
    this.preferencesService.toggleFavoriteLocal(food.id);

    // Optimistic LHS update. The server cache (serverMyFoods) only refreshes
    // after the 500 ms autosave + refetch round-trip, so without this nudge
    // the newly-favorited food wouldn't appear on the LHS tile grid for ~1 s
    // (allMyFoods filters through allowedFoods but also requires the Food
    // object to be present in myFoodsLocal or serverMyFoods).
    if (!wasAllowed) {
      this.myFoodsLocal.update(list => {
        if (list.some(f => f.id === food.id)) return list;
        return [food, ...list];
      });
    } else {
      // Trim from the local cache too on unfavorite, so we don't keep a
      // ghost Food object around in localStorage forever.
      this.myFoodsLocal.update(list => list.filter(f => f.id !== food.id));
    }
    // Server-side refresh in the background to reconcile preferenceIds.
    this.refreshServerMyFoods();
  }

  toggleRestricted(event: Event, foodId: number): void {
    event.stopPropagation();
    this.preferencesService.toggleRestrictedLocal(foodId);
    this.refreshServerMyFoods();
  }

  /** A food is deletable iff it lives in the UserFoods table (foodSource
   *  discriminator from the API). The canonical Foods rows (USDA + Regi-
   *  curated) can never be deleted by an end user — they're shared data. */
  isUserAddedFood(food: Food): boolean {
    return food.foodSource === 'userfood';
  }

  async deleteUserFood(event: Event, food: Food): Promise<void> {
    event.stopPropagation();
    if (!this.isUserAddedFood(food)) return; // hard guard for keyboard activation
    const name = food.shortDescription || food.description;
    if (!window.confirm(`Do you want to permanently delete "${name}" from MyFoods?`)) {
      return;
    }
    const ok = await this.userFoodService.deleteUserFood(food.id);
    if (ok) {
      this.notificationService.show('Food deleted', 'success');
      // Drop it from the local cache immediately so the row goes away even
      // before the server refetch lands.
      this.myFoodsLocal.update(list => list.filter(f => f.id !== food.id));
      this.refreshServerMyFoods();
    } else {
      this.notificationService.show('Could not delete food', 'error');
    }
  }

  // ----- Vertical splitter — drag the left-pane width fraction -----

  private vSplitterDragStart(startX: number): void {
    this.splitterStartX = startX;
    this.splitterStartFraction = this.leftPaneWidthFraction();
  }

  private vSplitterUpdate(currentX: number): void {
    // Convert pixel delta to a fraction of the main-area width using the
    // splitter's own offsetParent — that's .main-area, which is exactly the
    // width the two panes share. clientWidth is read once per move event
    // (cheap, and avoids needing a ResizeObserver here).
    const grip = this.vSplitterRef()?.nativeElement;
    const parentWidth = grip?.parentElement?.clientWidth ?? 1;
    const deltaFraction = (currentX - this.splitterStartX) / parentWidth;
    this.leftPaneWidthFraction.set(
      this.clampPaneFraction(this.splitterStartFraction + deltaFraction),
    );
  }

  onVSplitterMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.vSplitterDragStart(event.clientX);
    const onMove = (e: MouseEvent) => this.vSplitterUpdate(e.clientX);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onVSplitterTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    this.vSplitterDragStart(touch.clientX);
    const onMove = (e: TouchEvent) => this.vSplitterUpdate(e.touches[0].clientX);
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onEnd);
  }

  private clampPaneFraction(f: number): number {
    return Math.max(0.15, Math.min(f, 0.85));
  }

  // ----- localStorage helpers -----

  private loadLocal(key: string): Food[] {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Food[]) : [];
    } catch {
      return [];
    }
  }

  private saveLocal(key: string, foods: Food[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(foods));
    } catch {
      // quota or disabled storage — silently swallow
    }
  }

  showHealthBenefits = signal(false);

  /** Live "Make MyFoods baseline match the pick override?" dialog state.
   *  Set when the user saves a Pick whose draft serving differs from the
   *  MyFoods baseline. Yes → also write the baseline; No/X → only the pick
   *  override stands. */
  baselineDialog = signal<{ food: Food; draft: number; unit: string } | null>(null);

  onBaselineDialogYes(): void {
    const d = this.baselineDialog();
    if (!d) return;
    this.preferencesService.setUserServingSize(d.food.id, d.draft, d.food.foodSource);
    this.baselineDialog.set(null);
  }

  onBaselineDialogNo(): void {
    this.baselineDialog.set(null);
  }
  nfPopupFood = signal<Food | null>(null);
  /** Category dropdown state — bound by NAME (the same value the accordion
   *  groups the food under), so it always reflects the food's real category
   *  with no resolution/placeholder. Original tracks the opened-at value for
   *  the dirty check. */
  nfPopupCategory = signal<string>('');
  nfPopupOriginalCategory = signal<string>('');

  /** Dropdown options: the category vocabulary, plus the food's own category
   *  if it isn't in that list (so the current value is always selectable). */
  readonly nfCategoryOptions = computed<string[]>(() => {
    const names = this.foodsService.categories().map((c) => c.name);
    const cur = this.nfPopupFood()?.categoryName?.trim();
    if (cur && !names.some((n) => n.toLowerCase() === cur.toLowerCase())) {
      return [cur, ...names];
    }
    return names;
  });

  /** Current effective serving size displayed inside the NF popup, in food
   *  units (e.g. 4 = "4 oz" of beef). Starts at the user's saved override
   *  (userServingSize) when present, otherwise the food's curated
   *  `servingSize` baseline, otherwise 1. The ▲ / ▼ steppers + tap-to-edit
   *  mutate it in place. In `edit` mode this is a DRAFT until the Green
   *  Save button commits. */
  nfPopupServingSize = signal<number>(1);

  /** Popup mode. `view` = read-only (no steppers, no Save). `edit` = editable
   *  with steppers + tap-to-edit + Green Save button. Every edit gesture in
   *  the app gates through this signal so the "edits only happen when the
   *  user says Edit" invariant holds. */
  nfPopupMode = signal<'view' | 'edit'>('view');

  /** Value the popup opened at, so we can:
   *   - detect dirty (current != original → Save enabled),
   *   - revert if the user closes via X without saving. */
  nfPopupOriginalServingSize = signal<number>(1);

  /** Save is enabled iff popup is in edit mode AND the draft differs from
   *  what we opened at. */
  // The green Save disc appears ONLY when something actually changed — the two
  // editable things are serving size and category. No change → no green disc.
  nfPopupCanSave = computed<boolean>(() =>
    this.nfPopupMode() === 'edit' &&
    (this.nfPopupServingSize() !== this.nfPopupOriginalServingSize() ||
      this.nfPopupCategory().trim() !== this.nfPopupOriginalCategory().trim())
  );

  /** Scale factor handed to the NF label so it can recompute macros from the
   *  per-100g baseline. Display math is (qty × servingGramsPerUnit) / 100,
   *  where qty is the popup's draft (`nfPopupServingSize`) — not the
   *  historical `servingSizeMultiplicand`, which only records what the
   *  on-ingest serving was and stays frozen when the user later edits
   *  ServingSize / ServingUnit / ServingGramsPerUnit. See `nutritionLabelScale`
   *  for the full reasoning. */
  nfPopupScale = computed<number>(() => {
    return nutritionLabelScale(this.nfPopupFood(), this.nfPopupServingSize());
  });

  // ---- Health Benefits popup state (Langfuse-driven) ----
  // healthBenefitsFood freezes the food the user clicked the button on so
  // the popup doesn't mutate if the user selects a different tile while
  // the AI lookup is in flight.
  healthBenefitsFood = signal<Food | null>(null);
  healthBenefitsLoading = signal(false);
  healthBenefitsText = signal<string | null>(null);
  healthBenefitsError = signal<string | null>(null);
  private healthBenefitsRequestId = 0;

  async openHealthBenefits(target?: Food): Promise<void> {
    // Explicit target wins (e.g. the Health Info overlay on a selected Edit-
    // MyFoods row); otherwise prefer the NF popup's food, then the selected
    // MyFood row, then whichever LHS tile is selected.
    const food = target ?? this.nfPopupFood() ?? this.selectedMyFood() ?? this.selectedFood();
    if (!food) return;
    this.healthBenefitsFood.set(food);
    this.healthBenefitsText.set(null);
    this.healthBenefitsError.set(null);
    this.healthBenefitsLoading.set(true);
    this.showHealthBenefits.set(true);

    // Stale-response guard: if the user closes & reopens for another food
    // before the first request resolves, only the latest one wins.
    const reqId = ++this.healthBenefitsRequestId;
    const foodName = food.shortDescription || food.description || '';
    try {
      // Contract with the `health-benefits` Langfuse prompt: phrase numbers
      // against the user's ACTUAL serving (the popup's display values), not
      // a generic one. ServingUnit defaults to 'g' and ServingGramsPerUnit
      // to 0 — the prompt's USER SERVING block reads those as "no preference
      // set" and falls back to a realistic standard serving for the food.
      const result = await this.langfusePromptService.run('health-benefits', {
        FoodName: foodName,
        ServingSize: String(food.servingSize ?? 1),
        ServingUnit: food.servingUnit ?? 'g',
        ServingGramsPerUnit: String(food.servingGramsPerUnit ?? 0),
      });
      if (reqId !== this.healthBenefitsRequestId) return;
      this.healthBenefitsText.set(result.text);
    } catch (e) {
      if (reqId !== this.healthBenefitsRequestId) return;
      const err = e as LangfusePromptError;
      this.healthBenefitsError.set(this.formatHealthBenefitsError(err));
    } finally {
      if (reqId === this.healthBenefitsRequestId) {
        this.healthBenefitsLoading.set(false);
      }
    }
  }

  private formatHealthBenefitsError(err: LangfusePromptError): string {
    switch (err?.kind) {
      case 'prompt_not_found':
        return 'Health benefits prompt is not configured yet.';
      case 'missing_variables':
        return `Prompt is missing required input: ${(err.missingVariables ?? []).join(', ')}.`;
      case 'llm_failed':
        return 'Couldn\'t reach the AI service — try again in a moment.';
      case 'unauthorized':
        return 'Your session expired — please sign in again.';
      case 'network':
        return 'Network error — check your connection and retry.';
      default:
        return err?.message || 'Something went wrong loading health benefits.';
    }
  }
  /** NF popup trace footer ("{id} ({source})"). Branches on the canonical
   *  `foodSource` discriminator first, then falls back to inspecting
   *  `dataSource`'s prefix — we NEVER hardcode 'USDA' as a default, because
   *  user-entered foods (UserFoods.DataSource = 'Nutrition Facts Label',
   *  'FatSecret', 'user', 'OpenAI-*', …) would otherwise be mislabeled.
   *
   *  Rules:
   *    foodSource === 'food'      → 'USDA' (canonical Foods-table row)
   *    foodSource === 'userfood'  → dataSource verbatim (provenance)
   *    foodSource missing         → infer from dataSource prefix (legacy
   *                                 path for any Food object minted before
   *                                 the foodSource plumbing landed).
   *
   *  ID is shown as-is (whatever the API returned). The historic sign-flip
   *  convention for user foods is no longer used; the discriminator is the
   *  foodSource field instead.
   */
  traceLabel(food: Food): string {
    const id = food.id;
    const source = this.sourceLabel(food);
    return `${id} (${source})`;
  }

  private sourceLabel(food: Food): string {
    if (food.foodSource === 'food') return 'USDA';
    if (food.foodSource === 'userfood') return food.dataSource || 'user';
    // foodSource absent — infer from dataSource as a last resort.
    if (food.dataSource?.startsWith('USDA')) return 'USDA';
    return food.dataSource || 'unknown';
  }

  openProductLink(food: Food): void {
    const url = food.productPurchaseLink;
    if (url) {
      this.nfPopupFood.set(null);
      window.open(url, '_blank', 'noopener');
    }
  }

  // ---- Spin carousel ----

  // A filter group is "pressed" when its categories exactly match the active
  // selection — that's what radio behavior looks like once groups can carry
  // more than one raw category each.
  isFilterGroupActive(group: FilterGroup): boolean {
    const set = this.selectedCategories();
    if (set.size !== group.cats.length) return false;
    return group.cats.every(c => set.has(c));
  }

  // True AM-radio behavior: pressing a button pops the previously-pressed one
  // out (only one group at a time). Pressing the currently-pressed group pops
  // it out (none selected → show all foods, handled in loadCarouselFoods /
  // filteredMyFoods).
  toggleFilterGroup(group: FilterGroup): void {
    this.selectedCategories.update(() => {
      if (this.isFilterGroupActive(group)) return new Set();
      return new Set(group.cats);
    });
  }

  /** Clear all category filters → show everything. */
  clearFilters(): void {
    this.selectedCategories.set(new Set());
  }

  private loadRequestId = 0;
  private async loadCarouselFoods(source: SpinSource, cats: Set<string>): Promise<void> {
    // No filters pressed = "show me everything" (matches the bottom-list semantics).
    // Filter is only applied when at least one but not all categories are pressed.
    const reqId = ++this.loadRequestId;
    try {
      let foods: Food[] = [];
      if (source === 'myfoods') {
        // Read from the in-memory cache (populated eagerly on construction and
        // refreshed explicitly after favorite/restrict toggles). Don't call
        // refreshServerMyFoods() here — writing to serverMyFoods inside this
        // effect-driven path would re-trigger autoLoadCarousel (it tracks
        // allMyFoods) and spin into an infinite loop that locks up the UI.
        foods = this.allMyFoods();
      } else if (source === 'restricted') {
        foods = await firstValueFrom(this.preferencesService.getRestrictedFoodsFull());
      } else {
        // Curated list — load by name. Same response shape as the YEH-approved
        // endpoint, so `foods` lands in the existing render path unchanged.
        const resp = await firstValueFrom(this.foodsService.getListItems(source));
        foods = resp?.foods ?? [];
      }

      // Stale-result guard: discard if a newer load has started
      if (reqId !== this.loadRequestId) return;

      // The category filter is intentionally NOT applied here anymore — it
      // belongs to the carousel only (see carouselSpinnerFoods). The right-
      // hand Curate list always shows the full collection, organized by
      // collapsible category headers, regardless of the radio's state.
      void cats;

      this.rawCarouselFoods.set(foods);
      this.loadFailed.set(false);
    } catch {
      if (reqId !== this.loadRequestId) return;
      this.loadFailed.set(true);
      this.notificationService.show(
        'Couldn\'t load foods — your session may have expired',
        'error',
      );
      this.rawCarouselFoods.set([]);
    }
  }
}
