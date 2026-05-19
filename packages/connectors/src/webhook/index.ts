import { buildStubConnector } from '../_stub.js';

export const webhookConnector = buildStubConnector({
  id: 'webhook',
  displayName: 'Webhook (HTTP POST)',
});
