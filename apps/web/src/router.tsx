import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/shell/AppShell.js';
import { AuthCallbackPage } from './pages/AuthCallback.js';
import { LoginPage } from './pages/Login.js';
import { ScratchPage } from './pages/Scratch.js';
import { SchemasPage } from './pages/dashboard/SchemasPage.js';
import { SetsPage } from './pages/dashboard/SetsPage.js';
import { GraphPage } from './pages/dashboard/GraphPage.js';
import { GeneratePage } from './pages/dashboard/GeneratePage.js';
import { HistoryPage } from './pages/dashboard/HistoryPage.js';
import { ConnectorsPage } from './pages/dashboard/ConnectorsPage.js';
import { FakersPage } from './pages/dashboard/FakersPage.js';
import { SettingsPage } from './pages/dashboard/SettingsPage.js';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/scratch" element={<ScratchPage />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/schemas" replace />} />
        <Route path="/schemas" element={<SchemasPage />} />
        <Route path="/sets" element={<SetsPage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/generate" element={<GeneratePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/connectors" element={<ConnectorsPage />} />
        <Route path="/fakers" element={<FakersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
