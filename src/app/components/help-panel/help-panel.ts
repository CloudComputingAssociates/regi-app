// src/app/components/help-panel/help-panel.ts
//
// The Help panel — a Menus & Meals-style header bar (a big "?" glyph + "Help", a
// Clear-all key, and the red-X close) over the chat conversation view. No macros
// bar here (that's gated to the menus tab; Help is its own tab). The persistent
// chat input at the bottom of the shell drives the conversation.
//
// Phase 2: the empty-state preamble is a live FLOW WALK, not just a static greeting.
// The opener beat comes from `startFlow('help-general')` (cached). `answer` chips
// advance the walk in place (beat text+chips swap); `flow` chips jump to a fresh
// flow; `call` chips open a widget and/or fire a server-relayed HTTP action. Flow
// beats and answers NEVER enter chatState — the walk lives entirely in the preamble.
// The moment the conversation goes non-empty the walk drops (flows are cheap to
// restart) and we reset to the opener for the next empty state.
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { NotificationService } from '../../services/notification.service';
import { FlowService, FlowBeat, FlowChip, FlowVessel, AdvanceResult } from '../../services/flow.service';
import { ChatOutputComponent } from '../chat/chat-output/chat-output';

@Component({
  selector: 'app-help-panel',
  imports: [MatIconModule, MatTooltipModule, ChatOutputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="help-panel-container">
      <!-- Header bar — same chrome as the Menus & Meals toolbar. -->
      <div class="help-toolbar">
        <span class="toolbar-title">
          <span class="help-q" aria-hidden="true">?</span>Help
        </span>
        <div class="toolbar-buttons">
          <!-- Clear all — wipe the conversation. -->
          <button
            type="button"
            class="wipe-help-btn"
            matTooltip="Clear the conversation"
            matTooltipPosition="above"
            [disabled]="chatService.messages().length === 0"
            (click)="onClearAll()">
            <mat-icon class="wipe-icon" aria-hidden="true">clear_all</mat-icon>
          </button>
        </div>
        <!-- Exit — red X disc, far right (matches Menus & Meals). -->
        <button
          type="button"
          class="dialog-disc dialog-disc-cancel help-close-disc"
          matTooltip="Close Help panel"
          matTooltipPosition="above"
          aria-label="Close Help panel"
          (click)="tabService.closePanel()">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </div>

      <app-chat-output
        [greeting]="beat()?.text ?? ''"
        [chips]="seedChips()"
        [chipsDisabled]="advancing()"
        (chipTap)="onChipTap($event)" />
    </div>
  `,
  styleUrls: ['./help-panel.scss'],
})
export class HelpPanelComponent {
  protected tabService = inject(TabService);
  protected chatService = inject(ChatService);
  private flowService = inject(FlowService);
  private notify = inject(NotificationService);

  /** Widget → in-app action. Keyed by widget name; renderIntent is the tiebreaker if
   *  widget names ever collide. Instance field so the arrows close over `this`. */
  private readonly WIDGET_DISPATCH: Record<string, () => void> = {
    'UserSettings': () => this.tabService.openSettings(), // renderIntent 'bloom'
  };

  /** renderIntents the web has no surface for but the mobile app does. Empty this
   *  session — the mechanism exists so scanner-type intents land honestly later. */
  private readonly MOBILE_ONLY_INTENTS = new Set<string>();

  // ---- Walk state: the opener or current mid-walk beat + its session. ----
  /** The displayed beat (opener, or the current beat mid-walk), or null until fetched. */
  private readonly beatSig = signal<FlowBeat | null>(null);
  protected readonly beat = this.beatSig.asReadonly();
  /** Session for the active walk. null = single-beat flow (no advance possible). */
  private readonly sessionId = signal<string | null>(null);
  /** Name of the flow currently walked — used to restart on a 410. */
  private readonly currentFlow = signal<string>('help-general');
  /** True while an advance/start/call is in flight — chips go non-interactive. */
  protected readonly advancing = signal(false);
  private fetching = false;

  /** Chips to render. All kinds render now, but `answer` chips need a live session —
   *  filter them defensively for single-beat flows (the API won't send them there). */
  protected readonly seedChips = computed<FlowChip[]>(() => {
    const chips = this.beat()?.chips ?? [];
    const hasSession = this.sessionId() !== null;
    return chips.filter((c) => !(c.kind === 'answer' && !hasSession));
  });

  constructor() {
    effect(
      () => {
        const empty = this.chatService.messages().length === 0;
        if (empty) {
          // Fetch the opener the first time the conversation is empty with no beat.
          // The opener caches, so Clear-all reuses it; a failed fetch leaves it null →
          // retried on the next empty activation.
          if (!this.beat() && !this.fetching) {
            this.fetching = true;
            void this.loadBeat();
          }
        } else if (this.sessionId() !== null) {
          // Conversation went non-empty → an in-progress walk drops. Reset to the
          // opener so the next empty state shows the greeting, not a stale mid-walk beat.
          void this.resetWalkToOpener();
        }
      },
      { allowSignalWrites: true },
    );
  }

  private async loadBeat(): Promise<void> {
    try {
      await this.fetchFlow('help-general', false);
    } catch {
      // Silent — no error UI in Help over a greeting; retried on the next empty activation.
    } finally {
      this.fetching = false;
    }
  }

  /** Start (or restart) a flow and adopt its opener as the displayed beat. */
  private async fetchFlow(name: string, fresh: boolean): Promise<void> {
    const resp = await this.flowService.startFlow(name, fresh ? { fresh: true } : undefined);
    this.currentFlow.set(name);
    this.sessionId.set(resp.sessionId);
    this.beatSig.set(resp.beat);
  }

  /** Drop the active walk and fall back to the cached help-general opener. Sets the
   *  session null first to keep the non-empty effect branch from re-entering. */
  private async resetWalkToOpener(): Promise<void> {
    this.sessionId.set(null);
    try {
      const resp = await this.flowService.startFlow('help-general');
      this.currentFlow.set('help-general');
      this.beatSig.set(resp.beat);
    } catch {
      // Silent — leave the last beat; the next empty activation retries.
    }
  }

  /** Tap a chip. Guarded against double-fires while an advance is in flight. */
  async onChipTap(chip: FlowChip): Promise<void> {
    if (this.advancing()) return;
    switch (chip.kind) {
      case 'message':
        // Same service path as typed text, minus the input's tab-switch → stays on Help.
        if (chip.value) this.chatService.sendMessage(chip.value, 'chat');
        break;
      case 'link':
        if (chip.url) window.open(chip.url, '_blank', 'noopener');
        break;
      case 'answer':
        await this.doAnswer(chip);
        break;
      case 'flow':
        await this.doFlow(chip);
        break;
      case 'call':
        await this.doCall(chip);
        break;
    }
  }

  /** answer → advance the walk with this value, swapping the displayed beat in place. */
  private async doAnswer(chip: FlowChip): Promise<void> {
    const sid = this.sessionId();
    if (!sid || chip.value === undefined) return;
    this.advancing.set(true);
    try {
      await this.applyAdvance(await this.flowService.advance(sid, { value: chip.value }));
    } catch {
      // Silent — leave the current beat in place; the user can retap.
    } finally {
      this.advancing.set(false);
    }
  }

  /** flow → jump to a fresh flow (always bypasses the opener cache). */
  private async doFlow(chip: FlowChip): Promise<void> {
    if (!chip.flowName) return;
    this.advancing.set(true);
    try {
      await this.fetchFlow(chip.flowName, true);
    } catch {
      // Silent — leave the current beat in place.
    } finally {
      this.advancing.set(false);
    }
  }

  /** call → open the mapped widget and/or fire the server-relayed HTTP action. */
  private async doCall(chip: FlowChip): Promise<void> {
    this.dispatchWidget(chip.widget, chip.renderIntent);
    if (chip.call) {
      this.advancing.set(true);
      try {
        await this.flowService.fireCall(chip.call);
        this.notify.show('Done', 'success');
      } catch {
        this.notify.show('That action failed — please try again', 'error');
      } finally {
        this.advancing.set(false);
      }
    }
  }

  /** Apply an advance result: replace the beat, finish the walk, or restart on 410. */
  private async applyAdvance(result: AdvanceResult): Promise<void> {
    if (result.restart) {
      await this.fetchFlow(this.currentFlow(), true);
      return;
    }
    if (result.beat) this.beatSig.set(result.beat);
    if (result.done) {
      // Walk finished: the final beat (if any) keeps its link/call chips tappable, but
      // no further answers are possible — drop the session so answer chips filter out.
      this.sessionId.set(null);
      if (result.vessel) await this.dispatchVessel(result.vessel);
    }
  }

  /** A completed walk's vessel: open its widget and fire its writing call (if any). */
  private async dispatchVessel(vessel: FlowVessel): Promise<void> {
    this.dispatchWidget(vessel.widget, vessel.renderIntent);
    if (vessel.call) {
      try {
        await this.flowService.fireCall(vessel.call);
        this.notify.show('Done', 'success');
      } catch {
        this.notify.show('That action failed — please try again', 'error');
      }
    }
  }

  /** Map a widget/renderIntent to an in-app surface. Unmapped → honest toast, no throw. */
  private dispatchWidget(widget?: string, renderIntent?: string): void {
    if (!widget && !renderIntent) return;
    if (renderIntent && this.MOBILE_ONLY_INTENTS.has(renderIntent)) {
      this.notify.show("That's available in the mobile app", 'info');
      return;
    }
    const action = widget ? this.WIDGET_DISPATCH[widget] : undefined;
    if (action) {
      action();
      return;
    }
    console.warn('[flow] no web surface for widget/renderIntent:', widget, renderIntent);
    this.notify.show("That action isn't available here yet", 'error');
  }

  onClearAll(): void {
    this.chatService.clearContextSession('chat');
  }
}
