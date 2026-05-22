/**
 * RefInput — a string arg input that can hold either a literal value or a
 * reference to another field in the same schema.
 *
 * Value encoding:
 *   - plain string                          → literal
 *   - { $ref: 'firstName' }                 → pure reference to a sibling field
 *   - string with "{{fieldName}}" tokens    → mixed template (mention variant)
 *
 * Three visual styles (chosen by the host via the `variant` prop):
 *   - 'toggle'  — a tiny pill toggle inside the input flips literal ↔ ref
 *   - 'tabs'    — segmented control above the input picks literal | ref
 *   - 'mention' — single contentEditable, type `@` to insert a field token,
 *                 supports mixed text + chips.
 */

const { useEffect: useEffectRI, useLayoutEffect: useLayoutEffectRI, useMemo: useMemoRI, useRef: useRefRI, useState: useStateRI } = React;

// ---------- helpers ----------
function isRef(v) { return v && typeof v === 'object' && typeof v.$ref === 'string'; }

function tokenize(str) {
  // splits "Hi {{firstName}} how" → [{t:'text',v:'Hi '},{t:'ref',v:'firstName'},{t:'text',v:' how'}]
  if (typeof str !== 'string' || !str) return [];
  const out = [];
  const re = /\{\{\s*([a-zA-Z_$][\w$.]*)\s*\}\}/g;
  let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: str.slice(last, m.index) });
    out.push({ t: 'ref', v: m[1] });
    last = re.lastIndex;
  }
  if (last < str.length) out.push({ t: 'text', v: str.slice(last) });
  return out;
}

function detokenize(parts) {
  return parts.map((p) => (p.t === 'ref' ? `{{${p.v}}}` : p.v)).join('');
}

const FAKER_DOT_COLOR = {
  string: 'bg-brand-violet',
  number: 'bg-brand-amber',
  integer: 'bg-brand-amber',
  boolean: 'bg-brand-emerald',
  object: 'bg-brand-cyan',
  array: 'bg-brand-cyan',
};

// ---------- field picker popover ----------
function FieldPicker({ anchorRef, fields, currentField, onPick, onClose, query: initialQuery = '' }) {
  const [pos, setPos] = useStateRI(null);
  const [q, setQ] = useStateRI(initialQuery);
  const [hi, setHi] = useStateRI(0);
  const inputRef = useRefRI(null);
  const popRef = useRefRI(null);

  useLayoutEffectRI(() => {
    const update = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 240;
      const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left));
      setPos({ left, top: r.bottom + 4, width: w });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffectRI(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemoRI(() => {
    const needle = q.toLowerCase();
    return fields.filter((f) => f.name !== currentField && f.name.toLowerCase().includes(needle));
  }, [q, fields, currentField]);

  useEffectRI(() => { setHi(0); }, [q]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(filtered.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[hi];
      if (pick) onPick(pick);
    }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  if (!pos) return null;
  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} />
      <div
        ref={popRef}
        className="fixed z-[61] overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
          <window.SchemaModule.Icon.Link size={11} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Reference a field…"
            className="h-5 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-input bg-muted px-1 font-mono text-[9.5px] text-muted-foreground sm:inline">esc</kbd>
        </div>
        <div className="max-h-[200px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-2.5 py-3 text-center text-[11.5px] text-muted-foreground">
              No matching fields
            </div>
          ) : filtered.map((f, i) => (
            <button
              key={f.name}
              type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => onPick(f)}
              className={
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] " +
                (i === hi ? "bg-accent text-foreground" : "text-foreground/90 hover:bg-accent/50")
              }
            >
              <span className={"h-1.5 w-1.5 rounded-sm " + (FAKER_DOT_COLOR[f.type] || 'bg-muted-foreground')} />
              <span className="font-mono">{f.name}</span>
              <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground">
                {f.faker ? f.faker.split('.').slice(-1)[0] : f.type}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-border bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
          <span className="font-mono">↑↓</span> navigate · <span className="font-mono">↵</span> insert
        </div>
      </div>
    </>,
    document.body,
  );
}

// ---------- ref chip ----------
function RefChip({ field, fieldType, onRemove, dense = false }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded border border-brand-violet/30 bg-brand-violet/10 align-middle font-mono text-brand-violet " +
        (dense ? "px-1 py-0 text-[10.5px]" : "px-1.5 py-0.5 text-[11px]")
      }
      contentEditable={false}
      data-ref={field}
    >
      <span className={"h-1.5 w-1.5 rounded-sm " + (FAKER_DOT_COLOR[fieldType] || 'bg-brand-violet/50')} />
      <span>{field}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="-mr-0.5 flex h-3 w-3 items-center justify-center rounded-sm text-brand-violet/70 hover:bg-brand-violet/20 hover:text-brand-violet"
          tabIndex={-1}
        >
          <window.SchemaModule.Icon.X size={9} />
        </button>
      )}
    </span>
  );
}

// ---------- variant: toggle (compact inline) ----------
function RefInputToggle({ value, onChange, placeholder, fields, ownField }) {
  const wrapRef = useRefRI(null);
  const [picking, setPicking] = useStateRI(false);
  const refMode = isRef(value);
  const refField = refMode ? value.$ref : null;
  const refFieldType = refMode ? fields.find((f) => f.name === refField)?.type : null;

  return (
    <>
      <div
        ref={wrapRef}
        className={
          "flex h-8 items-stretch overflow-hidden rounded-md border bg-background focus-within:border-ring focus-within:ring-[2px] focus-within:ring-ring/10 " +
          (refMode ? "border-brand-violet/30 bg-brand-violet/[0.04]" : "border-input")
        }
      >
        {refMode ? (
          <div className="flex flex-1 items-center gap-1 px-1.5">
            <span className="text-[10.5px] font-mono text-muted-foreground">→</span>
            <RefChip field={refField} fieldType={refFieldType} onRemove={() => onChange(undefined)} />
          </div>
        ) : (
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="flex-1 bg-transparent px-2 font-mono text-[12px] outline-none"
          />
        )}
        <button
          type="button"
          onClick={() => setPicking(true)}
          title={refMode ? 'Change field reference' : 'Reference another field'}
          className={
            "flex w-8 items-center justify-center border-l text-[11px] transition-colors " +
            (refMode
              ? "border-brand-violet/30 bg-brand-violet/10 text-brand-violet"
              : "border-input bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground")
          }
        >
          <window.SchemaModule.Icon.Link size={12} />
        </button>
      </div>
      {picking && (
        <FieldPicker
          anchorRef={wrapRef}
          fields={fields}
          currentField={ownField}
          onPick={(f) => { onChange({ $ref: f.name }); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

// ---------- variant: tabs (literal | ref segmented) ----------
function RefInputTabs({ value, onChange, placeholder, fields, ownField }) {
  const refMode = isRef(value);
  const refField = refMode ? value.$ref : null;
  const refFieldType = refMode ? fields.find((f) => f.name === refField)?.type : null;
  const [mode, setMode] = useStateRI(refMode ? 'ref' : 'literal');
  const anchorRef = useRefRI(null);
  const [picking, setPicking] = useStateRI(false);

  useEffectRI(() => { setMode(refMode ? 'ref' : 'literal'); }, [refMode]);

  const switchToRef = () => {
    setMode('ref');
    if (!refMode) setPicking(true);
  };
  const switchToLit = () => {
    setMode('literal');
    if (refMode) onChange(undefined);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="inline-flex h-6 w-fit overflow-hidden rounded-md border border-input bg-muted p-0.5 text-[10.5px]">
        <button
          type="button"
          onClick={switchToLit}
          className={"rounded-[3px] px-2 transition-colors " + (mode === 'literal' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          value
        </button>
        <button
          type="button"
          onClick={switchToRef}
          className={"rounded-[3px] px-2 transition-colors " + (mode === 'ref' ? "bg-background text-brand-violet shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          <span className="inline-flex items-center gap-1">
            <window.SchemaModule.Icon.Link size={9} />
            reference
          </span>
        </button>
      </div>

      {mode === 'literal' && (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="h-8 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
        />
      )}
      {mode === 'ref' && (
        <>
          <button
            ref={anchorRef}
            type="button"
            onClick={() => setPicking(true)}
            className={
              "flex h-8 items-center justify-between rounded-md border px-2 text-left text-[12px] transition-colors " +
              (refField
                ? "border-brand-violet/30 bg-brand-violet/[0.06]"
                : "border-dashed border-brand-violet/40 bg-background hover:bg-accent/40")
            }
          >
            {refField ? (
              <RefChip field={refField} fieldType={refFieldType} onRemove={() => onChange(undefined)} />
            ) : (
              <span className="text-muted-foreground">Pick a field…</span>
            )}
            <window.SchemaModule.Icon.Chevron size={11} />
          </button>
          {picking && (
            <FieldPicker
              anchorRef={anchorRef}
              fields={fields}
              currentField={ownField}
              onPick={(f) => { onChange({ $ref: f.name }); setPicking(false); }}
              onClose={() => setPicking(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------- variant: mention (contentEditable with @ trigger) ----------
function RefInputMention({ value, onChange, placeholder, fields, ownField }) {
  // For mention mode the underlying value is always a STRING, possibly containing
  // {{fieldName}} tokens. If the host handed in a $ref object, we convert.
  const flatValue = useMemoRI(() => {
    if (isRef(value)) return `{{${value.$ref}}}`;
    return typeof value === 'string' ? value : '';
  }, [value]);

  const editorRef = useRefRI(null);
  const [mentionState, setMentionState] = useStateRI(null); // { rect, query }
  const lastEmittedRef = useRefRI(flatValue);

  // Render parts to DOM imperatively so contentEditable cursor isn't fought.
  const renderParts = (str) => {
    const ed = editorRef.current;
    if (!ed) return;
    const parts = tokenize(str);
    ed.innerHTML = '';
    parts.forEach((p) => {
      if (p.t === 'text') {
        ed.appendChild(document.createTextNode(p.v));
      } else {
        const span = document.createElement('span');
        const fld = fields.find((f) => f.name === p.v);
        const dot = FAKER_DOT_COLOR[fld?.type] || 'bg-brand-violet/50';
        span.className = 'inline-flex items-center gap-1 rounded border border-brand-violet/30 bg-brand-violet/10 px-1.5 py-0.5 align-middle font-mono text-[11px] text-brand-violet mx-0.5';
        span.contentEditable = 'false';
        span.dataset.ref = p.v;
        span.innerHTML = `<span class="h-1.5 w-1.5 rounded-sm ${dot}"></span><span>${p.v}</span>`;
        ed.appendChild(span);
      }
    });
  };

  useEffectRI(() => {
    if (flatValue !== lastEmittedRef.current) {
      renderParts(flatValue);
      lastEmittedRef.current = flatValue;
    }
  }, [flatValue]);

  useEffectRI(() => {
    renderParts(flatValue);
  }, []); // eslint-disable-line

  const readBack = () => {
    const ed = editorRef.current;
    if (!ed) return '';
    let out = '';
    ed.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) out += n.textContent;
      else if (n.dataset?.ref) out += `{{${n.dataset.ref}}}`;
      else if (n.tagName === 'BR') out += '';
      else out += n.textContent || '';
    });
    return out;
  };

  const emit = () => {
    const txt = readBack();
    lastEmittedRef.current = txt;
    onChange(txt === '' ? undefined : txt);
  };

  const insertRefAtCursor = (fieldName) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    // remove the trigger ("@query") immediately before the cursor
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = node.textContent;
      const upToCaret = txt.slice(0, range.startOffset);
      const atIdx = upToCaret.lastIndexOf('@');
      if (atIdx >= 0) {
        const before = txt.slice(0, atIdx);
        const after = txt.slice(range.startOffset);
        node.textContent = before;
        range.setStart(node, before.length);
        range.collapse(true);
        if (after) {
          const tail = document.createTextNode(after);
          node.parentNode.insertBefore(tail, node.nextSibling);
        }
      }
    }

    const fld = fields.find((f) => f.name === fieldName);
    const dot = FAKER_DOT_COLOR[fld?.type] || 'bg-brand-violet/50';
    const span = document.createElement('span');
    span.className = 'inline-flex items-center gap-1 rounded border border-brand-violet/30 bg-brand-violet/10 px-1.5 py-0.5 align-middle font-mono text-[11px] text-brand-violet mx-0.5';
    span.contentEditable = 'false';
    span.dataset.ref = fieldName;
    span.innerHTML = `<span class="h-1.5 w-1.5 rounded-sm ${dot}"></span><span>${fieldName}</span>`;

    range.insertNode(span);

    // place caret after the chip
    const after = document.createTextNode('\u200B');
    span.parentNode.insertBefore(after, span.nextSibling);
    const r2 = document.createRange();
    r2.setStart(after, 1);
    r2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r2);

    setMentionState(null);
    emit();
  };

  const onInput = () => {
    // Look for "@..." just before the caret to decide whether to open the picker.
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const r = sel.getRangeAt(0);
      const node = r.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const up = node.textContent.slice(0, r.startOffset);
        const m = up.match(/@([a-zA-Z0-9_]*)$/);
        if (m) {
          const rect = r.getBoundingClientRect();
          setMentionState({ rect, query: m[1] });
        } else {
          setMentionState(null);
        }
      } else {
        setMentionState(null);
      }
    }
    emit();
  };

  const fakeAnchorRef = useRefRI({
    current: { getBoundingClientRect: () => mentionState?.rect ?? { left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 } },
  });

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={onInput}
        onBlur={emit}
        data-empty={flatValue === '' ? 'true' : undefined}
        className="ref-mention min-h-[2rem] w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-[12px] leading-6 outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
      />
      {flatValue === '' && (
        <div className="pointer-events-none absolute left-2 top-1 select-none font-mono text-[12px] text-muted-foreground">
          {placeholder || 'type, or @ to reference'}
        </div>
      )}
      {mentionState && (
        <FieldPicker
          anchorRef={fakeAnchorRef.current}
          fields={fields}
          currentField={ownField}
          query={mentionState.query}
          onPick={(f) => insertRefAtCursor(f.name)}
          onClose={() => setMentionState(null)}
        />
      )}
    </div>
  );
}

// ---------- main entry ----------
function RefInput({ value, onChange, placeholder, fields, ownField, variant = 'toggle' }) {
  if (!fields || fields.length === 0) {
    // No sibling fields available — just fall back to a plain text input.
    return (
      <input
        type="text"
        value={typeof value === 'string' ? value : ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-8 rounded-md border border-input bg-background px-2 font-mono text-[12px] outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/10"
      />
    );
  }
  if (variant === 'mention') return <RefInputMention {...{ value, onChange, placeholder, fields, ownField }} />;
  if (variant === 'tabs') return <RefInputTabs {...{ value, onChange, placeholder, fields, ownField }} />;
  return <RefInputToggle {...{ value, onChange, placeholder, fields, ownField }} />;
}

// summarize a value (for cell chips)
function summarizeRefValue(v) {
  if (isRef(v)) return `→${v.$ref}`;
  if (typeof v === 'string') {
    const parts = tokenize(v);
    if (parts.length === 1 && parts[0].t === 'ref') return `→${parts[0].v}`;
    if (parts.some((p) => p.t === 'ref')) {
      return parts.map((p) => (p.t === 'ref' ? `→${p.v}` : p.v)).join('');
    }
    return v;
  }
  return null;
}

/** Resolve a string/$ref value against a row map for preview. */
function resolveRefValue(v, resolveField) {
  if (isRef(v)) return resolveField ? resolveField(v.$ref) : v.$ref;
  if (typeof v === 'string') {
    return v.replace(/\{\{\s*([a-zA-Z_$][\w$.]*)\s*\}\}/g, (_, f) => (resolveField ? resolveField(f) : f));
  }
  return v;
}

Object.assign(window, { RefInput, isRef, tokenize, detokenize, summarizeRefValue, resolveRefValue, RefChip });


// ============================================================
// args-editor (original)
// ============================================================

/**
 * Args editor primitives. Renders the right input for a curated param kind,
 * plus the raw-JSON fallback for methods not in the catalog.
 *
 * Used by all three variants (popover / inline / side panel) so the styling
 * stays consistent.
 */

const { useMemo, useState } = React;

/** Curated catalog drop-down for a single param. */
function ArgField({ param, value, onChange, fields, ownField, refVariant }) {
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

  // string fallback — supports referencing other schema fields
  return (
    <div className="flex flex-col gap-1">
      {labelEl}
      <window.RefInput
        value={value}
        onChange={onChange}
        placeholder={param.default !== undefined ? String(param.default) : ''}
        fields={fields ?? []}
        ownField={ownField}
        variant={refVariant}
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
function ArgsEditor({ method, args, onChange, density = "comfortable", fields, ownField, refVariant }) {
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
            <ArgField
              key={p.name}
              param={p}
              value={getParam(p.name)}
              onChange={(v) => setParam(p.name, v)}
              fields={fields}
              ownField={ownField}
              refVariant={refVariant}
            />
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
  if (v && typeof v === 'object' && typeof v.$ref === 'string') return `→${v.$ref}`;
  if (typeof v === 'string') {
    const summarized = window.summarizeRefValue ? window.summarizeRefValue(v) : v;
    return summarized.length > 14 ? `"${summarized.slice(0, 12)}…"` : `"${summarized}"`;
  }
  if (typeof v === 'object' && v !== null) return '{…}';
  return String(v);
}

Object.assign(window, { ArgsEditor, ArgField, RawJsonEditor, summarizeArgs });
