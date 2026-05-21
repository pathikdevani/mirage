/**
 * FakerCell — the closed pill that opens the method picker (port of the live
 * FakerCell.tsx). Also renders the "args" affordance in three different
 * placements depending on the `variant` prop.
 */

const { useEffect, useLayoutEffect, useRef, useState: useStateFC, useMemo: useMemoFC } = React;

function FakerCell({
  value, onChange,
  open, onToggle,
  args, onArgsChange,
  argsOpen, onArgsToggle,
  variant, // 'popover' | 'inline' | 'sidepanel'
  invalid,
}) {
  const isFn = value.startsWith('$fn:');
  const isRef = value.startsWith('$ref:');
  const dot = !isFn && !isRef && value ? value.indexOf('.') : -1;
  const ns = dot < 0 ? '' : value.slice(0, dot);
  const method = dot < 0 ? value : value.slice(dot + 1);

  const [filter, setFilter] = useStateFC('');
  const [argsOnly, setArgsOnly] = useStateFC(false);
  const [expandedNs, setExpandedNs] = useStateFC(() => new Set());
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useStateFC(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 360) });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open]);

  const lower = filter.trim().toLowerCase();
  const hasArgsFor = (full) => window.FAKER_CATALOG[full] && window.FAKER_CATALOG[full].params.length > 0;
  const noArgsFor = (full) => window.FAKER_CATALOG[full] && window.FAKER_CATALOG[full].params.length === 0;
  const groups = window.SchemaModule.FAKER_GROUPS
    .map((g) => {
      let methods = g.methods;
      if (argsOnly) methods = methods.filter((m) => hasArgsFor(`${g.ns}.${m}`));
      if (lower) methods = methods.filter((m) => m.toLowerCase().includes(lower) || g.ns.toLowerCase().includes(lower));
      return { ...g, methods };
    })
    .filter((g) => g.methods.length > 0);

  // Per-namespace method counts (for badges); the catalog-args count is for
  // the "args only" toggle's selected state hint.
  const totalArgsMethods = useMemoFC(() => {
    let n = 0;
    for (const g of window.SchemaModule.FAKER_GROUPS) {
      for (const m of g.methods) if (hasArgsFor(`${g.ns}.${m}`)) n++;
    }
    return n;
  }, []);

  // Collapse-by-default UX: when no filter and no "args only", collapse all
  // namespaces and show counts. As soon as the user types or toggles args, we
  // auto-expand any group that contains a match.
  const isFiltering = lower.length > 0 || argsOnly;
  const toggleNs = (ns) => {
    setExpandedNs((prev) => {
      const next = new Set(prev);
      if (next.has(ns)) next.delete(ns); else next.add(ns);
      return next;
    });
  };

  const ns_isOpen = (ns) => isFiltering || expandedNs.has(ns);

  const showsMethod = value && !isFn && !isRef;
  const hasArgs = args && Object.keys(args).length > 0;
  const argCount = hasArgs ? Object.keys(args).length : 0;
  const summary = showsMethod ? window.summarizeArgs(value, args) : null;
  const supportsArgs = showsMethod && window.SchemaModule.methodHasArgs(value);

  const argsBtn = supportsArgs && (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onArgsToggle(); }}
      title={hasArgs ? `args: ${summary}` : 'Configure arguments'}
      className={window.SchemaModule.cn(
        "flex h-7 items-center gap-1 rounded-md border px-1.5 text-[11px] transition-colors",
        argsOpen ? "border-foreground bg-foreground text-background" :
        hasArgs ? "border-brand-violet/40 bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/15"
                : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <window.SchemaModule.Icon.Sliders size={11} />
      {hasArgs ? (
        <span className="font-mono">{argCount}</span>
      ) : (
        <span className="text-[10.5px] uppercase tracking-wider">args</span>
      )}
    </button>
  );

  return (
    <div className="relative flex items-center gap-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        className={window.SchemaModule.cn(
          "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-background px-2 text-left text-[11.5px]",
          invalid ? "border-destructive" : "border-input",
        )}
      >
        {!value && <span className="italic text-muted-foreground">— pick a method —</span>}
        {value && showsMethod && (
          <span className="flex min-w-0 items-center gap-0.5 truncate font-mono">
            <span className="text-muted-foreground">{ns}</span>
            <span className="text-muted-foreground">.</span>
            <span className="text-foreground">{method}</span>
          </span>
        )}
        {/* When variant is 'inline' and there's a summary, show it inside the cell */}
        {variant === 'inline-chip' && hasArgs && (
          <span className="ml-1 truncate rounded bg-brand-violet/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-violet">
            {summary}
          </span>
        )}
        <window.SchemaModule.Icon.Chevron size={11} className="ml-auto flex-none text-muted-foreground" />
      </button>

      {argsBtn}

      {open && pos && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 z-30" onClick={onToggle} />
          <div
            ref={popRef}
            className="fixed z-40 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
          >
            <div className="border-b border-border bg-card px-2 py-2 space-y-1.5">
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <window.SchemaModule.Icon.Search size={12} />
                </span>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter 265 methods…"
                  autoFocus
                  className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-[12px] outline-none focus:border-ring"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setArgsOnly((v) => !v)}
                  className={window.SchemaModule.cn(
                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors",
                    argsOnly
                      ? "border-brand-violet/40 bg-brand-violet/10 text-brand-violet"
                      : "border-input bg-background text-muted-foreground hover:bg-accent",
                  )}
                  title="Show only methods that accept arguments"
                >
                  <window.SchemaModule.Icon.Sliders size={10} />
                  <span>args only</span>
                  <span className={window.SchemaModule.cn(
                    "rounded px-1 font-mono",
                    argsOnly ? "bg-brand-violet/15" : "bg-muted",
                  )}>{totalArgsMethods}</span>
                </button>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setExpandedNs(new Set(window.SchemaModule.FAKER_GROUPS.map((g) => g.ns)))}
                    className="hover:text-foreground hover:underline"
                  >expand all</button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setExpandedNs(new Set())}
                    className="hover:text-foreground hover:underline"
                  >collapse</button>
                </div>
              </div>
            </div>
            <div className="max-h-[440px] overflow-y-auto">
              {groups.length === 0 && (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">No matches</div>
              )}
              {groups.map((g) => {
                const showMethods = ns_isOpen(g.ns);
                const argsCountInNs = g.methods.filter((m) => hasArgsFor(`${g.ns}.${m}`)).length;
                return (
                <div key={g.ns} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleNs(g.ns)}
                    className="sticky top-0 z-10 flex w-full items-center gap-1.5 border-b border-border bg-popover/95 px-2 py-1 text-left backdrop-blur"
                  >
                    <window.SchemaModule.Icon.Chevron size={10} dir={showMethods ? 'down' : 'right'} />
                    <span className="rounded bg-brand-violet/10 px-1.5 py-0 font-mono text-[10px] text-brand-violet">{g.ns}</span>
                    <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      {argsCountInNs > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-brand-violet/10 px-1 text-brand-violet">
                          <window.SchemaModule.Icon.Sliders size={8} />{argsCountInNs}
                        </span>
                      )}
                      <span>{g.methods.length}</span>
                    </span>
                  </button>
                  {showMethods && g.methods.map((m) => {
                    const full = `${g.ns}.${m}`;
                    const has = hasArgsFor(full);
                    const noArgs = noArgsFor(full);
                    return (
                      <button
                        key={full}
                        type="button"
                        onClick={() => { onChange(full); onToggle(); }}
                        className={window.SchemaModule.cn(
                          "flex w-full items-center gap-2 px-3 py-1 pl-7 text-left text-[11.5px] hover:bg-accent",
                          value === full && "bg-accent",
                        )}
                      >
                        <span className="font-mono text-muted-foreground">.</span>
                        <span className="font-mono">{m}</span>
                        {has && (
                          <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-brand-violet/10 px-1 py-0.5 font-mono text-[9.5px] text-brand-violet">
                            <window.SchemaModule.Icon.Sliders size={9} />
                            <span>args</span>
                          </span>
                        )}
                        {noArgs && (
                          <span className="ml-auto rounded px-1 py-0.5 font-mono text-[9.5px] text-muted-foreground/60">
                            no args
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );})}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

window.FakerCell = FakerCell;
