import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 30_000,
    pool: 'forks',
    fileParallel: false,
  },
});
