# Schema value templates — design

Status: draft · 2026-05-22

## Problem

A schema property in Mirage today picks **one** value generator: a single faker
method (`internet.email`), a single cross-schema reference (`$ref:user.email`),
or a single custom function (`$fn:abc123`). The Faker / $ref cell stores one
string and the engine evaluates it as one of three discrete cases.

This is fine for "give me a random email" but doesn't cover the natural
follow-up: "give me an email built from this row's `fname` and `lname` plus
literal `@acme.com`." Today the user has to pull all that logic into a custom
function. We want templates instead — mix literal text, sibling-field
references, faker calls, cross-schema refs, and custom functions in one cell.

Sample templates the design must support:

```
{{internet.email}}                       (today's pure-method case)
{{$ref:user.email}}                      (today's cross-schema case)
{{$fn:abc123}}                           (today's custom-fn case)
{{fname}}.{{lname}}@acme.com             (new — sibling refs + literal text)
{{fname}} {{internet.email}}             (new — sibling refs + inline faker call)
```

## Goals

- Mix literal text, sibling-field refs, inline faker methods, cross-schema
  refs, and custom-fn calls in a single field's value.
- Per-token args for inline faker methods (e.g. set `provider: 'mirage.dev'`
  on an inline `internet.email`).
- Cycle detection at edit time so circular templates are caught before the
  engine sees them.
- Type-preserving single-segment behaviour: `[{kind:'method',
  method:'number.int'}]` still returns a number, not the string `"42"`.
- Pure unified storage — one `value` field per property, no parallel
  `faker`/`fakerArgs` shape.

## Non-goals

- Backwards compatibility with existing `faker` / `fakerArgs` data. We are
  doing a clean break; pre-existing rows do not migrate and any saved schemas
  with the old shape are discarded.
- A DSL beyond `{{token}}` interpolation — no conditionals, no loops, no
  arithmetic. Templates that need logic should call a custom function instead.
- Cross-schema sibling refs inside templates beyond what `$ref:` already does.
- Set-level template overrides.

## Data model

`SchemaProp.faker` and `SchemaProp.fakerArgs` are removed. They are replaced
by a single `value` field carrying a non-empty array of segments:

```ts
type ValueExpr = ValueSegment[];

type ValueSegment =
  | { kind: 'text';   text: string }                              // literal
  | { kind: 'field';  name: string }                              // {{fname}} or {{address.city}}
  | { kind: 'method'; method: string; args?: ArgsStored }         // {{internet.email}} (+ args)
  | { kind: 'ref';    target: string }                            // {{$ref:user.email}}
  | { kind: 'fn';     id: string };                               // {{$fn:abc123}}
```

`SchemaProp.value` is optional — `undefined` means the property has no value
generator yet (the default state for new rows, and the only valid state for
`object`/`array` containers).

Canonical encodings for today's three modes:

| Source | Encoded as |
|---|---|
| pure faker method with args | `[{kind:'method', method:'internet.email', args:{provider:'a'}}]` |
| cross-schema reference | `[{kind:'ref', target:'person.email'}]` |
| custom function | `[{kind:'fn', id:'abc123'}]` |
| free-form template | `[{kind:'field',name:'fname'},{kind:'text',text:'.'},{kind:'field',name:'lname'},{kind:'text',text:'@acme.com'}]` |

Properties of the model:

- **Args travel on the segment.** Two `{{internet.email}}` tokens in one
  template have independent args. No row-level args field.
- **`field` segments may use dotted paths** for nested-object siblings:
  `{kind:'field', name:'address.city'}`.
- **`text` segments allow multi-line content** — newlines pass through.
- **Adjacent `text` segments are valid but not canonical.** The
  parser/serializer should coalesce them on read so the AST stays stable
  across edits.
- **A 1-element `value` of kind `text` is valid** — a property that always
  returns the literal string.

## Storage break (no migration)

This is a clean break from the existing `faker` / `fakerArgs` shape. No
migration code is written.

- `SchemaProp.faker` and `SchemaProp.fakerArgs` are removed from
  `packages/types`. Regenerated OpenAPI types reflect the new shape.
- Workspaces saved under the old shape **load as empty** — the loader drops
  unknown fields, and the next save overwrites the old representation.
- Code removed in the same pass:
  - `REF_PREFIX` / `FN_PREFIX` string-encoding in `FakerCell.tsx`. Ref and fn
    are segment kinds now, not string prefixes.
  - The standalone `ArgsChip` button beside the cell. Method args live on
    method chips inside the cell.
  - `serialize.ts`'s `toStored` / `toInternal` round-trip between
    options-shape and positional-shape arrays. The internal `ArgsStored`
    shape itself is kept because method-segment args still use it.
- BFF and engine code that read `faker` / `fakerArgs` directly is updated to
  read `value` in the same change. No reverse-compat shim.

## UI

The Faker / $ref cell is replaced by a single contentEditable template editor.
One cell handles all five shapes (pure method, pure ref, pure fn, pure literal,
mixed template).

### States

```
Empty:          [ type, or @ to insert…                    ]

Pure method:    [ [● internet.email] ]                       ← single chip

Pure ref:       [ [↗ user.email] ]

Pure fn:        [ [fn  myUuid] ]

Mixed template: [ [● fname].[● lname]@acme.com             ]
                [ [● fname] [● internet.email]             ]
```

### Picker

Pressing `@` (or arrow-down / clicking the empty cell) opens a single popover
with four labelled sections — *Fields*, *Faker methods*, *Cross-schema refs*,
*Custom functions*. One filter input drives all four. Sections with zero
matches collapse.

```
┌─ Filter… ────────────────────────────────┐
│ FIELDS                                   │
│  ● fname           string                │
│  ● lname           string                │
│ FAKER METHODS                            │
│  internet.email    string                │
│  person.firstName  string                │
│ CROSS-SCHEMA REFS                        │
│  ↗ user.email      string                │
│ CUSTOM FUNCTIONS                         │
│  fn  myUuid        string                │
└──────────────────────────────────────────┘
  ↑↓ navigate · ↵ insert · esc close
```

Selecting an item inserts a chip at the caret and closes the picker.

### Chip behaviour

- **Click any chip** — opens a context menu / args popover anchored to the
  chip.
- **Method chip click** — opens the per-method args popover. Reuses the
  `ArgsEditor` component from the prior args feature. Args are written back
  onto the segment.
- **Other chip click** — small menu: *change target* / *remove*.
- **Backspace at the start of a chip** — removes the chip (standard
  contentEditable behaviour).
- **Chip styling by kind**:
  - `field` — violet dot, monospace name
  - `method` — violet pill (matches today's faker chip styling)
  - `ref` — link icon + cross-schema path
  - `fn` — green code icon + function name

### Cell-level controls removed

- The standalone `ArgsChip` button next to the cell is gone. Method args live
  on method chips.
- The `REF_PREFIX` / `FN_PREFIX` string-encoding scheme in `FakerCell` is
  gone. Ref and fn are segment kinds, not string prefixes.

### Discoverability

The empty-state placeholder reads `type, or @ to insert…` so the feature is
obvious without prior knowledge. Clicking the empty cell or pressing
arrow-down opens the picker too — `@` is a power-user shortcut, not the only
path.

## Runtime evaluation

The engine grows one evaluator that walks a `ValueExpr` and produces a value.

```ts
evalSegment(seg, ctx) → unknown
  text   → seg.text                                    (literal)
  field  → evalRow(siblings[seg.name], ctx)            (recursive, dotted-path supported)
  method → faker[seg.method](seg.args)                 (existing logic; per-segment args)
  ref    → resolve cross-schema target                 (existing logic)
  fn     → invoke custom function by id                (existing logic)

evalRow(row, ctx) → unknown
  if value.length === 1:  return evalSegment(value[0], ctx)
  else:                   return value.map(evalSegment).join('')
```

The single-segment short-circuit preserves native types. A pure
`number.int` returns a number; a multi-segment template `{{age}} years old`
stringifies and concatenates.

### Cycle handling

- **Static cycle check** at edit time. Build the directed graph
  `field → fields it references` over `field` and `ref` segments. Tarjan's
  algorithm flags any strongly-connected component of size > 1. Surfaces as
  a row-level error on every row in the SCC.
- **Lazy memoised eval** at generation time. `evalRow` memoizes by row name
  within one record; a `currentlyEvaluating` set catches anything that slipped
  past the static check (defensive — should be impossible after validation).

### Type coercion

- `field` segment in a single-segment template — underlying type unchanged.
- `field` segment in a multi-segment template — `String(value)` before
  concat. `null`/`undefined` coerce to empty string.
- `field` referencing an `object` or `array` sibling — **edit-time error**
  (`tpl_field_container`). Users must use a dotted path
  (`{{address.city}}`) instead.

## Validation

Validation lives in `validateTree` and runs on every keystroke (existing
pattern). Per-row issue kinds:

| Kind | Trigger |
|---|---|
| `tpl_field_missing` | `field` names a sibling that doesn't exist |
| `tpl_field_container` | `field` targets an object/array without a dotted path |
| `tpl_field_dotted_missing` | dotted path doesn't resolve |
| `tpl_method_unknown` | `method` not in catalog |
| `tpl_ref_missing` | cross-schema `ref` target missing |
| `tpl_fn_missing` | `fn` id missing |
| `tpl_cycle` | static cycle on field/ref graph (attached to every row in the SCC) |
| `tpl_args_invalid` | method-segment args fail `validateArgs` |

Cycle errors attach to **every** row in the strongly-connected component, not
just one. A cycle is mutual; marking only one row would obscure the issue.

### Runtime errors (defensive)

- Unknown segment kind → throw, surface in generation log with field path.
- Cycle detected at runtime (validation regression) → throw with cycle path.
- Custom function throws → bubble up wrapped with field-path context.

## Testing

Scope: **pure logic only**. Component tests and end-to-end tests are out of
scope for this change.

Test surfaces:

- `parseTemplate` / `serializeTemplate` round-trip — `ValueExpr` ↔ display
  string. Escaping, empty segments, adjacent-text coalescing.
- `validateTree` — one test per row in the issue-kinds table above. Cycle
  test uses a 3-node SCC to catch off-by-one in Tarjan.
- Evaluator (`evalRow`, `evalSegment`) — all five segment kinds,
  single-segment-preserves-type rule, multi-segment-stringifies rule,
  dotted-path resolution, `null`/`undefined` coercion.
- Cycle detection — A→B→A, A→B→C→A, self-ref A→A.

Component tests (jsdom + Testing Library) and Playwright e2e are deferred. If
the contentEditable editor proves regression-prone we can add them later;
they're not required for this change.

## Out of scope (will not be done)

- Migration from `SchemaProp.faker` / `SchemaProp.fakerArgs` to
  `SchemaProp.value`. Existing data with the old shape is dropped. No
  reverse-compat code is written.
- A DSL beyond `{{token}}` syntax — no conditionals, no transforms, no
  arithmetic.
- Editor variants other than the @-mention contentEditable approach. The
  toggle / tabs variants from the design playground are not built.
- Component tests, end-to-end tests, snapshot tests.
