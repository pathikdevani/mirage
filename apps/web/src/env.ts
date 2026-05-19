/// <reference types="vite/client" />

const fallback = (value: string | undefined, def: string): string =>
  value && value.length > 0 ? value : def;

const viteEnv = import.meta.env as unknown as Record<string, string | undefined>;

export const env = {
  bffUrl: fallback(viteEnv['VITE_BFF_URL'], 'http://localhost:4000'),
  keycloak: {
    url: fallback(viteEnv['VITE_KEYCLOAK_URL'], 'http://localhost:8080'),
    realm: fallback(viteEnv['VITE_KEYCLOAK_REALM'], 'mirage'),
    clientId: fallback(viteEnv['VITE_KEYCLOAK_CLIENT_ID_WEB'], 'mirage-web'),
  },
} as const;
