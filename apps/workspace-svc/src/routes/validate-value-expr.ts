import type { Api, ValueExpr } from '@mirage/types';
import { FAKER_CATALOG } from '@mirage/fakerjs';

type SchemaProp = Api.components['schemas']['SchemaProp'];

export interface ValidationError {
  code: string;
  message: string;
  detail?: unknown;
}

const MAX_VALUE_BYTES = 16 * 1024;

function err(code: string, message: string, detail?: unknown): ValidationError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

/**
 * Per-property validation of a `ValueExpr`. Checks only what is self-contained
 * in the segments — does NOT verify cross-schema ref targets exist, or that
 * fn ids resolve. Those checks live in the schema route, where the workspace
 * graph is available.
 */
export function validateValueExpr(p: SchemaProp): ValidationError | null {
  const value = p.value as ValueExpr | undefined;
  if (value === undefined) return null;

  if (!Array.isArray(value) || value.length === 0) {
    return err('value_empty', `value must be a non-empty array on property "${p.name}".`, {
      name: p.name,
    });
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return err(
      'value_not_serializable',
      `value is not JSON-serializable on property "${p.name}".`,
      { name: p.name },
    );
  }
  if (serialized.length > MAX_VALUE_BYTES) {
    return err('value_too_large', `value exceeds 16 KB on property "${p.name}".`, {
      name: p.name,
      size: serialized.length,
    });
  }

  for (const seg of value) {
    if (seg.kind === 'method') {
      const entry = FAKER_CATALOG[seg.method];
      if (!entry) {
        return err(
          'value_method_unknown',
          `Unknown faker method "${seg.method}" on property "${p.name}".`,
          { name: p.name, method: seg.method },
        );
      }
      const args = seg.args;
      if (args !== undefined && (typeof args !== 'object' || args === null)) {
        return err(
          'value_args_invalid_shape',
          `method args must be an object or array on property "${p.name}".`,
          { name: p.name, method: seg.method },
        );
      }
    }
  }

  return null;
}
