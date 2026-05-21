import { createSandboxPool, type SandboxPool } from '@mirage/sandbox';
import { env } from './env.js';

let pool: SandboxPool | null = null;

export function getSandbox(): SandboxPool {
  if (pool) return pool;
  pool = createSandboxPool({
    size: env.sandbox.poolSize,
    perCallTimeoutMs: env.sandbox.callTimeoutMs,
    memoryCapMb: env.sandbox.memoryCapMb,
  });
  return pool;
}

export async function shutdownSandbox(): Promise<void> {
  if (pool) {
    await pool.shutdown();
    pool = null;
  }
}
