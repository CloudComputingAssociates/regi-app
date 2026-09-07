// src/app/components/help-panel/help-panel.ts
//
// The Help panel — a Menus & Meals-style header bar (a big "?" glyph + "Help", a
// Clear-all key, and the red-X close) over the chat conversation view. No macros
// bar here (that's gated to the menus tab; Help is its own tab). The persistent
// chat input at the bottom of the shell drives the conversation.
import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { FlowService, FlowBeat, FlowChip, FlowChipKind } from '../../services/flow.service';
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
        (chipTap)="onChipTap($event)" />
    </div>
  `,
  styleUrls: ['./help-panel.scss'],
})
export class HelpPanelComponent {
  protected tabService = inject(TabService);
  protected chatService = inject(ChatService);
  private flowService = inject(FlowService);

  /** The 'help-general' opening beat (greeting + chips), or null until fetched. */
  private readonly beatSig = signal<FlowBeat | null>(null);
  protected readonly beat = this.beatSig.asReadonly();
  private fetching = false;

  /** Chip kinds wired in Phase 1 — everything else is filtered out of the render (the
   *  onChipTap switch has stub cases so adding them later touches one place). */
  private static readonly RENDERABLE_KINDS: readonly FlowChipKind[] = ['message', 'link'];
  protected readonly seedChips = computed<FlowChip[]>(() =>
    (this.beat()?.chips ?? []).filter((c) => HelpPanelComponent.RENDERABLE_KINDS.includes(c.kind)),
  );

  constructor() {
    // Fetch the greeting the first time the conversation is empty (fresh open, or any
    // later empty transition while we still have no beat). The beat stays cached, so
    // Clear-all reuses it with no refetch; a failed fetch leaves it null → retried on
    // the next empty activation.
    effect(
      () => {
        const empty = this.chatService.messages().length === 0;
        if (empty && !this.beat() && !this.fetching) {
          this.fetching = true;
          void this.loadBeat();
        }
      },
      { allowSignalWrites: true },
    );
  }

  private async loadBeat(): Promise<void> {
    try {
      this.beatSig.set(await this.flowService.startFlow('help-general'));
    } catch {
      // Silent — no error UI in Help over a greeting; retried on the next empty activation.
    } finally {
      this.fetching = false;
    }
  }

  /** Tap a seed chip — one switch; Phase 2 kinds are stubbed (and filtered from render). */
  onChipTap(chip: FlowChip): void {
    switch (chip.kind) {
      case 'message':
        // Same service path as typed text, minus the input's tab-switch → stays on Help.
        if (chip.value) this.chatService.sendMessage(chip.value, 'chat');
        break;
      case 'link':
        if (chip.url) window.open(chip.url, '_blank', 'noopener');
        break;
      // Phase 2 (renderer filters these out today; wire when the flows land):
      case 'answer': // TODO(phase-2): inline answer beat
      case 'call':   // TODO(phase-2): trigger an in-app action
      case 'flow':   // TODO(phase-2): advance to the next flow beat
        break;
    }
  }

  onClearAll(): void {
    this.chatService.clearContextSession('chat');
  }
}
