import type { MethodEntry } from '@mirage/fakerjs';
import type { ValueExpr } from '@mirage/types';
import { exprAsLiteral, type ArgsInternal } from './serialize.js';

export interface ValidationIssue {
  paramName?: string;
  message: string;
}

function literalNumber(expr: ValueExpr | undefined): number | undefined {
  const lit = exprAsLiteral(expr);
  if (lit === undefined) return undefined;
  const n = Number(lit);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Returns the first issue found, or null if everything is valid.
 *
 * Expression-typed args (anything that isn't a single literal text segment)
 * are skipped — their runtime value is only known at generation time, so we
 * can't enforce bounds/enum membership here without false positives.
 */
export function validateArgs(
  entry: MethodEntry | undefined,
  internal: ArgsInternal,
): ValidationIssue | null {
  if (!entry || entry.shape === 'none') return null;

  // 1. min/max pairs — only when both sides are literal numbers.
  const minP = entry.params.find((p) => p.name === 'min');
  const maxP = entry.params.find((p) => p.name === 'max');
  if (minP && maxP) {
    const min = literalNumber(internal['min'] as ValueExpr | undefined);
    const max = literalNumber(internal['max'] as ValueExpr | undefined);
    if (min !== undefined && max !== undefined && min > max) {
      return { paramName: 'max', message: 'max must be ≥ min' };
    }
  }

  // 2. enum values must be in the allowed list — only when literal.
  for (const p of entry.params) {
    if (p.kind !== 'enum') continue;
    const v = exprAsLiteral(internal[p.name] as ValueExpr | undefined);
    if (v === undefined || v === '') continue;
    if (!p.options?.includes(v)) {
      return {
        paramName: p.name,
        message: `${p.name} must be one of: ${p.options?.join(', ') ?? ''}`,
      };
    }
  }

  // 3. Positional: a set arg requires all earlier-index args to also be set.
  if (entry.shape === 'positional') {
    let seenSet = false;
    for (let i = entry.params.length - 1; i >= 0; i--) {
      const v = internal[entry.params[i]!.name];
      const isSet = v !== undefined && !(Array.isArray(v) && v.length === 0);
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
