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
    <svg class="twist-svg" viewBox="0 0 18 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 2.5 C 14.5 4, 14.5 7, 4 8.5 C 14.5 10, 14.5 13, 4 14.5 C 14.5 16, 14.5 19, 4 20.5"
        fill="none" stroke="currentColor" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; }
    .twist-svg {
      width: 17px;
      height: 21px;
      display: block;
      color: #ff5252; // brighter fusilli red for visibility on dark
    }
  `],
})
export class TwistIconComponent {}
