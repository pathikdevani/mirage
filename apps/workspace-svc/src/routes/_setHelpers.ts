import type { Api } from '@mirage/types';
import { extractSetEdges, MAX_ROWS_PER_SCHEMA, type SetEdge } from '@mirage/engine';

type SetDoc = Api.components['schemas']['Set'];
type CreateSetBody = Api.components['schemas']['CreateSetBody'];
type UpdateSetBody = Api.components['schemas']['UpdateSetBody'];
type Strategy = Api.components['schemas']['Strategy'];
type StrategyOverride = Api.components['schemas']['StrategyOverride'];
type SetSchemaInclusion = Api.components['schemas']['SetSchemaInclusion'];
type SetOutputConfig = Api.components['schemas']['SetOutputConfig'];
type SchemaDoc = Api.components['schemas']['Schema'];

export interface ValidationError {
  code: string;
  message: string;
  detail?: unknown;
}

const KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;
const COLORS = ['violet', 'cyan', 'emerald', 'amber', 'rose', 'slate'] as const;
const FORMATS = ['json', 'ndjson', 'csv', 'sql', 'parquet'] as const;

export function err(code: string, message: string, detail?: unknown): ValidationError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

export interface NormalizedSetBody {
  key: string;
  name: string;
  description: string;
  color: SetDoc['color'];
  icon: string;
  tags: string[];
  salt: string;
  schemas: SetSchemaInclusion[];
  strategies: StrategyOverride[];
  output: SetOutputConfig;
}

function validateStrategy(s: unknown): s is Strategy {
  if (!s || typeof s !== 'object') return false;
  const obj = s as Record<string, unknown>;
  if (typeof obj['type'] !== 'string') return false;
  if (obj['type'] === '1:1' || obj['type'] === 'evenSplit') return true;
  if (obj['type'] === 'random') {
    return obj['allowDuplicates'] === undefined || typeof obj['allowDuplicates'] === 'boolean';
  }
  return false;
}

/**
 * Strict validation + light normalization. Does *not* check that schemaKey or
 * strategy fieldPath actually exist in the workspace — that's done in the route
 * once the workspace's schemas are loaded.
 */
export function normalizeAndValidateSetBody(
  body: CreateSetBody | UpdateSetBody,
): NormalizedSetBody | ValidationError {
  const trimmedName = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!trimmedName) return err('name_required', '`name` is required');

  if (typeof body?.key !== 'string' || !KEY_RE.test(body.key)) {
    return err('key_invalid', '`key` must match ^[a-z][a-z0-9-]{0,39}$');
  }
  if (typeof body.icon !== 'string' || !body.icon) {
    return err('key_invalid', '`icon` is required');
  }
  if (!Array.isArray(body.tags)) {
    return err('key_invalid', '`tags` must be an array');
  }
  if (typeof body.color !== 'string' || !COLORS.includes(body.color as (typeof COLORS)[number])) {
    return err('key_invalid', '`color` must be one of the brand colours');
  }
  if (typeof body.salt !== 'string' || body.salt.length < 1 || body.salt.length > 64) {
    return err('salt_invalid', '`salt` must be a 1..64 character string');
  }
  if (!Array.isArray(body.schemas) || body.schemas.length === 0) {
    return err('schemas_empty', 'A Set must include at least one Schema');
  }
  for (const inc of body.schemas) {
    if (typeof inc?.schemaKey !== 'string' || !KEY_RE.test(inc.schemaKey)) {
      return err('schema_inclusion_invalid', `Invalid schemaKey on inclusion: ${inc?.schemaKey}`);
    }
    if (!Number.isInteger(inc.count) || inc.count < 0 || inc.count > MAX_ROWS_PER_SCHEMA) {
      return err(
        'schema_inclusion_invalid',
        `count for ${inc.schemaKey} must be an integer in [0, ${MAX_ROWS_PER_SCHEMA.toLocaleString('en-US')}]`,
      );
    }
  }
  if (!body.output || typeof body.output !== 'object') {
    return err('output_invalid', '`output` is required');
  }
  if (!FORMATS.includes(body.output.format as (typeof FORMATS)[number])) {
    return err('output_invalid', `\`output.format\` must be one of ${FORMATS.join(', ')}`);
  }
  if (
    typeof body.output.locale !== 'string' ||
    body.output.locale.length < 2 ||
    body.output.locale.length > 16
  ) {
    return err('output_invalid', '`output.locale` must be a 2..16 character string');
  }
  if (
    !Number.isInteger(body.output.workerPool) ||
    body.output.workerPool < 1 ||
    body.output.workerPool > 64
  ) {
    return err('output_invalid', '`output.workerPool` must be an integer in [1, 64]');
  }

  if (!Array.isArray(body.strategies)) {
    return err('strategies_invalid', '`strategies` must be an array');
  }
  for (const ov of body.strategies) {
    if (typeof ov?.schemaKey !== 'string' || !KEY_RE.test(ov.schemaKey)) {
      return err('strategy_override_invalid', `Invalid schemaKey on override: ${ov?.schemaKey}`);
    }
    if (typeof ov.fieldPath !== 'string' || ov.fieldPath.length === 0) {
      return err('strategy_override_invalid', `Invalid fieldPath on override for ${ov.schemaKey}`);
    }
    if (!validateStrategy(ov.strategy)) {
      return err(
        'strategy_override_invalid',
        `Unknown strategy type for ${ov.schemaKey}.${ov.fieldPath}`,
      );
    }
  }

  return {
    key: body.key,
    name: trimmedName,
    description: typeof body.description === 'string' ? body.description : '',
    color: body.color as SetDoc['color'],
    icon: body.icon,
    tags: body.tags.filter((t): t is string => typeof t === 'string'),
    salt: body.salt,
    schemas: body.schemas as SetSchemaInclusion[],
    strategies: body.strategies as StrategyOverride[],
    output: body.output as SetOutputConfig,
  };
}

/**
 * Drop strategy overrides that don't correspond to an actual edge in the
 * workspace's current schemas. Lenient by design — keeps the Set usable when
 * the underlying schemas change.
 */
export function pruneOrphanOverrides(
  overrides: StrategyOverride[],
  edges: SetEdge[],
): StrategyOverride[] {
  const keys = new Set(edges.map((e) => `${e.fromSchemaKey}::${e.fromFieldPath}`));
  return overrides.filter((o) => keys.has(`${o.schemaKey}::${o.fieldPath}`));
}

/**
 * `wsSchemas` are all schemas in the workspace. `inclusions` are the set's
 * `schemas[]`. Returns either ok with the edges or an error.
 */
export function validateInclusionsAndComputeEdges(
  wsSchemas: SchemaDoc[],
  inclusions: SetSchemaInclusion[],
): { edges: SetEdge[] } | ValidationError {
  const byKey = new Map(wsSchemas.map((s) => [s.key, s]));
  for (const inc of inclusions) {
    if (!byKey.has(inc.schemaKey)) {
      return err('schema_missing', `Schema not found in workspace: ${inc.schemaKey}`, {
        schemaKey: inc.schemaKey,
      });
    }
  }
  const includedKeys = new Set(inclusions.map((i) => i.schemaKey));
  const edges = extractSetEdges(wsSchemas, includedKeys);
  return { edges };
}
