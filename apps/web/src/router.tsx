import { Link, Route, Routes } from 'react-router';
import { HomePage } from './pages/Home.js';
import { ScratchPage } from './pages/Scratch.js';
import { AuthCallbackPage } from './pages/AuthCallback.js';
import { LoginPage } from './pages/Login.js';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/"
        element={
          <AppShell>
            <HomePage />
          </AppShell>
        }
      />
      <Route
        path="/scratch"
        element={
          <AppShell>
            <ScratchPage />
          </AppShell>
        }
      />
    </Routes>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="border-b bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3 text-sm">
          <Link to="/" className="font-semibold tracking-tight">
            Mirage
          </Link>
          <Link to="/scratch" className="text-muted-foreground hover:text-foreground">
            Scratch
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
}
