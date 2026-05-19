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
} as const;
