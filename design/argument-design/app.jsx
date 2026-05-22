/**
 * Main app: schema editor with sample "User" properties pre-populated.
 * Wires the FakerCell + args UI through three variants, controlled from Tweaks.
 */

const { useEffect: useEffectApp, useMemo: useMemoApp, useRef: useRefApp, useState: useStateApp } = React;

// ---------- sample data ----------
const INITIAL_ROWS = [
  { id: 'r1', name: 'id', type: 'string', format: 'uuid', required: true, faker: 'string.uuid', args: undefined },
  { id: 'r2', name: 'email', type: 'string', format: 'email', required: true, faker: 'internet.email', args: { firstName: { $ref: 'firstName' }, lastName: { $ref: 'lastName' }, provider: 'mirage.dev' } },
  { id: 'r3', name: 'firstName', type: 'string', required: true, faker: 'person.firstName', args: { sex: 'female' } },
  { id: 'r4', name: 'lastName', type: 'string', required: true, faker: 'person.lastName', args: undefined },
  { id: 'r5', name: 'age', type: 'integer', required: false, faker: 'number.int', args: { min: 18, max: 80 } },
  { id: 'r6', name: 'tier', type: 'string', required: true, faker: 'helpers.arrayElement', args: { array: ['free', 'pro', 'enterprise'] } },
  { id: 'r7', name: 'signupCode', type: 'string', required: false, faker: 'helpers.replaceSymbols', args: { string: 'MIR-###-???' } },
  { id: 'r8', name: 'createdAt', type: 'string', format: 'date-time', required: true, faker: 'date.between', args: { from: '2024-01-01', to: '2025-12-31' } },
  { id: 'r9', name: 'lifetimeSpend', type: 'number', required: false, faker: 'finance.amount', args: { min: 0, max: 50000, dec: 2 } },
  { id: 'r10', name: 'bio', type: 'string', required: false, faker: 'lorem.sentence', args: { wordCount: 12 } },
];

const TYPE_OPTIONS = [
  { value: 'string', label: 'string' },
  { value: 'string|uuid', label: 'string · uuid' },
  { value: 'string|email', label: 'string · email' },
  { value: 'string|date', label: 'string · date' },
  { value: 'string|date-time', label: 'string · date-time' },
  { value: 'number', label: 'number' },
  { value: 'integer', label: 'integer' },
  { value: 'boolean', label: 'boolean' },
  { value: 'object', label: 'object {}' },
  { value: 'array', label: 'array []' },
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "placement": "popover",
  "showSummaryInCell": true,
  "density": "comfortable",
  "refStyle": "toggle",
  "dark": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  useEffectApp(() => {
    document.documentElement.classList.toggle('dark', !!t.dark);
  }, [t.dark]);

  const [rows, setRows] = useStateApp(INITIAL_ROWS);
  const [pickerOpenId, setPickerOpenId] = useStateApp(null);
  const [argsOpenId, setArgsOpenId] = useStateApp(t.placement === 'sidepanel' ? 'r2' : null);

  // When placement flips, close transient popovers and seed selection for the side panel.
  useEffectApp(() => {
    if (t.placement === 'sidepanel') {
      setArgsOpenId((prev) => prev ?? rows.find((r) => r.faker)?.id ?? null);
    } else {
      setArgsOpenId(null);
    }
  }, [t.placement]);

  const updateRow = (id, patch) => {
    setRows((rs) => rs.map((r) => (r.id === id ? (typeof patch === 'function' ? patch(r) : { ...r, ...patch }) : r)));
  };
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, { id: 'r' + (Math.random()*1e9|0), name: 'newField', type: 'string', required: false }]);

  const activeRow = rows.find((r) => r.id === argsOpenId);

  // Sibling fields available for reference (everything except the active row,
  // and only fields with a faker method).
  const fieldsForRefs = useMemoApp(() => rows.map((r) => ({ name: r.name, type: r.type, faker: r.faker })), [rows]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <SchemaHeader />
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <Stat tweaks={t} />
              <div className="mt-4 overflow-hidden rounded-lg border border-border bg-background">
                <div className="grid grid-cols-[20px_20px_minmax(160px,1fr)_150px_minmax(260px,1.4fr)_60px_28px] items-center gap-2 border-b border-border bg-muted px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span /><span />
                  <span>Name</span>
                  <span>Type</span>
                  <span>Faker / $ref</span>
                  <span className="text-center">Req</span>
                  <span />
                </div>
                {rows.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    tweaks={t}
                    pickerOpen={pickerOpenId === row.id}
                    argsOpen={argsOpenId === row.id}
                    togglePicker={() => setPickerOpenId(pickerOpenId === row.id ? null : row.id)}
                    toggleArgs={() => setArgsOpenId(argsOpenId === row.id ? (t.placement === 'sidepanel' ? row.id : null) : row.id)}
                    onChange={(patch) => updateRow(row.id, patch)}
                    onRemove={() => removeRow(row.id)}
                    allFields={fieldsForRefs}
                  />
                ))}
                <button
                  type="button"
                  onClick={addRow}
                  className="flex w-full items-center gap-1.5 border-t border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  style={{ paddingLeft: 32 }}
                >
                  <window.SchemaModule.Icon.Plus size={12} />
                  Add property
                </button>
              </div>
              <Footer rows={rows} />
            </div>

            {t.placement === 'sidepanel' && (
              <window.ArgsSidePanel
                method={activeRow?.faker}
                args={activeRow?.args}
                onChange={(v) => activeRow && updateRow(activeRow.id, { args: v })}
                onClose={() => setArgsOpenId(null)}
                fieldPath={activeRow ? activeRow.name : null}
                fields={fieldsForRefs}
                ownField={activeRow?.name}
                refVariant={t.refStyle}
              />
            )}
          </div>
        </main>
      </div>
      <Tweaks t={t} setTweak={setTweak} />
    </div>
  );
}

// ---------- row ----------
function Row({ row, tweaks, pickerOpen, argsOpen, togglePicker, toggleArgs, onChange, onRemove, allFields }) {
  const argsBtnRef = useRefApp(null);
  const isContainer = row.type === 'object' || row.type === 'array';
  const currentValue = `${row.type}${row.format ? `|${row.format}` : ''}`;

  // For sidepanel mode the row's "argsOpen" indicates selection state, not popover.
  const showInlineEditor = tweaks.placement === 'inline' && argsOpen;
  const cellVariant = tweaks.placement === 'inline' && tweaks.showSummaryInCell ? 'inline-chip' : tweaks.placement;
  const selected = tweaks.placement === 'sidepanel' && argsOpen;

  return (
    <>
      <div
        className={window.SchemaModule.cn(
          "grid grid-cols-[20px_20px_minmax(160px,1fr)_150px_minmax(260px,1.4fr)_60px_28px] items-center gap-2 border-b border-border px-2 py-1.5 transition-colors",
          selected ? "bg-accent/60 ring-1 ring-inset ring-ring/40" : "bg-background",
        )}
        onClick={() => {
          if (tweaks.placement === 'sidepanel') toggleArgs();
        }}
      >
        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
          <window.SchemaModule.Icon.Grip size={12} />
        </span>
        <span className="flex h-5 w-5 items-center justify-center text-transparent">·</span>

        <input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="h-7 w-full rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
        />

        <select
          value={currentValue}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const [type, format] = e.target.value.split('|');
            onChange({ type, format: format || undefined });
          }}
          className="h-7 rounded-md border border-input bg-background px-2 text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          {isContainer ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-md bg-muted px-2 text-[11px] text-muted-foreground">
              {row.type === 'object' ? '0 fields' : 'items: string'}
            </span>
          ) : (
            <div ref={argsBtnRef}>
              <window.FakerCell
                value={row.faker ?? ''}
                onChange={(v) => onChange({ faker: v, args: undefined })}
                open={pickerOpen}
                onToggle={togglePicker}
                args={row.args}
                onArgsChange={(v) => onChange({ args: v })}
                argsOpen={argsOpen}
                onArgsToggle={toggleArgs}
                variant={cellVariant}
                invalid={false}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={row.required}
          onClick={(e) => { e.stopPropagation(); onChange({ required: !row.required }); }}
          className={window.SchemaModule.cn(
            "mx-auto flex h-4 w-7 items-center rounded-full p-0.5 transition-colors",
            row.required ? "bg-foreground" : "bg-muted",
          )}
        >
          <span className={window.SchemaModule.cn("h-3 w-3 rounded-full bg-background transition-transform", row.required ? "translate-x-3" : "translate-x-0")} />
        </button>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <window.SchemaModule.Icon.Trash size={12} />
        </button>
      </div>

      {tweaks.placement === 'popover' && row.faker && argsOpen && (
        <window.ArgsPopover
          anchorRef={argsBtnRef}
          open={argsOpen}
          method={row.faker}
          args={row.args}
          onChange={(v) => onChange({ args: v })}
          onClose={() => toggleArgs()}
          fields={allFields}
          ownField={row.name}
          refVariant={tweaks.refStyle}
        />
      )}

      {showInlineEditor && row.faker && (
        <window.ArgsInline
          method={row.faker}
          args={row.args}
          onChange={(v) => onChange({ args: v })}
          onClose={() => toggleArgs()}
          fields={allFields}
          ownField={row.name}
          refVariant={tweaks.refStyle}
        />
      )}
    </>
  );
}

// ---------- chrome ----------
function TopBar() {
  return (
    <div className="flex h-11 items-center gap-3 border-b border-border bg-card px-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded-md bg-gradient-to-br from-brand-violet to-brand-cyan" />
        <span className="font-semibold text-[13px]">mirage</span>
      </div>
      <span className="text-muted-foreground">/</span>
      <span className="text-[12px] text-muted-foreground">acme-prod</span>
      <span className="text-muted-foreground">/</span>
      <span className="text-[12px] font-medium">Schemas</span>
      <div className="ml-auto flex items-center gap-2">
        <button className="rounded-md border border-input bg-background px-2.5 py-1 text-[11.5px] hover:bg-accent">Preview</button>
        <button className="rounded-md bg-foreground px-2.5 py-1 text-[11.5px] text-background hover:opacity-90">Save</button>
      </div>
    </div>
  );
}

function Sidebar() {
  const items = [
    { label: 'Schemas', icon: 'Code', active: true },
    { label: 'Sets', icon: 'Dice' },
    { label: 'Functions', icon: 'Sliders' },
    { label: 'Generate', icon: 'Plus' },
  ];
  return (
    <aside className="flex w-48 flex-none flex-col border-r border-border bg-card/40">
      <div className="px-3 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace</div>
      {items.map((it) => {
        const I = window.SchemaModule.Icon[it.icon];
        return (
          <button
            key={it.label}
            className={window.SchemaModule.cn(
              "flex items-center gap-2 px-3 py-1.5 text-[12px] text-left",
              it.active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <I size={13} />
            {it.label}
          </button>
        );
      })}
      <div className="mt-4 px-3 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Schemas</div>
      {['user', 'order', 'product', 'invoice'].map((k) => (
        <button key={k} className={window.SchemaModule.cn(
          "flex items-center gap-2 px-3 py-1 text-left text-[12px] font-mono",
          k === 'user' ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}>
          <span className={window.SchemaModule.cn(
            "h-2 w-2 rounded-sm",
            k === 'user' ? "bg-brand-violet" : k === 'order' ? "bg-brand-amber" : k === 'product' ? "bg-brand-cyan" : "bg-brand-emerald",
          )} />
          {k}
        </button>
      ))}
    </aside>
  );
}

function SchemaHeader() {
  return (
    <div className="flex items-end justify-between border-b border-border bg-background px-6 pt-5 pb-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          <span className="h-2 w-2 rounded-sm bg-brand-violet" />
          schema · user
        </div>
        <h1 className="mt-1 text-[20px] font-semibold tracking-tight">User</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">A single account in the platform. 10 properties.</p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="rounded-md bg-brand-emerald/10 px-2 py-0.5 text-[10.5px] font-medium text-brand-emerald">valid</span>
        <span className="rounded-md border border-input bg-background px-2 py-0.5 text-[10.5px] font-mono text-muted-foreground">v 14</span>
      </div>
    </div>
  );
}

function Stat({ tweaks }) {
  const t = tweaks;
  const variants = {
    popover:   { title: 'Popover',     hint: 'Click the args chip on any row → a panel anchors next to it. Tight to the action, no layout shift.' },
    inline:    { title: 'Inline strip', hint: 'Args expand below the row, keeping the field and its config visibly grouped.' },
    sidepanel: { title: 'Side panel',  hint: 'A right-hand drawer mirrors the selected row — Notion / Linear style.' },
  };
  const refHints = {
    toggle:  'String args show a small ⧉ toggle — flip any value into a reference to another field.',
    tabs:    'Each string arg has a “value / reference” switcher above it.',
    mention: 'Type into a string arg; press @ to insert a field token inline. Mix text and references freely.',
  };
  const v = variants[t.placement];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand-violet/30 bg-brand-violet/5 px-3 py-2.5">
      <div className="flex items-start gap-3 text-[12px]">
        <window.SchemaModule.Icon.Sliders size={14} />
        <div className="min-w-0 flex-1">
          <div>
            <span className="font-semibold">Argument UI:</span>{' '}
            <span className="font-mono">{v.title.toLowerCase()}</span>
            <span className="text-muted-foreground"> — try the three placements from the Tweaks panel.</span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">{v.hint}</div>
        </div>
      </div>
      <div className="flex items-start gap-3 border-t border-brand-violet/15 pt-2 text-[12px]">
        <window.SchemaModule.Icon.Link size={14} />
        <div className="min-w-0 flex-1">
          <div>
            <span className="font-semibold">Field references:</span>{' '}
            <span className="font-mono">{t.refStyle}</span>
            <span className="text-muted-foreground"> — open the <span className="font-mono text-foreground/80">email</span> row to see <span className="font-mono text-brand-violet">→firstName</span> + <span className="font-mono text-brand-violet">→lastName</span> in action.</span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">{refHints[t.refStyle]}</div>
        </div>
      </div>
    </div>
  );
}

function Footer({ rows }) {
  const totalArgs = rows.reduce((acc, r) => acc + (r.args ? Object.keys(r.args).length : 0), 0);
  return (
    <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
      <span>{rows.length} properties · {totalArgs} arg{totalArgs === 1 ? '' : 's'} configured</span>
      <span className="font-mono">Draft saved · just now</span>
    </div>
  );
}

// ---------- tweaks ----------
function Tweaks({ t, setTweak }) {
  const { TweaksPanel, TweakSection, TweakRadio, TweakToggle } = window;
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Args UI">
        <TweakRadio
          label="Placement"
          value={t.placement}
          options={[
            { value: 'popover', label: 'Popover' },
            { value: 'inline', label: 'Inline' },
            { value: 'sidepanel', label: 'Side' },
          ]}
          onChange={(v) => setTweak('placement', v)}
        />
        <TweakRadio
          label="Reference input"
          value={t.refStyle}
          options={[
            { value: 'toggle', label: 'Toggle' },
            { value: 'tabs', label: 'Tabs' },
            { value: 'mention', label: '@-mention' },
          ]}
          onChange={(v) => setTweak('refStyle', v)}
        />
        <TweakToggle
          label="Show args in cell"
          value={t.showSummaryInCell}
          onChange={(v) => setTweak('showSummaryInCell', v)}
        />
      </TweakSection>
      <TweakSection label="Display">
        <TweakRadio
          label="Density"
          value={t.density}
          options={[
            { value: 'comfortable', label: 'Comfy' },
            { value: 'compact', label: 'Compact' },
          ]}
          onChange={(v) => setTweak('density', v)}
        />
        <TweakToggle
          label="Dark mode"
          value={t.dark}
          onChange={(v) => setTweak('dark', v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

window.App = App;
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
