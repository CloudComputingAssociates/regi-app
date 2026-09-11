// src/app/components/tether-indicator/tether-indicator.ts
//
// App-bar mobile-tether indicator. A single phone glyph (phone_android, to
// match foods-panel's existing phone glyph): grey/disabled when no device is
// live, green-glow when a phone is connected (anyLive). Click opens one of three
// surfaces from TetherService state:
//   - not registered          → <app-tether-prompt mode="not-registered">
//   - registered but offline   → <app-tether-prompt mode="registered-offline">
//   - a device is live         → a small popover listing live devices.
// Renders its OWN tether-prompt instance — independent of TabService. OnPush,
// all reactive via signals.
import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TetherService } from '../../services/tether.service';
import { TetherPromptComponent, TetherPromptMode } from '../tether-prompt/tether-prompt';

@Component({
  selector: 'app-tether-indicator',
  imports: [MatTooltipModule, TetherPromptComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="ti-btn"
      [class.live]="tether.anyLive()"
      [matTooltip]="tether.anyLive() ? 'Mobile app connected' : 'Mobile app not connected'"
      matTooltipPosition="below"
      (click)="onClick()"
      aria-label="Mobile tether status">
      <!-- The phone glyph is a CSS-masked shape: the transparent PNGs supply the
           silhouette, the fill colour comes from code — light grey (not
           connected) vs vibrant green (connected). See .scss. -->
      <span class="ti-glyph" aria-hidden="true"></span>
    </button>

    @if (promptMode(); as mode) {
      <app-tether-prompt [mode]="mode" (close)="closePrompt()" />
    }

    @if (devicePopoverOpen()) {
      <div class="ti-pop-backdrop" (click)="devicePopoverOpen.set(false)"></div>
      <div class="ti-pop" role="menu">
        @for (d of liveDevices(); track d.deviceId) {
          <div class="ti-pop-row" role="menuitem">
            <span class="ti-dot" aria-hidden="true"></span>
            <span class="ti-pop-name">{{ d.deviceName }}</span>
            <span class="ti-pop-platform">{{ d.platform }}</span>
          </div>
        } @empty {
          <div class="ti-pop-empty">No live devices.</div>
        }
      </div>
    }
  `,
  styleUrls: ['./tether-indicator.scss'],
})
export class TetherIndicatorComponent implements OnDestroy {
  readonly tether = inject(TetherService);

  /** Only the live devices surface in the online popover. */
  readonly liveDevices = computed(() => this.tether.devices().filter((d) => d.live));

  /** Non-null → the tether-prompt is shown in that mode. */
  readonly promptMode = signal<TetherPromptMode | null>(null);
  readonly devicePopoverOpen = signal(false);

  /** The "open your phone" nudge self-dismisses after this long. */
  private static readonly PROMPT_AUTOCLOSE_MS = 10000;
  private promptTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // If the phone goes live while a prompt is open, the nudge is resolved —
    // close it automatically (covers both prompt modes).
    effect(
      () => {
        if (this.tether.anyLive() && this.promptMode() !== null) {
          this.closePrompt();
        }
      },
      { allowSignalWrites: true },
    );
  }

  onClick(): void {
    if (!this.tether.registered()) {
      this.openPrompt('not-registered');
    } else if (!this.tether.anyLive()) {
      this.openPrompt('registered-offline');
    } else {
      this.devicePopoverOpen.update((v) => !v);
    }
  }

  private openPrompt(mode: TetherPromptMode): void {
    this.clearPromptTimer();
    this.promptMode.set(mode);
    // 10s auto-close for the "open your phone" nudge. Not applied to the
    // not-registered QR flow — the user may need time to scan / download.
    if (mode === 'registered-offline') {
      this.promptTimer = setTimeout(
        () => this.closePrompt(),
        TetherIndicatorComponent.PROMPT_AUTOCLOSE_MS,
      );
    }
  }

  closePrompt(): void {
    this.clearPromptTimer();
    this.promptMode.set(null);
  }

  private clearPromptTimer(): void {
    if (this.promptTimer) {
      clearTimeout(this.promptTimer);
      this.promptTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearPromptTimer();
  }
}
