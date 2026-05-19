import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { userManager } from '../auth/oidc.js';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  // PKCE codes are single-use; StrictMode's double-effect would consume the
  // code on the first run and 400 on the second. Guard so we only call once.
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    userManager
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch((err: unknown) => {
        console.error('OIDC callback failed', err);
        navigate('/', { replace: true });
      });
  }, [navigate]);

  return (
    <main className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Finishing sign-in…
    </main>
  );
}
