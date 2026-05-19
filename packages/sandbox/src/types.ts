export interface SandboxPoolOptions {
  /** Number of pre-warmed worker threads in the pool. */
  size: number;
  /** Per-call wall-clock budget. The worker enforces it via `vm`'s `timeout`. */
  perCallTimeoutMs: number;
  /** Per-worker memory cap. Forwarded as `resourceLimits.maxOldGenerationSizeMb`. */
  memoryCapMb: number;
}

export interface SandboxInvokeOptions {
  /** Override the pool-wide per-call timeout for a single call. */
  timeoutMs?: number;
}

export interface SandboxPool {
  /**
   * Compile `source` inside a worker's `vm.Context` and invoke it with `args`.
   * The function in the source must be the *default export expression*, i.e.
   * the source is treated as `(args) => <expression-or-body>`.
   *
   * Throws if the call exceeds the timeout, the source can't be compiled,
   * or the function throws.
   */
  invoke(source: string, args: unknown, opts?: SandboxInvokeOptions): Promise<unknown>;
  /** Drain in-flight calls and terminate all worker threads. Idempotent. */
  shutdown(): Promise<void>;
}

export class SandboxTimeoutError extends Error {
  override readonly name = 'SandboxTimeoutError';
}

export class SandboxCompileError extends Error {
  override readonly name = 'SandboxCompileError';
}

export class SandboxRuntimeError extends Error {
  override readonly name = 'SandboxRuntimeError';
}
