// src/app/components/recipe-state-chip/recipe-state-chip.ts
//
// The ONE recipe-lifecycle chip, shared by the editor header and the RecipeBox
// rows so both read identically. A recipe has a single visible lifecycle state:
// DRAFT (isPublished=false, muted) or LIVE (isPublished=true, green). Server
// state is the sole source of truth — pass isPublished straight in.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-recipe-state-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="rsc" [class.live]="published()" [class.draft]="!published()">{{ published() ? 'LIVE' : 'DRAFT' }}</span>`,
  styles: [`
    .rsc {
      display: inline-block;
      font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;
      padding: 2px 7px; border-radius: 6px; border: 1px solid transparent; white-space: nowrap;
    }
    .rsc.live { color: #b7f5c4; background: rgba(52, 214, 81, 0.16); border-color: rgba(52, 214, 81, 0.4); }
    .rsc.draft { color: #cfcfcf; background: rgba(255, 255, 255, 0.07); border-color: rgba(255, 255, 255, 0.18); }
  `],
})
export class RecipeStateChipComponent {
  /** Server truth: true = LIVE, false = DRAFT. */
  readonly published = input(false);
}
