import { extractSetEdges, type SetEdge as EngineSetEdge } from '@mirage/engine';
import type { Api } from '@mirage/types';
import type { SetEdge } from './types.js';

type Schema = Api.components['schemas']['Schema'];

/**
 * Thin adapter so the SPA can compute edges locally for the create wizard
 * (where there's no Set on the server yet). For existing sets, prefer the
 * `GET /sets/:id/edges` endpoint — it sees the canonical workspace state.
 */
export function computeEdges(
  schemas: ReadonlyArray<Schema>,
  includedSchemaKeys: ReadonlyArray<string>,
): SetEdge[] {
  const out: EngineSetEdge[] = extractSetEdges(schemas, new Set(includedSchemaKeys));
  return out;
}
