import type { FastifyInstance } from 'fastify';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get(
    '/health',
    {
      config: { public: true },
    },
    async () => ({ status: 'ok', service: 'bff' }),
  );
}
