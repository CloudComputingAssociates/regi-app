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
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
      [matTooltip]="tether.anyLive() ? 'Connected' : 'Not Connected'"
      matTooltipPosition="below"
      (click)="onClick()"
      aria-label="Mobile tether status">
      <!-- Same asset in both states (identical chunkiness): greyed to a visible
           light grey when disconnected, full-colour green when connected. -->
      <img src="/images/mobile-connected.png" alt="" class="ti-img" />
    </button>

    @if (promptMode(); as mode) {
      <app-tether-prompt [mode]="mode" (close)="promptMode.set(null)" />
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
export class TetherIndicatorComponent {
  readonly tether = inject(TetherService);

  /** Only the live devices surface in the online popover. */
  readonly liveDevices = computed(() => this.tether.devices().filter((d) => d.live));

  /** Non-null → the tether-prompt is shown in that mode. */
  readonly promptMode = signal<TetherPromptMode | null>(null);
  readonly devicePopoverOpen = signal(false);

  onClick(): void {
    if (!this.tether.registered()) {
      this.promptMode.set('not-registered');
    } else if (!this.tether.anyLive()) {
      this.promptMode.set('registered-offline');
    } else {
      this.devicePopoverOpen.update((v) => !v);
    }
  }
}
