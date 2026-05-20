import { WebSocket } from 'ws';
import type { E2eEnv } from './env.js';

export interface RunEventLike {
  type: string;
  runId: string;
  [k: string]: unknown;
}

/**
 * Opens a WS connection to the BFF, subscribes to a specific runId, and
 * collects every run.* event until either a terminal event (completed /
 * failed / cancelled) arrives or the deadline elapses.
 */
export async function collectRunEvents(opts: {
  env: E2eEnv;
  runId: string;
  /** Hard stop, even if no terminal event arrives. */
  timeoutMs: number;
  /** Called for every event as it arrives, for live progress assertions. */
  onEvent?: (event: RunEventLike) => void;
}): Promise<RunEventLike[]> {
  const { env, runId, timeoutMs, onEvent } = opts;
  const url = `${env.bffWsUrl}/ws?token=${encodeURIComponent(env.token)}&org=${encodeURIComponent(env.orgId)}`;
  const events: RunEventLike[] = [];

  return await new Promise<RunEventLike[]>((resolve, reject) => {
    const ws = new WebSocket(url);
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => settle(() => { ws.close(); resolve(events); }), timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', runId }));
    });

    ws.on('message', (raw) => {
      let parsed: { type?: string; runId?: string };
      try {
        parsed = JSON.parse(raw.toString('utf8')) as { type?: string; runId?: string };
      } catch {
        return;
      }
      if (!parsed.type || !parsed.type.startsWith('run.')) return;
      if (parsed.runId !== runId) return;
      const event = parsed as RunEventLike;
      events.push(event);
      onEvent?.(event);
      if (
        event.type === 'run.completed' ||
        event.type === 'run.failed' ||
        event.type === 'run.cancelled'
      ) {
        settle(() => { ws.close(); resolve(events); });
      }
    });

    ws.on('error', (err) => {
      settle(() => reject(err instanceof Error ? err : new Error(String(err))));
    });

    // If the server closes the WS before a terminal event arrives, reject
    // explicitly rather than hanging until the outer timeout. Silent hangs
    // mask real delivery bugs.
    ws.on('close', (code, reason) => {
      settle(() => {
        const reasonStr = reason ? reason.toString('utf8') : '';
        reject(new Error(
          `WS closed without terminal event: code=${code} reason=${reasonStr || '(none)'} events=${events.length}`,
        ));
      });
    });
  });
}
