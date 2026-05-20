/**
 * Stable error types thrown by the engine. Callers should branch on
 * `err instanceof EngineError` and dispatch on `err.code`.
 */

export class NotImplementedError extends Error {
  override readonly name = 'NotImplementedError';
  constructor(what: string) {
    super(`${what} is not implemented yet`);
  }
}

export class EngineError extends Error {
  override readonly name = 'EngineError';
  readonly code: string;
  readonly detail: unknown;
  constructor(code: string, detail?: unknown) {
    super(`${code}: ${JSON.stringify(detail ?? null)}`);
    this.code = code;
    this.detail = detail;
  }
}
