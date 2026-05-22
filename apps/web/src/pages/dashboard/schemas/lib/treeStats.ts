import type { SchemaProp } from './types.js';
import { extractCrossSchemaRefs } from '@mirage/types';

export interface TreeStats {
  total: number;
  required: number;
  refs: number;
  maxDepth: number;
}

export function countTreeStats(properties: SchemaProp[]): TreeStats {
  let total = 0;
  let required = 0;
  let refs = 0;
  let maxDepth = 0;

  const walk = (props: SchemaProp[], depth: number): void => {
    if (props.length > 0) maxDepth = Math.max(maxDepth, depth);
    for (const p of props) {
      total++;
      if (p.required) required++;
      if (Array.isArray(p.value)) refs += extractCrossSchemaRefs(p.value).length;
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, depth + 1);
      if (p.type === 'array' && p.items) walk([p.items], depth + 1);
    }
  };
  walk(properties, 1);
  return { total, required, refs, maxDepth };
}

/** Flat list of every cross-schema `ref` segment in the tree with its dotted path. */
export function findRefs(
  properties: SchemaProp[],
): { path: string; targetKey: string; targetField: string }[] {
  const out: { path: string; targetKey: string; targetField: string }[] = [];
  const walk = (props: SchemaProp[], path: string): void => {
    for (const p of props) {
      const nextPath = path ? `${path}.${p.name}` : p.name;
      if (Array.isArray(p.value)) {
        for (const target of extractCrossSchemaRefs(p.value)) {
          const dot = target.indexOf('.');
          if (dot < 0) continue;
          out.push({
            path: nextPath,
            targetKey: target.slice(0, dot),
            targetField: target.slice(dot + 1),
          });
        }
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, nextPath);
      if (p.type === 'array' && p.items) walk([p.items], `${nextPath}[]`);
    }
  };
  walk(properties, '');
  return out;
}
