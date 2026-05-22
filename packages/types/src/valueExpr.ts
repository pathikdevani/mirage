import type { components } from './openapi.generated.js';

export type ValueExpr = components['schemas']['ValueExpr'];
export type ValueSegment = components['schemas']['ValueSegment'];

export type TextSegment = Extract<ValueSegment, { kind: 'text' }>;
export type FieldSegment = Extract<ValueSegment, { kind: 'field' }>;
export type MethodSegment = Extract<ValueSegment, { kind: 'method' }>;
export type RefSegment = Extract<ValueSegment, { kind: 'ref' }>;
export type FnSegment = Extract<ValueSegment, { kind: 'fn' }>;

export function canonicalize(v: ValueExpr): ValueExpr {
  const out: ValueSegment[] = [];
  for (const seg of v) {
    if (seg.kind === 'text') {
      if (seg.text === '') continue;
      const last = out[out.length - 1];
      if (last && last.kind === 'text') {
        out[out.length - 1] = { kind: 'text', text: last.text + seg.text };
        continue;
      }
    }
    out.push(seg);
  }
  return out;
}

export function isPureMethod(v: ValueExpr): v is [MethodSegment] {
  return v.length === 1 && v[0]!.kind === 'method';
}

export function isPureRef(v: ValueExpr): v is [RefSegment] {
  return v.length === 1 && v[0]!.kind === 'ref';
}

export function isPureFn(v: ValueExpr): v is [FnSegment] {
  return v.length === 1 && v[0]!.kind === 'fn';
}

export function extractFieldRefs(v: ValueExpr): string[] {
  return v.flatMap((s) => (s.kind === 'field' ? [s.name] : []));
}

export function extractCrossSchemaRefs(v: ValueExpr): string[] {
  return v.flatMap((s) => (s.kind === 'ref' ? [s.target] : []));
}

export function extractFnIds(v: ValueExpr): string[] {
  return v.flatMap((s) => (s.kind === 'fn' ? [s.id] : []));
}

export function extractMethods(
  v: ValueExpr,
): { method: string; args?: MethodSegment['args'] }[] {
  return v.flatMap((s) =>
    s.kind === 'method'
      ? [{ method: s.method, ...(s.args !== undefined ? { args: s.args } : {}) }]
      : [],
  );
}
