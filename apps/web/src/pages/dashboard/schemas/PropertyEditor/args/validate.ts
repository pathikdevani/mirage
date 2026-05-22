import type { MethodEntry } from '@mirage/fakerjs';
import type { ArgsInternal } from './serialize.js';

export interface ValidationIssue {
  paramName?: string;
  message: string;
}

/** Returns the first issue found, or null if everything is valid. */
export function validateArgs(
  entry: MethodEntry | undefined,
  internal: ArgsInternal,
): ValidationIssue | null {
  if (!entry || entry.shape === 'none') return null;

  // 1. min/max pairs (when both are set on the same entry).
  const minP = entry.params.find((p) => p.name === 'min');
  const maxP = entry.params.find((p) => p.name === 'max');
  if (minP && maxP) {
    const min = internal['min'];
    const max = internal['max'];
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      return { paramName: 'max', message: 'max must be ≥ min' };
    }
  }

  // 2. enum values must be in the allowed list.
  for (const p of entry.params) {
    if (p.kind !== 'enum') continue;
    const v = internal[p.name];
    if (v === undefined || v === '') continue;
    if (!p.options?.includes(String(v))) {
      return {
        paramName: p.name,
        message: `${p.name} must be one of: ${p.options?.join(', ') ?? ''}`,
      };
    }
  }

  // 3. Positional required-by-position: when a param at index N is set, all
  // params at index <N must also be set (otherwise the array would have holes).
  if (entry.shape === 'positional') {
    let seenSet = false;
    for (let i = entry.params.length - 1; i >= 0; i--) {
      const v = internal[entry.params[i]!.name];
      const isSet = v !== undefined && v !== '';
      if (isSet) seenSet = true;
      else if (seenSet) {
        return {
          paramName: entry.params[i]!.name,
          message: `${entry.params[i]!.name} is required when later positional args are set`,
        };
      }
    }
  }

  return null;
}
