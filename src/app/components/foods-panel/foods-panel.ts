// src/app/components/foods-panel/foods-panel.ts
import { Component, ChangeDetectionStrategy, signal, computed, inject, viewChild, effect, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { NutritionFactsLabelComponent } from '../nutrition-facts-label/nutrition-facts-label';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { UserFoodService } from '../../services/user-food.service';
import { FoodsService, FoodList } from '../../services/foods.service';
import { TabService } from '../../services/tab.service';
import { LangfusePromptService, LangfusePromptError } from '../../services/langfuse-prompt.service';
import { Food } from '../../models/food.model';

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
// Storage key intentionally keeps the legacy "buckets" string so users who
// already have data saved don't lose it through the rename.
const LS_THISWEEK_BASKETS = 'regi.foods.thisweek.buckets';

type BasketKey = 'Proteins' | 'Fats' | 'Carbs' | 'Other';
const BASKET_KEYS: readonly BasketKey[] = ['Proteins', 'Fats', 'Carbs', 'Other'];

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

type ThisWeekBaskets = Record<BasketKey, Food[]>;
function emptyBaskets(): ThisWeekBaskets {
  return { Proteins: [], Fats: [], Carbs: [], Other: [] };
}

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

@Component({
  selector: 'app-foods-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule, NutritionFactsLabelComponent],
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
        <div class="left-pane" [style.flex]="leftPaneWidthFraction()">
          <div class="section-title">
            <span class="section-title-text">MyFoods</span>
            <!-- Curate MyFoods pill — blue text on the LHS. Toggles the RHS
                 between its default Baskets view and the Curate overlay.
                 Active state inverts to a filled blue chip so the user can
                 tell at a glance which view is on the right. -->
            <button
              type="button"
              class="curate-toggle"
              [class.pressed]="addTo() === 'right'"
              (click)="addTo.set(addTo() === 'right' ? 'left' : 'right')"
              matTooltip="Edit ... MyFoods, further curate faves, edit Serving Sizes, delete foods you entered"
              matTooltipPosition="below"
              [matTooltipShowDelay]="350">
              Edit...
            </button>
          </div>

          <div class="filter-bar">
            <span class="filter-bar-label">FILTER</span>
            <div class="category-radio-panel" role="group" aria-label="Category filter">
              @for (cat of carouselCategories; track cat) {
                <button
                  type="button"
                  class="category-radio-btn"
                  [class.pressed]="isCategoryActive(cat)"
                  [attr.aria-pressed]="isCategoryActive(cat)"
                  (click)="toggleCategory(cat)">
                  {{ categoryLabel(cat) }}
                </button>
              }
            </div>
          </div>

          <div class="pane-card carousel-card">
            <div class="carousel-top-bar">
              <span class="search-label">SEARCH</span>
              <input
                type="text"
                class="carousel-search-input"
                [value]="searchQuery()"
                (input)="onSearchInput($any($event.target).value)"
                placeholder="Search foods…" />
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
              <!-- LHS top bar is intentionally lean now — no NF Label or
                   Health Info button. Nutrition Facts is offered via a
                   delayed "Click for Facts" bloom on RHS basket tiles
                   (see .nf-bloom in foods-panel.scss). -->
              <span class="top-bar-spacer"></span>
              <span class="top-bar-tagline">Your healthy, curated foods ~ yum!</span>
              <span class="top-bar-spacer"></span>
              <span class="top-bar-total">Total ({{ carouselSpinnerFoods().length }})</span>
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
                  [draggable]="true"
                  (click)="onTileClick(food)"
                  (dblclick)="onTileDblClick(food)"
                  (dragstart)="onTileDragStart(food, $event)">
                  <div class="food-tile-image">
                    @if (food.foodImageThumbnail) {
                      <img [src]="food.foodImageThumbnail" alt="" draggable="false" />
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

        <!-- VERTICAL SPLITTER — drag horizontally to resize the panes. -->
        <div
          #vSplitter
          class="pane-splitter-v"
          (mousedown)="onVSplitterMouseDown($event)"
          (touchstart)="onVSplitterTouchStart($event)">
          <div class="splitter-grip-v"></div>
        </div>

        <!-- RIGHT PANE: blue section title at top ("Baskets" in This Week
             mode, the collection name in Curate mode), DISPLAY toggle, then
             (in Curate mode only) the TYPE dropdown, then the content. -->
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
              @if (addTo() === 'left') {
                Picks for planning
              } @else {
                <span
                  matTooltip="Edit MyFoods — click 'star' to Favorite, 'circle-line' to Restrict. Double-click a row to edit its Serving Size, single-press-and-hold the picture to zoom."
                  matTooltipPosition="below"
                  [matTooltipShowDelay]="350">
                  Edit MyFoods
                </span>
              }
            </span>
            <span class="section-title-count">
              @if (addTo() === 'left') { Total ({{ thisWeekTotal() }}) }
              @else { Total ({{ bottomListLength() }}) }
            </span>
            @if (addTo() === 'right') {
              <button
                type="button"
                class="section-title-close"
                (click)="addTo.set('left')"
                matTooltip="Back to Picks for planning"
                matTooltipPosition="below"
                aria-label="Close Edit">
                ✕
              </button>
            }
          </div>

          @if (addTo() === 'right') {
            <!-- TYPE dropdown sits directly above the curated list — it
                 predicates WHICH collection the user is curating. The Add
                 Food (+) button on the right is gated by TYPE=MyFoods (only
                 MyFoods can be added to). It's stubbed gray because the
                 real Add flow lives in the phone app. -->
            <div class="type-row">
              <span class="type-row-label">Food List</span>
              <select
                class="spin-source-select"
                [ngModel]="spinSource()"
                (ngModelChange)="onSpinSourceChange($event)">
                <option value="myfoods">My Foods</option>
                <option value="restricted">My Restricted Foods</option>
                <!-- Visual separator between the two user-preference sources
                     above and the curated lists pulled from /api/lists
                     below. Disabled so it can't be picked. -->
                <option disabled>──────────────</option>
                @for (list of availableLists(); track list.name) {
                  <option [value]="list.name">{{ list.description }}</option>
                }
              </select>
              <!-- Collapse/expand controls for the accordion below. Minus
                   collapses every category (the default state), plus
                   expands them all. They're a pair so users can flip the
                   whole list in one click. -->
              <button
                type="button"
                class="picker-fold-btn"
                [class.pressed]="allCategoriesCollapsed()"
                (click)="collapseAllCategories()"
                matTooltip="Collapse all categories"
                matTooltipPosition="above"
                aria-label="Collapse all">
                −
              </button>
              <button
                type="button"
                class="picker-fold-btn"
                [class.pressed]="!allCategoriesCollapsed()"
                (click)="expandAllCategories()"
                matTooltip="Expand all categories"
                matTooltipPosition="above"
                aria-label="Expand all">
                +
              </button>
              <span class="column-hint">{{ columnHeaderText() }}</span>
              @if (spinSource() === 'myfoods') {
                <!-- Phone button lives here in the MyFoods context — the
                     same slot the Add-Food + button used to occupy. It
                     opens the phone-app placeholder dialog (download QR).
                     The blue "Add foods w/ mobile" label sits in front of
                     the icon and the pair is right-justified via
                     margin-left: auto on the label. -->
                <span class="mobile-app-label">Add foods w/ mobile</span>
                <button
                  type="button"
                  class="mobile-app-btn"
                  (click)="openAddDialog()"
                  matTooltip="Add foods with the mobile app (QR download)"
                  matTooltipPosition="above"
                  [matTooltipShowDelay]="350"
                  aria-label="Mobile app">
                  <mat-icon class="mobile-app-icon">phone_android</mat-icon>
                </button>
              }
            </div>
            <!-- Picker-side type-ahead. Independent from the carousel SEARCH;
                 filters the accordion rows below as the user types so they
                 can find a specific food without scrolling. -->
            <div class="picker-search-row">
              <span class="picker-search-label">SEARCH</span>
              <input
                type="text"
                class="picker-search-input"
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
              <span class="top-bar-total picker-search-total">Total ({{ bottomListLength() }})</span>
            </div>
          }

          @if (addTo() === 'left') {
            <!-- Invisible spacer that mirrors the LHS FILTER bar's vertical
                 footprint so the rounded basket card below starts at the
                 same Y as the LHS carousel card. Marked aria-hidden +
                 inert so it never leaks into accessibility / focus order. -->
            <div class="filter-bar-placeholder" aria-hidden="true"></div>
            <!-- 4 baskets in a 2×2 grid wrapped in the same rounded card
                 chrome as the carousel side, so the two panes feel balanced. -->
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
                  <!-- Header row: blue title "PROTEINS (6)" + inline trash on
                       the LEFT, traffic-light pair (yellow restore, green
                       expand) anchored to the top-RIGHT. -->
                  <div class="basket-face">
                    <span class="basket-title">
                      {{ key }} ({{ thisWeekBaskets()[key].length }})
                    </span>
                    @if (thisWeekBaskets()[key].length > 0) {
                      <button
                        type="button"
                        class="basket-trash"
                        (click)="clearBasket(key)"
                        matTooltip="Empty Basket"
                        matTooltipPosition="above">
                        <mat-icon class="basket-trash-icon">delete_outline</mat-icon>
                      </button>
                    }
                  </div>
                  <div class="basket-lights-right">
                    <button
                      type="button"
                      class="basket-light basket-light-min"
                      [disabled]="focusedBasket() !== key"
                      (click)="focusedBasket.set(null)"
                      matTooltip="Restore"
                      matTooltipPosition="above">
                    </button>
                    <button
                      type="button"
                      class="basket-light basket-light-max"
                      [disabled]="focusedBasket() === key"
                      (click)="focusedBasket.set(key)"
                      matTooltip="Expand"
                      matTooltipPosition="above">
                    </button>
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
                          (click)="onBasketFoodClick(food)"
                          (dblclick)="onBasketFoodDblClick(food)">
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
                          <div class="basket-mini-card-label">
                            <span class="basket-mini-card-label-text">
                              {{ food.shortDescription || food.description }}
                            </span>
                          </div>
                          <div class="basket-mini-card-image">
                            @if (food.foodImageThumbnail) {
                              <img [src]="food.foodImageThumbnail" alt="" />
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
            </div>
          } @else {
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
                  @if (i === 0) {
                    <span class="category-edit-hint">double-click to edit food</span>
                  }
                  <span class="category-action-hint">{{ columnHeaderText() }}</span>
                </div>
                @if (!group.collapsed) {
                  @for (food of group.foods; track food.id) {
                    <div class="selected-food-row"
                         (dblclick)="onEditMyFoodsRowDblClick(food)">
                      <div class="selected-food-thumb"
                           (mousedown)="onThumbHoldStart($event, food)"
                           (mouseup)="onThumbHoldEnd()"
                           (mouseleave)="onThumbHoldEnd()"
                           (touchstart)="onThumbHoldStart($event, food)"
                           (touchend)="onThumbHoldEnd()"
                           (touchcancel)="onThumbHoldEnd()">
                        @if (food.foodImageThumbnail) {
                          <img [src]="food.foodImageThumbnail" alt="" draggable="false" />
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
                        matTooltip="Favorite"
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
                      <!-- DELETE is only meaningful for foods the USER added
                           (food.userId != null). YEH-base foods can be
                           un-favorited via the star but never deleted from the
                           database. Disabled state styles as muted gray; the
                           tooltip explains why. -->
                      <mat-icon
                        class="row-action trash"
                        [class.disabled]="!isUserAddedFood(food)"
                        (click)="deleteUserFood($event, food)"
                        [matTooltip]="isUserAddedFood(food)
                          ? 'Delete this food'
                          : 'Only foods you added can be deleted'"
                        matTooltipPosition="left">
                        delete
                      </mat-icon>
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
                        @if (food.foodImageThumbnail) {
                          <img [src]="food.foodImageThumbnail" alt="" />
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
          }
        </div>
      </div>

      <!-- Nutrition Facts popup. Opens in view mode by default (read-only).
           Opens in edit mode only from the RHS Edit MyFoods row, where a
           Green Save button persists changes to UserFoodPreferences.ServingSize. -->
      @if (nfPopupFood()) {
        <div class="nf-popup-overlay" (click)="onNfPopupClose()">
          <div class="nf-popup" (click)="$event.stopPropagation()">
            <button class="nf-popup-close" (click)="onNfPopupClose()" aria-label="Close">✕</button>
            <!-- Health Info button — overhangs the popup's upper edge so it
                 advertises the AI explainer affordance on every NF popup.
                 Always rendered (the previous filter-gate would silently
                 hide it whenever no LHS category was pressed). The AI
                 star sits on top of the green badge to make the AI
                 provenance unmistakable. -->
            <button
              type="button"
              class="health-benefits-btn nf-popup-health-info"
              (click)="openHealthBenefits()"
              matTooltip="Click for AI Health Info"
              matTooltipPosition="above"
              aria-label="Health info">
              <img src="/images/Health%20Benefits.png" alt="Health Info" class="nf-popup-health-info-bg" />
              <span class="nf-popup-health-info-ai" aria-hidden="true"></span>
            </button>
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
              <regi-nutrition-label
                [nutritionFacts]="nfPopupFood()!.nutritionFacts ?? null"
                [scale]="nfPopupScale()"
                [displayUnit]="nfPopupFood()!.servingUnit || 'g'"
                [displayQuantity]="nfPopupServingSize()"
                [editable]="nfPopupMode() === 'edit'"
                [showSave]="nfPopupCanSave()"
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

      <!-- Add Food → phone-app handoff placeholder. The actual flow runs in
           the phone app; this just nudges the user toward the QR / download. -->
      @if (showAddDialog()) {
        <div class="dialog-overlay" (click)="closeAddDialog()">
          <div class="phone-app-dialog" (click)="$event.stopPropagation()">
            <button
              type="button"
              class="dialog-close"
              (click)="closeAddDialog()"
              aria-label="Close">✕</button>
            <div class="phone-app-icon">📱</div>
            <h2 class="phone-app-title">Adding food requires the phone app</h2>
            <p class="phone-app-body">
              Scan the QR code or download the RegiMenu app to add your own foods.
            </p>
            <div class="phone-app-qr-placeholder" aria-hidden="true">QR</div>
            <button
              type="button"
              class="phone-app-cta"
              (click)="closeAddDialog()">
              Got it
            </button>
          </div>
        </div>
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
      next: (resp) => this.availableLists.set(resp?.lists ?? []),
      error: () => this.availableLists.set([]),
    });
  }

  private async refreshServerMyFoods(): Promise<void> {
    try {
      const server = await firstValueFrom(this.preferencesService.getAllowedFoodsFull());
      this.serverMyFoods.set(server);
    } catch {
      // Service unavailable — leave the cache as-is so local-only still works.
    }
  }

  private tabService = inject(TabService);
  protected preferencesService = inject(FoodPreferencesService);
  private notificationService = inject(NotificationService);
  private userFoodService = inject(UserFoodService);
  private foodsService = inject(FoodsService);
  private langfusePromptService = inject(LangfusePromptService);

  // Spin carousel state
  readonly carouselCategories = CAROUSEL_CATEGORIES;
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
  columnHeaderText = computed<string>(() =>
    this.spinSource() === 'myfoods' ? 'Fave / Restrict / Delete' : 'Fave / Restrict'
  );

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

  // Four-basket This Week store (Proteins/Fats/Carbs/Other). Replaces the old
  // flat thisWeekLocal Food[] — each basket is its own array.
  readonly basketKeys = BASKET_KEYS;
  thisWeekBaskets = signal<ThisWeekBaskets>(this.loadBaskets());

  // Convenience: total foods across all four baskets.
  thisWeekTotal = computed<number>(() => {
    const b = this.thisWeekBaskets();
    return b.Proteins.length + b.Fats.length + b.Carbs.length + b.Other.length;
  });

  // Drag-over basket key (for visual highlight on the drop target)
  dragOverBasket = signal<BasketKey | null>(null);

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
    const cat = [...cats][0];
    return `No ${this.categoryLabel(cat)} in this list.`;
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
        result.push({ category: cat, foods, collapsed: collapsed.has(cat) });
        map.delete(cat);
      }
    }
    for (const [cat, foods] of map.entries()) {
      result.push({ category: cat, foods, collapsed: collapsed.has(cat) });
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
        result.push({ category: cat, foods, collapsed: collapsed.has(cat) });
        map.delete(cat);
      }
    }
    for (const [cat, foods] of map.entries()) {
      result.push({ category: cat, foods, collapsed: collapsed.has(cat) });
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
  onSpinSourceChange(value: SpinSource): void {
    this.spinSource.set(value);
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
  private persistThisWeek = effect(() => {
    this.saveBaskets(this.thisWeekBaskets());
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

  /** Single-click on a LHS food tile = "Pick this" → drops it straight into
   *  the appropriate basket. Idempotent: clicking a food that's already in
   *  its basket is a silent no-op (addFoodToBasket dedupes by id), so a
   *  trailing double-click won't add the same food twice. If the right
   *  pane is in Curate mode it flips back to Picks so the user sees where
   *  the food landed. */
  onTileClick(food: Food): void {
    this.selectedFood.set(food);
    if (this.addTo() === 'right') {
      this.addTo.set('left');
    }
    const basket = this.basketForFood(food);
    this.addFoodToBasket(food, basket);
  }

  /** Double-click on a LHS tile is now a no-op for NF popups — edits live
   *  under the Edit MyFoods flow only. The first click of the double-click
   *  already added to the basket; addFoodToBasket's dedupe makes the second
   *  click a silent no-op, so this method intentionally does nothing.
   *  Kept as an explicit handler so future intent (e.g. confirmation flash)
   *  has an obvious home. */
  onTileDblClick(_food: Food): void {
    // No NF popup from the LHS picks display — edits require Edit mode.
  }

  /** Double-click on a row in the Edit MyFoods accordion → open the NF
   *  popup in EDIT mode. This is the only path that hands the user the
   *  steppers + Green Save button. */
  onEditMyFoodsRowDblClick(food: Food): void {
    this.openNfPopupForFood(food, 'edit');
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

  /** Open the NF popup for a food and prime the adjustable-serving state.
   *  Initial serving size = user's saved MyFoods override (`userServingSize`)
   *  when present, else the food's curated `servingSize` baseline, else 1.
   *  `mode` defaults to `view` (read-only). Edit mode is reached only via
   *  the Edit MyFoods flow on the RHS. */
  private openNfPopupForFood(food: Food, mode: 'view' | 'edit' = 'view'): void {
    const initial = this.preferencesService.userServingSize(food.id)
      ?? food.servingSize
      ?? 1;
    this.nfPopupServingSize.set(initial);
    this.nfPopupOriginalServingSize.set(initial);
    this.nfPopupMode.set(mode);
    this.nfPopupFood.set(food);
  }

  /** Close handler for the NF popup. Always reverts the draft to the
   *  original value so that a draft change in edit mode that wasn't saved
   *  doesn't bleed back into the cached value next time the popup opens. */
  onNfPopupClose(): void {
    this.nfPopupServingSize.set(this.nfPopupOriginalServingSize());
    this.nfPopupMode.set('view');
    this.nfPopupFood.set(null);
  }

  /** Green Save button handler. Persists the draft as the user's MyFoods
   *  override (UserFoodPreferences.ServingSize) and closes the popup.
   *  Disabled in the template via [disabled]="!nfPopupCanSave()" so this
   *  shouldn't fire when there's nothing to save. */
  onNfSave(): void {
    const food = this.nfPopupFood();
    if (!food || !this.nfPopupCanSave()) return;
    this.preferencesService.setUserServingSize(food.id, this.nfPopupServingSize());
    // Snap original to the saved value so close-revert doesn't undo it,
    // and the popup goes back to view mode in case the user clicked Save
    // without closing.
    this.nfPopupOriginalServingSize.set(this.nfPopupServingSize());
    this.nfPopupMode.set('view');
    this.nfPopupFood.set(null);
  }

  /** Curated ladder of "sensible" serving sizes, used by the ▲ / ▼ buttons.
   *  Off-ladder values (e.g. a curator-saved 0.625 whole) snap to the next
   *  ladder rung in the direction the user pressed — they're NOT force-
   *  snapped on display, only on click. The ladder is unit-agnostic by
   *  design: stepping math is the same whether the unit is "oz", "whole",
   *  "cup", or "g". This is intentional — users think "next bigger /
   *  smaller portion", not "delta of N grams". */
  private static readonly SERVING_SIZE_LADDER: readonly number[] = [
    0.25, 0.5, 0.75,
    1, 1.25, 1.5, 1.75,
    2, 2.5, 3, 3.5,
    4, 5, 6, 8, 10, 12, 15, 20,
  ];

  /** Adjust handler emitted by the NF label's ▲ / ▼ steppers. Ladder-snap:
   *  up = smallest ladder entry strictly > current; down = largest entry
   *  strictly < current. No-op if already at the bound. Updates the DRAFT
   *  signal only — Save persists. */
  onNfAdjust(direction: 'up' | 'down'): void {
    if (!this.nfPopupFood() || this.nfPopupMode() !== 'edit') return;
    const current = this.nfPopupServingSize();
    const ladder = FoodsPanelComponent.SERVING_SIZE_LADDER;

    let next: number | undefined;
    if (direction === 'up') {
      next = ladder.find(v => v > current);
    } else {
      // Largest value strictly less than current. Walk the ladder right-to-left.
      for (let i = ladder.length - 1; i >= 0; i--) {
        if (ladder[i] < current) { next = ladder[i]; break; }
      }
    }
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

  /** Store a per-basket serving-size override locally on the matching
   *  basket entry. Survives reload via the same persistThisWeek effect.
   *  No server hop — the basket itself is client-side state. Currently
   *  unused (all edits flow through Edit MyFoods now), retained in case a
   *  per-basket override surface lands later. */
  private persistBasketServingOverride(foodId: number, servingSize: number): void {
    this.thisWeekBaskets.update(b => {
      const next = { ...b } as ThisWeekBaskets;
      for (const key of this.basketKeys) {
        next[key] = b[key].map(f =>
          f.id === foodId ? { ...f, servingSize } : f,
        );
      }
      return next;
    });
  }

  // ----- RHS basket-tile selection + "Click for Facts" bloom -----

  /** The currently-selected food in a basket on the right pane. Drives the
   *  yellow halo and the delayed bloom timer. */
  selectedBasketFood = signal<Food | null>(null);

  /** Single click on a basket food = toggle selection (yellow halo). No
   *  bloom, no auto-popup — that's all double-click now. Click an already-
   *  selected card to deselect. Deletion is the red X only. */
  onBasketFoodClick(food: Food): void {
    const current = this.selectedBasketFood();
    this.selectedBasketFood.set(current?.id === food.id ? null : food);
  }

  /** Double-click on a basket food = open the Nutrition Facts popup. */
  onBasketFoodDblClick(food: Food): void {
    this.selectedBasketFood.set(food);
    this.openNfPopupForFood(food);
  }

  // ----- Basket helpers -----

  /** Coaching text shown inside an empty basket. Wraps to at most 2 lines
   *  by design (CSS clamp); the strings are sized so even the longest
   *  fits 2 lines at the standard basket width. */
  basketEmptyHint(key: BasketKey): string {
    switch (key) {
      case 'Proteins': return 'Pick 6 or more proteins';
      case 'Fats':     return 'Pick 5 or more fats sources';
      case 'Carbs':    return 'Pick 8+ vegetables, and 2+ fruits';
      case 'Other':    return 'Limit processed foods, add ideas for seasonings';
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
    // Append (oldest first, newest last) — the basket-tiles flex layout uses
    // `wrap-reverse` so the first item lands bottom-left and the stack grows
    // upward as foods are added.
    this.thisWeekBaskets.update(b => ({
      ...b,
      [key]: [...b[key], food],
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
    if (!window.confirm(`Delete "${name}"? This will permanently remove it from your MyFoods.`)) {
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

  private loadBaskets(): ThisWeekBaskets {
    try {
      const raw = localStorage.getItem(LS_THISWEEK_BASKETS);
      if (!raw) return emptyBaskets();
      const parsed = JSON.parse(raw);
      // Defensive: only accept the expected shape
      const out: ThisWeekBaskets = emptyBaskets();
      for (const k of BASKET_KEYS) {
        if (Array.isArray(parsed?.[k])) out[k] = parsed[k] as Food[];
      }
      // Migrate legacy "Misc" key (renamed to "Other") so users with saved
      // baskets from the old naming don't silently lose their food list.
      if (Array.isArray(parsed?.Misc) && out.Other.length === 0) {
        out.Other = parsed.Misc as Food[];
      }
      return out;
    } catch {
      return emptyBaskets();
    }
  }

  private saveBaskets(baskets: ThisWeekBaskets): void {
    try {
      localStorage.setItem(LS_THISWEEK_BASKETS, JSON.stringify(baskets));
    } catch {
      // ignore
    }
  }

  showAddDialog = signal(false);
  showHealthBenefits = signal(false);
  nfPopupFood = signal<Food | null>(null);

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
  nfPopupCanSave = computed<boolean>(() => {
    if (this.nfPopupMode() !== 'edit') return false;
    return this.nfPopupServingSize() !== this.nfPopupOriginalServingSize();
  });

  /** Scale factor handed to the NF label so it can recompute macros. Per the
   *  per-100g convention: macros = nf × servingSizeMultiplicand × servingSize.
   *  The label expects a single scale input, so we multiply here. */
  nfPopupScale = computed<number>(() => {
    const food = this.nfPopupFood();
    if (!food) return 1;
    const multiplicand = food.servingSizeMultiplicand || 1;
    return multiplicand * this.nfPopupServingSize();
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

  async openHealthBenefits(): Promise<void> {
    // Prefer the NF popup's food (if it's open) so the Health Info button
    // inside that dialog stays consistent; otherwise act on whichever tile
    // is currently selected in the grid.
    const food = this.nfPopupFood() ?? this.selectedFood();
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
      const result = await this.langfusePromptService.run('health-benefits', { FoodName: foodName });
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

  // The "Add My Food" flow runs in the phone app. The web "+" button just
  // surfaces a placeholder that points users at the QR / download.
  openAddDialog(): void {
    this.showAddDialog.set(true);
  }

  closeAddDialog(): void {
    this.showAddDialog.set(false);
  }

  // ---- Spin carousel ----

  isCategoryActive(cat: string): boolean {
    return this.selectedCategories().has(cat);
  }

  // True AM-radio behavior: pressing a button pops the previously-pressed one
  // out (only one at a time). Pressing the currently-pressed one pops it out
  // (none selected → show all foods, handled in loadCarouselFoods / filteredMyFoods).
  toggleCategory(cat: string): void {
    this.selectedCategories.update(set => {
      if (set.has(cat)) return new Set();
      return new Set([cat]);
    });
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
