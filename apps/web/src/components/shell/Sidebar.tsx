import { NavLink, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@mirage/ui-kit';
import { bff } from '../../api/client.js';
import { NAV } from './nav-config.js';
import { colorForId, initialsForName } from '../workspace-picker/avatar.js';

export function Sidebar() {
  const params = useParams<{ wsId: string }>();
  const wsId = params.wsId ?? null;

  return (
    <aside className="sticky top-14 h-[calc(100vh-56px)] w-60 overflow-y-auto border-r border-border bg-background">
      <nav className="flex flex-col gap-6 px-3 py-5">
        {NAV.map((section) => (
          <div key={section.section}>
            <div className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {section.section}
            </div>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const to = wsId ? `/workspaces/${wsId}/${item.path}` : `/${item.path}`;
                return (
                  <li key={item.path}>
                    <NavLink
                      to={to}
                      className={({ isActive }) =>
                        cn(
                          'flex h-8 items-center gap-2 rounded-md px-3 text-[13px] transition-colors',
                          isActive
                            ? 'bg-accent font-medium text-foreground'
                            : 'text-foreground/80 hover:bg-accent hover:text-foreground',
                        )
                      }
                    >
                      <Icon size={16} strokeWidth={1.75} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {wsId && <WorkspaceCard wsId={wsId} />}
      </nav>
    </aside>
  );
}

function WorkspaceCard({ wsId }: { wsId: string }) {
  const workspace = useQuery({
    queryKey: ['workspace', wsId],
    queryFn: async () => {
      const { data, error } = await bff.GET('/workspaces/{id}', {
        params: { path: { id: wsId } },
      });
      if (error) throw error;
      return data;
    },
  });

  if (!workspace.data) return null;
  const ws = workspace.data;
  const color = colorForId(ws.id);

  return (
    <div className="mt-2 rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-6 w-6 flex-none items-center justify-center rounded-md text-[10px] font-semibold',
            color.bg,
            color.fg,
          )}
        >
          {initialsForName(ws.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-foreground">
            {ws.name}
          </div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {ws.id}
          </div>
        </div>
      </div>
    </div>
  );
}
