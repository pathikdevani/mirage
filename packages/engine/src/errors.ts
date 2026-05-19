/**
 * Stable error types thrown by the engine. Callers should branch on
 * `err instanceof NotImplementedError` rather than parsing messages.
 */

export class NotImplementedError extends Error {
  override readonly name = 'NotImplementedError';
  constructor(what: string) {
    super(`${what} is not implemented yet`);
  }
}

export class EngineError extends Error {
  override readonly name = 'EngineError';
}
