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
  setCurrentOrgId: (orgId: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      currentOrgId: null,
      setCurrentOrgId: (orgId) => set({ currentOrgId: orgId }),
    }),
    { name: 'mirage-ui' },
  ),
);
