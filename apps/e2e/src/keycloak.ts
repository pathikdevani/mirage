import { spawn } from 'node:child_process';

/**
 * Auto-acquire a dev access token from Keycloak so the e2e suite can run
 * without anyone pasting tokens. Uses the seeded `dev / dev` user.
 *
 * The `mirage-web` client is configured with `directAccessGrantsEnabled: false`
 * in the realm JSON (production posture). We enable it once via `kcadm.sh`
 * inside the Keycloak container — that path bypasses the master realm's
 * `sslRequired` check that blocks plain HTTP admin calls from the host.
 * The change persists via the `keycloak-data` Docker volume; subsequent runs
 * short-circuit because the flag is already true.
 */

export interface KeycloakConfig {
  url: string;
  realm: string;
  /** Public client used for the password grant. */
  clientId: string;
  username: string;
  password: string;
  adminUsername: string;
  adminPassword: string;
  /** Container running Keycloak — used for one-time `kcadm.sh` admin calls. */
  containerName: string;
}

export function loadKeycloakConfig(): KeycloakConfig {
  return {
    url: process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080',
    realm: process.env['KEYCLOAK_REALM'] ?? 'mirage',
    clientId: process.env['KEYCLOAK_TEST_CLIENT_ID'] ?? 'mirage-web',
    username: process.env['KEYCLOAK_TEST_USERNAME'] ?? 'dev',
    password: process.env['KEYCLOAK_TEST_PASSWORD'] ?? 'dev',
    adminUsername: process.env['KEYCLOAK_ADMIN_USERNAME'] ?? 'admin',
    adminPassword: process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'admin',
    containerName: process.env['KEYCLOAK_CONTAINER'] ?? 'mirage-keycloak',
  };
}

export async function fetchDevAccessToken(cfg: KeycloakConfig): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: cfg.clientId,
    username: cfg.username,
    password: cfg.password,
    scope: 'openid',
  });
  const url = `${cfg.url}/realms/${encodeURIComponent(cfg.realm)}/protocol/openid-connect/token`;

  // First attempt — usually works after the first run because the flag persists.
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  // 400 + "Direct grant not allowed" means we need to flip the client flag.
  if (res.status === 400) {
    const peek = await res.clone().text();
    if (peek.includes('direct_access_disabled') || peek.toLowerCase().includes('not allowed')) {
      await enableDirectGrantsViaKcadm(cfg);
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Keycloak password grant failed: ${res.status} ${res.statusText} — ${text.slice(0, 400)}`,
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (typeof json.access_token !== 'string') {
    throw new Error('Keycloak response did not contain an access_token');
  }
  return json.access_token;
}

async function enableDirectGrantsViaKcadm(cfg: KeycloakConfig): Promise<void> {
  // Login. The master realm allows plain HTTP from inside the container.
  await dockerExec(cfg.containerName, [
    '/opt/keycloak/bin/kcadm.sh',
    'config',
    'credentials',
    '--server',
    'http://localhost:8080',
    '--realm',
    'master',
    '--user',
    cfg.adminUsername,
    '--password',
    cfg.adminPassword,
  ]);
  // Update the client. `-q clientId=...` resolves the internal id for us.
  await dockerExec(cfg.containerName, [
    '/opt/keycloak/bin/kcadm.sh',
    'update',
    `clients/${await resolveClientId(cfg)}`,
    '-r',
    cfg.realm,
    '-s',
    'directAccessGrantsEnabled=true',
  ]);
}

async function resolveClientId(cfg: KeycloakConfig): Promise<string> {
  const out = await dockerExec(cfg.containerName, [
    '/opt/keycloak/bin/kcadm.sh',
    'get',
    'clients',
    '-r',
    cfg.realm,
    '-q',
    `clientId=${cfg.clientId}`,
    '--fields',
    'id',
  ]);
  const parsed = JSON.parse(out) as Array<{ id?: string }>;
  const id = parsed[0]?.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(
      `Keycloak: could not resolve internal id for client "${cfg.clientId}" in realm "${cfg.realm}"`,
    );
  }
  return id;
}

function dockerExec(container: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('docker', ['exec', container, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => (stdout += b.toString('utf8')));
    child.stderr.on('data', (b: Buffer) => (stderr += b.toString('utf8')));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `docker exec ${container} ${args[0]} failed (exit ${code}): ${stderr.slice(0, 400) || stdout.slice(0, 400)}`,
          ),
        );
    });
  });
}
