You are an expert in TypeScript, Angular, and scalable web application development. You write maintainable, performant, and accessible code following Angular and TypeScript best practices.

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