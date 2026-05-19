import { useMemo, useState } from 'react';
import { ArrowRight, Copy, Link2, Tag } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { BrandColor, IconName, SchemaProp } from '../lib/types.js';
import { COLOR_BG } from '../lib/colors.js';
import { resolveIcon } from '../lib/icon.js';
import { countTreeStats, findRefs } from '../lib/treeStats.js';
import { rootSchemaToJson } from '../lib/rowToSchema.js';

interface Step3Props {
  name: string;
  schemaKey: string;
  description: string;
  color: BrandColor;
  icon: IconName;
  tagsInput: string;
  rows: SchemaProp[];
}

export function Step3Review({
  name,
  schemaKey,
  description,
  color,
  icon,
  tagsInput,
  rows,
}: Step3Props) {
  const Icon = resolveIcon(icon);
  const stats = countTreeStats(rows);
  const refs = useMemo(() => findRefs(rows), [rows]);
  const tags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const json = useMemo(
    () => rootSchemaToJson(rows, schemaKey, name, description),
    [rows, schemaKey, name, description],
  );
  const jsonString = useMemo(() => JSON.stringify(json, null, 2), [json]);

  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    navigator.clipboard?.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-12 w-12 flex-none items-center justify-center rounded-lg text-white',
              COLOR_BG[color],
            )}
          >
            <Icon size={22} strokeWidth={2} />
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold text-foreground">
                {name || 'Untitled'}
              </h3>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {schemaKey || '—'}
              </span>
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10.5px]"
                >
                  <Tag size={9} /> {t}
                </span>
              ))}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {description || 'No description'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Fields" value={stats.total} />
        <StatCard label="Required" value={stats.required} />
        <StatCard label="References" value={refs.length} accent="violet" />
        <StatCard label="Max depth" value={stats.maxDepth} accent="amber" />
      </div>

      {refs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h4 className="text-[13px] font-semibold text-foreground">
              Cross-schema dependencies
            </h4>
            <span className="rounded bg-brand-violet/10 px-1.5 py-0.5 text-[10.5px] font-medium text-brand-violet">
              {refs.length}
            </span>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3">
            {refs.map((r) => (
              <div key={r.path} className="flex items-center gap-2 font-mono text-[12px]">
                <span>
                  <b>{schemaKey || 'this'}</b>.{r.path}
                </span>
                <ArrowRight size={11} className="text-muted-foreground" />
                <span className="inline-flex items-center gap-1 rounded bg-brand-violet/10 px-1.5 py-0.5 text-brand-violet">
                  <Link2 size={10} />
                  <b>{r.targetKey}</b>.{r.targetField}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-foreground">
            Generated JSON Schema
          </h4>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11.5px] text-foreground hover:bg-accent"
          >
            <Copy size={11} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="m-0 max-h-[360px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11.5px] leading-relaxed text-foreground">
          {jsonString}
        </pre>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  accent?: 'violet' | 'amber';
}

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-[22px] font-semibold',
          accent === 'violet' && 'text-brand-violet',
          accent === 'amber' && 'text-brand-amber',
          !accent && 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}
