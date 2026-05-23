import { MAX_ROWS_PER_SCHEMA } from '@mirage/engine';
import {
  KEY_RE,
  OUTPUT_FORMATS,
  STRATEGY_TYPES,
  type CreateSetBody,
  type MirageSet,
} from './types.js';

export type SetValidationIssue =
  | { field: 'name'; message: string }
  | { field: 'key'; message: string }
  | { field: 'salt'; message: string }
  | { field: 'schemas'; message: string }
  | { field: 'output'; message: string }
  | { field: 'strategies'; message: string };

const COLORS: ReadonlyArray<MirageSet['color']> = [
  'violet',
  'cyan',
  'emerald',
  'amber',
  'rose',
  'slate',
];

export function validateSet(body: CreateSetBody): SetValidationIssue[] {
  const out: SetValidationIssue[] = [];
  if (!body.name || body.name.trim().length === 0) {
    out.push({ field: 'name', message: 'Name is required.' });
  }
  if (!KEY_RE.test(body.key)) {
    out.push({ field: 'key', message: 'Key must match ^[a-z][a-z0-9-]{0,39}$.' });
  }
  if (!body.salt || body.salt.length < 1 || body.salt.length > 64) {
    out.push({ field: 'salt', message: 'Salt must be 1..64 characters.' });
  }
  if (!COLORS.includes(body.color)) {
    out.push({ field: 'key', message: 'Color must be a brand colour.' });
  }
  if (!body.schemas || body.schemas.length === 0) {
    out.push({ field: 'schemas', message: 'Pick at least one schema.' });
  } else {
    for (const inc of body.schemas) {
      if (!KEY_RE.test(inc.schemaKey)) {
        out.push({ field: 'schemas', message: `Invalid schemaKey: ${inc.schemaKey}` });
      }
      if (!Number.isInteger(inc.count) || inc.count < 0 || inc.count > MAX_ROWS_PER_SCHEMA) {
        out.push({
          field: 'schemas',
          message: `Count for ${inc.schemaKey} must be 0..${MAX_ROWS_PER_SCHEMA.toLocaleString('en-US')}.`,
        });
      }
    }
  }
  if (!body.output || !OUTPUT_FORMATS.includes(body.output.format)) {
    out.push({ field: 'output', message: 'Pick a valid output format.' });
  } else {
    if (!body.output.locale || body.output.locale.length < 2 || body.output.locale.length > 16) {
      out.push({ field: 'output', message: 'Locale must be 2..16 characters.' });
    }
    if (
      !Number.isInteger(body.output.workerPool) ||
      body.output.workerPool < 1 ||
      body.output.workerPool > 64
    ) {
      out.push({ field: 'output', message: 'Worker pool must be 1..64.' });
    }
  }
  for (const ov of body.strategies ?? []) {
    if (!STRATEGY_TYPES.includes(ov.strategy.type as (typeof STRATEGY_TYPES)[number])) {
      out.push({
        field: 'strategies',
        message: `Unknown strategy '${String(ov.strategy.type)}' for ${ov.schemaKey}.${ov.fieldPath}`,
      });
    }
  }
  return out;
}
