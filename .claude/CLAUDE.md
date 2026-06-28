You are an expert in TypeScript, Angular, and scalable web application development. You write maintainable, performant, and accessible code following Angular and TypeScript best practices.

## Commits (NON-NEGOTIABLE)

NEVER run `git commit` (or `git add` followed by commit). When the user types "commit msg" (or any variant asking for a commit message), the ONLY response is a 1-2 line terse commit message in plain text — no staging, no committing, no PR, no explanation around it. The user runs the commit themselves. This is non-negotiable; do not relitigate per conversation.

## Schema-First Contract (NON-NEGOTIABLE)

This is a JSON-Schema-first project. JSON Schema is the source of truth; TypeScript models are GENERATED from it.

- NEVER hand-edit generated model files (under `src/app/models/generated/`). Edit the schema, then regenerate.
- A change to any wire field — JSON property name, type, required, enum — is a SCHEMA edit first, code second. If you are editing a generated interface directly, STOP.
- Schema location: `<schemas/*.json — set to real path>`
- Regenerate: `<set to real command, e.g. npm run generate:models>`
- The same schema feeds the API (Go), the apps (TS), and message contracts. Treat shape as a cross-system contract, not a local type.

### Field-change procedure
1. Edit the property in the schema (+ any `required` / `$ref` / enum references).
2. Run the generator; do not touch generated output by hand.
3. Fix only hand-written code generation can't reach: mappers, components reading the field, service payloads.
4. `ng build`.

## Overload Traps — do NOT rename/alter these when a refactor shares a token

These are persisted product values or discriminators, unrelated to similarly-named fields. Conflating them corrupts data or routing.

- `foodListSource` enum values: `yeh`, `yeh_plus_myfoods`, `myfoods` (NOT the `regiApproved`/`yehApproved` flag)
- `defaultFoodList` value: `yeh_approved`
- `dataSource` column values (`user`, `USDA-FNDDS`, `FatSecret`) vs the `foodSource` discriminator (`food` / `userfood`) — different concepts, never conflate (e.g. a blind rename of `'user'` corrupts provenance)
- Route path strings (e.g. `/foods/search/all/yehapproved`) are URL contracts — leave unchanged unless the task explicitly renames the route

When a sweep touches a field whose token also appears in the list above, change ONLY the typed wire field; leave the persisted/discriminator/route values alone.

## Dialog conventions

All dialogs / overlays in the app share one control vocabulary so users learn the chrome once and don't have to re-orient on each new surface.

- **Confirm = round green disc with a check icon. Cancel = round red disc with an X icon.** Mac-style traffic-light visual; we're not using the Mac semantics (close / minimize / maximize), we're glomming onto the same shape for confirm/cancel because it reads instantly.
- **Canonical size: 20 × 20 px, `border-radius: 50 %`.** Matches the `.basket-light` discs in foods-panel — the established size in this codebase. Do not invent new sizes.
- **Colors: green `#28c941` (confirm), red `#ff5f57` (cancel).** Apple traffic-light palette.
- **Position: INSIDE the dialog's top-right corner, ~6px breathing room from both edges.** `position: absolute; top: 6px; right: 6px;` with a flex cluster gap of 6px. The dialog window keeps `overflow: hidden` so the rounded corners clip cleanly. Discs sit INSIDE the bloom border — do NOT hang them off the outside.
- **Global classes**: `.dialog-disc` + `.dialog-disc-confirm` / `.dialog-disc-cancel` are defined in `src/styles.scss`. Each overlay places them with its own `.dialog-discs` wrapper but never re-styles the disc itself.
- **Each dialog mounts the discs ONCE.** No duplicate Save/Close buttons elsewhere in the panel content — the discs are the only confirm/cancel surface. If you find a panel with internal ✓ / ✕ buttons inside the body, that's a leftover from the old chrome and should be removed.
- **Backdrop click = cancel** (same effect as the red X), except when there are unsaved dirty changes — in that case the backdrop swallows the click and the user must press a disc explicitly.
- **Disc visibility: appear-only-when-actionable.** The red cancel disc is ALWAYS present and serves as both "close" and "cancel." The green confirm disc APPEARS only when there's something to commit (dirty changes, valid form, etc.) — when nothing is committable, the green disc is absent from the DOM, not greyed-out. Disabled-grey buttons read as dead weight; conditional rendering reads as "now you can act." Use `@if` on the green button, never a `[disabled]` binding.
- **Tooltip**: every disc has a `matTooltip` ("Save" / "Submit" / "Close" / etc.) on hover for accessibility and discoverability.

When building a new dialog, copy the pattern from `settings-overlay.ts` / `settings-overlay.scss`. Do not write a new dialog with `SAVE` / `CLOSE` text buttons — that's the deprecated chrome.

## Optimizations (DO NOT pre-optimize)

The target operating envelope is up to ~500 simultaneous users. At that scale, premature optimization is the bigger risk than load.

- **Default to write-through**: every user action that mutates server state hits the API immediately. No client-side caching layers, no debounced batchers, no in-flight queues, no retry orchestration.
- **Do not add debounce, throttle, request coalescing, optimistic queues, or local persistence as a "cache"** in net-new code unless explicitly asked. If you find yourself reaching for `setTimeout`/`setInterval` to "batch" or "throttle" API calls, STOP — that's an optimization, not a feature.
- **Existing app-level caches** (e.g. `SettingsService.allSettingsSignal` — a load-once-on-startup signal) are fine to read from but don't extend them or invent new ones for new features.
- **If a write path looks expensive** (high frequency × payload size × user count), instrument it for Kibana / metrics dashboards instead of trying to fix it in the client. We optimize after we observe — and only what the dashboards say is actually a problem.
- **Server is the source of truth for shared state**. Reload-on-mount is the simplest, most-correct pattern; use it unless we have evidence it's a problem.
- **Data-integrity guards are NOT optimizations** and DO belong in the client — e.g. "don't PUT empty state if the GET failed" is correctness, not perf. The distinction: optimizations skip or batch work; integrity guards prevent corrupting server state.
- **Refactor to caching POST-LAUNCH** when metrics justify it, not in anticipation of load.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection