import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'oidc-client-ts';
import { userManager } from './oidc.js';

interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
}

const AuthContext = createContext<AuthState>({ status: 'loading', user: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    let cancelled = false;

    const setUser = (user: User | null): void => {
      if (cancelled) return;
      setState({ status: user ? 'authenticated' : 'anonymous', user });
    };

    userManager
      .getUser()
      .then(setUser)
      .catch(() => setUser(null));

    const handlers = {
      loaded: (user: User) => setUser(user),
      unloaded: () => setUser(null),
    };
    userManager.events.addUserLoaded(handlers.loaded);
    userManager.events.addUserUnloaded(handlers.unloaded);

    return () => {
      cancelled = true;
      userManager.events.removeUserLoaded(handlers.loaded);
      userManager.events.removeUserUnloaded(handlers.unloaded);
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => useContext(AuthContext);
