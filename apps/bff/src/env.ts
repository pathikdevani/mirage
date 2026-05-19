/**
 * Strict env loader. Throws at startup if anything required is missing, so
 * configuration errors never surface mid-flight as cryptic 500s.
 */

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
  port: Number.parseInt(optional('BFF_PORT', '4000'), 10),
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
  keycloak: {
    issuer: required('KEYCLOAK_ISSUER'),
    jwksUri: required('KEYCLOAK_JWKS_URI'),
  },
  webOrigin: optional('WEB_PUBLIC_URL', 'http://localhost:5173'),
  workspaceSvcUrl: optional('WORKSPACE_SVC_URL', 'http://localhost:4001'),
} as const;
