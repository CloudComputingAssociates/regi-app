// src/app/components/add-to-binder-dialog/add-to-binder-dialog.ts
//
// Small "Add to Binder" dialog — names the meal to materialize from a recipe and
// fires the create. It owns NO create logic itself: the editor passes an async
// onCreate(name) that returns an error string (rendered inline, e.g. the 422
// "still unresolved" gate) or null on success (dialog closes). Dark surface via
// panelClass 'wipe-dialog-panel' (same as the confirm dialog).
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface AddToBinderDialogData {
  /** Meal-name prefill — the recipe title. */
  defaultName: string;
  /** Runs the create; resolves to an error message (kept inline) or null (close). */
  onCreate: (name: string) => Promise<string | null>;
}

@Component({
  selector: 'app-add-to-binder-dialog',
  imports: [MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="atb">
      <p class="atb-title">Add to Binder</p>
      <p class="atb-sub">Create a meal from this recipe and drop it into your notebook.</p>
      <input class="atb-input" type="text" [value]="name()"
        (input)="name.set($any($event.target).value)"
        (keydown.enter)="create()" placeholder="Meal name" autofocus />
      @if (error()) { <p class="atb-error">{{ error() }}</p> }
      <div class="atb-actions">
        <button type="button" class="atb-action create" [disabled]="busy() || !name().trim()" (click)="create()">
          {{ busy() ? 'Creating…' : 'Create' }}
        </button>
        <button type="button" class="atb-action" [disabled]="busy()" (click)="cancel()">Cancel</button>
      </div>
    </div>
  `,
  styles: [`
    .atb { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px; min-width: 320px; color: #f1f1f1; }
    .atb-title { margin: 0; font-size: 15px; font-weight: 600; }
    .atb-sub { margin: 0 0 4px; font-size: 12px; color: #b9bec4; }
    .atb-input {
      width: 100%; box-sizing: border-box; padding: 8px 10px; font-family: inherit; font-size: 13px;
      color: #f0f0f0; background: linear-gradient(180deg, #565656 0%, #434343 100%);
      border: 1px solid #262626; border-top-color: #6f6f6f; border-radius: 6px; outline: none;
    }
    .atb-input:focus { box-shadow: 0 0 0 1px rgba(77, 166, 255, 0.6); }
    .atb-error { margin: 2px 0 0; font-size: 12px; color: #ff9a9a; }
    .atb-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .atb-action {
      padding: 7px 14px; font-size: 13px; font-weight: 500; border-radius: 6px; cursor: pointer;
      color: #f0f0f0; background: linear-gradient(180deg, #565656, #434343); border: 1px solid #262626; border-top-color: #6f6f6f;
    }
    .atb-action:disabled { opacity: 0.45; cursor: default; }
    .atb-action.create { color: #fff; background: linear-gradient(180deg, #4da6ff, #2f83db); border-color: #1f6ac0; }
  `],
})
export class AddToBinderDialogComponent {
  private dialogRef = inject(MatDialogRef<AddToBinderDialogComponent>);
  private data = inject<AddToBinderDialogData>(MAT_DIALOG_DATA);

  readonly name = signal(this.data.defaultName ?? '');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async create(): Promise<void> {
    const n = this.name().trim();
    if (!n || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const err = await this.data.onCreate(n);
    this.busy.set(false);
    if (err) this.error.set(err);
    else this.dialogRef.close(true);
  }

  cancel(): void {
    if (this.busy()) return;
    this.dialogRef.close(false);
  }
}
