/**
 * Args editor primitives. Renders the right input for a curated param kind,
 * plus the raw-JSON fallback for methods not in the catalog.
 *
 * Used by all three variants (popover / inline / side panel) so the styling
 * stays consistent.
 */

const { useMemo, useState } = React;

/** Curated catalog drop-down for a single param. */
function ArgField({ param, value, onChange }) {
  const id = `arg-${param.name}`;
  const v = value ?? '';
  const labelEl = (
    <label htmlFor={id} className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
      <span>{param.label}</span>
      {param.hint && (
        <span className="font-normal normal-case tracking-normal text-[10.5px] text-muted-foreground/70">{param.hint}</span>
      )}
    </label>
  );

  if (param.kind === 'boolean') {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <button
          type="button"
          role="switch"
          aria-checked={!!value}
          onClick={() => onChange(!value)}
          className={"flex h-7 w-12 items-center rounded-full p-0.5 transition-colors " + (value ? "bg-foreground" : "bg-muted")}
        >
          <span className={"h-6 w-6 rounded-full bg-background shadow-sm transition-transform " + (value ? "translate-x-5" : "translate-x-0")} />
        </button>
      </div>
    );
  }

  if (param.kind === 'enum') {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <div className="flex flex-wrap gap-1">
          {param.options.map((opt) => (
            <button
              key={opt || '__empty'}
              type="button"
              onClick={() => onChange(opt === '' ? undefined : opt)}
              className={
                "h-7 rounded-md border px-2.5 text-[12px] transition-colors " +
                ((value ?? '') === opt
                  ? "border-foreground bg-foreground text-background"
                  : "border-input bg-background text-foreground hover:bg-accent")
              }
            >
              {opt === '' ? <span className="italic text-muted-foreground">any</span> : opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (param.kind === 'date') {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <input
          id={id}
          type="date"
          value={v}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="h-8 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
        />
      </div>
    );
  }

  if (param.kind === 'integer' || param.kind === 'number') {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <input
          id={id}
          type="number"
          value={v}
          step={param.kind === 'integer' ? 1 : (param.step ?? 'any')}
          min={param.min}
          max={param.max}
          placeholder={param.default !== undefined ? String(param.default) : ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(undefined);
            const n = param.kind === 'integer' ? parseInt(raw, 10) : parseFloat(raw);
            onChange(Number.isNaN(n) ? undefined : n);
          }}
          className="h-8 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
        />
      </div>
    );
  }

  if (param.kind === 'regex') {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[2px] focus-within:ring-ring/10">
          <span className="flex items-center border-r border-input bg-muted px-2 font-mono text-[12px] text-muted-foreground">/</span>
          <input
            id={id}
            type="text"
            value={v}
            placeholder={param.default !== undefined ? String(param.default) : ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="h-8 flex-1 bg-transparent px-2 font-mono text-[12px] outline-none"
          />
          <span className="flex items-center border-l border-input bg-muted px-2 font-mono text-[12px] text-muted-foreground">/</span>
        </div>
      </div>
    );
  }

  if (param.kind === 'array') {
    const text = Array.isArray(value) ? value.join('\n') : '';
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <textarea
          id={id}
          rows={Math.max(3, Array.isArray(value) ? value.length : 2)}
          value={text}
          placeholder={"one\nper\nline"}
          onChange={(e) => {
            const lines = e.target.value.split('\n').map((s) => s.replace(/\r$/, ''));
            const trimmed = lines.length && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
            onChange(trimmed.length === 0 ? undefined : trimmed);
          }}
          className="rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[12px] leading-snug outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
        />
        {Array.isArray(value) && value.length > 0 && (
          <div className="text-[10.5px] text-muted-foreground">{value.length} item{value.length === 1 ? '' : 's'}</div>
        )}
      </div>
    );
  }

  // string fallback
  return (
    <div className="flex flex-col gap-1">
      {labelEl}
      <input
        id={id}
        type="text"
        value={v}
        placeholder={param.default !== undefined ? String(param.default) : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-8 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
      />
    </div>
  );
}

/**
 * Renders the full param form OR a JSON editor if the method isn't curated
 * (or the user explicitly flipped to advanced mode).
 *
 * Args are stored as a JS object keyed by param.name when shape === 'options'
 * (the {min, max, ...} object faker takes) and by param.name as a sparse array
 * when shape === 'positional'.
 */
function ArgsEditor({ method, args, onChange, density = "comfortable" }) {
  const catalog = window.FAKER_CATALOG[method];
  const [advanced, setAdvanced] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(args ?? (catalog?.shape === 'positional' ? [] : {}), null, 2));
  const [jsonError, setJsonError] = useState(null);

  // Reset when method changes
  React.useEffect(() => {
    setAdvanced(false);
    setJsonDraft(JSON.stringify(args ?? (catalog?.shape === 'positional' ? [] : {}), null, 2));
    setJsonError(null);
  }, [method]);

  if (!catalog) {
    return (
      <RawJsonEditor
        value={args}
        onChange={onChange}
        notice={"No curated signature — edit args as raw JSON. Will be spread as positional faker arguments."}
      />
    );
  }

  if (advanced) {
    return (
      <div className="flex flex-col gap-2">
        <RawJsonEditor value={args} onChange={onChange} notice={null} />
        <button
          type="button"
          onClick={() => setAdvanced(false)}
          className="self-start text-[11px] text-muted-foreground underline hover:text-foreground"
        >
          ← back to form
        </button>
      </div>
    );
  }

  const setParam = (name, val) => {
    if (catalog.shape === 'options') {
      const next = { ...(args ?? {}) };
      if (val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) delete next[name];
      else next[name] = val;
      onChange(Object.keys(next).length === 0 ? undefined : next);
    } else {
      // positional — store as object keyed by name for editor ergonomics; serialize
      // to array on emit
      const next = { ...(args ?? {}) };
      if (val === undefined) delete next[name];
      else next[name] = val;
      onChange(Object.keys(next).length === 0 ? undefined : next);
    }
  };

  const getParam = (name) => (args ?? {})[name];

  const gapClass = density === 'compact' ? 'gap-2.5' : 'gap-3';

  return (
    <div className={"flex flex-col " + gapClass}>
      {catalog.params.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-[12px] text-muted-foreground">
          This method takes no arguments.
        </div>
      ) : (
        <div className={catalog.params.length > 2 ? "grid grid-cols-2 gap-3" : "flex flex-col " + gapClass}>
          {catalog.params.map((p) => (
            <ArgField key={p.name} param={p} value={getParam(p.name)} onChange={(v) => setParam(p.name, v)} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-2 text-[10.5px] text-muted-foreground">
        <span>
          shape:{' '}
          <span className="font-mono">
            {catalog.shape === 'options' ? '{ options }' : '(...positional)'}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setAdvanced(true)}
          className="font-mono text-[10.5px] underline hover:text-foreground"
        >
          edit JSON →
        </button>
      </div>
    </div>
  );
}

function RawJsonEditor({ value, onChange, notice }) {
  const [draft, setDraft] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [err, setErr] = useState(null);

  React.useEffect(() => {
    setDraft(JSON.stringify(value ?? {}, null, 2));
  }, [JSON.stringify(value)]);

  return (
    <div className="flex flex-col gap-1.5">
      {notice && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-foreground/80">
          {notice}
        </div>
      )}
      <textarea
        rows={6}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          try {
            const parsed = e.target.value.trim() === '' ? undefined : JSON.parse(e.target.value);
            setErr(null);
            onChange(parsed);
          } catch (ex) {
            setErr(ex.message);
          }
        }}
        spellCheck={false}
        className={"rounded-md border bg-background px-2 py-1.5 font-mono text-[11.5px] leading-snug outline-none focus:ring-[2px] focus:ring-ring/10 " + (err ? "border-destructive focus:border-destructive" : "border-input focus:border-ring")}
      />
      {err && <div className="text-[11px] text-destructive">{err}</div>}
    </div>
  );
}

/**
 * Build a summary chip showing the active args, e.g. "{min: 18, max: 80}" or
 * "(female)". Returns null when there are no args.
 */
function summarizeArgs(method, args) {
  if (!args) return null;
  const catalog = window.FAKER_CATALOG[method];
  const keys = Object.keys(args);
  if (keys.length === 0) return null;
  if (!catalog || catalog.shape === 'options') {
    return keys.map((k) => `${k}: ${formatVal(args[k])}`).join(', ');
  }
  // positional
  return catalog.params.map((p) => (p.name in args ? formatVal(args[p.name]) : null)).filter(Boolean).join(', ');
}

function formatVal(v) {
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'string') return v.length > 14 ? `"${v.slice(0, 12)}…"` : `"${v}"`;
  if (typeof v === 'object' && v !== null) return '{…}';
  return String(v);
}

Object.assign(window, { ArgsEditor, ArgField, RawJsonEditor, summarizeArgs });
