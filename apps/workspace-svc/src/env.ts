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
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
  keycloak: {
    issuer: required('KEYCLOAK_ISSUER'),
    jwksUri: required('KEYCLOAK_JWKS_URI'),
  },
  s3: {
    endpoint: optional('S3_ENDPOINT', 'http://localhost:9000'),
    region: optional('S3_REGION', 'us-east-1'),
    accessKey: optional('S3_ACCESS_KEY', 'miragedev'),
    secretKey: optional('S3_SECRET_KEY', 'miragedev-secret'),
    bucket: optional('S3_BUCKET', 'mirage'),
    forcePathStyle: optional('S3_FORCE_PATH_STYLE', 'true') === 'true',
  },
} as const;
