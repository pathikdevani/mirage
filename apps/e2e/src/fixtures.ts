import type { BffClient } from './client.js';

/**
 * Test fixtures — minimal-viable Workspace + Schema + Set builders shaped to
 * match the OpenAPI surface. Returns the created ids so the test can clean up.
 *
 * Naming: every entity is suffixed with a millisecond timestamp + random byte
 * to avoid collisions across parallel runs (though we run serial today).
 */

const tag = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface CreatedWorkspace {
  id: string;
  key: string;
}

export async function createWorkspace(bff: BffClient): Promise<CreatedWorkspace> {
  const t = tag();
  const ws = await bff.post<{ id: string; key: string }>('/workspaces', {
    key: `e2e-${t}`.slice(0, 40),
    name: `e2e ${t}`,
    description: 'created by @mirage/e2e',
    color: 'violet',
    icon: 'TestTube',
  });
  return ws;
}

export async function deleteWorkspace(bff: BffClient, wsId: string): Promise<void> {
  await bff.delete(`/workspaces/${encodeURIComponent(wsId)}`);
}

export interface CreatedSchema {
  id: string;
  key: string;
}

/**
 * "person" — two primitive fields, no custom function, no $ref. Fastest
 * possible schema so the engine throughput is dominated by faker calls only.
 */
export async function createPersonSchema(
  bff: BffClient,
  wsId: string,
): Promise<CreatedSchema> {
  const t = tag();
  const schema = await bff.post<{ id: string; key: string }>(
    `/workspaces/${encodeURIComponent(wsId)}/schemas`,
    {
      key: `person-${t}`.slice(0, 40),
      name: 'person',
      description: '',
      color: 'cyan',
      icon: 'User',
      tags: [],
      properties: [
        { name: 'id', type: 'string', value: [{ kind: 'method', method: 'string.uuid' }], required: false },
        { name: 'name', type: 'string', value: [{ kind: 'method', method: 'person.firstName' }], required: false },
      ],
    },
  );
  return schema;
}

export interface CreatedCustomFunction {
  id: string;
  name: string;
}

export async function createValueGeneratorFn(
  bff: BffClient,
  wsId: string,
  source: string,
): Promise<CreatedCustomFunction> {
  // Names must be JS identifiers per workspace-svc validation: no dashes.
  const t = tag().replace(/[^a-zA-Z0-9]/g, '');
  const fn = await bff.post<{ id: string; name: string }>(
    `/workspaces/${encodeURIComponent(wsId)}/custom-functions`,
    {
      name: `fn_${t}`.slice(0, 40),
      description: '',
      usage: 'valueGenerator',
      source,
    },
  );
  return fn;
}

/**
 * "person" with one faker field and one custom-function field. Mirrors the
 * schema shape that triggered the long-running-soak failure: every row makes
 * a sandbox call, so this exercises the sandbox pool + worker_threads path.
 */
export async function createPersonSchemaWithCustomFn(
  bff: BffClient,
  wsId: string,
  fnId: string,
): Promise<CreatedSchema> {
  const t = tag();
  const schema = await bff.post<{ id: string; key: string }>(
    `/workspaces/${encodeURIComponent(wsId)}/schemas`,
    {
      key: `person-cfn-${t}`.slice(0, 40),
      name: 'person',
      description: '',
      color: 'cyan',
      icon: 'User',
      tags: [],
      properties: [
        { name: 'fname', type: 'string', value: [{ kind: 'method', method: 'person.fullName' }], required: false },
        { name: 'lname', type: 'string', value: [{ kind: 'fn', id: fnId }], required: false },
      ],
    },
  );
  return schema;
}

export interface CreatedSet {
  id: string;
  key: string;
  updatedAt: string;
}

export async function createSetWithCount(
  bff: BffClient,
  wsId: string,
  schemaKey: string,
  count: number,
): Promise<CreatedSet> {
  const t = tag();
  const set = await bff.post<{ id: string; key: string; updatedAt: string }>(
    `/workspaces/${encodeURIComponent(wsId)}/sets`,
    {
      key: `s-${t}`.slice(0, 40),
      name: `set ${t}`,
      description: '',
      color: 'violet',
      icon: 'Boxes',
      tags: [],
      salt: `salt-${t}`,
      schemas: [{ schemaKey, count }],
      strategies: [],
      output: { format: 'ndjson', locale: 'en', workerPool: 1 },
    },
  );
  return set;
}

export interface StartedRun {
  id: string;
  status: string;
}

export async function startRun(bff: BffClient, wsId: string, setId: string): Promise<StartedRun> {
  return bff.post<StartedRun>(
    `/workspaces/${encodeURIComponent(wsId)}/sets/${encodeURIComponent(setId)}/run`,
  );
}

export async function cancelRun(bff: BffClient, wsId: string, runId: string): Promise<void> {
  await bff.post(
    `/workspaces/${encodeURIComponent(wsId)}/runs/${encodeURIComponent(runId)}/cancel`,
  );
}

export async function getRun(
  bff: BffClient,
  wsId: string,
  runId: string,
): Promise<{ id: string; status: string; rowCounts?: Record<string, number> }> {
  return bff.get(`/workspaces/${encodeURIComponent(wsId)}/runs/${encodeURIComponent(runId)}`);
}
