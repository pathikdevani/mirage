# Workspace Deletion — Design

**Status:** Draft
**Date:** 2026-05-22
**Owner:** Pathik

## 1. Problem

Mirage today has no way to delete a workspace. Every workspace is forever, even after experiments are abandoned, and the storage it touches — Mongo (`schemas`, `sets`, `custom_functions`, `runs`, workspace-scoped `memberships`, `workspaces`) and S3 keys under `org/{orgId}/workspace/{wsId}/…` — accumulates without an exit.

This spec adds a destructive, cascading delete for a workspace and all data it owns.

## 2. Goals & Non-goals

**Goals**
- Org owners can delete a workspace from the UI.
- The action is irreversible and removes every persisted artifact owned by the workspace, including S3 objects.
- Deletion is safe under in-flight runs: queued jobs are cancelled, running jobs are signalled to stop, and only then is data purged.
- The UI immediately reflects "this workspace is going away" while the cascade runs in the background.
- Crashes mid-cascade do not leave orphan data.

**Non-goals**
- No undo / soft-restore.
- No bulk workspace delete.
- No per-workspace `owner`/`editor`/`viewer` overrides beyond the existing membership model (gating is by org role only).
- No retention window or trash bin.
- Audit/event log for the delete is out of scope.

## 3. Behaviour overview

Deletion runs in two phases:

### Phase 1 — synchronous soft delete (< 100 ms)

`DELETE /workspaces/:id` from the SPA, owner-only:

1. Authn + tenancy check (existing pattern).
2. Require `auth.role === 'owner'` (org-level). Anything else → `403`.
3. Look up the workspace. If missing or `deletedAt` already set → `404` (gone) or `409` (already deleting) respectively.
4. Set `deletedAt = <ISO now>` on the workspace row.
5. For every run in this workspace with status `queued`, `running`, or `cancelling`:
   - Remove the BullMQ job by id (the run id is the job id — see [apps/workspace-svc/src/queue.ts:23](apps/workspace-svc/src/queue.ts#L23)). This drops still-queued jobs before they start.
   - `SET run:{runId}:cancel 1 EX 600` (existing cancel flag honoured by the worker — see [apps/workspace-svc/src/routes/runs.ts:125](apps/workspace-svc/src/routes/runs.ts#L125)) so running jobs bail out at their next checkpoint.
6. Enqueue the workspace id into an in-process cascade queue (see Phase 2).
7. Return `202 Accepted`.

The workspace is now "soft deleted". It is still returned by `GET /workspaces` (so the SPA can render the "deleting" state) but every workspace-scoped sub-resource endpoint treats it as `404`.

### Phase 2 — async cascade (background, in workspace-svc process)

For each soft-deleted workspace queued for cascade:

1. Poll `db.runs.find({ workspaceId, status: { $in: ['queued','running','cancelling'] } })` every 1 second. Proceed when the count reaches zero or a 2-minute hard timeout elapses (after which we proceed regardless — the worker has been signalled, mongo state is no worse than a stale run record we're about to delete anyway).
2. Enumerate every key under `org/{orgId}/workspace/{wsId}/` in S3 (`ListObjectsV2` with continuation tokens) and delete in batches via `DeleteObjects` (max 1000 keys per request).
3. Delete Mongo docs in this order (each is a single `deleteMany` keyed on `workspaceId`):
   1. `runs`
   2. `custom_functions`
   3. `sets`
   4. `schemas`
   5. `memberships` where `workspaceId` matches (only the workspace-scoped override rows; org-level membership rows have no `workspaceId` field, so the filter `{ workspaceId: <id> }` does not touch them — see [apps/workspace-svc/src/db.ts:78](apps/workspace-svc/src/db.ts#L78)).
   6. `workspaces` (the row itself, by `id`).

Each step is idempotent: a re-run on partial state simply finds nothing to do and moves on.

### Startup sweep

On workspace-svc boot, immediately after `connectDb()` resolves, query:

```ts
db.workspaces.find({ deletedAt: { $exists: true } }).toArray()
```

and enqueue each id into the in-process cascade. This recovers from a crash mid-cascade.

## 4. Data model changes

### 4.1 Type

Add an optional `deletedAt` ISO timestamp to `Workspace`:

```ts
// packages/types/src/workspace.ts
export interface Workspace {
  // … existing fields …
  deletedAt?: string;
}
```

### 4.2 OpenAPI

In [packages/types/openapi.yaml](packages/types/openapi.yaml):

- Add `deletedAt: { type: string, format: date-time }` to the `Workspace` schema (optional).
- Add `DELETE /workspaces/{id}` operation with responses `202`, `403`, `404`, `409`.

Regenerate `packages/types/src/openapi.generated.ts`.

### 4.3 Mongo

No new index needed. The startup-sweep query runs once at boot and the workspace list is small (the existing `(orgId, id)` unique index + `(orgId, updatedAt)` index already cover the read paths).

## 5. API surface

### 5.1 New endpoint

```
DELETE /workspaces/{id}
```

| Response | Meaning |
|---|---|
| `202 Accepted` | Soft delete written; cascade started. Body: `{ id, deletedAt }`. |
| `403 Forbidden` | Caller is not an org owner. |
| `404 Not Found` | Workspace doesn't exist or already fully hard-deleted. |
| `409 Conflict` | Workspace is already in `deletedAt` state. |

### 5.2 Existing endpoint changes

| Endpoint | Soft-deleted (`deletedAt` set) behaviour |
|---|---|
| `GET /workspaces` | Returned. Caller sees `deletedAt`. |
| `GET /workspaces/:id` | Returned with `deletedAt`. |
| All `/workspaces/:wsId/{schemas,sets,runs,custom-functions}/*` | `resolveWorkspace` treats soft-deleted as if not found → `404`. |
| `DELETE /workspaces/:id` (repeat) | `409`. |

The single change point for "workspace is dead to its contents" is the `resolveWorkspace` helper duplicated in [routes/schemas.ts:320](apps/workspace-svc/src/routes/schemas.ts#L320), [routes/sets.ts:75](apps/workspace-svc/src/routes/sets.ts#L75), [routes/runs.ts:43](apps/workspace-svc/src/routes/runs.ts#L43), and [routes/custom-functions.ts](apps/workspace-svc/src/routes/custom-functions.ts). Each gets a `if (ws.deletedAt) → 404` line.

### 5.3 BFF

Add `app.delete<{ Params: { id: string } }>('/workspaces/:id', ...)` in [apps/bff/src/routes/workspaces.ts](apps/bff/src/routes/workspaces.ts) that forwards to workspace-svc the same way GET/POST already do.

## 6. Implementation layout

### 6.1 New module — `apps/workspace-svc/src/workspace-cascade.ts`

Owns the in-process cascade. Public surface:

```ts
export interface CascadeDeps {
  db: MirageDb;
  s3: S3Client;
  bucket: string;
  redis: Redis;
  runsQueue: Queue;
  log: FastifyBaseLogger;
}

export function createWorkspaceCascade(deps: CascadeDeps): {
  enqueue(workspaceId: WorkspaceId): void;
  runStartupSweep(): Promise<void>;
};
```

Internals:
- A `Set<WorkspaceId>` of in-flight cascades (idempotent re-enqueue).
- `enqueue()` is fire-and-forget: it starts the cascade for that id if not already running; otherwise no-op.
- A single `cascade(wsId)` async function that runs the drain → S3 → Mongo sequence with try/catch + structured logs.
- Drain polling uses `setTimeout` (not `setInterval`) so each tick is awaited.
- Caps the total wall-clock time per cascade at 2 minutes for the drain phase only; S3/Mongo deletion has no timeout.

### 6.2 Route — `DELETE /workspaces/:id`

Added to [apps/workspace-svc/src/routes/workspaces.ts](apps/workspace-svc/src/routes/workspaces.ts). Pseudocode:

```ts
app.delete<{ Params: { id: string } }>('/workspaces/:id', async (req, reply) => {
  const auth = req.auth;
  if (!auth) return reply.code(401).send({ error: 'unauthenticated' });
  if (auth.role !== 'owner') {
    return reply.code(403).send({ error: 'only org owners can delete a workspace' });
  }
  const ws = await db.workspaces.findOne({ orgId: auth.orgId, id });
  if (!ws) return reply.code(404).send({ error: 'not found' });
  if (ws.deletedAt) return reply.code(409).send({ error: 'already deleting' });

  const now = new Date().toISOString();
  await db.workspaces.updateOne({ id }, { $set: { deletedAt: now } });

  // Cancel in-flight runs
  const activeRuns = await db.runs.find(
    { workspaceId: id, status: { $in: ['queued','running','cancelling'] } },
    { projection: { id: 1 } },
  ).toArray();
  for (const r of activeRuns) {
    try { await runsQueue.remove(r.id); } catch { /* may already be running */ }
    await redis.set(cancelFlagKey(asId<RunId>(r.id)), '1', 'EX', 600);
  }

  cascade.enqueue(id as WorkspaceId);
  return reply.code(202).send({ id, deletedAt: now });
});
```

### 6.3 `resolveWorkspace` change

Every existing `resolveWorkspace` helper gets an extra line after the not-found check:

```ts
if (ws.deletedAt) {
  await reply.code(404).send({ error: 'workspace not found' });
  return null;
}
```

(Surfacing it as `404` rather than `410` keeps the SPA's existing error paths unchanged.)

### 6.4 List filter (none)

`GET /workspaces` continues to return soft-deleted rows. The SPA decides how to render them. The dropdown in the top bar filters them out (see UI section).

### 6.5 Startup sweep

In [apps/workspace-svc/src/main.ts](apps/workspace-svc/src/main.ts), after the cascade module is constructed and before the server starts accepting traffic, call `cascade.runStartupSweep()`. We don't `await` it past the initial `find()`; the cascades themselves run in the background.

## 7. UI changes

### 7.1 `WorkspaceList` / `WorkspaceRow`

If `workspace.deletedAt` is truthy:
- Render in `text-muted-foreground` / lower opacity (mirrors the existing disabled `Join with invite code` row in [WorkspaceList.tsx:87](apps/web/src/components/workspace-picker/WorkspaceList.tsx#L87)).
- Replace the description preview with the literal text `Deleting…`.
- `onSelect` becomes a no-op; row is `aria-disabled`.
- If the soft-deleted row was the selected one in `WorkspacesPage`, the existing auto-select effect skips it and picks the next non-deleted workspace.

### 7.2 `WorkspaceDetailCard`

Add a danger-zone control below the "Continue to workspace" CTA in [WorkspaceDetailCard.tsx](apps/web/src/components/workspace-picker/WorkspaceDetailCard.tsx):

- Small `Delete workspace` text button, red text, no fill — low visual weight.
- Click → confirm modal:
  > **Delete `<workspace name>`?**
  > This permanently removes all schemas, sets, runs, and stored data. This cannot be undone.
  > `Cancel` `Delete`
- The `Delete` button is destructive (red fill).
- On confirm:
  - `bff.DELETE('/workspaces/{id}', { params: { path: { id } } })`.
  - On `202`: optimistically update the `['workspaces', orgId]` react-query cache to set `deletedAt` on this row. Close modal.
  - On `403`: render inline error in modal: "Only org owners can delete a workspace."
  - On any other error: inline error with retry.
- If the deleted workspace is the currently active one (`useUiStore.currentWorkspaceId === id`), navigate to `/workspaces` after the optimistic update.
- If the workspace is already soft-deleted (`workspace.deletedAt` set), the Delete button is hidden; the card instead shows a small "Deleting…" badge in place of the `dev` chip.

### 7.3 `WorkspaceSwitcher` (top bar)

[apps/web/src/components/shell/WorkspaceSwitcher.tsx](apps/web/src/components/shell/WorkspaceSwitcher.tsx): filter `workspaces.data` to exclude `w.deletedAt`. A deleted workspace is unreachable from the dashboard.

### 7.4 Polling

In `WorkspacesPage`, when the list contains at least one row with `deletedAt` set, set the `useQuery`'s `refetchInterval` to `5000`. When none are deleting, omit `refetchInterval`. This lets the row disappear naturally once the cascade finishes Mongo cleanup.

### 7.5 No new design tokens / icons

Reuses existing `bg-destructive`, `text-destructive`, `border-destructive` tokens already used in the workspaces error state.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| User clicks Delete twice in a row | First call → `202`. Second → `409`. Modal stays open on the first call until response comes back; second call is impossible from the same modal. |
| Workspace has an artifact in S3 that was created *outside* the `org/.../workspace/.../` prefix | Out of scope — by [TECH_ARCHITECHRE.md §6](docs/TECH_ARCHITECHRE.md#6) all keys must be under that prefix. Misplaced keys are an existing bug, not new debt. |
| workspace-svc crashes between `updateOne({deletedAt})` and `runsQueue.remove()` | Startup sweep picks it up; idempotent cancel flag set on each run; cascade proceeds. |
| workspace-svc crashes mid-S3 enumeration | Startup sweep re-runs the cascade; `ListObjectsV2` returns whatever is still there and we re-delete. |
| Drain timeout (>2 min of active runs) | Force-proceed. The worker honours the cancel flag eventually; any artifact it writes after we've deleted prefix is an orphan key — acceptable, S3 has its own lifecycle. The Mongo row for the run is deleted in cascade step 3.i. |
| User is not an org owner | Backend returns `403`. UI shows inline error. |
| Workspace has no schemas/sets/runs | All `deleteMany` calls match zero docs. Cascade finishes in well under a second. |
| Same workspace id reused after delete | Can't happen — workspace ids are `ws_<nanoid(16)>`. |

## 9. Operational notes

### 9.1 Owner role

The current dev membership resolver in [db.ts:76](apps/workspace-svc/src/db.ts#L76) JIT-provisions every user as `editor`. **For manual testing the delete flow, the operator must promote a `memberships` row to `owner`** via mongosh:

```js
db.memberships.updateOne(
  { userId: '<uid>', orgId: '<orgId>', workspaceId: { $exists: false } },
  { $set: { role: 'owner' } },
);
```

This is unavoidable until org-level role management ships and is out of scope for this spec.

### 9.2 Logging

The cascade logs at `info` for each phase boundary and at `warn` for the drain timeout / individual S3 batch failures. No alerting wired up — observability is intentionally light per [TECH_ARCHITECHRE.md §6](docs/TECH_ARCHITECHRE.md#6).

### 9.3 Multi-instance workspace-svc

Not a concern today — workspace-svc runs as a single process locally and the project is pre-production. If multiple replicas ever run, two of them could try to cascade the same workspace simultaneously. The cascade is idempotent, so the worst case is wasted work, not corruption. Coordinating leases would be premature.

## 10. Testing

Manual verification only (consistent with [TECH_ARCHITECHRE.md §5](docs/TECH_ARCHITECHRE.md#5)):

1. **Empty workspace** — create, delete, verify row disappears within a couple of seconds. Verify no S3 objects, no Mongo docs.
2. **Workspace with schemas + sets + run artifact** — create, run a set, delete. Verify S3 `org/{orgId}/workspace/{wsId}/run/*.ndjson` is gone, Mongo `schemas/sets/runs` rows are gone.
3. **Workspace with active run** — start a long-running set, click delete while `running`. Verify the run is cancelled (BullMQ job removed or cancel flag honoured) and the cascade completes after the run reaches a terminal state.
4. **Concurrent delete** — click Delete, then quickly retry the same call via curl. Expect `409`.
5. **Non-owner attempt** — promote a second user to `editor` only, call DELETE, expect `403`.
6. **Restart mid-cascade** — start a delete, kill workspace-svc within the drain window, restart. Verify the cascade resumes and the workspace eventually disappears.

## 11. Open questions

None. All decisions have been settled in the brainstorming pass:

- Permissions: org owner only.
- In-flight runs: soft-delete → cancel → drain → hard-delete.
- Worker location: in-process inside workspace-svc, with startup sweep for orphans.
- Confirmation UX: simple "are you sure?" modal.
- Entry point: workspace picker detail card only.
- Soft-delete visibility: greyed-out row labelled "Deleting…", not clickable.
