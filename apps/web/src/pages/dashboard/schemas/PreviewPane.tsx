import { Link } from 'react-router';
import { Play } from 'lucide-react';

interface PreviewPaneProps {
  wsId: string;
}

export function PreviewPane({ wsId }: PreviewPaneProps) {
  return (
    <aside className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex h-12 flex-none items-center border-b border-border px-4">
        <h3 className="text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Preview
        </h3>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Play size={18} strokeWidth={1.75} className="text-muted-foreground" />
        </span>
        <div className="text-[13px] font-medium text-foreground">
          Preview rows after a Set is run
        </div>
        <p className="text-[12px] text-muted-foreground">
          Sets pull together schemas, sizes, and connectors so you can generate
          real rows.
        </p>
        <Link
          to={`/workspaces/${wsId}/sets`}
          className="text-[12px] font-medium text-brand-violet underline-offset-2 hover:underline"
        >
          Sets →
        </Link>
      </div>
    </aside>
  );
}
