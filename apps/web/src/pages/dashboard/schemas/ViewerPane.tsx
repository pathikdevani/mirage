import { useState } from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { Schema } from './lib/types.js';
import { COLOR_BG } from './lib/colors.js';
import { resolveIcon } from './lib/icon.js';
import { countTreeStats } from './lib/treeStats.js';
import { PropertyTree } from './PropertyTree.js';

interface ViewerPaneProps {
  schema: Schema;
  onDelete: () => void;
  deleteError: { referrers: string[] } | null;
  onClearDeleteError: () => void;
  onSelectReferrer: (key: string) => void;
}

export function ViewerPane({
  schema,
  onDelete,
  deleteError,
  onClearDeleteError,
  onSelectReferrer,
}: ViewerPaneProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const Icon = resolveIcon(schema.icon);
  const stats = countTreeStats(schema.properties);

  return (
    <section className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex h-12 flex-none items-center gap-3 border-b border-border bg-card px-4">
        <span
          className={cn(
            'flex h-7 w-7 flex-none items-center justify-center rounded-md text-white',
            COLOR_BG[schema.color],
          )}
        >
          <Icon size={14} strokeWidth={2} />
        </span>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          {schema.name}
        </h2>
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {schema.key}
        </span>
        {schema.description && (
          <span className="ml-2 truncate text-[12px] text-muted-foreground">
            {schema.description}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="More"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirming(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-destructive hover:bg-destructive/5"
                  >
                    <Trash2 size={13} />
                    Delete schema
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-none items-center gap-4 border-b border-border bg-background px-4 py-2.5">
        <div className="text-[12px] text-muted-foreground">
          <b className="text-foreground">{stats.total}</b> fields ·{' '}
          <b className="text-foreground">{stats.required}</b> required ·{' '}
          <b className="text-brand-violet">{stats.refs}</b> refs · max depth{' '}
          <b className="text-foreground">{stats.maxDepth}</b>
        </div>
        <div className="ml-auto">
          <span className="rounded-md border-b-2 border-foreground px-1 pb-1 text-[12px] font-medium text-foreground">
            Properties
          </span>
        </div>
      </div>

      {deleteError && (
        <div className="flex flex-none items-start gap-3 border-b border-destructive/40 bg-destructive/5 px-4 py-3 text-[12.5px]">
          <div className="flex-1">
            <div className="font-medium text-destructive">
              Cannot delete — referenced by other schemas
            </div>
            <div className="mt-1 text-muted-foreground">
              Delete or update these first:{' '}
              {deleteError.referrers.map((k, i) => (
                <span key={k}>
                  <button
                    type="button"
                    onClick={() => onSelectReferrer(k)}
                    className="font-mono text-foreground underline decoration-dotted underline-offset-2 hover:text-brand-violet"
                  >
                    {k}
                  </button>
                  {i < deleteError.referrers.length - 1 && ', '}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClearDeleteError}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <PropertyTree rows={schema.properties} />
      </div>

      {confirming && (
        <ConfirmDeleteModal
          schemaKey={schema.key}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onDelete();
          }}
        />
      )}
    </section>
  );
}

interface ConfirmDeleteModalProps {
  schemaKey: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDeleteModal({
  schemaKey,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="text-[15px] font-semibold text-foreground">
          Delete <span className="font-mono">{schemaKey}</span>?
        </h3>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          This cannot be undone. Any data generated from this schema is unaffected.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md bg-destructive px-3 text-[12.5px] font-medium text-destructive-foreground hover:opacity-90"
          >
            Delete schema
          </button>
        </div>
      </div>
    </div>
  );
}
