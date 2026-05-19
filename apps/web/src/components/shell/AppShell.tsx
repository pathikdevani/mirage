import { Navigate, Outlet } from 'react-router';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { useAuth } from '../../auth/AuthProvider.js';

export function AppShell() {
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
    <div className="grid min-h-screen grid-cols-[240px_1fr] grid-rows-[56px_1fr] bg-background text-foreground">
      <TopBar />
      <Sidebar />
      <main className="overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
