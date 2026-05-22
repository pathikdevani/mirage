import type { Api, ValueExpr } from '@mirage/types';
import { isPureRef } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

export type FakerIndex = ReadonlyMap<string, ValueExpr | undefined>;

export interface RefEdgeInput {
  fromSchemaKey: string;
  fromFieldPath: string;
  targetKey: string;
  targetField: string | undefined;
}

export type EdgeClass =
  | { hard: false }
  | { hard: true; kind: 'embedding' | 'field_deadlock' };

export function buildFakerIndex(schemas: ReadonlyArray<Schema>): FakerIndex {
  const out = new Map<string, ValueExpr | undefined>();
  for (const s of schemas) {
    walkProps(s.properties ?? [], '', (path, value) => {
      out.set(`${s.key}:${path}`, value);
    });
  }
  return out;
}

function walkProps(
  props: ReadonlyArray<SchemaProp>,
  prefix: string,
  visit: (path: string, value: ValueExpr | undefined) => void,
): void {
  for (const p of props) {
    const path = prefix ? `${prefix}.${p.name}` : p.name;
    if (p.type === 'object' && Array.isArray(p.fields)) {
      walkProps(p.fields, path, visit);
      continue;
    }
    if (p.type === 'array' && p.items) {
      if (p.items.type === 'object' && Array.isArray(p.items.fields)) {
        walkProps(p.items.fields, path, visit);
      } else {
        visit(path, Array.isArray(p.items.value) ? p.items.value : undefined);
      }
      continue;
    }
    visit(path, Array.isArray(p.value) ? p.value : undefined);
  }
}

export function classifyRefEdge(edge: RefEdgeInput, fakerIndex: FakerIndex): EdgeClass {
  if (edge.targetField === undefined) {
    return { hard: true, kind: 'embedding' };
  }
  const trace = new Set<string>();
  trace.add(`${edge.fromSchemaKey}:${edge.fromFieldPath}`);
  return follow(edge.targetKey, edge.targetField, fakerIndex, trace);
}

function follow(
  schemaKey: string,
  fieldPath: string,
  fakerIndex: FakerIndex,
  trace: Set<string>,
): EdgeClass {
  const key = `${schemaKey}:${fieldPath}`;
  if (trace.has(key)) {
    return { hard: true, kind: 'field_deadlock' };
  }

  const value = fakerIndex.get(key);
  if (!value) return { hard: false };
  if (!isPureRef(value)) return { hard: false };

  const target = value[0].target;
  const dot = target.indexOf('.');
  const nextKey = dot < 0 ? target : target.slice(0, dot);
  const nextField = dot < 0 ? undefined : target.slice(dot + 1);
  if (!nextField) return { hard: true, kind: 'embedding' };

  trace.add(key);
  return follow(nextKey, nextField, fakerIndex, trace);
}
