import type { Api, ValueExpr, ValueSegment } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { createFakerEngine } from './faker-engine.js';
import { EngineError } from './errors.js';
import { hashSeed, mulberry32 } from './rng.js';
import type { RefPlaceholder, ResolvedRow } from './resolve-schema.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

const DEFAULT_ARRAY_LENGTH = 3;

export interface GenerateRowsParams {
  schema: Schema;
  count: number;
  salt: string;
  locale: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

export async function* generateRows(params: GenerateRowsParams): AsyncIterable<ResolvedRow> {
  const { schema, count, salt, locale, customFunctions, sandbox } = params;
  if (!Number.isInteger(count) || count < 0) {
    throw new EngineError('resolve_schema_bad_count', { count });
  }

  const fakerEngine = createFakerEngine(locale);
  fakerEngine.seed(hashSeed(salt, schema.key));

  for (let i = 0; i < count; i++) {
    const rowId = `${salt}:${schema.key}:${i}`;
    const rowRng = mulberry32(hashSeed(salt, schema.key, String(i)));
    const fields = await evalTopLevelRow(schema.properties, {
      schemaKey: schema.key,
      fakerEngine,
      rowRng,
      salt,
      locale,
      rowIndex: i,
      customFunctions,
      sandbox,
      fieldPath: '',
      evalNamed: async () => undefined,
    });
    yield { __schemaKey: schema.key, __id: rowId, ...fields };
  }
}

interface ResolvePropContext {
  schemaKey: string;
  fakerEngine: ReturnType<typeof createFakerEngine>;
  rowRng: () => number;
  salt: string;
  locale: string;
  rowIndex: number;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
  fieldPath: string;
  evalNamed: (name: string) => Promise<unknown>;
}

/**
 * Evaluate the top-level properties of a single row using lazy memoised
 * recursion. Required because `field` segments can reference siblings declared
 * later in the schema; an in-order loop would see `undefined`.
 */
async function evalTopLevelRow(
  props: SchemaProp[],
  ctxBase: ResolvePropContext,
): Promise<Record<string, unknown>> {
  const byName = new Map<string, SchemaProp>();
  for (const p of props) byName.set(p.name, p);

  const memo = new Map<string, unknown>();
  const evaluating = new Set<string>();

  const evalNamed = async (name: string): Promise<unknown> => {
    if (memo.has(name)) return memo.get(name);
    if (evaluating.has(name)) {
      throw new EngineError('value_cycle', {
        fieldPath: name,
        cycle: [...evaluating, name],
      });
    }
    const p = byName.get(name);
    if (!p) return undefined;
    evaluating.add(name);
    try {
      const v = await resolveProp(p, { ...ctxBase, fieldPath: name, evalNamed });
      memo.set(name, v);
      return v;
    } finally {
      evaluating.delete(name);
    }
  };

  const out: Record<string, unknown> = {};
  for (const p of props) out[p.name] = await evalNamed(p.name);
  return out;
}

async function resolveProp(p: SchemaProp, ctx: ResolvePropContext): Promise<unknown> {
  if (p.type === 'object') {
    const obj: Record<string, unknown> = {};
    const fields = Array.isArray(p.fields) ? p.fields : [];
    for (const f of fields) {
      obj[f.name] = await resolveProp(f, { ...ctx, fieldPath: `${ctx.fieldPath}.${f.name}` });
    }
    return obj;
  }
  if (p.type === 'array') {
    if (!p.items) return [];
    const out: unknown[] = [];
    for (let k = 0; k < DEFAULT_ARRAY_LENGTH; k++) {
      out.push(
        await resolveProp(p.items, {
          ...ctx,
          fieldPath: `${ctx.fieldPath}[]${p.items.name ? `.${p.items.name}` : ''}`,
        }),
      );
    }
    return out;
  }

  if (!Array.isArray(p.value) || p.value.length === 0) return null;

  if (p.value.length === 1) return evalSegment(p.value[0]!, ctx);

  const parts: string[] = [];
  for (const seg of p.value) {
    const v = await evalSegment(seg, ctx);
    parts.push(stringifyForTemplate(v));
  }
  return parts.join('');
}

function stringifyForTemplate(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    // faker methods like `airline.airport` return objects; in a multi-segment
    // template we serialize them as JSON rather than the unhelpful
    // `[object Object]`. For native string output, use a single-segment value.
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

async function evalSegment(seg: ValueSegment, ctx: ResolvePropContext): Promise<unknown> {
  switch (seg.kind) {
    case 'text':
      return seg.text;
    case 'field':
      return resolveFieldByDottedPath(seg.name, ctx);
    case 'method':
      return ctx.fakerEngine.call(seg.method, seg.args as Parameters<typeof ctx.fakerEngine.call>[1]);
    case 'ref': {
      const ref: RefPlaceholder = {
        __ref: true,
        toSchemaKey: seg.target.split('.')[0]!,
        fromFieldPath: ctx.fieldPath,
      };
      return ref;
    }
    case 'fn': {
      const entry = ctx.customFunctions.get(seg.id);
      if (!entry) {
        throw new EngineError('fn_target_missing', {
          fieldPath: ctx.fieldPath,
          functionId: seg.id,
        });
      }
      if (entry.usage === 'strategy') {
        throw new EngineError('fn_usage_mismatch', {
          fieldPath: ctx.fieldPath,
          functionId: seg.id,
          usage: entry.usage,
        });
      }
      const seedBase = hashSeed(
        ctx.salt,
        ctx.schemaKey,
        String(ctx.rowIndex),
        ctx.fieldPath,
      );
      const callerCtx = {
        __fakerSeed: seedBase,
        __fakerLocale: ctx.locale,
        __rngSeed: seedBase ^ 0x9e3779b9,
        salt: ctx.salt,
      };
      return ctx.sandbox.invoke(entry.source, callerCtx);
    }
  }
}

async function resolveFieldByDottedPath(
  path: string,
  ctx: ResolvePropContext,
): Promise<unknown> {
  const parts = path.split('.');
  const head = parts[0]!;
  let cursor = await ctx.evalNamed(head);
  for (let i = 1; i < parts.length; i++) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[parts[i]!];
  }
  return cursor;
}

// Re-export ValueExpr so consumers of engine internals (tests) can name it.
export type { ValueExpr };
