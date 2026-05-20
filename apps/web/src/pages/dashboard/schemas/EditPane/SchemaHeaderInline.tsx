import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Tag, Trash2, X } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { BrandColor, IconName, Schema } from '../lib/types.js';
import { IdentityPopover } from '../IdentityPopover.js';

export interface SchemaHeaderInlineProps {
  draft: Schema;
  onChange: (patch: Partial<Pick<Schema, 'name' | 'key' | 'description' | 'color' | 'icon' | 'tags'>>) => void;
  nameError?: string | null;
  keyError?: string | null;
  onRequestDelete: () => void;
}

export function SchemaHeaderInline({
  draft,
  onChange,
  nameError,
  keyError,
  onRequestDelete,
}: SchemaHeaderInlineProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex flex-none flex-col gap-2 border-b border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <IdentityPopover
          color={draft.color as BrandColor}
          icon={draft.icon as IconName}
          onChange={(next) => onChange({ color: next.color, icon: next.icon })}
          compact
        />
        <NameField
          value={draft.name}
          onCommit={(v) => onChange({ name: v })}
          {...(nameError ? { error: nameError } : {})}
        />
        <KeyField
          value={draft.key}
          onCommit={(v) => onChange({ key: v })}
          {...(keyError ? { error: keyError } : {})}
        />
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
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRequestDelete();
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
      <DescriptionField
        value={draft.description ?? ''}
        onCommit={(v) => onChange({ description: v })}
      />
      <TagsField value={draft.tags ?? []} onChange={(next) => onChange({ tags: next })} />
    </div>
  );
}

function NameField({
  value,
  onCommit,
  error,
}: {
  value: string;
  onCommit: (v: string) => void;
  error?: string | null;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="min-w-0 flex-none">
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const trimmed = local.trim();
          if (trimmed && trimmed !== value) onCommit(trimmed);
          else setLocal(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setLocal(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Schema name"
        maxLength={80}
        className={cn(
          'h-8 min-w-[140px] rounded-md border bg-background px-2 text-[15px] font-semibold tracking-[-0.01em] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10',
          error ? 'border-destructive' : 'border-transparent hover:border-input',
        )}
        title={error ?? undefined}
      />
    </div>
  );
}

function KeyField({
  value,
  onCommit,
  error,
}: {
  value: string;
  onCommit: (v: string) => void;
  error?: string | null;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const trimmed = local.trim();
        if (trimmed && trimmed !== value) onCommit(trimmed);
        else setLocal(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setLocal(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="key"
      maxLength={40}
      className={cn(
        'h-7 w-[140px] rounded border bg-muted px-2 font-mono text-[11px] text-muted-foreground outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10',
        error ? 'border-destructive text-destructive' : 'border-transparent hover:border-input',
      )}
      title={error ?? undefined}
    />
  );
}

function DescriptionField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <textarea
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      rows={1}
      maxLength={500}
      placeholder="Add a description…"
      className="w-full resize-none rounded-md border border-transparent bg-background px-2 py-1 text-[12.5px] text-muted-foreground outline-none placeholder:text-muted-foreground/60 hover:border-input focus:border-ring focus:ring-[2px] focus:ring-ring/10"
    />
  );
}

function TagsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (t: string): void => {
    const trimmed = t.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setDraft('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
        >
          <Tag size={9} />
          {t}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== t))}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${t}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        placeholder={value.length === 0 ? 'add tags…' : ''}
        className="h-6 min-w-[60px] flex-1 rounded border-none bg-transparent px-1 text-[11.5px] outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}
