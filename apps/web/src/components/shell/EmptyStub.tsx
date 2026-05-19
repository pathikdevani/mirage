import type { LucideIcon } from 'lucide-react';

interface EmptyStubProps {
  icon: LucideIcon;
  title: string;
  body?: string;
}

export function EmptyStub({ icon: Icon, title, body }: EmptyStubProps) {
  return (
    <div className="flex min-h-[calc(100vh-56px-97px)] flex-col items-center justify-center px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon size={28} strokeWidth={1.75} />
      </div>
      <h2 className="mt-5 text-[16px] font-medium text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-md text-[13px] text-muted-foreground">
        {body ??
          'This page is part of the dashboard handoff and will land in a follow-up slice.'}
      </p>
    </div>
  );
}
