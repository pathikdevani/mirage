import { useCallback, useMemo, useState } from 'react';
import type { Schema, SchemaProp } from '../lib/types.js';
import { findRefs } from '../lib/treeStats.js';

export type StructuralChange =
  | { kind: 'key_renamed'; from: string; to: string; affectedSchemas: string[] }
  | { kind: 'prop_removed'; path: string; referrers: Array<{ schemaKey: string; refPath: string }> }
  | { kind: 'type_narrowed'; path: string; from: SchemaProp['type']; to: SchemaProp['type'] };

export interface SchemaBuffer {
  original: Schema;
  draft: Schema;
  setDraft: (next: Schema | ((prev: Schema) => Schema)) => void;
  /** Replace the baseline without touching the draft. Used after a stale-update reload. */
  setOriginal: (next: Schema) => void;
  getByPath: (path: string) => SchemaProp | null;
  updateByPath: (path: string, mutator: (prop: SchemaProp) => SchemaProp) => void;
  removeByPath: (path: string) => void;
  duplicateByPath: (path: string) => string | null;
  isDirty: boolean;
  diff: (workspaceSchemas: Schema[]) => StructuralChange[];
  reset: () => void;
}

interface FieldSegment {
  kind: 'field';
  name: string;
}
interface ItemSegment {
  kind: 'item';
}
type Segment = FieldSegment | ItemSegment;

function parsePath(path: string): Segment[] {
  if (!path) return [];
  const out: Segment[] = [];
  for (const part of path.split('.')) {
    let p = part;
    // Trailing '[]' indicates the previous field's array-item child.
    while (p.endsWith('[]')) {
      const name = p.slice(0, -2);
      if (name) out.push({ kind: 'field', name });
      out.push({ kind: 'item' });
      p = '';
    }
    if (p) out.push({ kind: 'field', name: p });
  }
  return out;
}

function resolve(properties: SchemaProp[], segments: Segment[]): SchemaProp | null {
  if (segments.length === 0) return null;
  let cursor: SchemaProp | null = null;
  let arr: SchemaProp[] | null = properties;
  for (const seg of segments) {
    if (seg.kind === 'field') {
      if (!arr) return null;
      const found: SchemaProp | undefined = arr.find((p) => p.name === seg.name);
      if (!found) return null;
      cursor = found;
      if (found.type === 'object' && Array.isArray(found.fields)) arr = found.fields;
      else arr = null;
    } else {
      // 'item' — descend into array items.
      if (cursor === null || cursor.type !== 'array' || !cursor.items) return null;
      const next: SchemaProp = cursor.items;
      cursor = next;
      if (next.type === 'object' && Array.isArray(next.fields)) arr = next.fields;
      else arr = null;
    }
  }
  return cursor;
}

function indexTreeByPath(properties: SchemaProp[]): Map<string, SchemaProp> {
  const m = new Map<string, SchemaProp>();
  const walk = (props: SchemaProp[], basePath: string, parentKind: 'object' | 'array'): void => {
    for (const p of props) {
      const path = parentKind === 'array' ? `${basePath}[]` : basePath ? `${basePath}.${p.name}` : p.name;
      m.set(path, p);
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, path, 'object');
      else if (p.type === 'array' && p.items) walk([p.items], path, 'array');
    }
  };
  walk(properties, '', 'object');
  return m;
}

export function useSchemaBuffer(initial: Schema): SchemaBuffer {
  const [original, setOriginalState] = useState<Schema>(initial);
  const [draft, setDraftState] = useState<Schema>(() => structuredClone(initial));

  const setDraft: SchemaBuffer['setDraft'] = useCallback((next) => {
    setDraftState((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  const setOriginal = useCallback((next: Schema) => {
    setOriginalState(next);
  }, []);

  const getByPath = useCallback(
    (path: string): SchemaProp | null => resolve(draft.properties, parsePath(path)),
    [draft],
  );

  const updateByPath = useCallback(
    (path: string, mutator: (prop: SchemaProp) => SchemaProp): void => {
      setDraftState((prev) => {
        const nextSchema = structuredClone(prev);
        const segs = parsePath(path);
        const target = resolve(nextSchema.properties, segs);
        if (!target) return prev;
        const mutated = mutator(target);
        // Patch the resolved node in-place. The resolve walk already touched the
        // spine via structuredClone above, so the parent reference is fresh.
        Object.keys(target).forEach((k) => delete (target as Record<string, unknown>)[k]);
        Object.assign(target, mutated);
        return nextSchema;
      });
    },
    [],
  );

  const removeByPath = useCallback((path: string): void => {
    setDraftState((prev) => {
      const nextSchema = structuredClone(prev);
      const segs = parsePath(path);
      if (segs.length === 0) return prev;
      const last = segs[segs.length - 1];
      // Removing the array-item itself is not supported through this API.
      if (last && last.kind === 'item') return prev;
      const parentSegs = segs.slice(0, -1);
      // Determine the parent array we're modifying.
      let parentArr: SchemaProp[] | null;
      if (parentSegs.length === 0) {
        parentArr = nextSchema.properties;
      } else {
        const parentNode = resolve(nextSchema.properties, parentSegs);
        if (!parentNode) return prev;
        if (parentNode.type === 'object' && Array.isArray(parentNode.fields)) {
          parentArr = parentNode.fields;
        } else {
          return prev;
        }
      }
      const targetName = (last as FieldSegment).name;
      const idx = parentArr.findIndex((p) => p.name === targetName);
      if (idx < 0) return prev;
      parentArr.splice(idx, 1);
      return nextSchema;
    });
  }, []);

  const duplicateByPath = useCallback((path: string): string | null => {
    let newPath: string | null = null;
    setDraftState((prev) => {
      const nextSchema = structuredClone(prev);
      const segs = parsePath(path);
      if (segs.length === 0) return prev;
      const last = segs[segs.length - 1];
      if (!last || last.kind === 'item') return prev;
      const parentSegs = segs.slice(0, -1);
      let parentArr: SchemaProp[] | null;
      if (parentSegs.length === 0) {
        parentArr = nextSchema.properties;
      } else {
        const parentNode = resolve(nextSchema.properties, parentSegs);
        if (!parentNode || parentNode.type !== 'object' || !Array.isArray(parentNode.fields)) {
          return prev;
        }
        parentArr = parentNode.fields;
      }
      const targetName = last.name;
      const target = parentArr.find((p) => p.name === targetName);
      if (!target) return prev;
      const existingNames = new Set(parentArr.map((p) => p.name));
      let candidate = `${target.name}Copy`;
      let i = 2;
      while (existingNames.has(candidate)) {
        candidate = `${target.name}Copy${i++}`;
      }
      const clone: SchemaProp = { ...structuredClone(target), name: candidate };
      const idx = parentArr.findIndex((p) => p.name === targetName);
      parentArr.splice(idx + 1, 0, clone);
      newPath = parentSegs.length === 0
        ? candidate
        : `${path.slice(0, path.lastIndexOf('.'))}.${candidate}`;
      // Edge case: when parentSegs.length === 0, path is just the name.
      if (parentSegs.length === 0) newPath = candidate;
      return nextSchema;
    });
    return newPath;
  }, []);

  const isDirty = useMemo(() => JSON.stringify(original) !== JSON.stringify(draft), [original, draft]);

  const diff = useCallback(
    (workspaceSchemas: Schema[]): StructuralChange[] => {
      const out: StructuralChange[] = [];

      // 1. key rename
      if (draft.key !== original.key) {
        const affected: string[] = [];
        for (const s of workspaceSchemas) {
          if (s.id === original.id) continue;
          const refs = findRefs(s.properties);
          if (refs.some((r) => r.targetKey === original.key)) affected.push(s.key);
        }
        out.push({
          kind: 'key_renamed',
          from: original.key,
          to: draft.key,
          affectedSchemas: affected,
        });
      }

      // 2. structural diff over property tree
      const before = indexTreeByPath(original.properties);
      const after = indexTreeByPath(draft.properties);

      // referrers index — schemas that point at `$ref:<original.key>.<somepath>`
      const referrersFor = (propPath: string): Array<{ schemaKey: string; refPath: string }> => {
        const out2: Array<{ schemaKey: string; refPath: string }> = [];
        for (const s of workspaceSchemas) {
          if (s.id === original.id) continue;
          for (const r of findRefs(s.properties)) {
            if (r.targetKey === original.key && r.targetField === propPath) {
              out2.push({ schemaKey: s.key, refPath: r.path });
            }
          }
        }
        return out2;
      };

      for (const [path, prop] of before) {
        const next = after.get(path);
        if (!next) {
          // Path no longer exists in draft — removal (or its parent was removed; we still surface it).
          out.push({ kind: 'prop_removed', path, referrers: referrersFor(path) });
          continue;
        }
        if (next.type !== prop.type) {
          out.push({ kind: 'type_narrowed', path, from: prop.type, to: next.type });
        }
      }

      return out;
    },
    [original, draft],
  );

  const reset = useCallback(() => {
    setDraftState(structuredClone(original));
  }, [original]);

  return {
    original,
    draft,
    setDraft,
    setOriginal,
    getByPath,
    updateByPath,
    removeByPath,
    duplicateByPath,
    isDirty,
    diff,
    reset,
  };
}
