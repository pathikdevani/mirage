import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

/**
 * Single WebSocket endpoint per the architecture (§3.2). Today the client
 * connects, the server echoes a `hello`, and we keep the connection open.
 * Subscription wiring to Redis pub/sub channels (`org:{orgId}:run:{runId}`)
 * lands once the worker (T11) starts publishing events.
 */
export function registerWsRoute(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket: WebSocket, request) => {
    const auth = request.auth;
    if (!auth) {
      socket.send(JSON.stringify({ type: 'error', message: 'unauthenticated' }));
      socket.close();
      return;
    }

    socket.send(
      JSON.stringify({
        type: 'hello',
        orgId: auth.orgId,
        userId: auth.userId,
        at: new Date().toISOString(),
      }),
    );

    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      // Echo channel for now; will be replaced by pub/sub fan-out.
      socket.send(
        JSON.stringify({
          type: 'echo',
          received: raw.toString(),
          at: new Date().toISOString(),
        }),
      );
    });
  });
}
