// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Module-boundary scopes (documented; enforced below via `no-restricted-imports`):
 *   scope:shared      → packages/types, packages/engine, packages/ui-kit
 *   scope:server-lib  → packages/sandbox, packages/connectors, packages/auth
 *   scope:server-app  → apps/bff, apps/workspace-svc, apps/generation-worker, apps/export-svc
 *   scope:client-app  → apps/web
 *
 * Rules:
 *   - Libraries (packages/*) must NOT import from apps/*.
 *   - The web SPA (scope:client-app) must NOT import server-only deps or
 *     server-only Mirage packages.
 *   - Server libs/apps may freely import shared + server-lib.
 *
 * Tags also live on each project's `nx.tags` array (package.json) so
 * `nx graph` / future Nx-native enforcement has them ready.
 */

const SERVER_ONLY_MIRAGE_PKGS = [
  '@mirage/sandbox',
  '@mirage/sandbox/*',
  '@mirage/connectors',
  '@mirage/connectors/*',
  '@mirage/auth/fastify',
];

const SERVER_ONLY_DEPS = [
  'fastify',
  '@fastify/*',
  'fastify-plugin',
  'mongodb',
  'bullmq',
  'ioredis',
  'jose',
  '@aws-sdk/*',
  'pino',
  'node:*',
  'fs',
  'fs/promises',
  'path',
  'crypto',
];

const APP_PKG_GLOBS = [
  '@mirage/bff',
  '@mirage/bff/*',
  '@mirage/workspace-svc',
  '@mirage/workspace-svc/*',
  '@mirage/generation-worker',
  '@mirage/generation-worker/*',
  '@mirage/export-svc',
  '@mirage/export-svc/*',
  '@mirage/web',
  '@mirage/web/*',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.nx/**',
      '**/build/**',
      '**/coverage/**',
      '**/generated/**',
      '**/*.generated.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  // Libraries (packages/*) must not import from apps/*.
  {
    files: ['packages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: APP_PKG_GLOBS,
              message: 'Libraries must not import from apps — invert the dependency.',
            },
          ],
        },
      ],
    },
  },
  // Web SPA must not pull server-only Mirage packages or Node-only deps.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: SERVER_ONLY_MIRAGE_PKGS,
              message: 'Server-only: not importable from the web SPA.',
            },
            {
              group: SERVER_ONLY_DEPS,
              message: 'Server-only dep: not importable from the web SPA.',
            },
            {
              group: APP_PKG_GLOBS.filter((g) => !g.startsWith('@mirage/web')),
              message: 'Apps must not import other apps directly.',
            },
          ],
        },
      ],
    },
  },
  // Server apps must not import the web app.
  {
    files: ['apps/{bff,workspace-svc,generation-worker,export-svc}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mirage/web', '@mirage/web/*'],
              message: 'Server apps must not import the web SPA.',
            },
          ],
        },
      ],
    },
  },
);
