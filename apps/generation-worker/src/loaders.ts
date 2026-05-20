import type { Api } from '@mirage/types';
import type { CustomFunctionRegistry, CustomFunctionEntry } from '@mirage/engine';
import { customFunctionRegistryFromMap } from '@mirage/engine';
import type { WorkerDb, SetDoc, SchemaDoc } from './db.js';

interface LoadedRunInputs {
  set: Api.components['schemas']['Set'];
  schemas: Api.components['schemas']['Schema'][];
  registry: CustomFunctionRegistry;
}

export class LoadFailure extends Error {
  override readonly name = 'LoadFailure';
}

export async function loadRunInputs(args: {
  db: WorkerDb;
  workspaceId: string;
  setId: string;
}): Promise<LoadedRunInputs> {
  const set = (await args.db.sets.findOne(
    { workspaceId: args.workspaceId, id: args.setId },
    { projection: { _id: 0 } },
  )) as SetDoc | null;
  if (!set) throw new LoadFailure(`Set ${args.setId} not found`);

  const schemas = (await args.db.schemas
    .find({ workspaceId: args.workspaceId }, { projection: { _id: 0 } })
    .toArray()) as SchemaDoc[];

  const fns = await args.db.customFunctions
    .find({ workspaceId: args.workspaceId }, { projection: { _id: 0 } })
    .toArray();

  const map = new Map<string, CustomFunctionEntry>();
  for (const f of fns) map.set(f.id, { source: f.source, usage: f.usage });
  const registry = customFunctionRegistryFromMap(map);

  return { set, schemas, registry };
}
