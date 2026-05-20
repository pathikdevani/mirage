import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import {
  asId,
  type Api,
  type OrgId,
  type RunId,
  type SetId,
  type UserId,
  type WorkspaceId,
} from '@mirage/types';
import type { MirageDb, RunDoc } from '../db.js';
import { env } from '../env.js';
import { s3 } from '../s3.js';
import { redis } from '../redis.js';
import { cancelFlagKey, enqueueRunJob } from '../queue.js';

type Run = Api.components['schemas']['Run'];
type RunListItem = Api.components['schemas']['RunListItem'];
type RunPreviewPage = Api.components['schemas']['RunPreviewPage'];

interface IdParams {
  wsId: string;
  id: string;
}
interface ListParams {
  wsId: string;
}
interface ListQuery {
  setId?: string;
  status?: Run['status'];
  limit?: string;
  offset?: string;
}
interface PreviewQuery {
  schemaKey: string;
  offset?: string;
  limit?: string;
}

export function registerRunRoutes(app: FastifyInstance, db: MirageDb): void {
  const resolveWorkspace = async (request: FastifyRequest, reply: FastifyReply, wsId: string) => {
    const auth = request.auth;
    if (!auth) {
      await reply.code(401).send({ error: 'unauthenticated' });
      return null;
    }
    const ws = await db.workspaces.findOne({ id: asId<WorkspaceId>(wsId) });
    if (!ws || ws.orgId !== auth.orgId) {
      await reply.code(404).send({ error: 'workspace not found' });
      return null;
    }
    return { auth, workspace: ws };
  };

  app.post<{ Params: IdParams }>('/workspaces/:wsId/sets/:id/run', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    if (ctx.auth.role === 'viewer') {
      return reply.code(403).send({ error: 'viewer cannot run sets' });
    }
    const set = await db.sets.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!set) return reply.code(404).send({ error: 'set not found' });

    const previous = await db.runs.findOne(
      {
        workspaceId: request.params.wsId,
        setId: request.params.id,
        artifactKey: { $exists: true },
      },
      { sort: { createdAt: -1 }, projection: { _id: 0 } },
    );
    if (previous?.artifactKey) {
      try {
        await s3.send(
          new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: previous.artifactKey }),
        );
      } catch (err) {
        request.log.warn({ err, runId: previous.id }, 'failed to evict previous artifact');
      }
      await db.runs.updateOne({ id: previous.id }, { $unset: { artifactKey: '' } });
    }

    const now = new Date().toISOString();
    const run: Run = {
      id: `run_${nanoid(16)}`,
      orgId: ctx.workspace.orgId as string,
      workspaceId: request.params.wsId,
      setId: request.params.id,
      kind: 'full',
      status: 'queued',
      requestedBy: ctx.auth.userId as string,
      createdAt: now,
    };
    await db.runs.insertOne(run as RunDoc);

    await enqueueRunJob({
      runId: asId<RunId>(run.id),
      setId: asId<SetId>(run.setId),
      orgId: asId<OrgId>(run.orgId),
      workspaceId: asId<WorkspaceId>(run.workspaceId),
      requestedBy: asId<UserId>(run.requestedBy),
      kind: 'full',
    });

    return reply.code(201).send(run);
  });

  app.post<{ Params: IdParams }>('/workspaces/:wsId/runs/:id/cancel', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    if (ctx.auth.role === 'viewer') {
      return reply.code(403).send({ error: 'viewer cannot cancel runs' });
    }
    const run = await db.runs.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!run) return reply.code(404).send({ error: 'run not found' });

    await redis.set(cancelFlagKey(asId<RunId>(run.id)), '1', 'EX', 600);
    return reply.code(204).send();
  });

  app.get<{ Params: ListParams; Querystring: ListQuery }>(
    '/workspaces/:wsId/runs',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      const limit = Math.min(
        Math.max(Number.parseInt(request.query.limit ?? '50', 10) || 50, 1),
        500,
      );
      const offset = Math.max(Number.parseInt(request.query.offset ?? '0', 10) || 0, 0);
      const filter: Record<string, unknown> = { workspaceId: request.params.wsId };
      const qSetId = request.query['setId'];
      const qStatus = request.query['status'];
      if (qSetId) filter['setId'] = qSetId;
      if (qStatus) filter['status'] = qStatus;
      const list = await db.runs
        .find(filter, { sort: { createdAt: -1 }, skip: offset, limit, projection: { _id: 0 } })
        .toArray();
      const projected: RunListItem[] = list.map((r) => ({
        id: r.id,
        setId: r.setId,
        status: r.status,
        kind: r.kind,
        ...(r.startedAt ? { startedAt: r.startedAt } : {}),
        ...(r.endedAt ? { endedAt: r.endedAt } : {}),
        ...(r.rowCounts ? { rowCounts: r.rowCounts } : {}),
        ...(r.errorMessage ? { errorMessage: r.errorMessage } : {}),
        requestedBy: r.requestedBy,
        createdAt: r.createdAt,
      }));
      return reply.send(projected);
    },
  );

  app.get<{ Params: IdParams }>('/workspaces/:wsId/runs/:id', async (request, reply) => {
    const ctx = await resolveWorkspace(request, reply, request.params.wsId);
    if (!ctx) return;
    const run = await db.runs.findOne(
      { workspaceId: request.params.wsId, id: request.params.id },
      { projection: { _id: 0 } },
    );
    if (!run) return reply.code(404).send({ error: 'run not found' });
    return reply.send(run);
  });

  app.get<{ Params: IdParams; Querystring: PreviewQuery }>(
    '/workspaces/:wsId/runs/:id/preview',
    async (request, reply) => {
      const ctx = await resolveWorkspace(request, reply, request.params.wsId);
      if (!ctx) return;
      if (!request.query.schemaKey) {
        return reply.code(400).send({ error: 'schemaKey is required' });
      }
      const run = await db.runs.findOne(
        { workspaceId: request.params.wsId, id: request.params.id },
        { projection: { _id: 0 } },
      );
      if (!run) return reply.code(404).send({ error: 'run not found' });
      if (!run.artifactKey) return reply.code(404).send({ error: 'no artifact' });

      const schemaKey = request.query.schemaKey;
      const offset = Math.max(Number.parseInt(request.query.offset ?? '0', 10) || 0, 0);
      const limit = Math.min(
        Math.max(Number.parseInt(request.query.limit ?? '200', 10) || 200, 1),
        1000,
      );
      const knownTotal = run.rowCounts?.[schemaKey];

      let obj;
      try {
        obj = await s3.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: run.artifactKey }));
      } catch (err) {
        if (err instanceof NoSuchKey) return reply.code(404).send({ error: 'artifact missing' });
        throw err;
      }
      if (!obj.Body) return reply.code(500).send({ error: 'empty artifact body' });
      const stream = obj.Body as NodeJS.ReadableStream;

      const rows: unknown[] = [];
      let totalSeen = 0;
      let buf = '';
      const stopEarly = typeof knownTotal === 'number';

      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          stream.removeListener('data', onData);
          stream.removeListener('end', onEnd);
          stream.removeListener('error', onError);
          resolve();
        };
        const onData = (chunk: Buffer) => {
          if (finished) return;
          buf += chunk.toString('utf8');
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line) continue;
            try {
              const parsed = JSON.parse(line) as { __schemaKey?: string };
              if (parsed.__schemaKey !== schemaKey) continue;
              if (totalSeen >= offset && rows.length < limit) rows.push(parsed);
              totalSeen++;
              if (stopEarly && rows.length >= limit) {
                finish();
                return;
              }
            } catch {
              // skip malformed line
            }
          }
        };
        const onEnd = () => {
          if (buf.trim().length > 0) {
            try {
              const parsed = JSON.parse(buf) as { __schemaKey?: string };
              if (parsed.__schemaKey === schemaKey) {
                if (totalSeen >= offset && rows.length < limit) rows.push(parsed);
                totalSeen++;
              }
            } catch {
              // ignore trailing
            }
          }
          finish();
        };
        const onError = (err: Error) => {
          if (finished) return;
          finished = true;
          reject(err);
        };
        stream.on('data', onData);
        stream.on('end', onEnd);
        stream.on('error', onError);
      });

      const total = typeof knownTotal === 'number' ? knownTotal : totalSeen;
      const page: RunPreviewPage = { schemaKey, offset, total, rows };
      return reply.send(page);
    },
  );
}
