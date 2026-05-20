import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { StructuralChange } from './useSchemaBuffer.js';

export type SaveBarBanner =
  | { kind: 'stale'; message: string; action?: { label: string; onClick: () => void } }
  | { kind: 'rewrite_failed'; message: string };

export interface SaveBarProps {
  dirty: boolean;
  changes: StructuralChange[];
  saving: boolean;
  hasBlockingErrors: boolean;
  onDiscard: () => void;
  onSave: () => void;
  banner?: SaveBarBanner | null;
}

export function SaveBar({
  dirty,
  changes,
  saving,
  hasBlockingErrors,
  onDiscard,
  onSave,
  banner,
}: SaveBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!dirty && !banner) return null;

  const warnings = changes.filter((c) => c.kind !== 'type_narrowed' || c);
  const handleSaveClick = (): void => {
    if (changes.length > 0) setConfirming(true);
    else onSave();
  };

  return (
    <>
      <div className="sticky bottom-0 z-20 flex-none border-t border-border bg-card">
        {banner && (
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-[12.5px]',
              'border-b border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            <AlertTriangle size={13} />
            <span className="flex-1">{banner.message}</span>
            {banner.kind === 'stale' && banner.action && (
              <button
                type="button"
                onClick={banner.action.onClick}
                className="rounded-md border border-destructive/40 bg-background px-2 py-1 text-[11.5px] font-medium text-destructive hover:bg-destructive/10"
              >
                {banner.action.label}
              </button>
            )}
          </div>
        )}

        {dirty && expanded && warnings.length > 0 && (
          <div className="border-b border-border bg-muted/40 px-4 py-2">
            <ul className="flex flex-col gap-1 text-[12px] text-muted-foreground">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle size={11} className="mt-0.5 flex-none text-brand-amber" />
                  <span>{describeChange(w)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-2">
          <div className="text-[12.5px]">
            {dirty ? (
              <>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                  disabled={changes.length === 0}
                >
                  {changes.length === 0
                    ? 'Unsaved changes'
                    : `${changes.length} structural change${changes.length === 1 ? '' : 's'}`}
                  {changes.length > 0 &&
                    (expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </button>
              </>
            ) : (
              <span className="text-muted-foreground">No unsaved changes</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              disabled={!dirty || saving}
              className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={!dirty || hasBlockingErrors || saving}
              className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 className="text-[15px] font-semibold text-foreground">Save these changes?</h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              The following changes affect other schemas in this workspace.
            </p>
            <ul className="mt-3 flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-3 text-[12.5px] text-foreground">
              {changes.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle size={11} className="mt-0.5 flex-none text-brand-amber" />
                  <span>{describeChange(c)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onSave();
                }}
                className="h-9 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background hover:opacity-90"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function describeChange(c: StructuralChange): string {
  switch (c.kind) {
    case 'key_renamed':
      return `Renaming key '${c.from}' → '${c.to}'.${
        c.affectedSchemas.length > 0
          ? ` Updates references in ${c.affectedSchemas.length} schema${
              c.affectedSchemas.length === 1 ? '' : 's'
            } (${c.affectedSchemas.join(', ')}).`
          : ''
      }`;
    case 'prop_removed':
      return `Removing '${c.path}'.${
        c.referrers.length > 0
          ? ` Referenced by ${c.referrers.length} schema${
              c.referrers.length === 1 ? '' : 's'
            } (${c.referrers.map((r) => r.schemaKey).join(', ')}).`
          : ''
      }`;
    case 'type_narrowed':
      return `Type changed at '${c.path}' (${c.from} → ${c.to}).`;
  }
}
