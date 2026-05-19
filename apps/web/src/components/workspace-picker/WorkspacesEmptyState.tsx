import { useNavigate } from 'react-router';
import { Info, Plus, UserPlus } from 'lucide-react';
import { logout } from '../../auth/oidc.js';
import { ComingSoonChip } from './ComingSoonChip.js';

export function WorkspacesEmptyState() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center text-center">
      <EmptyArt />

      <h2 className="mt-6 text-[28px] font-semibold tracking-[-0.02em] text-foreground">
        You're not in a workspace yet
      </h2>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
        A workspace is where your schemas, generated sets, and team live. Create your
        first one — it takes about 30 seconds — or join an existing workspace your team
        invited you to.
      </p>

      <div className="mt-7 flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={() => navigate('/workspaces/new')}
          className="group flex w-full items-center gap-4 rounded-xl border border-brand-violet/30 bg-card p-4 text-left transition-colors hover:border-brand-violet hover:bg-brand-violet/5"
        >
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-brand-violet/15 text-brand-violet">
            <Plus size={20} strokeWidth={2} />
          </span>
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-foreground">
              Create a workspace
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              For your team or just for you.
            </div>
          </div>
          <span className="text-[18px] text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground">
            →
          </span>
        </button>

        <button
          type="button"
          disabled
          className="flex w-full cursor-not-allowed items-center gap-4 rounded-xl border border-border bg-card p-4 text-left opacity-60"
        >
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-brand-cyan/15 text-brand-cyan">
            <UserPlus size={20} strokeWidth={2} />
          </span>
          <div className="flex-1">
            <div className="flex items-center text-[14px] font-semibold text-foreground">
              Join with invite code
              <ComingSoonChip variant="inline" />
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              Got an 8-character code from a teammate? Paste it.
            </div>
          </div>
        </button>
      </div>

      <div className="mt-8 flex w-full items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-left">
        <Info size={16} strokeWidth={1.75} className="mt-0.5 flex-none text-muted-foreground" />
        <div className="text-[13px] text-muted-foreground">
          <b className="text-foreground">Expected to see a workspace?</b>{' '}
          If your admin invited you, the invite may still be pending. Check your inbox
          or ping your admin.
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 text-[12px] text-muted-foreground">
        <button
          type="button"
          onClick={() => void logout()}
          className="hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function EmptyArt() {
  return (
    <svg width="140" height="100" viewBox="0 0 140 100" fill="none" aria-hidden>
      <defs>
        <linearGradient id="empty-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(262 83% 70%)" />
          <stop offset="100%" stopColor="hsl(188 86% 65%)" />
        </linearGradient>
      </defs>
      <rect
        x="20"
        y="20"
        width="100"
        height="60"
        rx="10"
        fill="none"
        stroke="hsl(240 5% 80%)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <rect x="30" y="32" width="20" height="20" rx="5" fill="url(#empty-grad)" opacity="0.4" />
      <rect x="56" y="32" width="20" height="20" rx="5" fill="hsl(240 5% 88%)" />
      <rect x="82" y="32" width="20" height="20" rx="5" fill="hsl(240 5% 88%)" />
      <rect x="30" y="58" width="80" height="6" rx="3" fill="hsl(240 5% 88%)" />
      <rect x="30" y="68" width="50" height="4" rx="2" fill="hsl(240 5% 92%)" />
      <path
        d="M120 30 L122 26 L124 30 L128 32 L124 34 L122 38 L120 34 L116 32 Z"
        fill="url(#empty-grad)"
      />
    </svg>
  );
}
