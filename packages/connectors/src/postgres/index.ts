import { buildStubConnector } from '../_stub.js';

export const postgresConnector = buildStubConnector({
  id: 'postgres',
  displayName: 'PostgreSQL',
});
