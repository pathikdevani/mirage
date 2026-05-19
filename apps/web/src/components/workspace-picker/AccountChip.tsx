import { useAuth } from '../../auth/AuthProvider.js';
import { logout } from '../../auth/oidc.js';

export function AccountChip() {
  const auth = useAuth();
  const profile = auth.user?.profile;
  const displayName =
    profile?.preferred_username ?? profile?.email ?? profile?.name ?? 'User';
  const email = profile?.email && profile.email !== displayName ? profile.email : null;
  const initials = getInitials(displayName);

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-background px-2 py-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-violet/15 text-[11px] font-semibold text-brand-violet">
        {initials}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-[12px] font-medium text-foreground">{displayName}</span>
        {email && (
          <span className="text-[11px] text-muted-foreground">{email}</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="ml-1 rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Sign out
      </button>
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
