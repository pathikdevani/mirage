import type { MethodEntry, Param } from '@mirage/fakerjs';
import type { ValueExpr, ValueSegment } from '@mirage/types';

/**
 * Each arg slot internally is a `ValueExpr` — the same chip-based expression
 * the row's main faker cell uses. For `array`-kind params, each element of the
 * array is itself a `ValueExpr`, letting the user mix literal values and
 * sibling/method/ref/fn chips per element.
 */
export type ArgInternal = ValueExpr | ValueExpr[];
export type ArgsInternal = Record<string, ArgInternal | undefined>;

/**
 * Storage shape on the wire. Each slot is either a `ValueExpr` / `ValueExpr[]`
 * (the new format) or a literal value (the legacy format we still accept on
 * the read path so old schemas keep working). The editor always emits the new
 * format on save.
 */
export type ArgsStored = Record<string, unknown> | unknown[];

const SEGMENT_KINDS = new Set(['text', 'field', 'method', 'ref', 'fn']);

export function isValueSegment(v: unknown): v is ValueSegment {
  if (!v || typeof v !== 'object') return false;
  const kind = (v as { kind?: unknown }).kind;
  return typeof kind === 'string' && SEGMENT_KINDS.has(kind);
}

export function isValueExpr(v: unknown): v is ValueExpr {
  return Array.isArray(v) && v.length > 0 && v.every(isValueSegment);
}

/** Lift a legacy literal value into a single-text-segment ValueExpr. */
export function liftLiteralToExpr(v: unknown): ValueExpr {
  if (v === undefined || v === null) return [];
  if (typeof v === 'string') return v === '' ? [] : [{ kind: 'text', text: v }];
  return [{ kind: 'text', text: String(v) }];
}

function liftStoredArg(param: Param, stored: unknown): ArgInternal {
  if (param.kind === 'array') {
    if (Array.isArray(stored) && !isValueExpr(stored)) {
      // legacy literal array of strings/numbers/etc — lift each element
      return stored.map((el) => (isValueExpr(el) ? el : liftLiteralToExpr(el)));
    }
    if (Array.isArray(stored)) {
      // wire format already an array of ValueExprs (or a single ValueExpr,
      // which we wrap so the editor sees one element)
      if (stored.every(isValueExpr)) return stored;
      // mixed array — lift literals, keep exprs
      return (stored as unknown[]).map((el) =>
        isValueExpr(el) ? el : liftLiteralToExpr(el),
      );
    }
    return [];
  }
  if (isValueExpr(stored)) return stored;
  return liftLiteralToExpr(stored);
}

/** Stored shape → editor-internal `{name: ValueExpr | ValueExpr[]}`. */
export function toInternal(
  entry: MethodEntry | undefined,
  stored: ArgsStored | undefined,
): ArgsInternal {
  if (!entry) return {};
  if (!stored) return {};
  const out: ArgsInternal = {};
  if (Array.isArray(stored)) {
    entry.params.forEach((p, i) => {
      if (i < stored.length && stored[i] !== undefined) {
        out[p.name] = liftStoredArg(p, stored[i]);
      }
    });
    return out;
  }
  for (const p of entry.params) {
    const v = (stored as Record<string, unknown>)[p.name];
    if (v !== undefined) out[p.name] = liftStoredArg(p, v);
  }
  return out;
}

function isEmpty(arg: ArgInternal | undefined): boolean {
  if (arg === undefined) return true;
  if (Array.isArray(arg) && arg.length === 0) return true;
  // ArgInternal that is a ValueExpr is non-empty by construction (canonicalize
  // strips empty text segments). A ValueExpr[] is empty if every entry is empty.
  if (Array.isArray(arg) && arg.every((x) => Array.isArray(x) && x.length === 0)) return true;
  return false;
}

/** Editor-internal → stored shape (object for options, array for positional). */
export function toStored(
  entry: MethodEntry | undefined,
  internal: ArgsInternal,
): ArgsStored | undefined {
  if (!entry || entry.shape === 'none') return undefined;
  const cleaned: Record<string, ArgInternal> = {};
  for (const p of entry.params) {
    const v = internal[p.name];
    if (isEmpty(v)) continue;
    cleaned[p.name] = v as ArgInternal;
  }
  if (Object.keys(cleaned).length === 0) return undefined;

  if (entry.shape === 'options') {
    return cleaned as ArgsStored;
  }

  const arr: unknown[] = [];
  let lastDefinedIdx = -1;
  entry.params.forEach((p, i) => {
    if (cleaned[p.name] !== undefined) {
      arr[i] = cleaned[p.name];
      lastDefinedIdx = i;
    }
  });
  if (lastDefinedIdx < 0) return undefined;
  return arr.slice(0, lastDefinedIdx + 1);
}

/**
 * If the expression is a single text segment, return its raw text — useful for
 * legacy-style validation (min/max, enum membership) which only applies when
 * the user typed a literal value rather than referencing another field.
 */
export function exprAsLiteral(expr: ValueExpr | undefined): string | undefined {
  if (!expr || expr.length !== 1) return undefined;
  const s = expr[0]!;
  return s.kind === 'text' ? s.text : undefined;
}
