import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Api } from '@mirage/types';
import { bff } from '../../../api/client.js';
import { RunStatusBadge } from '../../../components/RunStatusBadge.js';
import type { MirageSet } from './lib/types.js';

type RunListItem = Api.components['schemas']['RunListItem'];
type RunPreviewPage = Api.components['schemas']['RunPreviewPage'];

interface Props {
  wsId: string;
  set: MirageSet;
}

const PAGE_SIZE = 200;

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function PreviewTab({ wsId, set }: Props) {
  const latestQuery = useQuery({
    queryKey: ['runs', wsId, 'latest-for-set', set.id],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/runs', {
        params: { path: { wsId }, query: { setId: set.id, limit: 1 } },
      });
      if (error) throw error;
      return ((data ?? []) as RunListItem[])[0] ?? null;
    },
    refetchInterval: (query) => {
      const r = query.state.data as RunListItem | null | undefined;
      return r && (r.status === 'queued' || r.status === 'running') ? 1500 : false;
    },
  });

  const run = latestQuery.data ?? null;
  const schemaKeys = useMemo(() => Object.keys(run?.rowCounts ?? {}), [run]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!activeKey && schemaKeys.length > 0) setActiveKey(schemaKeys[0]!);
  }, [activeKey, schemaKeys]);

  useEffect(() => {
    setOffset(0);
  }, [activeKey]);

  const previewQuery = useQuery({
    enabled: !!run && run.status === 'completed' && !!activeKey,
    queryKey: ['run-preview', wsId, run?.id, activeKey, offset],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/runs/{id}/preview', {
        params: {
          path: { wsId, id: run!.id },
          query: { schemaKey: activeKey!, offset, limit: PAGE_SIZE },
        },
      });
      if (error) throw error;
      return data as RunPreviewPage;
    },
  });

  if (!run || run.status !== 'completed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Sparkles size={26} strokeWidth={1.5} />
        </span>
        <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
          Preview rows after a run
        </h3>
        <p className="max-w-md text-[13px] text-muted-foreground">
          Click <b>Run set</b> above. When the run completes, rows will appear here.
        </p>
      </div>
    );
  }

  const totalRows = Object.values(run.rowCounts ?? {}).reduce((a, b) => a + b, 0);
  const duration =
    run.startedAt && run.endedAt
      ? `${Math.round((new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()) / 100) / 10}s`
      : '—';

  const rows = previewQuery.data?.rows ?? [];
  const total = previewQuery.data?.total ?? run.rowCounts?.[activeKey ?? ''] ?? 0;
  const columns = ((): string[] => {
    const keys = new Set<string>();
    for (const r of rows.slice(0, 10)) {
      if (r && typeof r === 'object') {
        for (const k of Object.keys(r as object)) {
          if (k !== '__schemaKey' && k !== '__id') keys.add(k);
        }
      }
    }
    return [...keys];
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center gap-4 border-b border-border px-8 py-3">
        <RunStatusBadge status={run.status} />
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="font-mono">salt: {set.salt}</span>
          <span>·</span>
          <span>{totalRows.toLocaleString()} rows</span>
          <span>·</span>
          <span>{duration}</span>
        </div>
      </div>

      <nav className="flex flex-none items-center gap-1 border-b border-border px-8">
        {schemaKeys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setActiveKey(k)}
            className={`px-3 py-2 text-[12.5px] ${k === activeKey ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {k}{' '}
            <span className="ml-1 text-muted-foreground">
              ({(run.rowCounts?.[k] ?? 0).toLocaleString()})
            </span>
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto px-8 py-4">
        {previewQuery.isLoading ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No rows.</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {columns.map((c) => (
                  <th key={c} className="px-2 py-1 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  {columns.map((c) => (
                    <td key={c} className="px-2 py-1 font-mono">
                      {formatCell((r as Record<string, unknown>)[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-none items-center justify-between border-t border-border px-8 py-2 text-[12px] text-muted-foreground">
        <span>
          {rows.length === 0
            ? '0 rows'
            : `${(offset + 1).toLocaleString()}–${(offset + rows.length).toLocaleString()} of ${total.toLocaleString()}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={offset <= 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 hover:bg-accent disabled:opacity-50"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <button
            type="button"
            disabled={offset + rows.length >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 hover:bg-accent disabled:opacity-50"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
