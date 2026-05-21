import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Api } from '@mirage/types';
import type { Schema } from '../lib/types.js';
import { JsonNode } from './JsonNode.js';

type DryRunResponse = Api.components['schemas']['DryRunSchemaResponse'];

export interface PreviewTabContentProps {
  draft: Schema;
  count: number;
  onCountChange: (n: number) => void;
  data: DryRunResponse | null;
  isLoading: boolean;
  error: string | null;
  validationError: string | null;
}

export function PreviewTabContent({
  draft,
  count,
  onCountChange,
  data,
  isLoading,
  error,
  validationError,
}: PreviewTabContentProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center justify-between border-b border-border px-4 py-2 text-[12px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Rows</span>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n)) onCountChange(Math.max(1, Math.min(10, n)));
            }}
            className="h-7 w-14 rounded-md border border-input bg-background px-2 text-[12px] outline-none focus:border-ring"
          />
        </div>
        {isLoading && <span className="text-[11px] text-muted-foreground">Generating…</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 text-[12px] font-mono">
        {validationError ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-sans text-[12px] text-amber-700 dark:text-amber-400">
            <div className="font-medium">Fix errors to preview</div>
            <div className="mt-1 text-muted-foreground">{validationError}</div>
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-sans text-[12px] text-destructive">
            Preview unavailable: {error}
          </div>
        ) : !data ? (
          <div className="text-muted-foreground font-sans">Generating preview…</div>
        ) : (
          <div className="flex flex-col gap-4">
            <Section title={draft.key} count={data.rows.length} defaultOpen>
              {data.rows.map((row, i) => (
                <div key={i} className="mb-2">
                  <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Row {i + 1}
                  </div>
                  <JsonNode value={row} initiallyOpen />
                </div>
              ))}
            </Section>

            {Object.entries(data.refs).map(([key, rows]) => (
              <Section key={key} title={key} count={rows.length} subtitle="referenced">
                {rows.map((row, i) => (
                  <div key={i} className="mb-2">
                    <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Row {i + 1}
                    </div>
                    <JsonNode value={row} initiallyOpen={false} />
                  </div>
                ))}
              </Section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  count: number;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, count, subtitle, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-border bg-background/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-sans text-[12px] font-medium hover:bg-accent/40"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-mono text-foreground">{title}</span>
        {subtitle && <span className="text-[11px] text-muted-foreground">· {subtitle}</span>}
        <span className="ml-auto text-[11px] text-muted-foreground">{count}</span>
      </button>
      {open && <div className="border-t border-border px-3 py-2">{children}</div>}
    </div>
  );
}
