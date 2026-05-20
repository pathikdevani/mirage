import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { SandboxInvokeOptions, SandboxPool, SandboxPoolOptions } from './types.js';
import { SandboxCompileError, SandboxRuntimeError, SandboxTimeoutError } from './types.js';
import type { SandboxInvokeMessage, SandboxMessageFromWorker } from './protocol.js';

interface WorkerSlot {
  index: number;
  worker: Worker;
  busy: boolean;
  /** Hashes the worker has acknowledged via a non-CacheMiss reply. */
  cached: Set<string>;
}

interface PendingCall {
  callId: string;
  slot: WorkerSlot;
  source: string;
  sourceHash: string;
  args: unknown;
  timeoutMs: number;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  /** True if this attempt sent source: null (cache hit assumption). */
  triedCached: boolean;
}

interface QueuedCall {
  source: string;
  sourceHash: string;
  args: unknown;
  timeoutMs: number;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

function sha12(source: string): string {
  return crypto.createHash('sha1').update(source).digest('hex').slice(0, 12);
}

function spawnWorker(memoryCapMb: number): Worker {
  const url = new URL('./worker.js', import.meta.url);
  return new Worker(url, {
    resourceLimits: { maxOldGenerationSizeMb: memoryCapMb },
  });
}

export function createSandboxPool(options: SandboxPoolOptions): SandboxPool {
  if (options.size < 1 || !Number.isInteger(options.size)) {
    throw new RangeError('SandboxPool size must be a positive integer');
  }
  if (options.perCallTimeoutMs <= 0) {
    throw new RangeError('SandboxPool perCallTimeoutMs must be positive');
  }
  if (options.memoryCapMb <= 0) {
    throw new RangeError('SandboxPool memoryCapMb must be positive');
  }

  let shuttingDown = false;
  const slots: WorkerSlot[] = [];
  const queue: QueuedCall[] = [];
  const pending = new Map<string, PendingCall>();

  const drain = (): void => {
    while (queue.length > 0) {
      const free = slots.find((s) => !s.busy);
      if (!free) return;
      const q = queue.shift()!;
      dispatch(free, q);
    }
  };

  const dispatch = (slot: WorkerSlot, q: QueuedCall): void => {
    const callId = crypto.randomBytes(8).toString('hex');
    const triedCached = slot.cached.has(q.sourceHash);
    const msg: SandboxInvokeMessage = {
      type: 'invoke',
      callId,
      sourceHash: q.sourceHash,
      source: triedCached ? null : q.source,
      args: q.args,
      timeoutMs: q.timeoutMs,
    };
    const timer = setTimeout(() => {
      const call = pending.get(callId);
      if (!call) return;
      pending.delete(callId);
      call.reject(new SandboxTimeoutError(`call ${callId} timed out after ${q.timeoutMs}ms`));
      // Force-recycle the worker; its current call may still be running.
      slot.worker.terminate().catch(() => undefined);
    }, q.timeoutMs + 500);

    pending.set(callId, {
      callId,
      slot,
      source: q.source,
      sourceHash: q.sourceHash,
      args: q.args,
      timeoutMs: q.timeoutMs,
      resolve: q.resolve,
      reject: q.reject,
      timer,
      triedCached,
    });
    slot.busy = true;
    slot.worker.postMessage(msg);
  };

  const attach = (slot: WorkerSlot): void => {
    slot.worker.on('message', (msg: SandboxMessageFromWorker) => {
      const call = pending.get(msg.callId);
      if (!call) return;

      if (msg.ok === false && msg.errorName === 'CacheMiss' && !call.triedCached) {
        // Pool thought the worker had this hash but it didn't. Resend with source.
        slot.cached.delete(call.sourceHash);
        const retry: SandboxInvokeMessage = {
          type: 'invoke',
          callId: call.callId,
          sourceHash: call.sourceHash,
          source: call.source,
          args: call.args,
          timeoutMs: call.timeoutMs,
        };
        call.triedCached = true;
        slot.worker.postMessage(retry);
        return;
      }

      clearTimeout(call.timer);
      pending.delete(msg.callId);
      slot.busy = false;
      if (msg.ok === false && msg.errorName === 'CacheMiss') {
        call.reject(new SandboxRuntimeError('worker cache cleared mid-call'));
      } else if (msg.ok === true) {
        slot.cached.add(call.sourceHash);
        call.resolve(msg.value);
      } else if (msg.errorName === 'TimeoutError') {
        call.reject(new SandboxTimeoutError(msg.errorMessage));
      } else if (msg.errorName === 'SyntaxError') {
        call.reject(new SandboxCompileError(msg.errorMessage));
      } else {
        const err = new SandboxRuntimeError(`${msg.errorName}: ${msg.errorMessage}`);
        if (msg.stack) err.stack = msg.stack;
        call.reject(err);
      }
      drain();
    });
    slot.worker.on('exit', (code) => {
      if (code === 0) return;
      for (const [callId, call] of pending) {
        if (call.slot === slot) {
          clearTimeout(call.timer);
          pending.delete(callId);
          call.reject(new SandboxRuntimeError(`worker exited with code ${code}`));
        }
      }
      if (shuttingDown) return;
      slot.worker = spawnWorker(options.memoryCapMb);
      slot.cached = new Set();
      slot.busy = false;
      attach(slot);
      drain();
    });
  };

  for (let i = 0; i < options.size; i++) {
    const slot: WorkerSlot = {
      index: i,
      worker: spawnWorker(options.memoryCapMb),
      busy: false,
      cached: new Set(),
    };
    slots.push(slot);
    attach(slot);
  }

  return {
    async invoke(source: string, args: unknown, opts?: SandboxInvokeOptions): Promise<unknown> {
      if (shuttingDown) {
        throw new Error('SandboxPool is shutting down');
      }
      const timeoutMs = opts?.timeoutMs ?? options.perCallTimeoutMs;
      const sourceHash = sha12(source);
      return new Promise<unknown>((resolve, reject) => {
        const q: QueuedCall = { source, sourceHash, args, timeoutMs, resolve, reject };
        const free = slots.find((s) => !s.busy);
        if (free) dispatch(free, q);
        else queue.push(q);
      });
    },
    async shutdown(): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;
      const deadline = Date.now() + 5000;
      while (pending.size > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      await Promise.all(slots.map((s) => s.worker.terminate().catch(() => undefined)));
    },
  };
}
