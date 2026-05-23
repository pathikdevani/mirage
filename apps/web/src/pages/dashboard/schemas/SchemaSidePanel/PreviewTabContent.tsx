import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { Api } from '@mirage/types';
import type { Schema } from '../lib/types.js';
import type { PreviewError } from './useSchemaDryRun.js';
import { JsonNode } from './JsonNode.js';

type DryRunResponse = Api.components['schemas']['DryRunSchemaResponse'];

export interface PreviewTabContentProps {
  draft: Schema;
  count: number;
  onCountChange: (n: number) => void;
  data: DryRunResponse | null;
  isLoading: boolean;
  error: PreviewError | null;
  validationError: PreviewError | null;
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
    <div className="flex h-full min-w-0 flex-col">
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
          <PreviewErrorCard kind="validation" err={validationError} />
        ) : error ? (
          <PreviewErrorCard kind="error" err={error} />
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
    <div className="min-w-0 rounded-md border border-border bg-background/50">
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
      {open && <div className="min-w-0 border-t border-border px-3 py-2">{children}</div>}
    </div>
  );
}

interface PreviewErrorCardProps {
  kind: 'validation' | 'error';
  err: PreviewError;
}

function PreviewErrorCard({ kind, err }: PreviewErrorCardProps) {
  const [showRaw, setShowRaw] = useState(false);
  const isValidation = kind === 'validation';
  const tone = isValidation
    ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
    : 'border-destructive/30 bg-destructive/5 text-destructive';
  const heading = isValidation
    ? 'Fix errors to preview'
    : err.code
      ? `Preview failed · ${err.code}`
      : 'Preview failed';

  const engine = err.engine;
  const extraDetail =
    !engine && err.detail && typeof err.detail === 'object'
      ? (err.detail as Record<string, unknown>)
      : null;

  return (
    <div className={`rounded-md border px-3 py-2 font-sans text-[12px] ${tone}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle size={13} className="mt-[2px] flex-none" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{heading}</div>
          <div className="mt-1 text-muted-foreground">{err.message}</div>

          {engine && (
            <div className="mt-2 space-y-1 rounded border border-current/20 bg-background/60 p-2 font-mono text-[11.5px]">
              <div>
                <span className="text-muted-foreground">engine code:</span>{' '}
                <span className="text-foreground">{engine.code}</span>
              </div>
              {engine.fieldPath && (
                <div>
                  <span className="text-muted-foreground">field:</span>{' '}
                  <span className="text-foreground">{engine.fieldPath}</span>
                </div>
              )}
              {engine.cycle && engine.cycle.length > 0 && (
                <div>
                  <span className="text-muted-foreground">cycle:</span>{' '}
                  <span className="text-foreground">{engine.cycle.join(' → ')}</span>
                </div>
              )}
              {Object.entries(engine.rest).map(([k, v]) => (
                <div key={k} className="break-all">
                  <span className="text-muted-foreground">{k}:</span>{' '}
                  <span className="text-foreground">{stringify(v)}</span>
                </div>
              ))}
            </div>
          )}

          {extraDetail && (
            <pre className="mt-2 max-h-40 overflow-auto rounded border border-current/20 bg-background/60 p-2 font-mono text-[11px] text-foreground">
              {JSON.stringify(extraDetail, null, 2)}
            </pre>
          )}

          {(err.status !== undefined || err.code) && (
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              {showRaw ? 'Hide' : 'Show'} raw response
            </button>
          )}
          {showRaw && (
            <pre className="mt-1 max-h-60 overflow-auto rounded border border-current/20 bg-background/60 p-2 font-mono text-[11px] text-foreground">
              {JSON.stringify(
                { status: err.status, code: err.code, message: err.message, detail: err.detail },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
