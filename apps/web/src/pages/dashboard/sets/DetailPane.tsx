import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Eye,
  Link2,
  MoreHorizontal,
  Shuffle,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../../api/client.js';
import { BRAND_COLOR_BG } from './lib/colors.js';
import { IconByName } from './lib/icon.js';
import { makeSetServerErrorHandler, type ServerError } from './lib/mapServerError.js';
import type { MirageSet, UpdateSetBody } from './lib/types.js';
import { useSetBuffer } from './useSetBuffer.js';
import { ConfigTab } from './ConfigTab.js';
import { StrategiesTab } from './StrategiesTab.js';
import { PreviewTab } from './PreviewTab.js';
import { RunControl } from './RunControl.js';

type Tab = 'config' | 'strategies' | 'preview';

interface DetailPaneProps {
  wsId: string;
  set: MirageSet;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
}

export function DetailPane({ wsId, set, onDirtyChange, onDeleted }: DetailPaneProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('config');
  const buffer = useSetBuffer(set);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [genericBanner, setGenericBanner] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [schemasError, setSchemasError] = useState<string | null>(null);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [strategiesError, setStrategiesError] = useState<string | null>(null);

  useEffect(() => {
    onDirtyChange(buffer.isDirty);
  }, [buffer.isDirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: async (): Promise<MirageSet> => {
      const body: UpdateSetBody = {
        key: buffer.draft.key,
        name: buffer.draft.name,
        ...(buffer.draft.description ? { description: buffer.draft.description } : {}),
        color: buffer.draft.color,
        icon: buffer.draft.icon,
        tags: buffer.draft.tags,
        salt: buffer.draft.salt,
        schemas: buffer.draft.schemas,
        strategies: buffer.draft.strategies,
        output: buffer.draft.output,
        expectedUpdatedAt: buffer.original.updatedAt,
      };
      const { data, error } = await bff.PUT('/workspaces/{wsId}/sets/{id}', {
        params: { path: { wsId, id: set.id } },
        body,
      });
      if (error) throw error as ServerError;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: async (next) => {
      buffer.setOriginal(next);
      buffer.setDraft(next);
      setGenericBanner(null);
      setNameError(null);
      setKeyError(null);
      setSchemasError(null);
      setOutputError(null);
      setStrategiesError(null);
      await queryClient.invalidateQueries({ queryKey: ['sets', wsId] });
      await queryClient.invalidateQueries({ queryKey: ['set', wsId, set.id] });
      await queryClient.invalidateQueries({ queryKey: ['set-edges', wsId, set.id] });
    },
    onError: makeSetServerErrorHandler({
      setNameError,
      setKeyError,
      setSchemasError,
      setOutputError,
      setStrategiesError,
      setGenericBanner,
    }),
  });

  const del = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await bff.DELETE('/workspaces/{wsId}/sets/{id}', {
        params: { path: { wsId, id: set.id } },
      });
      if (error) throw error as ServerError;
    },
    onSuccess: async () => {
      onDirtyChange(false);
      await queryClient.invalidateQueries({ queryKey: ['sets', wsId] });
      onDeleted();
    },
    onError: (e: ServerError) => {
      setGenericBanner(e.error ?? 'Failed to delete set.');
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-none items-start gap-3 border-b border-border px-8 py-5">
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl text-white',
            BRAND_COLOR_BG[buffer.draft.color],
          )}
        >
          <IconByName name={buffer.draft.icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-semibold tracking-[-0.01em] text-foreground">
            {buffer.draft.name}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-md border border-border bg-background px-2 py-1 text-[11.5px] font-mono text-foreground">
              <Shuffle size={11} className="-mt-0.5 mr-1 inline" />
              {buffer.draft.salt}
            </span>
            <button
              type="button"
              onClick={() =>
                buffer.setDraft((d) => ({
                  ...d,
                  salt: 'mirage-' + Math.random().toString(36).slice(2, 10),
                }))
              }
              className="rounded-md border border-input bg-background px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-accent"
              title="Regenerate salt"
            >
              <Shuffle size={11} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RunControl wsId={wsId} setId={set.id} onCompleted={() => setTab('preview')} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-accent"
              aria-label="More actions"
            >
              <MoreHorizontal size={16} />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-border bg-card py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setOverflowOpen(false);
                    setConfirmingDelete(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-destructive hover:bg-accent"
                >
                  <Trash2 size={13} /> Delete set
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="flex flex-none items-center gap-1 border-b border-border px-8">
        <TabButton
          active={tab === 'config'}
          onClick={() => setTab('config')}
          icon={<Sliders size={13} />}
        >
          Configuration
        </TabButton>
        <TabButton
          active={tab === 'strategies'}
          onClick={() => setTab('strategies')}
          icon={<Link2 size={13} />}
        >
          Strategies
        </TabButton>
        <TabButton
          active={tab === 'preview'}
          onClick={() => setTab('preview')}
          icon={<Eye size={13} />}
        >
          Preview
        </TabButton>
      </nav>

      {genericBanner && (
        <BannerRow message={genericBanner} onClose={() => setGenericBanner(null)} />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'config' && (
          <ConfigTab
            wsId={wsId}
            buffer={buffer}
            nameError={nameError}
            keyError={keyError}
            schemasError={schemasError}
            outputError={outputError}
            onClearError={() => {
              setNameError(null);
              setKeyError(null);
              setSchemasError(null);
              setOutputError(null);
            }}
          />
        )}
        {tab === 'strategies' && (
          <StrategiesTab
            wsId={wsId}
            setId={set.id}
            buffer={buffer}
            error={strategiesError}
            onClearError={() => setStrategiesError(null)}
          />
        )}
        {tab === 'preview' && <PreviewTab wsId={wsId} set={set} />}
      </div>

      {buffer.isDirty && (
        <footer className="flex flex-none items-center gap-3 border-t border-border bg-card px-8 py-3">
          <span className="text-[12.5px] text-muted-foreground">You have unsaved changes</span>
          <span className="ml-auto" />
          <button
            type="button"
            onClick={buffer.reset}
            disabled={save.isPending}
            className="h-8 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="h-8 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      )}

      {confirmingDelete && (
        <DeleteConfirm
          name={set.name}
          pending={del.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            del.mutate();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-[13px] font-medium transition-colors',
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function BannerRow({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-8 py-2 text-[12.5px] text-destructive">
      <AlertTriangle size={13} />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="text-destructive hover:opacity-70"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function DeleteConfirm({
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  name: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="text-[15px] font-semibold text-foreground">Delete &quot;{name}&quot;?</h3>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          This Set will be removed from the workspace. Schemas it included are untouched.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="h-9 rounded-md bg-destructive px-3 text-[12.5px] font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Deleting…' : 'Delete set'}
          </button>
        </div>
      </div>
    </div>
  );
}
