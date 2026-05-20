import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { useUiStore } from '../state/store.js';
import { ws } from '../api/ws.js';

/**
 * Opens the BFF WebSocket once the user is signed in and an Org has been
 * selected. Re-opens when either changes; disconnects on sign-out.
 */
export function WsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const orgId = useUiStore((s) => s.currentOrgId);

  useEffect(() => {
    if (auth.status !== 'authenticated' || !auth.user?.access_token || !orgId) return;
    ws.connect(auth.user.access_token, orgId);
    return () => {
      ws.disconnect();
    };
  }, [auth.status, auth.user?.access_token, orgId]);

  return <>{children}</>;
}
