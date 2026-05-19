import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, HelpCircle } from 'lucide-react';
import type { Api } from '@mirage/types';
import { cn } from '@mirage/ui-kit';

type WorkspaceDto = Api.components['schemas']['Workspace'];
import { useUiStore } from '../../state/store.js';
import { bff } from '../../api/client.js';
import { ComingSoonChip } from '../../components/workspace-picker/ComingSoonChip.js';
import { colorForId, initialsForName } from '../../components/workspace-picker/avatar.js';

export function WorkspaceCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentOrgId = useUiStore((s) => s.currentOrgId);
  const setCurrentWorkspaceId = useUiStore((s) => s.setCurrentWorkspaceId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const existing = useQuery({
    enabled: Boolean(currentOrgId),
    queryKey: ['workspaces', currentOrgId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces');
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (body: { name: string; description?: string }) => {
      const { data, error } = await bff.POST('/workspaces', { body });
      if (error) throw error;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: async (workspace: WorkspaceDto) => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces', currentOrgId] });
      setCurrentWorkspaceId(workspace.id);
      navigate(`/workspaces/${workspace.id}/schemas`, { replace: true });
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create workspace');
    },
  });

  const trimmedName = name.trim();
  const validName = trimmedName.length >= 1 && trimmedName.length <= 80;
  const validDescription = description.length <= 500;
  const canSubmit = validName && validDescription && !create.isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setErrorMsg(null);
    if (!canSubmit) return;
    create.mutate({
      name: trimmedName,
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* Left: back link + context */}
      <aside className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => navigate('/workspaces')}
          className="flex w-fit items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Back to workspaces
        </button>

        {existing.data && existing.data.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {existing.data.length} existing workspace
              {existing.data.length === 1 ? '' : 's'}
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {existing.data.slice(0, 5).map((w) => {
                const color = colorForId(w.id);
                return (
                  <li
                    key={w.id}
                    className="flex items-center gap-2 rounded-md px-1 py-1 text-[12px] text-foreground"
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 flex-none items-center justify-center rounded-md text-[10px] font-semibold',
                        color.bg,
                        color.fg,
                      )}
                    >
                      {initialsForName(w.name)}
                    </span>
                    <span className="truncate">{w.name}</span>
                  </li>
                );
              })}
              {existing.data.length > 5 && (
                <li className="px-1 text-[11px] text-muted-foreground">
                  + {existing.data.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <HelpCircle size={14} strokeWidth={1.75} />
            What's a workspace?
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            A workspace holds your schemas, generated sets, connectors, and team
            members. Use separate workspaces to isolate dev, staging, and production
            data.
          </p>
        </div>
      </aside>

      {/* Right: create form */}
      <section className="rounded-xl border border-border bg-card p-6 lg:p-8">
        <div className="mb-6">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            New workspace
          </div>
          <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-foreground">
            Create a workspace
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Set up a new isolated space for schemas, sets, and team members. You can
            change most of these later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Name + avatar preview */}
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-12 w-12 flex-none items-center justify-center rounded-lg text-[14px] font-semibold',
                'bg-brand-violet/15 text-brand-violet',
              )}
            >
              {initialsForName(name || 'New')}
            </div>
            <Field
              label="Workspace name"
              required
              helper="Shown across Mirage. People will see this in the workspace switcher."
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. presight workspace 2"
                maxLength={80}
                autoFocus
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/10"
              />
            </Field>
          </div>

          <Field label="Description" helper={`${description.length} / 500`}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What lives in this workspace?"
              maxLength={500}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-[14px] outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/10"
            />
          </Field>

          <Field label="Color" trailing={<ComingSoonChip />}>
            <div className="flex gap-2">
              {(['violet', 'cyan', 'emerald', 'amber', 'rose'] as const).map((c, i) => (
                <button
                  key={c}
                  type="button"
                  disabled
                  aria-label={c}
                  className={cn(
                    'h-8 w-8 rounded-full opacity-60',
                    c === 'violet' && 'bg-brand-violet',
                    c === 'cyan' && 'bg-brand-cyan',
                    c === 'emerald' && 'bg-brand-emerald',
                    c === 'amber' && 'bg-brand-amber',
                    c === 'rose' && 'bg-brand-rose',
                    i === 0 && 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-card',
                  )}
                />
              ))}
            </div>
          </Field>

          <Field label="Workspace URL" trailing={<ComingSoonChip />}>
            <div className="flex h-10 items-center overflow-hidden rounded-md border border-input bg-muted/30">
              <span className="border-r border-input px-3 font-mono text-[12px] text-muted-foreground">
                mirage.presight.ae /
              </span>
              <input
                disabled
                defaultValue="slug"
                className="flex-1 cursor-not-allowed bg-transparent px-3 font-mono text-[13px] text-muted-foreground outline-none"
              />
            </div>
          </Field>

          <Field label="Environment" trailing={<ComingSoonChip />}>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'production', label: 'Production', sub: 'real data flows', selected: false },
                  { id: 'staging', label: 'Staging', sub: 'pre-prod testing', selected: false },
                  { id: 'dev', label: 'Development', sub: 'fast & loose', selected: true },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    'flex cursor-not-allowed gap-2 rounded-md border p-3 opacity-60',
                    opt.selected ? 'border-brand-violet/40 bg-brand-violet/5' : 'border-input',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border',
                      opt.selected ? 'border-brand-violet bg-brand-violet' : 'border-input',
                    )}
                  >
                    {opt.selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <div>
                    <div className="text-[12px] font-medium text-foreground">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground">{opt.sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Region" trailing={<ComingSoonChip />}>
              <FakeSelect value="UAE — Abu Dhabi" />
            </Field>
            <Field label="Plan" trailing={<ComingSoonChip />}>
              <FakeSelect value="Inherits from organization" />
            </Field>
          </div>

          <Field label="Starter template" trailing={<ComingSoonChip />}>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'blank', name: 'Blank', sub: 'Start empty', selected: true },
                { id: 'identity', name: 'Identity', sub: 'person, mobile' },
                { id: 'commerce', name: 'Commerce', sub: 'customer, order' },
                { id: 'import', name: 'Import', sub: 'from JSON / SQL' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled
                  className={cn(
                    'flex cursor-not-allowed flex-col items-start gap-1 rounded-md border p-3 text-left opacity-60',
                    t.selected ? 'border-brand-violet/40 bg-brand-violet/5' : 'border-input',
                  )}
                >
                  <div className="text-[12px] font-medium text-foreground">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.sub}</div>
                </button>
              ))}
            </div>
          </Field>

          {errorMsg && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => navigate('/workspaces')}
              className="h-10 rounded-md border border-input bg-background px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                'flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity',
                canSubmit ? 'hover:opacity-90' : 'cursor-not-allowed opacity-50',
              )}
            >
              {create.isPending ? 'Creating…' : 'Create workspace'}
              {!create.isPending && <ArrowRight size={14} strokeWidth={2} />}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

interface FieldProps {
  label: string;
  helper?: string;
  required?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

function Field({ label, helper, required, trailing, children }: FieldProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="flex items-center text-[12px] font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
          {trailing}
        </label>
        {helper && <span className="text-[11px] text-muted-foreground">{helper}</span>}
      </div>
      {children}
    </div>
  );
}

function FakeSelect({ value }: { value: string }) {
  return (
    <div className="flex h-10 cursor-not-allowed items-center justify-between rounded-md border border-input bg-muted/30 px-3 opacity-60">
      <span className="text-[13px] text-muted-foreground">{value}</span>
    </div>
  );
}
