# Value templates — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `SchemaProp.faker` + `SchemaProp.fakerArgs` with `SchemaProp.value: ValueExpr` — a discriminated-union AST that mixes literal text, sibling-field refs, inline faker calls, cross-schema refs, and custom-fn calls in one property.

**Architecture:** Clean break, no migration. Six phases (types → engine → BFF → web lib → web UI → e2e fixtures). Intermediate commits will not type-check; the repo is green only after Phase 6. Tests are pure-logic only (vitest, no jsdom). UI component / e2e behaviour testing is explicitly out of scope.

**Tech Stack:** TypeScript across the monorepo. Vitest. React 19 (web). Existing `@mirage/fakerjs` catalog and `@mirage/engine` evaluator. OpenAPI YAML → generated `.ts` types.

**Spec:** [docs/superpowers/specs/2026-05-22-value-templates-design.md](../specs/2026-05-22-value-templates-design.md)

---

## Phase 0 — Baseline

### Task 0: Confirm the repo is green before starting

**Files:** none

- [ ] **Step 1: Run all tests**

```bash
pnpm -r test
```

Expected: all packages pass. If anything is red, stop and fix it first — every later step's "this should pass" assertion assumes a clean baseline.

- [ ] **Step 2: Type-check the web app**

```bash
npx tsc -p apps/web/tsconfig.json --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit (nothing to commit, just record the baseline)**

```bash
git log -1 --oneline
```

Record the baseline SHA somewhere; you'll come back to it at the very end to confirm everything between then and now is required.

---

## Phase 1 — Type model

### Task 1: Define `ValueExpr` in OpenAPI YAML

**Files:**
- Modify: `packages/types/openapi.yaml:629-660` (the `SchemaProp` block)

- [ ] **Step 1: Edit the YAML**

Replace the `faker` + `fakerArgs` properties on `SchemaProp` with a single `value` property. Add `ValueSegment` and `ValueExpr` schemas alongside `SchemaProp`.

```yaml
    SchemaProp:
      type: object
      required: [name, type, required]
      additionalProperties: false
      properties:
        name: { type: string }
        type:
          type: string
          enum: [string, number, integer, boolean, object, array]
        format:
          type: string
          enum: [uuid, email, date, date-time]
        required: { type: boolean }
        value:
          $ref: '#/components/schemas/ValueExpr'
        fields:
          type: array
          items:
            $ref: '#/components/schemas/SchemaProp'
        items:
          $ref: '#/components/schemas/SchemaProp'

    ValueExpr:
      type: array
      minItems: 1
      items:
        $ref: '#/components/schemas/ValueSegment'

    ValueSegment:
      oneOf:
        - type: object
          required: [kind, text]
          additionalProperties: false
          properties:
            kind: { type: string, enum: [text] }
            text: { type: string }
        - type: object
          required: [kind, name]
          additionalProperties: false
          properties:
            kind: { type: string, enum: [field] }
            name: { type: string }
        - type: object
          required: [kind, method]
          additionalProperties: false
          properties:
            kind: { type: string, enum: [method] }
            method: { type: string }
            args:
              oneOf:
                - type: object
                  additionalProperties: true
                - type: array
                  items: {}
        - type: object
          required: [kind, target]
          additionalProperties: false
          properties:
            kind: { type: string, enum: [ref] }
            target: { type: string }
        - type: object
          required: [kind, id]
          additionalProperties: false
          properties:
            kind: { type: string, enum: [fn] }
            id: { type: string }
```

- [ ] **Step 2: Regenerate types**

```bash
pnpm --filter @mirage/types gen:openapi
```

Expected: `packages/types/src/openapi.generated.ts` is rewritten. `git diff` shows `faker` / `fakerArgs` gone from `SchemaProp` and `ValueExpr` / `ValueSegment` added.

- [ ] **Step 3: Commit**

```bash
git add packages/types
git commit -m "feat(types): replace SchemaProp.faker/fakerArgs with value: ValueExpr"
```

After this commit, the rest of the monorepo will fail to type-check. That's expected — Phases 2–5 fix it in order.

---

### Task 2: Create `valueExpr.ts` helper module

**Files:**
- Create: `packages/types/src/valueExpr.ts`
- Create: `packages/types/src/__tests__/valueExpr.test.ts`
- Modify: `packages/types/src/index.ts` (export the new module)

The helper centralises pure-logic operations on `ValueExpr`: constructors, the `extractRefs` walk used by validation and edge-extraction, and a `canonicalize` step that coalesces adjacent text segments.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/types/src/__tests__/valueExpr.test.ts
import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  isPureMethod,
  isPureRef,
  isPureFn,
  extractFieldRefs,
  extractCrossSchemaRefs,
  extractFnIds,
  extractMethods,
  type ValueExpr,
} from '../valueExpr.js';

describe('canonicalize', () => {
  it('coalesces adjacent text segments', () => {
    const v: ValueExpr = [
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'b' },
      { kind: 'field', name: 'x' },
      { kind: 'text', text: 'c' },
      { kind: 'text', text: 'd' },
    ];
    expect(canonicalize(v)).toEqual([
      { kind: 'text', text: 'ab' },
      { kind: 'field', name: 'x' },
      { kind: 'text', text: 'cd' },
    ]);
  });
  it('drops empty text segments', () => {
    const v: ValueExpr = [{ kind: 'text', text: '' }, { kind: 'field', name: 'x' }];
    expect(canonicalize(v)).toEqual([{ kind: 'field', name: 'x' }]);
  });
  it('returns the original if already canonical', () => {
    const v: ValueExpr = [{ kind: 'field', name: 'x' }];
    expect(canonicalize(v)).toEqual(v);
  });
});

describe('isPure* predicates', () => {
  it('identifies a pure method', () => {
    expect(isPureMethod([{ kind: 'method', method: 'internet.email' }])).toBe(true);
    expect(isPureMethod([
      { kind: 'method', method: 'internet.email' },
      { kind: 'text', text: 'x' },
    ])).toBe(false);
  });
  it('identifies a pure ref', () => {
    expect(isPureRef([{ kind: 'ref', target: 'user.email' }])).toBe(true);
  });
  it('identifies a pure fn', () => {
    expect(isPureFn([{ kind: 'fn', id: 'abc' }])).toBe(true);
  });
});

describe('extractors', () => {
  const v: ValueExpr = [
    { kind: 'text', text: 'Hi ' },
    { kind: 'field', name: 'fname' },
    { kind: 'text', text: ' ' },
    { kind: 'method', method: 'internet.email' },
    { kind: 'ref', target: 'user.email' },
    { kind: 'fn', id: 'abc' },
  ];
  it('extracts field names', () => {
    expect(extractFieldRefs(v)).toEqual(['fname']);
  });
  it('extracts cross-schema ref targets', () => {
    expect(extractCrossSchemaRefs(v)).toEqual(['user.email']);
  });
  it('extracts fn ids', () => {
    expect(extractFnIds(v)).toEqual(['abc']);
  });
  it('extracts method segments', () => {
    expect(extractMethods(v)).toEqual([{ method: 'internet.email' }]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @mirage/types test
```

Expected: every test fails with "module not found" or similar.

- [ ] **Step 3: Implement the helper**

```ts
// packages/types/src/valueExpr.ts
import type { components } from './openapi.generated.js';

export type ValueExpr = components['schemas']['ValueExpr'];
export type ValueSegment = components['schemas']['ValueSegment'];

export type TextSegment   = Extract<ValueSegment, { kind: 'text' }>;
export type FieldSegment  = Extract<ValueSegment, { kind: 'field' }>;
export type MethodSegment = Extract<ValueSegment, { kind: 'method' }>;
export type RefSegment    = Extract<ValueSegment, { kind: 'ref' }>;
export type FnSegment     = Extract<ValueSegment, { kind: 'fn' }>;

/** Coalesce adjacent text segments and drop empty ones. */
export function canonicalize(v: ValueExpr): ValueExpr {
  const out: ValueSegment[] = [];
  for (const seg of v) {
    if (seg.kind === 'text') {
      if (seg.text === '') continue;
      const last = out[out.length - 1];
      if (last && last.kind === 'text') {
        out[out.length - 1] = { kind: 'text', text: last.text + seg.text };
        continue;
      }
    }
    out.push(seg);
  }
  return out;
}

export function isPureMethod(v: ValueExpr): v is [MethodSegment] {
  return v.length === 1 && v[0]!.kind === 'method';
}
export function isPureRef(v: ValueExpr): v is [RefSegment] {
  return v.length === 1 && v[0]!.kind === 'ref';
}
export function isPureFn(v: ValueExpr): v is [FnSegment] {
  return v.length === 1 && v[0]!.kind === 'fn';
}

export function extractFieldRefs(v: ValueExpr): string[] {
  return v.flatMap((s) => (s.kind === 'field' ? [s.name] : []));
}
export function extractCrossSchemaRefs(v: ValueExpr): string[] {
  return v.flatMap((s) => (s.kind === 'ref' ? [s.target] : []));
}
export function extractFnIds(v: ValueExpr): string[] {
  return v.flatMap((s) => (s.kind === 'fn' ? [s.id] : []));
}
export function extractMethods(v: ValueExpr): { method: string; args?: MethodSegment['args'] }[] {
  return v.flatMap((s) =>
    s.kind === 'method' ? [{ method: s.method, ...(s.args !== undefined ? { args: s.args } : {}) }] : [],
  );
}
```

- [ ] **Step 4: Export from the package**

Add to `packages/types/src/index.ts`:

```ts
export * from './valueExpr.js';
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter @mirage/types test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/types
git commit -m "feat(types): add valueExpr helper module with canonicalize/extractors"
```

---

## Phase 2 — Engine

### Task 3: Replace `resolveProp` with a segment evaluator

**Files:**
- Modify: `packages/engine/src/generate-rows.ts:12-13,92-126` (delete `REF_RE`/`FN_RE` regexes; replace `resolveProp`'s scalar branch)
- Modify: `packages/engine/src/__tests__/generate-rows.test.ts:32-90` (update fixtures from `faker:`/`fakerArgs:` to `value:`)

- [ ] **Step 1: Write failing tests for the new evaluator**

Add to `generate-rows.test.ts`:

```ts
describe('value-template evaluation', () => {
  it('single text segment returns the literal', () => {
    const prop = { name: 'fixed', type: 'string', required: true,
      value: [{ kind: 'text', text: 'hello' }] };
    expect(evaluatePropAtPath(prop, /* ctx */)).toBe('hello');
  });
  it('single method segment preserves the native type', () => {
    const prop = { name: 'n', type: 'integer', required: true,
      value: [{ kind: 'method', method: 'number.int', args: { min: 1, max: 1 } }] };
    expect(evaluatePropAtPath(prop, ctx)).toBe(1);
  });
  it('multi-segment stringifies and concatenates', () => {
    const row = { fname: 'Ada', lname: 'Lovelace' };
    const prop = { name: 'email', type: 'string', required: true, value: [
      { kind: 'field', name: 'fname' },
      { kind: 'text', text: '.' },
      { kind: 'field', name: 'lname' },
      { kind: 'text', text: '@acme.com' },
    ]};
    // Sibling values resolved via the existing row-eval order
    expect(evaluatePropAtPath(prop, ctxWithRow(row))).toBe('Ada.Lovelace@acme.com');
  });
  it('dotted field path resolves nested object siblings', () => {
    // {{address.city}} resolves to row.address.city
  });
  it('null/undefined field values coerce to empty string in multi-segment', () => {
  });
});
```

(Fill in the assertions using whatever ctx helper `generate-rows.test.ts` already uses — read the existing test file before authoring these to match its style.)

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @mirage/engine test
```

Expected: new tests fail with "value is undefined" / "REF_RE not defined" after we tear out the regexes.

- [ ] **Step 3: Audit the current row-evaluation order**

Read the existing `generate-rows.ts` top-to-bottom and note the order in which sibling properties get evaluated. Today the loop evaluates props in declaration order — that works for the existing `$ref:` case (which resolves against fully-generated *previous schemas*, not siblings) but breaks for sibling-field templates (a template like `{{lname}}@x` declared before `lname` would see `undefined`).

The implementer must replace the in-order loop with **lazy memoised recursion**:

```ts
type RowMemo = Map<string /* prop name */, unknown>;

function evalRow(rowProps: SchemaProp[], ctx: Ctx): Record<string, unknown> {
  const memo: RowMemo = new Map();
  const evaluating = new Set<string>();
  const byName = new Map(rowProps.map((p) => [p.name, p] as const));

  const evalNamed = (name: string): unknown => {
    if (memo.has(name)) return memo.get(name);
    if (evaluating.has(name)) {
      throw new EngineError('value_cycle', { fieldPath: ctx.fieldPath, cycle: [...evaluating, name] });
    }
    const p = byName.get(name);
    if (!p) return undefined;
    evaluating.add(name);
    const v = resolveProp(p, { ...ctx, evalNamed }); // pass evalNamed in ctx for field-segment resolution
    evaluating.delete(name);
    memo.set(name, v);
    return v;
  };

  for (const p of rowProps) evalNamed(p.name);
  return Object.fromEntries(memo);
}
```

Wire `evalNamed` into `ctx` so the `field` segment evaluator (next step) can call it.

- [ ] **Step 4: Implement the evaluator**

Replace the bottom half of `resolveProp` in `generate-rows.ts` (lines ~92–126) with:

```ts
if (!Array.isArray(p.value) || p.value.length === 0) return null;

// Memoised sibling resolution
const evalSegment = (seg: ValueSegment): unknown => {
  switch (seg.kind) {
    case 'text':
      return seg.text;
    case 'field':
      return resolveSiblingByDottedPath(seg.name, ctx);
    case 'method':
      return ctx.fakerEngine.call(seg.method, seg.args);
    case 'ref':
      return { __ref: true, toSchemaKey: seg.target.split('.')[0]!, fromFieldPath: ctx.fieldPath } as RefPlaceholder;
    case 'fn': {
      const entry = ctx.customFunctions.get(seg.id);
      if (!entry) throw new EngineError('fn_target_missing', { fieldPath: ctx.fieldPath, functionId: seg.id });
      if (entry.usage === 'strategy') throw new EngineError('fn_usage_mismatch', { fieldPath: ctx.fieldPath, functionId: seg.id, usage: entry.usage });
      const seedBase = hashSeed(ctx.salt, ctx.schemaKey, String(ctx.rowIndex), ctx.fieldPath);
      return ctx.sandbox.invoke(entry.source, {
        __fakerSeed: seedBase,
        __fakerLocale: ctx.locale,
        __rngSeed: seedBase ^ 0x9e3779b9,
        salt: ctx.salt,
      });
    }
  }
};

if (p.value.length === 1) return evalSegment(p.value[0]!);
return p.value.map((s) => {
  const v = evalSegment(s);
  return v == null ? '' : String(v);
}).join('');
```

Also: remove `REF_RE`/`FN_RE` declarations at the top of the file. Add `resolveSiblingByDottedPath` as a helper that walks the in-progress row map (the existing `ctx` already carries the partial row used for refs — verify by reading the existing `dry-run.ts` for the same pattern).

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter @mirage/engine test --run generate-rows
```

Expected: all `value-template evaluation` tests pass plus existing `generate-rows` tests once the fixtures are updated in the same edit.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/generate-rows.ts packages/engine/src/__tests__/generate-rows.test.ts
git commit -m "feat(engine): evaluate SchemaProp.value as a segment AST"
```

---

### Task 4: Update `extract-set-edges` to walk `value`

**Files:**
- Modify: `packages/engine/src/extract-set-edges.ts:41,67-68` (remove `REF_RE`, switch to segment walk)
- Modify: `packages/engine/src/__tests__/extract-set-edges.test.ts` (update fixtures)

- [ ] **Step 1: Update the test fixtures**

Every fixture that has `{ faker: '$ref:user.email' }` becomes `{ value: [{ kind: 'ref', target: 'user.email' }] }`.

- [ ] **Step 2: Replace the walker body**

```ts
import { extractCrossSchemaRefs } from '@mirage/types';

// inside walk(props, ...):
if (Array.isArray(p.value)) {
  for (const target of extractCrossSchemaRefs(p.value)) {
    const toKey = target.split('.')[0]!;
    edges.push({ from: schemaKey, to: toKey, fieldPath });
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @mirage/engine test --run extract-set-edges
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/extract-set-edges.ts packages/engine/src/__tests__/extract-set-edges.test.ts
git commit -m "refactor(engine): extract-set-edges walks value segments"
```

---

### Task 5: Update `extract-fn-refs` to walk `value`

**Files:**
- Modify: `packages/engine/src/extract-fn-refs.ts:19,32-35`
- Modify: `packages/engine/src/__tests__/` (the fn-refs test if it exists)

- [ ] **Step 1: Update test fixtures**

Fixtures with `{ faker: '$fn:abc' }` become `{ value: [{ kind: 'fn', id: 'abc' }] }`.

- [ ] **Step 2: Replace the walker**

```ts
import { extractFnIds } from '@mirage/types';

if (Array.isArray(p.value)) {
  for (const id of extractFnIds(p.value)) out.add(id);
}
```

Delete the `FN_RE` constant.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @mirage/engine test --run extract-fn-refs
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/extract-fn-refs.ts packages/engine/src/__tests__
git commit -m "refactor(engine): extract-fn-refs walks value segments"
```

---

### Task 6: Update `dry-run` ref collection

**Files:**
- Modify: `packages/engine/src/dry-run.ts:10,27-41,76-100`
- Modify: `packages/engine/src/__tests__/dry-run.test.ts`

- [ ] **Step 1: Update test fixtures**

- [ ] **Step 2: Replace `collectRefKeys` body**

```ts
import { extractCrossSchemaRefs } from '@mirage/types';

// in walk:
if (Array.isArray(p.value)) {
  for (const t of extractCrossSchemaRefs(p.value)) {
    out.add(t.split('.')[0]!);
  }
}
```

- [ ] **Step 3: Replace `substituteRefsForRow`**

The function currently parses `p.faker` to find which fields are refs. Switch to checking if `p.value` has any `ref` kind segment. For a pure-ref property, substitute the resolved value; for a mixed template, the engine evaluator already handles it — so this fn only needs to handle the pure-ref case.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @mirage/engine test --run dry-run
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dry-run.ts packages/engine/src/__tests__/dry-run.test.ts
git commit -m "refactor(engine): dry-run walks value segments"
```

---

### Task 7: Update `classify-ref-edges` (if it touches `faker`)

**Files:**
- Modify: `packages/engine/src/classify-ref-edges.ts` (read it first; if it has no `faker` reference, skip)
- Modify: corresponding test

- [ ] **Step 1: Audit the file**

```bash
grep -n "faker\|REF_RE\|FN_RE" packages/engine/src/classify-ref-edges.ts
```

If no matches, mark this task complete with a note and move on. Otherwise:

- [ ] **Step 2: Replace any `p.faker` parsing with segment-based walks**

Use `extractCrossSchemaRefs` from `@mirage/types`.

- [ ] **Step 3: Update fixtures + run tests**

```bash
pnpm --filter @mirage/engine test --run classify-ref-edges
```

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/classify-ref-edges.ts packages/engine/src/__tests__/classify-ref-edges.test.ts
git commit -m "refactor(engine): classify-ref-edges walks value segments"
```

---

### Task 8: Sweep remaining engine fixtures

**Files:**
- Modify: `packages/engine/src/__tests__/plan-run-set.test.ts`
- Modify: `packages/engine/src/__tests__/run-set-stream.test.ts`
- Modify: any other engine test whose fixtures use `faker:`/`fakerArgs:`

- [ ] **Step 1: Find every fixture**

```bash
grep -rn "faker:\|fakerArgs" packages/engine/src
```

- [ ] **Step 2: Convert each fixture to the `value` shape**

Mapping cheat-sheet:
| Old | New |
|---|---|
| `faker: 'X', fakerArgs: A` | `value: [{ kind: 'method', method: 'X', args: A }]` (omit `args` when no args) |
| `faker: '$ref:T'` | `value: [{ kind: 'ref', target: 'T' }]` |
| `faker: '$fn:I'` | `value: [{ kind: 'fn', id: 'I' }]` |

- [ ] **Step 3: Run the full engine suite**

```bash
pnpm --filter @mirage/engine test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/engine
git commit -m "test(engine): convert remaining fixtures to value segments"
```

---

## Phase 3 — BFF

### Task 9: Delete `validate-faker-args.ts`, rewrite schema validation

**Files:**
- Delete: `apps/workspace-svc/src/routes/validate-faker-args.ts`
- Delete: `apps/workspace-svc/src/routes/__tests__/schemas-faker-args.test.ts`
- Modify: `apps/workspace-svc/src/routes/schemas.ts:31,33,66,87,95-97`
- Create: `apps/workspace-svc/src/routes/validate-value-expr.ts`
- Create: `apps/workspace-svc/src/routes/__tests__/validate-value-expr.test.ts`

- [ ] **Step 1: Write tests for the new BFF validator**

```ts
// validate-value-expr.test.ts
import { describe, it, expect } from 'vitest';
import { validateValueExpr } from '../validate-value-expr.js';
import { FAKER_CATALOG } from '@mirage/fakerjs';

describe('validateValueExpr', () => {
  it('accepts a pure method', () => {
    expect(validateValueExpr([{ kind: 'method', method: 'internet.email' }], FAKER_CATALOG))
      .toBeNull();
  });
  it('rejects an unknown method', () => {
    const err = validateValueExpr([{ kind: 'method', method: 'nope.unknown' }], FAKER_CATALOG);
    expect(err?.kind).toBe('tpl_method_unknown');
  });
  it('rejects an empty value array', () => {
    expect(validateValueExpr([], FAKER_CATALOG)?.kind).toBe('tpl_empty');
  });
  it('accepts a mixed template', () => {
    expect(validateValueExpr([
      { kind: 'field', name: 'fname' },
      { kind: 'text', text: '.' },
      { kind: 'field', name: 'lname' },
    ], FAKER_CATALOG)).toBeNull();
  });
  it('rejects invalid method args', () => {
    const err = validateValueExpr([{
      kind: 'method', method: 'number.int', args: { min: 100, max: 1 },
    }], FAKER_CATALOG);
    expect(err?.kind).toBe('tpl_args_invalid');
  });
});
```

Note: BFF validation deliberately does NOT check field-ref / cross-schema-ref / fn-id existence — those depend on the broader schema graph and are checked by `validateTree` on the web side and by the engine at run time. BFF validates only what's self-contained in the segment.

- [ ] **Step 2: Run tests; confirm they fail**

```bash
pnpm --filter @mirage/workspace-svc test --run validate-value-expr
```

- [ ] **Step 3: Implement the validator**

```ts
// validate-value-expr.ts
import type { ValueExpr, FakerCatalog } from '@mirage/types'; // adjust import path
import { validateArgs } from './validate-args.js'; // reuse method-args validation if it exists at BFF level; otherwise inline it

export type ValueExprIssue =
  | { kind: 'tpl_empty' }
  | { kind: 'tpl_method_unknown'; method: string }
  | { kind: 'tpl_args_invalid'; method: string; message: string };

export function validateValueExpr(v: ValueExpr, catalog: FakerCatalog): ValueExprIssue | null {
  if (!Array.isArray(v) || v.length === 0) return { kind: 'tpl_empty' };
  for (const seg of v) {
    if (seg.kind === 'method') {
      const entry = catalog[seg.method];
      if (!entry) return { kind: 'tpl_method_unknown', method: seg.method };
      const issue = validateArgs(entry, normaliseArgs(seg.args));
      if (issue) return { kind: 'tpl_args_invalid', method: seg.method, message: issue.message };
    }
  }
  return null;
}
```

- [ ] **Step 4: Update `schemas.ts` to call the new validator**

In `apps/workspace-svc/src/routes/schemas.ts`:
- Remove `REF_RE` and `FN_PREFIX_RE` constants.
- Remove the `validateFakerArgs` import.
- In `validateProps`, call `validateValueExpr(p.value, catalog)` if `p.value` is defined.
- In `collectFnRefs`, walk segments instead of regex-matching `p.faker`:

```ts
import { extractFnIds } from '@mirage/types';

const fnIds = new Set<string>();
for (const p of allLeafProps(schema)) {
  if (Array.isArray(p.value)) for (const id of extractFnIds(p.value)) fnIds.add(id);
}
```

- [ ] **Step 5: Delete the obsolete files**

```bash
git rm apps/workspace-svc/src/routes/validate-faker-args.ts
git rm apps/workspace-svc/src/routes/__tests__/schemas-faker-args.test.ts
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @mirage/workspace-svc test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/workspace-svc
git commit -m "feat(bff): validate SchemaProp.value, drop fakerArgs validator"
```

---

## Phase 4 — Web lib

### Task 10: Drop `REF_PREFIX` / `FN_PREFIX` constants

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/lib/types.ts:58-59`

- [ ] **Step 1: Delete the constants**

Remove the `export const REF_PREFIX = '$ref:'` and `export const FN_PREFIX = '$fn:'` lines. Leave `PROP_NAME_RE` and `FAKER_GROUPS` in place.

- [ ] **Step 2: Don't commit yet** — every consumer of these constants will fail to import. Tasks 11–13 fix the consumers.

---

### Task 11: Rewrite `validateTree.ts` with cycle detection

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/lib/validateTree.ts` (full rewrite)
- Create: `apps/web/src/pages/dashboard/schemas/lib/__tests__/validateTree.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// validateTree.test.ts
import { describe, it, expect } from 'vitest';
import { validateTree } from '../validateTree.js';
import type { SchemaProp } from '../types.js';

const row = (overrides: Partial<SchemaProp>): SchemaProp =>
  ({ name: 'x', type: 'string', required: false, ...overrides });

describe('validateTree', () => {
  const allKeys = new Set(['user']);

  it('flags missing sibling field ref', () => {
    const rows = [
      row({ name: 'email', value: [{ kind: 'field', name: 'ghost' }] }),
    ];
    expect(validateTree(rows, allKeys)).toEqual([
      { kind: 'tpl_field_missing', path: 'email', target: 'ghost' },
    ]);
  });

  it('flags container field ref without dotted path', () => {
    const rows = [
      row({ name: 'addr', type: 'object', fields: [row({ name: 'city' })] }),
      row({ name: 'email', value: [{ kind: 'field', name: 'addr' }] }),
    ];
    expect(validateTree(rows, allKeys))
      .toContainEqual({ kind: 'tpl_field_container', path: 'email', target: 'addr' });
  });

  it('resolves dotted paths into nested objects', () => {
    const rows = [
      row({ name: 'addr', type: 'object', fields: [row({ name: 'city' })] }),
      row({ name: 'email', value: [{ kind: 'field', name: 'addr.city' }] }),
    ];
    expect(validateTree(rows, allKeys)).toEqual([]);
  });

  it('flags 2-cycle', () => {
    const rows = [
      row({ name: 'a', value: [{ kind: 'field', name: 'b' }] }),
      row({ name: 'b', value: [{ kind: 'field', name: 'a' }] }),
    ];
    const issues = validateTree(rows, allKeys);
    expect(issues.filter((i) => i.kind === 'tpl_cycle').map((i) => i.path).sort())
      .toEqual(['a', 'b']);
  });

  it('flags 3-cycle', () => {
    const rows = [
      row({ name: 'a', value: [{ kind: 'field', name: 'b' }] }),
      row({ name: 'b', value: [{ kind: 'field', name: 'c' }] }),
      row({ name: 'c', value: [{ kind: 'field', name: 'a' }] }),
    ];
    const issues = validateTree(rows, allKeys);
    expect(issues.filter((i) => i.kind === 'tpl_cycle').map((i) => i.path).sort())
      .toEqual(['a', 'b', 'c']);
  });

  it('flags self-cycle', () => {
    const rows = [row({ name: 'a', value: [{ kind: 'field', name: 'a' }] })];
    expect(validateTree(rows, allKeys))
      .toContainEqual({ kind: 'tpl_cycle', path: 'a' });
  });

  it('flags missing cross-schema target', () => {
    const rows = [row({ name: 'x', value: [{ kind: 'ref', target: 'ghost.field' }] })];
    expect(validateTree(rows, allKeys))
      .toContainEqual({ kind: 'tpl_ref_missing', path: 'x', target: 'ghost.field' });
  });

  it('passes when value is undefined (no generator set)', () => {
    expect(validateTree([row({ name: 'x' })], allKeys)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests; confirm failure**

```bash
pnpm --filter @mirage/web test --run validateTree
```

- [ ] **Step 3: Implement**

Replace the file with:

```ts
// validateTree.ts (full rewrite)
import type { SchemaProp } from './types.js';
import { PROP_NAME_RE } from './types.js';
import { extractCrossSchemaRefs, extractFieldRefs } from '@mirage/types';

export type ValidationIssue =
  | { kind: 'name_invalid'; path: string }
  | { kind: 'name_duplicate'; path: string; sibling: string }
  | { kind: 'tpl_field_missing'; path: string; target: string }
  | { kind: 'tpl_field_container'; path: string; target: string }
  | { kind: 'tpl_field_dotted_missing'; path: string; target: string }
  | { kind: 'tpl_ref_missing'; path: string; target: string }
  | { kind: 'tpl_cycle'; path: string };

export function validateTree(
  rows: SchemaProp[],
  availableKeys: ReadonlySet<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Pass 1: name validity and per-segment target existence
  const siblingByName = new Map<string, SchemaProp>();
  const walk = (props: SchemaProp[], path: string): void => {
    const seen = new Set<string>();
    for (const p of props) {
      const here = path ? `${path}.${p.name}` : p.name;
      if (typeof p.name !== 'string' || !PROP_NAME_RE.test(p.name)) {
        issues.push({ kind: 'name_invalid', path: here });
      }
      if (seen.has(p.name)) issues.push({ kind: 'name_duplicate', path: here, sibling: p.name });
      else seen.add(p.name);
      if (path === '') siblingByName.set(p.name, p);

      if (Array.isArray(p.value)) {
        for (const fieldRef of extractFieldRefs(p.value)) {
          checkFieldRef(p, here, fieldRef, props, issues);
        }
        for (const refTarget of extractCrossSchemaRefs(p.value)) {
          const key = refTarget.split('.')[0]!;
          if (!availableKeys.has(key)) {
            issues.push({ kind: 'tpl_ref_missing', path: here, target: refTarget });
          }
        }
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, here);
      if (p.type === 'array' && p.items) walk([p.items], `${here}[]`);
    }
  };
  walk(rows, '');

  // Pass 2: cycle detection at the top level only
  for (const path of findCycles(rows)) {
    issues.push({ kind: 'tpl_cycle', path });
  }

  return issues;
}

function checkFieldRef(
  _owner: SchemaProp,
  ownerPath: string,
  fieldRef: string,
  siblings: SchemaProp[],
  issues: ValidationIssue[],
): void {
  const parts = fieldRef.split('.');
  const head = parts[0]!;
  const target = siblings.find((s) => s.name === head);
  if (!target) {
    issues.push({ kind: 'tpl_field_missing', path: ownerPath, target: fieldRef });
    return;
  }
  if (parts.length === 1) {
    if (target.type === 'object' || target.type === 'array') {
      issues.push({ kind: 'tpl_field_container', path: ownerPath, target: fieldRef });
    }
    return;
  }
  // dotted path: walk into the target
  let cursor: SchemaProp | undefined = target;
  for (let i = 1; i < parts.length; i++) {
    if (!cursor || cursor.type !== 'object' || !Array.isArray(cursor.fields)) {
      issues.push({ kind: 'tpl_field_dotted_missing', path: ownerPath, target: fieldRef });
      return;
    }
    cursor = cursor.fields.find((f) => f.name === parts[i]);
  }
  if (!cursor) {
    issues.push({ kind: 'tpl_field_dotted_missing', path: ownerPath, target: fieldRef });
  }
}

/** Tarjan SCC over top-level rows. Returns row names that participate in a cycle. */
function findCycles(rows: SchemaProp[]): string[] {
  const adj = new Map<string, string[]>();
  for (const r of rows) {
    if (!Array.isArray(r.value)) { adj.set(r.name, []); continue; }
    adj.set(r.name, extractFieldRefs(r.value).map((f) => f.split('.')[0]!));
  }

  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const inCycle = new Set<string>();

  const strongconnect = (v: string): void => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w) ?? Infinity));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }

    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); scc.push(w); } while (w !== v);
      if (scc.length > 1 || adj.get(v)?.includes(v)) {
        for (const n of scc) inCycle.add(n);
      }
    }
  };

  for (const r of rows) if (!idx.has(r.name)) strongconnect(r.name);
  return [...inCycle].sort();
}
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
pnpm --filter @mirage/web test --run validateTree
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/lib
git commit -m "feat(web): rewrite validateTree with cycle detection and template issues"
```

---

### Task 12: Update `rowToSchema` and `treeStats`

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/lib/rowToSchema.ts:2,24-30`
- Modify: `apps/web/src/pages/dashboard/schemas/lib/treeStats.ts:2,22`

- [ ] **Step 1: `rowToSchema` — read the new value shape**

The old code parsed `p.faker.startsWith('$ref:')` to mark a property as a `$ref` in JSON Schema. Replace with:

```ts
import { isPureRef } from '@mirage/types';

if (Array.isArray(p.value) && isPureRef(p.value)) {
  // emit JSON Schema $ref to the target
  out[p.name] = { $ref: `#/components/schemas/${p.value[0].target.split('.')[0]}` };
  continue;
}
// otherwise just emit the base type (no longer carrying faker semantics in JSON Schema)
```

- [ ] **Step 2: `treeStats` — count `ref` segments**

```ts
import { extractCrossSchemaRefs } from '@mirage/types';

let refCount = 0;
walk(rows, (p) => {
  if (Array.isArray(p.value)) refCount += extractCrossSchemaRefs(p.value).length;
});
```

- [ ] **Step 3: Run any tests for these files**

```bash
pnpm --filter @mirage/web test --run rowToSchema
pnpm --filter @mirage/web test --run treeStats
```

If tests don't exist, the type-check is the gate.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/lib
git commit -m "refactor(web): rowToSchema and treeStats read value segments"
```

---

## Phase 5 — Web UI

> The web UI from here on does NOT get new tests (per spec — pure logic only). Each task ends with manual verification: type-check and a brief description of what to click.

### Task 13: Delete `ArgsChip.tsx`

**Files:**
- Delete: `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsChip.tsx`

- [ ] **Step 1: Delete the file**

```bash
git rm apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsChip.tsx
```

Nothing else changes here — Task 14 will remove the import in `FakerCell.tsx`.

- [ ] **Step 2: Don't commit yet** — the delete leaves a dangling import. Combine with Task 14.

---

### Task 14: Rewrite `FakerCell.tsx` — shell + AST renderer

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx` (full rewrite)

This is the biggest task in the plan. It splits into four sub-steps because the rewrite is one file with several responsibilities.

- [ ] **Step 1: Define the new prop interface**

The old `FakerCell` took `value: string` + `fakerArgs`. The new one takes `value: ValueExpr | undefined` + `onValueChange`. Sketch:

```ts
export interface FakerCellProps {
  value: ValueExpr | undefined;
  onChange: (next: ValueExpr | undefined) => void;
  workspaceSchemas: Schema[];
  invalid: boolean;
  siblingFields: RefField[];
  ownFieldName: string;
  customFunctionsByWsId?: ...; // existing pattern
}
```

- [ ] **Step 2: Build the contentEditable shell that renders an AST**

Reuse the `RefMentionInput` logic from `field-renderers/RefMentionInput.tsx` as the starting point. The new cell renders chips for *all five* segment kinds (text excluded — text becomes raw text nodes). Color/iconography:

| Segment kind | Chip styling |
|---|---|
| `field` | violet dot, monospace `name` |
| `method` | violet pill, monospace `method` |
| `ref` | link icon (Link2) + monospace `target` |
| `fn` | code icon (Code2) + function name |

The AST → DOM render is `renderParts`. The DOM → AST read-back is a new function `readAst()` that walks `childNodes` and reads `dataset['kind']` and segment-specific data attrs (`dataset['ref']`, `dataset['method']`, …) plus text nodes.

Sketch of `readAst()`:

```ts
const readAst = (): ValueExpr => {
  const out: ValueSegment[] = [];
  ed.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent ?? '';
      if (t) out.push({ kind: 'text', text: t });
    } else if (n instanceof HTMLElement) {
      const k = n.dataset['kind'];
      if (k === 'field')  out.push({ kind: 'field',  name: n.dataset['name']! });
      if (k === 'method') out.push({
        kind: 'method',
        method: n.dataset['method']!,
        ...(n.dataset['args'] ? { args: JSON.parse(n.dataset['args']) } : {}),
      });
      if (k === 'ref')    out.push({ kind: 'ref',    target: n.dataset['target']! });
      if (k === 'fn')     out.push({ kind: 'fn',     id: n.dataset['id']! });
    }
  });
  return canonicalize(out);
};
```

Method-segment args are stashed in `dataset['args']` as JSON so the DOM stays self-describing. (Alternative: an off-DOM `Map<chipElement, args>`. Either is fine; `dataset` is simpler.)

- [ ] **Step 3: Wire the 4-section picker**

Extend `FieldPicker` from `RefMentionInput.tsx` (or create a sibling `SegmentPicker`) that takes four input lists and renders four labeled sections sharing one filter. Selecting an item emits a `ValueSegment`, which the cell inserts at the caret.

- [ ] **Step 4: Wire method-chip args**

On a method chip, attach `onClick` (capture phase) that opens the existing `ArgsPopover` anchored to the chip. The popover's `onChange` writes new args back to the chip's `dataset['args']` and triggers `emit()` so the AST flows out.

The existing `ArgsEditor` and `ArgsPopover` stay as-is — they were built for this and the @-mention work from the previous session lives inside them, which means a method chip's `firstName` arg can itself reference a sibling.

- [ ] **Step 5: Wire empty-cell affordances**

When the cell is empty AND the user clicks anywhere on it OR presses arrow-down, open the picker. The `@` trigger continues to work mid-text.

- [ ] **Step 6: Manual verify**

```bash
pnpm --filter @mirage/web dev
```

In the browser:
1. Create a schema with fields `fname`, `lname`, `email`.
2. Click the `email` cell. The picker opens. Type "email" and pick `internet.email`. The cell shows one method chip.
3. Click the chip. The args popover opens.
4. Type after the chip — chip stays, text follows.
5. Press `@`. The picker opens. Pick `fname`. A field chip is inserted.
6. Build `{{fname}}.{{lname}}@acme.com` and confirm the cell renders four chips and literal text correctly.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx \
        apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsChip.tsx
git commit -m "feat(web): FakerCell is now a template editor over ValueExpr"
```

---

### Task 15: Update `PropertyEditorRow.tsx` to thread `value`

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/PropertyEditor/PropertyEditorRow.tsx:143-165`

- [ ] **Step 1: Replace the `<FakerCell />` call site**

The old call passed `value={row.faker}`, `fakerArgs`, `onFakerArgsChange`, etc. The new call passes:

```tsx
<FakerCell
  value={(row as { value?: ValueExpr }).value}
  onChange={(next) =>
    updateRow((r) => {
      const u: SchemaProp = { ...r };
      if (next === undefined) delete (u as { value?: unknown }).value;
      else (u as { value?: unknown }).value = next;
      return u;
    })
  }
  workspaceSchemas={workspaceSchemas}
  invalid={false /* error-aware via row error props */}
  siblingFields={siblingFields}
  ownFieldName={row.name}
/>
```

Remove the now-unused `clearArgs` option from `onChange`. Remove the `fakerArgs` block entirely.

- [ ] **Step 2: Type-check**

```bash
npx tsc -p apps/web/tsconfig.json --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/PropertyEditorRow.tsx
git commit -m "refactor(web): PropertyEditorRow uses value/onChange API"
```

---

### Task 16: Update `EditTabContent.tsx`

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/EditTabContent.tsx:82,89,93,95`

- [ ] **Step 1: Replace `fakerArgs` reads/writes with `value` reads/writes**

The type-change-handler at line 82 deletes `fakerArgs` — change it to delete `value` instead. Reads of `fakerArgs` (lines 89, 93, 95) become reads of `value`. The `<FakerCell />` call here uses the same props as in Task 15.

- [ ] **Step 2: Type-check**

```bash
npx tsc -p apps/web/tsconfig.json --noEmit
```

- [ ] **Step 3: Manual verify**

In the side panel of a selected row, confirm the field still edits its faker/value as expected.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/SchemaSidePanel/EditTabContent.tsx
git commit -m "refactor(web): EditTabContent uses value field"
```

---

### Task 17: Audit `useSchemaBuffer.ts` and `Step1Details.tsx`

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/EditPane/useSchemaBuffer.ts` (only if it references `faker`/`fakerArgs`)
- Modify: `apps/web/src/pages/dashboard/schemas/CreateSchemaSheet/Step1Details.tsx` (likely just docs/comments)

- [ ] **Step 1: Audit**

```bash
grep -n "faker\|fakerArgs\|REF_PREFIX\|FN_PREFIX" \
  apps/web/src/pages/dashboard/schemas/EditPane/useSchemaBuffer.ts \
  apps/web/src/pages/dashboard/schemas/CreateSchemaSheet/Step1Details.tsx
```

- [ ] **Step 2: Update each match**

For `useSchemaBuffer.ts`: any property-shape narrowing or default-value scaffolding needs to switch from `faker`/`fakerArgs` to `value`. Default for a new leaf property: `value: undefined`.

For `Step1Details.tsx`: if it's only comments / docstrings mentioning `$ref:`, update the comments. If it's setting up initial schema rows, update the rows.

- [ ] **Step 3: Type-check**

```bash
npx tsc -p apps/web/tsconfig.json --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "refactor(web): purge faker/fakerArgs from remaining edit-pane code"
```

---

### Task 18: Update web args tests

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/__tests__/serialize.test.ts`

- [ ] **Step 1: Audit the test**

The old test exercised the row-level `fakerArgs` storage round-trip. The serializer module still exists for method-segment args inside templates, so the test stays but its scope narrows.

- [ ] **Step 2: Adjust as needed**

If fixtures referenced `row.faker` / `row.fakerArgs`, switch them to using the same `entry` + raw args directly. Drop any tests that depended on a row-level faker context (they should never have been there).

- [ ] **Step 3: Run**

```bash
pnpm --filter @mirage/web test
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/args
git commit -m "test(web): scope serialize tests to method-segment args"
```

---

## Phase 6 — E2E fixtures

### Task 19: Convert e2e fixtures to `value` segments

**Files:**
- Modify: `apps/e2e/src/fixtures.ts:41,58-59,111-112`
- Modify: `apps/e2e/src/soft-cycle.test.ts`
- Modify: `apps/e2e/src/run-pipeline.test.ts`
- Modify: `apps/e2e/src/diag-*.test.ts`
- Modify: `apps/e2e/src/run-1m-soak.test.ts`

- [ ] **Step 1: Find every fixture**

```bash
grep -rn "faker:\|fakerArgs" apps/e2e/src
```

- [ ] **Step 2: Convert using the cheat-sheet from Task 8**

| Old | New |
|---|---|
| `faker: 'X', fakerArgs: A` | `value: [{ kind: 'method', method: 'X', args: A }]` |
| `faker: '$ref:T'` | `value: [{ kind: 'ref', target: 'T' }]` |
| `faker: '$fn:I'` | `value: [{ kind: 'fn', id: 'I' }]` |

- [ ] **Step 3: Run the e2e suite (optional, slow)**

```bash
pnpm --filter @mirage/e2e test
```

Or skip if e2e is run only in CI — type-check is the immediate gate.

- [ ] **Step 4: Commit**

```bash
git add apps/e2e
git commit -m "test(e2e): convert fixtures to value segments"
```

---

## Phase 7 — Final verification

### Task 20: Full repo green-check

**Files:** none

- [ ] **Step 1: Run every test suite**

```bash
pnpm -r test
```

Expected: green across `@mirage/types`, `@mirage/engine`, `@mirage/fakerjs`, `@mirage/workspace-svc`, `@mirage/web`.

- [ ] **Step 2: Type-check every TS project**

```bash
pnpm -r exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Smoke-test the web app**

```bash
pnpm --filter @mirage/web dev
```

In the browser:
1. Open a schema. The Faker / $ref column header is unchanged (renaming is out of scope for this plan).
2. Each existing field shows either an empty cell (old data wiped) or the new chip representation.
3. Create three new fields: `fname` / `lname` / `email`.
4. On `email`, build `{{fname}}.{{lname}}@acme.com` via the picker.
5. Generate one record (via whatever preview/generate button the page exposes).
6. Confirm `email` evaluates to `<fnameValue>.<lnameValue>@acme.com`.

- [ ] **Step 4: Confirm no `faker:` / `fakerArgs` / `REF_PREFIX` / `FN_PREFIX` survives**

```bash
grep -rn "fakerArgs\|REF_PREFIX\|FN_PREFIX\|'\$ref:'\|'\$fn:'" \
  apps packages | grep -v node_modules | grep -v '.generated.' || echo "clean"
```

Expected: `clean`. Any survivors are missed call sites.

- [ ] **Step 5: Don't commit** — nothing changed in this task. If the smoke test surfaces a bug, file the fix in a follow-up task and re-run.

---

## Out of scope (do not do)

- Component tests with jsdom + Testing Library. Spec explicitly defers these.
- New e2e tests for the template feature. Only existing fixtures get migrated.
- Migration code from `faker` / `fakerArgs` to `value`. Old data is dropped.
- Renaming the "Faker / $ref" column header in the property editor (cosmetic; can land later).
- Storybook entries for the new cell.
- Toggle / tabs variants of the reference input from the design playground.

---

## Self-review notes

Spec sections cross-checked against tasks:

| Spec section | Task(s) |
|---|---|
| Data model — `ValueExpr` AST | Task 1, Task 2 |
| Storage break — no migration | Task 1 (drops fields), Task 13 (drops ArgsChip), Task 17 (sweeps remaining usages) |
| UI — template editor & picker | Task 14 |
| UI — method-chip args | Task 14 step 4 (reuses ArgsEditor/ArgsPopover) |
| Runtime — evalSegment / evalRow | Task 3 |
| Runtime — cycle handling (lazy memo) | Task 3 (memoised via existing row-eval order) |
| Runtime — type coercion | Task 3 (single vs multi-segment) |
| Validation — table of issue kinds | Task 9 (BFF) + Task 11 (web) |
| Validation — cycle detection (Tarjan) | Task 11 |
| Testing — pure logic only | Tasks 2, 3, 9, 11 carry the tests; UI tasks have manual verify |
