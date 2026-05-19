import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@mirage/ui-kit';
import { useUiStore } from '../../state/store.js';
import { bff } from '../../api/client.js';

export function WorkspaceSwitcher() {
  const currentOrgId = useUiStore((s) => s.currentOrgId);
  const setCurrentOrgId = useUiStore((s) => s.setCurrentOrgId);
  const [open, setOpen] = useState(false);
  const [orgInput, setOrgInput] = useState('');
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
    enabled: open && Boolean(currentOrgId),
    queryKey: ['workspaces', currentOrgId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces');
      if (error) throw error;
      return data;
    },
  });

  const pillLabel = currentOrgId ? currentOrgId : 'Select workspace';
  const pillInitial = currentOrgId ? currentOrgId.charAt(0).toUpperCase() : 'P';

  function handleSaveOrg() {
    const trimmed = orgInput.trim();
    if (trimmed.length === 0) return;
    setCurrentOrgId(trimmed);
    setOrgInput('');
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 items-center gap-2 rounded-full border border-input bg-background px-1.5 pr-3 text-[13px] font-medium text-foreground transition-colors',
          'hover:bg-accent',
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-emerald/15 text-[10px] font-semibold text-brand-emerald">
          {pillInitial}
        </span>
        <span>{pillLabel}</span>
        <ChevronDown size={12} strokeWidth={2.25} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-72 rounded-lg border border-border bg-popover p-1 shadow-lg">
          {!currentOrgId ? (
            <div className="p-2">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Org ID
              </label>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Set your org to load its workspaces.
              </p>
              <div className="mt-2 flex gap-1.5">
                <input
                  value={orgInput}
                  onChange={(e) => setOrgInput(e.target.value)}
                  placeholder="acme"
                  className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/10"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveOrg();
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveOrg}
                  className="rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          ) : workspaces.isLoading ? (
            <div className="space-y-1 p-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : workspaces.isError ? (
            <div className="p-3 text-[13px] text-destructive">
              Failed to load workspaces.{' '}
              <button
                type="button"
                onClick={() => void workspaces.refetch()}
                className="underline"
              >
                Retry
              </button>
            </div>
          ) : workspaces.data && workspaces.data.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto">
              {workspaces.data.map((ws) => (
                <li key={ws.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentOrgId(ws.id);
                      setOpen(false);
                    }}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-1.5 text-left hover:bg-accent"
                  >
                    <span className="text-[13px] font-medium text-foreground">
                      {ws.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{ws.id}</span>
                  </button>
                </li>
              ))}
              <li className="mt-1 border-t border-border px-3 pt-2 pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentOrgId(null);
                    setOpen(false);
                  }}
                  className="text-[12px] text-muted-foreground hover:underline"
                >
                  Switch org…
                </button>
              </li>
            </ul>
          ) : (
            <div className="p-3 text-[13px] text-muted-foreground">
              No workspaces yet in this org.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
