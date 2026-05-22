/**
 * Three placements for the args UI:
 *
 *   <ArgsPopover />   — floating panel anchored to a trigger
 *   <ArgsInline />    — strip that lives in the row, below the cell
 *   <ArgsSidePanel /> — right-hand drawer (Notion-style "selected node" pane)
 */

const { useEffect: useEffectAP, useLayoutEffect: useLayoutEffectAP, useRef: useRefAP, useState: useStateAP } = React;

function MethodHeader({ method, args, onChange }) {
  const catalog = window.FAKER_CATALOG[method];
  const shape = catalog?.shape;
  const dot = method.indexOf('.');
  const ns = dot < 0 ? '' : method.slice(0, dot);
  const m = dot < 0 ? method : method.slice(dot + 1);
  const preview = window.SchemaModule.previewValue(method, args);
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border bg-card/60 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="rounded bg-brand-violet/10 px-1.5 py-0.5 font-mono text-[10.5px] text-brand-violet">{ns}</span>
          <span className="font-mono text-foreground">.{m}</span>
          {shape && (
            <span className="ml-1 rounded-md border border-input bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {shape === 'options' ? '{ options }' : '(positional)'}
            </span>
          )}
        </div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          → <span className="text-foreground">{String(preview)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(undefined)}
        disabled={!args}
        className="rounded-md border border-input bg-background px-2 py-1 text-[10.5px] text-muted-foreground hover:enabled:bg-accent hover:enabled:text-foreground disabled:opacity-50"
        title="Reset to defaults"
      >
        reset
      </button>
    </div>
  );
}

// ---------- popover variant ----------
function ArgsPopover({ anchorRef, open, method, args, onChange, onClose, fields, ownField, refVariant }) {
  const [pos, setPos] = useStateAP(null);
  const popRef = useRefAP(null);

  useLayoutEffectAP(() => {
    if (!open) { setPos(null); return; }
    const update = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 420;
      const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.right - w));
      setPos({ left, top: r.bottom + 6, width: w });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open]);

  useEffectAP(() => {
    if (!open) return;
    const onScroll = (e) => {
      if (popRef.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open]);

  if (!open || !pos) return null;
  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        ref={popRef}
        className="fixed z-40 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
      >
        <MethodHeader method={method} args={args} onChange={onChange} />
        <div className="max-h-[440px] overflow-y-auto px-3 py-3">
          <window.ArgsEditor method={method} args={args} onChange={onChange} fields={fields} ownField={ownField} refVariant={refVariant} />
        </div>
      </div>
    </>,
    document.body,
  );
}

// ---------- inline variant ----------
function ArgsInline({ method, args, onChange, onClose, fields, ownField, refVariant }) {
  return (
    <div className="border-t border-dashed border-border bg-muted/30">
      <div className="grid grid-cols-[20px_20px_minmax(140px,1fr)] items-stretch">
        <span />
        <span />
        <div className="col-span-1 col-start-3 col-end-[-1] -mr-2 border-l-2 border-brand-violet/40 bg-background">
          <div className="flex items-center justify-between px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <window.SchemaModule.Icon.Sliders size={11} />
              Arguments
              <span className="ml-1 font-mono text-[10px] text-foreground normal-case tracking-normal">
                {method}
              </span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <window.SchemaModule.Icon.X size={11} />
            </button>
          </div>
          <div className="px-3 pb-3">
            <window.ArgsEditor method={method} args={args} onChange={onChange} density="compact" fields={fields} ownField={ownField} refVariant={refVariant} />
            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[10.5px] text-muted-foreground">
              <span className="text-foreground/60">→</span>
              <span className="truncate text-foreground">{String(window.SchemaModule.previewValue(method, args))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- side-panel variant ----------
function ArgsSidePanel({ method, args, onChange, onClose, fieldPath, fields, ownField, refVariant }) {
  return (
    <aside className="flex h-full w-[380px] flex-none flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex flex-col">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Field
          </span>
          <span className="font-mono text-[12px] text-foreground">{fieldPath ?? '—'}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <window.SchemaModule.Icon.X size={13} />
        </button>
      </div>
      {!method ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
          Select a field, then choose a faker method to configure arguments.
        </div>
      ) : (
        <>
          <MethodHeader method={method} args={args} onChange={onChange} />
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <window.ArgsEditor method={method} args={args} onChange={onChange} fields={fields} ownField={ownField} refVariant={refVariant} />
          </div>
        </>
      )}
    </aside>
  );
}

window.ArgsPopover = ArgsPopover;
window.ArgsInline = ArgsInline;
window.ArgsSidePanel = ArgsSidePanel;
window.MethodHeader = MethodHeader;
