/**
 * Regression test for the WS subscribe-during-auth race (2026-05-21).
 *
 * Bug shape: the BFF `/ws` handler did `await verify(token)` BEFORE attaching
 * `socket.on('message')`. If the client sent its `subscribe` message during
 * that auth window (which `ws.on('open', ...)` always does), Node's
 * EventEmitter dropped the message — no late listener, no subscription, no
 * forwarded events. The user-visible symptom was a 1M-row soak run that
 * completed on the server but the test/client never received the terminal
 * event.
 *
 * The fix buffers any 'message' events until auth completes, then drains
 * the queue. This test asserts the behaviour the fix guarantees: a client
 * that sends `subscribe` immediately on 'open' MUST receive a `subscribed`
 * confirmation AND any subsequent published events on that channel.
 *
 * We bypass the full run pipeline and publish a synthetic terminal event
 * directly to the Redis channel — the bug lives in the WS handler, not the
 * worker, so this is the tightest possible reproducer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import IORedis from 'ioredis';
import { WebSocket } from 'ws';
import { loadE2eEnv, type E2eEnv } from './env.js';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

describe('BFF /ws — subscribe-on-open race', () => {
  let env: E2eEnv;
  let redis: IORedis;

  beforeAll(async () => {
    env = await loadE2eEnv();
    redis = new IORedis(REDIS_URL);
  }, 20_000);

  afterAll(() => {
    redis?.disconnect();
  });

  it('delivers events to a client that subscribes immediately on open', async () => {
    const runId = `probe_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const channel = `org:${env.orgId}:run:${runId}`;
    const url = `${env.bffWsUrl}/ws?token=${encodeURIComponent(env.token)}&org=${encodeURIComponent(env.orgId)}`;

    const ws = new WebSocket(url);
    const received: Array<{ type?: string; runId?: string }> = [];
    const closed: Array<{ code: number; reason: string }> = [];

    ws.on('open', () => {
      // Critical: send subscribe IMMEDIATELY. This is the exact timing that
      // triggered the bug — the handler hadn't attached its message listener
      // yet because it was still awaiting JWKS verification.
      ws.send(JSON.stringify({ type: 'subscribe', runId }));
    });
    ws.on('message', (raw) => {
      try {
        received.push(JSON.parse(raw.toString('utf8')) as { type?: string; runId?: string });
      } catch {
        /* ignore non-JSON frames */
      }
    });
    ws.on('close', (code, reason) => {
      closed.push({ code, reason: reason?.toString('utf8') ?? '' });
    });

    // Wait for the `subscribed` confirmation. Without the fix, this poll
    // would time out because the BFF never received the subscribe message.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (received.some((m) => m.type === 'subscribed' && m.runId === runId)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(
      received.find((m) => m.type === 'subscribed' && m.runId === runId),
      `never got 'subscribed' confirmation. Received: ${JSON.stringify(received)}`,
    ).toBeTruthy();

    // Now that we have a confirmed subscription, publish a synthetic terminal
    // event on the channel and assert the BFF forwards it to us.
    const payload = JSON.stringify({
      type: 'run.completed',
      runId,
      artifactKey: 'test/fake',
      rowCounts: { fake: 1 },
      at: new Date().toISOString(),
    });
    const subscriberCount = await redis.publish(channel, payload);
    expect(
      subscriberCount,
      'Redis reported 0 subscribers — BFF subscriber.subscribe(channel) never ran',
    ).toBeGreaterThanOrEqual(1);

    // Wait for delivery via WS.
    const forwardDeadline = Date.now() + 3_000;
    while (Date.now() < forwardDeadline) {
      if (received.some((m) => m.type === 'run.completed' && m.runId === runId)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const completed = received.find((m) => m.type === 'run.completed' && m.runId === runId);
    expect(
      completed,
      `run.completed never forwarded. Received: ${JSON.stringify(received)}`,
    ).toBeTruthy();

    ws.close();
    // Give the close a beat so afterAll doesn't race the disconnect.
    await new Promise((r) => setTimeout(r, 100));
    expect(closed.length, 'no close event observed').toBeGreaterThanOrEqual(1);
  }, 15_000);
});
