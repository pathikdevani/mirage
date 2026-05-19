import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@mirage/ui-kit';
import { useUiStore } from '../../state/store.js';
import { bff } from '../../api/client.js';

export function PickerOrgSwitcher() {
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
    if (!currentOrgId && orgs.length >= 1 && orgs[0]) {
      setCurrentOrgId(orgs[0]);
    }
  }, [me.data, currentOrgId, setCurrentOrgId]);

  const orgs = me.data?.allOrgIds ?? [];
  const onlyOne = orgs.length === 1;
  const label = currentOrgId ?? (me.isLoading ? 'Loading…' : 'Select org');
  const initial = currentOrgId ? currentOrgId.charAt(0).toUpperCase() : 'O';

  if (onlyOne) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-full border border-border bg-background px-1.5 pr-3 text-[12px] font-medium text-foreground">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-emerald/15 text-[10px] font-semibold text-brand-emerald">
          {initial}
        </span>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch org"
        className={cn(
          'flex h-8 items-center gap-2 rounded-full border border-border bg-background px-1.5 pr-3 text-[12px] font-medium text-foreground transition-colors',
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
          <label className="block px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Org
          </label>
          {me.isError ? (
            <div className="mt-1 px-1 text-[12px] text-destructive">
              Failed to load orgs.{' '}
              <button
                type="button"
                onClick={() => void me.refetch()}
                className="underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <ul className="mt-1 flex flex-col">
              {orgs.map((org) => (
                <li key={org}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentOrgId(org);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-accent',
                      org === currentOrgId && 'bg-accent font-medium',
                    )}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-emerald/15 text-[10px] font-semibold text-brand-emerald">
                      {org.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{org}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
