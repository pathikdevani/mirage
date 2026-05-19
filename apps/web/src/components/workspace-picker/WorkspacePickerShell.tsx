import { Navigate, Outlet } from 'react-router';
import { MirageLogo } from '../shell/MirageLogo.js';
import { useAuth } from '../../auth/AuthProvider.js';
import { AccountChip } from './AccountChip.js';
import { PickerOrgSwitcher } from './PickerOrgSwitcher.js';

const BRAND_VIOLET = 'hsl(262 83% 58%)';
const BRAND_CYAN = 'hsl(188 86% 53%)';

export function WorkspacePickerShell() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-muted-foreground">
        Loading session…
      </div>
    );
  }

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(circle at 0% 0%, ${BRAND_VIOLET}14, transparent 55%),
                       radial-gradient(circle at 100% 100%, ${BRAND_CYAN}14, transparent 55%)`,
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1200px] flex-col px-6 py-6 lg:px-10 lg:py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MirageLogo size={28} />
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold tracking-tight text-foreground">
                Mirage
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                by presight
              </span>
            </div>
            <span className="mx-2 text-muted-foreground">/</span>
            <PickerOrgSwitcher />
          </div>

          <AccountChip />
        </header>

        <div className="mt-8 flex-1 lg:mt-12">
          <Outlet />
        </div>

        <footer className="mt-10 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>© 2026 Presight · Mirage</span>
          <span className="flex items-center gap-4">
            <a href="#" className="hover:text-foreground/80">
              Docs
            </a>
            <a href="#" className="hover:text-foreground/80">
              Status
            </a>
            <span>v2.4.1</span>
          </span>
        </footer>
      </div>
    </main>
  );
}
