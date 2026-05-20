/**
 * Manual engine smoke. Run via:
 *   pnpm --filter @mirage/bff exec tsx packages/engine/scripts/run-set-smoke.mts
 *
 * Builds an in-memory two-Schema Set with a $ref edge plus a $fn-driven
 * Value Generator, then calls runSet twice and asserts the outputs are
 * deep-equal (determinism).
 */
import { createSandboxPool } from '@mirage/sandbox';
import { customFunctionRegistryFromMap, isRefPlaceholder, runSet } from '../src/index.ts';
import type { Api } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];
type MirageSet = Api.components['schemas']['Set'];

const schemas: Schema[] = [
  {
    id: 'sch_person',
    workspaceId: 'ws_x',
    orgId: 'acme',
    key: 'person',
    name: 'Person',
    description: '',
    color: 'cyan',
    icon: 'user',
    tags: [],
    properties: [
      { name: 'id', type: 'string', required: true, faker: 'string.uuid' },
      { name: 'firstName', type: 'string', required: true, faker: 'person.firstName' },
      // Value Generator via custom function — exercises the sandbox.
      { name: 'tag', type: 'string', required: true, faker: '$fn:cfn_aaaaaaaaaaaaaaaa' },
    ],
    createdBy: 'dev',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sch_mobile',
    workspaceId: 'ws_x',
    orgId: 'acme',
    key: 'mobile',
    name: 'Mobile',
    description: '',
    color: 'violet',
    icon: 'phone',
    tags: [],
    properties: [
      { name: 'id', type: 'string', required: true, faker: 'string.uuid' },
      { name: 'personId', type: 'string', required: true, faker: '$ref:person.id' },
    ],
    createdBy: 'dev',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const set: MirageSet = {
  id: 'set_smoke',
  workspaceId: 'ws_x',
  orgId: 'acme',
  key: 'smoke',
  name: 'Smoke',
  description: '',
  color: 'emerald',
  icon: 'box',
  tags: [],
  salt: 'engine-smoke-001',
  schemas: [
    { schemaKey: 'person', count: 5 },
    { schemaKey: 'mobile', count: 8 },
  ],
  strategies: [
    {
      schemaKey: 'mobile',
      fieldPath: 'personId',
      strategy: { type: 'random' },
    },
  ],
  output: { format: 'json', locale: 'en_US', workerPool: 1 },
  createdBy: 'dev',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const customFunctions = customFunctionRegistryFromMap(
  new Map<string, { source: string; usage: 'valueGenerator' | 'strategy' | 'both' }>([
    [
      'cfn_aaaaaaaaaaaaaaaa',
      {
        usage: 'valueGenerator',
        source: `return 'tag-' + ctx.faker.string.alphanumeric(6);`,
      },
    ],
  ]),
);

async function run() {
  const pool = createSandboxPool({ size: 1, perCallTimeoutMs: 1000, memoryCapMb: 64 });

  const r1 = await runSet({ set, schemas, customFunctions, sandbox: pool });
  const r2 = await runSet({ set, schemas, customFunctions, sandbox: pool });

  let passed = 0;
  let failed = 0;
  const assert = (label: string, ok: boolean, detail?: unknown): void => {
    if (ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ ${label}`, detail ?? '');
    }
  };

  const persons1 = r1.rowsByKey.get('person')!;
  const mobiles1 = r1.rowsByKey.get('mobile')!;
  const persons2 = r2.rowsByKey.get('person')!;
  const mobiles2 = r2.rowsByKey.get('mobile')!;

  assert('person count', persons1.length === 5);
  assert('mobile count', mobiles1.length === 8);
  assert('tag is a function-generated string', typeof persons1[0]!.tag === 'string');
  assert(
    'tag starts with "tag-"',
    typeof persons1[0]!.tag === 'string' && (persons1[0]!.tag as string).startsWith('tag-'),
  );
  assert('mobile.personId substituted (not placeholder)', !isRefPlaceholder(mobiles1[0]!.personId));
  assert(
    'mobile.personId is a known person id',
    persons1.map((p) => p.__id).includes(mobiles1[0]!.personId as string),
  );

  assert('persons match across runs', JSON.stringify(persons1) === JSON.stringify(persons2));
  assert('mobiles match across runs', JSON.stringify(mobiles1) === JSON.stringify(mobiles2));

  await pool.shutdown();
  console.log(`\nresult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
