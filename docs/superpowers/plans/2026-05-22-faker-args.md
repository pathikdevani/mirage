# Faker Function Arguments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy (project-specific):** The repo owner has a strict "no auto-commit" rule. Do **not** run `git commit` automatically. At each "Commit" step, **stage** changes with `git add` and pause for explicit approval before committing. The Bash step will say `git add …` only; the executor must ask the user before running `git commit`.

**Goal:** Let users configure faker function arguments (range, format, enum, etc.) per Schema property, with a typed catalog of method signatures and a popover UI; lock `@faker-js/faker` to an exact version.

**Architecture:** A hybrid catalog (generator-derived skeleton + hand-written overrides) lives in `@mirage/fakerjs`. `SchemaProp` gains an opaque `fakerArgs?: object` field. The engine spreads it as positional or options args. The UI adds an `ARGS` chip next to the FakerCell that opens a popover with kind-specific field renderers.

**Tech Stack:** TypeScript, React 18, Vitest, Fastify, OpenAPI, `@faker-js/faker` v9.3.0, pnpm workspaces, Nx.

**Spec:** [docs/superpowers/specs/2026-05-22-faker-args-design.md](../specs/2026-05-22-faker-args-design.md)

---

## File Plan

### `packages/fakerjs/`
- **Modify** `package.json` — pin faker to exact `9.3.0`.
- **Modify** `scripts/generate-registry.mjs` — also emit `FAKER_REGISTRY` skeleton (param shapes inferred from `.d.ts`).
- **Create** `scripts/merge-catalog.mjs` — merges `registry.generated.ts` skeleton with `registry.overrides.ts` to produce `catalog.generated.ts`.
- **Create** `scripts/audit-catalog.test.ts` — Vitest test verifying catalog completeness.
- **Create** `src/types.ts` — public types (`MethodEntry`, `Param`, `ParamKind`).
- **Modify** `src/registry.generated.ts` — auto-generated, adds `FAKER_REGISTRY` export.
- **Create** `src/registry.overrides.ts` — hand-written param patches (labels, defaults, enum options, kind upgrades).
- **Create** `src/catalog.generated.ts` — auto-generated merged catalog.
- **Modify** `src/index.ts` — re-export `FAKER_CATALOG` and the new types.
- **Modify** `package.json` (nx target) — add `vitest` devDep and a `test` target for the audit.

### `packages/engine/` & `packages/sandbox/`
- **Modify** `packages/engine/package.json` — pin faker to `9.3.0`.
- **Modify** `packages/sandbox/package.json` — pin faker to `9.3.0`.
- **Modify** `packages/engine/src/faker-engine.ts` — `call(method, args?)`.
- **Modify** `packages/engine/src/generate-rows.ts` — pass `p.fakerArgs` to `call`.
- **Modify** `packages/engine/src/dry-run.ts` — pass `p.fakerArgs` to `call`.
- **Create** `packages/engine/src/__tests__/faker-engine.test.ts` — unit tests for arg spreading.
- **Modify** `packages/engine/src/__tests__/generate-rows.test.ts` — add a test exercising `fakerArgs`.

### `packages/types/`
- **Modify** `openapi.yaml` — add `fakerArgs` to `SchemaProp`.
- **Regenerate** `src/openapi.generated.ts` (script runs).

### `apps/workspace-svc/`
- **Modify** `src/routes/schemas.ts` — extend `validateProps` to enforce `fakerArgs` invariants (only when `faker` is a faker method, ≤ 4 KB JSON).
- **Create** `src/routes/__tests__/schemas-faker-args.test.ts` — validation tests (or co-locate per repo convention; see Task 11).

### `apps/web/`
- **Create** `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/field-renderers/IntegerField.tsx`
- **Create** `…/NumberField.tsx`
- **Create** `…/StringField.tsx`
- **Create** `…/BooleanField.tsx`
- **Create** `…/EnumField.tsx`
- **Create** `…/DateField.tsx`
- **Create** `…/ArrayField.tsx`
- **Create** `…/RegexField.tsx`
- **Create** `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsEditor.tsx`
- **Create** `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsPopover.tsx`
- **Create** `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsChip.tsx`
- **Create** `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/serialize.ts` — internal `{name: value}` ↔ stored shape.
- **Create** `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/validate.ts` — client-side catalog validation.
- **Modify** `apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx` — render chip; clear `fakerArgs` on method change.
- **Modify** `apps/web/src/pages/dashboard/schemas/PropertyEditor/PropertyRow.tsx` (or wherever `FakerCell` is rendered) — wire prop-level `fakerArgs` callback.

---

# PR 1 — Lock @faker-js/faker to 9.3.0

Goal: zero behaviour change. Caret-removed in every package that depends on faker, plus a regenerated lockfile.

### Task 1: Pin faker in all dependent package.json files

**Files:**
- Modify: `packages/fakerjs/package.json:12`
- Modify: `packages/engine/package.json:12`
- Modify: `packages/sandbox/package.json:13`

- [ ] **Step 1: Edit `packages/fakerjs/package.json`**

Change line 12:
```diff
-    "@faker-js/faker": "^9.3.0"
+    "@faker-js/faker": "9.3.0"
```

- [ ] **Step 2: Edit `packages/engine/package.json`**

Change line 12:
```diff
-    "@faker-js/faker": "^9.3.0",
+    "@faker-js/faker": "9.3.0",
```

- [ ] **Step 3: Edit `packages/sandbox/package.json`**

Change line 13:
```diff
-    "@faker-js/faker": "^9.3.0",
+    "@faker-js/faker": "9.3.0",
```

- [ ] **Step 4: Regenerate lockfile**

Run from repo root:
```bash
pnpm install
```
Expected: `pnpm-lock.yaml` updated; no other changes.

- [ ] **Step 5: Verify nothing broke**

Run:
```bash
pnpm -w typecheck && pnpm -w lint
```
Expected: both green.

- [ ] **Step 6: Stage**

```bash
git add packages/fakerjs/package.json packages/engine/package.json packages/sandbox/package.json pnpm-lock.yaml
```

Ask the user whether to commit with message:
```
chore: pin @faker-js/faker to exact 9.3.0
```

---

# PR 2 — Catalog generator and catalog file

Goal: produce a typed `FAKER_CATALOG` consumed by the UI, with an audit test that fails when faker adds methods we haven't curated. No consumers wired up yet.

### Task 2: Add public types for the catalog

**Files:**
- Create: `packages/fakerjs/src/types.ts`
- Modify: `packages/fakerjs/src/index.ts`

- [ ] **Step 1: Create `packages/fakerjs/src/types.ts`**

```ts
export type ParamKind =
  | 'integer'
  | 'number'
  | 'string'
  | 'boolean'
  | 'enum'
  | 'date'
  | 'array'
  | 'regex';

export interface Param {
  readonly name: string;
  readonly kind: ParamKind;
  readonly label: string;
  readonly hint?: string;
  readonly default?: unknown;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface MethodEntry {
  readonly shape: 'none' | 'options' | 'positional';
  readonly params: readonly Param[];
}

export type FakerCatalog = Readonly<Record<string, MethodEntry>>;
```

- [ ] **Step 2: Re-export from `packages/fakerjs/src/index.ts`**

Append to the file:
```ts
export type { ParamKind, Param, MethodEntry, FakerCatalog } from './types.js';
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @mirage/fakerjs typecheck
```
Expected: PASS.

- [ ] **Step 4: Stage**

```bash
git add packages/fakerjs/src/types.ts packages/fakerjs/src/index.ts
```

### Task 3: Add vitest to `@mirage/fakerjs` and write the failing audit test

**Files:**
- Modify: `packages/fakerjs/package.json`
- Create: `packages/fakerjs/vitest.config.ts`
- Create: `packages/fakerjs/src/__tests__/audit-catalog.test.ts`

- [ ] **Step 1: Add vitest devDep and a test target**

Edit `packages/fakerjs/package.json`. Add to `devDependencies`:
```json
  "devDependencies": {
    "vitest": "^2.1.8"
  },
```
Add `scripts.test`:
```json
  "scripts": {
    "generate": "node scripts/generate-registry.mjs",
    "test": "vitest run"
  },
```
Add the `test` target to `nx.targets` (mirror `packages/engine/package.json`):
```json
      "test": {
        "executor": "nx:run-commands",
        "options": {
          "command": "vitest run",
          "cwd": "packages/fakerjs"
        }
      }
```

- [ ] **Step 2: Create vitest config**

`packages/fakerjs/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Install**

```bash
pnpm install
```
Expected: vitest resolved into `packages/fakerjs/node_modules`.

- [ ] **Step 4: Write the failing audit test**

`packages/fakerjs/src/__tests__/audit-catalog.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { faker } from '@faker-js/faker';
import { FAKER_GROUPS } from '../registry.generated.js';
import { FAKER_CATALOG } from '../catalog.generated.js';
import type { ParamKind } from '../types.js';

const KINDS: readonly ParamKind[] = [
  'integer', 'number', 'string', 'boolean', 'enum', 'date', 'array', 'regex',
];

function fakerHasParams(ns: string, method: string): boolean {
  const mod = (faker as unknown as Record<string, Record<string, unknown>>)[ns];
  const fn = mod?.[method];
  return typeof fn === 'function' && (fn as Function).length > 0;
}

describe('FAKER_CATALOG audit', () => {
  it('every method with parameters has a catalog entry', () => {
    const missing: string[] = [];
    for (const g of FAKER_GROUPS) {
      for (const m of g.methods) {
        if (fakerHasParams(g.ns, m) && !FAKER_CATALOG[`${g.ns}.${m}`]) {
          missing.push(`${g.ns}.${m}`);
        }
      }
    }
    expect(missing, `Missing from catalog overrides:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every catalog entry references an existing faker method', () => {
    const stale: string[] = [];
    for (const key of Object.keys(FAKER_CATALOG)) {
      const dot = key.indexOf('.');
      const ns = key.slice(0, dot);
      const method = key.slice(dot + 1);
      const mod = (faker as unknown as Record<string, Record<string, unknown>>)[ns];
      if (typeof mod?.[method] !== 'function') stale.push(key);
    }
    expect(stale, `Stale catalog entries:\n${stale.join('\n')}`).toEqual([]);
  });

  it('every param kind is one of the allowed kinds', () => {
    const bad: string[] = [];
    for (const [key, entry] of Object.entries(FAKER_CATALOG)) {
      for (const p of entry.params) {
        if (!KINDS.includes(p.kind)) bad.push(`${key} :: ${p.name} → ${p.kind}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('enum params have non-empty options', () => {
    const bad: string[] = [];
    for (const [key, entry] of Object.entries(FAKER_CATALOG)) {
      for (const p of entry.params) {
        if (p.kind === 'enum' && (!p.options || p.options.length === 0)) {
          bad.push(`${key} :: ${p.name}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the test, confirm it fails (no `catalog.generated.ts` yet)**

```bash
pnpm --filter @mirage/fakerjs test
```
Expected: FAIL — `Cannot find module '../catalog.generated.js'`. This is the correct failure state for TDD.

- [ ] **Step 6: Stage**

```bash
git add packages/fakerjs/package.json packages/fakerjs/vitest.config.ts packages/fakerjs/src/__tests__/audit-catalog.test.ts pnpm-lock.yaml
```

### Task 4: Extend `generate-registry.mjs` to emit `FAKER_REGISTRY` skeleton

**Files:**
- Modify: `packages/fakerjs/scripts/generate-registry.mjs`
- Modify: `packages/fakerjs/src/registry.generated.ts` (auto-generated)

- [ ] **Step 1: Install the TS compiler API in `@mirage/fakerjs`**

Add to `packages/fakerjs/package.json` `devDependencies`:
```json
    "typescript": "^5.6.3"
```
Run:
```bash
pnpm install
```

- [ ] **Step 2: Replace `scripts/generate-registry.mjs`**

```js
// Regenerate src/registry.generated.ts by introspecting @faker-js/faker.
// Emits FAKER_GROUPS (prototype walk) AND FAKER_REGISTRY (param signatures
// derived from the package's TypeScript declarations).
//
// Run with: pnpm --filter @mirage/fakerjs run generate

import { faker } from '@faker-js/faker';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SKIP_NAMESPACES = new Set(['rawDefinitions', 'definitions']);

// ---------- 1. Prototype walk → FAKER_GROUPS ----------

function collectMethods(moduleInstance) {
  const names = new Set();
  let proto = Object.getPrototypeOf(moduleInstance);
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name.startsWith('_')) continue;
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc) continue;
      if (typeof desc.value === 'function') names.add(name);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

const groups = [];
for (const ns of Object.keys(faker).sort((a, b) => a.localeCompare(b))) {
  if (SKIP_NAMESPACES.has(ns) || ns.startsWith('_')) continue;
  const mod = faker[ns];
  if (!mod || typeof mod !== 'object') continue;
  const methods = collectMethods(mod).filter((m) => typeof mod[m] === 'function');
  if (methods.length === 0) continue;
  groups.push({ ns, methods });
}

// ---------- 2. TypeScript signature scan → FAKER_REGISTRY ----------

const fakerEntry = require.resolve('@faker-js/faker');
// node_modules/@faker-js/faker/dist/index.cjs → .../dist/index.d.ts
const dtsPath = fakerEntry.replace(/index\.(cjs|js|mjs)$/, 'index.d.ts');

const program = ts.createProgram([dtsPath], { allowJs: false, declaration: true });
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(dtsPath);

// Index modules by lowercased namespace name (faker.airline → AirlineModule).
const moduleClasses = new Map();
function visit(node) {
  if (ts.isClassDeclaration(node) && node.name) {
    const nm = node.name.text;
    if (nm.endsWith('Module')) {
      const ns = nm.slice(0, -'Module'.length).toLowerCase();
      moduleClasses.set(ns, node);
    }
  }
  ts.forEachChild(node, visit);
}
if (sourceFile) visit(sourceFile);

const INTEGER_NAME_HINT = /^(length|count|precision|max|min|years|days|width|height|blur|fractionDigits|extensionCount|sentenceCount|wordCount)$/;

function classifyType(type) {
  if (!type) return { kind: 'string' };
  const flags = type.flags;
  if (flags & ts.TypeFlags.Number) return { kind: 'number' };
  if (flags & ts.TypeFlags.String) return { kind: 'string' };
  if (flags & ts.TypeFlags.Boolean) return { kind: 'boolean' };
  if (flags & ts.TypeFlags.Union) {
    const types = type.types ?? [];
    const allStringLit = types.every((t) => t.isStringLiteral?.());
    if (allStringLit && types.length > 0) {
      return { kind: 'enum', options: types.map((t) => t.value) };
    }
  }
  if (checker.isArrayType?.(type) || type.symbol?.name === 'Array') return { kind: 'array' };
  if (type.symbol?.name === 'Date') return { kind: 'date' };
  return { kind: 'string' };
}

function inferParam(symbol, declaration) {
  const name = symbol.getName();
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const cls = classifyType(type);
  if (cls.kind === 'number' && INTEGER_NAME_HINT.test(name)) cls.kind = 'integer';
  return { name, kind: cls.kind, label: name, ...(cls.options ? { options: cls.options } : {}) };
}

function inferSignature(methodDecl) {
  // No declared params → shape: 'none'.
  if (!methodDecl.parameters || methodDecl.parameters.length === 0) {
    return { shape: 'none', params: [] };
  }
  // One parameter whose type is an object literal or *Options → shape: 'options'.
  if (methodDecl.parameters.length === 1) {
    const p = methodDecl.parameters[0];
    const typeNode = p.type;
    if (typeNode) {
      const t = checker.getTypeFromTypeNode(typeNode);
      const props = t.getProperties?.() ?? [];
      const looksLikeOptions =
        (typeNode.kind === ts.SyntaxKind.TypeLiteral) ||
        (typeNode.kind === ts.SyntaxKind.TypeReference &&
         /Options$/.test(typeNode.typeName?.getText?.() ?? ''));
      if (looksLikeOptions && props.length > 0) {
        const params = props.map((sym) => inferParam(sym, p));
        return { shape: 'options', params };
      }
    }
  }
  // Otherwise: positional.
  const params = methodDecl.parameters.map((p) => {
    const sym = checker.getSymbolAtLocation(p.name);
    return sym ? inferParam(sym, p) : { name: p.name.getText?.() ?? 'arg', kind: 'string', label: 'arg' };
  });
  return { shape: 'positional', params };
}

const registry = {};
for (const { ns, methods } of groups) {
  const cls = moduleClasses.get(ns);
  if (!cls) continue;
  for (const member of cls.members ?? []) {
    if (!ts.isMethodDeclaration(member) && !ts.isMethodSignature(member)) continue;
    const name = member.name?.getText?.();
    if (!name || !methods.includes(name)) continue;
    registry[`${ns}.${name}`] = inferSignature(member);
  }
}

// ---------- 3. Emit ----------

const totalMethods = groups.reduce((acc, g) => acc + g.methods.length, 0);

const body = `// AUTO-GENERATED by scripts/generate-registry.mjs — do not edit by hand.
// Source: @faker-js/faker prototype introspection + .d.ts signatures.
// Namespaces: ${groups.length}, methods: ${totalMethods}, registry entries: ${Object.keys(registry).length}.

import type { MethodEntry } from './types.js';

export interface FakerGroup {
  readonly ns: string;
  readonly methods: readonly string[];
}

export const FAKER_GROUPS: readonly FakerGroup[] = ${JSON.stringify(groups, null, 2)} as const;

export const FAKER_REGISTRY: Readonly<Record<string, MethodEntry>> = ${JSON.stringify(registry, null, 2)} as const;
`;

const outPath = join(__dirname, '..', 'src', 'registry.generated.ts');
writeFileSync(outPath, body);
console.log(`wrote ${outPath} — ${groups.length} namespaces, ${totalMethods} methods, ${Object.keys(registry).length} signatures`);
```

- [ ] **Step 3: Run the generator**

```bash
pnpm --filter @mirage/fakerjs run generate
```
Expected: writes to `src/registry.generated.ts`; console reports namespace + method + signature counts.

- [ ] **Step 4: Typecheck (registry.generated.ts must compile)**

```bash
pnpm --filter @mirage/fakerjs typecheck
```
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add packages/fakerjs/scripts/generate-registry.mjs packages/fakerjs/src/registry.generated.ts packages/fakerjs/package.json pnpm-lock.yaml
```

### Task 5: Create the hand-written overrides file

**Files:**
- Create: `packages/fakerjs/src/registry.overrides.ts`

The overrides file is the ergonomic source of truth — anywhere the generator's inference is wrong (a `string` that should be `regex`, a `number` that should be `integer`, a missing label/default), it is patched here. We port the curated content from `design/add-params-fn/faker-catalog.js`.

- [ ] **Step 1: Create the file**

`packages/fakerjs/src/registry.overrides.ts`:
```ts
/**
 * Hand-curated overrides for FAKER_REGISTRY.
 *
 * Merge-catalog reads this file and applies per-method, per-param patches on
 * top of the generated skeleton. Anything not patched here uses the skeleton
 * verbatim.
 *
 * Patch semantics:
 *  - Method-level patch object replaces the whole entry if it includes `shape`.
 *  - Otherwise, patches under `paramOverrides[paramName]` are merged onto the
 *    skeleton's matching param (shallow merge).
 */

import type { MethodEntry, Param } from './types.js';

export interface ParamOverride extends Partial<Param> {
  readonly name?: string;
}

export interface MethodOverride extends Partial<MethodEntry> {
  readonly paramOverrides?: Readonly<Record<string, ParamOverride>>;
}

const REF_DATE: ParamOverride = { label: 'reference date', hint: 'leave blank for "now"', kind: 'date' };
const SEX_ENUM: ParamOverride = { kind: 'enum', label: 'sex', options: ['', 'female', 'male'], default: '' };

export const FAKER_OVERRIDES: Readonly<Record<string, MethodOverride>> = {
  // ============ airline ============
  'airline.flightNumber': {
    paramOverrides: {
      length: { kind: 'integer', label: 'length', default: 4, min: 1, max: 8 },
      leadingZeros: { kind: 'boolean', label: 'leading zeros', default: false },
      addLeadingZeros: { kind: 'boolean', label: 'add leading zeros', default: false },
    },
  },
  'airline.recordLocator': {
    paramOverrides: {
      allowNumerics: { kind: 'boolean', label: 'allow numerics', default: false },
      allowVisuallySimilarCharacters: { kind: 'boolean', label: 'allow O/0, I/1', default: false },
    },
  },
  'airline.seat': {
    paramOverrides: {
      aircraftType: { kind: 'enum', label: 'aircraft type',
        options: ['', 'regional', 'narrowbody', 'widebody'], default: '' },
    },
  },

  // ============ color ============
  'color.cmyk': { paramOverrides: { format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' } } },
  'color.colorByCSSColorSpace': {
    paramOverrides: {
      format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' },
      space: { kind: 'enum', options: ['sRGB', 'display-p3', 'rec2020', 'a98-rgb', 'prophoto-rgb'], default: 'sRGB' },
    },
  },
  'color.hsl': { paramOverrides: { format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' }, includeAlpha: { kind: 'boolean', default: false } } },
  'color.hwb': { paramOverrides: { format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' } } },
  'color.lab': { paramOverrides: { format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' } } },
  'color.lch': { paramOverrides: { format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' } } },
  'color.rgb': {
    paramOverrides: {
      format: { kind: 'enum', options: ['hex', 'decimal', 'css', 'binary'], default: 'hex' },
      casing: { kind: 'enum', options: ['mixed', 'lower', 'upper'], default: 'mixed' },
      prefix: { default: '#' },
      includeAlpha: { default: false },
    },
  },

  // ============ commerce ============
  'commerce.isbn': {
    paramOverrides: {
      variant: { kind: 'enum', options: ['', '10', '13'], default: '' },
      separator: { default: '-' },
    },
  },
  'commerce.price': {
    paramOverrides: {
      min: { kind: 'number', default: 1 },
      max: { kind: 'number', default: 1000 },
      dec: { kind: 'integer', label: 'decimals', default: 2, min: 0, max: 12 },
      symbol: { kind: 'string' },
    },
  },

  // ============ datatype ============
  'datatype.boolean': {
    paramOverrides: {
      probability: { kind: 'number', label: 'probability of true', default: 0.5, min: 0, max: 1, step: 0.05 },
    },
  },

  // ============ date ============
  'date.anytime': { paramOverrides: { refDate: REF_DATE } },
  'date.between': {
    paramOverrides: {
      from: { kind: 'date', default: '2020-01-01' },
      to: { kind: 'date', default: '2025-12-31' },
    },
  },
  'date.betweens': {
    paramOverrides: {
      from: { kind: 'date' },
      to: { kind: 'date' },
      count: { kind: 'integer', default: 3, min: 1 },
    },
  },
  'date.birthdate': {
    paramOverrides: {
      mode: { kind: 'enum', options: ['age', 'year'], default: 'age' },
      min: { kind: 'integer', default: 18, hint: 'age or year' },
      max: { kind: 'integer', default: 80, hint: 'age or year' },
      refDate: REF_DATE,
    },
  },
  'date.future': { paramOverrides: { years: { kind: 'number', default: 1, min: 0, step: 0.5 }, refDate: REF_DATE } },
  'date.month': {
    paramOverrides: {
      abbreviated: { kind: 'boolean', default: false },
      context: { kind: 'boolean', label: 'context-aware', default: false },
    },
  },
  'date.past': { paramOverrides: { years: { kind: 'number', default: 1, min: 0, step: 0.5 }, refDate: REF_DATE } },
  'date.recent': { paramOverrides: { days: { kind: 'number', default: 1, min: 0, step: 0.5 }, refDate: REF_DATE } },
  'date.soon': { paramOverrides: { days: { kind: 'number', default: 1, min: 0, step: 0.5 }, refDate: REF_DATE } },
  'date.weekday': {
    paramOverrides: {
      abbreviated: { kind: 'boolean', default: false },
      context: { kind: 'boolean', label: 'context-aware', default: false },
    },
  },

  // ============ finance ============
  'finance.accountNumber': { paramOverrides: { length: { kind: 'integer', default: 8, min: 1, max: 32 } } },
  'finance.amount': {
    paramOverrides: {
      min: { kind: 'number', default: 0 },
      max: { kind: 'number', default: 1000 },
      dec: { kind: 'integer', label: 'decimals', default: 2, min: 0, max: 12 },
      symbol: { default: '' },
      autoFormat: { kind: 'boolean', default: false },
    },
  },
  'finance.bic': { paramOverrides: { includeBranchCode: { kind: 'boolean', default: false } } },
  'finance.creditCardNumber': {
    paramOverrides: {
      issuer: { kind: 'enum',
        options: ['', 'visa', 'mastercard', 'american_express', 'discover', 'diners_club', 'jcb', 'maestro'],
        default: '' },
    },
  },
  'finance.iban': {
    paramOverrides: {
      formatted: { kind: 'boolean', default: false },
      countryCode: { hint: 'ISO-3166 alpha-2, e.g. "DE"' },
    },
  },
  'finance.maskedNumber': {
    paramOverrides: {
      length: { kind: 'integer', default: 4, min: 1 },
      parens: { kind: 'boolean', default: true },
      ellipsis: { kind: 'boolean', default: true },
    },
  },
  'finance.pin': { paramOverrides: { length: { kind: 'integer', default: 4, min: 1, max: 32 } } },

  // ============ git ============
  'git.commitDate': { paramOverrides: { refDate: REF_DATE } },
  'git.commitEntry': {
    paramOverrides: {
      merge: { kind: 'boolean' },
      eol: { kind: 'enum', options: ['CRLF', 'LF'], default: 'CRLF' },
      refDate: REF_DATE,
    },
  },
  'git.commitSha': { paramOverrides: { length: { kind: 'integer', default: 40, min: 7, max: 40 } } },

  // ============ helpers ============
  'helpers.arrayElement': {
    paramOverrides: {
      array: { kind: 'array', label: 'choices', default: ['option-a', 'option-b'], hint: 'one per line' },
    },
  },
  'helpers.arrayElements': {
    paramOverrides: {
      array: { kind: 'array', default: ['option-a', 'option-b', 'option-c'] },
      count: { kind: 'integer', hint: 'exact count, or leave blank for random' },
    },
  },
  'helpers.enumValue': {
    paramOverrides: { enum: { kind: 'array', label: 'enum members', default: ['ACTIVE', 'PAUSED', 'ARCHIVED'] } },
  },
  'helpers.fake': {
    paramOverrides: { pattern: { label: 'template', default: '{{person.firstName}} {{person.lastName}}', hint: '{{ns.method}} placeholders' } },
  },
  'helpers.fromRegExp': {
    paramOverrides: { pattern: { kind: 'regex', default: '[A-Z]{3}-[0-9]{4}', hint: 'JS regex source' } },
  },
  'helpers.maybe': {
    paramOverrides: { probability: { kind: 'number', default: 0.5, min: 0, max: 1, step: 0.05 } },
  },
  'helpers.multiple': { paramOverrides: { count: { kind: 'integer', default: 3, min: 1 } } },
  'helpers.mustache': {
    paramOverrides: {
      string: { label: 'template', default: 'Hello {{name}}', hint: 'mustache placeholders' },
      data: { label: 'data (JSON object)', hint: 'e.g. {"name":"World"}' },
    },
  },
  'helpers.objectEntry': { paramOverrides: { object: { label: 'object (JSON)', default: '{"a":1,"b":2}' } } },
  'helpers.objectKey': { paramOverrides: { object: { label: 'object (JSON)', default: '{"a":1,"b":2}' } } },
  'helpers.objectValue': { paramOverrides: { object: { label: 'object (JSON)', default: '{"a":1,"b":2}' } } },
  'helpers.rangeToNumber': {
    paramOverrides: {
      min: { kind: 'integer', default: 0 },
      max: { kind: 'integer', default: 10 },
    },
  },
  'helpers.replaceCreditCardSymbols': {
    paramOverrides: {
      string: { default: '6453-####-####-####-###L' },
      symbol: { default: '#' },
    },
  },
  'helpers.replaceSymbols': {
    paramOverrides: { string: { default: '###-???-###', hint: '# digit · ? letter · * either' } },
  },
  'helpers.shuffle': { paramOverrides: { array: { kind: 'array', default: ['a', 'b', 'c'] } } },
  'helpers.slugify': { paramOverrides: { string: { default: 'Hello World' } } },
  'helpers.uniqueArray': {
    paramOverrides: {
      source: { kind: 'array', default: ['a', 'b', 'c', 'd', 'e'] },
      length: { kind: 'integer', default: 3, min: 1 },
    },
  },
  'helpers.weightedArrayElement': {
    paramOverrides: {
      array: { label: 'weighted entries (JSON)', default: '[{"weight":5,"value":"a"},{"weight":1,"value":"b"}]', hint: '[{weight, value}, …]' },
    },
  },

  // ============ image ============
  'image.dataUri': {
    paramOverrides: {
      width: { kind: 'integer', default: 640, min: 1 },
      height: { kind: 'integer', default: 480, min: 1 },
      color: { hint: 'e.g. #aaaaaa' },
      type: { kind: 'enum', options: ['svg-uri', 'svg-base64'], default: 'svg-uri' },
    },
  },
  'image.url': { paramOverrides: { width: { kind: 'integer', default: 640, min: 1 }, height: { kind: 'integer', default: 480, min: 1 } } },
  'image.urlLoremFlickr': {
    paramOverrides: {
      width: { kind: 'integer', default: 640, min: 1 },
      height: { kind: 'integer', default: 480, min: 1 },
      category: { hint: 'e.g. nature, city' },
    },
  },
  'image.urlPicsumPhotos': {
    paramOverrides: {
      width: { kind: 'integer', default: 640, min: 1 },
      height: { kind: 'integer', default: 480, min: 1 },
      grayscale: { kind: 'boolean', default: false },
      blur: { kind: 'integer', min: 0, max: 10 },
    },
  },
  'image.urlPlaceholder': {
    paramOverrides: {
      width: { kind: 'integer', default: 640, min: 1 },
      height: { kind: 'integer', default: 480, min: 1 },
      backgroundColor: { hint: '#rgb hex' },
      textColor: { hint: '#rgb hex' },
      format: { kind: 'enum', options: ['png', 'jpeg', 'jpg', 'gif', 'webp'], default: 'png' },
    },
  },
  'image.personPortrait': {
    paramOverrides: {
      sex: SEX_ENUM,
      size: { kind: 'enum', options: ['', '256', '512', '1024'], default: '' },
    },
  },

  // ============ internet ============
  'internet.color': {
    paramOverrides: {
      redBase: { kind: 'integer', min: 0, max: 255 },
      greenBase: { kind: 'integer', min: 0, max: 255 },
      blueBase: { kind: 'integer', min: 0, max: 255 },
    },
  },
  'internet.email': {
    paramOverrides: {
      provider: { hint: 'e.g. acme.com' },
      allowSpecialCharacters: { kind: 'boolean', default: false },
    },
  },
  'internet.emoji': {
    paramOverrides: { types: { kind: 'array', hint: 'smiley, body, person, nature, food, travel, activity, object, symbol, flag' } },
  },
  'internet.httpStatusCode': {
    paramOverrides: { types: { kind: 'array', hint: 'informational, success, redirection, clientError, serverError' } },
  },
  'internet.ipv4': { paramOverrides: { cidrBlock: { hint: 'e.g. 10.0.0.0/8' } } },
  'internet.jwt': {
    paramOverrides: {
      header: { label: 'header (JSON)' },
      payload: { label: 'payload (JSON)' },
      refDate: REF_DATE,
    },
  },
  'internet.mac': { paramOverrides: { separator: { kind: 'enum', options: [':', '-', ''], default: ':' } } },
  'internet.password': {
    paramOverrides: {
      length: { kind: 'integer', default: 15, min: 1 },
      memorable: { kind: 'boolean', default: false },
      pattern: { kind: 'regex' },
    },
  },
  'internet.url': {
    paramOverrides: {
      protocol: { kind: 'enum', options: ['http', 'https'], default: 'https' },
      appendSlash: { kind: 'boolean', default: false },
    },
  },

  // ============ location ============
  'location.cardinalDirection': { paramOverrides: { abbreviated: { kind: 'boolean', default: false } } },
  'location.countryCode': { paramOverrides: { variant: { kind: 'enum', options: ['alpha-2', 'alpha-3', 'numeric'], default: 'alpha-2' } } },
  'location.direction': { paramOverrides: { abbreviated: { kind: 'boolean', default: false } } },
  'location.latitude': {
    paramOverrides: {
      max: { kind: 'number', default: 90, min: -90, max: 90 },
      min: { kind: 'number', default: -90, min: -90, max: 90 },
      precision: { kind: 'integer', default: 4, min: 0, max: 12 },
    },
  },
  'location.longitude': {
    paramOverrides: {
      max: { kind: 'number', default: 180, min: -180, max: 180 },
      min: { kind: 'number', default: -180, min: -180, max: 180 },
      precision: { kind: 'integer', default: 4, min: 0, max: 12 },
    },
  },
  'location.nearbyGPSCoordinate': {
    paramOverrides: {
      origin: { hint: 'e.g. 33.84,-118.39' },
      radius: { kind: 'number', default: 10 },
      isMetric: { kind: 'boolean', default: false },
    },
  },
  'location.ordinalDirection': { paramOverrides: { abbreviated: { kind: 'boolean', default: false } } },
  'location.state': { paramOverrides: { abbreviated: { kind: 'boolean', default: false } } },
  'location.streetAddress': { paramOverrides: { useFullAddress: { kind: 'boolean', default: false } } },
  'location.zipCode': {
    paramOverrides: {
      format: { hint: '# digit · ? letter, e.g. "#####-####"' },
      state: { hint: 'US state code' },
    },
  },

  // ============ lorem ============
  'lorem.lines': { paramOverrides: { min: { kind: 'integer', default: 1, min: 1 }, max: { kind: 'integer', default: 5, min: 1 } } },
  'lorem.paragraph': { paramOverrides: { sentenceCount: { kind: 'integer', default: 3, min: 1 } } },
  'lorem.paragraphs': { paramOverrides: { count: { kind: 'integer', default: 3, min: 1 }, separator: { default: '\\n' } } },
  'lorem.sentence': { paramOverrides: { wordCount: { kind: 'integer', default: 6, min: 1 } } },
  'lorem.sentences': { paramOverrides: { count: { kind: 'integer', default: 3, min: 1 }, separator: { default: ' ' } } },
  'lorem.slug': { paramOverrides: { wordCount: { kind: 'integer', default: 3, min: 1 } } },
  'lorem.word': {
    paramOverrides: {
      length: { kind: 'integer', hint: 'exact length' },
      strategy: { kind: 'enum', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    },
  },
  'lorem.words': { paramOverrides: { count: { kind: 'integer', default: 3, min: 1 } } },

  // ============ number ============
  'number.bigInt': { paramOverrides: { min: { hint: 'JS bigint, e.g. 1000n' }, max: { hint: 'JS bigint' } } },
  'number.binary': { paramOverrides: { min: { kind: 'integer', default: 0 }, max: { kind: 'integer', default: 1 } } },
  'number.float': {
    paramOverrides: {
      min: { kind: 'number', default: 0 },
      max: { kind: 'number', default: 1 },
      fractionDigits: { kind: 'integer', default: 2, min: 0, max: 12 },
      multipleOf: { kind: 'number' },
    },
  },
  'number.hex': { paramOverrides: { min: { kind: 'integer', default: 0 }, max: { kind: 'integer', default: 15 } } },
  'number.int': {
    paramOverrides: {
      min: { kind: 'integer', default: 0 },
      max: { kind: 'integer', default: 1000 },
      multipleOf: { kind: 'integer', hint: 'round to nearest' },
    },
  },
  'number.octal': { paramOverrides: { min: { kind: 'integer', default: 0 }, max: { kind: 'integer', default: 7 } } },
  'number.romanNumeral': {
    paramOverrides: {
      min: { kind: 'integer', default: 1, min: 1, max: 3999 },
      max: { kind: 'integer', default: 3999, min: 1, max: 3999 },
    },
  },

  // ============ person ============
  'person.firstName': { paramOverrides: { sex: SEX_ENUM } },
  'person.lastName': { paramOverrides: { sex: SEX_ENUM } },
  'person.middleName': { paramOverrides: { sex: SEX_ENUM } },
  'person.prefix': { paramOverrides: { sex: SEX_ENUM } },
  'person.fullName': {
    paramOverrides: { sex: SEX_ENUM },
  },

  // ============ phone ============
  'phone.number': {
    paramOverrides: { style: { kind: 'enum', options: ['human', 'national', 'international'], default: 'human' } },
  },

  // ============ string ============
  'string.alpha': {
    paramOverrides: {
      length: { kind: 'integer', default: 10, min: 1 },
      casing: { kind: 'enum', options: ['mixed', 'upper', 'lower'], default: 'mixed' },
      exclude: { hint: 'characters to omit' },
    },
  },
  'string.alphanumeric': {
    paramOverrides: {
      length: { kind: 'integer', default: 10, min: 1 },
      casing: { kind: 'enum', options: ['mixed', 'upper', 'lower'], default: 'mixed' },
    },
  },
  'string.binary': { paramOverrides: { length: { kind: 'integer', default: 1, min: 1 }, prefix: { default: '0b' } } },
  'string.fromCharacters': {
    paramOverrides: {
      characters: { default: 'abcdef0123456789', hint: 'alphabet to pick from' },
      length: { kind: 'integer', default: 8, min: 1 },
    },
  },
  'string.hexadecimal': {
    paramOverrides: {
      length: { kind: 'integer', default: 1, min: 1 },
      casing: { kind: 'enum', options: ['mixed', 'upper', 'lower'], default: 'mixed' },
      prefix: { default: '0x' },
    },
  },
  'string.nanoid': { paramOverrides: { length: { kind: 'integer', default: 21, min: 1 } } },
  'string.numeric': {
    paramOverrides: {
      length: { kind: 'integer', default: 1, min: 1 },
      allowLeadingZeros: { kind: 'boolean', default: true },
    },
  },
  'string.octal': { paramOverrides: { length: { kind: 'integer', default: 1, min: 1 }, prefix: { default: '0o' } } },
  'string.sample': { paramOverrides: { length: { kind: 'integer', default: 10, min: 1 } } },
  'string.symbol': { paramOverrides: { length: { kind: 'integer', default: 1, min: 1 } } },
  'string.ulid': { paramOverrides: { refDate: REF_DATE } },

  // ============ system ============
  'system.cron': {
    paramOverrides: {
      includeYear: { kind: 'boolean', default: false },
      includeNonStandard: { kind: 'boolean', label: 'allow @yearly etc.', default: false },
    },
  },
  'system.fileExt': { paramOverrides: { mimeType: { hint: 'e.g. application/json' } } },
  'system.fileName': { paramOverrides: { extensionCount: { kind: 'integer', default: 1, min: 0, max: 4 } } },
  'system.networkInterface': {
    paramOverrides: {
      interfaceType: { kind: 'enum', options: ['', 'en', 'wl', 'ww'], default: '' },
      interfaceSchema: { kind: 'enum', options: ['', 'index', 'slot', 'mac', 'pci'], default: '' },
    },
  },

  // ============ word (length+strategy on every word.* method) ============
  ...Object.fromEntries(
    ['adjective','adverb','conjunction','interjection','noun','preposition','sample','verb'].map((m) => [
      `word.${m}`,
      {
        paramOverrides: {
          length: { kind: 'integer', hint: 'exact length' },
          strategy: { kind: 'enum', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
        },
      },
    ]),
  ),
  'word.words': { paramOverrides: { count: { kind: 'integer', default: 3, min: 1 } } },
};
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @mirage/fakerjs typecheck
```
Expected: PASS.

- [ ] **Step 3: Stage**

```bash
git add packages/fakerjs/src/registry.overrides.ts
```

### Task 6: Create the merge script and emit `catalog.generated.ts`

**Files:**
- Create: `packages/fakerjs/scripts/merge-catalog.mjs`
- Modify: `packages/fakerjs/scripts/generate-registry.mjs` (call the merge at the end)
- Create: `packages/fakerjs/src/catalog.generated.ts` (auto-generated)
- Modify: `packages/fakerjs/src/index.ts`

- [ ] **Step 1: Create `packages/fakerjs/scripts/merge-catalog.mjs`**

```js
// Merges registry.generated.ts (skeleton) with registry.overrides.ts to
// produce catalog.generated.ts. Pure function over filesystem state — no
// network, no faker introspection.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');

async function loadFAKER_REGISTRY() {
  // registry.generated.ts re-exports FAKER_REGISTRY as a plain object literal;
  // compile it on the fly so we don't need a prior tsc build step.
  const tmp = mkdtempSync(join(tmpdir(), 'mirage-fakerjs-'));
  const out = join(tmp, 'registry.cjs');
  await build({
    entryPoints: [join(srcDir, 'registry.generated.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: out,
    external: [],
  });
  const mod = await import(pathToFileURL(out).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod.FAKER_REGISTRY;
}

async function loadFAKER_OVERRIDES() {
  const tmp = mkdtempSync(join(tmpdir(), 'mirage-fakerjs-'));
  const out = join(tmp, 'overrides.cjs');
  await build({
    entryPoints: [join(srcDir, 'registry.overrides.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: out,
    external: [],
  });
  const mod = await import(pathToFileURL(out).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod.FAKER_OVERRIDES;
}

function mergeParam(skeleton, override) {
  // Override wins on every defined field.
  return { ...skeleton, ...override, name: skeleton.name };
}

function mergeEntry(skeleton, override) {
  if (!override) return skeleton;
  // Method-level override that includes `shape` fully replaces the skeleton.
  if (override.shape) {
    return {
      shape: override.shape,
      params: override.params ?? skeleton?.params ?? [],
    };
  }
  if (!skeleton) {
    // No skeleton (method not seen by signature scan) — derive shape from overrides.
    const params = Object.entries(override.paramOverrides ?? {}).map(([name, ov]) => ({
      name,
      kind: ov.kind ?? 'string',
      label: ov.label ?? name,
      ...ov,
    }));
    return { shape: 'options', params };
  }
  const merged = skeleton.params.map((p) => {
    const ov = override.paramOverrides?.[p.name];
    return ov ? mergeParam(p, ov) : p;
  });
  // Inject any override params that don't exist in skeleton (rare — but in case
  // faker's .d.ts uses inline anonymous types we couldn't introspect).
  for (const [name, ov] of Object.entries(override.paramOverrides ?? {})) {
    if (!merged.some((p) => p.name === name)) {
      merged.push({ name, kind: ov.kind ?? 'string', label: ov.label ?? name, ...ov });
    }
  }
  return { shape: skeleton.shape, params: merged };
}

const registry = await loadFAKER_REGISTRY();
const overrides = await loadFAKER_OVERRIDES();

const merged = {};
const keys = new Set([...Object.keys(registry ?? {}), ...Object.keys(overrides ?? {})]);
for (const key of [...keys].sort()) {
  merged[key] = mergeEntry(registry?.[key], overrides?.[key]);
}

const body = `// AUTO-GENERATED by scripts/merge-catalog.mjs — do not edit by hand.
// Run \`pnpm --filter @mirage/fakerjs run generate\` to regenerate.

import type { FakerCatalog } from './types.js';

export const FAKER_CATALOG: FakerCatalog = ${JSON.stringify(merged, null, 2)} as const;
`;

writeFileSync(join(srcDir, 'catalog.generated.ts'), body);
console.log(`wrote catalog.generated.ts — ${Object.keys(merged).length} entries`);
```

- [ ] **Step 2: Append a merge invocation at the end of `generate-registry.mjs`**

Add after the `console.log(...)` line at the end of the file:
```js
// Run the merge step so callers only need a single command.
await import('./merge-catalog.mjs');
```

- [ ] **Step 3: Add esbuild devDep**

Edit `packages/fakerjs/package.json` `devDependencies`:
```json
    "esbuild": "^0.24.0"
```
Run:
```bash
pnpm install
```

- [ ] **Step 4: Run the combined generator**

```bash
pnpm --filter @mirage/fakerjs run generate
```
Expected: both `registry.generated.ts` and `catalog.generated.ts` written; logs report counts.

- [ ] **Step 5: Update `src/index.ts` to re-export the catalog**

Append to `packages/fakerjs/src/index.ts`:
```ts
export { FAKER_CATALOG } from './catalog.generated.js';
```

- [ ] **Step 6: Run the audit test — it should now pass**

```bash
pnpm --filter @mirage/fakerjs test
```
Expected: all 4 audit assertions PASS. If "missing from catalog overrides" reports methods, update `registry.overrides.ts` accordingly and re-run the generator.

- [ ] **Step 7: Typecheck and lint**

```bash
pnpm --filter @mirage/fakerjs typecheck && pnpm --filter @mirage/fakerjs lint
```
Expected: both PASS.

- [ ] **Step 8: Stage**

```bash
git add packages/fakerjs/scripts/merge-catalog.mjs \
        packages/fakerjs/scripts/generate-registry.mjs \
        packages/fakerjs/src/catalog.generated.ts \
        packages/fakerjs/src/index.ts \
        packages/fakerjs/package.json \
        pnpm-lock.yaml
```

Ask the user whether to commit with message:
```
feat(fakerjs): add curated catalog of faker method signatures
```

---

# PR 3 — API + storage

Goal: `SchemaProp.fakerArgs?: object` round-trips through BFF and workspace-svc with size/shape validation. Engine still ignores it.

### Task 7: Add `fakerArgs` to the OpenAPI schema

**Files:**
- Modify: `packages/types/openapi.yaml:629-648`
- Regenerate: `packages/types/src/openapi.generated.ts`

- [ ] **Step 1: Edit `packages/types/openapi.yaml`**

Change the `SchemaProp` block (lines 629-648) to:
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
        faker: { type: string }
        fakerArgs:
          description: |
            Arguments passed to the faker method. Object for `shape: 'options'`
            methods (e.g. `{ min: 10, max: 100 }`), array for positional
            methods (e.g. `['female']`). Only valid when `faker` is set to a
            faker method (not `$ref:` or `$fn:`).
          oneOf:
            - type: object
              additionalProperties: true
            - type: array
              items: {}
        fields:
          type: array
          items:
            $ref: '#/components/schemas/SchemaProp'
        items:
          $ref: '#/components/schemas/SchemaProp'
```

- [ ] **Step 2: Regenerate TypeScript types**

```bash
pnpm --filter @mirage/types gen
```
Expected: `src/openapi.generated.ts` updated; `SchemaProp.fakerArgs?: { [key: string]: unknown } | unknown[]`.

- [ ] **Step 3: Typecheck downstream consumers**

```bash
pnpm -w typecheck
```
Expected: PASS (no consumers yet reference `fakerArgs`, so adding it is additive).

- [ ] **Step 4: Stage**

```bash
git add packages/types/openapi.yaml packages/types/src/openapi.generated.ts
```

### Task 8: Validate `fakerArgs` in `workspace-svc/routes/schemas.ts`

**Files:**
- Modify: `apps/workspace-svc/src/routes/schemas.ts:45-80` (extend `validateProps`)

- [ ] **Step 1: Add validation helper above `validateProps`**

Find the `function validateProps(...)` declaration around line 45 and insert this helper above it:
```ts
const REF_PREFIX = '$ref:';
const FN_PREFIX = '$fn:';
const MAX_FAKER_ARGS_BYTES = 4 * 1024; // 4 KB

function validateFakerArgs(p: SchemaProp): ValidationError | null {
  const args = (p as SchemaProp & { fakerArgs?: unknown }).fakerArgs;
  if (args === undefined) return null;
  // Only allowed when faker is set to a faker method (not $ref / $fn / unset).
  const faker = p.faker;
  if (typeof faker !== 'string' || faker.length === 0) {
    return err('faker_args_without_faker', `fakerArgs requires faker to be set on property "${p.name}".`, { name: p.name });
  }
  if (faker.startsWith(REF_PREFIX) || faker.startsWith(FN_PREFIX)) {
    return err('faker_args_not_supported', `fakerArgs is not supported for $ref or $fn values on property "${p.name}".`, { name: p.name });
  }
  if (typeof args !== 'object' || args === null) {
    return err('faker_args_invalid_shape', `fakerArgs must be an object or array on property "${p.name}".`, { name: p.name });
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(args);
  } catch {
    return err('faker_args_not_serializable', `fakerArgs is not JSON-serializable on property "${p.name}".`, { name: p.name });
  }
  if (serialized.length > MAX_FAKER_ARGS_BYTES) {
    return err('faker_args_too_large', `fakerArgs exceeds 4 KB on property "${p.name}".`, { name: p.name, size: serialized.length });
  }
  return null;
}
```

- [ ] **Step 2: Invoke it inside `validateProps`**

Inside the `while (queue.length) { ... for (const p of node.props) { ... } }` loop, after the existing name uniqueness check (after the `seen.add(p.name);` line, around current line 62), add:
```ts
      const fakerArgsErr = validateFakerArgs(p);
      if (fakerArgsErr) return fakerArgsErr;
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @mirage/workspace-svc typecheck
```
Expected: PASS.

- [ ] **Step 4: Stage**

```bash
git add apps/workspace-svc/src/routes/schemas.ts
```

### Task 9: Write integration test for `fakerArgs` validation

**Files:**
- Find an existing schemas route test or create: `apps/workspace-svc/src/routes/__tests__/schemas-faker-args.test.ts`

- [ ] **Step 1: Locate test pattern**

```bash
find apps/workspace-svc -name "*.test.ts" | head
```
If a `schemas.test.ts` exists, add a new `describe('fakerArgs validation', …)` block to it. Otherwise, create a new file mirroring the existing test setup. The test file should boot the Fastify app like the other route tests do.

- [ ] **Step 2: Add test cases**

```ts
describe('fakerArgs validation', () => {
  const wsId = 'ws_test';
  const baseSchema = {
    key: 'thing', name: 'Thing', color: 'violet', icon: 'database', tags: [],
    description: '',
    properties: [{ name: 'price', type: 'number', required: false, faker: 'commerce.price', fakerArgs: { min: 10, max: 100 } }],
  };

  it('accepts well-formed fakerArgs', async () => {
    const res = await app.inject({ method: 'POST', url: `/workspaces/${wsId}/schemas`, payload: baseSchema });
    expect(res.statusCode).toBe(201);
  });

  it('rejects fakerArgs when faker is unset', async () => {
    const res = await app.inject({ method: 'POST', url: `/workspaces/${wsId}/schemas`, payload: {
      ...baseSchema,
      properties: [{ name: 'price', type: 'number', required: false, fakerArgs: { min: 10 } }],
    }});
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('faker_args_without_faker');
  });

  it('rejects fakerArgs when faker is a $ref', async () => {
    const res = await app.inject({ method: 'POST', url: `/workspaces/${wsId}/schemas`, payload: {
      ...baseSchema,
      properties: [{ name: 'price', type: 'number', required: false, faker: '$ref:other.field', fakerArgs: { min: 10 } }],
    }});
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('faker_args_not_supported');
  });

  it('rejects fakerArgs larger than 4 KB', async () => {
    const big = { padding: 'x'.repeat(5000) };
    const res = await app.inject({ method: 'POST', url: `/workspaces/${wsId}/schemas`, payload: {
      ...baseSchema,
      properties: [{ name: 'price', type: 'number', required: false, faker: 'commerce.price', fakerArgs: big }],
    }});
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('faker_args_too_large');
  });
});
```

- [ ] **Step 3: Run the test**

```bash
pnpm --filter @mirage/workspace-svc test
```
Expected: all four cases PASS. If your app boots differently in tests, mirror the harness from an existing routes test in the same dir.

- [ ] **Step 4: Stage**

```bash
git add apps/workspace-svc/src/routes/__tests__/schemas-faker-args.test.ts
```

Ask the user whether to commit PR 3 with message:
```
feat(api): allow per-property fakerArgs on SchemaProp
```

---

# PR 4 — Engine wiring

Goal: engine spreads `fakerArgs` into the faker call. Backwards-compatible — props without `fakerArgs` behave identically.

### Task 10: Write failing tests for `FakerEngine.call(method, args)`

**Files:**
- Create: `packages/engine/src/__tests__/faker-engine.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest';
import { createFakerEngine } from '../faker-engine.js';
import { EngineError } from '../errors.js';

describe('createFakerEngine.call', () => {
  it('passes a single options object as the first arg', () => {
    const eng = createFakerEngine('en');
    eng.seed(1);
    const v = eng.call('commerce.price', { min: 10, max: 20 });
    expect(typeof v).toBe('string');
    const n = parseFloat(v as string);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(20);
  });

  it('spreads positional args from an array', () => {
    const eng = createFakerEngine('en');
    eng.seed(1);
    const v = eng.call('person.firstName', ['female']);
    expect(typeof v).toBe('string');
    expect((v as string).length).toBeGreaterThan(0);
  });

  it('works without args (backwards-compatible)', () => {
    const eng = createFakerEngine('en');
    eng.seed(1);
    const v = eng.call('string.uuid');
    expect(v).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('wraps faker runtime errors in EngineError', () => {
    const eng = createFakerEngine('en');
    eng.seed(1);
    expect(() => eng.call('commerce.price', { min: 100, max: 10 })).toThrow(EngineError);
  });
});
```

- [ ] **Step 2: Run — confirm it fails (call signature mismatch)**

```bash
pnpm --filter @mirage/engine test -- faker-engine
```
Expected: FAIL — type error or runtime mismatch because `call` doesn't accept a second arg yet.

### Task 11: Implement args spreading in `faker-engine.ts`

**Files:**
- Modify: `packages/engine/src/faker-engine.ts:11-20` (interface) and `:34-60` (implementation)

- [ ] **Step 1: Update the `FakerEngine` interface**

Replace lines 11-20 with:
```ts
export interface FakerEngine {
  /** Reseed faker before generating rows for a Schema. */
  seed(n: number): void;
  /** Invoke `faker.<ns>.<method>(...args)` by dotted-path. */
  call(method: string, args?: unknown): unknown;
  /** Exposed for Custom Functions' `ctx.faker`. */
  faker: Faker;
  /** Whether the requested locale was honored (vs. fallback to en). */
  localeHonored: boolean;
}
```

- [ ] **Step 2: Update the `call` implementation**

Replace the existing `call` body (around lines 34-60) with:
```ts
    call(method: string, args?: unknown): unknown {
      const segments = method.split('.');
      if (segments.length < 2) {
        throw new EngineError('unknown_faker_method', { method });
      }
      let cursor: unknown = faker;
      for (let i = 0; i < segments.length - 1; i++) {
        const next = (cursor as Record<string, unknown>)[segments[i]!];
        if (next === undefined || next === null) {
          throw new EngineError('unknown_faker_method', { method });
        }
        cursor = next;
      }
      const tail = segments[segments.length - 1]!;
      const fn = (cursor as Record<string, unknown>)[tail];
      if (typeof fn !== 'function') {
        throw new EngineError('unknown_faker_method', { method });
      }
      const callArgs = Array.isArray(args)
        ? args
        : args !== undefined && args !== null
          ? [args]
          : [];
      try {
        return (fn as (...a: unknown[]) => unknown).call(cursor, ...callArgs);
      } catch (e) {
        throw new EngineError('faker_call_failed', {
          method,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
```

- [ ] **Step 3: Run the test, confirm PASS**

```bash
pnpm --filter @mirage/engine test -- faker-engine
```
Expected: all 4 cases PASS.

- [ ] **Step 4: Stage**

```bash
git add packages/engine/src/faker-engine.ts packages/engine/src/__tests__/faker-engine.test.ts
```

### Task 12: Pass `fakerArgs` through `generate-rows.ts`

**Files:**
- Modify: `packages/engine/src/generate-rows.ts:126`

- [ ] **Step 1: Edit the file**

Change line 126:
```diff
-  return ctx.fakerEngine.call(p.faker);
+  return ctx.fakerEngine.call(
+    p.faker,
+    (p as { fakerArgs?: unknown }).fakerArgs,
+  );
```

The cast is needed only until OpenAPI types are confirmed picked up — after Task 7's regen, `p.fakerArgs` should already be typed; you can drop the cast if `pnpm -w typecheck` is green without it.

- [ ] **Step 2: Add a test in the existing generate-rows suite**

Edit `packages/engine/src/__tests__/generate-rows.test.ts` and add a new `it(...)`:
```ts
  it('forwards fakerArgs to the faker method', async () => {
    const sch = schema([
      { name: 'price', type: 'number', faker: 'commerce.price', required: false,
        fakerArgs: { min: 50, max: 60 } } as unknown as Api.components['schemas']['SchemaProp'],
    ]);
    const params = {
      schema: sch,
      count: 20,
      salt: 'salt',
      locale: 'en',
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: fakeSandbox,
    };
    for await (const row of generateRows(params)) {
      const n = parseFloat((row as Record<string, string>).price);
      expect(n).toBeGreaterThanOrEqual(50);
      expect(n).toBeLessThanOrEqual(60);
    }
  });
```

- [ ] **Step 3: Run**

```bash
pnpm --filter @mirage/engine test
```
Expected: new test PASSes; existing tests still PASS.

- [ ] **Step 4: Stage**

```bash
git add packages/engine/src/generate-rows.ts packages/engine/src/__tests__/generate-rows.test.ts
```

### Task 13: Pass `fakerArgs` through `dry-run.ts`

**Files:**
- Modify: `packages/engine/src/dry-run.ts`

- [ ] **Step 1: Find every `fakerEngine.call(...)` invocation**

```bash
grep -n "fakerEngine.call\|\.call(" packages/engine/src/dry-run.ts
```

- [ ] **Step 2: Update each invocation to forward `p.fakerArgs`**

For each `ctx.fakerEngine.call(p.faker)` call site, change to:
```ts
ctx.fakerEngine.call(p.faker, (p as { fakerArgs?: unknown }).fakerArgs)
```

- [ ] **Step 3: Run the dry-run tests**

```bash
pnpm --filter @mirage/engine test -- dry-run
```
Expected: all existing tests still PASS.

- [ ] **Step 4: Stage**

```bash
git add packages/engine/src/dry-run.ts
```

Ask the user whether to commit PR 4 with message:
```
feat(engine): forward fakerArgs to faker method calls
```

---

# PR 5 — UI: ARGS chip + popover

Goal: user-visible. ARGS chip next to the FakerCell, popover with kind-specific field renderers, method-swap clears args, client-side validation.

### Task 14: Create the serialize helper

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/serialize.ts`

- [ ] **Step 1: Create the file**

```ts
import type { MethodEntry } from '@mirage/fakerjs';

export type ArgsInternal = Record<string, unknown>;
export type ArgsStored = Record<string, unknown> | unknown[];

/** Stored shape → editor-internal `{name: value}` regardless of options/positional. */
export function toInternal(
  entry: MethodEntry | undefined,
  stored: ArgsStored | undefined,
): ArgsInternal {
  if (!stored) return {};
  if (Array.isArray(stored)) {
    if (!entry) return {};
    const out: ArgsInternal = {};
    entry.params.forEach((p, i) => {
      if (i < stored.length && stored[i] !== undefined) out[p.name] = stored[i];
    });
    return out;
  }
  return { ...stored };
}

/** Editor-internal → stored shape (object for options, array for positional). */
export function toStored(
  entry: MethodEntry | undefined,
  internal: ArgsInternal,
): ArgsStored | undefined {
  if (!entry || entry.shape === 'none') return undefined;
  const cleaned: ArgsInternal = {};
  for (const [k, v] of Object.entries(internal)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && v === '') continue;
    cleaned[k] = v;
  }
  if (Object.keys(cleaned).length === 0) return undefined;

  if (entry.shape === 'options') return cleaned;

  // positional: order by catalog params, trim trailing undefined.
  const arr: unknown[] = [];
  let lastDefinedIdx = -1;
  entry.params.forEach((p, i) => {
    arr[i] = cleaned[p.name];
    if (cleaned[p.name] !== undefined) lastDefinedIdx = i;
  });
  if (lastDefinedIdx < 0) return undefined;
  return arr.slice(0, lastDefinedIdx + 1);
}
```

- [ ] **Step 2: Add a unit test**

Create `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/__tests__/serialize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { MethodEntry } from '@mirage/fakerjs';
import { toInternal, toStored } from '../serialize.js';

const optionsEntry: MethodEntry = {
  shape: 'options',
  params: [
    { name: 'min', kind: 'number', label: 'min' },
    { name: 'max', kind: 'number', label: 'max' },
  ],
};
const positionalEntry: MethodEntry = {
  shape: 'positional',
  params: [
    { name: 'sex', kind: 'enum', label: 'sex', options: ['female', 'male'] },
  ],
};

describe('toInternal/toStored', () => {
  it('round-trips options shape', () => {
    expect(toStored(optionsEntry, toInternal(optionsEntry, { min: 10, max: 20 })))
      .toEqual({ min: 10, max: 20 });
  });

  it('round-trips positional shape', () => {
    expect(toStored(positionalEntry, toInternal(positionalEntry, ['female'])))
      .toEqual(['female']);
  });

  it('returns undefined when nothing is set', () => {
    expect(toStored(optionsEntry, {})).toBeUndefined();
    expect(toStored(optionsEntry, { min: undefined })).toBeUndefined();
  });

  it('trims trailing undefined in positional', () => {
    const entry: MethodEntry = {
      shape: 'positional',
      params: [
        { name: 'a', kind: 'string', label: 'a' },
        { name: 'b', kind: 'string', label: 'b' },
      ],
    };
    expect(toStored(entry, { a: 'x' })).toEqual(['x']);
  });
});
```

- [ ] **Step 3: Run**

```bash
pnpm --filter web test -- serialize
```
Expected: 4 cases PASS. If `web` doesn't have a test runner configured, use the closest path (`vitest run`) from `apps/web`. Confirm the test harness used elsewhere in `apps/web` and follow that.

- [ ] **Step 4: Stage**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/args/serialize.ts \
        apps/web/src/pages/dashboard/schemas/PropertyEditor/args/__tests__/serialize.test.ts
```

### Task 15: Create the validate helper

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/validate.ts`

- [ ] **Step 1: Create the file**

```ts
import type { MethodEntry } from '@mirage/fakerjs';
import type { ArgsInternal } from './serialize.js';

export interface ValidationIssue {
  paramName?: string;
  message: string;
}

/** Returns the first issue found, or null if everything is valid. */
export function validateArgs(
  entry: MethodEntry | undefined,
  internal: ArgsInternal,
): ValidationIssue | null {
  if (!entry || entry.shape === 'none') return null;

  // 1. min/max pairs (when both are set on the same entry).
  const minP = entry.params.find((p) => p.name === 'min');
  const maxP = entry.params.find((p) => p.name === 'max');
  if (minP && maxP) {
    const min = internal.min;
    const max = internal.max;
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      return { paramName: 'max', message: 'max must be ≥ min' };
    }
  }

  // 2. enum values must be in the allowed list.
  for (const p of entry.params) {
    if (p.kind !== 'enum') continue;
    const v = internal[p.name];
    if (v === undefined || v === '') continue;
    if (!p.options?.includes(String(v))) {
      return { paramName: p.name, message: `${p.name} must be one of: ${p.options?.join(', ') ?? ''}` };
    }
  }

  // 3. Positional required-by-position: when a param at index N is set, all params
  // at index <N must also be set (otherwise the array would have holes).
  if (entry.shape === 'positional') {
    let seenSet = false;
    for (let i = entry.params.length - 1; i >= 0; i--) {
      const v = internal[entry.params[i]!.name];
      const isSet = v !== undefined && v !== '';
      if (isSet) seenSet = true;
      else if (seenSet) {
        return { paramName: entry.params[i]!.name, message: `${entry.params[i]!.name} is required when later positional args are set` };
      }
    }
  }

  return null;
}
```

- [ ] **Step 2: Stage**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/args/validate.ts
```

### Task 16: Create the field renderers

**Files (one component per kind, mirror the design at `design/add-params-fn/args-editor.jsx`):**
- Create: `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/field-renderers/IntegerField.tsx`
- Create: `…/NumberField.tsx`
- Create: `…/StringField.tsx`
- Create: `…/BooleanField.tsx`
- Create: `…/EnumField.tsx`
- Create: `…/DateField.tsx`
- Create: `…/ArrayField.tsx`
- Create: `…/RegexField.tsx`
- Create: `…/index.ts` (barrel)
- Create: `…/FieldLabel.tsx` (shared label)

- [ ] **Step 1: Create the shared `FieldLabel.tsx`**

```tsx
import type { Param } from '@mirage/fakerjs';

export function FieldLabel({ param }: { param: Param }) {
  return (
    <label
      htmlFor={`arg-${param.name}`}
      className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground"
    >
      <span>{param.label}</span>
      {param.hint && (
        <span className="font-normal normal-case tracking-normal text-[10.5px] text-muted-foreground/70">
          {param.hint}
        </span>
      )}
    </label>
  );
}
```

- [ ] **Step 2: Create `IntegerField.tsx` and `NumberField.tsx`**

```tsx
// IntegerField.tsx
import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function IntegerField({ param, value, onChange, invalid }: {
  param: Param;
  value: unknown;
  onChange: (v: number | undefined) => void;
  invalid?: boolean;
}) {
  const v = typeof value === 'number' ? value : '';
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <input
        id={`arg-${param.name}`}
        type="number"
        value={v}
        step={1}
        min={param.min}
        max={param.max}
        placeholder={param.default !== undefined ? String(param.default) : ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          const n = parseInt(raw, 10);
          onChange(Number.isNaN(n) ? undefined : n);
        }}
        className={'h-8 rounded-md border bg-background px-2 font-mono text-[12px] outline-none focus:ring-[2px] focus:ring-ring/10 ' +
          (invalid ? 'border-destructive focus:border-destructive' : 'border-input focus:border-ring')}
      />
    </div>
  );
}
```

`NumberField.tsx` is identical except `parseInt` → `parseFloat`, `step={1}` → `step={param.step ?? 'any'}`. Copy and adapt.

- [ ] **Step 3: Create `StringField.tsx`**

```tsx
import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function StringField({ param, value, onChange, invalid }: {
  param: Param;
  value: unknown;
  onChange: (v: string | undefined) => void;
  invalid?: boolean;
}) {
  const v = typeof value === 'string' ? value : '';
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <input
        id={`arg-${param.name}`}
        type="text"
        value={v}
        placeholder={param.default !== undefined ? String(param.default) : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={'h-8 rounded-md border bg-background px-2 font-mono text-[12px] outline-none focus:ring-[2px] focus:ring-ring/10 ' +
          (invalid ? 'border-destructive focus:border-destructive' : 'border-input focus:border-ring')}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create `BooleanField.tsx`**

```tsx
import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function BooleanField({ param, value, onChange }: {
  param: Param;
  value: unknown;
  onChange: (v: boolean | undefined) => void;
}) {
  const on = value === true;
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(on ? undefined : true)}
        className={'flex h-7 w-12 items-center rounded-full p-0.5 transition-colors ' +
          (on ? 'bg-foreground' : 'bg-muted')}
      >
        <span className={'h-6 w-6 rounded-full bg-background shadow-sm transition-transform ' +
          (on ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create `EnumField.tsx`**

```tsx
import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function EnumField({ param, value, onChange, invalid }: {
  param: Param;
  value: unknown;
  onChange: (v: string | undefined) => void;
  invalid?: boolean;
}) {
  const current = typeof value === 'string' ? value : '';
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <div className={'flex flex-wrap gap-1' + (invalid ? ' ring-1 ring-destructive rounded p-0.5' : '')}>
        {(param.options ?? []).map((opt) => (
          <button
            key={opt || '__empty'}
            type="button"
            onClick={() => onChange(opt === '' ? undefined : opt)}
            className={'h-7 rounded-md border px-2.5 text-[12px] transition-colors ' +
              (current === opt
                ? 'border-foreground bg-foreground text-background'
                : 'border-input bg-background text-foreground hover:bg-accent')}
          >
            {opt === '' ? <span className="italic text-muted-foreground">any</span> : opt}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `DateField.tsx`**

```tsx
import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function DateField({ param, value, onChange }: {
  param: Param;
  value: unknown;
  onChange: (v: string | undefined) => void;
}) {
  const v = typeof value === 'string' ? value : '';
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <input
        id={`arg-${param.name}`}
        type="date"
        value={v}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-8 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
      />
    </div>
  );
}
```

- [ ] **Step 7: Create `ArrayField.tsx`**

```tsx
import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function ArrayField({ param, value, onChange }: {
  param: Param;
  value: unknown;
  onChange: (v: string[] | undefined) => void;
}) {
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const text = arr.join('\n');
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <textarea
        id={`arg-${param.name}`}
        rows={Math.max(3, arr.length)}
        value={text}
        placeholder={'one\nper\nline'}
        onChange={(e) => {
          const lines = e.target.value.split('\n').map((s) => s.replace(/\r$/, ''));
          const trimmed = lines.length && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
          onChange(trimmed.length === 0 ? undefined : trimmed);
        }}
        className="rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[12px] leading-snug outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
      />
      {arr.length > 0 && (
        <div className="text-[10.5px] text-muted-foreground">{arr.length} item{arr.length === 1 ? '' : 's'}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create `RegexField.tsx`**

```tsx
import type { Param } from '@mirage/fakerjs';
import { FieldLabel } from './FieldLabel.js';

export function RegexField({ param, value, onChange }: {
  param: Param;
  value: unknown;
  onChange: (v: string | undefined) => void;
}) {
  const v = typeof value === 'string' ? value : '';
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel param={param} />
      <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[2px] focus-within:ring-ring/10">
        <span className="flex items-center border-r border-input bg-muted px-2 font-mono text-[12px] text-muted-foreground">/</span>
        <input
          id={`arg-${param.name}`}
          type="text"
          value={v}
          placeholder={param.default !== undefined ? String(param.default) : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="h-8 flex-1 bg-transparent px-2 font-mono text-[12px] outline-none"
        />
        <span className="flex items-center border-l border-input bg-muted px-2 font-mono text-[12px] text-muted-foreground">/</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create `index.ts` barrel**

```ts
export { IntegerField } from './IntegerField.js';
export { NumberField } from './NumberField.js';
export { StringField } from './StringField.js';
export { BooleanField } from './BooleanField.js';
export { EnumField } from './EnumField.js';
export { DateField } from './DateField.js';
export { ArrayField } from './ArrayField.js';
export { RegexField } from './RegexField.js';
```

- [ ] **Step 10: Typecheck**

```bash
pnpm --filter web typecheck
```
Expected: PASS.

- [ ] **Step 11: Stage**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/args/field-renderers
```

### Task 17: Create `ArgsEditor.tsx`

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsEditor.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react';
import { FAKER_CATALOG, type MethodEntry, type Param } from '@mirage/fakerjs';
import {
  IntegerField, NumberField, StringField, BooleanField,
  EnumField, DateField, ArrayField, RegexField,
} from './field-renderers/index.js';
import { toInternal, toStored, type ArgsInternal, type ArgsStored } from './serialize.js';
import { validateArgs } from './validate.js';

export interface ArgsEditorProps {
  method: string;
  stored: ArgsStored | undefined;
  onChange: (next: ArgsStored | undefined) => void;
}

function renderField(param: Param, value: unknown, onChange: (v: unknown) => void, invalid: boolean) {
  switch (param.kind) {
    case 'integer': return <IntegerField param={param} value={value} onChange={onChange} invalid={invalid} />;
    case 'number':  return <NumberField  param={param} value={value} onChange={onChange} invalid={invalid} />;
    case 'string':  return <StringField  param={param} value={value} onChange={onChange} invalid={invalid} />;
    case 'boolean': return <BooleanField param={param} value={value} onChange={onChange} />;
    case 'enum':    return <EnumField    param={param} value={value} onChange={onChange} invalid={invalid} />;
    case 'date':    return <DateField    param={param} value={value} onChange={onChange} />;
    case 'array':   return <ArrayField   param={param} value={value} onChange={onChange as (v: string[] | undefined) => void} />;
    case 'regex':   return <RegexField   param={param} value={value} onChange={onChange} />;
  }
}

export function ArgsEditor({ method, stored, onChange }: ArgsEditorProps) {
  const entry: MethodEntry | undefined = FAKER_CATALOG[method];
  const [advanced, setAdvanced] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(stored ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [internal, setInternal] = useState<ArgsInternal>(() => toInternal(entry, stored));

  useEffect(() => {
    setInternal(toInternal(entry, stored));
    setJsonDraft(JSON.stringify(stored ?? {}, null, 2));
    setJsonError(null);
    setAdvanced(false);
  }, [method]); // re-init when method changes

  if (!entry) {
    return (
      <RawJsonEditor
        value={stored}
        onChange={onChange}
        notice="No curated signature — edit args as raw JSON."
      />
    );
  }

  if (entry.shape === 'none') {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-[12px] text-muted-foreground">
        This method takes no arguments.
      </div>
    );
  }

  if (advanced) {
    return (
      <div className="flex flex-col gap-2">
        <RawJsonEditor value={stored} onChange={onChange} notice={null} />
        <button type="button" onClick={() => setAdvanced(false)} className="self-start text-[11px] text-muted-foreground underline hover:text-foreground">
          ← back to form
        </button>
      </div>
    );
  }

  const validation = validateArgs(entry, internal);

  const setParam = (name: string, val: unknown) => {
    const next = { ...internal };
    if (val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) delete next[name];
    else next[name] = val;
    setInternal(next);
    onChange(toStored(entry, next));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={entry.params.length > 2 ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
        {entry.params.map((p) => (
          <div key={p.name}>
            {renderField(p, internal[p.name], (v) => setParam(p.name, v), validation?.paramName === p.name)}
          </div>
        ))}
      </div>
      {validation && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
          {validation.message}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border pt-2 text-[10.5px] text-muted-foreground">
        <span>
          shape: <span className="font-mono">{entry.shape === 'options' ? '{ options }' : '(...positional)'}</span>
        </span>
        <button type="button" onClick={() => setAdvanced(true)} className="font-mono text-[10.5px] underline hover:text-foreground">
          edit JSON →
        </button>
      </div>
    </div>
  );
}

function RawJsonEditor({ value, onChange, notice }: {
  value: ArgsStored | undefined;
  onChange: (next: ArgsStored | undefined) => void;
  notice: string | null;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setDraft(JSON.stringify(value ?? {}, null, 2)); }, [JSON.stringify(value)]);

  return (
    <div className="flex flex-col gap-1.5">
      {notice && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-foreground/80">
          {notice}
        </div>
      )}
      <textarea
        rows={6}
        value={draft}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          try {
            const parsed = e.target.value.trim() === '' ? undefined : JSON.parse(e.target.value);
            setErr(null);
            onChange(parsed);
          } catch (ex) {
            setErr(ex instanceof Error ? ex.message : String(ex));
          }
        }}
        className={'rounded-md border bg-background px-2 py-1.5 font-mono text-[11.5px] leading-snug outline-none focus:ring-[2px] focus:ring-ring/10 ' +
          (err ? 'border-destructive focus:border-destructive' : 'border-input focus:border-ring')}
      />
      {err && <div className="text-[11px] text-destructive">{err}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck
```
Expected: PASS.

- [ ] **Step 3: Stage**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsEditor.tsx
```

### Task 18: Create `ArgsPopover.tsx`

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsPopover.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { FAKER_CATALOG } from '@mirage/fakerjs';
import { ArgsEditor } from './ArgsEditor.js';
import type { ArgsStored } from './serialize.js';

export interface ArgsPopoverProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  method: string;
  stored: ArgsStored | undefined;
  onChange: (next: ArgsStored | undefined) => void;
  onClose: () => void;
}

export function ArgsPopover({ anchorRef, open, method, stored, onChange, onClose }: ArgsPopoverProps) {
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const update = (): void => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 420;
      const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.right - w));
      setPos({ left, top: r.bottom + 6, width: w });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event): void => {
      if (popRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open, onClose]);

  if (!open || !pos) return null;
  const entry = FAKER_CATALOG[method];
  const dot = method.indexOf('.');
  const ns = dot < 0 ? '' : method.slice(0, dot);
  const m = dot < 0 ? method : method.slice(dot + 1);

  return createPortal(
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        ref={popRef}
        className="fixed z-40 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border bg-card/60 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="rounded bg-brand-violet/10 px-1.5 py-0.5 font-mono text-[10.5px] text-brand-violet">{ns}</span>
              <span className="font-mono text-foreground">.{m}</span>
              {entry && (
                <span className="ml-1 rounded-md border border-input bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {entry.shape === 'options' ? '{ options }' : entry.shape === 'positional' ? '(positional)' : '(none)'}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            disabled={stored === undefined}
            className="rounded-md border border-input bg-background px-2 py-1 text-[10.5px] text-muted-foreground hover:enabled:bg-accent hover:enabled:text-foreground disabled:opacity-50"
            title="Reset to defaults"
          >
            reset
          </button>
        </div>
        <div className="max-h-[440px] overflow-y-auto px-3 py-3">
          <ArgsEditor method={method} stored={stored} onChange={onChange} />
        </div>
      </div>
    </>,
    document.body,
  );
}
```

- [ ] **Step 2: Stage**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsPopover.tsx
```

### Task 19: Create `ArgsChip.tsx`

**Files:**
- Create: `apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsChip.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useRef, useState } from 'react';
import { Sliders } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { FAKER_CATALOG } from '@mirage/fakerjs';
import { ArgsPopover } from './ArgsPopover.js';
import { toInternal } from './serialize.js';
import { validateArgs } from './validate.js';
import type { ArgsStored } from './serialize.js';

export interface ArgsChipProps {
  method: string;
  stored: ArgsStored | undefined;
  onChange: (next: ArgsStored | undefined) => void;
}

const REF_PREFIX = '$ref:';
const FN_PREFIX = '$fn:';

export function ArgsChip({ method, stored, onChange }: ArgsChipProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Hidden states
  if (!method || method.startsWith(REF_PREFIX) || method.startsWith(FN_PREFIX)) return null;
  const entry = FAKER_CATALOG[method];
  if (!entry || entry.shape === 'none') return null;

  const count = stored
    ? Array.isArray(stored)
      ? stored.filter((v) => v !== undefined && v !== '').length
      : Object.values(stored).filter((v) => v !== undefined && v !== '').length
    : 0;

  const invalid = !!validateArgs(entry, toInternal(entry, stored));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-[10.5px]',
          invalid
            ? 'border-destructive bg-destructive/10 text-destructive'
            : count > 0
              ? 'border-foreground bg-foreground text-background'
              : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        title={count > 0 ? `${count} argument(s)` : 'configure arguments'}
      >
        <Sliders size={10} />
        {count > 0 ? count : 'ARGS'}
      </button>
      <ArgsPopover
        anchorRef={btnRef}
        open={open}
        method={method}
        stored={stored}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 2: Stage**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/args/ArgsChip.tsx
```

### Task 20: Wire `ArgsChip` into `FakerCell.tsx`

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx`

- [ ] **Step 1: Extend `FakerCellProps`**

In `FakerCell.tsx` around line 14, change:
```ts
export interface FakerCellProps {
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  onToggle: () => void;
  workspaceSchemas: Schema[];
  invalid: boolean;
}
```
to:
```ts
export interface FakerCellProps {
  value: string;
  onChange: (v: string, opts?: { clearArgs?: boolean }) => void;
  open: boolean;
  onToggle: () => void;
  workspaceSchemas: Schema[];
  invalid: boolean;
  fakerArgs: import('./args/serialize.js').ArgsStored | undefined;
  onFakerArgsChange: (next: import('./args/serialize.js').ArgsStored | undefined) => void;
}
```

- [ ] **Step 2: Import the chip and add it after the trigger button**

Near the top of the file, add:
```ts
import { ArgsChip } from './args/ArgsChip.js';
```

Replace the existing `<div className="relative"> ... </div>` outer wrapper around the trigger button (around lines 134-167) to wrap both the button and the chip in a flex container:
```tsx
return (
  <div className="relative flex items-center gap-1">
    <button ...existing trigger>
      ...existing trigger content
    </button>
    <ArgsChip method={value} stored={fakerArgs} onChange={onFakerArgsChange} />
    {/* existing portal popover */}
    ...
  </div>
);
```

Keep the `createPortal(...)` call unchanged — it now lives as a sibling of the chip.

- [ ] **Step 3: Clear args on method-swap**

Every `onChange(...)` call inside the picker portal needs to also signal `clearArgs: true`. Find each occurrence in the file:

```bash
grep -n "onChange(" apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx
```

Replace each picker callback that sets a new method:
```ts
onChange(`${FN_PREFIX}${f.id}`);
onChange(`${REF_PREFIX}${r.key}.${r.field}`);
onChange(`${g.ns}.${m}`);
```
with:
```ts
onChange(`${FN_PREFIX}${f.id}`, { clearArgs: true });
onChange(`${REF_PREFIX}${r.key}.${r.field}`, { clearArgs: true });
onChange(`${g.ns}.${m}`, { clearArgs: true });
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter web typecheck
```
Expected: PASS in `FakerCell.tsx`; failures in callers (next task) are expected.

- [ ] **Step 5: Stage**

```bash
git add apps/web/src/pages/dashboard/schemas/PropertyEditor/FakerCell.tsx
```

### Task 21: Wire `fakerArgs` through `PropertyRow` (the FakerCell caller)

**Files:**
- Find the caller of `<FakerCell>` and modify it. Likely `apps/web/src/pages/dashboard/schemas/PropertyEditor/PropertyRow.tsx` or similar.

- [ ] **Step 1: Find the caller**

```bash
grep -rn "<FakerCell" apps/web/src
```

- [ ] **Step 2: Plumb `fakerArgs` + `onFakerArgsChange` through the row component**

The row component already has a `prop` for the SchemaProp and a `onChange(prop: SchemaProp)` callback (typical pattern). Add:

- Pass `fakerArgs={(prop as { fakerArgs?: ArgsStored }).fakerArgs}` to `<FakerCell>`.
- Pass `onFakerArgsChange={(next) => onChange({ ...prop, fakerArgs: next })}`.
- Update the existing `<FakerCell>` `onChange` prop usage so it handles the new `{ clearArgs?: boolean }` opts:
  ```ts
  onChange={(v, opts) => onChange({
    ...prop,
    faker: v,
    ...(opts?.clearArgs ? { fakerArgs: undefined } : {}),
  })}
  ```

(If the prop store treats `undefined` differently from an absent key, switch to:
```ts
const next = { ...prop, faker: v };
if (opts?.clearArgs) delete (next as { fakerArgs?: unknown }).fakerArgs;
onChange(next);
```
)

- [ ] **Step 3: Typecheck the full web app**

```bash
pnpm --filter web typecheck
```
Expected: PASS.

- [ ] **Step 4: Start dev server, click around**

```bash
pnpm --filter web dev
```

In the browser:
1. Open a Schema.
2. On a property where `faker` is `commerce.price`, an `ARGS` chip appears next to the faker cell.
3. Click it → popover opens with `min`/`max`/`decimals`/`symbol` fields.
4. Set `min: 10, max: 20`. Chip changes to show "2". Schema marked dirty.
5. Save. Reload page. Args persist.
6. Change method to `string.uuid`. Chip disappears (no params).
7. Try `min: 100, max: 10`. Cell & chip get red border. Save blocked client-side.

- [ ] **Step 5: Stage**

```bash
git add <caller-file-path>
```

Ask the user whether to commit PR 5 with message:
```
feat(web): per-property faker argument editor (ARGS chip + popover)
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Tasks |
|---|---|
| Catalog — generated skeleton | Task 4 |
| Catalog — hand overrides | Task 5 |
| Catalog — completeness audit | Task 3, 6 |
| Catalog — public API | Tasks 2, 6 |
| Storage — `fakerArgs` on SchemaProp | Task 7 |
| Storage — server-side invariants | Tasks 8, 9 |
| Engine — `call(method, args)` | Tasks 10, 11 |
| Engine — `generate-rows.ts` | Task 12 |
| Engine — `dry-run.ts` | Task 13 |
| UI — ArgsChip | Task 19 |
| UI — ArgsPopover | Task 18 |
| UI — ArgsEditor + renderers | Tasks 16, 17 |
| UI — serialize options/positional | Task 14 |
| UI — client-side validation | Task 15 |
| UI — clear args on method swap | Task 20 |
| UI — chip hidden states | Task 19 (ArgsChip early returns) |
| Version lock | Task 1 |
| Migration | Zero migration; verified by existing tests passing in PR 4 |

All spec sections have at least one task.

**2. Placeholder scan:** scanned. No TBDs, no "implement later", no "similar to Task N" without code. Each step has exact paths, exact diffs, or exact code.

**3. Type consistency:**
- `MethodEntry`, `Param`, `ParamKind`, `FakerCatalog` defined in Task 2, used in Tasks 3, 5, 6, 14–19. Consistent.
- `ArgsInternal`, `ArgsStored` defined in Task 14, used in Tasks 17–21. Consistent.
- `FakerEngine.call(method, args?)` signature defined in Task 11, used in Tasks 12, 13. Consistent.
- `FakerCellProps.fakerArgs` + `onFakerArgsChange` defined in Task 20, used in Task 21. Consistent.

Plan complete.
