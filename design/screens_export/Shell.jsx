
const WORKSPACES = [
  { id: 'identity-platform', name: 'identity-platform', org: 'presight', color: 'emerald', initial: 'IP', schemas: 3, sets: 5 },
  { id: 'fraud-detection',  name: 'fraud-detection',  org: 'presight', color: 'rose',    initial: 'FD', schemas: 8, sets: 3 },
  { id: 'qa-fixtures',      name: 'qa-fixtures',      org: 'presight', color: 'violet',  initial: 'QA', schemas: 12, sets: 18 },
  { id: 'mobile-sandbox',   name: 'mobile-sandbox',   org: 'g42',      color: 'cyan',    initial: 'MS', schemas: 4, sets: 2 },
  { id: 'gov-pilot',        name: 'gov-pilot',        org: 'g42',      color: 'amber',   initial: 'GP', schemas: 6, sets: 4 },
];

function WorkspacePicker({ active, onPick, onClose }) {
  React.useEffect(() => {
    const onDoc = (e) => { if (!e.target.closest('.ws-dropdown') && !e.target.closest('.ws-pick')) onClose(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="ws-dropdown">
      <div className="ws-head">
        <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.05, fontWeight: 500, padding: '2px 6px 4px' }}>Workspaces</div>
        <div className="input-group" style={{ margin: '4px 0' }}>
          <span className="input-affix"><MIcon name="search" size={12} /></span>
          <input className="input sm" placeholder="Find a workspace…" />
        </div>
      </div>
      {WORKSPACES.map((w) => (
        <div key={w.id} className="ws-row" onClick={() => { onPick(w); onClose(); }}>
          <div className="ws-avatar" style={{ background: 'hsl(var(--brand-' + w.color + '))' }}>{w.initial}</div>
          <div className="ws-info">
            <div className="nm">{w.org} <span style={{ color: 'hsl(var(--muted-foreground))' }}>/</span> {w.name}</div>
            <div className="meta mono">{w.schemas} schemas · {w.sets} sets</div>
          </div>
          {active === w.id && <MIcon name="check" size={14} />}
        </div>
      ))}
      <div className="ws-divider" />
      <div className="ws-foot">
        <button className="btn btn-sm"><MIcon name="plus" size={13} /> New workspace</button>
        <button className="btn btn-sm"><MIcon name="settings" size={13} /> Manage</button>
      </div>
    </div>
  );
}

function MShell({ page, setPage, children }) {
  const [activeWs, setActiveWs] = React.useState('identity-platform');
  const [wsOpen, setWsOpen] = React.useState(false);
  const ws = WORKSPACES.find(w => w.id === activeWs);

  const navs = [
    { group: 'Build' },
    { id: 'schemas',  label: 'Schemas',           icon: 'database', badge: String(ws.schemas) },
    { id: 'graph',    label: 'Dependency graph',  icon: 'workflow' },
    { group: 'Run' },
    { id: 'sets',     label: 'Sets',              icon: 'package',   badge: String(ws.sets) },
    { id: 'history',  label: 'Run history',       icon: 'history' },
    { group: 'Output' },
    { id: 'connectors', label: 'Connectors',      icon: 'connect' },
    { group: 'Library' },
    { id: 'fakers',   label: 'Faker reference',   icon: 'sparkles' },
    { id: 'settings', label: 'Workspace settings', icon: 'settings' },
  ];
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="logo"><MirageLogo size={18} /></div>
          <span>Mirage</span>
        </div>
        <div style={{ position: 'relative' }}>
          <div className="ws-pick" onClick={() => setWsOpen((v) => !v)}>
            <div className="ws-avatar" style={{ background: 'hsl(var(--brand-' + ws.color + ') / 0.15)', color: 'hsl(var(--brand-' + ws.color + '))' }}>{ws.initial}</div>
            <span style={{ fontWeight: 500 }}>{ws.org}</span>
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>/</span>
            <span>{ws.name}</span>
            <MIcon name="chevrons-up-down" size={14} />
          </div>
          {wsOpen && <WorkspacePicker active={activeWs} onPick={(w) => setActiveWs(w.id)} onClose={() => setWsOpen(false)} />}
        </div>
        <div className="env-badge"><span className="dot" />dev</div>

        <div className="actions">
          <div className="search">
            <MIcon name="search" size={14} />
            <span>Search schemas, sets, runs…</span>
            <span className="kbd">⌘K</span>
          </div>
          <button className="icon-btn" title="Help"><MIcon name="help" size={16} /></button>
          <button className="icon-btn" title="Notifications"><MIcon name="bell" size={16} /></button>
          <div className="avatar" title="pathik.devani">PD</div>
        </div>
      </header>

      <aside className="app-sidebar">
        {navs.map((n, i) => {
          if (n.group) return <div key={'g'+i} className="sidebar-section"><div className="title">{n.group}</div></div>;
          return (
            <div key={n.id} className="sidebar-section" style={{ margin: 0 }}>
              <div className={'nav-item ' + (page === n.id ? 'active' : '')} onClick={() => setPage(n.id)}>
                <MIcon name={n.icon === 'connect' ? 'send' : n.icon} size={16} />
                <span>{n.label}</span>
                {n.badge && <span className="badge">{n.badge}</span>}
              </div>
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        <div className="sidebar-card">
          <div className="lbl">Active workspace</div>
          <div className="nm">{ws.name}</div>
          <div className="meta"><span>{ws.schemas} schemas</span><span>·</span><span>{ws.sets} sets</span></div>
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => setWsOpen(true)} style={{ width: '100%', justifyContent: 'flex-start' }}>
              <MIcon name="chevrons-up-down" size={14} /> Switch
            </button>
          </div>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
Object.assign(window, { MShell, WORKSPACES });
