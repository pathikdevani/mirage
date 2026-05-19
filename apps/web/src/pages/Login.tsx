import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, ChevronDown, KeyRound } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.js';
import { login } from '../auth/oidc.js';
import { MirageLogo } from '../components/shell/MirageLogo.js';

const BRAND_VIOLET = 'hsl(262 83% 58%)';
const BRAND_CYAN = 'hsl(188 86% 53%)';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.status === 'authenticated') navigate('/workspaces', { replace: true });
  }, [auth.status, navigate]);

  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <ProductPreview />
        <FormColumn />
      </div>
    </main>
  );
}

function ProductPreview() {
  return (
    <aside
      className="relative hidden overflow-hidden px-12 py-10 lg:flex lg:flex-col lg:justify-between xl:px-20 xl:py-14 2xl:px-32 2xl:py-20"
      style={{ background: 'hsl(240 10% 4%)', color: 'hsl(240 5% 90%)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 0% 0%, hsl(262 83% 58% / 0.18), transparent 55%),
                       radial-gradient(circle at 100% 100%, hsl(188 86% 53% / 0.16), transparent 55%)`,
        }}
      />

      <div className="relative flex items-center gap-3">
        <MirageLogo size={28} />
        <div className="text-sm leading-tight">
          <div
            className="font-semibold tracking-tight xl:text-base"
            style={{ color: 'hsl(240 5% 96%)' }}
          >
            Mirage
          </div>
          <div className="text-[11px] xl:text-xs" style={{ color: 'hsl(240 5% 60%)' }}>
            by presight
          </div>
        </div>
      </div>

      <div className="relative max-w-[460px] space-y-6 xl:max-w-[560px] xl:space-y-8 2xl:max-w-[680px] 2xl:space-y-10">
        <h1
          className="text-[36px] font-semibold leading-[1.1] xl:text-[48px] 2xl:text-[60px]"
          style={{ letterSpacing: '-0.025em', color: 'hsl(240 5% 96%)' }}
        >
          Realistic data,{' '}
          <span
            style={{
              background: `linear-gradient(90deg, ${BRAND_VIOLET}, ${BRAND_CYAN})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            on demand.
          </span>
        </h1>
        <p
          className="text-[14px] leading-[1.6] xl:text-[15px] 2xl:text-[16px]"
          style={{ color: 'hsl(240 5% 70%)' }}
        >
          Define data shapes, bundle them into Sets, generate deterministic synthetic data for
          dev, demos, and load tests. Same salt in, same data out — every time.
        </p>

        <CodePreviewCard />

        <ul
          className="space-y-2 text-[13px] xl:space-y-3 xl:text-[14px] 2xl:text-[15px]"
          style={{ color: 'hsl(240 5% 78%)' }}
        >
          <Bullet color={BRAND_VIOLET}>Deterministic by salt</Bullet>
          <Bullet color={BRAND_CYAN}>120+ faker functions</Bullet>
          <Bullet color="hsl(160 84% 50%)">Push anywhere</Bullet>
        </ul>
      </div>

      <footer
        className="relative flex items-center justify-between text-[11px]"
        style={{ color: 'hsl(240 5% 50%)' }}
      >
        <span>© 2026 Presight · Mirage</span>
        <span className="flex items-center gap-4">
          <FooterLink>Privacy</FooterLink>
          <FooterLink>Terms</FooterLink>
          <FooterLink>Status</FooterLink>
          <span>v2.4.1</span>
        </span>
      </footer>
    </aside>
  );
}

function FormColumn() {
  const [email, setEmail] = useState('pathik.devani@presight.ae');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    void login();
  };

  return (
    <section className="flex items-center justify-center px-6 py-12 sm:px-10 xl:py-16 2xl:py-24">
      <div className="w-full max-w-[380px] space-y-6 xl:max-w-[420px] xl:space-y-7 2xl:max-w-[480px] 2xl:space-y-8">
        <EnvChip />

        <header className="space-y-2">
          <h2
            className="text-[24px] font-semibold xl:text-[28px] 2xl:text-[32px]"
            style={{ letterSpacing: '-0.02em' }}
          >
            Sign in to Mirage
          </h2>
          <p className="text-[14px] text-muted-foreground xl:text-[15px] 2xl:text-[16px]">
            Use your work email or single sign-on.
          </p>
        </header>

        <div className="flex flex-col gap-2">
          <SsoButton provider="google" onClick={() => void login()} />
          <SsoButton provider="microsoft" onClick={() => void login()} />
          <SsoButton provider="okta" onClick={() => void login()} />
        </div>

        <Divider>or with email</Divider>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            id="email"
            label="Work email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder="you@company.com"
          />

          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••••"
            labelTrailing={
              <a
                href="#"
                className="text-[11px] font-medium hover:underline"
                style={{ color: BRAND_VIOLET }}
              >
                Forgot?
              </a>
            }
          />

          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            Keep me signed in on this device
          </label>

          <button
            type="submit"
            className="flex h-[42px] w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-medium text-primary-foreground transition-colors duration-75 hover:opacity-90 xl:h-[46px] xl:text-[15px] 2xl:h-[52px] 2xl:text-[16px]"
          >
            Sign in
            <ArrowRight size={16} strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={() => void login()}
            className="flex h-[36px] w-full items-center justify-center gap-2 rounded-md border border-dashed border-input text-[13px] font-medium text-foreground transition-colors duration-75 hover:bg-accent"
          >
            <KeyRound size={14} strokeWidth={2} />
            Use passkey instead
          </button>
        </form>

        <p className="text-center text-[13px] text-muted-foreground">
          New to Mirage?{' '}
          <a
            href="#"
            className="font-medium hover:underline"
            style={{ color: BRAND_VIOLET }}
          >
            Request access →
          </a>
        </p>
      </div>
    </section>
  );
}

function EnvChip() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-input bg-background px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors duration-75 hover:bg-accent"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: 'hsl(142 71% 45%)' }}
      />
      presight workspace · dev
      <ChevronDown size={12} strokeWidth={2.25} className="text-muted-foreground" />
    </button>
  );
}

type Provider = 'google' | 'microsoft' | 'okta';

function SsoButton({ provider, onClick }: { provider: Provider; onClick: () => void }) {
  const labels: Record<Provider, string> = {
    google: 'Continue with Google',
    microsoft: 'Continue with Microsoft',
    okta: 'Continue with Okta SSO',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium text-foreground transition-colors duration-75 hover:bg-accent xl:h-11 xl:text-[14px] 2xl:h-12 2xl:text-[15px]"
    >
      <ProviderIcon provider={provider} />
      {labels[provider]}
    </button>
  );
}

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === 'google') {
    return (
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
        <path
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.63z"
          fill="#4285F4"
        />
        <path
          d="M9 18c2.43 0 4.47-.8 5.95-2.18l-2.9-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
          fill="#34A853"
        />
        <path
          d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"
          fill="#FBBC05"
        />
        <path
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
          fill="#EA4335"
        />
      </svg>
    );
  }
  if (provider === 'microsoft') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect width="7" height="7" fill="#F25022" />
        <rect x="9" width="7" height="7" fill="#7FBA00" />
        <rect y="9" width="7" height="7" fill="#00A4EF" />
        <rect x="9" y="9" width="7" height="7" fill="#FFB900" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="#007DC1" strokeWidth="4" />
    </svg>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  labelTrailing,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  labelTrailing?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[12px] font-medium text-foreground">
          {label}
        </label>
        {labelTrailing}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] text-foreground outline-none transition-shadow duration-75 placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/10 xl:h-11 2xl:h-12 2xl:text-[15px]"
      />
    </div>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function Bullet({ color, children }: { color: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </li>
  );
}

function FooterLink({ children }: { children: ReactNode }) {
  return (
    <a href="#" className="hover:text-foreground/80">
      {children}
    </a>
  );
}

function CodePreviewCard() {
  return (
    <div
      className="overflow-hidden rounded-[10px] border font-mono text-[12px] leading-[1.6] xl:text-[13px] 2xl:text-[14px]"
      style={{
        background: 'hsl(240 8% 7%)',
        borderColor: 'hsl(240 5% 14%)',
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: 'hsl(240 5% 14%)' }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: 'hsl(0 70% 55%)' }} />
        <span className="h-2 w-2 rounded-full" style={{ background: 'hsl(45 90% 55%)' }} />
        <span className="h-2 w-2 rounded-full" style={{ background: 'hsl(142 70% 50%)' }} />
        <span
          className="ml-3 rounded px-2 py-0.5 text-[11px]"
          style={{ background: 'hsl(240 5% 12%)', color: 'hsl(240 5% 80%)' }}
        >
          person.json
        </span>
      </div>

      <pre
        className="m-0 px-4 py-3 text-[12px]"
        style={{ color: 'hsl(240 5% 78%)' }}
      >
        {'{\n'}
        {'  '}
        <span style={{ color: BRAND_CYAN }}>"id"</span>: <span style={{ color: 'hsl(142 71% 65%)' }}>"usr_8f42"</span>,{'\n'}
        {'  '}
        <span style={{ color: BRAND_CYAN }}>"name"</span>: <span style={{ color: 'hsl(142 71% 65%)' }}>"Layla Al-Mansouri"</span>,{'\n'}
        {'  '}
        <span style={{ color: BRAND_CYAN }}>"email"</span>: <span style={{ color: 'hsl(142 71% 65%)' }}>"layla@example.ae"</span>,{'\n'}
        {'  '}
        <span style={{ color: BRAND_CYAN }}>"age"</span>: <span style={{ color: 'hsl(35 85% 65%)' }}>34</span>,{'\n'}
        {'  '}
        <span style={{ color: BRAND_CYAN }}>"verified"</span>: <span style={{ color: BRAND_VIOLET }}>true</span>{'\n'}
        {'}'}
      </pre>

      <div
        className="flex items-center gap-2 border-t px-3 py-2 text-[11px]"
        style={{ borderColor: 'hsl(240 5% 14%)', color: 'hsl(240 5% 60%)' }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: 'hsl(142 71% 50%)' }}
        />
        generation complete · 4.2s · seed mirage-uae-2026-001
      </div>
    </div>
  );
}
