
// ───── Sets data ─────
const SETS = [
  {
    id: 'set-uae-residents',
    name: 'UAE residents — pilot',
    purpose: 'Generate a balanced pilot dataset of UAE residents with at least one mobile and a driving licence per person. Used for the QA team\u2019s regression sweep.',
    color: 'cyan',
    icon: 'users',
    salt: 'mirage-uae-2026-001',
    tags: ['pilot', 'qa'],
    lastRun: '12 min ago',
    lastRunBy: 'pathik.devani',
    status: 'completed',
    duration: '4.2s',
    schemas: [
      { schemaId: 'person', count: 50000, filters: [
        { field: 'gender', op: 'in', value: '["male","female"]' },
        { field: 'dateOfBirth', op: 'range', value: '1965-01-01..2008-01-01' },
      ]},
      { schemaId: 'mobile', count: 80000, filters: [
        { field: 'carrier', op: '=', value: '"Etisalat"|"du"' },
      ]},
      { schemaId: 'driving-licence', count: 30000, filters: [] },
    ],
    edges: [
      { fromSchema: 'mobile', fromField: 'personId', toSchema: 'person', toField: 'id', strategy: 'random', config: { ratio: '~1.6 mobiles / person' } },
      { fromSchema: 'driving-licence', fromField: 'personId', toSchema: 'person', toField: 'id', strategy: '1:1', config: { skipMissing: true } },
      { fromSchema: 'driving-licence', fromField: 'mobileNumber', toSchema: 'mobile', toField: 'number', strategy: 'custom', config: { fn: 'pickPrimaryMobile' } },
    ],
  },
  {
    id: 'set-reem-island',
    name: 'Reem Island · Indian nationality',
    purpose: 'People living in Reem Island, Abu Dhabi, with Indian nationality. Used for geo-segmented model evaluation.',
    color: 'amber',
    icon: 'globe',
    salt: 'reem-island-india-7741',
    tags: ['geo', 'segment', 'india'],
    lastRun: '38 min ago',
    lastRunBy: 'sarah.j',
    status: 'completed',
    duration: '0.9s',
    schemas: [
      { schemaId: 'person', count: 2500, filters: [
        { field: 'nationality', op: '=', value: '"IN"' },
        { field: 'addressArea', op: '=', value: '"Reem Island"' },
        { field: 'gender', op: 'distribution', value: '60% F / 40% M' },
      ]},
      { schemaId: 'mobile', count: 3200, filters: [] },
    ],
    edges: [
      { fromSchema: 'mobile', fromField: 'personId', toSchema: 'person', toField: 'id', strategy: 'avg-split', config: { mean: 1.28, jitter: 0.4 } },
    ],
  },
  {
    id: 'set-smoke',
    name: 'Smoke test · tiny',
    purpose: 'Smallest possible dataset for CI smoke tests. Runs in under a second.',
    color: 'emerald',
    icon: 'check-circle',
    salt: 'smoke-stable-001',
    tags: ['ci', 'tiny'],
    lastRun: '2 hr ago',
    lastRunBy: 'ci-pipeline',
    status: 'completed',
    duration: '0.21s',
    schemas: [
      { schemaId: 'person', count: 100 },
      { schemaId: 'mobile', count: 100 },
      { schemaId: 'driving-licence', count: 80 },
    ],
    edges: [
      { fromSchema: 'mobile', fromField: 'personId', toSchema: 'person', toField: 'id', strategy: '1:1', config: {} },
      { fromSchema: 'driving-licence', fromField: 'personId', toSchema: 'person', toField: 'id', strategy: '1:1', config: {} },
    ],
  },
  {
    id: 'set-stress',
    name: 'Stress · 1M rows',
    purpose: 'Million-row stress test for the API ingestion pipeline.',
    color: 'rose',
    icon: 'rocket',
    salt: 'stress-1m-prod',
    tags: ['stress', 'performance'],
    lastRun: '5 hr ago',
    lastRunBy: 'pathik.devani',
    status: 'completed',
    duration: '47s',
    schemas: [
      { schemaId: 'person', count: 1000000 },
      { schemaId: 'mobile', count: 1500000 },
      { schemaId: 'driving-licence', count: 750000 },
    ],
    edges: [
      { fromSchema: 'mobile', fromField: 'personId', toSchema: 'person', toField: 'id', strategy: 'random', config: { ratio: '~1.5/person' } },
      { fromSchema: 'driving-licence', fromField: 'personId', toSchema: 'person', toField: 'id', strategy: 'random', config: { ratio: '0.75 coverage' } },
      { fromSchema: 'driving-licence', fromField: 'mobileNumber', toSchema: 'mobile', toField: 'number', strategy: 'random', config: {} },
    ],
  },
  {
    id: 'set-fail',
    name: 'Edge · failing strategy',
    purpose: 'Sandbox for testing the custom strategy DSL. Currently failing on validate.',
    color: 'slate',
    icon: 'alert-triangle',
    salt: 'edge-broken-fn-3',
    tags: ['draft'],
    lastRun: '\u2014',
    lastRunBy: 'pathik.devani',
    status: 'invalid',
    duration: '\u2014',
    schemas: [
      { schemaId: 'person', count: 500 },
      { schemaId: 'mobile', count: 500 },
    ],
    edges: [
      { fromSchema: 'mobile', fromField: 'personId', toSchema: 'person', toField: 'id', strategy: 'custom', config: { fn: 'pickByLuhn', error: "TS2552 Cannot find name 'luhn'." } },
    ],
  },
];

const STRATEGY_META = {
  '1:1':      { label: 'Exact 1:1',      icon: 'arrow-right', desc: 'Each source row maps to exactly one target. Counts must match.' },
  'random':   { label: 'Random pick',    icon: 'dice',        desc: 'For each source row, pick a random target. Duplicates allowed.' },
  'avg-split':{ label: 'Even split',     icon: 'sliders',     desc: 'Distribute target evenly across sources, with optional jitter.' },
  'weighted': { label: 'Weighted',       icon: 'chart-line',  desc: 'Choose by weight column on target. Requires a weight expression.' },
  'custom':   { label: 'Custom function',icon: 'code',        desc: 'Write a TypeScript function — receives store, returns target row.' },
};

Object.assign(window, { SETS, STRATEGY_META });



function GraphPage({ onCreate }) {
  const layout = {
    person: { x: 60, y: 60, color: 'cyan' },
    mobile: { x: 460, y: 60, color: 'violet' },
    'driving-licence': { x: 460, y: 380, color: 'emerald' },
  };
  const edges = [];
  SCHEMAS.forEach((s) => {
    s.properties.forEach((p) => {
      const deps = (function collect(v, acc) {
        if (Array.isArray(v)) { v.forEach((c) => collect(c, acc)); return acc; }
        if (v && typeof v === 'object') {
          if (typeof v.$ref === 'string') {
            const m = v.$ref.match(/^#\/schema\/([^/]+)\/(.+)$/);
            if (m) acc.push({ schemaId: m[1], field: m[2] });
          }
          Object.values(v).forEach((c) => collect(c, acc));
        }
        return acc;
      })(p.faker?.args, []);
      deps.forEach((d) => edges.push({ fromSchema: d.schemaId, fromField: d.field, toSchema: s.id, toField: p.name }));
    });
  });

  // Sample cycle for the debug panel (illustrative, since real schemas are acyclic)
  const [showCycle, setShowCycle] = React.useState(false);

  const nodeWidth = 260; const headerHeight = 38; const propHeight = 28;
  const anchor = (schemaId, name) => {
    const s = SCHEMAS.find((x) => x.id === schemaId);
    const idx = s.properties.findIndex((p) => p.name === name);
    const pos = layout[schemaId];
    return {
      left:  { x: pos.x,             y: pos.y + headerHeight + idx * propHeight + propHeight / 2 },
      right: { x: pos.x + nodeWidth, y: pos.y + headerHeight + idx * propHeight + propHeight / 2 },
    };
  };

  return (
    <div className="page-body" data-screen-label="Dependency graph" style={{ paddingTop: 0 }}>
      <div className="page-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="crumb"><span>workspace</span><MIcon name="chevron-right" size={12} /><span>dependency graph</span></div>
        <div className="row">
          <div>
            <h1>Dependency graph</h1>
            <p className="subtitle">How fields reference each other across schemas. Mirage topologically sorts edges so every generated row has a real upstream value to point at — and surfaces any cycles with the full chain that broke validation.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setShowCycle(v => !v)}><MIcon name="alert-triangle" size={14} /> {showCycle ? 'Hide' : 'Show'} cycle example</button>
            <button className="btn"><MIcon name="shuffle" size={14} /> Re-layout</button>
            <button className="btn"><MIcon name="download" size={14} /> Export SVG</button>
            <button className="btn btn-primary" onClick={onCreate}><MIcon name="plus" size={14} /> New schema</button>
          </div>
        </div>
        <div className="meta-row">
          <span className="meta"><MIcon name="database" size={14} /> schemas <b>{SCHEMAS.length}</b></span>
          <span className="meta"><MIcon name="branch" size={14} /> edges <b>{edges.length}</b></span>
          <span className="meta" style={{ color: showCycle ? 'hsl(var(--destructive))' : 'hsl(var(--brand-emerald))' }}>
            {showCycle ? <><MIcon name="alert-circle" size={14} /> 1 cycle detected</> : <><MIcon name="check" size={14} /> acyclic</>}
          </span>
          <span className="meta"><MIcon name="time" size={14} /> sorted in <b>3 ms</b></span>
        </div>
      </div>

      <div style={{ height: 16 }} />

      {showCycle && (
        <div className="cycle-warn">
          <MIcon name="alert-triangle" size={20} className="" />
          <div className="body">
            <div className="ti">Circular dependency detected</div>
            <div className="sub">Generation cannot start until this cycle is broken. Edit one of the edges below or mark a field as <span className="mono">optional + fallback</span> to break the chain.</div>
            <div className="cycle-path">
              <span className="node">mobile.personId</span>
              <MIcon name="arrow-right" size={12} />
              <span className="mono" style={{ color: 'hsl(var(--muted-foreground))' }}>$ref person.id</span>
              <MIcon name="arrow-right" size={12} />
              <span className="node">person.primaryMobileId</span>
              <MIcon name="arrow-right" size={12} />
              <span className="mono" style={{ color: 'hsl(var(--muted-foreground))' }}>$ref mobile.id</span>
              <MIcon name="arrow-right" size={12} />
              <span className="node">mobile.personId</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn btn-sm"><MIcon name="code" size={13} /> View JSON paths</button>
              <button className="btn btn-sm"><MIcon name="edit" size={13} /> Suggest fix</button>
              <button className="btn btn-sm" style={{ color: 'hsl(var(--destructive))' }}><MIcon name="x" size={13} /> Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <div className="graph-canvas" style={{ height: 620 }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <marker id="ar-violet" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--brand-violet))" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const from = anchor(e.fromSchema, e.fromField);
            const to = anchor(e.toSchema, e.toField);
            const fx = from.right.x, fy = from.right.y;
            const tx = to.left.x, ty = to.left.y;
            const mid = (fx + tx) / 2;
            const d = 'M ' + fx + ' ' + fy + ' C ' + mid + ' ' + fy + ', ' + mid + ' ' + ty + ', ' + tx + ' ' + ty;
            return <g key={i}><path d={d} stroke="hsl(var(--brand-violet))" strokeOpacity="0.7" strokeWidth="1.5" fill="none" markerEnd="url(#ar-violet)" strokeDasharray="5 3" /></g>;
          })}
        </svg>

        {SCHEMAS.map((s) => {
          const pos = layout[s.id];
          return (
            <div key={s.id} className="graph-node" style={{ left: pos.x, top: pos.y, width: nodeWidth }}>
              <div className="gn-head">
                <div className="name">
                  <div className={'icon ' + pos.color}><MIcon name={s.icon} size={12} /></div>
                  <span className="mono">{s.id}</span>
                </div>
                <span className="badge" style={{ fontSize: 10 }}>{s.properties.length} props</span>
              </div>
              <div>
                {s.properties.map((p) => (
                  <div key={p.name} className={'gn-prop ' + (p.isRef ? 'is-ref' : '')} style={{ height: propHeight }}>
                    <span className="name">
                      {p.isRef && <MIcon name="link" size={11} />}
                      <span>{p.name}</span>
                      {p.required && <span style={{ color: 'hsl(var(--destructive))' }}>*</span>}
                    </span>
                    <span className="meth">{p.faker?.method ? p.faker.method.split('.').pop() : (p.isRef ? '$ref' : '—')}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="graph-controls">
          <button title="Zoom in"><MIcon name="plus" size={14} /></button>
          <button title="Zoom out"><MIcon name="minus" size={14} /></button>
          <button title="Fit"><MIcon name="maximize" size={14} /></button>
          <button title="Filter"><MIcon name="filter" size={14} /></button>
        </div>

        <div className="graph-legend">
          <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 500 }}>Legend</div>
          <div className="row"><span className="sw dash" /> cross-schema $ref</div>
          <div className="row"><span className="sw" /> generation order</div>
          <div className="row"><span style={{ width: 10, height: 10, background: 'hsl(var(--brand-emerald))', borderRadius: 2 }} /> acyclic</div>
        </div>
      </div>

      <div className="order-strip">
        <span className="lbl">Generation order</span>
        {TOPO_ORDER.map((o, i) => (
          <React.Fragment key={i}>
            {i > 0 && <MIcon name="chevron-right" size={12} />}
            <span className="order-chip"><span className="schema">{o.schemaId}</span><span style={{ color: 'hsl(var(--muted-foreground))' }}>.</span><span className="field">{o.name}</span></span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
Object.assign(window, { GraphPage });



function SetsPage({ onCreate }) {
  const [view, setView] = React.useState('list'); // list | detail
  const [activeSetId, setActiveSetId] = React.useState(SETS[0].id);

  if (view === 'detail') {
    const set = SETS.find(s => s.id === activeSetId) || SETS[0];
    return <SetDetail set={set} onBack={() => setView('list')} />;
  }

  return (
    <div className="page-body" data-screen-label="Sets" style={{ paddingTop: 0 }}>
      <div className="page-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="crumb"><span>workspace</span><MIcon name="chevron-right" size={12} /><span>sets</span></div>
        <div className="row">
          <div>
            <h1>Sets</h1>
            <p className="subtitle">A <b>set</b> is a saved combination of schemas, record counts, filters, and cross-reference strategies. Each has a unique salt so runs are reproducible — same salt, same data, every time.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="input-group" style={{ width: 280 }}>
              <span className="input-affix"><MIcon name="search" size={13} /></span>
              <input className="input" placeholder="Search sets…" />
            </div>
            <button className="btn"><MIcon name="filter" size={14} /> Filter</button>
            <button className="btn btn-primary"><MIcon name="plus" size={14} /> New set</button>
          </div>
        </div>
        <div className="meta-row">
          <span className="meta"><MIcon name="package" size={14} /> total <b>{SETS.length} sets</b></span>
          <span className="meta" style={{ color: 'hsl(var(--brand-emerald))' }}><MIcon name="check" size={14} /> <b>{SETS.filter(s => s.status === 'completed').length} ready</b></span>
          <span className="meta" style={{ color: 'hsl(var(--destructive))' }}><MIcon name="alert-circle" size={14} /> <b>{SETS.filter(s => s.status === 'invalid').length} invalid</b></span>
          <span className="meta"><MIcon name="hash" size={14} /> last run <b>12 min ago</b></span>
        </div>
      </div>

      <div style={{ height: 24 }} />

      <div className="sets-grid">
        {SETS.map((s) => {
          const totalRows = s.schemas.reduce((sum, x) => sum + x.count, 0);
          return (
            <div key={s.id} className="card set-card" onClick={() => { setActiveSetId(s.id); setView('detail'); }}>
              <div className="set-card-head">
                <div className="title-row">
                  <div style={{ width: 32, height: 32, borderRadius: 8, color: 'white', background: 'hsl(var(--brand-' + s.color + '))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MIcon name={s.icon} size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3>{s.name}</h3>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {s.tags.map(t => <span key={t} className="badge"><MIcon name="tag" size={9} /> {t}</span>)}
                      {s.status === 'invalid' && <span className="badge rose"><MIcon name="alert-circle" size={10} /> invalid</span>}
                    </div>
                  </div>
                </div>
                <div className="purpose">{s.purpose}</div>
              </div>
              <div className="set-card-body">
                <div className="schema-chips">
                  {s.schemas.map(x => {
                    const sch = SCHEMAS.find(z => z.id === x.schemaId);
                    return (
                      <span key={x.schemaId} className="schema-chip">
                        <span className="dot" style={{ background: 'hsl(var(--brand-' + sch.color + '))' }} />
                        {x.schemaId} · {x.count.toLocaleString()}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="set-meta">
                <div className="m-row"><span className="l">Total rows</span><span className="v">{totalRows.toLocaleString()}</span></div>
                <div className="m-row"><span className="l">Salt</span><span className="v" style={{ fontSize: 11 }}>{s.salt}</span></div>
                <div className="m-row"><span className="l">Last run</span><span className="v" style={{ fontSize: 11 }}>{s.lastRun}</span></div>
              </div>
              <div className="set-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-sm btn-primary" style={{ flex: 1 }}><MIcon name="play" size={13} /> Run</button>
                <button className="btn btn-sm" onClick={() => { setActiveSetId(s.id); setView('detail'); }}><MIcon name="eye" size={13} /> Open</button>
                <button className="btn btn-sm btn-icon btn-ghost"><MIcon name="overflow" size={14} /></button>
              </div>
            </div>
          );
        })}

        {/* New set placeholder */}
        <div className="card connector-card placeholder" onClick={onCreate}>
          <MIcon name="plus" size={20} />
          <span>New set</span>
          <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', maxWidth: 240, textAlign: 'center' }}>Pick schemas, set counts and filters, save a reusable run config.</span>
        </div>
      </div>
    </div>
  );
}



function SetDetail({ set, onBack }) {
  const [activeTab, setActiveTab] = React.useState('config'); // config | strategies | preview
  const [strategies, setStrategies] = React.useState(() => set.edges.map(e => ({ ...e })));
  const [activeEdge, setActiveEdge] = React.useState(0);
  const [salt, setSalt] = React.useState(set.salt);

  return (
    <div className="page-body" data-screen-label="Set detail" style={{ paddingTop: 0 }}>
      <div className="page-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="crumb">
          <span style={{ cursor: 'pointer' }} onClick={onBack}>workspace</span>
          <MIcon name="chevron-right" size={12} />
          <span style={{ cursor: 'pointer' }} onClick={onBack}>sets</span>
          <MIcon name="chevron-right" size={12} />
          <span className="mono">{set.id}</span>
        </div>

        <div className="set-detail-head">
          <div className="icon-lg" style={{ background: 'hsl(var(--brand-' + set.color + '))' }}>
            <MIcon name={set.icon} size={22} />
          </div>
          <div>
            <h2>{set.name}</h2>
            <div className="desc">{set.purpose}</div>
            <div className="badges">
              {set.tags.map(t => <span key={t} className="badge"><MIcon name="tag" size={10} /> {t}</span>)}
              {set.status === 'invalid'
                ? <span className="badge rose"><MIcon name="alert-circle" size={10} /> invalid · custom fn error</span>
                : <span className="badge emerald"><MIcon name="check-circle" size={10} /> last run · {set.duration}</span>}
              <span className="badge"><MIcon name="user" size={10} /> {set.lastRunBy}</span>
              <span className="badge"><MIcon name="time" size={10} /> {set.lastRun}</span>
            </div>
          </div>
          <div className="actions">
            <div className="salt-pill">
              <MIcon name="dice" size={12} />
              <input className="" value={salt} onChange={(e) => setSalt(e.target.value)}
                     style={{ border: 0, outline: 0, background: 'transparent', font: 'inherit', color: 'inherit', width: 180 }} />
              <button className="regen" style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
                      onClick={() => setSalt('mirage-' + Math.random().toString(36).slice(2, 10))}>
                <MIcon name="shuffle" size={12} />
              </button>
            </div>
            <button className="btn"><MIcon name="copy" size={14} /> Duplicate</button>
            <button className="btn btn-primary"><MIcon name="play" size={14} /> Run set</button>
          </div>
        </div>

        <div className="tabs-line">
          <button className={'tab ' + (activeTab === 'config' ? 'active' : '')} onClick={() => setActiveTab('config')}>
            <MIcon name="sliders" size={13} /> Configuration
          </button>
          <button className={'tab ' + (activeTab === 'strategies' ? 'active' : '')} onClick={() => setActiveTab('strategies')}>
            <MIcon name="link" size={13} /> Cross-reference strategies <span className="badge violet">{strategies.length}</span>
          </button>
          <button className={'tab ' + (activeTab === 'preview' ? 'active' : '')} onClick={() => setActiveTab('preview')}>
            <MIcon name="eye" size={13} /> Output preview
          </button>
        </div>
      </div>

      <div style={{ height: 24 }} />

      {activeTab === 'config' && <SetConfig set={set} />}
      {activeTab === 'strategies' && <SetStrategies set={set} strategies={strategies} setStrategies={setStrategies} activeEdge={activeEdge} setActiveEdge={setActiveEdge} />}
      {activeTab === 'preview' && <SetPreview set={set} />}
    </div>
  );
}

function SetConfig({ set }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Schemas in this set</h3>
            <div className="desc">Per-schema record count and filters. Cross-references will be resolved automatically using the strategies tab.</div>
          </div>
          <button className="btn btn-sm"><MIcon name="plus" size={13} /> Add schema</button>
        </div>
        <div className="tbl-wrap">
          <table className="tbl set-table">
            <thead>
              <tr>
                <th>Schema</th>
                <th style={{ textAlign: 'right' }}>Records</th>
                <th>Filters / constraints</th>
                <th>Generation cost</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {set.schemas.map((row) => {
                const sch = SCHEMAS.find(s => s.id === row.schemaId);
                const filters = row.filters || [];
                const cost = (row.count * sch.properties.length * 0.00008).toFixed(2);
                return (
                  <tr key={row.schemaId}>
                    <td>
                      <div className="schema-cell">
                        <div className="icon-sm" style={{ background: 'hsl(var(--brand-' + sch.color + '))' }}><MIcon name={sch.icon} size={12} /></div>
                        <div>
                          <span className="nm">{sch.title}</span>
                          <span className="id">{sch.id}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input className="input sm mono" defaultValue={row.count.toLocaleString()} style={{ width: 110, textAlign: 'right' }} />
                        <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>rows</span>
                      </div>
                    </td>
                    <td>
                      <div className="filters-cell">
                        {filters.length === 0 && <span style={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', fontSize: 12 }}>no filters</span>}
                        {filters.map((f, i) => (
                          <span key={i} className="filter-chip">
                            <span style={{ fontWeight: 600 }}>{f.field}</span>
                            <span style={{ color: 'hsl(var(--muted-foreground))' }}>{f.op}</span>
                            <span>{f.value}</span>
                          </span>
                        ))}
                        <button className="btn btn-xs btn-ghost"><MIcon name="plus" size={10} /> Add</button>
                      </div>
                    </td>
                    <td><span className="mono">~{cost}s</span></td>
                    <td><button className="btn btn-icon btn-sm btn-ghost"><MIcon name="overflow" size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Output</h3>
            <div className="desc">Where the rows will land. Override per-run or per-schema from the strategies tab.</div>
          </div>
        </div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12 }}>Format</label>
            <select className="select"><option>JSON Lines</option><option>CSV</option><option>SQL inserts</option><option>Parquet</option></select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12 }}>Locale</label>
            <select className="select" defaultValue="en_AE"><option>en_AE</option><option>en_US</option><option>ar</option></select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12 }}>Worker pool</label>
            <input className="input mono" defaultValue="4" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SetStrategies({ set, strategies, setStrategies, activeEdge, setActiveEdge }) {
  const e = strategies[activeEdge] || strategies[0];
  const updateEdge = (patch) => setStrategies(strategies.map((x, i) => i === activeEdge ? { ...x, ...patch } : x));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="card dist-card">
        <div className="card-header">
          <div>
            <h3>Cross-reference edges</h3>
            <div className="desc">Mirage detected {strategies.length} foreign-key relationships in this set. Pick how each one resolves.</div>
          </div>
          <button className="btn btn-sm"><MIcon name="alert-triangle" size={13} /> Validate</button>
        </div>
        {strategies.map((edg, i) => {
          const from = SCHEMAS.find(s => s.id === edg.fromSchema);
          const to = SCHEMAS.find(s => s.id === edg.toSchema);
          const meta = STRATEGY_META[edg.strategy];
          const isActive = i === activeEdge;
          return (
            <div key={i} className="dist-row" style={{ background: isActive ? 'hsl(var(--accent))' : 'transparent', cursor: 'pointer' }} onClick={() => setActiveEdge(i)}>
              <div className="from">
                <div className="icon-sm" style={{ background: 'hsl(var(--brand-' + from.color + '))' }}><MIcon name={from.icon} size={11} /></div>
                <div className="label">
                  <div className="nm"><b>{edg.fromSchema}</b>.{edg.fromField}</div>
                  <div className="ty">source · {edg.fromField}</div>
                </div>
              </div>
              <div className="arrow"><MIcon name="arrow-right" size={14} /></div>
              <div className="to">
                <div className="icon-sm" style={{ background: 'hsl(var(--brand-' + to.color + '))' }}><MIcon name={to.icon} size={11} /></div>
                <div className="label">
                  <div className="nm"><b>{edg.toSchema}</b>.{edg.toField}</div>
                  <div className="ty">target · {edg.toField}</div>
                </div>
              </div>
              <div className="strategy">
                <span className="badge violet" style={{ alignSelf: 'flex-start' }}>
                  <MIcon name={meta.icon === 'chart-line' ? 'sliders' : meta.icon} size={11} /> {meta.label}
                </span>
                {edg.strategy === 'custom' && edg.config?.error && <span className="strategy-meta" style={{ color: 'hsl(var(--destructive))' }}>error · {edg.config.error}</span>}
                {edg.config?.ratio && <span className="strategy-meta mono">{edg.config.ratio}</span>}
                {edg.config?.mean && <span className="strategy-meta mono">mean {edg.config.mean} ± {edg.config.jitter}</span>}
                {edg.config?.fn && !edg.config.error && <span className="strategy-meta mono">fn: {edg.config.fn}()</span>}
              </div>
              <span><MIcon name={isActive ? 'chevron-right' : 'chevron-right'} size={14} /></span>
            </div>
          );
        })}
        <div className="dist-strategy-summary">
          <span><b>Coverage:</b> 100% of source rows resolved</span>
          <span><b>Orphans:</b> 0</span>
          <span><b>Duplicate target:</b> allowed in 2 strategies</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Strategy: {STRATEGY_META[e.strategy].label}</h3>
              <div className="desc">{e.fromSchema}.{e.fromField} → {e.toSchema}.{e.toField}</div>
            </div>
            <button className="btn btn-sm btn-ghost"><MIcon name="help" size={13} /></button>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Distribution mode</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 4 }}>
                {Object.entries(STRATEGY_META).map(([key, m]) => (
                  <div key={key}
                       onClick={() => updateEdge({ strategy: key, config: key === 'custom' ? { fn: 'pickByRule' } : {} })}
                       style={{
                         display: 'flex', alignItems: 'flex-start', gap: 8,
                         padding: 10, border: '1px solid', borderColor: e.strategy === key ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                         borderRadius: 'var(--radius-md)', cursor: 'pointer',
                         background: e.strategy === key ? 'hsl(var(--accent))' : 'hsl(var(--background))',
                       }}>
                    <MIcon name={m.icon === 'chart-line' ? 'sliders' : m.icon} size={14} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>{m.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {e.strategy === 'random' && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Approx ratio</label>
                <input className="input mono" defaultValue={e.config?.ratio || '~1.5 / source'} />
                <div className="helper">Soft ratio of target rows per source row. Useful for fan-out (one person → multiple mobiles).</div>
              </div>
            )}

            {e.strategy === 'avg-split' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Mean</label>
                  <input className="input mono" defaultValue={e.config?.mean || 1} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Jitter</label>
                  <input className="input mono" defaultValue={e.config?.jitter || 0.2} />
                </div>
              </div>
            )}

            {e.strategy === 'weighted' && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Weight expression</label>
                <input className="input mono" placeholder="e.g. row.priority * 2 + 1" />
                <div className="helper">Evaluated for each target row. Higher = picked more often.</div>
              </div>
            )}

            {e.strategy === '1:1' && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>On missing target</label>
                <select className="select"><option>Re-roll source</option><option>Skip row</option><option>Use null</option></select>
              </div>
            )}
          </div>
        </div>

        {e.strategy === 'custom' && <CustomFnEditor edge={e} updateEdge={updateEdge} />}
      </div>
    </div>
  );
}

function CustomFnEditor({ edge, updateEdge }) {
  const hasError = !!edge.config?.error;
  const code = [
    "// Mirage strategy fn — must return target row from store",
    "import type { StrategyContext } from '@mirage/types';",
    "",
    "export function " + (edge.config?.fn || 'pickByRule') + "(",
    "  source: " + edge.fromSchema.replace(/-/g, '_') + ",",
    "  store: StrategyContext['" + edge.toSchema + "'],",
    ") {",
    "  // Custom logic: pick a row that satisfies the business rule.",
    "  const candidates = store.filter(r => r.personId === source.id);",
    "  if (candidates.length === 0) return store.random();",
    "",
    "  // Prefer verified rows, fall back to first match",
    "  return candidates.find(r => r.verified) ?? candidates[0];",
    "}",
  ];

  // Simple syntax highlighting
  const highlight = (line) => {
    const tokens = [];
    let s = line;
    // comments
    if (s.trim().startsWith('//')) return [<span key="c" className="tk-com">{s}</span>];
    // very small regex set
    const patterns = [
      [/\b(import|from|export|function|return|const|let|if|else|filter|find|random|type|interface)\b/g, 'tk-key'],
      [/\b(StrategyContext|string|number|boolean)\b/g, 'tk-typ'],
      [/('[^']*'|"[^"]*")/g, 'tk-str'],
      [/\b(\d+)\b/g, 'tk-num'],
      [/[{}()\[\];:.,=<>?&|!]+/g, 'tk-pun'],
    ];
    // Split and recombine — simplistic
    const segs = [];
    let last = 0;
    const matches = [];
    patterns.forEach(([rx, cls]) => {
      let m; rx.lastIndex = 0;
      while ((m = rx.exec(s))) matches.push({ start: m.index, end: m.index + m[0].length, cls, txt: m[0] });
    });
    matches.sort((a, b) => a.start - b.start);
    // remove overlaps
    const accepted = [];
    matches.forEach(mm => { if (!accepted.some(a => mm.start < a.end && mm.end > a.start)) accepted.push(mm); });
    accepted.sort((a, b) => a.start - b.start);
    accepted.forEach((mm, i) => {
      if (mm.start > last) segs.push(<span key={'p' + i}>{s.slice(last, mm.start)}</span>);
      segs.push(<span key={'h' + i} className={mm.cls}>{mm.txt}</span>);
      last = mm.end;
    });
    if (last < s.length) segs.push(<span key="end">{s.slice(last)}</span>);
    return segs;
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-header" style={{ borderBottom: 0, paddingBottom: 8 }}>
        <div>
          <h3>Custom function</h3>
          <div className="desc">Write a TypeScript function. Receives <span className="mono">source</span> and <span className="mono">store</span>; returns the target row.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm"><MIcon name="play" size={12} /> Test</button>
          <button className="btn btn-sm"><MIcon name="copy" size={12} /> Copy</button>
        </div>
      </div>
      <div className="code-editor" style={{ margin: '0 16px 16px' }}>
        <div className="ce-head">
          <div className="ce-tabs">
            <button className="ce-tab active">{(edge.config?.fn || 'pickByRule')}.ts</button>
            <button className="ce-tab">types.d.ts</button>
          </div>
          <span>TypeScript · strategy</span>
        </div>
        <div className="ce-body">
          <div className="ce-gutter">{code.map((_, i) => <div key={i}>{i + 1}</div>)}</div>
          <div className="ce-content">
            {code.map((line, i) => <div key={i}>{line ? highlight(line) : <span>&nbsp;</span>}</div>)}
          </div>
        </div>
        <div className="ce-foot">
          {hasError
            ? <><MIcon name="alert-triangle" size={12} style={{ color: 'hsl(0 84% 65%)' }} /> <span style={{ color: 'hsl(0 84% 65%)' }}>{edge.config.error}</span></>
            : <><MIcon name="check-circle" size={12} className="check" /> <span className="check">type-checked</span> · <span>last validated 2s ago</span></>}
          <span style={{ marginLeft: 'auto' }}><span className="mono">⌘S</span> save · <span className="mono">⌘↵</span> run test</span>
        </div>
      </div>
    </div>
  );
}

function SetPreview({ set }) {
  const [tab, setTab] = React.useState(set.schemas[0]?.schemaId);
  return (
    <div>
      <div className="run-bar" style={{ marginBottom: 16 }}>
        <MIcon name="check-circle" size={20} />
        <div className="stat"><div className="l">Status</div><div className="v green">Completed</div></div>
        <div className="stat"><div className="l">Salt</div><div className="v" style={{ fontSize: 12 }}>{set.salt}</div></div>
        <div className="stat"><div className="l">Rows</div><div className="v">{set.schemas.reduce((s, x) => s + x.count, 0).toLocaleString()}</div></div>
        <div className="stat"><div className="l">Duration</div><div className="v">{set.duration}</div></div>
        <div className="spacer" />
        <button className="btn btn-sm" style={{ background: 'transparent', color: 'white', borderColor: 'hsl(240 5% 25%)' }}><MIcon name="send" size={13} /> Send to connector</button>
        <button className="btn btn-sm" style={{ background: 'white', color: 'black', borderColor: 'white' }}><MIcon name="download" size={13} /> Download</button>
      </div>

      <div className="tabs-line">
        {set.schemas.map((row) => {
          const sch = SCHEMAS.find(s => s.id === row.schemaId);
          return (
            <button key={row.schemaId} className={'tab ' + (tab === row.schemaId ? 'active' : '')} onClick={() => setTab(row.schemaId)}>
              <div style={{ width: 16, height: 16, borderRadius: 4, color: 'white', background: 'hsl(var(--brand-' + sch.color + '))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MIcon name={sch.icon} size={10} />
              </div>
              <span>{row.schemaId}</span>
              <span className="badge mono">{row.count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <OutputTable schemaId={tab} count={set.schemas.find(s => s.schemaId === tab)?.count} />
    </div>
  );
}

// (re-export OutputTable shape from earlier file by name — defined below)



function OutputTable({ schemaId, count }) {
  const schema = SCHEMAS.find((s) => s.id === schemaId);
  if (!schema) return null;
  const rows = ROWS[schemaId] || [];
  return (
    <div className="card tbl-card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
      <div className="tbl-toolbar">
        <div className="search-bar"><MIcon name="search" size={12} /><input placeholder={'Search ' + Number(count || 0).toLocaleString() + ' rows'} /></div>
        <span className="badge emerald"><MIcon name="check-circle" size={11} /> referential integrity ok</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-ghost"><MIcon name="copy" size={13} /> Copy</button>
        <button className="btn btn-sm btn-ghost"><MIcon name="external-link" size={13} /> Open</button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {schema.properties.map((p) => (
                <th key={p.name}>
                  {p.name}{p.required && <span style={{ color: 'hsl(var(--destructive))' }}> *</span>}
                  <span className="ty">{p.type}{p.format ? ' · ' + p.format : ''}{p.isRef ? ' · ref' : ''}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {schema.properties.map((p) => {
                  const v = row[p.name];
                  if (v === undefined || v === null) return <td key={p.name}><span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span></td>;
                  if (typeof v === 'boolean') return <td key={p.name}><span className={'badge ' + (v ? 'emerald' : '')}>{v ? <MIcon name="check" size={10} /> : <MIcon name="x" size={10} />} {String(v)}</span></td>;
                  if (p.isRef) return <td key={p.name}><span className="badge violet mono" style={{ borderRadius: 4 }}><MIcon name="link" size={10} /><span className="truncate">{v}</span></span></td>;
                  if (p.format === 'uuid') return <td key={p.name}><span className="truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{v}</span></td>;
                  return <td key={p.name}><span className="truncate">{v}</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot">
        <span>Showing 1–{rows.length} of {Number(count || 0).toLocaleString()}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span>Rows per page</span>
          <select className="select sm" style={{ width: 64 }}><option>{rows.length}</option><option>50</option><option>100</option></select>
        </span>
      </div>
    </div>
  );
}

function ConnectorsPage() {
  const fileConnectors = [
    { name: 'JSON Lines', sub: '.ndjson · stream-friendly', icon: 'json', cls: 'json', glyph: <span style={{ fontWeight: 600 }}>{ '{ }' }</span> },
    { name: 'CSV',        sub: '.csv · UTF-8',               icon: 'file-text', cls: 'csv', glyph: 'CSV' },
    { name: 'Excel',      sub: '.xlsx · multi-sheet',        icon: 'table', cls: 'xlsx', glyph: 'XLS' },
    { name: 'Parquet',    sub: '.parquet · columnar',        icon: 'package', cls: 'parquet', glyph: 'PQ' },
    { name: 'Zip bundle', sub: 'all schemas zipped',         icon: 'package', cls: 'zip', glyph: 'ZIP' },
  ];
  const dbConnectors = [
    { name: 'MongoDB',      sub: 'mongodb://staging.presight/identity', last: '12 min ago',  status: 'ok',    cls: 'mongo',   glyph: <span style={{ fontWeight: 700 }}>M</span> },
    { name: 'PostgreSQL',   sub: 'postgres://staging.presight/identity',last: '2 hr ago',    status: 'ok',    cls: 'postgres',glyph: <span style={{ fontWeight: 700 }}>P</span> },
    { name: 'Elasticsearch',sub: 'https://es.presight/_bulk',           last: '6 hr ago',    status: 'idle',  cls: 'elastic', glyph: <span style={{ fontWeight: 700, color: 'inherit' }}>E</span> },
    { name: 'MySQL',        sub: 'mysql://qa.g42/test_fixtures',        last: 'Yesterday',   status: 'ok',    cls: 'mysql',   glyph: <span style={{ fontWeight: 700 }}>my</span> },
    { name: 'Redis',        sub: 'redis://cache.presight:6379',         last: '3 days ago',  status: 'idle',  cls: 'redis',   glyph: <span style={{ fontWeight: 700 }}>R</span> },
    { name: 'Snowflake',    sub: 'snowflake://acme.us-east-2',          last: 'Last week',   status: 'idle',  cls: 'snowflake', glyph: <span style={{ fontWeight: 700 }}>SF</span> },
  ];
  const apiConnectors = [
    { name: 'Webhook · QA bot',  sub: 'POST https://qa.presight.io/mirage', last: '3 days ago', status: 'ok', cls: 'webhook', glyph: <MIcon name="send" size={18} /> },
    { name: 'Webhook · Slack',   sub: 'POST hooks.slack.com/services/...',   last: 'Today',      status: 'ok', cls: 'webhook', glyph: <MIcon name="send" size={18} /> },
    { name: 'Generic HTTP',      sub: 'PUT https://api.acme.io/seed',        last: '2 hr ago',   status: 'ok', cls: 'http',    glyph: <MIcon name="globe" size={18} /> },
    { name: 'S3 · dev-fixtures', sub: 's3://identity-platform/dev-fixtures/',last: '12 min ago', status: 'ok', cls: 's3',      glyph: <MIcon name="cloud" size={18} /> },
  ];

  const renderCard = (c, kind) => (
    <div key={c.name} className="card connector-card">
      <div className="cc-head">
        <div className={'cc-icon ' + c.cls}>{c.glyph || (kind === 'file' ? c.cls.toUpperCase() : <MIcon name="connect" size={18} />)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="nm">{c.name}</div>
          <div className="ty">{kind}</div>
        </div>
        <button className="btn btn-icon btn-sm btn-ghost"><MIcon name="overflow" size={13} /></button>
      </div>
      <div className="cc-body">
        {c.sub && <div className="uri">{c.sub}</div>}
      </div>
      <div className="cc-foot">
        <span className="status-l">
          {c.status === 'ok' && <><span className="status-dot green" /> Connected</>}
          {c.status === 'idle' && <><span className="status-dot" /> Idle</>}
          {!c.status && <><span style={{ color: 'hsl(var(--muted-foreground))' }}>Available</span></>}
        </span>
        <span>{c.last || 'never'}</span>
      </div>
    </div>
  );

  return (
    <div className="page-body" data-screen-label="Connectors" style={{ paddingTop: 0 }}>
      <div className="page-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="crumb"><span>workspace</span><MIcon name="chevron-right" size={12} /><span>connectors</span></div>
        <div className="row">
          <div>
            <h1>Connectors</h1>
            <p className="subtitle">Send any set’s output anywhere — files, databases, APIs. Connectors are workspace-scoped and re-used across sets.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn"><MIcon name="filter" size={14} /> Filter</button>
            <button className="btn btn-primary"><MIcon name="plus" size={14} /> New connector</button>
          </div>
        </div>
        <div className="meta-row">
          <span className="meta"><MIcon name="package" size={14} /> file formats <b>{fileConnectors.length}</b></span>
          <span className="meta"><MIcon name="database" size={14} /> databases <b>{dbConnectors.length}</b></span>
          <span className="meta"><MIcon name="send" size={14} /> APIs <b>{apiConnectors.length}</b></span>
          <span className="meta"><MIcon name="check" size={14} style={{ color: 'hsl(var(--brand-emerald))' }} /> <b>{dbConnectors.filter(c => c.status === 'ok').length + apiConnectors.filter(c => c.status === 'ok').length} active</b></span>
        </div>
      </div>

      <div style={{ height: 24 }} />

      <div className="connectors-section">
        <div className="section-head">
          <h3><MIcon name="download" size={14} /> File exports</h3>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>On-demand download of any set</span>
        </div>
        <div className="connectors-grid">
          {fileConnectors.map(c => renderCard(c, 'file'))}
        </div>
      </div>

      <div className="connectors-section">
        <div className="section-head">
          <h3><MIcon name="database" size={14} /> Databases</h3>
          <button className="btn btn-sm"><MIcon name="plus" size={13} /> Add database</button>
        </div>
        <div className="connectors-grid">
          {dbConnectors.map(c => renderCard(c, 'database'))}
          <div className="card connector-card placeholder">
            <MIcon name="plus" size={20} />
            <span>Add database</span>
            <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', maxWidth: 220, textAlign: 'center' }}>MongoDB, Postgres, MySQL, Elastic, ClickHouse, Snowflake…</span>
          </div>
        </div>
      </div>

      <div className="connectors-section">
        <div className="section-head">
          <h3><MIcon name="send" size={14} /> APIs &amp; webhooks</h3>
          <button className="btn btn-sm"><MIcon name="plus" size={13} /> Add API</button>
        </div>
        <div className="connectors-grid">
          {apiConnectors.map(c => renderCard(c, 'api'))}
          <div className="card connector-card placeholder">
            <MIcon name="plus" size={20} />
            <span>Add webhook / API</span>
            <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', maxWidth: 220, textAlign: 'center' }}>POST/PUT to any HTTP endpoint with auth headers and retry policy.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryPage() {
  return (
    <div className="page-body" data-screen-label="Run history" style={{ paddingTop: 0 }}>
      <div className="page-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="crumb"><span>workspace</span><MIcon name="chevron-right" size={12} /><span>run history</span></div>
        <div className="row">
          <div>
            <h1>Run history</h1>
            <p className="subtitle">Every set run is recorded with its salt, counts, and output artefacts. Re-run any past job verbatim — same salt, same data.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn"><MIcon name="filter" size={14} /> Filter</button>
            <button className="btn"><MIcon name="download" size={14} /> Export CSV</button>
          </div>
        </div>
        <div className="meta-row">
          <span className="meta"><MIcon name="time" size={14} /> last 7 days <b>{HISTORY.length} runs</b></span>
          <span className="meta" style={{ color: 'hsl(var(--brand-emerald))' }}><MIcon name="check" size={14} /> <b>{HISTORY.filter(h => h.status === 'completed').length} completed</b></span>
          <span className="meta" style={{ color: 'hsl(var(--destructive))' }}><MIcon name="alert-circle" size={14} /> <b>{HISTORY.filter(h => h.status === 'failed').length} failed</b></span>
          <span className="meta"><MIcon name="hash" size={14} /> total rows <b>432,000</b></span>
        </div>
      </div>
      <div style={{ height: 24 }} />
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto auto auto', gap: 16, padding: '12px 16px', borderBottom: '1px solid hsl(var(--border))', fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.05, background: 'hsl(var(--muted) / 0.4)' }}>
          <span /><span>Run · author</span><span style={{ textAlign: 'right' }}>Rows</span><span>Duration</span><span>When</span><span />
        </div>
        {HISTORY.map((h) => {
          const totalRows = Object.values(h.counts).reduce((s, v) => s + v, 0);
          const schemaSummary = Object.entries(h.counts).map(([k, v]) => k + ': ' + v.toLocaleString()).join(' · ');
          return (
            <div key={h.id} className="run-row">
              <span>{h.status === 'completed' ? <MIcon name="check-circle" size={16} /> : <MIcon name="alert-circle" size={16} />}</span>
              <div className="who">
                <span className="name"><span className="mono" style={{ color: 'hsl(var(--brand-violet))' }}>{h.id}</span><span>{h.who}</span>{h.status === 'failed' && <span className="badge rose">failed</span>}</span>
                <span className="sub">{schemaSummary}{h.error ? ' · ' + h.error : ''}</span>
              </div>
              <div className="count">{totalRows.toLocaleString()}<div className="sub">{h.size}</div></div>
              <span className="dur">{h.duration}</span>
              <span className="ago">{h.when}</span>
              <button className="btn btn-icon btn-sm btn-ghost"><MIcon name="overflow" size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FakersPage() {
  return (
    <div className="page-body" data-screen-label="Faker reference" style={{ paddingTop: 0 }}>
      <div className="page-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="crumb"><span>workspace</span><MIcon name="chevron-right" size={12} /><span>faker reference</span></div>
        <div className="row">
          <div>
            <h1>Faker reference</h1>
            <p className="subtitle">2,341 methods from <span className="mono">@faker-js/faker v9.3</span> plus your custom workspace methods. Drop any one into a property.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn"><MIcon name="plus" size={14} /> Custom method</button>
            <div className="input-group" style={{ width: 320 }}>
              <span className="input-affix"><MIcon name="search" size={14} /></span>
              <input className="input" placeholder="Search methods…" />
            </div>
          </div>
        </div>
      </div>
      <div style={{ height: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {FAKER_GROUPS.map(g => (
          <div key={g.ns} className="card">
            <div className="card-header" style={{ padding: '10px 14px' }}>
              <span className="badge violet mono">{g.ns}</span>
              <span className="badge mono">{g.methods.length}</span>
            </div>
            <div>
              {g.methods.map(m => (
                <div key={m} style={{ padding: '8px 14px', borderTop: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, cursor: 'pointer' }}>
                  <span className="mono">.{m}</span>
                  <button className="btn btn-icon btn-sm btn-ghost"><MIcon name="plus" size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="card" style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6, color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}>
          <MIcon name="code" size={20} />
          <div style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))' }}>Add custom method</div>
          <div style={{ fontSize: 11, textAlign: 'center', maxWidth: 200 }}>Write a TypeScript fn that returns a value. It will appear here for every schema.</div>
        </div>
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="page-body" data-screen-label="Settings" style={{ paddingTop: 0 }}>
      <div className="page-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="crumb"><span>workspace</span><MIcon name="chevron-right" size={12} /><span>workspace settings</span></div>
        <div className="row"><div><h1>Workspace settings</h1><p className="subtitle">Defaults applied to every set in this workspace.</p></div></div>
      </div>
      <div style={{ height: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 960 }}>
        <div className="card">
          <div className="card-header"><div><h3>General</h3></div></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>Workspace name</label><input className="input" defaultValue="identity-platform" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Organization</label><input className="input" defaultValue="presight" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Default locale</label><select className="select" defaultValue="en_AE"><option>en_AE</option><option>en_US</option><option>ar</option></select></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Default salt prefix</label><input className="input mono" defaultValue="mirage-" /><div className="helper">Salts are auto-generated as <span className="mono">prefix + slug + nonce</span>.</div></div>
          </div>
          <div className="card-footer"><button className="btn btn-primary">Save</button><button className="btn btn-ghost">Discard</button></div>
        </div>
        <div className="card">
          <div className="card-header"><div><h3>Performance</h3></div></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>Worker pool</label><input className="input mono" defaultValue="4" /><div className="helper">Parallel generators per schema.</div></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Batch size</label><input className="input mono" defaultValue="10000" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Max set rows</label><input className="input mono" defaultValue="5000000" /></div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Strict referential integrity</span>
                <span className="switch on" />
              </label>
              <div className="helper">Fail a run rather than emit rows with unresolved refs.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ConnectorsPage, HistoryPage, FakersPage, SettingsPage, SetsPage, SetDetail, OutputTable });


// === appended: design-canvas + AuthScreens ===


// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Artboards are reorderable (grip-drag), deletable, labels/titles are
// inline-editable, and any artboard can be opened in a fullscreen focus
// overlay (←/→/Esc). State persists to a .design-canvas.state.json sidecar
// via the host bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = [
    '.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}',
    '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}',
    '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}',
    '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}',
    '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}',
    // isolation:isolate contains artboard content's z-indexes so a
    // z-indexed child (sticky navbar etc.) can't paint over .dc-header or
    // the .dc-menu popover that drops into the top of the card.
    '.dc-card{isolation:isolate;transition:box-shadow .15s,transform .15s}',
    '.dc-card *{scrollbar-width:none}',
    '.dc-card *::-webkit-scrollbar{display:none}',
    // Per-artboard header: grip + label on the left, delete/expand on the
    // right. Single flex row; when the artboard's on-screen width is too
    // narrow for both the label yields (ellipsis, then hidden entirely below
    // ~4ch via the container query) and the buttons stay on the row.
    '.dc-header{position:absolute;bottom:100%;left:-4px;margin-bottom:calc(4px * var(--dc-inv-zoom,1));z-index:2;',
    '  display:flex;align-items:center;container-type:inline-size}',
    '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px;flex:1 1 auto;min-width:0}',
    '.dc-grip{flex:0 0 auto;cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;transition:background .12s,opacity .12s}',
    '.dc-grip:hover{background:rgba(0,0,0,.08)}',
    '.dc-grip:active{cursor:grabbing}',
    '.dc-labeltext{flex:1 1 auto;min-width:0;cursor:pointer;border-radius:4px;padding:3px 6px;',
    '  display:flex;align-items:center;transition:background .12s;overflow:hidden}',
    // Below ~4ch of label room: hide the label entirely, and drop the grip to
    // hover-only (same reveal rule as .dc-btns) so a narrow header is clean
    // until the card is moused.
    '@container (max-width: 110px){',
    '  .dc-labeltext{display:none}',
    '  .dc-grip{opacity:0}',
    '  [data-dc-slot]:hover .dc-grip{opacity:1}',
    '}',
    '.dc-labeltext:hover{background:rgba(0,0,0,.05)}',
    '.dc-labeltext .dc-editable{overflow:hidden;text-overflow:ellipsis;max-width:100%}',
    '.dc-labeltext .dc-editable:focus{overflow:visible;text-overflow:clip}',
    '.dc-btns{flex:0 0 auto;margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s}',
    '[data-dc-slot]:hover .dc-btns,.dc-btns:has(.dc-menu){opacity:1}',
    '.dc-expand,.dc-kebab{width:22px;height:22px;border-radius:5px;border:none;cursor:pointer;padding:0;',
    '  background:transparent;color:rgba(60,50,40,.7);display:flex;align-items:center;justify-content:center;',
    '  font:inherit;transition:background .12s,color .12s}',
    '.dc-expand:hover,.dc-kebab:hover{background:rgba(0,0,0,.06);color:#2a251f}',
    // Slot hosting an open menu floats above later siblings (which otherwise
    // paint on top — same z-index:auto, later DOM order) so the popup isn't
    // clipped by the next card.
    '[data-dc-slot]:has(.dc-menu){z-index:10}',
    '.dc-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border-radius:8px;',
    '  box-shadow:0 8px 28px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);padding:4px;min-width:160px;z-index:10}',
    '.dc-menu button{display:block;width:100%;padding:7px 10px;border:0;background:transparent;',
    '  border-radius:5px;font-family:inherit;font-size:13px;font-weight:500;line-height:1.2;',
    '  color:#29261b;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap}',
    '.dc-menu button:hover{background:rgba(0,0,0,.05)}',
    '.dc-menu hr{border:0;border-top:1px solid rgba(0,0,0,.08);margin:4px 2px}',
    '.dc-menu .dc-danger{color:#c96442}',
    '.dc-menu .dc-danger:hover{background:rgba(201,100,66,.1)}',
    // Chrome (titles / labels / buttons) counter-scales against the viewport
    // zoom so it stays a constant on-screen size. --dc-inv-zoom is set by
    // DCViewport on every transform update and inherits to all descendants —
    // any overlay inside the world (e.g. a TweaksPanel on an artboard) can use
    // it the same way.
    //
    // The header uses transform:scale (out-of-flow, so layout impact doesn't
    // matter) with its world-space width set to card-width / inv-zoom so that
    // after counter-scaling its on-screen width exactly matches the card's —
    // that's what lets the container query + text-overflow behave against the
    // card's visible edge at every zoom level.
    //
    // The section head uses CSS zoom instead of transform so its layout box
    // grows with the counter-scale, pushing the card row down — otherwise the
    // constant-screen-size title would overflow into the (shrinking) world-
    // space gap and overlap the artboard headers at low zoom.
    '.dc-header{width:calc((100% + 4px) / var(--dc-inv-zoom,1));',
    '  transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom left}',
    '.dc-sectionhead{zoom:var(--dc-inv-zoom,1)}',
  ].join('\n');
  document.head.appendChild(s);
}

const DCCtx = React.createContext(null);

// Recursively unwrap React.Fragment so <>…</> grouping doesn't hide
// DCSection/DCArtboard children from the type-based walks below.
function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, (c) => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));
    else out.push(c);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, hidden
// artboards, focused artboard). Order/titles/labels/hidden persist to a
// .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';

function DesignCanvas({ children, minScale, maxScale, style }) {
  const [state, setState] = React.useState({ sections: {}, focus: null });
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);

  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((saved) => {
        if (off || !saved || !saved.sections) return;
        skipNextWrite.current = true;
        setState((s) => ({ ...s, sections: saved.sections }));
      })
      .catch(() => {})
      .finally(() => { didRead.current = true; if (!off) setReady(true); });
    const t = setTimeout(() => { if (!off) setReady(true); }, 150);
    return () => { off = true; clearTimeout(t); };
  }, []);

  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) { skipNextWrite.current = false; return; }
    const t = setTimeout(() => {
      window.omelette?.writeFile(DC_STATE_FILE, JSON.stringify({ sections: state.sections })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Build registries synchronously from children so FocusOverlay can read
  // them in the same render. Fragments are flattened; wrapping in other
  // elements still opts out of focus/reorder.
  const registry = {};     // slotId -> { sectionId, artboard }
  const sectionMeta = {};  // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  dcFlatten(children).forEach((sec) => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    sectionOrder.push(sid);
    const persisted = state.sections[sid] || {};
    const abs = [];
    dcFlatten(sec.props.children).forEach((ab) => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (aid) abs.push([aid, ab]);
    });
    // hidden is scoped to one source revision — when the agent regenerates
    // (artboard-ID set changes), prior deletes don't apply to new content.
    const srcKey = abs.map(([k]) => k).join('\x1f');
    const hidden = persisted.srcKey === srcKey ? (persisted.hidden || []) : [];
    const srcIds = [];
    abs.forEach(([aid, ab]) => {
      if (hidden.includes(aid)) return;
      registry[`${sid}/${aid}`] = { sectionId: sid, artboard: ab };
      srcIds.push(aid);
    });
    const kept = (persisted.order || []).filter((k) => srcIds.includes(k));
    sectionMeta[sid] = {
      title: persisted.title ?? sec.props.title,
      subtitle: sec.props.subtitle,
      slotIds: [...kept, ...srcIds.filter((k) => !kept.includes(k))],
    };
  });

  const api = React.useMemo(() => ({
    state,
    section: (id) => state.sections[id] || {},
    patchSection: (id, p) => setState((s) => ({
      ...s,
      sections: { ...s.sections, [id]: { ...s.sections[id], ...(typeof p === 'function' ? p(s.sections[id] || {}) : p) } },
    })),
    setFocus: (slotId) => setState((s) => ({ ...s, focus: slotId })),
  }), [state]);

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') api.setFocus(null); };
    const onPd = (e) => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);

  return (
    <DCCtx.Provider value={api}>
      <DCViewport minScale={minScale} maxScale={maxScale} style={style}>{ready && children}</DCViewport>
      {state.focus && registry[state.focus] && (
        <DCFocusOverlay entry={registry[state.focus]} sectionMeta={sectionMeta} sectionOrder={sectionOrder} />
      )}
    </DCCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({ children, minScale = 0.1, maxScale = 8, style = {} }) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({ x: 0, y: 0, scale: 1 });
  // Persist viewport across reloads so the user lands back where they were
  // after an agent edit or browser refresh. The sandbox origin is already
  // per-project; pathname keeps multiple canvas files in one project apart.
  const tfKey = 'dc-viewport:' + location.pathname;
  const saveT = React.useRef(0);

  const lastPostedScale = React.useRef();
  const apply = React.useCallback(() => {
    const { x, y, scale } = tf.current;
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    // Exposed for zoom-invariant chrome (labels, buttons, TweaksPanel).
    el.style.setProperty('--dc-inv-zoom', String(1 / scale));
    // Keep the host toolbar's % readout in sync with the canvas scale. Pan
    // ticks leave scale unchanged — skip the cross-frame post for those.
    if (lastPostedScale.current !== scale) {
      lastPostedScale.current = scale;
      window.parent.postMessage({ type: '__dc_zoom', scale }, '*');
    }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try { localStorage.setItem(tfKey, JSON.stringify(tf.current)); } catch {}
    }, 200);
  }, [tfKey]);

  React.useLayoutEffect(() => {
    const flush = () => {
      clearTimeout(saveT.current);
      try { localStorage.setItem(tfKey, JSON.stringify(tf.current)); } catch {}
    };
    try {
      const s = JSON.parse(localStorage.getItem(tfKey) || 'null');
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.scale)) {
        tf.current = { x: s.x, y: s.y, scale: Math.min(maxScale, Math.max(minScale, s.scale)) };
        apply();
      }
    } catch {}
    // Flush on pagehide and unmount so a reload within the 200ms debounce
    // window doesn't drop the last pan/zoom.
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;

    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left, py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // --dc-inv-zoom consumers (.dc-sectionhead's CSS zoom, each section's
      // marginBottom) reflow on every scale change, vertically shifting the
      // world layout — so a world point mathematically pinned under the cursor
      // drifts as you zoom (content creeps up on zoom-in, down on zoom-out).
      // Anchor the DOM element under the cursor instead: record its screen Y,
      // apply the transform + --dc-inv-zoom, then cancel whatever vertical
      // drift the reflow introduced so it stays put on screen.
      let marker = null, markerY0 = 0;
      if (k !== 1) {
        const hit = document.elementFromPoint(cx, cy);
        marker = hit && hit.closest ? hit.closest('[data-dc-slot],[data-dc-section]') : null;
        if (marker) markerY0 = marker.getBoundingClientRect().top;
      }
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
      if (marker) {
        // A pure zoom around (cx, cy) maps screen Y → cy + (Y - cy) * k. Any
        // departure after the --dc-inv-zoom reflow is the layout drift.
        const drift = marker.getBoundingClientRect().top - (cy + (markerY0 - cy) * k);
        if (Math.abs(drift) > 0.1) { t.y -= drift; apply(); }
      }
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = (e) =>
      e.deltaMode !== 0 ||
      (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);

    const onWheel = (e) => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        // trackpad pinch, or ctrl/cmd + smooth-scroll mouse. Notched
        // wheels fall through to the fixed-step branch below.
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = (e) => { e.preventDefault(); isGesturing = true; gsBase = tf.current.scale; };
    const onGestureChange = (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, (gsBase * e.scale) / tf.current.scale);
    };
    const onGestureEnd = (e) => { e.preventDefault(); isGesturing = false; };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = (e) => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || (e.button === 0 && onBg))) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, lx: e.clientX, ly: e.clientY };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX; drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };

    // Host-driven zoom (toolbar % menu). Zooms around viewport centre so the
    // visible midpoint stays fixed — matching the host's iframe-zoom feel.
    const onHostMsg = (e) => {
      const d = e.data;
      if (d && d.type === '__dc_set_zoom' && typeof d.scale === 'number') {
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.scale / tf.current.scale);
      } else if (d && d.type === '__dc_probe') {
        // Host's [readyGen] reset asks whether a canvas is present; it
        // fires on the iframe's native 'load', which for canvases with
        // images/fonts is after our mount-time announce, so re-announce.
        // Clear the pan-tick guard so apply() re-posts the current scale
        // even if it's unchanged — the host just reset dcScale to 1.
        window.parent.postMessage({ type: '__dc_present' }, '*');
        lastPostedScale.current = undefined;
        apply();
      }
    };
    window.addEventListener('message', onHostMsg);
    // Announce canvas mode so the host toolbar proxies its % control here
    // instead of scaling the iframe element (which would just shrink the
    // viewport window of an infinite canvas). The apply() that follows emits
    // the initial __dc_zoom so the toolbar % is correct before first pinch.
    // lastPostedScale reset mirrors the __dc_probe handler: the layout
    // effect's restore-path apply() may already have posted the restored
    // scale (before __dc_present), so clear the guard to re-post it in order.
    window.parent.postMessage({ type: '__dc_present' }, '*');
    lastPostedScale.current = undefined;
    apply();

    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('gesturestart', onGestureStart, { passive: false });
    vp.addEventListener('gesturechange', onGestureChange, { passive: false });
    vp.addEventListener('gestureend', onGestureEnd, { passive: false });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('message', onHostMsg);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);

  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return (
    <div
      ref={vpRef}
      className="design-canvas"
      style={{
        height: '100vh', width: '100vw',
        background: DC.bg,
        overflow: 'hidden',
        overscrollBehavior: 'none',
        touchAction: 'none',
        position: 'relative',
        fontFamily: DC.font,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        ref={worldRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          transformOrigin: '0 0',
          willChange: 'transform',
          width: 'max-content', minWidth: '100%',
          minHeight: '100%',
          padding: '60px 0 80px',
        }}
      >
        <div style={{ position: 'absolute', inset: -6000, backgroundImage: gridSvg, backgroundSize: '120px 120px', pointerEvents: 'none', zIndex: -1 }} />
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({ id, title, subtitle, children, gap = 48 }) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter((c) => c && c.type === DCArtboard);
  const rest = all.filter((c) => !(c && c.type === DCArtboard));
  const sec = (ctx && sid && ctx.section(sid)) || {};
  // Must match DesignCanvas's srcKey computation exactly (it filters falsy
  // IDs), or onDelete persists a srcKey that DesignCanvas never recognizes.
  const allIds = artboards.map((a) => a.props.id ?? a.props.label).filter(Boolean);
  const srcKey = allIds.join('\x1f');
  const hidden = sec.srcKey === srcKey ? (sec.hidden || []) : [];
  const srcOrder = allIds.filter((k) => !hidden.includes(k));

  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter((k) => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter((k) => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);

  const byId = Object.fromEntries(artboards.map((a) => [a.props.id ?? a.props.label, a]));

  // marginBottom counter-scales so the on-screen gap between sections stays
  // constant — otherwise at low zoom the (world-space) gap collapses while
  // the screen-constant sectionhead below it doesn't, and the title reads as
  // belonging to the section above. paddingBottom below is just enough for
  // the 24px artboard-header (abs-positioned above each card) plus ~8px, so
  // the title sits tight against its own row at every zoom.
  return (
    <div data-dc-section={sid}
      style={{ marginBottom: 'calc(80px * var(--dc-inv-zoom, 1))', position: 'relative' }}>
      <div style={{ padding: '0 60px' }}>
        <div className="dc-sectionhead" style={{ paddingBottom: 36 }}>
          <DCEditable tag="div" value={sec.title ?? title}
            onChange={(v) => ctx && sid && ctx.patchSection(sid, { title: v })}
            style={{ fontSize: 28, fontWeight: 600, color: DC.title, letterSpacing: -0.4, marginBottom: 6, display: 'inline-block' }} />
          {subtitle && <div style={{ fontSize: 16, color: DC.subtitle }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap, padding: '0 60px', alignItems: 'flex-start', width: 'max-content' }}>
        {order.map((k) => (
          <DCArtboardFrame key={k} sectionId={sid} artboard={byId[k]} order={order}
            label={(sec.labels || {})[k] ?? byId[k].props.label}
            onRename={(v) => ctx && ctx.patchSection(sid, (x) => ({ labels: { ...x.labels, [k]: v } }))}
            onReorder={(next) => ctx && ctx.patchSection(sid, { order: next })}
            onDelete={() => ctx && ctx.patchSection(sid, (x) => ({
              hidden: [...(x.srcKey === srcKey ? (x.hidden || []) : []), k],
              srcKey,
            }))}
            onFocus={() => ctx && ctx.setFocus(`${sid}/${k}`)} />
        ))}
      </div>
      {rest}
    </div>
  );
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() { return null; }

// Per-artboard export (kind: 'png' | 'html'). Both paths share the same
// self-contained clone: computed styles baked in, @font-face / <img> /
// inline-style background-image urls inlined as data URIs. PNG wraps the
// clone in foreignObject→canvas at 3× the artboard's natural width×height
// (same pipeline the host uses for page captures); HTML wraps it in a
// minimal standalone document. Both are independent of viewport zoom.
async function dcExport(node, w, h, name, kind) {
  try { await document.fonts.ready; } catch {}
  const toDataURL = (url) => fetch(url).then((r) => r.blob()).then((b) => new Promise((res) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(url); fr.readAsDataURL(b);
  })).catch(() => url);

  // Collect @font-face rules. ss.cssRules throws SecurityError on
  // cross-origin sheets (e.g. fonts.googleapis.com) — in that case fetch
  // the CSS text directly (those endpoints send ACAO:*) and regex-extract
  // the blocks. @import and @media/@supports are walked so nested
  // @font-face rules aren't missed.
  const fontRules = [], pending = [], seen = new Set();
  const scrapeCss = (href) => {
    if (seen.has(href)) return; seen.add(href);
    pending.push(fetch(href).then((r) => r.text()).then((css) => {
      for (const m of css.match(/@font-face\s*{[^}]*}/g) || []) fontRules.push({ css: m, base: href });
      for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g))
        scrapeCss(new URL(m[1], href).href);
    }).catch(() => {}));
  };
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) fontRules.push({ css: r.cssText, base });
      else if (r.type === CSSRule.IMPORT_RULE && r.styleSheet) {
        const ibase = r.styleSheet.href || base;
        try { walk(r.styleSheet.cssRules, ibase); } catch { scrapeCss(ibase); }
      } else if (r.cssRules) walk(r.cssRules, base);
    }
  };
  for (const ss of document.styleSheets) {
    const base = ss.href || location.href;
    try { walk(ss.cssRules, base); } catch { if (ss.href) scrapeCss(ss.href); }
  }
  while (pending.length) await pending.shift();
  const fontCss = (await Promise.all(fontRules.map(async (rule) => {
    let out = rule.css, m; const re = /url\((['"]?)([^'")]+)\1\)/g;
    while ((m = re.exec(rule.css))) {
      if (m[2].indexOf('data:') === 0) continue;
      let abs; try { abs = new URL(m[2], rule.base).href; } catch { continue; }
      out = out.split(m[0]).join('url("' + await toDataURL(abs) + '")');
    }
    return out;
  }))).join('\n');

  const cloneStyled = (src) => {
    if (src.nodeType === 8 || (src.nodeType === 1 && src.tagName === 'SCRIPT')) return document.createTextNode('');
    const dst = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = getComputedStyle(src); let txt = '';
      for (let i = 0; i < cs.length; i++) txt += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
      dst.setAttribute('style', txt + 'animation:none;transition:none;');
      if (src.tagName === 'CANVAS') try { const im = document.createElement('img'); im.src = src.toDataURL(); im.setAttribute('style', txt); return im; } catch {}
    }
    for (let c = src.firstChild; c; c = c.nextSibling) dst.appendChild(cloneStyled(c));
    return dst;
  };
  const clone = cloneStyled(node);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // Drop the card's own shadow/radius so the export is a flush w×h rect;
  // the artboard's own background (if any) is already in the computed style.
  clone.style.boxShadow = 'none'; clone.style.borderRadius = '0';

  const jobs = [];
  clone.querySelectorAll('img').forEach((el) => {
    const s = el.getAttribute('src');
    if (s && s.indexOf('data:') !== 0) jobs.push(toDataURL(el.src).then((d) => el.setAttribute('src', d)));
  });
  [clone, ...clone.querySelectorAll('*')].forEach((el) => {
    const bg = el.style.backgroundImage; if (!bg) return;
    let m; const re = /url\(["']?([^"')]+)["']?\)/g;
    while ((m = re.exec(bg))) {
      const tok = m[0], url = m[1];
      if (url.indexOf('data:') === 0) continue;
      jobs.push(toDataURL(url).then((d) => { el.style.backgroundImage = el.style.backgroundImage.split(tok).join('url("' + d + '")'); }));
    }
  });
  await Promise.all(jobs);

  const xml = new XMLSerializer().serializeToString(clone);
  const save = (blob, ext) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name + '.' + ext; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (kind === 'html') {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title>' +
      (fontCss ? '<style>' + fontCss + '</style>' : '') +
      '</head><body style="margin:0">' + xml + '</body></html>';
    return save(new Blob([html], { type: 'text/html' }), 'html');
  }

  // PNG: the SVG's own width/height must be the output resolution — an
  // <img>-loaded SVG rasterizes at its intrinsic size, so sizing it at 1×
  // and ctx.scale()-ing up would just upscale a 1× bitmap. viewBox maps the
  // w×h foreignObject onto the px·w × px·h SVG canvas so the browser renders
  // the HTML at full resolution.
  const px = 3;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * px + '" height="' + h * px +
    '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject width="' + w + '" height="' + h + '">' +
    (fontCss ? '<style><![CDATA[' + fontCss + ']]></style>' : '') + xml + '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res; img.onerror = () => rej(new Error('svg load failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cv = document.createElement('canvas');
  cv.width = w * px; cv.height = h * px;
  cv.getContext('2d').drawImage(img, 0, 0);
  cv.toBlob((blob) => save(blob, 'png'), 'image/png');
}

function DCArtboardFrame({ sectionId, artboard, label, order, onRename, onReorder, onFocus, onDelete }) {
  const { id: rawId, label: rawLabel, width = 260, height = 480, children, style = {} } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);
  const cardRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // ⋯ menu: close on any outside pointerdown. Two-click delete lives inside
  // the menu — first click arms the row, second commits; closing disarms.
  React.useEffect(() => {
    if (!menuOpen) { setConfirming(false); return; }
    const off = (e) => { if (!menuRef.current || !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [menuOpen]);

  const doExport = (kind) => {
    setMenuOpen(false);
    if (!cardRef.current) return;
    const name = String(label || id || 'artboard').replace(/[^\w\s.-]+/g, '_');
    dcExport(cardRef.current, width, height, name, kind)
      .catch((e) => console.error('[design-canvas] export failed:', e));
  };

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`));
    const homes = peers.map((el) => ({ el, id: el.dataset.dcSlot, x: el.getBoundingClientRect().left }));
    const slotXs = homes.map((h) => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');

    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };

    const move = (ev) => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0, best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) { best = d; nearest = i; }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter((k) => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };

    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) { h.el.style.transition = 'none'; h.el.style.transform = ''; }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const h of homes) h.el.style.transition = '';
        }));
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  return (
    <div ref={ref} data-dc-slot={id} style={{ position: 'relative', flexShrink: 0 }}>
      <div className="dc-header" data-noncommentable="" style={{ color: DC.label }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="dc-labelrow">
          <div className="dc-grip" onPointerDown={onGripDown} title="Drag to reorder">
            <svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor"><circle cx="2" cy="2" r="1.1"/><circle cx="7" cy="2" r="1.1"/><circle cx="2" cy="6.5" r="1.1"/><circle cx="7" cy="6.5" r="1.1"/><circle cx="2" cy="11" r="1.1"/><circle cx="7" cy="11" r="1.1"/></svg>
          </div>
          <div className="dc-labeltext" onClick={onFocus} title="Click to focus">
            <DCEditable value={label} onChange={onRename} onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 15, fontWeight: 500, color: DC.label, lineHeight: 1 }} />
          </div>
        </div>
        <div className="dc-btns">
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="dc-kebab" title="More" onClick={() => setMenuOpen((o) => !o)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="2.5" cy="6" r="1.1"/><circle cx="6" cy="6" r="1.1"/><circle cx="9.5" cy="6" r="1.1"/></svg>
            </button>
            {menuOpen && (
              <div className="dc-menu" onPointerDown={(e) => e.stopPropagation()}>
                <button onClick={() => doExport('png')}>Download PNG</button>
                <button onClick={() => doExport('html')}>Download HTML</button>
                <hr />
                <button className="dc-danger"
                  onClick={() => { if (confirming) { setMenuOpen(false); onDelete(); } else setConfirming(true); }}>
                  {confirming ? 'Click again to delete' : 'Delete'}
                </button>
              </div>
            )}
          </div>
          <button className="dc-expand" onClick={onFocus} title="Focus">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5"/></svg>
          </button>
        </div>
      </div>
      <div ref={cardRef} className="dc-card"
        style={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)', overflow: 'hidden', width, height, background: '#fff', ...style }}>
        {children || <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 13, fontFamily: DC.font }}>{id}</div>}
      </div>
    </div>
  );
}

// Inline rename — commits on blur or Enter.
function DCEditable({ value, onChange, style, tag = 'span', onClick }) {
  const T = tag;
  return (
    <T className="dc-editable" contentEditable suppressContentEditableWarning
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => onChange && onChange(e.currentTarget.textContent)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      style={style}>{value}</T>
  );
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({ entry, sectionMeta, sectionOrder }) {
  const ctx = React.useContext(DCCtx);
  const { sectionId, artboard } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);

  const go = (d) => { const n = peers[(idx + d + peers.length) % peers.length]; if (n) ctx.setFocus(`${sectionId}/${n}`); };
  const goSection = (d) => {
    // Sections whose artboards are all deleted have slotIds:[] — step past
    // them to the next non-empty section so ↑/↓ doesn't dead-end.
    const n = sectionOrder.length;
    for (let i = 1; i < n; i++) {
      const ns = sectionOrder[(((secIdx + d * i) % n) + n) % n];
      const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
      if (first) { ctx.setFocus(`${ns}/${first}`); return; }
    }
  };

  React.useEffect(() => {
    const k = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); goSection(-1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); goSection(1); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const { width = 260, height = 480, children } = artboard.props;
  const [vp, setVp] = React.useState({ w: window.innerWidth, h: window.innerHeight });
  React.useEffect(() => { const r = () => setVp({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));

  const [ddOpen, setDd] = React.useState(false);
  const Arrow = ({ dir, onClick }) => (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ position: 'absolute', top: '50%', [dir]: 28, transform: 'translateY(-50%)',
        border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)',
        width: 44, height: 44, borderRadius: 22, fontSize: 18, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.18)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.08)')}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d={dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'} /></svg>
    </button>
  );

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(
    <div onClick={() => ctx.setFocus(null)}
      onWheel={(e) => e.preventDefault()}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24,20,16,.6)', backdropFilter: 'blur(14px)',
        fontFamily: DC.font, color: '#fff' }}>

      {/* top bar: section dropdown (left) · close (right) */}
      <div onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 72, display: 'flex', alignItems: 'flex-start', padding: '16px 20px 0', gap: 16 }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setDd((o) => !o)}
            style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', padding: '6px 8px',
              borderRadius: 6, textAlign: 'left', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>{meta.title}</span>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ opacity: .7 }}><path d="M2 4l3.5 3.5L9 4"/></svg>
            </span>
            {meta.subtitle && <span style={{ display: 'block', fontSize: 13, opacity: .6, fontWeight: 400, marginTop: 2 }}>{meta.subtitle}</span>}
          </button>
          {ddOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#2a251f', borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,.4)', padding: 4, minWidth: 200, zIndex: 10 }}>
              {sectionOrder.filter((sid) => sectionMeta[sid].slotIds.length).map((sid) => (
                <button key={sid} onClick={() => { setDd(false); const f = sectionMeta[sid].slotIds[0]; if (f) ctx.setFocus(`${sid}/${f}`); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    background: sid === sectionId ? 'rgba(255,255,255,.1)' : 'transparent', color: '#fff',
                    padding: '8px 12px', borderRadius: 5, fontSize: 14, fontWeight: sid === sectionId ? 600 : 400, fontFamily: 'inherit' }}>
                  {sectionMeta[sid].title}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => ctx.setFocus(null)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.12)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          style={{ border: 'none', background: 'transparent', color: 'rgba(255,255,255,.7)', width: 32, height: 32,
            borderRadius: 16, fontSize: 20, cursor: 'pointer', lineHeight: 1, transition: 'background .12s' }}>×</button>
      </div>

      {/* card centered, label + index below — only the card itself stops
          propagation so any backdrop click (including the margins around
          the card) exits focus */}
      <div
        style={{ position: 'absolute', top: 64, bottom: 56, left: 100, right: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: width * scale, height: height * scale, position: 'relative' }}>
          <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#fff', borderRadius: 2, overflow: 'hidden',
            boxShadow: '0 20px 80px rgba(0,0,0,.4)' }}>
            {children || <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>{aid}</div>}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} style={{ fontSize: 14, fontWeight: 500, opacity: .85, textAlign: 'center' }}>
          {(sec.labels || {})[aid] ?? artboard.props.label}
          <span style={{ opacity: .5, marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}>{idx + 1} / {peers.length}</span>
        </div>
      </div>

      <Arrow dir="left" onClick={() => go(-1)} />
      <Arrow dir="right" onClick={() => go(1)} />

      {/* dots */}
      <div onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
        {peers.map((p, i) => (
          <button key={p} onClick={() => ctx.setFocus(`${sectionId}/${p}`)}
            style={{ border: 'none', padding: 0, cursor: 'pointer', width: 6, height: 6, borderRadius: 3,
              background: i === idx ? '#fff' : 'rgba(255,255,255,.3)' }} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({ children, top, left, right, bottom, rotate = -2, width = 180 }) {
  return (
    <div style={{
      position: 'absolute', top, left, right, bottom, width,
      background: DC.postitBg, padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14, lineHeight: 1.4, color: DC.postitText,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5,
    }}>{children}</div>
  );
}

Object.assign(window, { DesignCanvas, DCSection, DCArtboard, DCPostIt });



// Login screen variations for Mirage.
// Reuses mirage.css tokens (--brand-violet, --brand-cyan, --border, etc.)

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function MirageMark({ size = 40 }) {
  // Wordmark-friendly logo: rippling lines suggest mirage/heat shimmer.
  return (
    <svg width={size * 1.2} height={size} viewBox="0 0 28 24" aria-hidden="true">
      <defs>
        <linearGradient id="mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(262 83% 58%)" />
          <stop offset="100%" stopColor="hsl(188 86% 53%)" />
        </linearGradient>
      </defs>
      <g fill="url(#mark-grad)">
        <path d="M0 4 Q4 0 8 4 T16 4 T24 4 L28 4 L28 7 L24 7 Q20 7 16 7 T8 7 T0 7 Z" />
        <path d="M0 11 Q4 7 8 11 T16 11 T24 11 L28 11 L28 14 L24 14 Q20 14 16 14 T8 14 T0 14 Z" opacity="0.7" />
        <path d="M0 18 Q4 14 8 18 T16 18 T24 18 L28 18 L28 21 L24 21 Q20 21 16 21 T8 21 T0 21 Z" opacity="0.4" />
      </g>
    </svg>
  );
}

function SsoBtn({ provider, label, icon }) {
  return (
    <button type="button" className="sso-btn">
      <span className="sso-icon" data-p={provider}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

const GoogleIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);
const MicrosoftIcon = (
  <svg width="14" height="14" viewBox="0 0 23 23" aria-hidden="true">
    <path fill="#F25022" d="M1 1h10v10H1z"/>
    <path fill="#7FBA00" d="M12 1h10v10H12z"/>
    <path fill="#00A4EF" d="M1 12h10v10H1z"/>
    <path fill="#FFB900" d="M12 12h10v10H12z"/>
  </svg>
);
const OktaIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="none" stroke="#007DC1" strokeWidth="4"/>
  </svg>
);
const KeyIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);

// Helpers
function Footer({ tone = 'light' }) {
  return (
    <div className={`mlogin-footer ${tone}`}>
      <div className="left">© 2026 Presight · Mirage</div>
      <div className="right">
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
        <a href="#">Status</a>
        <a href="#">v2.4.1</a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIATION A — Split: product preview left, form right (RECOMMENDED)
// ─────────────────────────────────────────────────────────────────────────────
function LoginSplit() {
  return (
    <div className="mlogin mlogin-split">
      <aside className="mlogin-aside">
        <div className="aside-top">
          <div className="mark-row">
            <MirageMark size={28} />
            <div className="mark-words">
              <div className="wm">Mirage</div>
              <div className="wm-sub">by presight</div>
            </div>
          </div>
        </div>

        <div className="aside-body">
          <h1 className="aside-head">
            Realistic data, <span className="grad">on demand.</span>
          </h1>
          <p className="aside-sub">
            Define schemas, wire dependencies, generate millions of rows that hold together — emails match names, mobiles match carriers, addresses match cities.
          </p>

          <div className="preview-stack">
            <div className="prev-tabs">
              <span className="t active">person.json</span>
              <span className="t">mobile.json</span>
              <span className="t">driving-licence.json</span>
              <span className="t-meta">3 of 7 · 50,000 rows</span>
            </div>
            <div className="prev-body">
              <pre>{`{
  `}<span className="k">"id"</span>{`: `}<span className="s">"p_8c3f"</span>{`,
  `}<span className="k">"firstName"</span>{`: `}<span className="s">"Aisha"</span>{`,
  `}<span className="k">"lastName"</span>{`: `}<span className="s">"Al Mansoori"</span>{`,
  `}<span className="k">"emiratesId"</span>{`: `}<span className="s">"784-1991-7..."</span>{`,
  `}<span className="k">"dateOfBirth"</span>{`: `}<span className="s">"1991-04-22"</span>{`,
  `}<span className="k">"nationality"</span>{`: `}<span className="s">"AE"</span>{`,
  `}<span className="k">"primaryMobile"</span>{`: `}<span className="ref">→ mobile.number</span>{`,
  `}<span className="k">"addressArea"</span>{`: `}<span className="s">"Reem Island"</span>{`
}`}</pre>
            </div>
            <div className="prev-foot">
              <span className="dot ok" />
              <span>generation complete · 4.2s · seed mirage-uae-2026-001</span>
            </div>
          </div>

          <ul className="bullets">
            <li>
              <span className="dot v" />
              <div>
                <b>Deterministic by salt</b>
                <span>Same seed, same rows. Every time.</span>
              </div>
            </li>
            <li>
              <span className="dot c" />
              <div>
                <b>120+ faker functions</b>
                <span>Locale-aware. Plus your own.</span>
              </div>
            </li>
            <li>
              <span className="dot e" />
              <div>
                <b>Push anywhere</b>
                <span>Postgres, MySQL, S3, Kafka, webhooks.</span>
              </div>
            </li>
          </ul>
        </div>

        <Footer tone="dark" />
      </aside>

      <main className="mlogin-form">
        <div className="form-inner">
          <div className="env-chip">
            <span className="dot" />
            <span>presight workspace · dev</span>
            <button className="chip-x" aria-label="Change">▾</button>
          </div>
          <h2>Sign in to Mirage</h2>
          <p className="lede">Use your work email or single sign-on.</p>

          <div className="sso-stack">
            <SsoBtn provider="google" label="Continue with Google" icon={GoogleIcon} />
            <SsoBtn provider="ms" label="Continue with Microsoft" icon={MicrosoftIcon} />
            <SsoBtn provider="okta" label="Continue with Okta SSO" icon={OktaIcon} />
          </div>

          <div className="divider"><span>or with email</span></div>

          <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" defaultValue="pathik.devani@presight.ae" autoComplete="email" />
            </div>
            <div className="field">
              <div className="lbl-row">
                <label htmlFor="pw">Password</label>
                <a href="#" className="link">Forgot?</a>
              </div>
              <input id="pw" className="input" type="password" defaultValue="••••••••••••" />
            </div>
            <label className="check-row">
              <span className="cb checked"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
              <span>Keep me signed in on this device</span>
            </label>
            <button className="btn-primary" type="submit">
              Sign in
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            <button className="btn-passkey" type="button">
              {KeyIcon}
              <span>Use passkey instead</span>
            </button>
          </form>

          <div className="form-foot">
            New to Mirage? <a href="#" className="link strong">Request access →</a>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIATION B — Centered minimal card
// ─────────────────────────────────────────────────────────────────────────────
function LoginCentered() {
  return (
    <div className="mlogin mlogin-centered">
      <header className="ctop">
        <div className="mark-row">
          <MirageMark size={22} />
          <span className="wm">Mirage</span>
          <span className="wm-sep">/</span>
          <span className="wm-sub">presight workspace</span>
        </div>
        <div className="ctop-right">
          <a href="#" className="link muted">Help</a>
          <a href="#" className="link muted">Status</a>
        </div>
      </header>

      <main className="ccenter">
        <div className="ccard">
          <div className="ccard-head">
            <h2>Welcome back</h2>
            <p>Sign in to your Mirage account.</p>
          </div>

          <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
            <div className="field">
              <label htmlFor="email2">Email</label>
              <input id="email2" className="input" type="email" placeholder="you@company.com" />
            </div>
            <div className="field">
              <div className="lbl-row">
                <label htmlFor="pw2">Password</label>
                <a href="#" className="link">Forgot?</a>
              </div>
              <input id="pw2" className="input" type="password" placeholder="••••••••" />
            </div>
            <button className="btn-primary" type="submit">Sign in</button>
          </form>

          <div className="divider"><span>or</span></div>

          <div className="sso-row">
            <SsoBtn provider="google" label="Google" icon={GoogleIcon} />
            <SsoBtn provider="ms" label="Microsoft" icon={MicrosoftIcon} />
            <SsoBtn provider="okta" label="Okta" icon={OktaIcon} />
          </div>

          <button className="btn-passkey-row" type="button">
            {KeyIcon}
            <span>Sign in with passkey</span>
          </button>
        </div>

        <div className="ccard-foot">
          Need an account? <a href="#" className="link strong">Request access</a>
          <span className="sep">·</span>
          <a href="#" className="link muted">Use SAML SSO</a>
        </div>
      </main>

      <Footer tone="light" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIATION C — Workspace-first (enterprise multi-tenant)
// ─────────────────────────────────────────────────────────────────────────────
function LoginWorkspace() {
  const workspaces = [
    { id: 'presight-prod', name: 'presight production', color: 'cyan', initials: 'PP', members: 142, env: 'production', last: 'Signed in 3 hrs ago' },
    { id: 'presight-dev', name: 'presight workspace', color: 'violet', initials: 'PD', members: 18, env: 'dev', last: 'Signed in 12 min ago', current: true },
    { id: 'g42-research', name: 'G42 research labs', color: 'emerald', initials: 'GR', members: 7, env: 'staging', last: 'Signed in yesterday' },
  ];

  return (
    <div className="mlogin mlogin-workspace">
      <div className="wbg" />
      <div className="wpanel">
        <div className="wpanel-head">
          <div className="mark-row">
            <MirageMark size={26} />
            <div className="mark-words">
              <div className="wm">Mirage</div>
              <div className="wm-sub mono">v2.4.1 · build 8c3f12</div>
            </div>
          </div>
          <div className="account-chip">
            <div className="avatar-sm">PD</div>
            <div className="acct-text">
              <div className="acct-name">pathik.devani</div>
              <div className="acct-mail">pathik.devani@presight.ae</div>
            </div>
            <button className="link muted">Switch</button>
          </div>
        </div>

        <div className="wpanel-body">
          <div className="wpanel-l">
            <div className="step-no">Step 2 of 2</div>
            <h2>Choose a workspace</h2>
            <p className="lede">You belong to three workspaces. Pick where you want to work today.</p>

            <div className="ws-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="ws-search-input" placeholder="Search workspaces…" />
              <kbd>⌘K</kbd>
            </div>

            <div className="ws-list">
              {workspaces.map(w => (
                <div key={w.id} className={`ws-row ${w.current ? 'current' : ''}`}>
                  <div className={`ws-avatar ${w.color}`}>{w.initials}</div>
                  <div className="ws-info">
                    <div className="ws-name-row">
                      <span className="nm">{w.name}</span>
                      <span className={`env-pill env-${w.env}`}>
                        <span className="dot" />{w.env}
                      </span>
                    </div>
                    <div className="ws-meta">
                      <span>{w.members} members</span>
                      <span className="dot-sep">·</span>
                      <span>{w.last}</span>
                    </div>
                  </div>
                  <div className="ws-go">
                    {w.current ? <span className="cur-pill">Continue</span> : <span className="arrow">→</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="ws-add">
              <button className="btn-ghost" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Create new workspace
              </button>
              <button className="btn-ghost" type="button">
                Join with invite code
              </button>
            </div>
          </div>

          <div className="wpanel-r">
            <div className="r-card">
              <div className="r-card-head">
                <span className="r-card-lbl">Selected workspace</span>
                <span className="env-pill env-dev"><span className="dot" />dev</span>
              </div>
              <div className="r-card-name">
                <div className="ws-avatar violet lg">PD</div>
                <div>
                  <div className="rn">presight workspace</div>
                  <div className="rid mono">ws_pd_3f4a · created Jan 2026</div>
                </div>
              </div>
              <div className="r-stats">
                <div className="stat">
                  <div className="sl">Schemas</div>
                  <div className="sv mono">3</div>
                </div>
                <div className="stat">
                  <div className="sl">Sets</div>
                  <div className="sv mono">12</div>
                </div>
                <div className="stat">
                  <div className="sl">Total rows</div>
                  <div className="sv mono">14.2M</div>
                </div>
                <div className="stat">
                  <div className="sl">Members</div>
                  <div className="sv mono">18</div>
                </div>
              </div>
              <div className="r-recent">
                <div className="rr-lbl">Recent activity</div>
                <div className="rr-item">
                  <span className="dot ok" />
                  <span className="rr-text"><b>sarah.j</b> ran <span className="mono">reem-island</span></span>
                  <span className="rr-time">12 min</span>
                </div>
                <div className="rr-item">
                  <span className="dot ok" />
                  <span className="rr-text"><b>you</b> edited <span className="mono">person</span> schema</span>
                  <span className="rr-time">2 hr</span>
                </div>
                <div className="rr-item">
                  <span className="dot warn" />
                  <span className="rr-text"><b>ci-pipeline</b> failed on <span className="mono">stress-1m</span></span>
                  <span className="rr-time">5 hr</span>
                </div>
              </div>
              <button className="btn-primary wide" type="button">
                Continue to workspace
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        </div>

        <Footer tone="light" />
      </div>
    </div>
  );
}

Object.assign(window, { LoginSplit, LoginCentered, LoginWorkspace });


// === appended: DeviceLogin ===

// Mobile + Tablet login variations for Mirage.
// Uses tokens from mirage.css + login.css.

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE — 402 × 874 (iPhone Pro size). Status bar + content.
// ─────────────────────────────────────────────────────────────────────────────
function LoginMobile() {
  return (
    <div className="mlogin mlogin-mobile">
      <div className="mphone">
        {/* status bar */}
        <div className="mphone-status">
          <div className="mps-time">9:41</div>
          <div className="mps-notch" />
          <div className="mps-icons">
            <svg width="18" height="11" viewBox="0 0 18 11" fill="currentColor" aria-hidden="true">
              <rect x="0" y="6" width="3" height="5" rx="0.5"/>
              <rect x="5" y="4" width="3" height="7" rx="0.5"/>
              <rect x="10" y="2" width="3" height="9" rx="0.5"/>
              <rect x="15" y="0" width="3" height="11" rx="0.5"/>
            </svg>
            <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor" aria-hidden="true">
              <path d="M8 2 Q4 2 1 4 L0 3 Q4 0 8 0 T16 3 L15 4 Q12 2 8 2Z M8 5 Q5.5 5 3.5 6.2 L2.7 5.2 Q5.5 3.5 8 3.5 T13.3 5.2 L12.5 6.2 Q10.5 5 8 5Z M8 7.5 Q6.7 7.5 5.5 8.2 L5 7.4 Q6.5 6.5 8 6.5 T11 7.4 L10.5 8.2 Q9.3 7.5 8 7.5Z M8 9 a1 1 0 1 1 0 2 a1 1 0 0 1 0 -2Z"/>
            </svg>
            <svg width="26" height="11" viewBox="0 0 26 11" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
              <rect x="0.5" y="0.5" width="22" height="10" rx="2.5"/>
              <rect x="2" y="2" width="17" height="7" rx="1" fill="currentColor"/>
              <path d="M24 4 L24 7" strokeWidth="1.2"/>
            </svg>
          </div>
        </div>

        <div className="mphone-body">
          <div className="mb-hero">
            <div className="mb-mark">
              <MirageMark size={28} />
            </div>
            <h1 className="mb-title">Sign in to <span className="grad">Mirage</span></h1>
            <p className="mb-sub">Generate realistic data that holds together.</p>
          </div>

          <div className="mb-sso">
            <button className="sso-btn"><span className="sso-icon">{GoogleIcon}</span><span>Continue with Google</span></button>
            <button className="sso-btn"><span className="sso-icon">{MicrosoftIcon}</span><span>Continue with Microsoft</span></button>
            <button className="sso-btn"><span className="sso-icon">{OktaIcon}</span><span>Continue with Okta SSO</span></button>
          </div>

          <div className="divider"><span>or with email</span></div>

          <div className="form-grid">
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" defaultValue="pathik.devani@presight.ae" />
            </div>
            <div className="field">
              <div className="lbl-row">
                <label>Password</label>
                <a href="#" className="link">Forgot?</a>
              </div>
              <div className="pw-wrap">
                <input className="input" type="password" defaultValue="••••••••••" />
                <button className="pw-eye" aria-label="Show">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>
            <button className="btn-primary mb-cta" type="button">
              Sign in
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            <button className="btn-passkey mb-passkey" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              <span>Use passkey</span>
            </button>
          </div>

          <div className="mb-env">
            <span className="dot" />
            <span>presight workspace · dev</span>
          </div>
        </div>

        <div className="mphone-home"><span /></div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLET — 820 × 1180 (iPad portrait). Stacked centered card with hero.
// ─────────────────────────────────────────────────────────────────────────────
function LoginTablet() {
  return (
    <div className="mlogin mlogin-tablet">
      <div className="mtab">
        <div className="mtab-bg">
          <div className="mtab-grid" />
        </div>

        <div className="mtab-shell">
          <header className="mtab-header">
            <div className="mark-row">
              <MirageMark size={24} />
              <div className="mark-words">
                <div className="wm">Mirage</div>
                <div className="wm-sub">by presight</div>
              </div>
            </div>
            <div className="mtab-actions">
              <a href="#" className="link muted">Docs</a>
              <a href="#" className="link muted">Status</a>
              <a href="#" className="link muted">Contact sales</a>
            </div>
          </header>

          <main className="mtab-main">
            <div className="mtab-hero">
              <span className="hero-tag">
                <span className="hero-dot" />
                <span>v2.4.1 · 14.2M rows generated this week</span>
              </span>
              <h1 className="mtab-h1">
                Realistic data, <span className="grad">on demand.</span>
              </h1>
              <p className="mtab-lede">
                Define schemas, wire dependencies, generate millions of rows that hold together. Sign in to get back to your workspace.
              </p>
            </div>

            <section className="mtab-card">
              <div className="mtab-card-side">
                <div className="prev-stack">
                  <div className="prev-stack-head">
                    <span className="filename mono">person.json</span>
                    <span className="row-count mono">50,000 rows</span>
                  </div>
                  <pre className="prev-stack-body">{`{
  `}<span className="k">"firstName"</span>{`: `}<span className="s">"Aisha"</span>{`,
  `}<span className="k">"lastName"</span>{`: `}<span className="s">"Al Mansoori"</span>{`,
  `}<span className="k">"emiratesId"</span>{`: `}<span className="s">"784-1991-..."</span>{`,
  `}<span className="k">"primaryMobile"</span>{`: `}<span className="ref">→ mobile</span>{`
}`}</pre>
                </div>
                <ul className="bullets">
                  <li><span className="dot v" /><div><b>Deterministic</b><span>same seed, same rows</span></div></li>
                  <li><span className="dot c" /><div><b>120+ fakers</b><span>locale-aware</span></div></li>
                  <li><span className="dot e" /><div><b>Push anywhere</b><span>Postgres, S3, Kafka</span></div></li>
                </ul>
              </div>

              <div className="mtab-card-form">
                <div className="env-chip">
                  <span className="dot" />
                  <span>presight workspace · dev</span>
                  <button className="chip-x" aria-label="Change">▾</button>
                </div>
                <h2>Sign in</h2>
                <p className="lede">Use your work email or single sign-on.</p>

                <div className="sso-stack tab-sso">
                  <button className="sso-btn"><span className="sso-icon">{GoogleIcon}</span><span>Google</span></button>
                  <button className="sso-btn"><span className="sso-icon">{MicrosoftIcon}</span><span>Microsoft</span></button>
                  <button className="sso-btn"><span className="sso-icon">{OktaIcon}</span><span>Okta SSO</span></button>
                </div>

                <div className="divider"><span>or with email</span></div>

                <div className="form-grid">
                  <div className="field">
                    <label>Work email</label>
                    <input className="input" type="email" defaultValue="pathik.devani@presight.ae" />
                  </div>
                  <div className="field">
                    <div className="lbl-row">
                      <label>Password</label>
                      <a href="#" className="link">Forgot?</a>
                    </div>
                    <input className="input" type="password" defaultValue="••••••••••••" />
                  </div>
                  <label className="check-row">
                    <span className="cb checked"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                    <span>Keep me signed in for 30 days</span>
                  </label>
                  <button className="btn-primary" type="button">
                    Sign in to workspace
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </button>
                </div>

                <div className="form-foot">
                  New to Mirage? <a href="#" className="link strong">Request access →</a>
                </div>
              </div>
            </section>
          </main>

          <footer className="mtab-footer">
            <div>© 2026 Presight · Mirage</div>
            <div className="mtab-footer-links">
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Security</a>
              <a href="#">DPA</a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LoginMobile, LoginTablet });
