import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Box, Code2, Database } from 'lucide-react';
import { extractFnRefs } from '@mirage/engine';
import { bff } from '../../../api/client.js';
import type { Api } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];
type MirageSet = Api.components['schemas']['Set'];

interface UsagePaneProps {
  wsId: string;
  functionId: string;
}

export function UsagePane({ wsId, functionId }: UsagePaneProps) {
  const navigate = useNavigate();
  const schemas = useQuery({
    queryKey: ['schemas', wsId],
    queryFn: async (): Promise<Schema[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/schemas', {
        params: { path: { wsId } },
      });
      if (error) throw error;
      return (data ?? []) as Schema[];
    },
    staleTime: 30_000,
  });
  const sets = useQuery({
    queryKey: ['sets', wsId],
    queryFn: async (): Promise<MirageSet[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/sets', {
        params: { path: { wsId } },
      });
      if (error) throw error;
      return (data ?? []) as MirageSet[];
    },
    staleTime: 30_000,
  });

  const schemaRefs = (schemas.data ?? [])
    .flatMap((s) => extractFnRefs([s]).filter((r) => r.functionId === functionId))
    .map((r) => ({
      schemaKey: r.schemaKey,
      fieldPath: r.fieldPath,
      schema: schemas.data?.find((s) => s.key === r.schemaKey),
    }));

  const setRefs = (sets.data ?? []).flatMap((s) =>
    s.strategies
      .filter(
        (ov) =>
          ov.strategy.type === 'custom' &&
          (ov.strategy as { functionId: string }).functionId === functionId,
      )
      .map((ov) => ({ setKey: s.key, set: s, edge: `${ov.schemaKey}.${ov.fieldPath}` })),
  );

  return (
    <aside className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex-none border-b border-border px-4 py-3">
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
          Used by
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {schemaRefs.length === 0 && setRefs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Code2 size={20} className="text-muted-foreground" />
            <p className="max-w-[200px] text-[12px] text-muted-foreground">
              Not used yet — pick this in a schema&rsquo;s Value generator picker or a set&rsquo;s
              Strategies tab.
            </p>
          </div>
        )}

        {schemaRefs.length > 0 && (
          <section className="mb-3">
            <div className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Schemas ({schemaRefs.length})
            </div>
            <ul className="flex flex-col gap-1">
              {schemaRefs.map((r) => (
                <li key={`${r.schemaKey}-${r.fieldPath}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (r.schema) {
                        navigate(`/workspaces/${wsId}/schemas?active=${r.schema.id}`);
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-[12px] hover:bg-accent/40"
                  >
                    <Database size={12} className="flex-none text-muted-foreground" />
                    <span className="font-mono">
                      <b>{r.schemaKey}</b>
                      <span className="text-muted-foreground">.</span>
                      {r.fieldPath}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {setRefs.length > 0 && (
          <section>
            <div className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sets ({setRefs.length})
            </div>
            <ul className="flex flex-col gap-1">
              {setRefs.map((r) => (
                <li key={`${r.setKey}-${r.edge}`}>
                  <button
                    type="button"
                    onClick={() => navigate(`/workspaces/${wsId}/sets?active=${r.set.id}`)}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-[12px] hover:bg-accent/40"
                  >
                    <Box size={12} className="flex-none text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono">{r.setKey}</div>
                      <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {r.edge}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
