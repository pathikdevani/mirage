import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { userManager } from '../auth/oidc.js';

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
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
