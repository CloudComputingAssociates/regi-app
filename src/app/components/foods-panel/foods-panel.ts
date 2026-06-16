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
              matTooltip="Curate MyFoods — 'Like' Regi Approved foods or add your own MyFoods with mobile app download (Android)"
              matTooltipPosition="below"
              [matTooltipShowDelay]="350">
              Curate
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
                Fill Baskets
              } @else {
                <span
                  matTooltip="Curate MyFoods — click 'star' to Favorite, or 'circle-line' for your Restricted Foods. With MyFoods selected you can delete or un-favorite to remove from MyFoods."
                  matTooltipPosition="below"
                  [matTooltipShowDelay]="350">
                  Curate MyFoods
                </span>
              }
            </span>
            @if (addTo() === 'left') {
              <!-- AutoFill — AI-driven basket-filler. Wiring lands later;
                   the button is here so the layout settles now. Visually
                   matches the Curate pill on the LHS so the two banners
                   read as a balanced pair. -->
              <button
                type="button"
                class="autofill-toggle"
                matTooltip="AI auto-fills your baskets from MyFoods"
                matTooltipPosition="below"
                [matTooltipShowDelay]="350">
                <img src="/images/AI-star-white.png" alt="" class="autofill-ai-icon" />
                AutoFill
              </button>
            }
            <span class="section-title-count">
              @if (addTo() === 'left') { Total ({{ thisWeekTotal() }}) }
              @else { Total ({{ bottomListLength() }}) }
            </span>
            @if (addTo() === 'right') {
              <button
                type="button"
                class="section-title-close"
                (click)="addTo.set('left')"
                matTooltip="Back to Fill Baskets"
                matTooltipPosition="below"
                aria-label="Close Curate">
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
                  @if (thisWeekBaskets()[key].length > 0) {
                    <div class="basket-tiles">
                      @for (food of thisWeekBaskets()[key]; track food.id) {
                        <div
                          class="basket-mini-card"
                          [class.selected]="selectedBasketFood()?.id === food.id"
                          [matTooltip]="food.shortDescription || food.description"
                          matTooltipPosition="above"
                          (click)="onBasketFoodClick(food)"
                          (dblclick)="removeFoodFromBasket(key, food.id)">
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
                    <!-- "Click for Facts" bloom — appears 3 s after select,
                         lingers 5 s. Pinned to the bottom-right of the
                         basket cell (NOT the mini-card) so it's visible in
                         the viewport without occluding the selected tile. -->
                    @if (showNfBloom() && basketContainingSelected() === key) {
                      <button
                        type="button"
                        class="nf-bloom"
                        [style.top.px]="bloomPosition()?.top"
                        [style.left.px]="bloomPosition()?.left"
                        (click)="onNfBloomClick($event)"
                        aria-label="Open Nutrition Facts">
                        <img src="/images/NutritionFactsLabel.jpg" alt="" class="nf-bloom-bg" />
                        <span class="nf-bloom-text">Click for Facts</span>
                      </button>
                    }
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
              @for (group of groupedMyFoods(); track group.category) {
                <div class="category-header"
                     (click)="toggleMyFoodsCategory(group.category)">
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

      <!-- Nutrition Facts popup (single-click on highlighted card) -->
      @if (nfPopupFood()) {
        <div class="nf-popup-overlay" (click)="nfPopupFood.set(null)">
          <div class="nf-popup" (click)="$event.stopPropagation()">
            <button class="nf-popup-close" (click)="nfPopupFood.set(null)" aria-label="Close">✕</button>
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
              <img src="/images/AI-star-white.png" alt="" class="nf-popup-health-info-ai" />
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
                [scale]="nfPopupFood()!.servingSizeMultiplicand || 1" />
            </div>
            <!-- Dev-side data-trace, OUTSIDE the inner scroll area so it
                 rides on the popup's dark bottom chrome instead of inside
                 the white nutrition label. Food ID + source ("USDA" for
                 canonical rows, "User" for phone-app-created ones). -->
            <div class="nf-popup-trace">
              {{ nfPopupFood()!.id }} ({{ nfPopupFood()!.userId == null ? 'USDA' : 'User' }})
            </div>
          </div>
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

  /** Single-click toggles selection: clicking an unselected tile selects
   *  it, clicking the already-selected tile unselects it. */
  onTileClick(food: Food): void {
    const current = this.selectedFood();
    this.selectedFood.set(current?.id === food.id ? null : food);
  }

  /** Double-click activates: adds to the active picker. If Refine is open
   *  on the right pane, we close it first so Baskets becomes visible — the
   *  user just chose a food to add, so the destination they're filling
   *  should be on screen. */
  onTileDblClick(food: Food): void {
    if (this.addTo() === 'right') {
      this.addTo.set('left');
    }
    const basket = this.basketForFood(food);
    this.addFoodToBasket(food, basket);
  }

  /** Drag-and-drop preserves the existing transfer shape — a JSON-encoded
   *  Food blob on application/json — so the basket drop handlers don't
   *  need to change. */
  onTileDragStart(food: Food, event: DragEvent): void {
    event.dataTransfer?.setData('application/json', JSON.stringify(food));
    event.dataTransfer!.effectAllowed = 'copy';
  }

  // ----- RHS basket-tile selection + "Click for Facts" bloom -----

  /** The currently-selected food in a basket on the right pane. Drives the
   *  yellow halo and the delayed bloom timer. */
  selectedBasketFood = signal<Food | null>(null);

  /** Visibility flag for the bloom overlay. Goes true 3 s after a basket
   *  food is single-clicked (if nothing intervenes), and false 5 s after
   *  that. */
  showNfBloom = signal(false);

  /** Inline {top, left} the bloom is positioned at — pixel offsets relative
   *  to the basket cell. Recomputed every time the bloom appears so it
   *  floats just off the upper-right corner of the selected card (or upper-
   *  left, if the card is too close to the basket's right edge). */
  bloomPosition = signal<{ top: number; left: number } | null>(null);

  /** Which basket cell currently owns the selected food. Used so the bloom
   *  renders inside the right basket (bottom-right of that cell) instead of
   *  trying to anchor to the mini-card directly. */
  basketContainingSelected = computed<BasketKey | null>(() => {
    const food = this.selectedBasketFood();
    if (!food) return null;
    const baskets = this.thisWeekBaskets();
    for (const k of this.basketKeys) {
      if (baskets[k].some(f => f.id === food.id)) return k;
    }
    return null;
  });

  private bloomShowTimer: ReturnType<typeof setTimeout> | null = null;
  private bloomHideTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly BLOOM_SHOW_DELAY_MS = 3000;
  private static readonly BLOOM_VISIBLE_MS = 5000;

  /** Cancel any pending bloom timers and hide the bloom immediately. */
  private cancelBloom(): void {
    if (this.bloomShowTimer) { clearTimeout(this.bloomShowTimer); this.bloomShowTimer = null; }
    if (this.bloomHideTimer) { clearTimeout(this.bloomHideTimer); this.bloomHideTimer = null; }
    this.showNfBloom.set(false);
  }

  /** Schedule the bloom: 3 s show delay, then 5 s visible window. */
  private scheduleBloom(): void {
    this.cancelBloom();
    this.bloomShowTimer = setTimeout(() => {
      // Compute the position FIRST so the bloom's entry animation starts at
      // the right anchor — no visible jump on first paint.
      this.computeBloomPosition();
      this.showNfBloom.set(true);
      this.bloomShowTimer = null;
      this.bloomHideTimer = setTimeout(() => {
        this.showNfBloom.set(false);
        this.bloomHideTimer = null;
      }, FoodsPanelComponent.BLOOM_VISIBLE_MS);
    }, FoodsPanelComponent.BLOOM_SHOW_DELAY_MS);
  }

  /** Measure the currently-selected basket card and pick a top/left so the
   *  bloom floats just off the card's upper-right corner. If the bloom
   *  wouldn't fit on the right (card sits near the basket's right edge),
   *  flip it to the upper-LEFT side. Both axes are clamped so the bloom
   *  stays fully inside the basket cell. */
  private computeBloomPosition(): void {
    if (!this.selectedBasketFood()) return;
    const cardEl = document.querySelector<HTMLElement>('.basket-mini-card.selected');
    if (!cardEl) return;
    const basketEl = cardEl.closest('.basket') as HTMLElement | null;
    if (!basketEl) return;

    const card = cardEl.getBoundingClientRect();
    const basket = basketEl.getBoundingClientRect();
    const bloomW = 84;
    const bloomH = 100;
    const gap = 4;

    const cardRelLeft = card.left - basket.left;
    const cardRelTop = card.top - basket.top;

    // Default: right of the card.
    let left = cardRelLeft + card.width + gap;
    // If that overflows the basket on the right, flip to the left of the card.
    if (left + bloomW > basket.width - 4) {
      left = cardRelLeft - bloomW - gap;
    }
    // Clamp so the bloom always sits fully inside the basket cell.
    left = Math.max(2, Math.min(left, basket.width - bloomW - 2));

    // A tiny bit above the card's top edge.
    let top = cardRelTop - 8;
    top = Math.max(2, Math.min(top, basket.height - bloomH - 2));

    this.bloomPosition.set({ top, left });
  }

  /** Single click on a basket food: select it (toggle off if it was already
   *  selected) and schedule the "Click for Facts" bloom. A double-click on
   *  the same card still fires (after two single-clicks) and will then
   *  trigger removeFoodFromBasket via (dblclick); the toggle means the
   *  selection self-cancels in that path so the bloom never appears. */
  onBasketFoodClick(food: Food): void {
    const current = this.selectedBasketFood();
    if (current?.id === food.id) {
      this.selectedBasketFood.set(null);
      this.cancelBloom();
    } else {
      this.selectedBasketFood.set(food);
      this.scheduleBloom();
    }
  }

  /** Click on the bloom button itself: open the NF popup for the selected
   *  food and stop propagation so the underlying basket-mini-card's (click)
   *  handler doesn't run and toggle the selection off. */
  onNfBloomClick(event: Event): void {
    event.stopPropagation();
    const food = this.selectedBasketFood();
    if (food) this.nfPopupFood.set(food);
    this.cancelBloom();
  }

  /** Opens the Nutrition Facts popup for the currently-selected tile.
   *  Kept around for any external caller (e.g. the future LHS bloom). */
  openNutritionLabel(): void {
    const food = this.selectedFood();
    if (food) this.nfPopupFood.set(food);
  }

  // ----- Basket helpers -----

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
    // Cancel any pending bloom if the selected food is about to disappear
    // along with the rest of this basket's contents.
    const selected = this.selectedBasketFood();
    if (selected && this.thisWeekBaskets()[key].some(f => f.id === selected.id)) {
      this.selectedBasketFood.set(null);
      this.cancelBloom();
    }
    this.thisWeekBaskets.update(b => ({ ...b, [key]: [] }));
  }

  removeFoodFromBasket(key: BasketKey, foodId: number): void {
    // If the food being removed is the bloom-selected one, drop the
    // selection and any pending bloom so we don't reference a phantom row.
    if (this.selectedBasketFood()?.id === foodId) {
      this.selectedBasketFood.set(null);
      this.cancelBloom();
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

  // A food belongs to the user (and is deletable from the database) only when
  // it has a userId — that flag is set when the food was created via the
  // phone-app Add-Food flow. YEH base foods have no userId.
  isUserAddedFood(food: Food): boolean {
    return food.userId != null;
  }

  async deleteUserFood(event: Event, food: Food): Promise<void> {
    event.stopPropagation();
    if (!this.isUserAddedFood(food)) return; // hard guard for keyboard activation
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
