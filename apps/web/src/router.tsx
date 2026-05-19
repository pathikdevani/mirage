import { Link, Route, Routes } from 'react-router';
import { HomePage } from './pages/Home.js';
import { ScratchPage } from './pages/Scratch.js';
import { AuthCallbackPage } from './pages/AuthCallback.js';

export function AppRouter() {
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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/scratch" element={<ScratchPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
      </Routes>
    </>
  );
}
