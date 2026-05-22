import type { SchemaProp } from './types.js';
import { PROP_NAME_RE } from './types.js';
import { extractCrossSchemaRefs, extractFieldRefs } from '@mirage/types';

export type ValidationIssue =
  | { kind: 'name_invalid'; path: string }
  | { kind: 'name_duplicate'; path: string; sibling: string }
  | { kind: 'ref_target_missing'; path: string; targetKey: string }
  | { kind: 'tpl_field_missing'; path: string; target: string }
  | { kind: 'tpl_field_container'; path: string; target: string }
  | { kind: 'tpl_field_dotted_missing'; path: string; target: string }
  | { kind: 'tpl_cycle'; path: string };

export function validateTree(
  rows: SchemaProp[],
  availableKeys: ReadonlySet<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const walk = (props: SchemaProp[], path: string): void => {
    const seen = new Set<string>();
    for (const p of props) {
      const here = path ? `${path}.${p.name}` : p.name;
      if (typeof p.name !== 'string' || !PROP_NAME_RE.test(p.name)) {
        issues.push({ kind: 'name_invalid', path: here });
      }
      if (seen.has(p.name)) {
        issues.push({ kind: 'name_duplicate', path: here, sibling: p.name });
      } else {
        seen.add(p.name);
      }
      if (Array.isArray(p.value)) {
        for (const fieldRef of extractFieldRefs(p.value)) {
          checkFieldRef(here, fieldRef, props, issues);
        }
        for (const refTarget of extractCrossSchemaRefs(p.value)) {
          const dot = refTarget.indexOf('.');
          const key = dot < 0 ? refTarget : refTarget.slice(0, dot);
          if (!availableKeys.has(key)) {
            issues.push({ kind: 'ref_target_missing', path: here, targetKey: key });
          }
        }
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, here);
      if (p.type === 'array' && p.items) {
        if (p.items.type === 'object' && Array.isArray(p.items.fields)) {
          walk(p.items.fields, `${here}[]`);
        } else if (p.items.type === 'array' && p.items.items) {
          walk([p.items], `${here}[]`);
        }
      }
    }
  };
  walk(rows, '');

  for (const path of findCycles(rows)) {
    issues.push({ kind: 'tpl_cycle', path });
  }

  return issues;
}

function checkFieldRef(
  ownerPath: string,
  fieldRef: string,
  siblings: SchemaProp[],
  issues: ValidationIssue[],
): void {
  const parts = fieldRef.split('.');
  const head = parts[0]!;
  const target = siblings.find((s) => s.name === head);
  if (!target) {
    issues.push({ kind: 'tpl_field_missing', path: ownerPath, target: fieldRef });
    return;
  }
  if (parts.length === 1) {
    if (target.type === 'object' || target.type === 'array') {
      issues.push({ kind: 'tpl_field_container', path: ownerPath, target: fieldRef });
    }
    return;
  }
  let cursor: SchemaProp | undefined = target;
  for (let i = 1; i < parts.length; i++) {
    if (!cursor || cursor.type !== 'object' || !Array.isArray(cursor.fields)) {
      issues.push({ kind: 'tpl_field_dotted_missing', path: ownerPath, target: fieldRef });
      return;
    }
    cursor = cursor.fields.find((f) => f.name === parts[i]);
  }
  if (!cursor) {
    issues.push({ kind: 'tpl_field_dotted_missing', path: ownerPath, target: fieldRef });
  }
}

/** Tarjan SCC over top-level rows. Returns row names that participate in a cycle. */
function findCycles(rows: SchemaProp[]): string[] {
  const adj = new Map<string, string[]>();
  for (const r of rows) {
    if (!Array.isArray(r.value)) {
      adj.set(r.name, []);
      continue;
    }
    adj.set(
      r.name,
      extractFieldRefs(r.value).map((f) => f.split('.')[0]!),
    );
  }

  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const inCycle = new Set<string>();

  const strongconnect = (v: string): void => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w) ?? Infinity));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }

    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      const selfLoop = (adj.get(v) ?? []).includes(v);
      if (scc.length > 1 || selfLoop) {
        for (const n of scc) inCycle.add(n);
      }
    }
  };

  for (const r of rows) if (!idx.has(r.name)) strongconnect(r.name);
  return [...inCycle].sort();
}
