import { MongoClient, type Collection } from 'mongodb';
import type { Api } from '@mirage/types';
import { env } from './env.js';

export type SchemaDoc = Api.components['schemas']['Schema'];
export type SetDoc = Api.components['schemas']['Set'];
export type CustomFunctionDoc = Api.components['schemas']['CustomFunction'];
export type RunDoc = Api.components['schemas']['Run'];

export interface WorkerDb {
  client: MongoClient;
  schemas: Collection<SchemaDoc>;
  sets: Collection<SetDoc>;
  customFunctions: Collection<CustomFunctionDoc>;
  runs: Collection<RunDoc>;
}

export async function connectDb(): Promise<WorkerDb> {
  const client = new MongoClient(env.mongoUrl, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(env.mongoDb);
  return {
    client,
    schemas: db.collection<SchemaDoc>('schemas'),
    sets: db.collection<SetDoc>('sets'),
    customFunctions: db.collection<CustomFunctionDoc>('custom_functions'),
    runs: db.collection<RunDoc>('runs'),
  };
}
