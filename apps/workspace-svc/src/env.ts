const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const optional = (name: string, fallback: string): string =>
  process.env[name] && process.env[name]!.length > 0 ? process.env[name]! : fallback;

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),
  port: Number.parseInt(optional('WORKSPACE_SVC_PORT', '4001'), 10),
  mongoUrl: required('MONGO_URL'),
  mongoDb: optional('MONGO_DB', 'mirage'),
  keycloak: {
    issuer: required('KEYCLOAK_ISSUER'),
    jwksUri: required('KEYCLOAK_JWKS_URI'),
  },
} as const;
