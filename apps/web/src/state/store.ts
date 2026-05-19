import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Client-only UI state. Server state lives in TanStack Query. Per the
 * architecture, Zustand is for things like the currently-selected Org,
 * editor drafts, modal state — never for cached server data.
 */
interface UiState {
  /** Currently-selected Org (gets sent as `X-Mirage-Org` on every request). */
  currentOrgId: string | null;
  /** Currently-selected Workspace inside `currentOrgId`. Auto-cleared when the org changes. */
  currentWorkspaceId: string | null;
  setCurrentOrgId: (orgId: string | null) => void;
  setCurrentWorkspaceId: (workspaceId: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      currentOrgId: null,
      currentWorkspaceId: null,
      setCurrentOrgId: (orgId) => {
        if (orgId === get().currentOrgId) return;
        set({ currentOrgId: orgId, currentWorkspaceId: null });
      },
      setCurrentWorkspaceId: (workspaceId) => set({ currentWorkspaceId: workspaceId }),
    }),
    { name: 'mirage-ui' },
  ),
);
