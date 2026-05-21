# Schema editor — live preview & inline property editing

**Date:** 2026-05-21
**Status:** Design accepted, awaiting implementation plan.

## Problem

The schema editor's right-side `PreviewPane` is a placeholder that says "Preview rows after a Set is run". Property editing happens in `PropDetailDrawer`, an absolutely-positioned overlay sitting on top of the center pane.

We want the right panel to do two things:

1. **Live preview** — show a generated record (or several) for the schema currently being edited, updating as the user edits properties. If the schema has `$ref:` references to other schemas, show generated records for those too.
2. **Inline property editing** — when a property is selected in the editor, show the property edit form in the right panel rather than as a popup/drawer overlay.

The record count is parametric: 1 today, configurable up to 10 immediately, more later.

## Out of scope

- Persisting preview state across sessions.
- Editing the count beyond 10 in the UI (the API will accept higher; the input caps at 10 for now).
- Showing preview in any view other than the schema editor.
- Removing the existing Sets-based `PreviewTab` (separate feature, untouched).

## Architecture

### Right panel: tabbed `SchemaSidePanel`

Replaces `apps/web/src/pages/dashboard/schemas/PreviewPane.tsx`. Two tabs:

- **Preview** — default; shows generated rows.
- **Edit property** — disabled (grayed) when no property is selected; auto-switches to it when a property is selected in the center editor.

Selecting a property auto-activates the Edit tab. Clicking "← Back to preview" inside the Edit tab clears the selection and switches back. The existing `PropDetailDrawer` overlay is deleted.

Tab state is local to `SchemaSidePanel`. Property selection state (`selectedPath`) **and** the `useSchemaBuffer` draft are lifted from `EditPane` up to `SchemasPage`, because `SchemaSidePanel` needs read access to the draft (for dry-run) and write access (for the Edit tab's property mutations) just as much as `EditPane` does. `EditPane` becomes a controlled component receiving `{ buffer, selectedPath, onSelectPath }` as props.

### Preview generation: server-side dry-run

A new BFF endpoint runs the existing `@mirage/engine` generator against the user's in-progress draft without writing anything to the database. This reuses all existing logic — `$ref:` handling, `$fn:` custom function execution via the sandbox pool, faker seeding, validation — and keeps the browser free of generation logic.

```
POST /workspaces/{wsId}/schemas/dry-run?count=N
body: {
  schema: SchemaBody,        // the unsaved draft (same shape as CreateSchemaBody)
  salt?: string              // optional; defaults to a stable "preview" salt
}
→ 200 {
  rows: object[],            // length === count
  refs: { [schemaKey: string]: object[] }  // generated rows for each referenced schema (length === count each)
}
→ 422 { error: ServerError } // validation failed; same shape as PUT errors
```

- `count` is `1..10` via the query param (clamped server-side; API itself accepts higher values for future use).
- `salt` is optional. UI sends a stable salt (`"preview:{schemaId}"`) so identical drafts produce identical output across re-renders. A "Regenerate with new seed" button is not part of this scope; the param is exposed now so adding the button later is a one-line UI change.
- The endpoint validates the draft using the same path used by `PUT /schemas/{id}` (same `ServerError` shape so the frontend can reuse `mapServerError`). If validation fails, the response is 422; UI shows "Fix errors to preview" inline.
- Referenced schemas are looked up by `key` from the workspace's stored schemas. If the draft references a schema that doesn't exist yet, the field renders as `null` in the row and the `refs` map omits that key.
- Wraps `generateRows` in a new `packages/engine/src/dry-run.ts` helper that produces both `rows` and `refs` in one pass (collects referenced keys from the schema tree, generates them, replaces `RefPlaceholder` instances with concrete values).

### Frontend wiring

#### New files

- `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/SchemaSidePanel.tsx` — tab shell + count stepper.
- `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/PreviewTabContent.tsx` — renders main rows + collapsible ref sections.
- `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/EditTabContent.tsx` — moved body of `PropDetailDrawer` (Name/Type/Faker/Required + Duplicate/Remove), no absolute positioning.
- `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/JsonNode.tsx` — small recursive JSON renderer with collapsible objects/arrays (no new deps).
- `apps/web/src/pages/dashboard/schemas/SchemaSidePanel/useSchemaDryRun.ts` — `useQuery` keyed on a stable hash of the draft + count, debounced 400ms via a local `useDebouncedValue` hook. Cancels in-flight requests on new edits.

#### Modified files

- `apps/web/src/pages/dashboard/SchemasPage.tsx` — owns `useSchemaBuffer` and `selectedPath` state; renders `SchemaSidePanel` instead of `PreviewPane`; passes `{ buffer, selectedPath, onSelectPath }` down to both `EditPane` and `SchemaSidePanel`.
- `apps/web/src/pages/dashboard/schemas/EditPane/EditPane.tsx` — receives `buffer`, `selectedPath`, and `onSelectPath` as props instead of owning them; removes `<PropDetailDrawer>` JSX. The `handleDrawerChange`/`handleDrawerDuplicate`/`handleDrawerRemove` functions move to `EditTabContent.tsx` since they only operate on `buffer` + `selectedPath` (both now available there via props).
- `apps/bff/src/routes/schemas.ts` — register the new `POST /workspaces/:wsId/schemas/dry-run` route.

#### Deleted files

- `apps/web/src/pages/dashboard/schemas/PreviewPane.tsx`
- `apps/web/src/pages/dashboard/schemas/EditPane/PropDetailDrawer.tsx`

### Data flow

1. User edits a property in `PropertyEditor`.
2. `EditPane` updates its `useSchemaBuffer` draft.
3. `SchemasPage` re-renders, passes the new draft to `SchemaSidePanel`.
4. `useSchemaDryRun` debounces 400ms, hashes `(draft, count)`, fires `POST /dry-run`.
5. Response populates `PreviewTabContent`: main `rows` as collapsible JSON, then a divider, then one collapsible `<JsonNode>` per referenced schema key.
6. While the request is in flight, the previous result stays visible with a subtle "Generating…" indicator (no full skeleton flash).
7. On validation error (422), preview area shows "Fix errors to preview" with the first error message; previous result is dimmed.

### Count input

A small numeric stepper (1–10) in the Preview tab header, right-aligned. Local state in `SchemaSidePanel`. Defaults to 1. Changing it re-triggers the dry-run query.

### Type contract

The new endpoint is added to the OpenAPI spec (`packages/types`) first, so `bff.POST('/workspaces/{wsId}/schemas/dry-run', ...)` is fully typed end-to-end. The BFF route is then implemented against the generated types.

## Error handling

| Condition | Behavior |
|---|---|
| Draft has validation errors | 422 from server; UI shows "Fix errors to preview" + first error message, dims last good result. |
| `$ref:` target schema not found | Field renders `null` in row; ref omitted from `refs` map; no error. |
| `$fn:` target function missing | 500 from engine (`EngineError`); UI shows engine error message inline in preview area. |
| Network error / timeout | UI shows "Preview unavailable" with retry button. |
| Workspace ID missing | Should never happen (page is workspace-scoped); no special handling. |

## Testing

- Engine: unit test `dry-run.ts` produces correct `rows` + `refs` for a schema with and without references.
- BFF: integration test for `POST /dry-run` covering: success with count=1, count=10 clamping, validation failure (422), missing referenced schema, presence of `$fn:` field.
- Web: component test that `SchemaSidePanel` switches to Edit tab on selection, switches back on "Back to preview", and that the count stepper triggers a new query.

## Open questions resolved

- **Preview engine:** server-side dry-run (parametric count).
- **Panel mode on selection:** tabs (auto-switch on selection).
- **Ref display:** separate collapsible sections per schema.
- **Draft vs saved:** use unsaved draft.
- **Regen trigger:** auto, debounced 400ms.
- **Count UI:** 1–10 stepper visible now.
