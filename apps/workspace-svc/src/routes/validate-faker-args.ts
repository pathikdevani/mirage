import type { Api } from '@mirage/types';

type SchemaProp = Api.components['schemas']['SchemaProp'];

export interface ValidationError {
  code: string;
  message: string;
  detail?: unknown;
}

const REF_PREFIX = '$ref:';
const FN_PREFIX = '$fn:';
const MAX_FAKER_ARGS_BYTES = 4 * 1024;

function err(code: string, message: string, detail?: unknown): ValidationError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

export function validateFakerArgs(p: SchemaProp): ValidationError | null {
  const args = (p as SchemaProp & { fakerArgs?: unknown }).fakerArgs;
  if (args === undefined) return null;
  const faker = p.faker;
  if (typeof faker !== 'string' || faker.length === 0) {
    return err(
      'faker_args_without_faker',
      `fakerArgs requires faker to be set on property "${p.name}".`,
      { name: p.name },
    );
  }
  if (faker.startsWith(REF_PREFIX) || faker.startsWith(FN_PREFIX)) {
    return err(
      'faker_args_not_supported',
      `fakerArgs is not supported for $ref or $fn values on property "${p.name}".`,
      { name: p.name },
    );
  }
  if (typeof args !== 'object' || args === null) {
    return err(
      'faker_args_invalid_shape',
      `fakerArgs must be an object or array on property "${p.name}".`,
      { name: p.name },
    );
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(args);
  } catch {
    return err(
      'faker_args_not_serializable',
      `fakerArgs is not JSON-serializable on property "${p.name}".`,
      { name: p.name },
    );
  }
  if (serialized.length > MAX_FAKER_ARGS_BYTES) {
    return err('faker_args_too_large', `fakerArgs exceeds 4 KB on property "${p.name}".`, {
      name: p.name,
      size: serialized.length,
    });
  }
  return null;
}
