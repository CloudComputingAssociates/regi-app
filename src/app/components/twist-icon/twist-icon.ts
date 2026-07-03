// src/app/components/twist-icon/twist-icon.ts
//
// Small red fusilli-noodle "Twist" glyph. Reused in two places: in front of the
// "Twist" combobox label in the meal-generation area, and (later) next to any
// meal ingredient that was expanded because of a CuisineTwist (recipe-driven).
// Uses currentColor so callers can recolor it, defaulting to fusilli red.
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-twist-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="twist-svg" viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 2 C 11.5 3, 11.5 5, 6 6 C 11.5 7, 11.5 9, 6 10 C 11.5 11, 11.5 13, 6 14"
        fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; }
    .twist-svg {
      width: 11px;
      height: 14px;
      display: block;
      color: #e23b3b; // fusilli red (currentColor — override via host color)
    }
  `],
})
export class TwistIconComponent {}
