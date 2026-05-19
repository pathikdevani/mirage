import type { SandboxInvokeOptions, SandboxPool, SandboxPoolOptions } from './types.js';

/**
 * Factory for the worker-thread sandbox pool. The actual worker spin-up is
 * skeletoned for bootstrap — see TECH_ARCHITECHRE.md §3.4 for the agreed
 * implementation (`worker_threads` + `node:vm`, per-call timeout, memory cap,
 * no Node globals exposed inside the vm context).
 *
 * The public surface is stable: callers can integrate against `invoke` /
 * `shutdown` today and the worker pool will light up underneath without
 * touching call sites.
 */
export function createSandboxPool(options: SandboxPoolOptions): SandboxPool {
  if (options.size < 0 || !Number.isInteger(options.size)) {
    throw new RangeError('SandboxPool size must be a non-negative integer');
  }
  if (options.perCallTimeoutMs <= 0) {
    throw new RangeError('SandboxPool perCallTimeoutMs must be positive');
  }
  if (options.memoryCapMb <= 0) {
    throw new RangeError('SandboxPool memoryCapMb must be positive');
  }

  let shuttingDown = false;

  return {
    async invoke(_source: string, _args: unknown, _opts?: SandboxInvokeOptions): Promise<unknown> {
      if (shuttingDown) {
        throw new Error('SandboxPool is shutting down');
      }
      // TODO(post-bootstrap): post `SandboxInvokeMessage` to a free worker,
      // await `SandboxMessageFromWorker`, translate error names back into
      // SandboxTimeoutError / SandboxCompileError / SandboxRuntimeError.
      throw new Error('SandboxPool.invoke is not implemented yet');
    },
    async shutdown(): Promise<void> {
      shuttingDown = true;
      // TODO(post-bootstrap): drain in-flight calls, terminate workers.
    },
  };
}
