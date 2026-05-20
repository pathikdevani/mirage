import type { Api } from '@mirage/types';
import type { SandboxPool } from '@mirage/sandbox';
import type { CustomFunctionRegistry } from './custom-function-registry.js';
import { createFakerEngine } from './faker-engine.js';
import { EngineError } from './errors.js';
import { hashSeed, mulberry32 } from './rng.js';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

/** A reference placeholder embedded into a row by resolveSchema; runSet replaces it. */
export interface RefPlaceholder {
  readonly __ref: true;
  readonly toSchemaKey: string;
  readonly fromFieldPath: string;
}

export function isRefPlaceholder(v: unknown): v is RefPlaceholder {
  return Boolean(v && typeof v === 'object' && (v as { __ref?: unknown }).__ref === true);
}

export interface ResolvedRow {
  readonly __schemaKey: string;
  readonly __id: string;
  readonly [field: string]: unknown;
}

export interface ResolveSchemaParams {
  schema: Schema;
  count: number;
  salt: string;
  locale: string;
  customFunctions: CustomFunctionRegistry;
  sandbox: SandboxPool;
}

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;
const FN_RE = /^\$fn:(cfn_[A-Za-z0-9_-]{16})$/;

/** Length of inline arrays when the SchemaProp has no count knob (v1 constant). */
const DEFAULT_ARRAY_LENGTH = 3;

export async function resolveSchema(params: ResolveSchemaParams): Promise<ResolvedRow[]> {
  const { schema, count, salt, locale, customFunctions, sandbox } = params;
  if (!Number.isInteger(count) || count < 0) {
    throw new EngineError('resolve_schema_bad_count', { count });
  }

  const fakerEngine = createFakerEngine(locale);
  fakerEngine.seed(hashSeed(salt, schema.key));

  const out: ResolvedRow[] = [];
  for (let i = 0; i < count; i++) {
    const rowId = `${salt}:${schema.key}:${i}`;
    const rowRng = mulberry32(hashSeed(salt, schema.key, String(i)));

    const fields: Record<string, unknown> = {};
    for (const p of schema.properties) {
      fields[p.name] = await resolveProp(p, {
        schemaKey: schema.key,
        fakerEngine,
        rowRng,
        salt,
        locale,
        rowIndex: i,
        customFunctions,
        sandbox,
        fieldPath: p.name,
      });
    }
    out.push({ __schemaKey: schema.key, __id: rowId, ...fields });
  }
  return out;
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

  // Primitive type — resolve via the `faker` string.
  if (typeof p.faker !== 'string' || p.faker.length === 0) {
    return null;
  }

  const refMatch = p.faker.match(REF_RE);
  if (refMatch) {
    const ref: RefPlaceholder = {
      __ref: true,
      toSchemaKey: refMatch[1]!,
      fromFieldPath: ctx.fieldPath,
    };
    return ref;
  }

  const fnMatch = p.faker.match(FN_RE);
  if (fnMatch) {
    const fnId = fnMatch[1]!;
    const entry = ctx.customFunctions.get(fnId);
    if (!entry) {
      throw new EngineError('fn_target_missing', { fieldPath: ctx.fieldPath, functionId: fnId });
    }
    if (entry.usage === 'strategy') {
      throw new EngineError('fn_usage_mismatch', {
        fieldPath: ctx.fieldPath,
        functionId: fnId,
        usage: entry.usage,
      });
    }
    // Sandbox can't structured-clone faker/rng. Send seeds; the worker
    // reconstructs a faker instance and an rng function and attaches them to
    // ctx before invoking.
    const seedBase = hashSeed(ctx.salt, ctx.schemaKey, String(ctx.rowIndex), ctx.fieldPath);
    const callerCtx = {
      __fakerSeed: seedBase,
      __fakerLocale: ctx.locale,
      __rngSeed: seedBase ^ 0x9e3779b9,
      salt: ctx.salt,
    };
    return ctx.sandbox.invoke(entry.source, callerCtx);
  }

  return ctx.fakerEngine.call(p.faker);
}
