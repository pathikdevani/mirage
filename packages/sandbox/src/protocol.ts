/**
 * Wire protocol between the sandbox pool (main thread) and a sandbox worker
 * (`worker_threads`). Both sides agree on these message shapes; nothing else
 * crosses the boundary.
 */

export interface SandboxInvokeMessage {
  type: 'invoke';
  /** Caller-chosen id for matching responses to requests. */
  callId: string;
  /** sha1(source).slice(0, 12) — used as the cache key inside the worker. */
  sourceHash: string;
  /**
   * The function source. Null when the pool believes the worker already has
   * `sourceHash` cached; the worker responds with a `CacheMiss` error if it
   * doesn't, prompting the pool to resend with `source` populated.
   */
  source: string | null;
  /** Argument object passed to the function. Must be structured-cloneable. */
  args: unknown;
  /** Per-call wall-clock limit (ms). The worker passes this to `vm`'s `timeout` option. */
  timeoutMs: number;
}

export interface SandboxResultMessage {
  type: 'result';
  callId: string;
  ok: true;
  value: unknown;
}

export interface SandboxErrorMessage {
  type: 'result';
  callId: string;
  ok: false;
  /**
   * Class name from the worker (e.g. `TimeoutError`, `SyntaxError`, `TypeError`).
   * The sentinel `'CacheMiss'` indicates the worker needs the source resent.
   */
  errorName: string;
  errorMessage: string;
  /** Stripped of file paths to avoid leaking worker internals. */
  stack?: string;
}

export type SandboxMessageToWorker = SandboxInvokeMessage;
export type SandboxMessageFromWorker = SandboxResultMessage | SandboxErrorMessage;
