export interface ServerError {
  error?: string;
  code?: string;
  detail?: unknown;
}

export interface ServerErrorTargets {
  setNameError: (msg: string | null) => void;
  setKeyError: (msg: string | null) => void;
  setSchemasError: (msg: string | null) => void;
  setOutputError: (msg: string | null) => void;
  setStrategiesError: (msg: string | null) => void;
  setGenericBanner: (msg: string | null) => void;
  setStep?: (step: 1 | 2 | 3) => void;
}

/** Maps `{ code, message }` returned by workspace-svc to per-field UI errors. */
export function makeSetServerErrorHandler(t: ServerErrorTargets) {
  return (e: ServerError | unknown) => {
    const err = (e ?? {}) as ServerError;
    const code = err.code ?? 'unknown';
    const msg = err.error ?? 'Something went wrong.';
    switch (code) {
      case 'name_required':
        t.setNameError(msg);
        t.setStep?.(1);
        return;
      case 'key_invalid':
      case 'key_taken':
        t.setKeyError(msg);
        t.setStep?.(1);
        return;
      case 'salt_invalid':
        t.setGenericBanner(msg);
        t.setStep?.(1);
        return;
      case 'schemas_empty':
      case 'schema_inclusion_invalid':
      case 'schema_missing':
        t.setSchemasError(msg);
        t.setStep?.(2);
        return;
      case 'strategies_invalid':
      case 'strategy_override_invalid':
        t.setStrategiesError(msg);
        return;
      case 'output_invalid':
        t.setOutputError(msg);
        return;
      case 'stale_update':
        t.setGenericBanner('This Set was modified elsewhere — reload to see the latest version.');
        return;
      default:
        t.setGenericBanner(msg);
    }
  };
}
