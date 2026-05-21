import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { generateRows } from './generate-rows.js';
import { isRefPlaceholder, type ResolvedRow } from './resolve-schema.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;

export interface DryRunSchemaParams {
  draft: Schema;
  referencedSchemas: Map<string, Schema>;
  count: number;
  salt: string;
  locale: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export interface DryRunSchemaResult {
  rows: Record<string, unknown>[];
  refs: Record<string, Record<string, unknown>[]>;
}

function collectRefKeys(properties: SchemaProp[]): Set<string> {
  const out = new Set<string>();
  const walk = (props: SchemaProp[]): void => {
    for (const p of props) {
      if (typeof p.faker === 'string') {
        const m = p.faker.match(REF_RE);
        if (m) out.add(m[1]!);
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields);
      else if (p.type === 'array' && p.items) walk([p.items]);
    }
  };
  walk(properties);
  return out;
}

async function drainGenerate(
  schema: Schema,
  count: number,
  salt: string,
  locale: string,
  customFunctions: CustomFunctionRegistry,
  sandbox: SandboxPool,
): Promise<ResolvedRow[]> {
  const out: ResolvedRow[] = [];
  for await (const row of generateRows({ schema, count, salt, locale, customFunctions, sandbox })) {
    out.push(row);
  }
  return out;
}

function pickPath(row: Record<string, unknown>, path: string): unknown {
  let cur: unknown = row;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur === undefined ? null : cur;
}

function substituteRefsForRow(
  draftProps: SchemaProp[],
  row: Record<string, unknown>,
  refRowsByKey: Map<string, Record<string, unknown>>,
): void {
  const walkProps = (props: SchemaProp[], node: Record<string, unknown>): void => {
    for (const p of props) {
      const value = node[p.name];
      if (typeof p.faker === 'string') {
        const m = p.faker.match(REF_RE);
        if (m && isRefPlaceholder(value)) {
          const targetKey = m[1]!;
          const targetField = m[2];
          const refRow = refRowsByKey.get(targetKey);
          if (!refRow) {
            node[p.name] = null;
          } else if (targetField) {
            node[p.name] = pickPath(refRow, targetField);
          } else {
            node[p.name] = refRow;
          }
          continue;
        }
      }
      if (p.type === 'object' && Array.isArray(p.fields) && value && typeof value === 'object') {
        walkProps(p.fields, value as Record<string, unknown>);
      } else if (p.type === 'array' && p.items && Array.isArray(value)) {
        const itemProp = p.items;
        for (const item of value) {
          if (
            itemProp.type === 'object' &&
            Array.isArray(itemProp.fields) &&
            item &&
            typeof item === 'object'
          ) {
            walkProps(itemProp.fields, item as Record<string, unknown>);
          }
        }
      }
    }
  };
  walkProps(draftProps, row);
}

function stripMeta(row: ResolvedRow): Record<string, unknown> {
  const rest = { ...(row as Record<string, unknown>) };
  delete rest['__schemaKey'];
  delete rest['__id'];
  return rest;
}

export async function dryRunSchema(params: DryRunSchemaParams): Promise<DryRunSchemaResult> {
  const { draft, referencedSchemas, count, salt, locale, customFunctions, sandbox } = params;

  const mainRows = await drainGenerate(draft, count, salt, locale, customFunctions, sandbox);

  const refKeys = collectRefKeys(draft.properties);
  const refs: Record<string, Record<string, unknown>[]> = {};
  const refRowsByKeyByIndex: Map<string, Record<string, unknown>[]> = new Map();

  for (const key of refKeys) {
    const refSchema = referencedSchemas.get(key);
    if (!refSchema) continue;
    const refRows = await drainGenerate(refSchema, count, salt, locale, customFunctions, sandbox);
    const plain = refRows.map((r) => stripMeta(r));
    refs[key] = plain;
    refRowsByKeyByIndex.set(key, plain);
  }

  for (let i = 0; i < mainRows.length; i++) {
    const refRowsByKey = new Map<string, Record<string, unknown>>();
    for (const [key, arr] of refRowsByKeyByIndex) {
      const refRow = arr[i];
      if (refRow) refRowsByKey.set(key, refRow);
    }
    substituteRefsForRow(
      draft.properties,
      mainRows[i] as unknown as Record<string, unknown>,
      refRowsByKey,
    );
  }

  return {
    rows: mainRows.map((r) => stripMeta(r)),
    refs,
  };
}
