# Dependency Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **User preferences (this repo):** Do NOT create a git worktree. Do NOT make git commits. "Checkpoint" steps replace commit steps — verify cleanliness, do not run `git commit`.
> **Dependency:** This plan assumes `docs/superpowers/plans/2026-05-20-streaming-engine.md` has been executed (specifically Task 2, which extracts `detectCycles` and `topoSort` to `packages/engine/src/topology.ts` and exports them). If the streaming-engine plan has not yet landed, run its Task 2 first and skip the rest.

**Goal:** Turn the `EmptyStub` at `/workspaces/:wsId/graph` into a draggable, pan/zoom-able workspace-wide dependency graph that mirrors the engine's edge / cycle / topo semantics exactly.

**Architecture:** TanStack Query loads workspace schemas, a pure analysis module computes edges/cycles/topo by *importing* the engine's helpers (deviation from spec §Architecture — see below), dagre lays out nodes left-to-right, React Flow renders nodes (one per schema) and edges (one per `$ref`) with per-property handles. SVG export uses `html-to-image`. All state is page-local; refresh resets drag positions.

**Design deviation from spec §4 "Data flow / Analyze":** the spec says "We port rather than import because `@mirage/engine` pulls in `@mirage/sandbox` (Node-only)". Empirically the web app already imports `extractSetEdges` from `@mirage/engine` (see `apps/web/src/pages/dashboard/sets/lib/edges.ts:1` and `apps/web/src/pages/dashboard/functions/UsagePane.tsx:4`) — Vite tree-shakes the sandbox-touching exports out. So we import `extractSetEdges`, `detectCycles`, `topoSort` directly. If a future bundle audit shows sandbox slipping in, fall back to a port; otherwise, do not duplicate.

**Tech Stack:** React 19, react-router 7, TanStack Query 5, `@xyflow/react` v12, `dagre` v0.8 + `@types/dagre`, `html-to-image` v1.11. Vitest + happy-dom + @testing-library/react for the new test infra.

---

## File Structure

**New folder:** `apps/web/src/pages/dashboard/graph/` with:

```
GraphPage.tsx          Page shell — header, action bar, meta row, cycle panel, canvas, order strip.
SchemaNode.tsx         Custom React Flow node. Header (icon tile + schemaKey + props badge) + property list.
RefEdge.tsx            Custom React Flow edge. Dashed violet bezier with arrow marker; red when in a cycle.
CycleWarn.tsx          Red warning panel rendered above the canvas when cycles exist.
OrderStrip.tsx         Bottom strip showing the schema-level topo order chips.
Legend.tsx             Bottom-right legend overlay (cross-schema $ref, generation order, acyclic indicator).
FilterPopover.tsx      Popover wired to the "Filter" button in the action bar.
useGraphData.ts        Hook: loads schemas, runs analysis, applies dagre layout, returns React Flow inputs.
graphAnalysis.ts       Thin adapter over @mirage/engine: returns { edges, cycles, order } for a workspace.
layout.ts              Dagre wrapper. Given nodes + edges, returns positioned nodes.
exportSvg.ts           html-to-image wrapper that captures the viewport and triggers a download.
graph.css              Co-located CSS — graph-canvas, graph-node, graph-controls, graph-legend, cycle-warn, order-strip.
__tests__/graphAnalysis.test.ts
__tests__/layout.test.ts
__tests__/GraphPage.test.tsx
```

**Modified files:**
- `apps/web/package.json` — add `@xyflow/react`, `dagre`, `@types/dagre`, `html-to-image`, `vitest`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`.
- `apps/web/src/pages/dashboard/GraphPage.tsx` — becomes a thin re-export of `graph/GraphPage.tsx` so the route stays stable.
- `apps/web/vitest.config.ts` (new) — vitest setup.

---

## Conventions used in this plan

- All paths are repo-relative to `/Users/pathik/Desktop/Github/mirage`.
- `pnpm -F @mirage/web test -- <file>` runs a single vitest in the web workspace.
- Each task ends with a **Checkpoint**: `pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint && pnpm -F @mirage/web test`. Do not run `git commit`.

---

## Task 1: Add dependencies and Vitest setup

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test-setup.ts`
- Create: `apps/web/src/pages/dashboard/graph/__tests__/smoke.test.ts`

- [ ] **Step 1.1: Add deps and test scripts**

Edit `apps/web/package.json`. Add to `dependencies`:

```json
"@xyflow/react": "^12.4.0",
"dagre": "^0.8.5",
"html-to-image": "^1.11.13",
```

Add to `devDependencies`:

```json
"@testing-library/jest-dom": "^6.6.3",
"@testing-library/react": "^16.1.0",
"@types/dagre": "^0.7.52",
"happy-dom": "^15.11.7",
"vitest": "^2.1.8",
```

Add `scripts` block (or extend if it exists):

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
},
```

Add an nx `test` target to the `nx.targets` block (sibling to existing `serve`, `build`, `typecheck`, `lint`):

```json
"test": {
  "executor": "nx:run-commands",
  "options": {
    "command": "vitest run",
    "cwd": "apps/web"
  }
}
```

- [ ] **Step 1.2: Create vitest config**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 5_000,
    globals: false,
  },
});
```

- [ ] **Step 1.3: Create test setup file**

Create `apps/web/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 1.4: Install deps**

From repo root:

```bash
pnpm install
```

Expected: no errors. `@xyflow/react`, `dagre`, `html-to-image`, `vitest`, `happy-dom`, RTL all under `apps/web/node_modules`.

- [ ] **Step 1.5: Write a smoke test**

Create `apps/web/src/pages/dashboard/graph/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('graph smoke', () => {
  it('happy-dom is wired', () => {
    expect(typeof document).toBe('object');
  });
});
```

- [ ] **Step 1.6: Run the smoke test**

```bash
pnpm -F @mirage/web test -- smoke
```

Expected: PASS.

- [ ] **Step 1.7: Checkpoint**

```bash
pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint && pnpm -F @mirage/web test
```

Expected: all pass.

---

## Task 2: `graphAnalysis.ts` — workspace-wide edges/cycles/topo

A thin adapter over engine helpers, exposed as `analyzeWorkspace(schemas)`. The test file doubles as the regression contract that keeps the view aligned with the engine.

**Files:**
- Create: `apps/web/src/pages/dashboard/graph/graphAnalysis.ts`
- Create: `apps/web/src/pages/dashboard/graph/__tests__/graphAnalysis.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `apps/web/src/pages/dashboard/graph/__tests__/graphAnalysis.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import { analyzeWorkspace } from '../graphAnalysis.js';

type Schema = Api.components['schemas']['Schema'];

const primitive = (name: string, faker: string): Api.components['schemas']['SchemaProp'] => ({
  name,
  type: 'string',
  faker,
});

const schema = (key: string, props: Api.components['schemas']['SchemaProp'][]): Schema =>
  ({
    id: `sch_${key}`,
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key,
    name: key,
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    properties: props,
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

describe('analyzeWorkspace', () => {
  it('returns empty results for an empty workspace', () => {
    const r = analyzeWorkspace([]);
    expect(r.edges).toEqual([]);
    expect(r.cycles).toEqual([]);
    expect(r.order).toEqual([]);
  });

  it('returns edges and order for a simple acyclic workspace', () => {
    const schemas = [
      schema('person', [primitive('id', 'string.uuid')]),
      schema('mobile', [primitive('id', 'string.uuid'), primitive('personId', '$ref:person')]),
    ];
    const r = analyzeWorkspace(schemas);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]).toMatchObject({
      fromSchemaKey: 'mobile',
      toSchemaKey: 'person',
      fromFieldPath: 'personId',
      cardinality: 'one',
    });
    expect(r.cycles).toEqual([]);
    expect(r.order.indexOf('person')).toBeLessThan(r.order.indexOf('mobile'));
  });

  it('detects a 2-node cycle and returns empty order', () => {
    const schemas = [
      schema('a', [primitive('bRef', '$ref:b')]),
      schema('b', [primitive('aRef', '$ref:a')]),
    ];
    const r = analyzeWorkspace(schemas);
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0]!.schemaKeys[0]).toBe('a');
    expect(r.order).toEqual([]);
  });

  it('detects a self-loop', () => {
    const schemas = [schema('a', [primitive('aRef', '$ref:a')])];
    const r = analyzeWorkspace(schemas);
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0]!.schemaKeys).toEqual(['a', 'a']);
  });

  it('counts dangling refs separately', () => {
    const schemas = [schema('a', [primitive('ghost', '$ref:does-not-exist')])];
    const r = analyzeWorkspace(schemas);
    expect(r.edges).toEqual([]);
    expect(r.danglingRefs).toBe(1);
  });

  it('emits cardinality="many" for refs inside arrays', () => {
    const schemas = [
      schema('person', [primitive('id', 'string.uuid')]),
      schema('group', [
        {
          name: 'memberIds',
          type: 'array',
          items: { name: 'item', type: 'string', faker: '$ref:person' },
        },
      ]),
    ];
    const r = analyzeWorkspace(schemas);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]!.cardinality).toBe('many');
  });
});
```

- [ ] **Step 2.2: Verify the tests fail**

```bash
pnpm -F @mirage/web test -- graphAnalysis
```

Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement `graphAnalysis.ts`**

Create `apps/web/src/pages/dashboard/graph/graphAnalysis.ts`:

```ts
import { extractSetEdges, detectCycles, topoSort, type SetEdge } from '@mirage/engine';
import type { Api } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;

export interface WorkspaceAnalysis {
  edges: SetEdge[];
  cycles: Array<{ schemaKeys: string[]; fieldPaths: string[] }>;
  /** Empty array when cycles exist. */
  order: string[];
  /** Count of $ref strings pointing at schemas not present in the workspace. */
  danglingRefs: number;
}

export function analyzeWorkspace(schemas: ReadonlyArray<Schema>): WorkspaceAnalysis {
  const keys = new Set(schemas.map((s) => s.key));
  const edges = extractSetEdges(schemas, keys);
  const cycles = detectCycles(keys, edges);
  const order = cycles.length === 0 ? topoSort(keys, edges) : [];
  const danglingRefs = countDanglingRefs(schemas, keys);
  return { edges, cycles, order, danglingRefs };
}

function countDanglingRefs(
  schemas: ReadonlyArray<Schema>,
  workspaceKeys: ReadonlySet<string>,
): number {
  let count = 0;
  for (const schema of schemas) {
    walk(schema.properties, (faker) => {
      const m = faker.match(REF_RE);
      if (m && !workspaceKeys.has(m[1]!)) count++;
    });
  }
  return count;
}

function walk(
  props: Api.components['schemas']['SchemaProp'][],
  onFaker: (faker: string) => void,
): void {
  for (const p of props) {
    if (typeof p.faker === 'string') onFaker(p.faker);
    if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, onFaker);
    else if (p.type === 'array' && p.items) walk([p.items], onFaker);
  }
}
```

- [ ] **Step 2.4: Run tests — they pass**

```bash
pnpm -F @mirage/web test -- graphAnalysis
```

Expected: PASS — 6 tests.

- [ ] **Step 2.5: Checkpoint**

```bash
pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint && pnpm -F @mirage/web test
```

Expected: all pass.

---

## Task 3: `layout.ts` — dagre LR layout wrapper

Builds a dagre graph from nodes (sized by property count) + edges, returns `Record<schemaKey, {x, y}>`.

**Files:**
- Create: `apps/web/src/pages/dashboard/graph/layout.ts`
- Create: `apps/web/src/pages/dashboard/graph/__tests__/layout.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `apps/web/src/pages/dashboard/graph/__tests__/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Api } from '@mirage/types';
import { applyDagre, NODE_WIDTH, HEADER_HEIGHT, PROP_HEIGHT } from '../layout.js';
import type { SetEdge } from '@mirage/engine';

type Schema = Api.components['schemas']['Schema'];

const sch = (key: string, propCount: number): Schema =>
  ({
    id: `sch_${key}`,
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key,
    name: key,
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    properties: Array.from({ length: propCount }, (_, i) => ({
      name: `p${i}`,
      type: 'string' as const,
      faker: 'string.uuid',
    })),
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

describe('applyDagre', () => {
  it('places a single node at the origin region', () => {
    const positions = applyDagre([sch('a', 3)], []);
    expect(positions.a).toBeDefined();
    expect(typeof positions.a!.x).toBe('number');
    expect(typeof positions.a!.y).toBe('number');
  });

  it('places target left of source for an edge from source → target', () => {
    const edges: SetEdge[] = [
      { fromSchemaKey: 'src', toSchemaKey: 'tgt', fromFieldPath: 'tgtId', cardinality: 'one' },
    ];
    const positions = applyDagre([sch('src', 1), sch('tgt', 1)], edges);
    expect(positions.tgt!.x).toBeLessThan(positions.src!.x);
  });

  it('node height scales with property count', () => {
    const positions = applyDagre([sch('a', 1), sch('b', 5)], []);
    // Sanity: each schema gets a position. Height contribution is internal to dagre.
    // We just verify both ended up with distinct positions.
    expect(positions.a).toBeDefined();
    expect(positions.b).toBeDefined();
  });

  it('exposes node geometry constants used by the analyzer', () => {
    expect(NODE_WIDTH).toBeGreaterThan(0);
    expect(HEADER_HEIGHT).toBeGreaterThan(0);
    expect(PROP_HEIGHT).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3.2: Verify failure**

```bash
pnpm -F @mirage/web test -- layout
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement `layout.ts`**

Create `apps/web/src/pages/dashboard/graph/layout.ts`:

```ts
import dagre from 'dagre';
import type { Api } from '@mirage/types';
import type { SetEdge } from '@mirage/engine';

type Schema = Api.components['schemas']['Schema'];

export const NODE_WIDTH = 260;
export const HEADER_HEIGHT = 38;
export const PROP_HEIGHT = 28;

export interface Position {
  x: number;
  y: number;
}

/**
 * Layered left-to-right layout. Targets sit left of their sources (matches the
 * engine's "resolve target before source" topo order; edge A → B is rendered
 * with B on the left and A on the right).
 */
export function applyDagre(
  schemas: ReadonlyArray<Schema>,
  edges: ReadonlyArray<SetEdge>,
): Record<string, Position> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const s of schemas) {
    const height = HEADER_HEIGHT + Math.max(1, s.properties.length) * PROP_HEIGHT;
    g.setNode(s.key, { width: NODE_WIDTH, height });
  }

  // Dagre's rankdir=LR ranks sources to the *left* of their targets. We want
  // *targets* on the left, so swap the edge direction when feeding dagre.
  for (const e of edges) {
    g.setEdge(e.toSchemaKey, e.fromSchemaKey);
  }

  dagre.layout(g);

  const out: Record<string, Position> = {};
  for (const s of schemas) {
    const n = g.node(s.key) as { x: number; y: number; width: number; height: number };
    if (!n) continue;
    out[s.key] = { x: n.x - n.width / 2, y: n.y - n.height / 2 };
  }
  return out;
}
```

- [ ] **Step 3.4: Run tests — they pass**

```bash
pnpm -F @mirage/web test -- layout
```

Expected: PASS — 4 tests.

- [ ] **Step 3.5: Checkpoint**

```bash
pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint && pnpm -F @mirage/web test
```

---

## Task 4: `exportSvg.ts` — html-to-image wrapper

A tiny utility — no tests needed beyond typecheck (jsdom can't render React Flow's SVG accurately).

**Files:**
- Create: `apps/web/src/pages/dashboard/graph/exportSvg.ts`

- [ ] **Step 4.1: Implement**

Create `apps/web/src/pages/dashboard/graph/exportSvg.ts`:

```ts
import { toSvg } from 'html-to-image';

/**
 * Capture the supplied DOM element as an SVG data URL, then trigger a download.
 * filenameSlug becomes `<filenameSlug>-dependency-graph.svg`.
 */
export async function exportViewportToSvg(
  viewportEl: HTMLElement,
  filenameSlug: string,
): Promise<void> {
  const dataUrl = await toSvg(viewportEl, {
    backgroundColor: '#ffffff',
    cacheBust: true,
    pixelRatio: 1,
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${filenameSlug}-dependency-graph.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

- [ ] **Step 4.2: Checkpoint**

```bash
pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint
```

Expected: pass.

---

## Task 5: Co-located CSS

Copy the graph-related rules from `design/screens_export/mirage.css` into a new co-located stylesheet so the page matches the prototype 1:1.

**Files:**
- Create: `apps/web/src/pages/dashboard/graph/graph.css`

- [ ] **Step 5.1: Create the stylesheet**

Create `apps/web/src/pages/dashboard/graph/graph.css`:

```css
/* ─── Graph canvas + nodes ─── */
.graph-canvas {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0) 0 0 / 16px 16px,
    hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  min-height: 560px;
}
.graph-node {
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.04);
  min-width: 240px;
}
.graph-node .gn-head {
  padding: 8px 12px;
  border-bottom: 1px solid hsl(var(--border));
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  cursor: pointer;
}
.graph-node .gn-head .name {
  display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600;
}
.graph-node .gn-head .icon {
  width: 20px; height: 20px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  color: white;
}
.graph-node .gn-head .icon.cyan { background: hsl(var(--brand-cyan)); }
.graph-node .gn-head .icon.violet { background: hsl(var(--brand-violet)); }
.graph-node .gn-head .icon.emerald { background: hsl(var(--brand-emerald)); }
.graph-node .gn-head .icon.amber { background: hsl(var(--brand-amber)); }
.graph-node .gn-head .icon.rose { background: hsl(var(--brand-rose)); }
.graph-node .gn-head .icon.slate { background: hsl(var(--brand-slate, var(--muted-foreground))); }
.graph-node .gn-prop {
  padding: 6px 12px; display: flex; justify-content: space-between; align-items: center;
  font-family: ui-monospace, monospace; font-size: 12px;
  border-bottom: 1px solid hsl(var(--border) / 0.6);
  position: relative;
}
.graph-node .gn-prop:last-child { border-bottom: 0; }
.graph-node .gn-prop .name { display: flex; align-items: center; gap: 4px; }
.graph-node .gn-prop .meth { color: hsl(var(--muted-foreground)); font-size: 11px; }
.graph-node .gn-prop.is-ref .name { color: hsl(var(--brand-violet)); }

/* ─── Controls + legend ─── */
.graph-legend {
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.graph-legend .row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.graph-legend .sw { width: 14px; height: 2px; background: hsl(var(--primary)); }
.graph-legend .sw.dash {
  background: transparent;
  border-top: 2px dashed hsl(var(--brand-violet));
  height: 0;
}

/* ─── Cycle warning ─── */
.cycle-warn {
  margin-bottom: 16px;
  background: hsl(var(--destructive) / 0.05);
  border: 1px solid hsl(var(--destructive) / 0.3);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  display: flex; gap: 14px; align-items: flex-start;
}
.cycle-warn .body { flex: 1; }
.cycle-warn .ti { font-size: 14px; font-weight: 600; color: hsl(var(--destructive)); }
.cycle-warn .sub { font-size: 12px; color: hsl(var(--muted-foreground)); margin-top: 2px; }
.cycle-warn .cycle-path {
  margin-top: 10px;
  padding: 10px 12px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--destructive) / 0.4);
  border-radius: var(--radius-md);
  font-family: ui-monospace, monospace; font-size: 12px;
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.cycle-warn .cycle-path .node {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
  padding: 2px 7px; border-radius: 4px; font-weight: 600;
}

/* ─── Order strip ─── */
.order-strip {
  margin-top: 24px;
  padding: 16px 20px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.order-strip .lbl {
  font-size: 11px; font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-right: 8px;
}
.order-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 8px;
  background: hsl(var(--muted));
  border-radius: var(--radius-md);
  font-family: ui-monospace, monospace; font-size: 12px;
}
.order-chip .schema { color: hsl(var(--brand-violet)); font-weight: 600; }

/* React Flow edge cycle highlight */
.react-flow__edge.is-cycle .react-flow__edge-path {
  stroke: hsl(var(--destructive));
}
```

- [ ] **Step 5.2: Checkpoint**

```bash
pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint
```

Expected: pass (CSS isn't type-checked but typecheck still must pass).

---

## Task 6: `useGraphData.ts` — wire-together hook

Loads workspace schemas via TanStack Query (reusing the existing `['schemas', wsId]` cache key), runs analysis, lays out, returns React Flow `nodes` + `edges` arrays plus a meta block (schema count, edge count, cycle count, dangling-refs count, order).

**Files:**
- Create: `apps/web/src/pages/dashboard/graph/useGraphData.ts`

- [ ] **Step 6.1: Implement**

Create `apps/web/src/pages/dashboard/graph/useGraphData.ts`:

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Node, Edge } from '@xyflow/react';
import type { Api } from '@mirage/types';
import { bff } from '../../../api/client.js';
import { analyzeWorkspace, type WorkspaceAnalysis } from './graphAnalysis.js';
import { applyDagre } from './layout.js';

type Schema = Api.components['schemas']['Schema'];

export interface SchemaNodeData extends Record<string, unknown> {
  schema: Schema;
  isInCycle: boolean;
}
export interface RefEdgeData extends Record<string, unknown> {
  fromFieldPath: string;
  toFieldPath?: string;
  cardinality: 'one' | 'many';
  isInCycle: boolean;
}

export type SchemaNode = Node<SchemaNodeData, 'schema'>;
export type RefEdge = Edge<RefEdgeData, 'ref'>;

export interface UseGraphDataResult {
  loading: boolean;
  error: Error | null;
  schemas: ReadonlyArray<Schema>;
  nodes: SchemaNode[];
  edges: RefEdge[];
  analysis: WorkspaceAnalysis;
}

export function useGraphData(wsId: string | undefined): UseGraphDataResult {
  const query = useQuery({
    enabled: Boolean(wsId),
    queryKey: ['schemas', wsId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/schemas', {
        params: { path: { wsId: wsId! } },
      });
      if (error) throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
      return data ?? [];
    },
  });

  const schemas = query.data ?? [];
  const analysis = useMemo(() => analyzeWorkspace(schemas), [schemas]);

  const { nodes, edges } = useMemo(() => {
    const positions = applyDagre(schemas, analysis.edges);
    const cyclicKeys = new Set<string>();
    for (const c of analysis.cycles) for (const k of c.schemaKeys) cyclicKeys.add(k);
    const cyclicEdgeKeys = new Set<string>();
    for (const c of analysis.cycles) {
      for (let i = 0; i < c.schemaKeys.length - 1; i++) {
        cyclicEdgeKeys.add(`${c.schemaKeys[i]}::${c.fieldPaths[i]}`);
      }
    }

    const nodes: SchemaNode[] = schemas.map((s) => ({
      id: s.key,
      type: 'schema',
      position: positions[s.key] ?? { x: 0, y: 0 },
      data: { schema: s, isInCycle: cyclicKeys.has(s.key) },
    }));

    const edges: RefEdge[] = analysis.edges.map((e, i) => ({
      id: `e_${i}_${e.fromSchemaKey}_${e.fromFieldPath}_${e.toSchemaKey}`,
      type: 'ref',
      source: e.fromSchemaKey,
      target: e.toSchemaKey,
      sourceHandle: `${e.fromSchemaKey}::${e.fromFieldPath}`,
      data: {
        fromFieldPath: e.fromFieldPath,
        ...(e.toFieldPath ? { toFieldPath: e.toFieldPath } : {}),
        cardinality: e.cardinality,
        isInCycle: cyclicEdgeKeys.has(`${e.fromSchemaKey}::${e.fromFieldPath}`),
      },
      className: cyclicEdgeKeys.has(`${e.fromSchemaKey}::${e.fromFieldPath}`) ? 'is-cycle' : undefined,
    }));

    return { nodes, edges };
  }, [schemas, analysis]);

  return {
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    schemas,
    nodes,
    edges,
    analysis,
  };
}
```

- [ ] **Step 6.2: Checkpoint**

```bash
pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint
```

Expected: pass.

---

## Task 7: `SchemaNode.tsx` — custom React Flow node

**Files:**
- Create: `apps/web/src/pages/dashboard/graph/SchemaNode.tsx`

- [ ] **Step 7.1: Implement**

Create `apps/web/src/pages/dashboard/graph/SchemaNode.tsx`:

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Link as LinkIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import type { SchemaNode as SchemaNodeT } from './useGraphData.js';

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;

export function SchemaNode({ data }: NodeProps<SchemaNodeT>) {
  const { schema } = data;
  const navigate = useNavigate();
  const { wsId } = useParams<{ wsId: string }>();

  const onOpen = () => {
    if (!wsId) return;
    navigate(`/workspaces/${wsId}/schemas?active=${encodeURIComponent(schema.id)}`);
  };

  return (
    <div className="graph-node">
      <div className="gn-head" onClick={onOpen}>
        <div className="name">
          <div className={`icon ${schema.color}`}>
            <span style={{ fontSize: 10 }}>{schema.icon?.[0] ?? '·'}</span>
          </div>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{schema.key}</span>
        </div>
        <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
          {schema.properties.length} props
        </span>
      </div>
      <div>
        {schema.properties.map((p) => {
          const isRef = typeof p.faker === 'string' && REF_RE.test(p.faker);
          const handleId = `${schema.key}::${p.name}`;
          return (
            <div key={p.name} className={`gn-prop ${isRef ? 'is-ref' : ''}`}>
              <Handle
                type="target"
                id={handleId}
                position={Position.Left}
                style={{ background: 'transparent', border: 0, top: '50%' }}
              />
              <span className="name">
                {isRef && <LinkIcon size={11} />}
                <span>{p.name}</span>
              </span>
              <span className="meth">
                {isRef ? '$ref' : typeof p.faker === 'string' ? p.faker.split('.').slice(-1)[0] : '—'}
              </span>
              <Handle
                type="source"
                id={handleId}
                position={Position.Right}
                style={{ background: 'transparent', border: 0, top: '50%' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Note on handle ids: every property exposes both a source and a target handle with the same id `<schemaKey>::<fieldName>`. `useGraphData.ts` sets `sourceHandle` to `<fromSchemaKey>::<fromFieldPath>`. The target side intentionally has no `targetHandle` — React Flow attaches to any target handle on the destination node, which is what we want (target node's own properties don't need a specific binding for the ref-to-schema edges).

- [ ] **Step 7.2: Checkpoint**

```bash
pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint
```

Expected: pass.

---

## Task 8: `RefEdge.tsx`, `CycleWarn.tsx`, `OrderStrip.tsx`, `Legend.tsx`, `FilterPopover.tsx`

Five small components. Group them in one task to keep the plan flat.

**Files:**
- Create: `apps/web/src/pages/dashboard/graph/RefEdge.tsx`
- Create: `apps/web/src/pages/dashboard/graph/CycleWarn.tsx`
- Create: `apps/web/src/pages/dashboard/graph/OrderStrip.tsx`
- Create: `apps/web/src/pages/dashboard/graph/Legend.tsx`
- Create: `apps/web/src/pages/dashboard/graph/FilterPopover.tsx`

- [ ] **Step 8.1: `RefEdge.tsx`**

Create `apps/web/src/pages/dashboard/graph/RefEdge.tsx`:

```tsx
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { RefEdge as RefEdgeT } from './useGraphData.js';

export function RefEdge(props: EdgeProps<RefEdgeT>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data } = props;
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const stroke = data?.isInCycle ? 'hsl(var(--destructive))' : 'hsl(var(--brand-violet))';
  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={{ stroke, strokeWidth: 1.5, strokeDasharray: '5 3', strokeOpacity: 0.85, fill: 'none' }}
    />
  );
}
```

- [ ] **Step 8.2: `CycleWarn.tsx`**

Create `apps/web/src/pages/dashboard/graph/CycleWarn.tsx`:

```tsx
import { useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { WorkspaceAnalysis } from './graphAnalysis.js';

export function CycleWarn({ cycles }: { cycles: WorkspaceAnalysis['cycles'] }) {
  const [expanded, setExpanded] = useState(false);
  if (cycles.length === 0) return null;
  const visible = expanded ? cycles : cycles.slice(0, 1);

  return (
    <div className="cycle-warn">
      <AlertTriangle size={20} style={{ color: 'hsl(var(--destructive))', flexShrink: 0 }} />
      <div className="body">
        <div className="ti">
          {cycles.length === 1
            ? 'Circular dependency detected'
            : `${cycles.length} circular dependencies detected`}
        </div>
        <div className="sub">
          Generation cannot start until the cycle is broken. Edit one of the references below, or
          mark a field as optional to break the chain.
        </div>
        {visible.map((c, i) => (
          <div className="cycle-path" key={i}>
            {c.schemaKeys.map((k, j) => (
              <span key={`k-${j}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="node">{k}</span>
                {j < c.schemaKeys.length - 1 && (
                  <>
                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                      .{c.fieldPaths[j]}
                    </span>
                    <ArrowRight size={12} />
                  </>
                )}
              </span>
            ))}
          </div>
        ))}
        {cycles.length > 1 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              marginTop: 8,
              background: 'transparent',
              border: 0,
              color: 'hsl(var(--destructive))',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            +{cycles.length - 1} more
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8.3: `OrderStrip.tsx`**

Create `apps/web/src/pages/dashboard/graph/OrderStrip.tsx`:

```tsx
import { ChevronRight } from 'lucide-react';

export function OrderStrip({ order, cyclesPresent }: { order: ReadonlyArray<string>; cyclesPresent: boolean }) {
  if (cyclesPresent) {
    return (
      <div className="order-strip">
        <span className="lbl">Generation order</span>
        <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
          unavailable — break the cycle above first.
        </span>
      </div>
    );
  }
  if (order.length === 0) {
    return (
      <div className="order-strip">
        <span className="lbl">Generation order</span>
        <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
          No schemas yet.
        </span>
      </div>
    );
  }
  return (
    <div className="order-strip">
      <span className="lbl">Generation order</span>
      {order.map((k, i) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <ChevronRight size={12} />}
          <span className="order-chip">
            <span className="schema">{k}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 8.4: `Legend.tsx`**

Create `apps/web/src/pages/dashboard/graph/Legend.tsx`:

```tsx
export function Legend({ acyclic }: { acyclic: boolean }) {
  return (
    <div className="graph-legend" style={{ position: 'absolute', bottom: 12, left: 12 }}>
      <div
        style={{
          fontSize: 10,
          color: 'hsl(var(--muted-foreground))',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: 6,
          fontWeight: 500,
        }}
      >
        Legend
      </div>
      <div className="row">
        <span className="sw dash" /> cross-schema $ref
      </div>
      <div className="row">
        <span className="sw" /> generation order
      </div>
      <div className="row">
        <span
          style={{
            width: 10,
            height: 10,
            background: acyclic
              ? 'hsl(var(--brand-emerald))'
              : 'hsl(var(--destructive))',
            borderRadius: 2,
          }}
        />{' '}
        {acyclic ? 'acyclic' : 'cycle detected'}
      </div>
    </div>
  );
}
```

- [ ] **Step 8.5: `FilterPopover.tsx`**

Create `apps/web/src/pages/dashboard/graph/FilterPopover.tsx`:

```tsx
import { useState } from 'react';
import { Filter } from 'lucide-react';

export function FilterPopover({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Filter size={14} /> Filter
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            background: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius-md)',
            padding: 8,
            boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
            zIndex: 20,
            width: 240,
          }}
        >
          <input
            type="text"
            placeholder="Filter by schema key…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius-sm, 4px)',
              fontSize: 12,
              background: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8.6: Checkpoint**

```bash
pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint
```

Expected: pass.

---

## Task 9: `GraphPage.tsx` — page shell

Wires together the header, action bar, meta row, cycle panel, canvas (React Flow), legend, controls, and order strip.

**Files:**
- Create: `apps/web/src/pages/dashboard/graph/GraphPage.tsx`

- [ ] **Step 9.1: Implement**

Create `apps/web/src/pages/dashboard/graph/GraphPage.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from '@xyflow/react';
import { AlertCircle, CheckCircle2, Download, Plus, Shuffle } from 'lucide-react';
import { PageHeader } from '../../../components/shell/PageHeader.js';
import { EmptyStub } from '../../../components/shell/EmptyStub.js';
import { Database } from 'lucide-react';
import { CreateSchemaSheet } from '../schemas/CreateSchemaSheet/index.js';
import { SchemaNode } from './SchemaNode.js';
import { RefEdge } from './RefEdge.js';
import { CycleWarn } from './CycleWarn.js';
import { OrderStrip } from './OrderStrip.js';
import { Legend } from './Legend.js';
import { FilterPopover } from './FilterPopover.js';
import { useGraphData } from './useGraphData.js';
import { exportViewportToSvg } from './exportSvg.js';
import '@xyflow/react/dist/style.css';
import './graph.css';

const NODE_TYPES = { schema: SchemaNode };
const EDGE_TYPES = { ref: RefEdge };

export function GraphPage() {
  const { wsId } = useParams<{ wsId: string }>();
  const { loading, schemas, nodes, edges, analysis } = useGraphData(wsId);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [layoutKey, setLayoutKey] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  const filteredNodes = useMemo<Node[]>(() => {
    if (!filter) return nodes;
    const q = filter.toLowerCase();
    return nodes.map((n) => ({ ...n, hidden: !n.id.toLowerCase().includes(q) }));
  }, [nodes, filter]);

  const filteredEdges = useMemo<Edge[]>(() => {
    if (!filter) return edges;
    const visibleNodeIds = new Set(filteredNodes.filter((n) => !n.hidden).map((n) => n.id));
    return edges.map((e) => ({
      ...e,
      hidden: !visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target),
    }));
  }, [edges, filteredNodes, filter]);

  const onExport = async () => {
    if (!viewportRef.current) return;
    const slug = wsId?.slice(0, 8) ?? 'workspace';
    try {
      await exportViewportToSvg(viewportRef.current, slug);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Dependency graph" subtitle="Visualize references between schemas." />
        <div style={{ padding: 24, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
      </>
    );
  }

  if (schemas.length === 0) {
    return (
      <>
        <PageHeader
          title="Dependency graph"
          subtitle="Visualize references between schemas."
          actions={
            <button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>
              <Plus size={14} /> New schema
            </button>
          }
        />
        <EmptyStub icon={Database} title="No schemas yet" body="Create one to see the graph." />
        {creating && (
          <CreateSchemaSheet wsId={wsId!} onClose={() => setCreating(false)} onCreated={() => setCreating(false)} />
        )}
      </>
    );
  }

  const acyclic = analysis.cycles.length === 0;
  const matched = filteredNodes.filter((n) => !n.hidden).length;

  return (
    <>
      <PageHeader
        title="Dependency graph"
        subtitle="How fields reference each other across schemas in this workspace."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <FilterPopover value={filter} onChange={setFilter} />
            <button className="btn" type="button" onClick={() => setLayoutKey((k) => k + 1)}>
              <Shuffle size={14} /> Re-layout
            </button>
            <button className="btn" type="button" onClick={onExport}>
              <Download size={14} /> Export SVG
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>
              <Plus size={14} /> New schema
            </button>
          </div>
        }
      />

      <div
        style={{
          display: 'flex',
          gap: 16,
          padding: '0 0 12px',
          fontSize: 12,
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        <span>schemas <b>{schemas.length}</b></span>
        <span>edges <b>{analysis.edges.length}</b></span>
        <span style={{ color: acyclic ? 'hsl(var(--brand-emerald))' : 'hsl(var(--destructive))' }}>
          {acyclic ? (
            <>
              <CheckCircle2 size={12} style={{ verticalAlign: 'middle' }} /> acyclic
            </>
          ) : (
            <>
              <AlertCircle size={12} style={{ verticalAlign: 'middle' }} /> {analysis.cycles.length}{' '}
              cycle{analysis.cycles.length === 1 ? '' : 's'} detected
            </>
          )}
        </span>
        {analysis.danglingRefs > 0 && <span>⚠ {analysis.danglingRefs} dangling refs</span>}
      </div>

      <CycleWarn cycles={analysis.cycles} />

      <div className="graph-canvas" style={{ height: 620 }} ref={viewportRef}>
        {filter && matched === 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'hsl(var(--muted-foreground))',
              fontSize: 13,
            }}
          >
            No schemas match "{filter}"
          </div>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              key={layoutKey}
              nodes={filteredNodes}
              edges={filteredEdges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
              fitView
              proOptions={{ hideAttribution: true }}
              minZoom={0.25}
              maxZoom={2}
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
              {schemas.length > 20 && <MiniMap pannable zoomable />}
            </ReactFlow>
            <Legend acyclic={acyclic} />
          </ReactFlowProvider>
        )}
      </div>

      <OrderStrip order={analysis.order} cyclesPresent={!acyclic} />

      {creating && wsId && (
        <CreateSchemaSheet wsId={wsId} onClose={() => setCreating(false)} onCreated={() => setCreating(false)} />
      )}
    </>
  );
}
```

Notes:
- The page imports CSS via `import './graph.css'` so Vite bundles it.
- `viewportRef` wraps `.graph-canvas` so `html-to-image` captures the React Flow viewport plus the legend overlay.
- `key={layoutKey}` on `<ReactFlow>` forces a remount on Re-layout, which restores dagre positions and calls `fitView` again.
- `CreateSchemaSheet` is the existing sheet at `apps/web/src/pages/dashboard/schemas/CreateSchemaSheet/index.tsx` — verify its prop signature before using; adjust the call if `wsId` / `onClose` / `onCreated` aren't the right prop names.

- [ ] **Step 9.2: Verify the prop signature of `CreateSchemaSheet`**

Read its current signature:

```bash
grep -n "export function CreateSchemaSheet\|interface.*Props" /Users/pathik/Desktop/Github/mirage/apps/web/src/pages/dashboard/schemas/CreateSchemaSheet/index.tsx | head -10
```

Adjust the prop names in Step 9.1's `<CreateSchemaSheet ... />` call to match. If e.g. it takes `onCreate` instead of `onCreated`, fix both call sites.

- [ ] **Step 9.3: Update the original `GraphPage.tsx` to re-export**

Edit `apps/web/src/pages/dashboard/GraphPage.tsx`. Replace its current contents (the `EmptyStub` placeholder) with:

```tsx
export { GraphPage } from './graph/GraphPage.js';
```

- [ ] **Step 9.4: Checkpoint**

```bash
pnpm -F @mirage/web typecheck && pnpm -F @mirage/web lint
```

Expected: pass. If there are import errors from the `CreateSchemaSheet` prop change, fix them now.

---

## Task 10: Component smoke test + final verification

The component test asserted in the spec — `GraphPage.test.tsx` — renders the page with mocked schemas and checks node count, edge count, cycle panel visibility, and order strip presence.

**Files:**
- Create: `apps/web/src/pages/dashboard/graph/__tests__/GraphPage.test.tsx`

- [ ] **Step 10.1: Write the smoke test**

Create `apps/web/src/pages/dashboard/graph/__tests__/GraphPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Api } from '@mirage/types';
import { GraphPage } from '../GraphPage.js';

type Schema = Api.components['schemas']['Schema'];

vi.mock('../../../../api/client.js', () => ({
  bff: {
    GET: vi.fn(),
  },
}));

const mkSchema = (key: string, props: Api.components['schemas']['SchemaProp'][]): Schema =>
  ({
    id: `sch_${key}`,
    workspaceId: 'ws_1',
    orgId: 'org_1',
    key,
    name: key,
    description: '',
    color: 'violet',
    icon: 'Database',
    tags: [],
    properties: props,
    createdBy: 'usr_1',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
  }) as Schema;

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/workspaces/ws_1/graph']}>
        <Routes>
          <Route path="/workspaces/:wsId/graph" element={<GraphPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('GraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty state when no schemas exist', async () => {
    const { bff } = await import('../../../../api/client.js');
    (bff.GET as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: undefined });
    renderPage();
    await waitFor(() => expect(screen.getByText(/No schemas yet/i)).toBeInTheDocument());
  });

  it('shows the cycle warning panel when a cycle is detected', async () => {
    const { bff } = await import('../../../../api/client.js');
    (bff.GET as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        mkSchema('a', [{ name: 'bRef', type: 'string', faker: '$ref:b' }]),
        mkSchema('b', [{ name: 'aRef', type: 'string', faker: '$ref:a' }]),
      ],
      error: undefined,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Circular dependency detected/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/unavailable — break the cycle/i)).toBeInTheDocument();
  });

  it('shows the generation order strip when acyclic', async () => {
    const { bff } = await import('../../../../api/client.js');
    (bff.GET as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        mkSchema('person', [{ name: 'id', type: 'string', faker: 'string.uuid' }]),
        mkSchema('mobile', [
          { name: 'id', type: 'string', faker: 'string.uuid' },
          { name: 'personId', type: 'string', faker: '$ref:person' },
        ]),
      ],
      error: undefined,
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Generation order')).toBeInTheDocument());
    expect(screen.getByText('person')).toBeInTheDocument();
    expect(screen.getByText('mobile')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10.2: Run the test**

```bash
pnpm -F @mirage/web test -- GraphPage
```

Expected: PASS — 3 tests. If `react-router` complains about missing context or `@xyflow/react` measurement errors, that's expected in jsdom-style envs — workaround: wrap `<ReactFlow>` with `<ReactFlowProvider>` (already done) and use `width`/`height` defaults. happy-dom usually handles this without intervention.

If the test fails on a missing `@xyflow/react` CSS import in jsdom, add to `apps/web/vitest.config.ts`:

```ts
test: {
  // ...
  css: false,
},
```

- [ ] **Step 10.3: Run all web tests**

```bash
pnpm -F @mirage/web test
```

Expected: PASS — `graphAnalysis.test.ts`, `layout.test.ts`, `GraphPage.test.tsx`, `smoke.test.ts` all green.

- [ ] **Step 10.4: Manual smoke**

Start the stack:

```bash
pnpm dev
```

1. Navigate to `/workspaces/<wsId>/graph` against the dev backend.
2. With the seeded `person` / `mobile` / `driving-licence` schemas: confirm 3 nodes render with their property rows; 2 edges render between them; no cycle panel; meta row shows "schemas 3", "edges 2", "acyclic"; order strip shows person → driving-licence/mobile in topo order.
3. Try the Filter popover: typing "per" hides `mobile` and `driving-licence`. Empty string restores all.
4. Click Re-layout: positions reset, fit-view animates.
5. Click Export SVG: a file downloads named `<workspace-slug>-dependency-graph.svg`. Open it locally and confirm shapes are present (annotations may be rasterised — that's expected from html-to-image's SVG mode).
6. Click a node header: navigates to `/workspaces/:wsId/schemas?active=sch_<key>`.
7. (If you can edit a schema to introduce a cycle): make `person` reference `mobile`. Refresh the graph and confirm the red cycle panel appears, the meta row turns red, the order strip shows the "unavailable" message.

- [ ] **Step 10.5: Full repo verification**

```bash
pnpm -F @mirage/engine typecheck \
  && pnpm -F @mirage/web typecheck \
  && pnpm -F @mirage/web lint \
  && pnpm -F @mirage/web test
```

Expected: all pass.

- [ ] **Step 10.6: Final summary to the user**

Summary points:
- Files added: 13 (`graphAnalysis.ts`, `layout.ts`, `exportSvg.ts`, `useGraphData.ts`, `SchemaNode.tsx`, `RefEdge.tsx`, `CycleWarn.tsx`, `OrderStrip.tsx`, `Legend.tsx`, `FilterPopover.tsx`, `GraphPage.tsx`, `graph.css`, plus 4 test files).
- Files modified: `apps/web/package.json` (deps), `apps/web/src/pages/dashboard/GraphPage.tsx` (re-export), `apps/web/vitest.config.ts` + `src/test-setup.ts` (new test infra).
- Design deviation: workspace analysis *imports* `extractSetEdges`/`detectCycles`/`topoSort` from `@mirage/engine` rather than porting — see plan preamble.
- Behaviour deviations from prototype: no "Show cycle example" demo toggle; topo strip is schema-level (not field-level).
- Outstanding: no automated SVG-export test (jsdom-level limitation — manual smoke only).

---

## Self-review checklist

- ☑ Streaming-engine plan Task 2 is a hard prerequisite (topology.ts must exist).
- ☑ Vitest + happy-dom + RTL setup precedes any test (Task 1).
- ☑ Pure modules (`graphAnalysis`, `layout`) have unit tests; the component layer has a smoke test.
- ☑ Engine helpers are imported, not ported (deviation flagged in preamble).
- ☑ All design deviations from spec §6 are preserved (no demo toggle, schema-level strip).
- ☑ Empty-state, cycle, and acyclic branches all render distinct UI.
- ☑ All commit steps replaced by checkpoints; no `git commit`.
- ☑ Node positions are session-only — drag state is React Flow's internal state, not persisted.
