# Faker function arguments — design

Status: draft · 2026-05-22

## Problem

When a user picks a faker method on a Schema property (e.g. `commerce.price`,
`number.int`, `helpers.arrayElement`), Mirage today calls it with **no
arguments**. The user cannot control the output range, format, casing, or any
other behaviour the underlying faker method exposes.

Today's call site at [`faker-engine.ts:53`](../../../packages/engine/src/faker-engine.ts):

```ts
return (fn as () => unknown).call(cursor);
```

We want a way to configure per-method arguments through the schema editor UI,
persist them on the property, and forward them to faker at generate time.

In the same change we lock `@faker-js/faker` to an exact version so a future
patch release cannot silently alter the catalog or method signatures we wire
the UI against.

## Goals

- Per-property arguments for any faker method that takes arguments.
- Stable, typed catalog of method signatures usable from the UI.
- Audit guarantees no faker method is silently missing from the catalog after
  a faker version bump.
- Engine trusts the args and surfaces faker's runtime error with field-path
  context on bad input.
- Zero migration: existing data without `fakerArgs` behaves identically.

## Non-goals

- Editing args for custom functions (`$fn:` values) — they define their own
  parameters inside the function body.
- Editing args for `$ref:` values — references have no args.
- Set-level argument overrides (per dev/prod set).
- Templating args against row state (e.g. `{{rowIndex}}` placeholders) or
  cross-field references in args.
- Locale-aware param hints (valid state codes per country, etc.).

## Decisions captured during brainstorming

| Question | Decision |
|---|---|
| Args placement | Popover anchored to an `ARGS` chip next to the FakerCell |
| Args storage | New optional `fakerArgs?: object` on `SchemaProp` (object \| array \| null) |
| Catalog source | Hybrid: generated skeleton + hand-written overrides |
| Faker version lock | Exact `9.3.0` in `package.json` + frozen `pnpm-lock.yaml` |
| Method swap with existing args | Drop `fakerArgs` silently |
| Engine validation | Trust args, surface faker's error; audit ensures completeness |

## Architecture

### 1. Catalog — `@mirage/fakerjs`

The package grows from "list of method names" into a typed catalog of method
signatures.

#### Generated skeleton (`registry.generated.ts`)

The existing `scripts/generate-registry.mjs` script is extended to also
introspect each faker method's parameter shape using TypeScript type info from
`@faker-js/faker`'s `.d.ts`:

- Read the compiled `.d.ts` from `node_modules/@faker-js/faker` using the TS
  compiler API.
- For each `(ns, method)`:
  - 0 params → `{ shape: 'none', params: [] }` (renders as "this method takes
    no arguments").
  - 1 parameter whose type is an object literal or a named `*Options` type →
    `shape: 'options'`, params = the object's properties.
  - Otherwise → `shape: 'positional'`, params = the function parameter list.
- For each param, infer `kind` from the TS type:
  - `number` → `number`, or `integer` if the param name hints (`length`,
    `count`, `precision`, …).
  - `string` → `string`.
  - `boolean` → `boolean`.
  - `string union` (e.g. `'a' | 'b' | 'c'`) → `enum` with auto-extracted
    options.
  - `Date` → `date`.
  - `T[]` → `array`.
  - everything else → `string` (raw-JSON fallback through the editor).

Emits `registry.generated.ts` with both:

```ts
export const FAKER_GROUPS: readonly FakerGroup[];       // existing
export const FAKER_REGISTRY: Record<string, MethodEntry>;
```

#### Hand overrides (`registry.overrides.ts`)

A hand-written TypeScript file shaped like the design's `faker-catalog.js`,
but containing **only** overrides — fields that augment or replace what the
generator produced. Typical uses:

- Better labels and hints ("reference date" instead of "refDate", "leave blank
  for now" hint).
- Default values (faker's types don't expose defaults).
- Min/max ranges (e.g. clamp `length` to `1..8` for flight numbers).
- Kind upgrades — `string` → `regex` (`helpers.fromRegExp` pattern), `string`
  → `date`, `number` → `integer`.
- Enum option lists when the type is a generic `string` but only certain
  values are valid.

Merge happens at generate time. `scripts/merge-catalog.mjs` reads
`registry.overrides.ts` and applies per-method, per-param patches on top of
the generated skeleton, emitting `src/catalog.generated.ts`.

#### Completeness audit

`packages/fakerjs/scripts/audit-catalog.test.ts` runs under Vitest in the
existing typecheck job and asserts:

- Every method in `FAKER_GROUPS` is either zero-arity in faker's signature or
  has a `FAKER_CATALOG` entry.
- Every method in `FAKER_CATALOG` exists on the live `faker` instance.
- Every `params[].kind` is one of the eight allowed kinds.
- For `enum` kinds, `options` is non-empty.

Failure messages point the developer to update `registry.overrides.ts`. This
is the "nothing gets missed" guarantee — CI breaks if a faker bump adds a
method we didn't curate.

#### Public API

```ts
export const FAKER_GROUPS: readonly FakerGroup[];
export const FAKER_CATALOG: Record<string, MethodEntry>;

export type MethodEntry = {
  shape: 'none' | 'options' | 'positional';
  params: Param[];
};

export type Param = {
  name: string;
  kind: ParamKind;
  label: string;
  hint?: string;
  default?: unknown;
  options?: string[];     // enum only
  min?: number;           // integer/number only
  max?: number;
  step?: number;
};

export type ParamKind =
  | 'integer' | 'number' | 'string' | 'boolean'
  | 'enum'    | 'date'   | 'array'  | 'regex';
```

### 2. Storage and API

Extend `SchemaProp` in the OpenAPI schema:

```yaml
SchemaProp:
  properties:
    name: string
    type: enum
    format: enum?
    required: boolean
    faker: string?
    fakerArgs: object?          # NEW — JSON object | array | null
    fields: SchemaProp[]?
    items: SchemaProp?
```

Storage shape:

- For `shape === 'options'` methods, `fakerArgs` is an object like
  `{ min: 10, max: 100 }`.
- For `shape === 'positional'` methods, it is a dense array like `["female"]`.
- The engine doesn't inspect which — it spreads accordingly based on the JS
  shape it sees at runtime.

Invariants enforced by the BFF and workspace-svc on save:

- `fakerArgs` is only allowed when `faker` is set to a faker method (not
  empty, not `$ref:`, not `$fn:`).
- `fakerArgs` must be JSON-serializable.
- Serialized `fakerArgs` ≤ 4 KB per prop.

No further validation server-side. Bad ranges, invalid enum values, missing
required positional params, etc. are caught client-side (UI) and otherwise
surface as `faker_call_failed` at generate time.

### 3. Engine

`FakerEngine.call` gains an optional second parameter:

```ts
call(method: string, args?: unknown): unknown;
```

Implementation, replacing the call line at
[`faker-engine.ts:53`](../../../packages/engine/src/faker-engine.ts):

```ts
const callArgs = Array.isArray(args) ? args
               : args !== undefined && args !== null ? [args]
               : [];
return (fn as (...a: unknown[]) => unknown).call(cursor, ...callArgs);
```

The existing `try/catch` already wraps faker errors in `EngineError`'s
`faker_call_failed`. That path now also covers user-controlled errors like
"min must be ≤ max", carrying the prop's field path so the UI can render
"row N field `price`: max must be ≥ min".

[`generate-rows.ts:126`](../../../packages/engine/src/generate-rows.ts) becomes:

```ts
return ctx.fakerEngine.call(p.faker, p.fakerArgs);
```

[`dry-run.ts`](../../../packages/engine/src/dry-run.ts) gets the same one-line
addition at every `fakerEngine.call` site.

### 4. UI

New components under
`apps/web/src/pages/dashboard/schemas/PropertyEditor/`:

- `ArgsChip.tsx` — small button next to the FakerCell trigger. Shows `ARGS`
  in muted style when no args are configured, or `N` (count) in filled style
  when args exist. Click opens the popover.
- `ArgsPopover.tsx` — ported from `design/add-params-fn/args-variants.jsx`
  (popover variant only). Floating panel anchored to the chip, with a header
  showing `ns.method · { options }` or `(positional)`, a "reset" button, the
  editor body, and an "edit JSON →" escape hatch.
- `ArgsEditor.tsx` — ported from `design/add-params-fn/args-editor.jsx`.
  Dispatches to one renderer per `ParamKind`. Internal toggle for raw-JSON
  advanced mode.
- `field-renderers/` — one file per kind: `IntegerField`, `NumberField`,
  `StringField`, `BooleanField`, `EnumField`, `DateField`, `ArrayField`,
  `RegexField`. Each is a controlled input that calls
  `onChange(value | undefined)`; `undefined` removes the key (so the prop
  falls back to faker's own default).

Wire-up in [`FakerCell.tsx`](../../../apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx):

```
[ string.uuid          ▾ ] [ ARGS ]     ← no args set, ARGS in muted style
[ commerce.price       ▾ ] [   2  ]     ← 2 args set, chip filled
```

The chip is **hidden** when:

- `value` is empty, or starts with `$ref:` / `$fn:`.
- The catalog entry has `shape: 'none'`.

The chip shows the "no args" affordance when the method has params but
`fakerArgs` is unset. Catalog lookup is `FAKER_CATALOG[value]`. If missing
(method exists in `FAKER_GROUPS` but not the catalog — should only happen
pre-audit-fix or for legacy data), the chip opens a raw-JSON-only editor with
an amber notice.

#### Editor → prop serialization

Editor internal state is `{ [paramName]: value }` regardless of shape. On
`onChange` to the parent prop:

- `shape === 'options'` → emit the object as-is, dropping keys whose value is
  `undefined`.
- `shape === 'positional'` → emit a dense array in `catalog.params` order,
  trimming trailing `undefined`.
- Empty object / empty array → emit `undefined`, removing `fakerArgs` from
  the prop.

#### Method-swap behaviour

When the user picks a new faker method in the FakerCell, the same dispatch
that sets `faker` also clears `fakerArgs` — single reducer step, no race.

#### Validation

A FakerCell is marked invalid (red border on the trigger, red ring on the
ARGS chip) if `faker` is set and `fakerArgs` violates catalog constraints:

- `min` > `max` for paired numeric params.
- `enum` value not in `options`.
- Required positional parameter missing.

Validation is pure client-side. The engine receives the same args either
way; a server-side dry-run still surfaces the same error via
`faker_call_failed`.

### 5. Version lock

Pin `@faker-js/faker` to exact `9.3.0` everywhere it is depended on:

- [`packages/fakerjs/package.json`](../../../packages/fakerjs/package.json):
  `"^9.3.0"` → `"9.3.0"`.
- [`packages/engine/package.json`](../../../packages/engine/) (imports faker
  directly at [`faker-engine.ts:1`](../../../packages/engine/src/faker-engine.ts)).
- Any other workspace that imports faker (grep on implementation).

`pnpm-lock.yaml` is regenerated once after the pin. CI continues to use
`pnpm install --frozen-lockfile`.

If `renovate.json` exists in the repo, add a package rule so faker bumps are
grouped, require manual review, and never auto-merge:

```jsonc
{
  "packageRules": [
    {
      "matchPackageNames": ["@faker-js/faker"],
      "groupName": "faker (manual review)",
      "automerge": false
    }
  ]
}
```

If no renovate config exists, skip this — the exact pin + frozen lockfile
already prevents drift.

## Rollout

One PR per step. Each is independently ship-able.

1. **Lock faker** — caret → exact `9.3.0` in `packages/fakerjs` and
   `packages/engine`; regenerate `pnpm-lock.yaml`. Zero behaviour change.
2. **Catalog generator + catalog file** — extend `generate-registry.mjs` to
   emit `FAKER_REGISTRY`; add `registry.overrides.ts`; add
   `merge-catalog.mjs`; commit `catalog.generated.ts`; add the audit test.
   Pure additive in `@mirage/fakerjs`; no consumers yet.
3. **API + storage** — add `fakerArgs?: object` to OpenAPI `SchemaProp`;
   regenerate types; add BFF / workspace-svc validation (only-when-faker-set,
   ≤ 4 KB). Data round-trips, engine ignores.
4. **Engine wiring** — add `args?` to `fakerEngine.call`; pass `p.fakerArgs`
   from `generate-rows.ts` and `dry-run.ts`. Backwards-compatible: props
   without `fakerArgs` behave exactly as before.
5. **UI** — add `ArgsChip`, `ArgsPopover`, `ArgsEditor`, eight field
   renderers; wire into `FakerCell.tsx`. First user-visible step.

## Testing

- **Unit (`@mirage/fakerjs`)**: catalog generator produces stable output for
  the pinned faker version; audit test catches missing / extra entries; merge
  correctly applies overrides per kind.
- **Unit (`@mirage/engine`)**:
  `fakerEngine.call('commerce.price', { min: 10, max: 20 })` returns a value
  in range across N seeds; positional methods
  (`person.firstName('female')`) receive args correctly; bad args
  (`{ min: 100, max: 10 }`) surface as `faker_call_failed` with `fieldPath`.
- **Integration**: dry-run a schema with `commerce.price` + custom args,
  assert generated rows respect bounds.
- **UI**: each field renderer unit-tested for value → `onChange` round-trip;
  method-swap clears args; ARGS chip shows correct count; invalid args mark
  the cell.

## Migration

Zero migration. Existing rows have `fakerArgs` absent → engine spreads `[]` →
behaves identically to today.
