import type { SchemaProp } from './types.js';
import { PROP_NAME_RE, REF_PREFIX } from './types.js';

export type ValidationIssue =
  | { kind: 'name_invalid'; path: string }
  | { kind: 'name_duplicate'; path: string; sibling: string }
  | { kind: 'ref_target_missing'; path: string; targetKey: string };

/**
 * Validates the builder tree. Returns the first issue per row (we don't aggregate
 * across the tree; the UI only highlights one error per row at a time).
 */
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
      if (typeof p.faker === 'string' && p.faker.startsWith(REF_PREFIX)) {
        const ref = p.faker.slice(REF_PREFIX.length);
        const dot = ref.indexOf('.');
        const targetKey = dot < 0 ? ref : ref.slice(0, dot);
        if (!availableKeys.has(targetKey)) {
          issues.push({ kind: 'ref_target_missing', path: here, targetKey });
        }
      }
      if (p.type === 'object' && Array.isArray(p.fields)) walk(p.fields, here);
      if (p.type === 'array' && p.items) {
        // items is a synthetic single child — recurse with its own subtree
        if (p.items.type === 'object' && Array.isArray(p.items.fields)) {
          walk(p.items.fields, `${here}[]`);
        } else if (p.items.type === 'array' && p.items.items) {
          // peel one level
          walk([p.items], `${here}[]`);
        }
      }
    }
  };
  walk(rows, '');
  return issues;
}
