export interface ServerError {
  error?: string;
  code?: string;
  detail?: unknown;
}

export interface ServerErrorTargets {
  setNameError: (msg: string | null) => void;
  setUsageError: (msg: string | null) => void;
  setSourceError: (msg: string | null) => void;
  setGenericBanner: (msg: string | null) => void;
}

export function makeFnServerErrorHandler(t: ServerErrorTargets) {
  return (e: ServerError | unknown) => {
    const err = (e ?? {}) as ServerError;
    const code = err.code ?? 'unknown';
    const msg = err.error ?? 'Something went wrong.';
    switch (code) {
      case 'name_invalid':
      case 'name_taken':
        t.setNameError(msg);
        return;
      case 'usage_invalid':
        t.setUsageError(msg);
        return;
      case 'source_invalid':
      case 'invalid_js':
        t.setSourceError(
          err.detail && typeof err.detail === 'object' && 'error' in err.detail
            ? `${msg}: ${String((err.detail as { error: unknown }).error)}`
            : msg,
        );
        return;
      case 'usage_in_use_as_generator':
      case 'usage_in_use_as_strategy':
        t.setGenericBanner(msg);
        return;
      case 'stale_update':
        t.setGenericBanner(
          'This Function was modified elsewhere — reload to see the latest version.',
        );
        return;
      default:
        t.setGenericBanner(msg);
    }
  };
}
