import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import IORedis from 'ioredis';
import { createKeycloakVerifier } from '@mirage/auth';
import { env } from '../env.js';

interface SubscribeMessage {
  type: 'subscribe';
  runId: string;
}
interface UnsubscribeMessage {
  type: 'unsubscribe';
  runId: string;
}
type ClientMessage = SubscribeMessage | UnsubscribeMessage;

const subscriber = new IORedis(env.redisUrl);
const channelToSockets = new Map<string, Set<WebSocket>>();
const socketChannels = new WeakMap<WebSocket, Set<string>>();

subscriber.on('message', (channel: string, payload: string) => {
  const sockets = channelToSockets.get(channel);
  if (!sockets) return;
  for (const s of sockets) {
    try {
      s.send(payload);
    } catch {
      // dropped client; will be cleaned up on its 'close' event
    }
  }
});

const runChannel = (orgId: string, runId: string): string => `org:${orgId}:run:${runId}`;

async function attach(channel: string, socket: WebSocket): Promise<void> {
  let set = channelToSockets.get(channel);
  if (!set) {
    set = new Set();
    channelToSockets.set(channel, set);
    await subscriber.subscribe(channel);
  }
  set.add(socket);
  let chans = socketChannels.get(socket);
  if (!chans) {
    chans = new Set();
    socketChannels.set(socket, chans);
  }
  chans.add(channel);
}

async function detach(channel: string, socket: WebSocket): Promise<void> {
  const set = channelToSockets.get(channel);
  if (!set) return;
  set.delete(socket);
  socketChannels.get(socket)?.delete(channel);
  if (set.size === 0) {
    channelToSockets.delete(channel);
    await subscriber.unsubscribe(channel);
  }
}

async function detachAll(socket: WebSocket): Promise<void> {
  const chans = socketChannels.get(socket);
  if (!chans) return;
  for (const c of [...chans]) {
    await detach(c, socket);
  }
}

export function registerWsRoute(app: FastifyInstance): void {
  const verify = createKeycloakVerifier({
    issuer: env.keycloak.issuer,
    jwksUri: env.keycloak.jwksUri,
  });

  app.get(
    '/ws',
    { websocket: true, config: { public: true } },
    async (socket: WebSocket, request: FastifyRequest) => {
      const q = request.query as { token?: string; org?: string };
      const token = typeof q.token === 'string' ? q.token : undefined;
      const orgId = typeof q.org === 'string' ? q.org : undefined;

      // Buffer incoming messages until auth completes. Without this, any
      // message the client sends during the `await verify(token)` window —
      // which includes the typical `subscribe` sent on WS 'open' — is dropped
      // because Node's EventEmitter doesn't queue events for late listeners.
      const pending: Array<Buffer | ArrayBuffer | Buffer[]> = [];
      let authed = false;
      let authedOrgId: string | null = null;

      const handleClientMessage = async (
        raw: Buffer | ArrayBuffer | Buffer[],
      ): Promise<void> => {
        let parsed: ClientMessage;
        try {
          const text = Array.isArray(raw)
            ? Buffer.concat(raw).toString('utf8')
            : Buffer.isBuffer(raw)
              ? raw.toString('utf8')
              : Buffer.from(raw as ArrayBuffer).toString('utf8');
          parsed = JSON.parse(text) as ClientMessage;
        } catch {
          socket.send(JSON.stringify({ type: 'error', message: 'invalid json' }));
          return;
        }
        if (parsed.type === 'subscribe') {
          const ch = runChannel(authedOrgId!, parsed.runId);
          await attach(ch, socket);
          socket.send(JSON.stringify({ type: 'subscribed', runId: parsed.runId }));
        } else if (parsed.type === 'unsubscribe') {
          const ch = runChannel(authedOrgId!, parsed.runId);
          await detach(ch, socket);
          socket.send(JSON.stringify({ type: 'unsubscribed', runId: parsed.runId }));
        }
      };

      socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
        if (!authed) {
          pending.push(raw);
          return;
        }
        void handleClientMessage(raw);
      });
      socket.on('close', () => {
        void detachAll(socket);
      });

      if (!token) {
        socket.send(JSON.stringify({ type: 'error', message: 'missing token' }));
        socket.close();
        return;
      }
      if (!orgId) {
        socket.send(JSON.stringify({ type: 'error', message: 'missing org' }));
        socket.close();
        return;
      }
      let claims: { sub: string };
      try {
        claims = (await verify(token)) as { sub: string };
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'invalid token' }));
        socket.close();
        return;
      }

      socket.send(
        JSON.stringify({
          type: 'hello',
          orgId,
          userId: claims.sub,
          at: new Date().toISOString(),
        }),
      );

      authedOrgId = orgId;
      authed = true;
      const buffered = pending.splice(0);
      for (const raw of buffered) {
        await handleClientMessage(raw);
      }
    },
  );
}
