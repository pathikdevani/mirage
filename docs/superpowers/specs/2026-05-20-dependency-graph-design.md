# Dependency Graph — Design

> Date: 2026-05-20
> Status: Approved (brainstorming complete, plan pending)
> Scope: Workspace-wide dependency graph view at the `/workspaces/:wsId/graph` route.

## Context

Mirage Schemas declare cross-schema **References** via the `$ref:<schemaKey>(.<fieldPath>)?` convention on a Primitive field's `faker` string. The engine ([packages/engine/src/extract-set-edges.ts](../../../packages/engine/src/extract-set-edges.ts), [packages/engine/src/run-set.ts](../../../packages/engine/src/run-set.ts)) walks these to produce edges, topologically sort schemas before a Run, and reject Sets whose included schemas contain a cycle.

The web app already exposes a "Dependency graph" nav item that routes to [apps/web/src/pages/dashboard/GraphPage.tsx](../../../apps/web/src/pages/dashboard/GraphPage.tsx) — currently an `EmptyStub`. This spec turns that stub into the real view.

A high-fidelity design exists in [design/screens_export/Pieces.jsx](../../../design/screens_export/Pieces.jsx) (`function GraphPage` at line 135) with matching CSS in [design/screens_export/mirage.css](../../../design/screens_export/mirage.css) (`.graph-node`, `.graph-canvas`, `.cycle-warn`, `.order-strip`, `.graph-controls`, `.graph-legend`). The implementation reproduces the design at full parity, with two intentional deviations documented in §6.

## Goals

- Visualize every Schema in the current Workspace and every `$ref` between them as a draggable, pan/zoom-able graph.
- Detect cycles across the workspace's Schemas and surface the path that breaks topological ordering.
- Show the workspace-level topological order so users see the deterministic generation sequence the engine would use.
- Provide the polish from the design: legend, zoom controls, re-layout, SVG export, name filter, "New schema" entry point.
- Match the engine's edge / cycle / topo semantics exactly. The graph is a faithful view of what the engine sees — not a separate analysis.

## Non-goals

- Persisting node positions to the backend. Drag state is session-only (held in the page's React state).
- Per-Set scoping or a Set picker. The view is always workspace-wide.
- Editing References from the graph. Clicking a node deep-links to the schema editor; edges are read-only here.
- A field-level topological order. The engine sorts schemas, not properties; the order strip mirrors that.
- Real-time updates from other tabs. The page refetches on mount / window focus (TanStack Query defaults).

## Vocabulary

Same terms as [docs/CONTEXT.md](../../CONTEXT.md). The graph view uses:

- **Node** ⇒ one Workspace Schema. Identified by its `schemaKey`.
- **Edge** ⇒ one Reference. Direction follows the engine's convention in [extract-set-edges.ts](../../../packages/engine/src/extract-set-edges.ts): edge `A → B` means *Schema A has a `$ref` pointing to Schema B*. The engine resolves B first, then A — this is the direction rendered in the canvas (B sits left of A).
- **Cycle** ⇒ a directed cycle in that schema-level DAG. The cycle path is reported as a sequence of `(schemaKey, fieldPath)` pairs, same shape as `EngineError('cycle_in_set')`.
- **Topo order** ⇒ Kahn's-algorithm output identical to [run-set.ts:topoSort](../../../packages/engine/src/run-set.ts).

## Architecture

### New folder

All graph-specific code lives under [apps/web/src/pages/dashboard/graph/](../../../apps/web/src/pages/dashboard/graph/). The current `GraphPage.tsx` becomes a thin re-export of `graph/GraphPage.tsx` so the route stays stable.

```
apps/web/src/pages/dashboard/graph/
  GraphPage.tsx          Page shell — header, action bar, meta row, cycle panel, canvas, order strip.
  SchemaNode.tsx         Custom React-Flow node. Header (icon tile + schemaKey + props badge) + property list.
  RefEdge.tsx            Custom React-Flow edge. Dashed violet bezier with arrow marker; red when in a cycle.
  CycleWarn.tsx          Red warning panel rendered above the canvas when cycles exist.
  OrderStrip.tsx         Bottom strip showing the schema-level topo order chips.
  Legend.tsx             Bottom-right legend overlay (cross-schema $ref, generation order, acyclic indicator).
  FilterPopover.tsx      Popover wired to the "Filter" button in the action bar.
  useGraphData.ts        React hook: loads schemas, runs analysis, applies dagre layout, returns React-Flow inputs.
  graphAnalysis.ts       Pure module — workspace-wide port of extractEdges / detectCycles / topoSort.
  layout.ts              Dagre wrapper. Given nodes + edges, returns positioned nodes.
  exportSvg.ts           html-to-image wrapper that captures the viewport and triggers a download.
```

Naming and patterns mirror existing pages (`apps/web/src/pages/dashboard/schemas/`, `apps/web/src/pages/dashboard/sets/`). All page-level data fetching uses TanStack Query keyed `['graph-schemas', wsId]` (or reuses the existing `['schemas', wsId]` key — see §5).

### Dependencies added

| Package | Approx gzip | Purpose |
|---|---|---|
| `@xyflow/react` | ~50kb | Graph rendering, pan/zoom/drag, controls, fitView |
| `dagre` + `@types/dagre` | ~30kb | Initial left→right layered layout |
| `html-to-image` | ~30kb | SVG export of the canvas |

All three are pinned in `apps/web/package.json`. No engine or worker packages take new deps.

## Data flow

1. **Load.** `useGraphData(wsId)` calls the existing `GET /workspaces/{wsId}/schemas` endpoint via `bff.GET(...)` and TanStack Query. The Schemas page already issues this query; the graph page reuses the same query key so cache hits work across navigation.
2. **Analyze.** `graphAnalysis.analyzeWorkspace(schemas)` returns:
   ```ts
   {
     edges: GraphEdge[];          // { from, fromFieldPath, to, toFieldPath?, cardinality }
     cycles: CyclePath[];         // [{ schemaKeys: string[], fieldPaths: string[] }, ...]
     order: string[];             // schemaKey topo order (empty if cycles exist)
   }
   ```
   Internals are direct ports of [extract-set-edges.ts](../../../packages/engine/src/extract-set-edges.ts) and the helpers in [run-set.ts](../../../packages/engine/src/run-set.ts). We port rather than import because `@mirage/engine` pulls in `@mirage/sandbox` (Node-only). Both the engine and the web port stay in lockstep manually; a TODO note in each file points at the other.
3. **Lay out.** `layout.applyDagre(schemas, edges)` builds a dagre graph (`rankdir: 'LR'`, `nodesep: 40`, `ranksep: 90`), measures each node's height from its property count (38 header + 28 × props), and returns `Record<schemaKey, { x, y }>`.
4. **Render.** `GraphPage` feeds React-Flow:
   - `nodes`: one per schema, `type: 'schema'`, position from dagre, data `{ schema, isInCycle }`.
   - `edges`: one per `GraphEdge`, `type: 'ref'`, source/target are schemaKeys, data `{ fromFieldPath, toFieldPath, cardinality, isInCycle }`. The edge handles attach to the specific property row inside the node via React-Flow's `sourceHandle` / `targetHandle` (one handle per property).

## Interactions

| Surface | Behavior |
|---|---|
| Pan / zoom / drag node | React-Flow defaults. Session-only — refresh resets. |
| Action bar — `Show/Hide cycle example` | **Removed** (see §6). |
| Action bar — `Re-layout` | Re-runs dagre and calls `fitView()`. |
| Action bar — `Export SVG` | `exportSvg.ts` → `html-to-image.toSvg(viewportEl)` → `Blob` → anchor click. Filename: `<workspace-slug>-dependency-graph.svg`. |
| Action bar — `New schema` | Opens the existing `CreateSchemaSheet` from `apps/web/src/pages/dashboard/schemas/CreateSchemaSheet/`. |
| Canvas overlay — `<Controls/>` | React-Flow built-in: zoom in, zoom out, fit view. Matches the design's `.graph-controls` cluster. |
| Filter popover | Free-text input. Substring match on `schemaKey` (case-insensitive). Nodes that don't match get `hidden: true` in React-Flow; edges that touch a hidden node are also hidden. |
| Hovering a node | Bolds the connected edges (`strokeWidth: 2`, opacity 1). Pure CSS via `[data-id=...]` selectors on the SVG. |
| Clicking a node header | Navigates to `/workspaces/:wsId/schemas?schema=:schemaKey` (existing deep-link). |
| Cycle warning panel | Renders the **first** detected cycle's path. If multiple cycles exist, a small "+N more" chip expands the panel. |

## Design deviations

Two intentional differences from [Pieces.jsx → GraphPage](../../../design/screens_export/Pieces.jsx):

1. **No "Show cycle example" demo toggle.** The prototype includes a button that fakes a cycle for demo purposes. Showing a fake cycle in a real workspace is misleading. The cycle panel still appears automatically whenever a real cycle is detected.
2. **Schema-level topo strip, not field-level.** The prototype shows field chips (`person.id → mobile.personId → ...`). The engine's topo sort is over *schemas*, and there is no field-level total order (fields within a schema are independent). The strip renders one chip per schema in topo order. When a cycle exists, the strip is replaced by the message *"Generation order unavailable — break the cycle above first."*

## Edge cases

| Case | Behavior |
|---|---|
| Workspace has no schemas | Page renders the existing `EmptyStub` ("No schemas yet — create one"). Action bar still shows `New schema`. |
| Schema with zero references | Renders as an isolated node. Dagre places it in its own rank. |
| Reference target schema missing from the workspace | Edge is skipped (matches `extractSetEdges`' "includedKeys" filter — a ref to an unknown schema is not an edge *within this view*). A small warning chip appears in the meta row: "⚠ N dangling refs". |
| Self-reference (`person.id` → `person`) | Counted as a single-node cycle and surfaced in the cycle panel. The engine's `detectCycles` already handles this. |
| Multiple `$ref`s between the same two schemas | One React-Flow edge per reference. Edges between the same pair are slightly fanned via `pathOptions.offset` so they don't overlap. |
| Schema renamed while page is open | Query refetches on `window` focus and on cache invalidation triggered by the schema edit screen. Layout is recomputed; existing dragged positions are kept where the schemaKey is unchanged. |
| Filter hides all nodes | Canvas shows a centered "No schemas match \"<query>\"" message. |
| Very large workspaces (>100 schemas) | Out of scope for v1. Dagre + React-Flow handle this size; minimap is enabled when node count > 20. |

## Testing

- **Unit (`vitest`)**: `graphAnalysis.test.ts` covers a representative matrix of schemas — primitives, nested objects, arrays of refs, self-refs, dangling refs, cycles of length 2/3/4. Asserts edge list, cycle paths, and topo order match the engine's [run-set.ts](../../../packages/engine/src/run-set.ts) output verbatim on the same inputs. This is the regression contract that keeps the port in sync.
- **Unit (`vitest`)**: `layout.test.ts` verifies dagre wrapper produces stable positions for a fixed schema set (snapshot).
- **Component (`vitest` + RTL)**: `GraphPage.test.tsx` renders with a mocked schemas response; asserts node count, edge count, meta row counts, presence of cycle panel when a cycle exists, presence of order strip when acyclic.
- **Manual smoke**: open `/workspaces/:wsId/graph` against the dev backend with the seeded `person` / `mobile` / `driving-licence` schemas; verify all three nodes render, both edges render, no cycle panel.

## Out of scope for v1 (documented for later)

- Backend persistence of node positions.
- Editing references / strategies from the graph.
- Live multi-tab updates via WebSocket.
- A field-level topological order or generation timeline.
- Performance work for workspaces with >100 schemas.
