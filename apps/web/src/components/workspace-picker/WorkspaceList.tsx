import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search } from 'lucide-react';
import type { Api } from '@mirage/types';
import { WorkspaceRow } from './WorkspaceRow.js';
import { ComingSoonChip } from './ComingSoonChip.js';

type WorkspaceDto = Api.components['schemas']['Workspace'];

interface WorkspaceListProps {
  workspaces: WorkspaceDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function WorkspaceList({ workspaces, selectedId, onSelect }: WorkspaceListProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description?.toLowerCase().includes(q) ?? false),
    );
  }, [workspaces, query]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Step 2 of 2
        </div>
        <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-foreground">
          Choose a workspace
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {workspaces.length === 1
            ? 'You belong to one workspace.'
            : `You belong to ${workspaces.length} workspaces. Pick where you want to work today.`}
        </p>
      </div>

      <div className="relative">
        <Search
          size={14}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workspaces…"
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/10"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {filtered.length === 0 ? (
          <p className="px-1 py-4 text-center text-[13px] text-muted-foreground">
            No workspaces match “{query}”.
          </p>
        ) : (
          filtered.map((w) => (
            <WorkspaceRow
              key={w.id}
              workspace={w}
              selected={w.id === selectedId}
              onSelect={() => onSelect(w.id)}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => navigate('/workspaces/new')}
          className="flex h-10 items-center justify-center gap-2 rounded-md border border-dashed border-input text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Plus size={14} strokeWidth={2} />
          Create new workspace
        </button>
        <button
          type="button"
          disabled
          className="flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-md border border-dashed border-input text-[13px] font-medium text-muted-foreground opacity-60"
        >
          Join with invite code
          <ComingSoonChip variant="inline" />
        </button>
      </div>
    </div>
  );
}
