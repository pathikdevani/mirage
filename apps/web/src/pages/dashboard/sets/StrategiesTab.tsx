import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Dices, Link2, Sliders } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../../api/client.js';
import { STRATEGY_TYPES, type Strategy, type StrategyOverride } from './lib/types.js';
import type { SetBuffer } from './useSetBuffer.js';
import type { Api } from '@mirage/types';

type SetEdge = Api.components['schemas']['SetEdge'];
type CustomFunction = Api.components['schemas']['CustomFunction'];

interface StrategiesTabProps {
  wsId: string;
  setId: string;
  buffer: SetBuffer;
  error: string | null;
  onClearError: () => void;
}

const STRATEGY_META: Record<
  '1:1' | 'random' | 'evenSplit' | 'custom',
  { label: string; desc: string; icon: typeof Link2 }
> = {
  '1:1': {
    label: 'Exact 1:1',
    desc: 'Each source row maps to exactly one target. Counts must match.',
    icon: ArrowRight,
  },
  random: {
    label: 'Random pick',
    desc: 'Each source row picks targets at random. Seeded by the Set salt.',
    icon: Dices,
  },
  evenSplit: {
    label: 'Even split',
    desc: 'Distribute target rows evenly across sources.',
    icon: Sliders,
  },
  custom: {
    label: 'Custom function',
    desc: 'Run a user-written function from this workspace.',
    icon: Sliders,
  },
};

export function StrategiesTab({ wsId, setId, buffer, error, onClearError }: StrategiesTabProps) {
  const edgesQuery = useQuery({
    queryKey: ['set-edges', wsId, setId],
    queryFn: async (): Promise<SetEdge[]> => {
      const { data, error: e } = await bff.GET('/workspaces/{wsId}/sets/{id}/edges', {
        params: { path: { wsId, id: setId } },
      });
      if (e) throw e;
      return (data ?? []) as SetEdge[];
    },
    staleTime: 10_000,
  });
  const edges = edgesQuery.data ?? [];

  const fnsQuery = useQuery({
    queryKey: ['custom-functions', wsId, 'usage=strategy'],
    queryFn: async (): Promise<CustomFunction[]> => {
      const { data, error: e } = await bff.GET('/workspaces/{wsId}/custom-functions', {
        params: { path: { wsId }, query: { usage: 'strategy' } },
      });
      if (e) throw e;
      return (data ?? []) as CustomFunction[];
    },
    staleTime: 30_000,
  });
  const strategyFns = fnsQuery.data ?? [];

  const [activeIdx, setActiveIdx] = useState(0);
  const activeEdge = edges[activeIdx];

  const overrideByKey = useMemo(() => {
    const m = new Map<string, StrategyOverride>();
    for (const ov of buffer.draft.strategies) {
      m.set(`${ov.schemaKey}::${ov.fieldPath}`, ov);
    }
    return m;
  }, [buffer.draft.strategies]);

  const currentOverride = activeEdge
    ? overrideByKey.get(`${activeEdge.fromSchemaKey}::${activeEdge.fromFieldPath}`)
    : undefined;
  const currentStrategy: Strategy = currentOverride?.strategy ?? { type: '1:1' };

  const setStrategy = (next: Strategy): void => {
    if (!activeEdge) return;
    const key = `${activeEdge.fromSchemaKey}::${activeEdge.fromFieldPath}`;
    buffer.setDraft((prev) => {
      const draft = structuredClone(prev);
      const idx = draft.strategies.findIndex((o) => `${o.schemaKey}::${o.fieldPath}` === key);
      const ov: StrategyOverride = {
        schemaKey: activeEdge.fromSchemaKey,
        fieldPath: activeEdge.fromFieldPath,
        strategy: next,
      };
      if (idx >= 0) draft.strategies[idx] = ov;
      else draft.strategies.push(ov);
      return draft;
    });
    onClearError();
  };

  if (edgesQuery.isLoading) {
    return <div className="p-8 text-[13px] text-muted-foreground">Loading edges…</div>;
  }
  if (edges.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 py-16 text-center">
        <Link2 size={28} strokeWidth={1.5} className="text-muted-foreground" />
        <h3 className="text-[15px] font-semibold text-foreground">No cross-schema references</h3>
        <p className="max-w-md text-[13px] text-muted-foreground">
          None of the included schemas reference each other. Strategies only apply when at least two
          included schemas are linked by a <span className="font-mono">$ref</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[minmax(320px,1fr)_minmax(320px,1fr)] gap-4 p-8">
      <section className="rounded-xl border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <h3 className="text-[14px] font-semibold text-foreground">
            Cross-reference edges
            <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {edges.length}
            </span>
          </h3>
          <p className="text-[12px] text-muted-foreground">
            Pick how each reference resolves at run time.
          </p>
        </header>
        <ul>
          {edges.map((e, i) => {
            const ov = overrideByKey.get(`${e.fromSchemaKey}::${e.fromFieldPath}`);
            const stratLabel =
              STRATEGY_META[(ov?.strategy.type ?? '1:1') as keyof typeof STRATEGY_META].label;
            return (
              <li key={`${e.fromSchemaKey}-${e.fromFieldPath}`}>
                <button
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    'flex w-full items-center gap-3 border-b border-border px-5 py-3 text-left last:border-b-0 hover:bg-accent/40',
                    i === activeIdx && 'bg-accent/60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[12.5px] text-foreground">
                      {e.fromSchemaKey}.{e.fromFieldPath}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ArrowRight size={11} />
                      <span className="font-mono">{e.toSchemaKey}</span>
                      <span>· {e.cardinality}</span>
                    </div>
                  </div>
                  <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10.5px] font-medium text-foreground">
                    {stratLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <h3 className="text-[14px] font-semibold text-foreground">
            Strategy ·{' '}
            {STRATEGY_META[currentStrategy.type as keyof typeof STRATEGY_META]?.label ??
              currentStrategy.type}
          </h3>
          {activeEdge && (
            <p className="font-mono text-[12px] text-muted-foreground">
              {activeEdge.fromSchemaKey}.{activeEdge.fromFieldPath} → {activeEdge.toSchemaKey}
            </p>
          )}
        </header>
        {error && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-[12.5px] text-destructive">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-3 p-5">
          <div className="grid grid-cols-2 gap-2">
            {STRATEGY_TYPES.map((t) => {
              const meta = STRATEGY_META[t];
              const active = currentStrategy.type === t;
              const Icon = meta.icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setStrategy(t === 'random' ? { type: 'random' } : { type: t })}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border bg-background p-3 text-left',
                    active ? 'border-foreground' : 'border-input hover:bg-accent/40',
                  )}
                >
                  <Icon size={14} className="mt-0.5 flex-none" />
                  <div>
                    <div className="text-[12.5px] font-semibold text-foreground">{meta.label}</div>
                    <div className="text-[11.5px] text-muted-foreground">{meta.desc}</div>
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                const first = strategyFns[0];
                if (first) setStrategy({ type: 'custom', functionId: first.id });
                else setStrategy({ type: 'custom', functionId: '' });
              }}
              className={cn(
                'flex items-start gap-2 rounded-lg border bg-background p-3 text-left',
                currentStrategy.type === 'custom'
                  ? 'border-foreground'
                  : 'border-input hover:bg-accent/40',
                strategyFns.length === 0 && 'opacity-60',
              )}
            >
              <Sliders size={14} className="mt-0.5 flex-none" />
              <div>
                <div className="text-[12.5px] font-semibold text-foreground">Custom function</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {strategyFns.length === 0
                    ? 'No strategy functions yet — create one on the Functions page.'
                    : 'Pick one of your workspace functions.'}
                </div>
              </div>
            </button>
          </div>

          {currentStrategy.type === 'custom' && (
            <div className="mt-2 flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                Function
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-[13px] text-foreground"
                value={currentStrategy.functionId}
                onChange={(e) => setStrategy({ type: 'custom', functionId: e.target.value })}
              >
                {strategyFns.length === 0 ? (
                  <option value="">No strategy functions available</option>
                ) : (
                  strategyFns.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.usage})
                    </option>
                  ))
                )}
              </select>
              {strategyFns.length === 0 && (
                <span className="text-[11.5px] text-muted-foreground">
                  Create a function with usage &ldquo;Strategy&rdquo; or &ldquo;Both&rdquo; on the
                  Functions page first.
                </span>
              )}
            </div>
          )}

          {currentStrategy.type === 'random' && activeEdge?.cardinality === 'many' && (
            <label className="mt-2 inline-flex items-center gap-2 text-[12.5px] text-foreground">
              <input
                type="checkbox"
                checked={Boolean(currentStrategy.allowDuplicates)}
                onChange={(e) => setStrategy({ type: 'random', allowDuplicates: e.target.checked })}
              />
              Allow duplicate target ids within a single source row&rsquo;s array
            </label>
          )}
        </div>
      </section>
    </div>
  );
}
