// src/app/components/foods-panel/foods-panel.ts
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, signal, computed, inject, viewChild, effect, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { ImageCarouselComponent } from '../image-carousel/image-carousel';
import { SpinnerItem } from '../spinner/spinner';
import { NutritionFactsLabelComponent } from '../nutrition-facts-label/nutrition-facts-label';
import { FoodPreferencesService } from '../../services/food-preferences.service';
import { NotificationService } from '../../services/notification.service';
import { UserFoodService } from '../../services/user-food.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { FoodsService, Category } from '../../services/foods.service';
import { TabService } from '../../services/tab.service';
import { LangfusePromptService, LangfusePromptError } from '../../services/langfuse-prompt.service';
import { CreateUserFoodRequest } from '../../models/user-food.model';
import { Food } from '../../models/food.model';

const SERVING_UNITS = ['whole', 'cup', 'tbsp', 'tsp', 'oz', 'lbs', 'g'];

type SpinSource = 'myfoods' | 'restricted' | 'yeh-approved';

const CAROUSEL_CATEGORIES = [
  'Protein', 'Fat', 'Dairy', 'Vegetable',
  'Carbohydrate', 'Fruit', 'Processed', 'Condiment',
] as const;

const LS_MYFOODS = 'regi.foods.myfoods';
const LS_THISWEEK_BUCKETS = 'regi.foods.thisweek.buckets';

type BucketKey = 'Proteins' | 'Fats' | 'Carbs' | 'Misc';
const BUCKET_KEYS: readonly BucketKey[] = ['Proteins', 'Fats', 'Carbs', 'Misc'];

// Food.categoryName → bucket. Per the spec: Dairy → Fats, Vegetables/Carbs/Fruits
// → Carbs, Processed/Condiments → Misc.
const CATEGORY_TO_BUCKET: Record<string, BucketKey> = {
  Protein: 'Proteins',
  Fat: 'Fats',
  Dairy: 'Fats',
  Vegetable: 'Carbs',
  Carbohydrate: 'Carbs',
  Fruit: 'Carbs',
  Processed: 'Misc',
  Condiment: 'Misc',
};

type ThisWeekBuckets = Record<BucketKey, Food[]>;
function emptyBuckets(): ThisWeekBuckets {
  return { Proteins: [], Fats: [], Carbs: [], Misc: [] };
}

const TYPE_LABELS: Record<SpinSource, string> = {
  'yeh-approved': 'YEH Approved',
  'myfoods': 'MyFoods',
  'restricted': 'Restricted',
};

const CATEGORY_PLURALS: Record<string, string> = {
  Protein: 'Proteins',
  Fat: 'Fats',
  Dairy: 'Dairy',
  Vegetable: 'Vegetables',
  Carbohydrate: 'Carbohydrates',
  Fruit: 'Fruits',
  Processed: 'Processed',
  Condiment: 'Condiments',
};

@Component({
  selector: 'app-foods-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule, ImageCarouselComponent, NutritionFactsLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="foods-panel-container">
      <div class="action-buttons">
        <button
          class="icon-btn add-food-btn"
          (click)="openAddDialog()"
          matTooltip="Add My Food"
          matTooltipPosition="above"
          [matTooltipShowDelay]="300">
          +
        </button>
        <button
          class="icon-btn close-btn"
          (click)="closePanel()"
          matTooltip="Close"
          matTooltipPosition="above"
          [matTooltipShowDelay]="300">
          ✕
        </button>
      </div>

      <!-- Top control strip — TYPE moved to the right pane (see below); only
           the category Filter row lives up here now. -->
      <div class="spin-controls">
        <div class="spin-row">
          <span class="spin-row-label">Filter</span>
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
      </div>

      <!-- Side-by-side main area: carousel on the LEFT, bucket/list stack on
           the RIGHT, with a draggable vertical splitter between them. Starts
           50/50, persists nothing — the user can drag mid-session. -->
      <div class="main-area">

        <!-- LEFT PANE: top bar holds the SEARCH label + input + execute
             button on the left, and the SPIN button on the right edge.
             Below is the carousel itself. -->
        <div class="left-pane" [style.flex]="leftPaneWidthFraction()">
          <div class="carousel-top-bar">
            <span class="search-label">SEARCH</span>
            <input
              type="text"
              class="carousel-search-input"
              [value]="searchQuery()"
              (input)="onSearchInput($any($event.target).value)"
              (keyup.enter)="onSearchExecute()"
              placeholder="Search foods…" />
            <button
              type="button"
              class="search-execute-btn"
              (click)="onSearchExecute()"
              matTooltip="Search (Enter)"
              matTooltipPosition="below"
              aria-label="Execute search">
              <svg viewBox="0 0 24 24" class="search-execute-icon" aria-hidden="true">
                <path d="M5 12h12M13 6l6 6-6 6"
                  fill="none" stroke="currentColor"
                  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <span class="top-bar-spacer"></span>
            <button
              type="button"
              class="spin-btn"
              (click)="carousel.spin()"
              aria-label="Spin">
              Spin
            </button>
          </div>
          <app-image-carousel
            #carousel="appImageCarousel"
            class="left-pane-carousel"
            [items]="spinnerItems()"
            [emptyMessage]="carouselEmptyMessage()"
            [visibleCount]="3"
            [showBucketBar]="false"
            (activated)="onActivated($event)"
            (inspect)="onInspect($event)"
            (centered)="onCarouselCentered($event)"
            (cardDragStart)="onCardDragStart($event)">
          </app-image-carousel>
        </div>

        <!-- VERTICAL SPLITTER — drag horizontally to resize the panes. -->
        <div
          #vSplitter
          class="pane-splitter-v"
          (mousedown)="onVSplitterMouseDown($event)"
          (touchstart)="onVSplitterTouchStart($event)">
          <div class="splitter-grip-v"></div>
        </div>

        <!-- RIGHT PANE: blue section title at top ("Buckets" in This Week
             mode, the collection name in Curate mode), DISPLAY toggle, then
             (in Curate mode only) the TYPE dropdown, then the content. -->
        <div class="right-pane" [style.flex]="rightPaneFlex()">
          <div class="right-section-title">
            @if (addTo() === 'left') {
              Buckets
            } @else {
              {{ collectionHeading() }} ({{ bottomListLength() }})
            }
          </div>

          <div class="display-toggle">
            <span class="display-toggle-label">DISPLAY</span>
            <div class="display-toggle-buttons" role="group" aria-label="Display target">
              <button
                type="button"
                class="display-toggle-btn"
                [class.active]="addTo() === 'left'"
                (click)="addTo.set('left')">
                This Week
              </button>
              <button
                type="button"
                class="display-toggle-btn"
                [class.active]="addTo() === 'right'"
                (click)="addTo.set('right')">
                Curate MyFoods
              </button>
            </div>
          </div>

          @if (addTo() === 'right') {
            <!-- TYPE dropdown sits directly above the curated list — it
                 predicates WHICH collection the user is curating. Only
                 visible in Curate mode since This Week shows buckets and
                 doesn't consult a TYPE. -->
            <div class="type-row">
              <span class="type-row-label">TYPE</span>
              <select
                class="spin-source-select"
                [ngModel]="spinSource()"
                (ngModelChange)="spinSource.set($event)">
                <option value="myfoods">My Foods</option>
                <option value="restricted">Restricted</option>
                <option value="yeh-approved">YEH Approved</option>
              </select>
              <span class="column-hint">{{ columnHeaderText() }}</span>
            </div>
          }

          @if (addTo() === 'left') {
            <!-- 4 buckets in a 2×2 grid. Each is tall enough to show the big
                 count in the middle and tiles below. Scrollbars only appear
                 inside an individual bucket when its tiles overflow. -->
            <div class="bucket-grid">
              @for (key of bucketKeys; track key) {
                <div
                  class="bucket"
                  [class.drag-over]="dragOverBucket() === key"
                  (dragenter)="onBucketDragEnter($event, key)"
                  (dragover)="onBucketDragOver($event)"
                  (dragleave)="onBucketDragLeave($event, key)"
                  (drop)="onBucketDrop($event, key)">
                  <div class="bucket-face">
                    <div class="bucket-count">{{ thisWeekBuckets()[key].length }}</div>
                    <div class="bucket-name">{{ key }}</div>
                  </div>
                  @if (thisWeekBuckets()[key].length > 0) {
                    <button
                      type="button"
                      class="bucket-clear"
                      (click)="clearBucket(key)"
                      matTooltip="Empty bucket"
                      matTooltipPosition="above">
                      ✕
                    </button>
                    <div class="bucket-tiles">
                      @for (food of thisWeekBuckets()[key]; track food.id) {
                        <div
                          class="bucket-mini-card"
                          [matTooltip]="food.shortDescription || food.description"
                          matTooltipPosition="above"
                          (click)="removeFoodFromBucket(key, food.id)">
                          <div class="bucket-mini-card-label">
                            <span class="bucket-mini-remove" aria-hidden="true">✕</span>
                            <span class="bucket-mini-card-label-text">
                              {{ food.shortDescription || food.description }}
                            </span>
                          </div>
                          <div class="bucket-mini-card-image">
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
          } @else {
            <div class="right-pane-list" #bottomList>
              @if (spinSource() === 'myfoods') {
            <!-- TYPE=MyFoods on right side: accordion view of curated MyFoods -->
            @if (allMyFoods().length === 0) {
              <div class="bottom-empty">
                Favorite a YEH Approved food (or double-click it) to add it to MyFoods.
              </div>
            } @else {
              @for (group of groupedMyFoods(); track group.category) {
                <div class="category-header"
                     (click)="toggleMyFoodsCategory(group.category)">
                  <mat-icon class="collapse-icon" [class.collapsed]="group.collapsed">expand_more</mat-icon>
                  <span class="category-name">{{ categoryLabel(group.category) }}</span>
                  <span class="category-count">({{ group.foods.length }})</span>
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
                        (click)="toggleFavorite($event, food.id)"
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
                      <mat-icon
                        class="row-action remove"
                        (click)="removeFromMyFoods($event, food.id)"
                        matTooltip="Remove from local"
                        matTooltipPosition="left">
                        delete
                      </mat-icon>
                    </div>
                  }
                }
              }
            }
          } @else {
            <!-- TYPE=YEH Approved or Restricted on right side. With no filter
                 active ("All" state), foods are rendered grouped by category
                 with separator headers. With a filter, only one category is
                 visible so we fall back to a flat list. -->
            @if (carouselFoods().length === 0) {
              <div class="bottom-empty">
                @if (spinSource() === 'yeh-approved') {
                  No YEH Approved foods match this filter.
                } @else {
                  No restricted foods match this filter.
                }
              </div>
            } @else if (isNoFilterActive()) {
              @for (group of groupedCarouselFoods(); track group.category) {
                <div class="category-separator">
                  <span class="category-separator-name">{{ categoryLabel(group.category) }}</span>
                  <span class="category-separator-count">({{ group.foods.length }})</span>
                </div>
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
                      (click)="toggleFavorite($event, food.id)"
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
            } @else {
              @for (food of carouselFoods(); track food.id) {
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
                    (click)="toggleFavorite($event, food.id)"
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
            </div>
          }
        </div>
      </div>

      <!-- Nutrition Facts popup (single-click on highlighted card) -->
      @if (nfPopupFood()) {
        <div class="nf-popup-overlay" (click)="nfPopupFood.set(null)">
          <div class="nf-popup" (click)="$event.stopPropagation()">
            <button class="nf-popup-close" (click)="nfPopupFood.set(null)">✕</button>
            @if (showHealthBenefitsForFilter()) {
              <!-- Health Info button — upper-left corner of the NF popup, the
                   same affordance that previously rode the centered card.
                   Opens the AI Health Benefits popup for whichever food is
                   currently in the NF view. -->
              <button
                type="button"
                class="health-benefits-btn nf-popup-health-info"
                (click)="openHealthBenefits()"
                aria-label="Health info">
                <img src="/images/Health%20Benefits.png" alt="Health Info" />
              </button>
            }
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
            @if (healthBenefitsFood(); as food) {
              <div class="hb-title">{{ food.shortDescription || food.description }}</div>
            }
            <div class="hb-content">
              @if (healthBenefitsLoading()) {
                <div class="hb-loading">Loading health benefits…</div>
              } @else if (healthBenefitsError(); as err) {
                <div class="hb-error">{{ err }}</div>
              } @else if (healthBenefitsText(); as text) {
                <div class="hb-text">{{ text }}</div>
              }
            </div>
          </div>
        </div>
      }

      <!-- Add Food Dialog -->
      @if (showAddDialog()) {
        <div class="dialog-overlay" (click)="closeAddDialog()">
          <div class="add-food-dialog" (click)="$event.stopPropagation()">
            <div class="dialog-header">
              <span class="dialog-title">Add My Food</span>
              <div class="dialog-header-right">
                <button class="dialog-ok-btn"
                  [disabled]="!canSubmit() || isSubmitting()"
                  (click)="submitFood()">
                  @if (isSubmitting()) {
                    <span class="save-spinner"></span>
                  } @else {
                    ✓
                  }
                </button>
                <button class="dialog-close" (click)="closeAddDialog()">✕</button>
              </div>
            </div>

            @if (isSubmitting()) {
              <div class="submit-overlay">
                <span class="submit-spinner"></span>
                <span class="submit-text">Adding food...</span>
              </div>
            }

            <div class="dialog-body">
              <div class="form-row">
                <label>Description <span class="required">*</span>
                  @if (sourceFoodId()) {
                    <span class="source-food-id">({{ sourceFoodId() }})</span>
                  }
                </label>
                <input type="text" class="form-input" [(ngModel)]="newFood.description" placeholder="e.g., Organic Greek Yogurt" />
              </div>

              <div class="form-row">
                <label>Short Description</label>
                <input type="text" class="form-input" [(ngModel)]="newFood.shortDescription" placeholder="e.g., Greek Yogurt" />
              </div>

              <div class="form-row">
                <label>Product Link <span class="optional-hint">(optional)</span></label>
                <div class="link-input-row">
                  <input type="url" class="form-input" [(ngModel)]="newFood.productPurchaseLink" placeholder="https://amazon.com/..." />
                  @if (newFood.productPurchaseLink) {
                    <button type="button" class="test-link-btn" (click)="testProductLink()">Test</button>
                  }
                </div>
              </div>

              <div class="form-row">
                <label>Category</label>
                <select class="form-select" [(ngModel)]="newFood.categoryId">
                  @for (cat of categories(); track cat.id) {
                    <option [ngValue]="cat.id">{{ cat.name }}</option>
                  }
                </select>
              </div>

              <div class="form-row-inline">
                <div class="form-col">
                  <label>Serving Unit</label>
                  <select class="form-select" [(ngModel)]="newFood.servingUnit">
                    @for (unit of servingUnits; track unit) {
                      <option [value]="unit">{{ unit }}</option>
                    }
                  </select>
                </div>
                <div class="form-col">
                  <label>Grams/Unit</label>
                  <input type="number" class="form-input" [(ngModel)]="newFood.servingGramsPerUnit" placeholder="0" />
                </div>
              </div>

              <div class="macros-section">
                <span class="section-label">Nutrition (per serving)</span>
                <div class="macro-grid">
                  <div class="macro-field">
                    <label>Calories <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.calories" />
                  </div>
                  <div class="macro-field">
                    <label>Protein (g) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.proteinG" />
                  </div>
                  <div class="macro-field">
                    <label>Fat (g) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.totalFatG" />
                  </div>
                  <div class="macro-field">
                    <label>Carbs (g) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.totalCarbohydrateG" />
                  </div>
                  <div class="macro-field">
                    <label>Fiber (g) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.dietaryFiberG" />
                  </div>
                  <div class="macro-field">
                    <label>Sodium (mg) <span class="required">*</span></label>
                    <input type="number" class="form-input" [(ngModel)]="newFood.sodiumMG" />
                  </div>
                </div>
              </div>

              <div class="image-section">
                <div class="image-upload">
                  <label>Product Image</label>
                  <div class="drop-zone"
                    [class.has-image]="productImagePreview()"
                    tabindex="0"
                    (dragover)="onDragOver($event)"
                    (drop)="onDrop($event, 'product')"
                    (paste)="onPaste($event, 'product')">
                    @if (productImagePreview()) {
                      <img [src]="productImagePreview()" alt="" class="preview-img" />
                      <button type="button" class="remove-img-btn" (click)="clearImage('product'); $event.stopPropagation()">✕</button>
                    } @else {
                      <div class="drop-placeholder">
                        <button type="button" class="browse-btn desktop-only" (click)="productImageInput.click(); $event.stopPropagation()">Browse</button>
                        <button type="button" class="camera-btn mobile-only" (click)="productImageInput.click(); $event.stopPropagation()">📷</button>
                        <span class="drop-label desktop-only">Drop or Ctrl+V to paste</span>
                        <span class="drop-label mobile-only">Tap 📷 or paste</span>
                      </div>
                    }
                  </div>
                  <input #productImageInput type="file" accept="image/*" capture="environment" hidden
                    (change)="onImageSelected($event, 'product')" />
                </div>

                <div class="image-upload">
                  <label>Nutrition Label <span class="label-hint">(auto-reads values)</span></label>
                  <div class="drop-zone"
                    [class.has-image]="nutritionImagePreview()"
                    tabindex="0"
                    (dragover)="onDragOver($event)"
                    (drop)="onDrop($event, 'nutrition')"
                    (paste)="onPaste($event, 'nutrition')">
                    @if (nutritionImagePreview()) {
                      <img [src]="nutritionImagePreview()" alt="" class="preview-img" />
                      <button type="button" class="remove-img-btn" (click)="clearImage('nutrition'); $event.stopPropagation()">✕</button>
                    } @else {
                      <div class="drop-placeholder">
                        <button type="button" class="browse-btn desktop-only" (click)="nutritionImageInput.click(); $event.stopPropagation()">Browse</button>
                        <button type="button" class="camera-btn mobile-only" (click)="nutritionImageInput.click(); $event.stopPropagation()">📷</button>
                        <span class="drop-label desktop-only">Drop or Ctrl+V to paste</span>
                        <span class="drop-label mobile-only">Tap 📷 or paste</span>
                      </div>
                    }
                  </div>
                  <input #nutritionImageInput type="file" accept="image/*" capture="environment" hidden
                    (change)="onImageSelected($event, 'nutrition')" />
                </div>
              </div>

              <div class="share-row">
                <label class="share-check">
                  <input type="checkbox" [(ngModel)]="newFood.shareCandidate" />
                  <span>Share w/ YEH Community</span>
                </label>
              </div>
            </div>

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
  private imageUploadService = inject(ImageUploadService);
  private foodsService = inject(FoodsService);
  private langfusePromptService = inject(LangfusePromptService);
  private cdr = inject(ChangeDetectorRef);

  categories = signal<Category[]>([]);

  // Spin carousel state
  readonly carouselCategories = CAROUSEL_CATEGORIES;
  spinSource = signal<SpinSource>('yeh-approved');
  selectedCategories = signal<Set<string>>(new Set(['Protein']));
  private rawCarouselFoods = signal<Food[]>([]);

  // Display label for the current TYPE — drives the slider's right-side label,
  // the bottom-pane header when the slider is on the right, etc.
  typeLabel = computed<string>(() => TYPE_LABELS[this.spinSource()]);

  // Count shown in the bottom header when the slider is on the right side.
  // For TYPE=MyFoods we use the filtered MyFoods count (accordion view total);
  // for YEH/Restricted we use carouselFoods (the visible list).
  bottomListLength = computed<number>(() => {
    if (this.spinSource() === 'myfoods') return this.filteredMyFoods().length;
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
  // row (right-side views only — left side now shows the bucket grid).
  columnHeaderText = computed<string>(() => 'Favorite / Restrict');

  // Search: filters the carousel locally (no API round-trip per keystroke)
  searchQuery = signal('');

  // Carousel feed = raw foods narrowed by the search box.
  carouselFoods = computed<Food[]>(() => {
    const raw = this.rawCarouselFoods();
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return raw;
    return raw.filter(f =>
      f.description.toLowerCase().includes(q) ||
      (f.shortDescription?.toLowerCase().includes(q) ?? false),
    );
  });

  // Carousel destination + local lists (persisted to localStorage).
  // 'left' = This Week buckets, 'right' = the TYPE-driven view (YEH/MyFoods/Restricted).
  // Default to 'left' (This Week) — that's the primary planning workflow.
  addTo = signal<'left' | 'right'>('left');
  myFoodsLocal = signal<Food[]>(this.loadLocal(LS_MYFOODS));

  // Four-bucket This Week store (Proteins/Fats/Carbs/Misc). Replaces the old
  // flat thisWeekLocal Food[] — each bucket is its own array.
  readonly bucketKeys = BUCKET_KEYS;
  thisWeekBuckets = signal<ThisWeekBuckets>(this.loadBuckets());

  // Convenience: total foods across all four buckets.
  thisWeekTotal = computed<number>(() => {
    const b = this.thisWeekBuckets();
    return b.Proteins.length + b.Fats.length + b.Carbs.length + b.Misc.length;
  });

  // Drag-over bucket key (for visual highlight on the drop target)
  dragOverBucket = signal<BucketKey | null>(null);

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

  // All MyFoods = local picks + unique server favorites. Local takes precedence
  // on dedupe so any edits on the local copy aren't overwritten by a server entry.
  allMyFoods = computed<Food[]>(() => {
    const local = this.myFoodsLocal();
    const server = this.serverMyFoods();
    const seenIds = new Set(local.map(f => f.id));
    return [...local, ...server.filter(f => !seenIds.has(f.id))];
  });

  // MyFoods display follows the same category Filters as the carousel.
  // (Header count uses allMyFoods().length — the unfiltered total.)
  filteredMyFoods = computed<Food[]>(() => {
    const all = this.allMyFoods();
    const cats = this.selectedCategories();
    if (cats.size === 0 || cats.size === CAROUSEL_CATEGORIES.length) return all;
    return all.filter(f => cats.has(f.categoryName ?? ''));
  });

  // Group filteredMyFoods by category for accordion display. Order follows
  // CAROUSEL_CATEGORIES; anything uncategorized is appended.
  collapsedMyFoodsCategories = signal<Set<string>>(new Set());

  groupedMyFoods = computed<Array<{ category: string; foods: Food[]; collapsed: boolean }>>(() => {
    const all = this.filteredMyFoods();
    const collapsed = this.collapsedMyFoodsCategories();
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

  toggleMyFoodsCategory(cat: string): void {
    this.collapsedMyFoodsCategories.update(set => {
      const next = new Set(set);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // Group carouselFoods by category — only rendered when no filter is active
  // (the "All" state). With a filter the user sees a single category so
  // separators are noise. Order follows CAROUSEL_CATEGORIES.
  groupedCarouselFoods = computed<Array<{ category: string; foods: Food[] }>>(() => {
    const all = this.carouselFoods();
    const map = new Map<string, Food[]>();
    for (const food of all) {
      const cat = food.categoryName || 'Uncategorized';
      const arr = map.get(cat);
      if (arr) arr.push(food);
      else map.set(cat, [food]);
    }
    const result: Array<{ category: string; foods: Food[] }> = [];
    for (const cat of CAROUSEL_CATEGORIES) {
      const foods = map.get(cat);
      if (foods && foods.length > 0) {
        result.push({ category: cat, foods });
        map.delete(cat);
      }
    }
    for (const [cat, foods] of map.entries()) {
      result.push({ category: cat, foods });
    }
    return result;
  });

  isNoFilterActive = computed<boolean>(() => this.selectedCategories().size === 0);

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

  // The execute button (and Enter key) doesn't need to do anything special —
  // search is already live on every keystroke. Kept as an explicit affordance
  // so users feel they can "commit" the query; a future enhancement might
  // dismiss the soft keyboard on mobile or trigger a server-side fuzzy search.
  onSearchExecute(): void {
    // no-op for now
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
    this.saveBuckets(this.thisWeekBuckets());
  });

  // ----- image-carousel: SpinnerItem mapping + outputs -----

  // The carousel ALWAYS spins MyFoods (regardless of TYPE). TYPE only drives
  // which collection the right-hand Curate view is editing. This is filtered
  // by the active category radio + search box, same as before.
  private carouselSpinnerFoods = computed<Food[]>(() => {
    const filtered = this.filteredMyFoods();
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(f =>
      f.description.toLowerCase().includes(q) ||
      (f.shortDescription?.toLowerCase().includes(q) ?? false),
    );
  });

  spinnerItems = computed<SpinnerItem[]>(() =>
    this.carouselSpinnerFoods().map((f) => ({
      id: f.id,
      thumbnailUrl: f.foodImageThumbnail ?? undefined,
      fullUrl: f.foodImage ?? undefined,
      label: f.shortDescription || f.description,
      food: f,
    } as SpinnerItem)),
  );

  // Double-click on the centered card.
  onActivated(item: SpinnerItem): void {
    const food = item['food'] as Food | undefined;
    if (!food) return;

    if (this.addTo() === 'left') {
      // Route to the correct This Week bucket based on the food's category.
      const bucket = this.bucketForFood(food);
      this.addFoodToBucket(food, bucket);
    } else {
      // Slider on right: behavior follows TYPE (matches the old onAddFood right-side logic).
      this.onRightSideAdd(food);
    }
  }

  // Single click on the centered card → open NF popup.
  onInspect(item: SpinnerItem): void {
    const food = item['food'] as Food | undefined;
    if (food) this.nfPopupFood.set(food);
  }

  // The image-carousel emits the dragstart event so we can set dataTransfer
  // with the SpinnerItem's food. Foods-panel is the only level that knows
  // what "food.id" means; image-carousel stays domain-blind.
  onCardDragStart({ item, event }: { item: SpinnerItem; event: DragEvent }): void {
    const food = item['food'] as Food | undefined;
    if (!food) return;
    event.dataTransfer?.setData('application/json', JSON.stringify(food));
    event.dataTransfer!.effectAllowed = 'copy';
  }

  // ----- Bucket helpers -----

  private bucketForFood(food: Food): BucketKey {
    return CATEGORY_TO_BUCKET[food.categoryName ?? ''] ?? 'Misc';
  }

  private addFoodToBucket(food: Food, key: BucketKey): void {
    const buckets = this.thisWeekBuckets();
    const exists = buckets[key].some(f => f.id === food.id);
    if (exists) {
      // No-op (silent); user already picked this one for that bucket.
      return;
    }
    // Append (oldest first, newest last) — the bucket-tiles flex layout uses
    // `wrap-reverse` so the first item lands bottom-left and the stack grows
    // upward as foods are added.
    this.thisWeekBuckets.update(b => ({
      ...b,
      [key]: [...b[key], food],
    }));
  }

  private onRightSideAdd(food: Food): void {
    const source = this.spinSource();
    if (source === 'yeh-approved') {
      if (!this.preferencesService.isAllowed(food.id)) {
        this.preferencesService.toggleFavoriteLocal(food.id);
        this.refreshServerMyFoods();
        this.notificationService.show(`${food.shortDescription || food.description} → MyFoods`, 'success');
      } else {
        this.notificationService.show('Already a MyFood', 'info');
      }
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
      this.myFoodsLocal.update(list => {
        const filtered = list.filter(f => f.id !== food.id);
        return [food, ...filtered];
      });
    }
    queueMicrotask(() => {
      this.bottomListRef()?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  clearBucket(key: BucketKey): void {
    this.thisWeekBuckets.update(b => ({ ...b, [key]: [] }));
  }

  removeFoodFromBucket(key: BucketKey, foodId: number): void {
    this.thisWeekBuckets.update(b => ({
      ...b,
      [key]: b[key].filter(f => f.id !== foodId),
    }));
  }

  // ----- Bucket drop-zone handlers -----

  onBucketDragEnter(ev: DragEvent, key: BucketKey): void {
    ev.preventDefault();
    this.dragOverBucket.set(key);
  }

  onBucketDragOver(ev: DragEvent): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  }

  onBucketDragLeave(_ev: DragEvent, key: BucketKey): void {
    if (this.dragOverBucket() === key) this.dragOverBucket.set(null);
  }

  onBucketDrop(ev: DragEvent, key: BucketKey): void {
    ev.preventDefault();
    this.dragOverBucket.set(null);
    const json = ev.dataTransfer?.getData('application/json');
    if (!json) return;
    try {
      const food = JSON.parse(json) as Food;
      // Always route to the food's correct bucket — even if the user dropped
      // it on the "wrong" one. The food floats to where it belongs; no
      // scolding, no rejected drop. The dropped-on bucket is just a hint.
      const targetBucket = this.bucketForFood(food);
      this.addFoodToBucket(food, targetBucket);
    } catch {
      // ignore malformed payload
    }
  }

  // ----- Per-row actions -----

  toggleFavorite(event: Event, foodId: number): void {
    event.stopPropagation();
    this.preferencesService.toggleFavoriteLocal(foodId);
    // Cache may be stale — refresh so TYPE=MyFoods carousel reflects the change.
    this.refreshServerMyFoods();
  }

  toggleRestricted(event: Event, foodId: number): void {
    event.stopPropagation();
    this.preferencesService.toggleRestrictedLocal(foodId);
    this.refreshServerMyFoods();
  }

  removeFromMyFoods(event: Event, foodId: number): void {
    event.stopPropagation();
    this.myFoodsLocal.update(list => list.filter(f => f.id !== foodId));
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

  private loadBuckets(): ThisWeekBuckets {
    try {
      const raw = localStorage.getItem(LS_THISWEEK_BUCKETS);
      if (!raw) return emptyBuckets();
      const parsed = JSON.parse(raw);
      // Defensive: only accept the expected shape
      const out: ThisWeekBuckets = emptyBuckets();
      for (const k of BUCKET_KEYS) {
        if (Array.isArray(parsed?.[k])) out[k] = parsed[k] as Food[];
      }
      return out;
    } catch {
      return emptyBuckets();
    }
  }

  private saveBuckets(buckets: ThisWeekBuckets): void {
    try {
      localStorage.setItem(LS_THISWEEK_BUCKETS, JSON.stringify(buckets));
    } catch {
      // ignore
    }
  }

  showAddDialog = signal(false);
  showHealthBenefits = signal(false);
  nfPopupFood = signal<Food | null>(null);
  isSubmitting = signal(false);

  // ---- Health Benefits popup state (Langfuse-driven) ----
  // centeredFood tracks whichever spinner card is currently in the spotlight
  // — fed by the carousel's (centered) output. healthBenefitsFood freezes the
  // food the user clicked the button on, so the popup doesn't mutate if the
  // user spins behind it.
  centeredFood = signal<Food | null>(null);
  healthBenefitsFood = signal<Food | null>(null);
  healthBenefitsLoading = signal(false);
  healthBenefitsText = signal<string | null>(null);
  healthBenefitsError = signal<string | null>(null);
  private healthBenefitsRequestId = 0;

  onCarouselCentered(item: SpinnerItem): void {
    const food = item['food'] as Food | undefined;
    this.centeredFood.set(food ?? null);
  }

  async openHealthBenefits(): Promise<void> {
    // Prefer the food the NF popup is showing — that's the one the user is
    // looking at when they click Health Info. Falls back to whichever card
    // the carousel happens to be centered on (for any future call sites
    // outside the popup).
    const food = this.nfPopupFood() ?? this.centeredFood();
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
  sourceFoodId = signal<number | null>(null);

  openProductLink(food: Food): void {
    const url = food.productPurchaseLink;
    if (url) {
      this.nfPopupFood.set(null);
      window.open(url, '_blank', 'noopener');
    }
  }

  // File objects for upload to yeh-image
  productImageFile = signal<File | null>(null);
  nutritionImageFile = signal<File | null>(null);

  // Local previews (object URLs)
  productImagePreview = signal<string | null>(null);
  nutritionImagePreview = signal<string | null>(null);

  servingUnits = SERVING_UNITS;

  newFood: Partial<CreateUserFoodRequest> = this.emptyFood();

  private emptyFood(): Partial<CreateUserFoodRequest> {
    return {
      description: '',
      shortDescription: '',
      servingUnit: 'whole',
      servingGramsPerUnit: 0,
      productPurchaseLink: '',
      shareCandidate: false,
      calories: 0,
      proteinG: 0,
      totalFatG: 0,
      sodiumMG: 0,
      totalCarbohydrateG: 0,
      dietaryFiberG: 0
    };
  }

  canSubmit(): boolean {
    return !!(this.newFood.description && this.newFood.calories !== undefined);
  }

  openAddDialog(): void {
    this.newFood = this.emptyFood();
    this.sourceFoodId.set(null);
    this.clearImage('product');
    this.clearImage('nutrition');
    this.foodsService.loadCategories().then(cats => {
      this.categories.set(cats);
      this.cdr.markForCheck();
    });
    this.showAddDialog.set(true);
  }

  closeAddDialog(): void {
    this.revokePreviewUrls();
    this.showAddDialog.set(false);
  }

  onImageSelected(event: Event, type: 'product' | 'nutrition'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setImageFile(file, type);
    input.value = '';
  }

  onPaste(event: ClipboardEvent, type: 'product' | 'nutrition'): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        event.preventDefault();
        const file = items[i].getAsFile();
        if (file) this.setImageFile(file, type);
        return;
      }
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent, type: 'product' | 'nutrition'): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      this.setImageFile(file, type);
    }
  }

  clearImage(type: 'product' | 'nutrition'): void {
    if (type === 'product') {
      if (this.productImagePreview()) URL.revokeObjectURL(this.productImagePreview()!);
      this.productImageFile.set(null);
      this.productImagePreview.set(null);
    } else {
      if (this.nutritionImagePreview()) URL.revokeObjectURL(this.nutritionImagePreview()!);
      this.nutritionImageFile.set(null);
      this.nutritionImagePreview.set(null);
    }
  }

  private setImageFile(file: File, type: 'product' | 'nutrition'): void {
    const previewUrl = URL.createObjectURL(file);
    if (type === 'product') {
      if (this.productImagePreview()) URL.revokeObjectURL(this.productImagePreview()!);
      this.productImageFile.set(file);
      this.productImagePreview.set(previewUrl);
    } else {
      if (this.nutritionImagePreview()) URL.revokeObjectURL(this.nutritionImagePreview()!);
      this.nutritionImageFile.set(file);
      this.nutritionImagePreview.set(previewUrl);
    }
    this.cdr.markForCheck();
  }

  private revokePreviewUrls(): void {
    if (this.productImagePreview()) URL.revokeObjectURL(this.productImagePreview()!);
    if (this.nutritionImagePreview()) URL.revokeObjectURL(this.nutritionImagePreview()!);
    this.productImageFile.set(null);
    this.nutritionImageFile.set(null);
    this.productImagePreview.set(null);
    this.nutritionImagePreview.set(null);
  }

  async submitFood(): Promise<void> {
    if (!this.canSubmit()) return;
    this.isSubmitting.set(true);

    try {
      // 1. Create the UserFood record (no image data — just metadata + nutrition)
      const req = { ...this.newFood } as CreateUserFoodRequest;
      delete (req as any).foodImage;
      delete (req as any).nutritionFactsImage;

      const result = await this.userFoodService.createUserFood(req);
      if (!result) {
        this.notificationService.show('Failed to add food', 'error');
        return;
      }

      const foodId = result.id;

      // 2. Upload images to yeh-image service (source=user)
      const uploads: Promise<unknown>[] = [];

      if (this.productImageFile()) {
        uploads.push(
          this.imageUploadService.uploadProductImage(foodId, this.productImageFile()!).catch(() => {
            this.notificationService.show('Food added, but product image upload failed', 'warning');
          })
        );
      }

      if (this.nutritionImageFile()) {
        uploads.push(
          this.imageUploadService.uploadNutritionImage(foodId, this.nutritionImageFile()!).catch(() => {
            this.notificationService.show('Food added, but nutrition label upload failed', 'warning');
          })
        );
      }

      await Promise.all(uploads);

      this.notificationService.show('Food added', 'success');
      this.closeAddDialog();

      // Surface the newly-added food in the spinner immediately by switching to MyFoods
      this.spinSource.set('myfoods');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  testProductLink(): void {
    const url = this.newFood.productPurchaseLink;
    if (url) {
      window.open(url, '_blank', 'noopener');
    }
  }

  closePanel(): void {
    this.tabService.closeTab('foods');
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
      if (source === 'yeh-approved') {
        const resp = await firstValueFrom(this.foodsService.searchYehApprovedFoods(500));
        foods = resp?.foods ?? [];
      } else if (source === 'myfoods') {
        // Read from the in-memory cache (populated eagerly on construction and
        // refreshed explicitly after favorite/restrict toggles). Don't call
        // refreshServerMyFoods() here — writing to serverMyFoods inside this
        // effect-driven path would re-trigger autoLoadCarousel (it tracks
        // allMyFoods) and spin into an infinite loop that locks up the UI.
        foods = this.allMyFoods();
      } else {
        foods = await firstValueFrom(this.preferencesService.getRestrictedFoodsFull());
      }

      // Stale-result guard: discard if a newer load has started
      if (reqId !== this.loadRequestId) return;

      // Intersect with pressed categories. Skip filter when ALL or NONE are
      // pressed (both mean "show everything").
      if (cats.size > 0 && cats.size < CAROUSEL_CATEGORIES.length) {
        foods = foods.filter(f => cats.has(f.categoryName ?? ''));
      }

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
