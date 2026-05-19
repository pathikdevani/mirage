import { NavLink } from 'react-router';
import { cn } from '@mirage/ui-kit';
import { NAV } from './nav-config.js';

export function Sidebar() {
  return (
    <aside className="sticky top-14 h-[calc(100vh-56px)] w-60 overflow-y-auto border-r border-border bg-[hsl(0_0%_99%)]">
      <nav className="flex flex-col gap-6 px-3 py-5">
        {NAV.map((section) => (
          <div key={section.section}>
            <div className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {section.section}
            </div>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
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

        <ProjectCard />
      </nav>
    </aside>
  );
}

function ProjectCard() {
  return (
    <div className="mt-2 rounded-lg border border-border bg-card px-3 py-3">
      <div className="text-[11px] font-mono text-muted-foreground">$id</div>
      <div className="mt-0.5 text-[13px] font-medium text-foreground">
        identity-platform
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        3 schemas · 14 props
      </div>
    </div>
  );
}
