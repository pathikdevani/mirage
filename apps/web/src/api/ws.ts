import type { RunEvent } from '@mirage/types';
import { env } from '../env.js';

/**
 * Single browser-wide WebSocket to the BFF. Opened on auth-ready by WsProvider,
 * subscribed/unsubscribed per runId by RunControl + PreviewTab. Reconnects with
 * exponential backoff and re-subscribes pending channels on reconnect.
 */

type Handler = (event: RunEvent) => void;

let socket: WebSocket | null = null;
let connectToken: string | null = null;
let connectOrg: string | null = null;
let connecting = false;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Map<string, Set<Handler>>();
const pendingSubscriptions = new Set<string>();

const BACKOFF_SECONDS = [1, 2, 4, 8, 16, 30];

function send(msg: object): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  if (!connectToken || !connectOrg) return;
  const idx = Math.min(reconnectAttempt, BACKOFF_SECONDS.length - 1);
  const delay = (BACKOFF_SECONDS[idx] ?? 30) * 1000;
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, delay);
}

function openSocket(): void {
  if (connecting || !connectToken || !connectOrg) return;
  connecting = true;
  const base = env.bffUrl.replace(/^http/, 'ws');
  const url = `${base}/ws?token=${encodeURIComponent(connectToken)}&org=${encodeURIComponent(connectOrg)}`;
  const s = new WebSocket(url);
  socket = s;

  s.addEventListener('open', () => {
    connecting = false;
    reconnectAttempt = 0;
    for (const runId of pendingSubscriptions) send({ type: 'subscribe', runId });
  });
  s.addEventListener('message', (e: MessageEvent) => {
    let parsed: { type?: string } & Partial<RunEvent>;
    try {
      parsed = JSON.parse(typeof e.data === 'string' ? e.data : '');
    } catch {
      return;
    }
    if (!parsed.type || !parsed.type.startsWith('run.')) return;
    const event = parsed as RunEvent;
    const handlers = subscribers.get(event.runId);
    if (handlers) for (const h of handlers) h(event);
  });
  s.addEventListener('close', () => {
    connecting = false;
    socket = null;
    if (connectToken) scheduleReconnect();
  });
  s.addEventListener('error', () => {
    /* close handler triggers reconnect */
  });
}

export const ws = {
  connect(token: string, orgId: string): void {
    connectToken = token;
    connectOrg = orgId;
    reconnectAttempt = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      try {
        socket.close();
      } catch {
        /* noop */
      }
      socket = null;
    }
    openSocket();
  },

  subscribe(runId: string, handler: Handler): () => void {
    let set = subscribers.get(runId);
    if (!set) {
      set = new Set();
      subscribers.set(runId, set);
    }
    set.add(handler);
    if (!pendingSubscriptions.has(runId)) {
      pendingSubscriptions.add(runId);
      send({ type: 'subscribe', runId });
    }
    return () => {
      const s = subscribers.get(runId);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        subscribers.delete(runId);
        pendingSubscriptions.delete(runId);
        send({ type: 'unsubscribe', runId });
      }
    };
  },

  disconnect(): void {
    connectToken = null;
    connectOrg = null;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      try {
        socket.close();
      } catch {
        /* noop */
      }
      socket = null;
    }
    subscribers.clear();
    pendingSubscriptions.clear();
  },
};
