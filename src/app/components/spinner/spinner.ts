// src/app/components/spinner/spinner.ts
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  TemplateRef,
  computed,
  contentChild,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SpinnerItem {
  id: string | number;
  thumbnailUrl?: string;
  fullUrl?: string;
  label?: string;
  [key: string]: unknown;
}

export interface SpinnerCtx {
  $implicit: SpinnerItem;
  isCenter: boolean;
}

interface RenderedCard {
  key: number;
  idx: number;
  item: SpinnerItem;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  zIndex: number;
  isCenter: boolean;
}

@Component({
  selector: 'app-spinner',
  exportAs: 'appSpinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  host: {
    tabindex: '0',
    '(keydown.arrowLeft)': 'onArrowLeft($event)',
    '(keydown.arrowRight)': 'onArrowRight($event)',
    '(keydown.enter)': 'commit()',
  },
  template: `
    @if (items().length === 1) {
      <div class="spinner-roulette spinner-roulette--single">
        <div
          class="spinner-card is-center"
          [style.width.px]="cardWidth()"
          [style.height.px]="cardHeight()"
          (dblclick)="commit()">
          @if (cardTpl(); as tpl) {
            <ng-container
              *ngTemplateOutlet="tpl; context: { $implicit: items()[0], isCenter: true }" />
          } @else {
            <ng-container
              *ngTemplateOutlet="defaultCard; context: { $implicit: items()[0], isCenter: true }" />
          }
        </div>
      </div>
      <div class="spinner-details" [class.is-spinning]="spinning()">
        @if (detailsTpl(); as tpl) {
          <ng-container
            *ngTemplateOutlet="tpl; context: { $implicit: currentItem(), isCenter: true }" />
        }
      </div>
    } @else if (items().length >= 2) {
      <div
        #roulette
        class="spinner-roulette"
        [style.height.px]="cardHeight() + 24"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)">
        <button
          type="button"
          class="spinner-nav spinner-nav--left"
          (pointerdown)="$event.stopPropagation()"
          (dblclick)="$event.stopPropagation()"
          (click)="stepLeft()"
          aria-label="Previous">
          <svg viewBox="0 0 24 24" class="spinner-nav-icon" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          class="spinner-nav spinner-nav--right"
          (pointerdown)="$event.stopPropagation()"
          (dblclick)="$event.stopPropagation()"
          (click)="stepRight()"
          aria-label="Next">
          <svg viewBox="0 0 24 24" class="spinner-nav-icon" aria-hidden="true">
            <path d="M9 18l6-6-6-6" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        @for (card of visibleCards(); track card.key) {
          <div
            class="spinner-card"
            [class.is-center]="card.isCenter"
            [style.left.px]="card.left"
            [style.top.px]="card.top"
            [style.width.px]="card.width"
            [style.height.px]="card.height"
            [style.opacity]="card.opacity"
            [style.z-index]="card.zIndex"
            (dblclick)="onCardDblClick(card)">
            @if (cardTpl(); as tpl) {
              <ng-container
                *ngTemplateOutlet="
                  tpl;
                  context: { $implicit: card.item, isCenter: card.isCenter }
                " />
            } @else {
              <ng-container
                *ngTemplateOutlet="
                  defaultCard;
                  context: { $implicit: card.item, isCenter: card.isCenter }
                " />
            }
          </div>
        }
      </div>
      <div class="spinner-details" [class.is-spinning]="spinning()">
        @if (detailsTpl(); as tpl) {
          <ng-container
            *ngTemplateOutlet="tpl; context: { $implicit: currentItem(), isCenter: true }" />
        }
      </div>
    }

    <ng-template #defaultCard let-item let-center="isCenter">
      @if (item?.thumbnailUrl) {
        <img class="spinner-default-img" [src]="item.thumbnailUrl" alt="" draggable="false" />
      } @else {
        <div class="spinner-default-stub">
          <svg viewBox="0 0 64 64" class="fruit-stub" aria-hidden="true">
            <path
              d="M32 18 C 20 18 14 28 14 38 C 14 50 22 58 32 58 C 42 58 50 50 50 38 C 50 28 44 18 32 18 Z M32 14 C 32 10 36 6 40 6"
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
          @if (item?.label) {
            <div class="spinner-default-label">{{ item.label }}</div>
          }
        </div>
      }
    </ng-template>
  `,
  styleUrls: ['./spinner.scss'],
})
export class SpinnerComponent implements AfterViewInit, OnDestroy {
  // Inputs
  items = input<SpinnerItem[]>([]);
  cardWidth = input(160);
  cardHeight = input(200);
  spacing = input(190);
  friction = input(0.35);
  loop = input(true);
  enableTick = input(true);
  // How many cards are rendered around the centered one. Must be an ODD
  // integer so the spotlight stays symmetric. 5 → centerIdx − 2 … centerIdx + 2;
  // 3 → centerIdx − 1 … centerIdx + 1; etc.
  visibleCount = input(5);

  // Outputs
  activated = output<SpinnerItem>();
  centered = output<SpinnerItem>();

  // Projected templates (optional)
  cardTpl = contentChild<TemplateRef<SpinnerCtx>>('spinnerCard');
  detailsTpl = contentChild<TemplateRef<SpinnerCtx>>('spinnerDetails');

  static ngTemplateContextGuard(_d: SpinnerComponent, _c: unknown): _c is SpinnerCtx {
    return true;
  }

  // Public state
  offsetPx = signal(0);
  spinning = signal(false);
  containerWidth = signal(0);

  // Private physics state
  private hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private dragging = false;
  private pointerCaptured = false;
  private capturedPointerId: number | null = null;
  private dragStartOffset = 0;
  private dragStartX = 0;
  private lastBucket = 0;
  private velocity = 0;
  private lastT = 0;
  private rafId: number | null = null;
  private samples: { x: number; t: number }[] = [];
  private audioCtx: AudioContext | null = null;
  private ro: ResizeObserver | null = null;
  private rouletteEl: HTMLElement | null = null;
  // Threshold below which we treat a pointerdown..up as a tap (no pointer capture,
  // so compatibility click/dblclick reach the underlying card normally).
  private static readonly CAPTURE_THRESHOLD_PX = 5;

  // Derived
  centeredIndex = computed(() => {
    const len = this.items().length;
    if (!len) return 0;
    return this.wrap(Math.round(this.offsetPx() / this.spacing()), len);
  });

  currentItem = computed<SpinnerItem | null>(() => {
    const len = this.items().length;
    if (!len) return null;
    return this.items()[this.centeredIndex()] ?? null;
  });

  visibleCards = computed<RenderedCard[]>(() => {
    const items = this.items();
    const len = items.length;
    if (len < 2) return [];
    const sp = this.spacing();
    const cw = this.cardWidth();
    const ch = this.cardHeight();
    const continuous = this.offsetPx() / sp;
    const centerIdx = Math.round(continuous);
    const cx = this.containerWidth() / 2;
    const cy = (ch + 24) / 2;
    const loop = this.loop();
    const out: RenderedCard[] = [];
    const half = Math.floor(this.visibleCount() / 2);

    // Edge-aware horizontal position. With constant center-to-center spacing,
    // the edge-to-edge gap GREW as side cards scaled down (cw fixed, scaled
    // width shrinks, so cw_centers − scaledW1/2 − scaledW2/2 keeps climbing).
    // Now we walk outward from slot 0 summing the average of two adjacent
    // scaled widths plus a constant SLOT_GAP, so the gap between any two
    // adjacent cards stays the same regardless of how far out the fan goes.
    const SCALE_PER_STEP = 0.18;
    const SCALE_FLOOR = 0.55;
    const SLOT_GAP = 8;
    const scaleAt = (k: number) =>
      Math.max(SCALE_FLOOR, Math.min(1, 1 - Math.abs(k) * SCALE_PER_STEP));
    const slotPosAt = (slotIdx: number): number => {
      if (slotIdx === 0) return 0;
      const sign = Math.sign(slotIdx);
      const abs = Math.abs(slotIdx);
      let pos = 0;
      for (let k = 1; k <= abs; k++) {
        pos += cw * (scaleAt(k - 1) + scaleAt(k)) / 2 + SLOT_GAP;
      }
      return sign * pos;
    };

    for (let i = centerIdx - half; i <= centerIdx + half; i++) {
      const delta = i - continuous;
      const dist = Math.abs(delta);
      const scale = this.clamp(1 - dist * SCALE_PER_STEP, SCALE_FLOOR, 1);
      const opacity = this.clamp(1 - dist * 0.35, 0.15, 1);
      let idx: number;
      if (loop) {
        idx = this.wrap(i, len);
      } else {
        if (i < 0 || i >= len) continue;
        idx = i;
      }
      const isCenter = dist < 0.5;
      const width = cw * scale;
      const height = ch * scale;
      // Linearly interpolate between the two integer slot positions so the
      // animation stays smooth as the user drags / spins through a fraction
      // of a slot.
      const slotFloor = Math.floor(delta);
      const frac = delta - slotFloor;
      const dx = slotPosAt(slotFloor) * (1 - frac) + slotPosAt(slotFloor + 1) * frac;
      out.push({
        key: i,
        idx,
        item: items[idx],
        left: cx + dx - width / 2,
        top: cy - height / 2,
        width,
        height,
        opacity,
        zIndex: Math.round(100 - dist * 10),
        isCenter,
      });
    }
    // paint farthest first so center renders on top
    out.sort((a, b) => Math.abs(b.key - continuous) - Math.abs(a.key - continuous));
    return out;
  });

  // Reset when items() identity changes. Also emits `centered` for the new
  // landing card so listeners (e.g. Health Benefits AI lookup) know which item
  // is in the spotlight without waiting for a user-triggered spin.
  //
  // The emit reads currentItem() inside untracked() — otherwise the effect
  // subscribes to offsetPx (via centeredIndex), and every animation frame's
  // offsetPx update re-fires this effect, snapping offset back to 0 and
  // killing the spin. items() stays tracked so the legitimate trigger still
  // works.
  private resetOnItemsChange = effect(() => {
    const items = this.items();
    untracked(() => {
      this.stopMomentum();
      this.offsetPx.set(0);
      this.spinning.set(false);
      this.lastBucket = 0;
      if (items.length > 0) {
        const c = this.currentItem();
        if (c) this.centered.emit(c);
      }
    });
  });

  ngAfterViewInit(): void {
    const host = this.hostRef.nativeElement;
    this.rouletteEl = host.querySelector<HTMLElement>('.spinner-roulette');
    this.containerWidth.set(host.clientWidth);
    this.ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w =
          (e.contentRect as DOMRectReadOnly).width ?? (e.target as HTMLElement).clientWidth;
        this.containerWidth.set(w);
      }
    });
    this.ro.observe(host);
  }

  ngOnDestroy(): void {
    this.stopMomentum();
    this.ro?.disconnect();
    this.ro = null;
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // swallow
      }
      this.audioCtx = null;
    }
  }

  // ---- Pointer ----

  onPointerDown(e: PointerEvent): void {
    // IMPORTANT: do NOT capture the pointer here. Pointer capture redirects
    // compatibility mouse events (click, dblclick) to the captured element, which
    // would swallow card-level click/dblclick handlers. We capture lazily in
    // onPointerMove once the user has actually started dragging.
    this.stopMomentum();
    this.dragging = true;
    this.pointerCaptured = false;
    this.capturedPointerId = e.pointerId;
    this.dragStartOffset = this.offsetPx();
    this.dragStartX = e.clientX;
    this.lastBucket = Math.floor(this.offsetPx() / this.spacing());
    this.samples = [{ x: e.clientX, t: performance.now() }];
    this.spinning.set(true);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragStartX;
    if (!this.pointerCaptured && Math.abs(dx) > SpinnerComponent.CAPTURE_THRESHOLD_PX) {
      // The user has moved enough that this is clearly a drag, not a tap.
      // Capture now so we keep receiving pointermove even if the cursor leaves
      // the roulette element.
      try {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        this.pointerCaptured = true;
      } catch {
        // swallow
      }
    }
    const newOffset = this.dragStartOffset - dx;
    this.bucketTick(newOffset);
    this.offsetPx.set(newOffset);
    this.samples.push({ x: e.clientX, t: performance.now() });
    if (this.samples.length > 5) this.samples.shift();
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.pointerCaptured) {
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {
        // swallow
      }
      this.pointerCaptured = false;
    }
    this.capturedPointerId = null;
    const vx = this.velocityFromSamples();
    const moved = Math.abs(this.offsetPx() - this.dragStartOffset);
    if (Math.abs(vx) < 200 && moved < 8) {
      const handled = this.handleTapAt(e);
      if (!handled) this.snapToNearest();
      return;
    }
    this.launchMomentum(-vx);
  }

  private velocityFromSamples(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return 0;
    return (last.x - first.x) / dt;
  }

  /** Returns true if the tap triggered an animation (side card). */
  private handleTapAt(e: PointerEvent): boolean {
    const el = this.rouletteEl;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const px = e.clientX - rect.left;
    const sp = this.spacing();
    const continuous = this.offsetPx() / sp;
    const tappedBucket = Math.round((px - cx) / sp + continuous);
    const centerBucket = Math.round(continuous);
    if (tappedBucket === centerBucket) return false;
    this.animateOffsetTo(tappedBucket * sp);
    return true;
  }

  // ---- Card events ----

  /** Double-click on a card only commits when that card is the highlighted (center) one. */
  onCardDblClick(card: RenderedCard): void {
    if (card.isCenter) this.commit();
  }

  // ---- Keyboard ----

  onArrowLeft(e: Event): void {
    e.preventDefault();
    this.stepLeft();
  }

  onArrowRight(e: Event): void {
    e.preventDefault();
    this.stepRight();
  }

  /** Animate one card to the left. Public — bound to the on-screen arrow button. */
  stepLeft(): void {
    const sp = this.spacing();
    const target = (Math.round(this.offsetPx() / sp) - 1) * sp;
    this.animateOffsetTo(target);
  }

  /** Animate one card to the right. Public — bound to the on-screen arrow button. */
  stepRight(): void {
    const sp = this.spacing();
    const target = (Math.round(this.offsetPx() / sp) + 1) * sp;
    this.animateOffsetTo(target);
  }

  // ---- Commit ----

  commit(): void {
    const it = this.currentItem();
    if (it) this.activated.emit(it);
  }

  // ---- Momentum ----

  private launchMomentum(v: number): void {
    this.stopMomentum();
    this.velocity = v;
    this.spinning.set(true);
    // Sentinel: capture lastT on the first RAF callback so frame 1 sits at the rest
    // position (dt=0) and motion accumulates from frame 2 onward. Without this, the
    // first frame jumps by velocity * (frame-1 - schedule-time) ≈ 16 ms of motion.
    this.lastT = -1;
    this.lastBucket = Math.floor(this.offsetPx() / this.spacing());
    this.rafId = requestAnimationFrame((t) => this.step(t));
  }

  private step(now: number): void {
    if (this.lastT < 0) this.lastT = now;
    const dt = Math.max(0, (now - this.lastT) / 1000);
    this.lastT = now;
    const next = this.offsetPx() + this.velocity * dt;
    this.bucketTick(next);
    this.offsetPx.set(next);
    this.velocity *= Math.pow(this.friction(), dt);
    if (Math.abs(this.velocity) < 60) {
      this.stopMomentum();
      this.snapToNearest();
      return;
    }
    this.rafId = requestAnimationFrame((t) => this.step(t));
  }

  private stopMomentum(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.velocity = 0;
  }

  private snapToNearest(): void {
    const sp = this.spacing();
    const target = Math.round(this.offsetPx() / sp) * sp;
    this.animateOffsetTo(target, 260, SpinnerComponent.easeOutCubic);
  }

  private animateOffsetTo(
    target: number,
    duration = 260,
    ease: (t: number) => number = SpinnerComponent.easeOutCubic,
  ): void {
    this.stopMomentum();
    this.spinning.set(true);
    const start = this.offsetPx();
    if (start === target || duration <= 0) {
      this.offsetPx.set(target);
      this.finishAnimation();
      return;
    }
    // Capture startT inside the first RAF so frame 1 evaluates t=0 (no jump).
    // Stamping it before scheduling produced a ~17% jump on the very first snap
    // frame, visible when momentum decayed and we snapped to the nearest bucket.
    let startT: number | null = null;
    const tick = (now: number) => {
      if (startT === null) startT = now;
      const t = Math.min(1, (now - startT) / duration);
      const k = ease(t);
      const next = start + (target - start) * k;
      this.bucketTick(next);
      this.offsetPx.set(next);
      if (t < 1) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.rafId = null;
        this.finishAnimation();
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private finishAnimation(): void {
    this.spinning.set(false);
    const c = this.currentItem();
    if (c) this.centered.emit(c);
  }

  private static easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  // ---- Tick / haptics ----

  private bucketTick(offset: number): void {
    if (!this.enableTick()) return;
    const b = Math.floor(offset / this.spacing());
    if (b !== this.lastBucket) {
      this.lastBucket = b;
      this.playTick();
      try {
        navigator.vibrate?.(5);
      } catch {
        // swallow
      }
    }
  }

  private playTick(): void {
    try {
      if (!this.audioCtx) {
        const Ctor: typeof AudioContext | undefined =
          (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        this.audioCtx = new Ctor();
      }
      const ctx = this.audioCtx;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {
          // swallow
        });
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.05, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.012);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.014);
    } catch {
      // never throw from audio
    }
  }

  // ---- Public API ----

  /** Programmatically start a roulette spin (the "Spin the X" hook). */
  spin(): void {
    if (this.items().length < 2) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const v = dir * (3500 + Math.random() * 3000);
    this.launchMomentum(v);
  }

  // ---- Helpers ----

  private wrap(i: number, len: number): number {
    return ((i % len) + len) % len;
  }

  private clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
  }
}
