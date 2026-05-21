import type { Api } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];
type SchemaProp = Api.components['schemas']['SchemaProp'];

export type FakerIndex = ReadonlyMap<string, string | undefined>;

export interface RefEdgeInput {
  fromSchemaKey: string;
  fromFieldPath: string;
  targetKey: string;
  targetField: string | undefined;
}

export type EdgeClass =
  | { hard: false }
  | { hard: true; kind: 'embedding' | 'field_deadlock' };

const REF_RE = /^\$ref:([a-z][a-z0-9-]{0,39})(?:\.([a-zA-Z_$][a-zA-Z0-9_$.]{0,128}))?$/;

export function buildFakerIndex(schemas: ReadonlyArray<Schema>): FakerIndex {
  const out = new Map<string, string | undefined>();
  for (const s of schemas) {
    walkProps(s.properties ?? [], '', (path, faker) => {
      out.set(`${s.key}:${path}`, faker);
    });
  }
  return out;
}

function walkProps(
  props: ReadonlyArray<SchemaProp>,
  prefix: string,
  visit: (path: string, faker: string | undefined) => void,
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
        visit(path, typeof p.items.faker === 'string' ? p.items.faker : undefined);
      }
      continue;
    }
    visit(path, typeof p.faker === 'string' ? p.faker : undefined);
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

  const faker = fakerIndex.get(key);
  if (!faker) return { hard: false };

  const m = REF_RE.exec(faker);
  if (!m) return { hard: false };

  const nextKey = m[1]!;
  const nextField = m[2];
  if (!nextField) return { hard: true, kind: 'embedding' };

  trace.add(key);
  return follow(nextKey, nextField, fakerIndex, trace);
}
