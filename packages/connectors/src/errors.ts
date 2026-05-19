export class ConnectorConfigError extends Error {
  override readonly name = 'ConnectorConfigError';
}

export class ConnectorOpenError extends Error {
  override readonly name = 'ConnectorOpenError';
}

export class ConnectorNotImplementedError extends Error {
  override readonly name = 'ConnectorNotImplementedError';
  constructor(connectorId: string) {
    super(`Connector "${connectorId}" is not implemented yet`);
  }
}
