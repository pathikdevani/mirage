import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Api } from '@mirage/types';
import { bff } from '../../api/client.js';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';
import { RunStatusBadge } from '../../components/RunStatusBadge.js';

type RunListItem = Api.components['schemas']['RunListItem'];
type Status = Api.components['schemas']['Run']['status'];

const PAGE_SIZE = 50;
const STATUSES: Array<Status | 'all'> = [
  'all',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
];

export function HistoryPage() {
  const { wsId = '' } = useParams<{ wsId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [setIdFilter, setSetIdFilter] = useState<string>('');
  const [offset, setOffset] = useState(0);

  const setsQuery = useQuery({
    enabled: !!wsId,
    queryKey: ['sets', wsId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/sets', {
        params: { path: { wsId } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const runsQuery = useQuery({
    enabled: !!wsId,
    queryKey: ['runs', wsId, status, setIdFilter, offset],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/runs', {
        params: {
          path: { wsId },
          query: {
            limit: PAGE_SIZE,
            offset,
            ...(status !== 'all' ? { status } : {}),
            ...(setIdFilter ? { setId: setIdFilter } : {}),
          },
        },
      });
      if (error) throw error;
      return (data ?? []) as RunListItem[];
    },
  });

  const runs = runsQuery.data ?? [];
  const setsBySetId = new Map((setsQuery.data ?? []).map((s) => [s.id, s]));

  if (
    !runsQuery.isLoading &&
    runs.length === 0 &&
    offset === 0 &&
    status === 'all' &&
    !setIdFilter
  ) {
    return (
      <>
        <PageHeader title="Run history" subtitle="Past generation runs and their outputs." />
        <EmptyStub icon={History} title="No runs yet" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Run history" subtitle="Past generation runs and their outputs." />

      <div className="flex items-center gap-3 px-8 py-3">
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Status
          <select
            value={status}
            onChange={(e) => {
              setOffset(0);
              setStatus(e.target.value as Status | 'all');
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-[12.5px]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Set
          <select
            value={setIdFilter}
            onChange={(e) => {
              setOffset(0);
              setSetIdFilter(e.target.value);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-[12.5px]"
          >
            <option value="">All sets</option>
            {(setsQuery.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-auto px-8">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Run id</th>
              <th className="px-2 py-2 font-medium">Set</th>
              <th className="px-2 py-2 font-medium">Kind</th>
              <th className="px-2 py-2 font-medium">Started</th>
              <th className="px-2 py-2 font-medium">Duration</th>
              <th className="px-2 py-2 font-medium">Total rows</th>
              <th className="px-2 py-2 font-medium">Requested by</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const totalRows = Object.values(r.rowCounts ?? {}).reduce((a, b) => a + b, 0);
              const duration =
                r.startedAt && r.endedAt
                  ? `${Math.round((new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 100) / 10}s`
                  : '—';
              return (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/workspaces/${wsId}/sets?active=${r.setId}`)}
                  className="cursor-pointer border-b border-border/50 hover:bg-accent"
                >
                  <td className="px-2 py-1.5">
                    <RunStatusBadge status={r.status} />
                  </td>
                  <td className="px-2 py-1.5 font-mono">{r.id}</td>
                  <td className="px-2 py-1.5">
                    {setsBySetId.get(r.setId)?.name ?? r.setId}
                  </td>
                  <td className="px-2 py-1.5">{r.kind}</td>
                  <td className="px-2 py-1.5">
                    {r.startedAt ? new Date(r.startedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-2 py-1.5">{duration}</td>
                  <td className="px-2 py-1.5">{totalRows.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.requestedBy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 px-8 py-3 text-[12px] text-muted-foreground">
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
          disabled={runs.length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 hover:bg-accent disabled:opacity-50"
        >
          Next <ChevronRight size={12} />
        </button>
      </div>
    </>
  );
}
