import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, HelpCircle, Search } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { MirageLogo } from './MirageLogo.js';
import { OrgSwitcher } from './OrgSwitcher.js';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.js';
import { ThemeToggle } from '../theme/ThemeToggle.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { logout } from '../../auth/oidc.js';

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 col-span-2 flex h-14 items-center gap-3 border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <MirageLogo size={28} />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Mirage
        </span>
        <span className="text-muted-foreground">/</span>
        <OrgSwitcher />
        <span className="text-muted-foreground">/</span>
        <WorkspaceSwitcher />
        <EnvBadge />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <SearchInput />
        <IconButton label="Notifications" icon={<Bell size={16} strokeWidth={1.75} />} />
        <IconButton label="Help" icon={<HelpCircle size={16} strokeWidth={1.75} />} />
        <ThemeToggle />
        <AvatarMenu />
      </div>
    </header>
  );
}

function EnvBadge() {
  return (
    <span className="flex h-6 items-center gap-1.5 rounded-full bg-brand-emerald/10 px-2 text-[11px] font-medium text-brand-emerald">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-emerald" />
      dev
    </span>
  );
}

function SearchInput() {
  return (
    <div className="relative">
      <Search
        size={14}
        strokeWidth={1.75}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        placeholder="Search"
        aria-label="Search"
        className="h-8 w-60 rounded-md border border-input bg-background pl-8 pr-12 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/10"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
        ⌘K
      </kbd>
    </div>
  );
}

function IconButton({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {icon}
    </button>
  );
}

function AvatarMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const profile = auth.user?.profile;
  const displayName =
    profile?.preferred_username ?? profile?.email ?? profile?.name ?? 'User';
  const initials = getInitials(displayName);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full bg-brand-violet/15 text-[11px] font-semibold text-brand-violet transition-colors',
          'hover:bg-brand-violet/25',
        )}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-50 w-56 rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <div className="truncate text-[13px] font-medium text-foreground">
              {displayName}
            </div>
            {profile?.email && profile.email !== displayName && (
              <div className="truncate text-[11px] text-muted-foreground">
                {profile.email}
              </div>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="mt-1 flex w-full items-center rounded-md px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.split(/[\s.@]+/).filter(Boolean);
  const first = parts[0];
  const second = parts[1];
  if (!first) return '?';
  if (!second) return first.charAt(0).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}
