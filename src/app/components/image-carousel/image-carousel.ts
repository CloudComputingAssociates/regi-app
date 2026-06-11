// src/app/components/image-carousel/image-carousel.ts
//
// Domain-blind wrapper around the generic <app-spinner>. Knows nothing about
// foods, meals, recipes or videos — callers feed it SpinnerItem[] (with any
// passthrough data they want via the `[key: string]` bag) and wire outputs
// to their own actions.
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SpinnerComponent, SpinnerItem } from '../spinner/spinner';

@Component({
  selector: 'app-image-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SpinnerComponent],
  host: {
    '(document:keydown.escape)': 'onEscape($event)',
  },
  template: `
    <div class="carousel-panel">
      <div class="carousel-body" [style.--card-width.px]="cardWidth()" [style.--card-height.px]="cardHeight()">
        <!-- Bottom Bucket bar (the slider). Pinned top-left so it doesn't get
             pushed around when the spinner shifts vertically. -->
        @if (showBucketBar()) {
          <div class="bucket-bar">
            <span class="bucket-label">{{ bucketBarLabel() }}</span>
            <div class="bucket-toggle" role="group">
              <button
                type="button"
                class="bucket-option"
                [class.active]="bucketSide() === 'left'"
                (click)="bucketSide.set('left')">
                {{ leftLabel() }}
              </button>
              <button
                type="button"
                class="bucket-option"
                [class.active]="bucketSide() === 'right'"
                (click)="bucketSide.set('right')">
                {{ rightLabel() }}
              </button>
            </div>
          </div>
        }

        <!-- Floating Spin button — top-right. -->
        <button
          type="button"
          class="floating-spin-btn"
          (click)="s.spin()"
          aria-label="Spin">
          Spin
        </button>

        @if (items().length === 0) {
          <div class="carousel-empty">
            <span>{{ emptyMessage() }}</span>
          </div>
        }

        <app-spinner
          #s="appSpinner"
          [items]="items()"
          [cardWidth]="cardWidth()"
          [cardHeight]="cardHeight()"
          [spacing]="spacing()"
          [visibleCount]="visibleCount()"
          (activated)="onActivated($event)"
          (centered)="centered.emit($event)">
          <ng-template #spinnerCard let-item let-center="isCenter">
            <div
              class="image-card"
              [class.is-center]="center"
              [draggable]="center"
              (dragstart)="onCardDragStart(item, center, $event)"
              (click)="onCardSingleClick(center, item)"
              (dblclick)="onCardDblClick(center, item)">
              <div class="image-card-image">
                @if (item.fullUrl || item.thumbnailUrl; as src) {
                  <img [src]="src" alt="" draggable="false" />
                } @else {
                  <svg viewBox="0 0 64 64" class="image-card-stub" aria-hidden="true">
                    <path
                      d="M32 18 C 20 18 14 28 14 38 C 14 50 22 58 32 58 C 42 58 50 50 50 38 C 50 28 44 18 32 18 Z M32 14 C 32 10 36 6 40 6"
                      fill="none"
                      stroke="rgba(255,255,255,0.35)"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                }
              </div>
              @if (item.label) {
                <div class="image-card-caption">{{ item.label }}</div>
              }
            </div>
          </ng-template>
        </app-spinner>

        <!-- Slot for a small overlay (e.g. Health Benefits button) anchored to
             the upper-left of the centered card. Caller projects content via
             [centerOverlay] attribute. Dissolves while the spinner is moving
             and resolves when it settles, in unison with the yellow highlight
             on the centered card — a "call to action" only when there's
             something to act on. -->
        <div class="center-overlay" [class.is-spinning]="s.spinning()">
          <ng-content select="[centerOverlay]" />
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./image-carousel.scss'],
})
export class ImageCarouselComponent {
  // Inputs
  items = input<SpinnerItem[]>([]);
  cardWidth = input(154);
  cardHeight = input(192);
  spacing = input(182);
  visibleCount = input(5);

  // Slider label config
  showBucketBar = input(true);
  bucketBarLabel = input('DISPLAY');
  leftLabel = input('Left');
  rightLabel = input('Right');

  // Message shown when items is empty (e.g., load failed, filter has no
  // matches, auth token expired).
  emptyMessage = input('Nothing to show here yet.');

  // Two-way: which side of the slider is selected
  bucketSide = model<'left' | 'right'>('left');

  // Outputs (all domain-blind — emit SpinnerItem; callers interpret it)
  /** Double-click on the centered card. Caller decides "what activated means" — add to a list, navigate, open a player, etc. */
  activated = output<SpinnerItem>();
  /** Single-click on the centered card (after dblclick discrimination window). For openable details — NF popup, recipe sheet, video preview, etc. */
  inspect = output<SpinnerItem>();
  /** Dragstart on the centered card. Caller is responsible for setting dataTransfer (the SpinnerItem is provided synchronously). */
  cardDragStart = output<{ item: SpinnerItem; event: DragEvent }>();
  /** Whichever item is currently in the spotlight — emitted on items-load and after a spin settles. Use this when you need to react to whatever the user is "looking at" without requiring a click. */
  centered = output<SpinnerItem>();

  // ---- single-click vs double-click discrimination ----
  private singleClickTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DBLCLICK_WINDOW_MS = 250;

  onActivated(item: SpinnerItem): void {
    this.flushPendingInspect();
    this.activated.emit(item);
  }

  onCardDblClick(isCenter: boolean, item: SpinnerItem): void {
    if (!isCenter) return;
    this.flushPendingInspect();
    this.activated.emit(item);
  }

  onCardSingleClick(isCenter: boolean, item: SpinnerItem): void {
    if (!isCenter) return;
    if (this.singleClickTimer) clearTimeout(this.singleClickTimer);
    this.singleClickTimer = setTimeout(() => {
      this.singleClickTimer = null;
      this.inspect.emit(item);
    }, ImageCarouselComponent.DBLCLICK_WINDOW_MS);
  }

  onCardDragStart(item: SpinnerItem, isCenter: boolean, ev: DragEvent): void {
    if (!isCenter) return;
    this.cardDragStart.emit({ item, event: ev });
  }

  private flushPendingInspect(): void {
    if (this.singleClickTimer) {
      clearTimeout(this.singleClickTimer);
      this.singleClickTimer = null;
    }
  }

  onEscape(_e: Event): void {
    // Caller may listen to its own escape handling; this is reserved for any
    // future modal lifecycle the carousel owns internally.
  }
}
