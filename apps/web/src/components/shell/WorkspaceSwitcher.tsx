import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { cn } from '@mirage/ui-kit';
import { useUiStore } from '../../state/store.js';
import { bff } from '../../api/client.js';

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const params = useParams<{ wsId: string }>();
  const currentOrgId = useUiStore((s) => s.currentOrgId);
  const setCurrentWorkspaceId = useUiStore((s) => s.setCurrentWorkspaceId);
  const wsIdFromUrl = params.wsId ?? null;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const workspaces = useQuery({
    enabled: Boolean(currentOrgId),
    queryKey: ['workspaces', currentOrgId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces');
      if (error) throw error;
      return data;
    },
  });

  const currentWorkspace = workspaces.data?.find(
    (w) => w.id === wsIdFromUrl && !w.deletedAt,
  );
  const label = !currentOrgId
    ? 'Select org first'
    : currentWorkspace
      ? currentWorkspace.name
      : 'Select workspace';
  const initial = currentWorkspace ? currentWorkspace.name.charAt(0).toUpperCase() : 'W';
  const disabled = !currentOrgId;

  const handleSelect = (newWsId: string): void => {
    setCurrentWorkspaceId(newWsId);
    navigate(`/workspaces/${newWsId}/schemas`);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch workspace"
        className={cn(
          'flex h-8 items-center gap-2 rounded-full border border-input bg-background px-1.5 pr-3 text-[13px] font-medium text-foreground transition-colors',
          'hover:bg-accent',
          disabled && 'cursor-not-allowed opacity-50 hover:bg-background',
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-violet/15 text-[10px] font-semibold text-brand-violet">
          {initial}
        </span>
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={12} strokeWidth={2.25} className="text-muted-foreground" />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-10 z-50 w-72 rounded-lg border border-border bg-popover p-2 shadow-lg">
          <label className="block px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </label>
          {workspaces.isLoading ? (
            <div className="mt-2 h-8 animate-pulse rounded-md bg-muted" />
          ) : workspaces.isError ? (
            <div className="mt-1 px-1 text-[12px] text-destructive">
              Failed to load workspaces.{' '}
              <button
                type="button"
                onClick={() => void workspaces.refetch()}
                className="underline"
              >
                Retry
              </button>
            </div>
          ) : workspaces.data && workspaces.data.filter((w) => !w.deletedAt).length === 0 ? (
            <p className="mt-1 px-1 text-[12px] text-muted-foreground">
              No workspaces yet in this org.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col">
              {workspaces.data
                ?.filter((ws) => !ws.deletedAt)
                .map((ws) => (
                <li key={ws.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(ws.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-accent',
                      ws.id === wsIdFromUrl && 'bg-accent font-medium',
                    )}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-violet/15 text-[10px] font-semibold text-brand-violet">
                      {ws.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{ws.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/workspaces');
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus size={12} strokeWidth={2.25} />
              See all workspaces
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
