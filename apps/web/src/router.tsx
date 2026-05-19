import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/shell/AppShell.js';
import { WorkspacePickerShell } from './components/workspace-picker/WorkspacePickerShell.js';
import { AuthCallbackPage } from './pages/AuthCallback.js';
import { LoginPage } from './pages/Login.js';
import { ScratchPage } from './pages/Scratch.js';
import { WorkspacesPage } from './pages/workspaces/WorkspacesPage.js';
import { WorkspaceCreatePage } from './pages/workspaces/WorkspaceCreatePage.js';
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

      {/* Workspace picker / create — sit between sign-in and the dashboard. */}
      <Route element={<WorkspacePickerShell />}>
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route path="/workspaces/new" element={<WorkspaceCreatePage />} />
      </Route>

      {/* Workspace-scoped dashboard. `:wsId` is the source of truth. */}
      <Route path="/workspaces/:wsId" element={<AppShell />}>
        <Route index element={<Navigate to="schemas" replace />} />
        <Route path="schemas" element={<SchemasPage />} />
        <Route path="sets" element={<SetsPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="generate" element={<GeneratePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="connectors" element={<ConnectorsPage />} />
        <Route path="fakers" element={<FakersPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Root: send people to pick a workspace. */}
      <Route path="/" element={<Navigate to="/workspaces" replace />} />
      <Route path="*" element={<Navigate to="/workspaces" replace />} />
    </Routes>
  );
}
