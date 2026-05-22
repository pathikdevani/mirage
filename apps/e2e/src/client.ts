import type { E2eEnv } from './env.js';

/**
 * Thin fetch wrapper that adds the auth + org headers every BFF route needs
 * and throws a useful error on non-2xx responses.
 */
export class BffClient {
  constructor(private readonly env: E2eEnv) {}

  /** Always-on headers. Content-Type is added by `withJsonBody` only when there is a body. */
  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.env.token}`,
      'x-mirage-org': this.env.orgId,
    };
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.env.bffUrl}${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await asError(res, 'GET', path);
    return (await res.json()) as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit =
      body !== undefined
        ? {
            method: 'POST',
            headers: { ...this.headers(), 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : { method: 'POST', headers: this.headers() };
    const res = await fetch(`${this.env.bffUrl}${path}`, init);
    if (!res.ok) throw await asError(res, 'POST', path);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (text.length === 0) return undefined as T;
    return JSON.parse(text) as T;
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(`${this.env.bffUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    // 404 = already gone. 403 = caller is not an org owner (e2e users are
    // JIT-provisioned as `editor`); cleanup is best-effort in that case.
    if (!res.ok && res.status !== 404 && res.status !== 403) {
      throw await asError(res, 'DELETE', path);
    }
  }
}

async function asError(res: Response, method: string, path: string): Promise<Error> {
  const text = await res.text().catch(() => '');
  return new Error(`${method} ${path} → ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
}
