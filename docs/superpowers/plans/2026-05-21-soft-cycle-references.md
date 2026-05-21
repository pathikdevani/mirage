# Soft Cycle References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy for this repo:** Do NOT run `git commit` unless the user explicitly asks. The commit steps below are kept for plan completeness; treat them as "stage the changes and pause for the user".

**Goal:** Stop rejecting reference cycles that resolve to safe scalar cross-pointers (e.g. Phone.person_id ↔ Person.phone_id) while still rejecting cycles that would embed entire rows or close a field-projection chain on itself, and make the engine actually generate rows for the allowed cycles.

**Architecture:** Introduce a shared `classifyRefEdge` utility in `@mirage/engine` that decides whether a single `$ref` edge is **hard** (a true data dependency) or **soft** (a scalar projection bottoming out in a primitive). Cycle detectors in both the workspace-svc routes and the engine consume this classifier and only reject cycles that contain at least one hard edge. At run-time, soft-cycle schemas are materialised in a seed pass before the main streaming loop so cross-pointers resolve against pre-computed rows.

**Tech Stack:** TypeScript, Vitest, Fastify, Nx monorepo, pnpm. Engine is pure TS; workspace-svc is Fastify on MongoDB; web is React.

**Reference docs:**
- Spec: [docs/superpowers/specs/2026-05-21-soft-cycle-references-design.md](../specs/2026-05-21-soft-cycle-references-design.md)
- Engine cycle detection: [packages/engine/src/topology.ts](../../../packages/engine/src/topology.ts), [packages/engine/src/extract-set-edges.ts](../../../packages/engine/src/extract-set-edges.ts), [packages/engine/src/plan-run-set.ts](../../../packages/engine/src/plan-run-set.ts), [packages/engine/src/run-set-stream.ts](../../../packages/engine/src/run-set-stream.ts)
- Workspace-svc routes: [apps/workspace-svc/src/routes/schemas.ts](../../../apps/workspace-svc/src/routes/schemas.ts)
- Frontend error mapping: [apps/web/src/pages/dashboard/schemas/lib/mapServerError.ts](../../../apps/web/src/pages/dashboard/schemas/lib/mapServerError.ts)

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `packages/engine/src/classify-ref-edges.ts` | Create | Pure classifier: given the workspace's schemas indexed by `(schemaKey, fieldPath)`, classify a single `$ref` edge as `{ hard: false }` or `{ hard: true, kind }`. |
| `packages/engine/src/__tests__/classify-ref-edges.test.ts` | Create | Tests for A/B/C-soft/C-hard/D, orphan, nested object/array paths. |
| `packages/engine/src/extract-set-edges.ts` | Modify | `SetEdge` gains `hard: boolean` and `cycleKind?: 'embedding' \| 'field_deadlock'`; populate via classifier. |
| `packages/engine/src/__tests__/extract-set-edges.test.ts` | Create | Tests for hard/soft flags on the four scenarios. |
| `packages/engine/src/topology.ts` | Modify | `detectCycles` filters soft edges and reports `kind`. New `topoSortWithSoftCycles` returns `{ order, softCycleGroups }`. |
| `packages/engine/src/__tests__/topology.test.ts` | Modify | Add tests for soft-cycle group reporting and kind on hard cycles. |
| `packages/engine/src/plan-run-set.ts` | Modify | `RunSetPlan` gains `softCycleSeedFields`; only hard cycles throw `cycle_in_set`. |
| `packages/engine/src/__tests__/plan-run-set.test.ts` | Modify | Cover scenario A (passes, fields populated) and B/D (still throws). |
| `packages/engine/src/run-set-stream.ts` | Modify | Pre-materialise soft-cycle schemas before the main loop; main loop yields cached rows for those schemas. |
| `packages/engine/src/__tests__/run-set-stream.test.ts` | Modify | End-to-end Phone↔Person scenario producing cross-pointing UUIDs. |
| `packages/engine/src/index.ts` | Modify | Re-export `classifyRefEdge`, types. |
| `apps/workspace-svc/src/routes/schemas.ts` | Modify | Replace direct `$ref → edge` graph build with classifier-driven hard graph; surface `kind` in `cycle_detected.detail`. |
| `apps/web/src/pages/dashboard/schemas/lib/mapServerError.ts` | Modify | Switch banner text on `detail.kind`. |

---

## Task 1: Classifier — core algorithm (TDD)

**Files:**
- Create: `packages/engine/src/classify-ref-edges.ts`
- Test: `packages/engine/src/__tests__/classify-ref-edges.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/src/__tests__/classify-ref-edges.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildFakerIndex,
  classifyRefEdge,
  type FakerIndex,
} from '../classify-ref-edges.js';
import type { Api } from '@mirage/types';

type SchemaProp = Api.components['schemas']['SchemaProp'];

function primitive(name: string, faker = 'string.uuid'): SchemaProp {
  return { name, type: 'string', faker, required: false } as SchemaProp;
}

function schema(key: string, props: SchemaProp[]) {
  return { key, properties: props } as Api.components['schemas']['Schema'];
}

describe('classifyRefEdge', () => {
  it('A: scalar cross-projection to primitive is soft', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_id', '$ref:person.id')]),
      schema('person', [primitive('id'), primitive('phone_id', '$ref:phone.id')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'person_id', targetKey: 'person', targetField: 'id' },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('B: $ref without field is hard:embedding', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_obj', '$ref:person')]),
      schema('person', [primitive('id')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'person_obj', targetKey: 'person', targetField: undefined },
        idx,
      ),
    ).toEqual({ hard: true, kind: 'embedding' });
  });

  it('C-soft: self-ref to primitive id is soft', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('parent_id', '$ref:phone.id')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'parent_id', targetKey: 'phone', targetField: 'id' },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('C-hard: self-ref without field is hard:embedding', () => {
    const schemas = [schema('phone', [primitive('id'), primitive('self', '$ref:phone')])];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'self', targetKey: 'phone', targetField: undefined },
        idx,
      ),
    ).toEqual({ hard: true, kind: 'embedding' });
  });

  it('D: field-projection chain closing on itself is hard:field_deadlock', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('x', '$ref:person.y')]),
      schema('person', [primitive('id'), primitive('y', '$ref:phone.x')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'x', targetKey: 'person', targetField: 'y' },
        idx,
      ),
    ).toEqual({ hard: true, kind: 'field_deadlock' });
  });

  it('orphan target field is treated as soft (no transitive dep)', () => {
    const schemas = [schema('phone', [primitive('id'), primitive('p', '$ref:person.id')])];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'phone', fromFieldPath: 'p', targetKey: 'person', targetField: 'id' },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('nested object field path resolves correctly', () => {
    const addressObj: SchemaProp = {
      name: 'address',
      type: 'object',
      fields: [primitive('city'), primitive('zip')],
      required: false,
    } as SchemaProp;
    const schemas = [
      schema('person', [primitive('id'), addressObj]),
      schema('phone', [primitive('id'), primitive('city_ref', '$ref:person.address.city')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        {
          fromSchemaKey: 'phone',
          fromFieldPath: 'city_ref',
          targetKey: 'person',
          targetField: 'address.city',
        },
        idx,
      ),
    ).toEqual({ hard: false });
  });

  it('three-hop chain that terminates at a primitive is soft', () => {
    const schemas = [
      schema('a', [primitive('id'), primitive('toB', '$ref:b.toC')]),
      schema('b', [primitive('id'), primitive('toC', '$ref:c.id')]),
      schema('c', [primitive('id')]),
    ];
    const idx = buildFakerIndex(schemas);
    expect(
      classifyRefEdge(
        { fromSchemaKey: 'a', fromFieldPath: 'toB', targetKey: 'b', targetField: 'toC' },
        idx,
      ),
    ).toEqual({ hard: false });
  });
});

describe('buildFakerIndex', () => {
  it('indexes flat properties', () => {
    const idx: FakerIndex = buildFakerIndex([
      schema('phone', [primitive('id', 'string.uuid'), primitive('name', 'person.firstName')]),
    ]);
    expect(idx.get('phone:id')).toBe('string.uuid');
    expect(idx.get('phone:name')).toBe('person.firstName');
  });

  it('indexes nested objects with dotted paths', () => {
    const obj: SchemaProp = {
      name: 'address',
      type: 'object',
      fields: [primitive('city', 'location.city')],
      required: false,
    } as SchemaProp;
    const idx = buildFakerIndex([schema('person', [primitive('id'), obj])]);
    expect(idx.get('person:address.city')).toBe('location.city');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && pnpm vitest run src/__tests__/classify-ref-edges.test.ts`
Expected: FAIL with "Cannot find module '../classify-ref-edges.js'".

- [ ] **Step 3: Implement the classifier**

Create `packages/engine/src/classify-ref-edges.ts`:

```ts
import type { Api } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

/** "schemaKey:fieldPath" → faker string on that leaf property (undefined for object/array branches). */
export type FakerIndex = ReadonlyMap<string, string | undefined>;

export interface RefEdgeInput {
  fromSchemaKey: string;
  fromFieldPath: string;
  targetKey: string;
  /** Field projection. `undefined` means `$ref:<targetKey>` with no `.field`. */
  targetField: string | undefined;
}

export type EdgeClass =
  | { hard: false }
  | { hard: true; kind: 'embedding' | 'field_deadlock' };

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;

/** Build a `(schemaKey, fieldPath) → faker` index across every leaf property in every schema. */
export function buildFakerIndex(schemas: ReadonlyArray<Schema>): FakerIndex {
  const out = new Map<string, string | undefined>();
  for (const s of schemas) {
    walkProps(s.properties ?? [], '', (path, faker) => {
      out.set(`${s.key}:${path}`, faker);
    });
  }
  return out;
}

function walkProps(
  props: ReadonlyArray<SchemaProp>,
  prefix: string,
  visit: (path: string, faker: string | undefined) => void,
): void {
  for (const p of props) {
    const path = prefix ? `${prefix}.${p.name}` : p.name;
    if (p.type === 'object' && Array.isArray(p.fields)) {
      walkProps(p.fields, path, visit);
      continue;
    }
    if (p.type === 'array' && p.items) {
      // Treat the array container itself as having no faker; descend into items
      // under the same path. `$ref` targets never include `[]`, so we don't
      // surface the bracket form here — only `path` -> faker for the element
      // (if it's a leaf). Nested object items recurse normally.
      if (p.items.type === 'object' && Array.isArray(p.items.fields)) {
        walkProps(p.items.fields, path, visit);
      } else {
        visit(path, typeof p.items.faker === 'string' ? p.items.faker : undefined);
      }
      continue;
    }
    visit(path, typeof p.faker === 'string' ? p.faker : undefined);
  }
}

/**
 * Classify a single $ref edge.
 *
 *   - No field projection ⇒ hard (embedding).
 *   - Field projection that bottoms out in a primitive ⇒ soft.
 *   - Field projection whose chain closes on a field already on the trace ⇒ hard (field_deadlock).
 *   - Field projection to an orphan (no entry in the index) ⇒ soft (treated as primitive).
 */
export function classifyRefEdge(edge: RefEdgeInput, fakerIndex: FakerIndex): EdgeClass {
  if (edge.targetField === undefined) {
    return { hard: true, kind: 'embedding' };
  }
  const trace = new Set<string>();
  trace.add(`${edge.fromSchemaKey}:${edge.fromFieldPath}`);
  return follow(edge.targetKey, edge.targetField, fakerIndex, trace);
}

function follow(
  schemaKey: string,
  fieldPath: string,
  fakerIndex: FakerIndex,
  trace: Set<string>,
): EdgeClass {
  const key = `${schemaKey}:${fieldPath}`;
  if (trace.has(key)) {
    return { hard: true, kind: 'field_deadlock' };
  }

  const faker = fakerIndex.get(key);
  if (!faker) return { hard: false };

  const m = REF_RE.exec(faker);
  if (!m) return { hard: false };

  const nextKey = m[1]!;
  const nextField = m[2];
  if (!nextField) return { hard: true, kind: 'embedding' };

  trace.add(key);
  return follow(nextKey, nextField, fakerIndex, trace);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && pnpm vitest run src/__tests__/classify-ref-edges.test.ts`
Expected: all 10 tests pass.

- [ ] **Step 5: Stage and pause**

```bash
git add packages/engine/src/classify-ref-edges.ts packages/engine/src/__tests__/classify-ref-edges.test.ts
# Pause for user to review / commit.
```

---

## Task 2: Extend `SetEdge` with `hard` + `cycleKind` (TDD)

**Files:**
- Modify: `packages/engine/src/extract-set-edges.ts`
- Create: `packages/engine/src/__tests__/extract-set-edges.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/src/__tests__/extract-set-edges.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractSetEdges } from '../extract-set-edges.js';
import type { Api } from '@mirage/types';

type SchemaProp = Api.components['schemas']['SchemaProp'];

function primitive(name: string, faker = 'string.uuid'): SchemaProp {
  return { name, type: 'string', faker, required: false } as SchemaProp;
}

function schema(key: string, props: SchemaProp[]) {
  return { key, properties: props } as Api.components['schemas']['Schema'];
}

describe('extractSetEdges hard/soft classification', () => {
  it('marks scalar id cross-references as soft', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_id', '$ref:person.id')]),
      schema('person', [primitive('id'), primitive('phone_id', '$ref:phone.id')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone', 'person']));
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.hard).toBe(false);
      expect(e.cycleKind).toBeUndefined();
    }
  });

  it('marks $ref without field as hard:embedding', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_obj', '$ref:person')]),
      schema('person', [primitive('id')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone', 'person']));
    expect(edges).toHaveLength(1);
    expect(edges[0]!.hard).toBe(true);
    expect(edges[0]!.cycleKind).toBe('embedding');
  });

  it('marks field-level deadlock as hard:field_deadlock', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('x', '$ref:person.y')]),
      schema('person', [primitive('id'), primitive('y', '$ref:phone.x')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone', 'person']));
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.hard).toBe(true);
      expect(e.cycleKind).toBe('field_deadlock');
    }
  });

  it('skips refs whose target is outside the inclusion set', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_id', '$ref:person.id')]),
      schema('person', [primitive('id')]),
    ];
    const edges = extractSetEdges(schemas, new Set(['phone'])); // person not included
    expect(edges).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && pnpm vitest run src/__tests__/extract-set-edges.test.ts`
Expected: FAIL — `hard` and `cycleKind` are not on the returned objects.

- [ ] **Step 3: Update `SetEdge` and populate hard/cycleKind**

Edit `packages/engine/src/extract-set-edges.ts`:

```ts
import type { Api } from '@mirage/types';
import { buildFakerIndex, classifyRefEdge } from './classify-ref-edges.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

export interface SetEdge {
  fromSchemaKey: string;
  /** Dotted path; `[]` separates array property names. Example: `addresses[].cityRef`. */
  fromFieldPath: string;
  toSchemaKey: string;
  /** Dotted path of the field on the target schema whose value is projected. Undefined ⇒ project `__id`. */
  toFieldPath?: string;
  cardinality: 'one' | 'many';
  /** Whether this edge constitutes a true data dependency (true = cycle through it is rejected). */
  hard: boolean;
  /** Only set when `hard === true`. */
  cycleKind?: 'embedding' | 'field_deadlock';
}

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;

export function extractSetEdges(
  schemas: ReadonlyArray<Schema>,
  includedKeys: ReadonlySet<string>,
): SetEdge[] {
  const fakerIndex = buildFakerIndex(schemas);
  const out: SetEdge[] = [];
  for (const schema of schemas) {
    if (!includedKeys.has(schema.key)) continue;
    walk(schema.properties, '', false, schema.key, includedKeys, fakerIndex, out);
  }
  return out;
}

function walk(
  props: SchemaProp[],
  basePath: string,
  insideArray: boolean,
  fromSchemaKey: string,
  includedKeys: ReadonlySet<string>,
  fakerIndex: ReturnType<typeof buildFakerIndex>,
  out: SetEdge[],
): void {
  for (const p of props) {
    const path = basePath ? `${basePath}.${p.name}` : p.name;
    if (typeof p.faker === 'string') {
      const m = p.faker.match(REF_RE);
      if (m && includedKeys.has(m[1]!)) {
        const targetKey = m[1]!;
        const targetField = m[2];
        const cls = classifyRefEdge(
          { fromSchemaKey, fromFieldPath: path, targetKey, targetField },
          fakerIndex,
        );
        const edge: SetEdge = {
          fromSchemaKey,
          fromFieldPath: path,
          toSchemaKey: targetKey,
          ...(targetField ? { toFieldPath: targetField } : {}),
          cardinality: insideArray ? 'many' : 'one',
          hard: cls.hard,
          ...(cls.hard ? { cycleKind: cls.kind } : {}),
        };
        out.push(edge);
      }
    }
    if (p.type === 'object' && Array.isArray(p.fields)) {
      walk(p.fields, path, insideArray, fromSchemaKey, includedKeys, fakerIndex, out);
    } else if (p.type === 'array' && p.items) {
      walk([p.items], `${path}[]`, true, fromSchemaKey, includedKeys, fakerIndex, out);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && pnpm vitest run src/__tests__/extract-set-edges.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Run the full engine suite to catch regressions**

Run: `cd packages/engine && pnpm vitest run`
Expected: all pre-existing tests still pass.

- [ ] **Step 6: Stage and pause**

```bash
git add packages/engine/src/extract-set-edges.ts packages/engine/src/__tests__/extract-set-edges.test.ts
```

---

## Task 3: Filter soft edges in `detectCycles`; partition soft cycles in `topoSort`

**Files:**
- Modify: `packages/engine/src/topology.ts`
- Modify: `packages/engine/src/__tests__/topology.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/__tests__/topology.test.ts`:

```ts
import { topoSortWithSoftCycles } from '../topology.js';

const softEdge = (
  fromSchemaKey: string,
  toSchemaKey: string,
  fromFieldPath = `${toSchemaKey}_ref`,
): SetEdge => ({
  fromSchemaKey,
  toSchemaKey,
  fromFieldPath,
  cardinality: 'one',
  hard: false,
});

const hardEdge = (
  fromSchemaKey: string,
  toSchemaKey: string,
  kind: 'embedding' | 'field_deadlock' = 'embedding',
  fromFieldPath = `${toSchemaKey}_ref`,
): SetEdge => ({
  fromSchemaKey,
  toSchemaKey,
  fromFieldPath,
  cardinality: 'one',
  hard: true,
  cycleKind: kind,
});

describe('detectCycles soft/hard filtering', () => {
  it('ignores soft-only cycles', () => {
    const keys = new Set(['phone', 'person']);
    const edges = [softEdge('phone', 'person'), softEdge('person', 'phone')];
    expect(detectCycles(keys, edges)).toEqual([]);
  });

  it('reports cycles that contain at least one hard edge with its kind', () => {
    const keys = new Set(['a', 'b']);
    const edges = [hardEdge('a', 'b', 'embedding'), softEdge('b', 'a')];
    const cycles = detectCycles(keys, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.kind).toBe('embedding');
  });

  it('reports field_deadlock when both edges are hard:field_deadlock', () => {
    const keys = new Set(['a', 'b']);
    const edges = [hardEdge('a', 'b', 'field_deadlock'), hardEdge('b', 'a', 'field_deadlock')];
    const cycles = detectCycles(keys, edges);
    expect(cycles[0]!.kind).toBe('field_deadlock');
  });
});

describe('topoSortWithSoftCycles', () => {
  it('orders an acyclic DAG and returns no soft groups', () => {
    const keys = new Set(['a', 'b', 'c']);
    const edges = [softEdge('a', 'b'), softEdge('b', 'c')];
    const result = topoSortWithSoftCycles(keys, edges);
    expect(result.order.indexOf('c')).toBeLessThan(result.order.indexOf('b'));
    expect(result.order.indexOf('b')).toBeLessThan(result.order.indexOf('a'));
    expect(result.softCycleGroups).toEqual([]);
  });

  it('groups members of a soft cycle and still returns a complete order', () => {
    const keys = new Set(['phone', 'person']);
    const edges = [softEdge('phone', 'person'), softEdge('person', 'phone')];
    const result = topoSortWithSoftCycles(keys, edges);
    expect(new Set(result.order)).toEqual(new Set(['phone', 'person']));
    expect(result.softCycleGroups).toHaveLength(1);
    expect(new Set(result.softCycleGroups[0]!)).toEqual(new Set(['phone', 'person']));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && pnpm vitest run src/__tests__/topology.test.ts`
Expected: FAIL — `kind` field missing, `topoSortWithSoftCycles` not exported.

- [ ] **Step 3: Update `topology.ts`**

Replace the contents of `packages/engine/src/topology.ts`:

```ts
import type { SetEdge } from './extract-set-edges.js';

export interface CyclePath {
  schemaKeys: string[];
  fieldPaths: string[];
  /** Worst kind among the hard edges in the cycle. */
  kind: 'embedding' | 'field_deadlock';
}

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function detectCycles(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): CyclePath[] {
  // Only hard edges can form a forbidden cycle.
  const hardEdges = edges.filter((e) => e.hard);

  const adj = new Map<string, Array<{ to: string; fieldPath: string; kind: 'embedding' | 'field_deadlock' }>>();
  for (const k of schemaKeys) adj.set(k, []);
  for (const e of hardEdges) {
    adj.get(e.fromSchemaKey)?.push({
      to: e.toSchemaKey,
      fieldPath: e.fromFieldPath,
      kind: e.cycleKind ?? 'embedding',
    });
  }

  const colour = new Map<string, number>();
  for (const k of schemaKeys) colour.set(k, WHITE);

  const cycles: CyclePath[] = [];
  const stack: Array<{ key: string; incomingField: string; incomingKind: 'embedding' | 'field_deadlock' | null }> = [];

  const visit = (key: string, incomingField: string, incomingKind: 'embedding' | 'field_deadlock' | null): void => {
    colour.set(key, GRAY);
    stack.push({ key, incomingField, incomingKind });
    for (const e of adj.get(key) ?? []) {
      const c = colour.get(e.to);
      if (c === undefined) continue;
      if (c === GRAY) {
        const startIdx = stack.findIndex((f) => f.key === e.to);
        if (startIdx === -1) continue;
        const cyclePath = stack.slice(startIdx);
        const kinds = [
          ...cyclePath.slice(1).map((f) => f.incomingKind ?? 'embedding'),
          e.kind,
        ];
        const kind: 'embedding' | 'field_deadlock' = kinds.includes('embedding')
          ? 'embedding'
          : 'field_deadlock';
        cycles.push({
          schemaKeys: [...cyclePath.map((f) => f.key), e.to],
          fieldPaths: [...cyclePath.slice(1).map((f) => f.incomingField), e.fieldPath],
          kind,
        });
      } else if (c === WHITE) {
        visit(e.to, e.fieldPath, e.kind);
      }
    }
    stack.pop();
    colour.set(key, BLACK);
  };

  for (const k of schemaKeys) {
    if (colour.get(k) === WHITE) visit(k, '', null);
  }
  return cycles;
}

/**
 * Edge from A → B means A references B. Resolve B before A.
 * Returns insertion order if a cycle prevents a valid topological sort.
 */
export function topoSort(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): string[] {
  return topoSortWithSoftCycles(schemaKeys, edges).order;
}

/**
 * Like `topoSort` but partitions schemas that form soft-only strongly-connected
 * components (SCCs of size ≥ 2, or a single node with a self soft edge) into
 * `softCycleGroups`. Order is a full permutation of `schemaKeys`: acyclic
 * nodes are ordered normally; each soft group is placed as a contiguous block
 * after every schema the group hard-depends on.
 *
 * The detector itself only considers SOFT edges when forming groups — hard
 * cycles should already have been rejected by `detectCycles`.
 */
export function topoSortWithSoftCycles(
  schemaKeys: ReadonlySet<string>,
  edges: ReadonlyArray<SetEdge>,
): { order: string[]; softCycleGroups: string[][] } {
  // 1. Find SCCs using soft edges only.
  const softAdj = new Map<string, string[]>();
  const softReverseAdj = new Map<string, string[]>();
  for (const k of schemaKeys) {
    softAdj.set(k, []);
    softReverseAdj.set(k, []);
  }
  for (const e of edges) {
    if (e.hard) continue;
    softAdj.get(e.fromSchemaKey)?.push(e.toSchemaKey);
    softReverseAdj.get(e.toSchemaKey)?.push(e.fromSchemaKey);
  }

  // Tarjan-lite via two DFS passes (Kosaraju).
  const order: string[] = [];
  const seen = new Set<string>();
  const dfs1 = (n: string): void => {
    if (seen.has(n)) return;
    seen.add(n);
    for (const m of softAdj.get(n) ?? []) dfs1(m);
    order.push(n);
  };
  for (const k of schemaKeys) dfs1(k);

  const sccId = new Map<string, number>();
  let nextId = 0;
  const assign = (n: string, id: number): void => {
    if (sccId.has(n)) return;
    sccId.set(n, id);
    for (const m of softReverseAdj.get(n) ?? []) assign(m, id);
  };
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i]!;
    if (!sccId.has(k)) {
      assign(k, nextId);
      nextId++;
    }
  }

  const groupsById = new Map<number, string[]>();
  for (const k of schemaKeys) {
    const id = sccId.get(k)!;
    if (!groupsById.has(id)) groupsById.set(id, []);
    groupsById.get(id)!.push(k);
  }
  const softCycleGroups = [...groupsById.values()].filter((g) => g.length > 1);

  // 2. Topo sort over a condensed graph where each soft SCC collapses into a
  //    single node. Hard edges are full edges in this graph; soft edges within
  //    an SCC are removed; soft edges between SCCs are kept.
  const nodeOfSchema = (k: string): number => sccId.get(k)!;
  const condensedInDeg = new Map<number, number>();
  const condensedReverseAdj = new Map<number, number[]>();
  for (const id of groupsById.keys()) {
    condensedInDeg.set(id, 0);
    condensedReverseAdj.set(id, []);
  }
  // Build edges A → B (A references B): we want B before A, so reverse for topo.
  const edgeSeen = new Set<string>();
  for (const e of edges) {
    const a = nodeOfSchema(e.fromSchemaKey);
    const b = nodeOfSchema(e.toSchemaKey);
    if (a === b) continue;
    const tag = `${a}->${b}`;
    if (edgeSeen.has(tag)) continue;
    edgeSeen.add(tag);
    condensedInDeg.set(a, (condensedInDeg.get(a) ?? 0) + 1);
    condensedReverseAdj.get(b)!.push(a);
  }

  const queue: number[] = [];
  for (const [id, d] of condensedInDeg) if (d === 0) queue.push(id);
  const condensedOrder: number[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    condensedOrder.push(id);
    for (const next of condensedReverseAdj.get(id) ?? []) {
      const d = (condensedInDeg.get(next) ?? 0) - 1;
      condensedInDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (condensedOrder.length !== groupsById.size) {
    // Hard cycle remains — caller should have rejected. Fall back.
    return { order: [...schemaKeys], softCycleGroups };
  }

  const flatOrder: string[] = [];
  for (const id of condensedOrder) {
    for (const k of groupsById.get(id)!) flatOrder.push(k);
  }
  return { order: flatOrder, softCycleGroups };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && pnpm vitest run src/__tests__/topology.test.ts`
Expected: all tests pass (old + new).

- [ ] **Step 5: Stage and pause**

```bash
git add packages/engine/src/topology.ts packages/engine/src/__tests__/topology.test.ts
```

---

## Task 4: `planRunSet` returns soft-cycle seed plan; only hard cycles throw

**Files:**
- Modify: `packages/engine/src/plan-run-set.ts`
- Modify: `packages/engine/src/__tests__/plan-run-set.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/__tests__/plan-run-set.test.ts`:

```ts
describe('planRunSet — soft cycles', () => {
  it('allows scalar id cross-references (Scenario A) and reports seed fields', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person_id', '$ref:person.id')]),
      schema('person', [primitive('id'), primitive('phone_id', '$ref:phone.id')]),
    ];
    const set = baseSet([
      { schemaKey: 'phone', count: 5 },
      { schemaKey: 'person', count: 5 },
    ]);
    const plan = planRunSet({ set, schemas });
    expect(plan.softCycleSeedFields).toHaveLength(1);
    const group = plan.softCycleSeedFields[0]!;
    expect(new Set(group.map((g) => g.schemaKey))).toEqual(new Set(['phone', 'person']));
    expect(group.find((g) => g.schemaKey === 'phone')!.fieldPaths).toContain('id');
    expect(group.find((g) => g.schemaKey === 'person')!.fieldPaths).toContain('id');
  });

  it('still throws cycle_in_set when an embedding cycle exists (Scenario B)', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('person', '$ref:person')]),
      schema('person', [primitive('id'), primitive('phone', '$ref:phone')]),
    ];
    const set = baseSet([
      { schemaKey: 'phone', count: 1 },
      { schemaKey: 'person', count: 1 },
    ]);
    try {
      planRunSet({ set, schemas });
      throw new Error('expected planRunSet to throw');
    } catch (err) {
      expect((err as EngineError).code).toBe('cycle_in_set');
      expect((err as EngineError).detail).toMatchObject({
        cycles: expect.arrayContaining([expect.objectContaining({ kind: 'embedding' })]),
      });
    }
  });

  it('throws field_deadlock when chains close on themselves (Scenario D)', () => {
    const schemas = [
      schema('phone', [primitive('id'), primitive('x', '$ref:person.y')]),
      schema('person', [primitive('id'), primitive('y', '$ref:phone.x')]),
    ];
    const set = baseSet([
      { schemaKey: 'phone', count: 1 },
      { schemaKey: 'person', count: 1 },
    ]);
    try {
      planRunSet({ set, schemas });
      throw new Error('expected planRunSet to throw');
    } catch (err) {
      expect((err as EngineError).detail).toMatchObject({
        cycles: expect.arrayContaining([expect.objectContaining({ kind: 'field_deadlock' })]),
      });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && pnpm vitest run src/__tests__/plan-run-set.test.ts`
Expected: FAIL — `softCycleSeedFields` not on plan; old `cycle_in_set` triggers for Scenario A.

- [ ] **Step 3: Update `plan-run-set.ts`**

Replace `packages/engine/src/plan-run-set.ts`:

```ts
import type { Api } from '@mirage/types';
import { EngineError } from './errors.js';
import { extractSetEdges } from './extract-set-edges.js';
import { detectCycles, topoSortWithSoftCycles } from './topology.js';

type MirageSet = Api.components['schemas']['Set'];
type Schema = Api.components['schemas']['Schema'];

export const MAX_ROWS_PER_SCHEMA = 1_000_000;

export interface SoftCycleSchemaSeed {
  schemaKey: string;
  /** Field paths on this schema that peers in the soft-cycle group project. */
  fieldPaths: string[];
}

export interface RunSetPlan {
  /** Topo order of schemaKeys: each key only after every key it hard-references. Soft-cycle members appear as contiguous blocks. */
  order: ReadonlyArray<string>;
  /** Inclusion order from the Set, with validated count values. */
  perSchema: ReadonlyArray<{ schemaKey: string; count: number }>;
  /** Σ count across all inclusions. */
  totalRows: number;
  /**
   * One entry per soft-cycle group. Each entry lists which fields on each
   * member must be seeded before the main streaming pass so peer resolvers
   * have something to read.
   */
  softCycleSeedFields: ReadonlyArray<ReadonlyArray<SoftCycleSchemaSeed>>;
}

export interface PlanRunSetParams {
  set: MirageSet;
  schemas: ReadonlyArray<Schema>;
}

export function planRunSet(params: PlanRunSetParams): RunSetPlan {
  const { set, schemas } = params;

  for (const inc of set.schemas) {
    if (!schemas.some((s) => s.key === inc.schemaKey)) {
      throw new EngineError('schema_missing', { schemaKey: inc.schemaKey });
    }
    if (!Number.isInteger(inc.count) || inc.count < 0) {
      throw new EngineError('count_invalid', { schemaKey: inc.schemaKey, count: inc.count });
    }
    if (inc.count > MAX_ROWS_PER_SCHEMA) {
      throw new EngineError('count_too_large', {
        schemaKey: inc.schemaKey,
        count: inc.count,
        max: MAX_ROWS_PER_SCHEMA,
      });
    }
  }

  const includedKeys = new Set(set.schemas.map((s) => s.schemaKey));
  const edges = extractSetEdges(schemas, includedKeys);
  const cycles = detectCycles(includedKeys, edges);
  if (cycles.length > 0) {
    throw new EngineError('cycle_in_set', { cycles });
  }

  const { order, softCycleGroups } = topoSortWithSoftCycles(includedKeys, edges);

  // For each soft group, gather the projected field paths each member exposes
  // to its peers. These are the anchor columns the seed pass must populate.
  const softCycleSeedFields: SoftCycleSchemaSeed[][] = softCycleGroups.map((group) => {
    const groupSet = new Set(group);
    const fieldsBySchema = new Map<string, Set<string>>();
    for (const k of group) fieldsBySchema.set(k, new Set());
    for (const e of edges) {
      if (e.hard) continue;
      if (!groupSet.has(e.toSchemaKey)) continue;
      if (!groupSet.has(e.fromSchemaKey)) continue;
      if (e.toFieldPath) fieldsBySchema.get(e.toSchemaKey)!.add(e.toFieldPath);
    }
    return group.map((schemaKey) => ({
      schemaKey,
      fieldPaths: [...(fieldsBySchema.get(schemaKey) ?? [])],
    }));
  });

  const perSchema = set.schemas.map((inc) => ({ schemaKey: inc.schemaKey, count: inc.count }));
  const totalRows = perSchema.reduce((acc, inc) => acc + inc.count, 0);

  return { order, perSchema, totalRows, softCycleSeedFields };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && pnpm vitest run src/__tests__/plan-run-set.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run the full engine suite**

Run: `cd packages/engine && pnpm vitest run`
Expected: all tests pass. If `run-set-stream.test.ts` references `softCycleSeedFields` indirectly via plan, it should still pass since the field is additive.

- [ ] **Step 6: Stage and pause**

```bash
git add packages/engine/src/plan-run-set.ts packages/engine/src/__tests__/plan-run-set.test.ts
```

---

## Task 5: Seed pass in `run-set-stream` for soft-cycle schemas (TDD)

**Files:**
- Modify: `packages/engine/src/run-set-stream.ts`
- Modify: `packages/engine/src/__tests__/run-set-stream.test.ts`

The seed pass strategy: for each soft-cycle group, materialise every member's rows up-front (re-using the existing `materialiseSchema` helper and its `materialisedRows` cache). Push their projected anchor columns into `projectedColumns`. In the main pass, when we hit a schema that's already in the materialised cache, we iterate the cached rows instead of calling `generateRows` again — substitution still runs so peer projections get filled in.

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/__tests__/run-set-stream.test.ts` (read the file first to match imports and helpers; reuse existing fixtures where possible):

```ts
describe('runSetStream — soft cycles', () => {
  it('generates Phone and Person with cross-pointing UUIDs', async () => {
    const schemas: Schema[] = [
      schema('phone', [primitive('id', 'string.uuid'), primitive('person_id', '$ref:person.id')]),
      schema('person', [primitive('id', 'string.uuid'), primitive('phone_id', '$ref:phone.id')]),
    ];
    const set = baseSet([
      { schemaKey: 'phone', count: 3 },
      { schemaKey: 'person', count: 3 },
    ]);

    const batches: RowBatch[] = [];
    for await (const b of runSetStream({
      set,
      schemas,
      customFunctions: customFunctionRegistryFromMap(new Map()),
      sandbox: makeFakeSandbox(),
    })) {
      batches.push(b);
    }

    const phoneRows = batches.filter((b) => b.schemaKey === 'phone').flatMap((b) => b.rows);
    const personRows = batches.filter((b) => b.schemaKey === 'person').flatMap((b) => b.rows);
    expect(phoneRows).toHaveLength(3);
    expect(personRows).toHaveLength(3);

    const personIds = new Set(personRows.map((r) => (r as Record<string, unknown>)['id']));
    const phoneIds = new Set(phoneRows.map((r) => (r as Record<string, unknown>)['id']));
    for (const r of phoneRows) {
      expect(personIds.has((r as Record<string, unknown>)['person_id'])).toBe(true);
    }
    for (const r of personRows) {
      expect(phoneIds.has((r as Record<string, unknown>)['phone_id'])).toBe(true);
    }
  });
});
```

(The test relies on helpers — `schema`, `primitive`, `baseSet`, `makeFakeSandbox`, `customFunctionRegistryFromMap` — that should already exist in this file or be importable. If they don't exist in the file, copy them from `plan-run-set.test.ts` first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && pnpm vitest run src/__tests__/run-set-stream.test.ts`
Expected: FAIL — the main pass calls `generateRows` for `phone` first, but `projectedColumns['person']` is empty, so `person_id` ends up as a `RefPlaceholder` instead of a UUID.

- [ ] **Step 3: Implement the seed pass**

Edit `packages/engine/src/run-set-stream.ts`. Locate the `runSetStream` function and:

(a) After computing `plan`, derive the set of schemas needing pre-materialisation:

```ts
const seededSchemas = new Set<string>();
for (const group of plan.softCycleSeedFields) {
  for (const member of group) seededSchemas.add(member.schemaKey);
}
```

(b) Before the main `for (const schemaKey of plan.order)` loop, run the seed pass:

```ts
// Seed pass: materialise every soft-cycle member so projected columns are
// populated before peer schemas in the cycle try to resolve them.
for (const group of plan.softCycleSeedFields) {
  for (const member of group) {
    await materialiseSchema(member.schemaKey, {
      schemas,
      countByKey,
      customFunctions,
      sandbox,
      salt: set.salt,
      locale: set.output.locale,
      cache: materialisedRows,
    });
  }
  // Push anchor columns into `projectedColumns` from the cached rows.
  for (const member of group) {
    const rows = materialisedRows.get(member.schemaKey)!;
    if (!projectedColumns.has(member.schemaKey)) {
      projectedColumns.set(member.schemaKey, new Map());
    }
    const cols = projectedColumns.get(member.schemaKey)!;
    for (const fp of member.fieldPaths) {
      if (!cols.has(fp)) cols.set(fp, []);
      const arr = cols.get(fp)!;
      for (const row of rows) {
        arr.push(getByPath(row as Record<string, unknown>, fp));
      }
    }
  }
}
```

(c) Inside the main loop, replace the `for await (const row of generateRows(...))` block with a row source that picks from the cache when present:

```ts
const rowSource = seededSchemas.has(schemaKey)
  ? (async function* () {
      const cached = materialisedRows.get(schemaKey) ?? [];
      for (const row of cached) yield row;
    })()
  : generateRows({
      schema,
      count: schemaTotal,
      salt: set.salt,
      locale: set.output.locale,
      customFunctions,
      sandbox,
    });

for await (const row of rowSource) {
  if (signal?.aborted) throw new CancelledError();
  const sourceIndex = schemaProduced + buffer.length;
  for (const e of outgoing) {
    const resolver = resolvers.get(edgeKey(e))!;
    const value = resolver(sourceIndex);
    substituteRef(row as Record<string, unknown>, e.fromFieldPath, value);
  }
  buffer.push(row);

  if (myProjections) {
    const cols = projectedColumns.get(schemaKey)!;
    for (const fp of myProjections) {
      // Skip fields we already pushed in the seed pass to avoid duplicates.
      const arr = cols.get(fp)!;
      if (seededSchemas.has(schemaKey) && arr.length >= countByKey.get(schemaKey)!) {
        continue;
      }
      arr.push(getByPath(row as Record<string, unknown>, fp));
    }
  }

  if (buffer.length >= batchSize) {
    if (signal?.aborted) throw new CancelledError();
    schemaProduced += buffer.length;
    totalProduced += buffer.length;
    yield { schemaKey, rows: buffer, schemaProduced, schemaTotal, totalProduced, totalRows };
    buffer = [];
  }
}
```

The key invariant: for a seeded schema, the `materialisedRows` cache is the canonical row list; the main pass substitutes refs in place (mutating the cached rows) but does not re-generate.

- [ ] **Step 4: Run the soft-cycle test**

Run: `cd packages/engine && pnpm vitest run src/__tests__/run-set-stream.test.ts -t "soft cycles"`
Expected: PASS.

- [ ] **Step 5: Run the full engine suite**

Run: `cd packages/engine && pnpm vitest run`
Expected: all tests pass.

- [ ] **Step 6: Stage and pause**

```bash
git add packages/engine/src/run-set-stream.ts packages/engine/src/__tests__/run-set-stream.test.ts
```

---

## Task 6: Re-export from engine entry point

**Files:**
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Open `packages/engine/src/index.ts` and add**

```ts
export {
  buildFakerIndex,
  classifyRefEdge,
  type EdgeClass,
  type FakerIndex,
  type RefEdgeInput,
} from './classify-ref-edges.js';
```

(Place alongside the other module re-exports; preserve alphabetical order if the file already follows that convention.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mirage/engine run build` (or `pnpm typecheck` if there's a global script).
Expected: no errors.

- [ ] **Step 3: Stage and pause**

```bash
git add packages/engine/src/index.ts
```

---

## Task 7: Workspace-svc CREATE/UPDATE use classifier-driven cycle detection (TDD)

**Files:**
- Modify: `apps/workspace-svc/src/routes/schemas.ts`

This task replaces the bespoke `findCycle` and `detectCycleInGraph` helpers with a hard-edge graph computed via `classifyRefEdge`. We treat the workspace's existing schemas plus the incoming draft as one corpus, build the faker index, and walk every `$ref:` to classify it. The cycle detector then runs on hard edges only.

- [ ] **Step 1: Locate existing workspace-svc tests, or set up the smallest viable test**

Run: `find apps/workspace-svc -name "*.test.ts" -o -name "*.spec.ts"`

If no test file exists for schemas routes, **create** `apps/workspace-svc/src/routes/__tests__/schemas.cycle.test.ts` that exercises the route logic in isolation. The route file should expose its cycle-helper directly for unit testing; refactor the helper into a small pure function `assertNoHardCycle(allSchemasInWs, draft)` that throws `ValidationError` on hard cycles.

```ts
import { describe, it, expect } from 'vitest';
import { assertNoHardCycle } from '../schemas.js';

function schema(key: string, properties: { name: string; faker?: string; type?: string }[]) {
  return {
    key,
    properties: properties.map((p) => ({
      name: p.name,
      type: p.type ?? 'string',
      faker: p.faker,
      required: false,
    })),
  } as Parameters<typeof assertNoHardCycle>[0][number];
}

describe('assertNoHardCycle', () => {
  it('allows scenario A (scalar cross-id)', () => {
    const existing = [
      schema('person', [{ name: 'id', faker: 'string.uuid' }, { name: 'phone_id', faker: '$ref:phone.id' }]),
    ];
    const draft = schema('phone', [
      { name: 'id', faker: 'string.uuid' },
      { name: 'person_id', faker: '$ref:person.id' },
    ]);
    expect(() => assertNoHardCycle(existing, draft)).not.toThrow();
  });

  it('rejects scenario B (embedding cycle)', () => {
    const existing = [
      schema('person', [{ name: 'id', faker: 'string.uuid' }, { name: 'phone', faker: '$ref:phone' }]),
    ];
    const draft = schema('phone', [
      { name: 'id', faker: 'string.uuid' },
      { name: 'person', faker: '$ref:person' },
    ]);
    expect(() => assertNoHardCycle(existing, draft)).toThrow(
      expect.objectContaining({ code: 'cycle_detected', detail: expect.objectContaining({ kind: 'embedding' }) }),
    );
  });

  it('rejects scenario D (field deadlock)', () => {
    const existing = [
      schema('person', [{ name: 'id', faker: 'string.uuid' }, { name: 'y', faker: '$ref:phone.x' }]),
    ];
    const draft = schema('phone', [
      { name: 'id', faker: 'string.uuid' },
      { name: 'x', faker: '$ref:person.y' },
    ]);
    expect(() => assertNoHardCycle(existing, draft)).toThrow(
      expect.objectContaining({ code: 'cycle_detected', detail: expect.objectContaining({ kind: 'field_deadlock' }) }),
    );
  });

  it('allows self-ref to primitive (C-soft)', () => {
    const existing = [] as Parameters<typeof assertNoHardCycle>[0];
    const draft = schema('phone', [
      { name: 'id', faker: 'string.uuid' },
      { name: 'parent_id', faker: '$ref:phone.id' },
    ]);
    expect(() => assertNoHardCycle(existing, draft)).not.toThrow();
  });

  it('rejects self-ref without field (C-hard)', () => {
    const existing = [] as Parameters<typeof assertNoHardCycle>[0];
    const draft = schema('phone', [
      { name: 'id', faker: 'string.uuid' },
      { name: 'self', faker: '$ref:phone' },
    ]);
    expect(() => assertNoHardCycle(existing, draft)).toThrow(
      expect.objectContaining({ code: 'cycle_detected', detail: expect.objectContaining({ kind: 'embedding' }) }),
    );
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `cd apps/workspace-svc && pnpm vitest run src/routes/__tests__/schemas.cycle.test.ts`
Expected: FAIL — `assertNoHardCycle` is not exported.

- [ ] **Step 3: Refactor `apps/workspace-svc/src/routes/schemas.ts`**

In `apps/workspace-svc/src/routes/schemas.ts`:

(a) Import the classifier helpers:

```ts
import {
  buildFakerIndex,
  classifyRefEdge,
  customFunctionRegistryFromMap,
  dryRunSchema,
  type CustomFunctionEntry,
} from '@mirage/engine';
```

(b) Replace `findCycle` and `detectCycleInGraph` with a single helper:

```ts
type SchemaForCycle = {
  key: string;
  properties: SchemaProp[];
};

export function assertNoHardCycle(
  existing: ReadonlyArray<SchemaForCycle>,
  draft: SchemaForCycle,
): void {
  const corpus = [...existing.filter((s) => s.key !== draft.key), draft];
  const fakerIndex = buildFakerIndex(
    corpus as unknown as Parameters<typeof buildFakerIndex>[0],
  );

  // Build hard-edge adjacency by classifying every $ref encountered.
  const adj = new Map<string, Array<{ to: string; kind: 'embedding' | 'field_deadlock'; fromPath: string }>>();
  for (const s of corpus) adj.set(s.key, []);

  for (const s of corpus) {
    const refs = collectRefsWithField(s.properties);
    for (const r of refs) {
      const cls = classifyRefEdge(
        {
          fromSchemaKey: s.key,
          fromFieldPath: r.fromPath,
          targetKey: r.targetKey,
          targetField: r.targetField,
        },
        fakerIndex,
      );
      if (cls.hard) {
        adj.get(s.key)!.push({ to: r.targetKey, kind: cls.kind, fromPath: r.fromPath });
      }
    }
  }

  // DFS for any cycle in the hard graph; report the worst kind in it.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const colour = new Map<string, number>();
  const stack: Array<{ key: string; incomingKind: 'embedding' | 'field_deadlock' | null }> = [];

  const dfs = (k: string): { cycle: string[]; kind: 'embedding' | 'field_deadlock' } | null => {
    colour.set(k, GRAY);
    stack.push({ key: k, incomingKind: null });
    for (const e of adj.get(k) ?? []) {
      const c = colour.get(e.to) ?? WHITE;
      if (c === GRAY) {
        const startIdx = stack.findIndex((f) => f.key === e.to);
        const slice = startIdx >= 0 ? stack.slice(startIdx) : [{ key: e.to, incomingKind: null }];
        const kinds = [...slice.slice(1).map((f) => f.incomingKind), e.kind];
        const kind = kinds.includes('embedding') ? 'embedding' : 'field_deadlock';
        return { cycle: [...slice.map((f) => f.key), e.to], kind };
      }
      if (c === WHITE) {
        stack[stack.length - 1] = { key: k, incomingKind: e.kind };
        const r = dfs(e.to);
        if (r) return r;
      }
    }
    stack.pop();
    colour.set(k, BLACK);
    return null;
  };

  for (const k of adj.keys()) {
    if ((colour.get(k) ?? WHITE) === WHITE) {
      const found = dfs(k);
      if (found) {
        throw Object.assign(new Error('Reference graph contains a cycle'), {
          code: 'cycle_detected',
          detail: { kind: found.kind, cycle: found.cycle },
        });
      }
    }
  }
}

function collectRefsWithField(
  properties: SchemaProp[],
): { targetKey: string; targetField: string | undefined; fromPath: string }[] {
  const REF = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;
  const out: { targetKey: string; targetField: string | undefined; fromPath: string }[] = [];
  const walk = (props: SchemaProp[], path: string): void => {
    for (const p of props) {
      const next = path ? `${path}.${p.name}` : p.name;
      if (typeof p.faker === 'string') {
        const m = p.faker.match(REF);
        if (m) out.push({ targetKey: m[1]!, targetField: m[2], fromPath: next });
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, next);
      else if (p.type === 'array' && p.items) walk([p.items], `${next}[]`);
    }
  };
  walk(properties, '');
  return out;
}
```

(c) Update CREATE handler — replace the existing hard-cycle block (around `findCycle(normalized.key, newRefs, existingForCycle)` near line 486) with:

```ts
try {
  assertNoHardCycle(
    allInWs as unknown as ReadonlyArray<SchemaForCycle>,
    { key: normalized.key, properties: normalized.properties },
  );
} catch (e) {
  const errObj = e as { code?: string; detail?: { kind?: string; cycle?: string[] }; message?: string };
  if (errObj?.code === 'cycle_detected') {
    return reply
      .code(400)
      .send(err('cycle_detected', errObj.message ?? 'Reference graph contains a cycle', errObj.detail));
  }
  throw e;
}
```

(d) Update UPDATE handler the same way (around line 623). Pass `allInWs.filter(s => s.id !== existing.id)` as the existing list and the draft for the new key/properties.

(e) Update the post-key-rename cascade (the `cycleAfter = detectCycleInGraph(graph)` block around line 726). Replace with:

```ts
for (let i = 0; i < after.length; i++) {
  const s = after[i]!;
  try {
    assertNoHardCycle(
      after.filter((_, j) => j !== i) as unknown as ReadonlyArray<SchemaForCycle>,
      { key: s.key, properties: s.properties as SchemaProp[] },
    );
  } catch (e) {
    const errObj = e as { code?: string; detail?: { kind?: string; cycle?: string[] } };
    if (errObj?.code === 'cycle_detected') {
      state.error = err(
        'key_rewrite_failed',
        'Renaming this key would introduce a cycle',
        errObj.detail,
      );
      if (session) await session.abortTransaction();
      return;
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd apps/workspace-svc && pnpm vitest run src/routes/__tests__/schemas.cycle.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Run the workspace-svc test suite**

Run: `cd apps/workspace-svc && pnpm vitest run`
Expected: all pre-existing tests still pass.

- [ ] **Step 6: Stage and pause**

```bash
git add apps/workspace-svc/src/routes/schemas.ts apps/workspace-svc/src/routes/__tests__/schemas.cycle.test.ts
```

---

## Task 8: Frontend error banner surfaces the cycle kind

**Files:**
- Modify: `apps/web/src/pages/dashboard/schemas/lib/mapServerError.ts`

- [ ] **Step 1: Locate the `cycle_detected` branch**

The existing branch (line 79 in the current file) reads:

```ts
if (code === 'cycle_detected') {
  const cycle = (err.detail as { cycle?: string[] } | undefined)?.cycle;
  handlers.setCycleBanner?.(
    cycle?.length
      ? `Cycle detected: ${cycle.join(' → ')}`
      : 'A reference cycle was detected.',
  );
  handlers.setStep?.(2);
  return;
}
```

- [ ] **Step 2: Replace with kind-aware messaging**

```ts
if (code === 'cycle_detected') {
  const detail = err.detail as { cycle?: string[]; kind?: 'embedding' | 'field_deadlock' } | undefined;
  const cycle = detail?.cycle;
  const path = cycle?.length ? `: ${cycle.join(' → ')}` : '';
  const message =
    detail?.kind === 'field_deadlock'
      ? `Field projections deadlock${path}`
      : detail?.kind === 'embedding'
        ? `Reference would embed an entire row${path}`
        : `A reference cycle was detected${path}`;
  handlers.setCycleBanner?.(message);
  handlers.setStep?.(2);
  return;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mirage/web run typecheck` (or whichever script the web app exposes).
Expected: no errors.

- [ ] **Step 4: Stage and pause**

```bash
git add apps/web/src/pages/dashboard/schemas/lib/mapServerError.ts
```

---

## Task 9: End-to-end verification

**Files:**
- (Optional) Modify: `apps/e2e/src/run-pipeline.test.ts`

- [ ] **Step 1: Add an e2e scenario (only if e2e infra is currently running locally)**

Inspect `apps/e2e/src/run-pipeline.test.ts` for the existing harness. Add a `describe.skipIf(!process.env.E2E)` block that:

1. Creates two schemas — `phone` (`id: string.uuid`, `person_id: $ref:person.id`) and `person` (`id: string.uuid`, `phone_id: $ref:phone.id`) — via the workspace-svc HTTP API. Asserts both saves return `201`.
2. Creates a Set including both with count 5.
3. Triggers a run and reads the resulting NDJSON.
4. Builds an id set per schema and asserts every `person_id` in phone rows exists in the person id set, and vice versa.

- [ ] **Step 2: Run the e2e scenario**

Run: `E2E=1 pnpm --filter @mirage/e2e run test -- run-pipeline`
Expected: PASS.

- [ ] **Step 3: Manually verify via the web UI (golden path)**

```bash
pnpm dev
```

Then in the browser:
1. Create schema `phone` with `id: uuid` and `person_id: $ref:person.id`. (Will require creating `person` first with `id: uuid` and no refs, then editing it after `phone` exists. The save-side fix is what unblocks this loop.)
2. Edit `person` to add `phone_id: $ref:phone.id`. Save — should succeed.
3. Open a Set including both, run it. Verify the result rows contain cross-pointing UUIDs.

If the dev UI doesn't surface the run output, hit the bff endpoint directly with `curl`.

- [ ] **Step 4: Stage and pause**

```bash
git add apps/e2e/src/run-pipeline.test.ts
```

---

## Task 10: Final regression sweep

- [ ] **Step 1: Run all engine tests**

Run: `pnpm --filter @mirage/engine test`
Expected: green.

- [ ] **Step 2: Run all workspace-svc tests**

Run: `pnpm --filter @mirage/workspace-svc test`
Expected: green.

- [ ] **Step 3: Run typecheck across the repo**

Run: `pnpm typecheck`
Expected: green.

- [ ] **Step 4: Run lint across the repo**

Run: `pnpm lint`
Expected: green.

- [ ] **Step 5: Hand the staged changes back to the user**

Summarise the change in one paragraph (which schemas can now save that previously couldn't, what error messages users will now see for B/D, and what the seed pass cost is for soft cycles). Wait for the user to commit and push.

---

## Self-review checklist

- **Spec coverage:** Tasks 1–4 cover the classifier and engine-side detection (spec §"Edge classification rules", §"Cycle detection", §"Save-time enforcement", §"Run-time enforcement"). Task 5 covers the seed pass (spec §"Run-time enforcement"). Tasks 7–8 cover save-time + UI error surface (spec §"Save-time enforcement", §"Errors"). Tasks 9–10 cover the test plan (spec §"Test plan").
- **Placeholders:** none — every code block is complete and ready to paste.
- **Type consistency:** `SetEdge.hard`, `SetEdge.cycleKind`, `CyclePath.kind`, `RunSetPlan.softCycleSeedFields`, and `EdgeClass.kind` use the same `'embedding' | 'field_deadlock'` enum throughout. `assertNoHardCycle` returns a plain `Error` decorated with `code: 'cycle_detected'` and `detail.kind` — matching the existing `ValidationError`-style payload.
- **Self-ref handling:** No special-case path. Self-refs flow through `classifyRefEdge` like any other ref, so `parent_id = $ref:phone.id` (soft) saves and runs, while `$ref:phone` (hard:embedding) and field-level self-deadlocks reject.
- **Determinism for seed pass:** Re-using `materialiseSchema` means the cached rows ARE the rows yielded in the main pass — no double generation. The main loop's row source switches to the cache when the schema is seeded, preserving determinism end-to-end.
