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
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
  /** Concurrency on the full-run queue. Keep low — runs are heavyweight. */
  runsConcurrency: Number.parseInt(optional('RUNS_CONCURRENCY', '2'), 10),
  /**
   * Concurrency on the preview queue. Higher than `runs` so the editor's
   * 5-10 row previews stay snappy even when full runs are queued up.
   */
  previewsConcurrency: Number.parseInt(optional('PREVIEWS_CONCURRENCY', '8'), 10),
  mongoUrl: required('MONGO_URL'),
  mongoDb: optional('MONGO_DB', 'mirage'),
  s3: {
    endpoint: optional('S3_ENDPOINT', 'http://localhost:9000'),
    region: optional('S3_REGION', 'us-east-1'),
    accessKey: optional('S3_ACCESS_KEY', 'miragedev'),
    secretKey: optional('S3_SECRET_KEY', 'miragedev-secret'),
    bucket: optional('S3_BUCKET', 'mirage'),
    forcePathStyle: optional('S3_FORCE_PATH_STYLE', 'true') === 'true',
  },
  sandbox: {
    poolSize: Number.parseInt(optional('SANDBOX_POOL_SIZE', '2'), 10),
    callTimeoutMs: Number.parseInt(optional('SANDBOX_CALL_TIMEOUT_MS', '5000'), 10),
    memoryCapMb: Number.parseInt(optional('SANDBOX_MEMORY_CAP_MB', '64'), 10),
  },
} as const;
