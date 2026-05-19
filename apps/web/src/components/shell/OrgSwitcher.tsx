import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@mirage/ui-kit';
import { useUiStore } from '../../state/store.js';
import { bff } from '../../api/client.js';

export function OrgSwitcher() {
  const currentOrgId = useUiStore((s) => s.currentOrgId);
  const setCurrentOrgId = useUiStore((s) => s.setCurrentOrgId);
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

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data, error } = await bff.GET('/me');
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!me.data) return;
    const orgs = me.data.allOrgIds;
    if (currentOrgId && !orgs.includes(currentOrgId)) {
      setCurrentOrgId(null);
      return;
    }
    if (!currentOrgId && orgs.length === 1 && orgs[0]) {
      setCurrentOrgId(orgs[0]);
    }
  }, [me.data, currentOrgId, setCurrentOrgId]);

  const label = currentOrgId ?? 'Select org';
  const initial = currentOrgId ? currentOrgId.charAt(0).toUpperCase() : 'O';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch org"
        className={cn(
          'flex h-8 items-center gap-2 rounded-full border border-input bg-background px-1.5 pr-3 text-[13px] font-medium text-foreground transition-colors',
          'hover:bg-accent',
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-emerald/15 text-[10px] font-semibold text-brand-emerald">
          {initial}
        </span>
        <span>{label}</span>
        <ChevronDown size={12} strokeWidth={2.25} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-64 rounded-lg border border-border bg-popover p-2 shadow-lg">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Org
          </label>
          {me.isLoading ? (
            <div className="mt-2 h-8 animate-pulse rounded-md bg-muted" />
          ) : me.isError ? (
            <div className="mt-1 text-[12px] text-destructive">
              Failed to load orgs.{' '}
              <button
                type="button"
                onClick={() => void me.refetch()}
                className="underline"
              >
                Retry
              </button>
            </div>
          ) : me.data && me.data.allOrgIds.length === 0 ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              You are not a member of any orgs.
            </p>
          ) : me.data && me.data.allOrgIds.length === 1 ? (
            <p className="mt-1 text-[13px] font-medium text-foreground">
              {me.data.allOrgIds[0]}
            </p>
          ) : (
            <select
              value={currentOrgId ?? ''}
              onChange={(e) => {
                setCurrentOrgId(e.target.value || null);
                setOpen(false);
              }}
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/10"
            >
              <option value="" disabled>
                Select an org
              </option>
              {me.data?.allOrgIds.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
