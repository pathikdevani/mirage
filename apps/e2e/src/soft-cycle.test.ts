import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadE2eEnv, type E2eEnv } from './env.js';
import { BffClient } from './client.js';
import { collectRunEvents } from './ws-collector.js';
import { createWorkspace, deleteWorkspace, startRun, getRun } from './fixtures.js';

let env: E2eEnv;
let bff: BffClient;

const tag = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function putJson(env: E2eEnv, path: string, body: unknown): Promise<Response> {
  return fetch(`${env.bffUrl}${path}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${env.token}`,
      'x-mirage-org': env.orgId,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('soft-cycle schemas — Phone ⇄ Person via $ref:other.id', () => {
  let wsId: string;
  let phoneKey: string;
  let personKey: string;

  beforeAll(async () => {
    env = await loadE2eEnv();
    bff = new BffClient(env);
    const ws = await createWorkspace(bff);
    wsId = ws.id;

    const t = tag();
    phoneKey = `phone-${t}`.slice(0, 40);
    personKey = `person-${t}`.slice(0, 40);

    await bff.post<{ id: string; key: string; updatedAt: string }>(
      `/workspaces/${encodeURIComponent(wsId)}/schemas`,
      {
        key: phoneKey,
        name: 'phone',
        description: '',
        color: 'cyan',
        icon: 'Phone',
        tags: [],
        properties: [{ name: 'id', type: 'string', faker: 'string.uuid', required: false }],
      },
    );

    await bff.post<{ id: string; key: string }>(
      `/workspaces/${encodeURIComponent(wsId)}/schemas`,
      {
        key: personKey,
        name: 'person',
        description: '',
        color: 'violet',
        icon: 'User',
        tags: [],
        properties: [
          { name: 'id', type: 'string', faker: 'string.uuid', required: false },
          { name: 'phone_id', type: 'string', faker: `$ref:${phoneKey}.id`, required: false },
        ],
      },
    );
  });

  afterAll(async () => {
    if (wsId) await deleteWorkspace(bff, wsId);
  });

  it('saves phone with $ref back to person (previously rejected as cycle)', async () => {
    const existingPhone = await bff.get<{ id: string; key: string; updatedAt: string }>(
      `/workspaces/${encodeURIComponent(wsId)}/schemas?key=${phoneKey}`,
    ) as unknown as Array<{ id: string; key: string; updatedAt: string }>;
    const phoneRow = (existingPhone as unknown as Array<{ id: string; key: string; updatedAt: string }>)[0]!;

    const res = await putJson(env, `/workspaces/${encodeURIComponent(wsId)}/schemas/${phoneRow.id}`, {
      key: phoneKey,
      name: 'phone',
      description: '',
      color: 'cyan',
      icon: 'Phone',
      tags: [],
      expectedUpdatedAt: phoneRow.updatedAt,
      properties: [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'person_id', type: 'string', faker: `$ref:${personKey}.id`, required: false },
      ],
    });
    expect(res.status, await res.text()).toBe(200);
  });

  it('runs a Set that includes Phone and Person, completes successfully', async () => {
    const COUNT = 5;
    const t = tag();
    const set = await bff.post<{ id: string; updatedAt: string }>(
      `/workspaces/${encodeURIComponent(wsId)}/sets`,
      {
        key: `s-${t}`.slice(0, 40),
        name: `set ${t}`,
        description: '',
        color: 'violet',
        icon: 'Boxes',
        tags: [],
        salt: `salt-${t}`,
        schemas: [
          { schemaKey: phoneKey, count: COUNT },
          { schemaKey: personKey, count: COUNT },
        ],
        strategies: [],
        output: { format: 'ndjson', locale: 'en', workerPool: 1 },
      },
    );

    const run = await startRun(bff, wsId, set.id);
    expect(run.id).toMatch(/^run_/);

    const events = await collectRunEvents({
      env,
      runId: run.id,
      timeoutMs: 60_000,
    });
    expect(events.map((e) => e.type)).toContain('run.completed');

    const finalRun = await getRun(bff, wsId, run.id);
    expect(finalRun.status).toBe('completed');
    expect(finalRun.rowCounts?.[phoneKey]).toBe(COUNT);
    expect(finalRun.rowCounts?.[personKey]).toBe(COUNT);
  }, 90_000);

  it('rejects an embedding cycle ($ref:other with no field)', async () => {
    const otherKey = `embed-${tag()}`.slice(0, 40);
    let firstStatus = 0;
    let firstText = '';
    {
      const res = await fetch(`${env.bffUrl}/workspaces/${encodeURIComponent(wsId)}/schemas`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.token}`,
          'x-mirage-org': env.orgId,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          key: otherKey,
          name: 'embed',
          description: '',
          color: 'amber',
          icon: 'Database',
          tags: [],
          properties: [
            { name: 'id', type: 'string', faker: 'string.uuid', required: false },
            { name: 'phone', type: 'string', faker: `$ref:${phoneKey}`, required: false },
          ],
        }),
      });
      firstStatus = res.status;
      firstText = await res.text();
    }
    // The other schema must save (no cycle yet).
    expect(firstStatus, firstText).toBe(201);

    // Now make phone embed the embed-schema — completes the embedding cycle.
    const phonesList = await bff.get<Array<{ id: string; key: string; updatedAt: string }>>(
      `/workspaces/${encodeURIComponent(wsId)}/schemas?key=${phoneKey}`,
    );
    const phoneRow = phonesList[0]!;

    const res = await putJson(env, `/workspaces/${encodeURIComponent(wsId)}/schemas/${phoneRow.id}`, {
      key: phoneKey,
      name: 'phone',
      description: '',
      color: 'cyan',
      icon: 'Phone',
      tags: [],
      expectedUpdatedAt: phoneRow.updatedAt,
      properties: [
        { name: 'id', type: 'string', faker: 'string.uuid', required: false },
        { name: 'person_id', type: 'string', faker: `$ref:${personKey}.id`, required: false },
        { name: 'embed_obj', type: 'string', faker: `$ref:${otherKey}`, required: false },
      ],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string; detail?: { kind?: string } };
    expect(body.code).toBe('cycle_detected');
    expect(body.detail?.kind).toBe('embedding');
  });
});
