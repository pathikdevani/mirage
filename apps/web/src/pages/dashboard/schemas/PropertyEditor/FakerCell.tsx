import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Code2, Link2, Search } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { Api, ValueExpr, ValueSegment } from '@mirage/types';
import { canonicalize } from '@mirage/types';
import { bff } from '../../../../api/client.js';
import type { Schema, SchemaProp } from '../lib/types.js';
import { FAKER_GROUPS } from '../lib/types.js';
import { ArgsPopover } from './args/ArgsPopover.js';
import type { RefField } from './args/field-renderers/RefMentionInput.js';
import type { ArgsStored } from './args/serialize.js';

type CustomFunction = Api.components['schemas']['CustomFunction'];

export interface FakerCellProps {
  value: ValueExpr | undefined;
  onChange: (next: ValueExpr | undefined) => void;
  workspaceSchemas: Schema[];
  invalid: boolean;
  siblingFields: RefField[];
  ownFieldName: string;
}

interface RefOption {
  key: string;
  field: string;
  type: SchemaProp['type'];
}

const TYPE_DOT: Record<SchemaProp['type'], string> = {
  string: 'bg-brand-violet',
  number: 'bg-brand-amber',
  integer: 'bg-brand-amber',
  boolean: 'bg-brand-emerald',
  object: 'bg-brand-cyan',
  array: 'bg-brand-cyan',
};

export function FakerCell({
  value,
  onChange,
  workspaceSchemas,
  invalid,
  siblingFields,
  ownFieldName,
}: FakerCellProps) {
  const { wsId } = useParams<{ wsId: string }>();
  const editorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [argsChip, setArgsChip] = useState<{
    el: HTMLElement;
    method: string;
    args: ArgsStored | undefined;
  } | null>(null);

  const customFunctions = useQuery({
    enabled: Boolean(wsId),
    queryKey: ['custom-functions', wsId, 'usage=valueGenerator'],
    queryFn: async (): Promise<CustomFunction[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/custom-functions', {
        params: { path: { wsId: wsId! }, query: { usage: 'valueGenerator' } },
      });
      if (error) throw error;
      return (data ?? []) as CustomFunction[];
    },
    staleTime: 30_000,
  });

  const refOptions = useMemo<RefOption[]>(() => {
    const out: RefOption[] = [];
    const flatten = (key: string, props: SchemaProp[], path: string): void => {
      for (const p of props) {
        const nextPath = path ? `${path}.${p.name}` : p.name;
        if (p.type !== 'object' && p.type !== 'array') {
          out.push({ key, field: nextPath, type: p.type });
        }
        if (p.type === 'object' && Array.isArray(p.fields)) {
          flatten(key, p.fields, nextPath);
        }
      }
    };
    for (const s of workspaceSchemas) flatten(s.key, s.properties, '');
    return out;
  }, [workspaceSchemas]);

  const fieldTypeByName = useMemo(() => {
    const m = new Map<string, SchemaProp['type']>();
    for (const f of siblingFields) m.set(f.name, f.type);
    return m;
  }, [siblingFields]);

  // Read AST back from the DOM
  const readAst = (): ValueExpr => {
    const ed = editorRef.current;
    if (!ed) return [];
    const out: ValueSegment[] = [];
    ed.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        // Strip zero-width spaces — we use them as caret-positioning anchors
        // after chip insertion; they must not leak into the AST.
        const t = (n.textContent ?? '').replace(/​/g, '');
        if (t) out.push({ kind: 'text', text: t });
        return;
      }
      if (n instanceof HTMLElement) {
        const k = n.dataset['kind'];
        if (k === 'field') out.push({ kind: 'field', name: n.dataset['name']! });
        else if (k === 'method') {
          const seg: ValueSegment = { kind: 'method', method: n.dataset['method']! };
          const a = n.dataset['args'];
          if (a) {
            try {
              (seg as { args?: ArgsStored }).args = JSON.parse(a) as ArgsStored;
            } catch {
              /* ignore malformed cached args */
            }
          }
          out.push(seg);
        } else if (k === 'ref') out.push({ kind: 'ref', target: n.dataset['target']! });
        else if (k === 'fn') out.push({ kind: 'fn', id: n.dataset['id']! });
      }
    });
    return canonicalize(out);
  };

  // Stable serialization marker. Updated whenever we OR the parent change
  // `value`. The watcher effect skips DOM rebuilds when the incoming value
  // matches what we just emitted — that prevents wiping the user's caret on
  // every keystroke (each keystroke calls emit → onChange → parent re-render).
  const lastEmittedRef = useRef<string>('');

  const renderAst = (expr: ValueExpr | undefined): void => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.innerHTML = '';
    // Caret-anchor text nodes around every chip: contentEditable=false elements
    // are atomic for caret purposes, so without a text node on each side the
    // caret can't land beside them. readAst() strips zero-width spaces, so the
    // AST stays clean.
    const segs = expr ?? [];
    const needsLeading = segs.length > 0 && segs[0]!.kind !== 'text';
    if (needsLeading) ed.appendChild(document.createTextNode('​'));
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (seg.kind === 'text') {
        ed.appendChild(document.createTextNode(seg.text));
      } else {
        ed.appendChild(makeChip(seg, fieldTypeByName));
        // If the next segment is also a chip (or there is no next segment),
        // sandwich a caret-anchor text node so the user can land between them.
        const nextIsChip = i + 1 < segs.length && segs[i + 1]!.kind !== 'text';
        if (nextIsChip || i === segs.length - 1) {
          ed.appendChild(document.createTextNode('​'));
        }
      }
    }
  };

  const emit = (): void => {
    const ast = readAst();
    const next = ast.length === 0 ? undefined : ast;
    // Mark this serialization as ours BEFORE notifying the parent, so the
    // re-render that follows doesn't rebuild the DOM and lose the caret.
    lastEmittedRef.current = JSON.stringify(next ?? null);
    onChange(next);
  };

  useEffect(() => {
    const serialized = JSON.stringify(value ?? null);
    if (serialized === lastEmittedRef.current) return;
    renderAst(value);
    lastEmittedRef.current = serialized;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    renderAst(value);
    lastEmittedRef.current = JSON.stringify(value ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertSegment = (seg: ValueSegment): void => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();

    if (seg.kind === 'text') return; // not used from the picker

    const sel = window.getSelection();
    let range: Range | null = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (!range || !ed.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(ed);
      range.collapse(false);
    }

    // remove "@query" trigger immediately before caret, if present
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = node.textContent ?? '';
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
          node.parentNode?.insertBefore(tail, node.nextSibling);
        }
      }
    }

    const chip = makeChip(seg, fieldTypeByName);
    range.insertNode(chip);

    // Ensure caret-anchor text nodes on BOTH sides of the new chip — otherwise
    // the caret can't land before a chip that's the first child of the cell,
    // nor between two adjacent chips.
    const prev = chip.previousSibling;
    if (!prev || prev.nodeType !== Node.TEXT_NODE) {
      const before = document.createTextNode('​');
      chip.parentNode?.insertBefore(before, chip);
    }
    const next = chip.nextSibling;
    const after =
      next && next.nodeType === Node.TEXT_NODE
        ? (next as Text)
        : (() => {
            const t = document.createTextNode('​');
            chip.parentNode?.insertBefore(t, chip.nextSibling);
            return t;
          })();
    const r2 = document.createRange();
    r2.setStart(after, Math.min(1, after.textContent?.length ?? 0));
    r2.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(r2);

    setPickerAnchor(null);
    setPickerQuery('');
    emit();
  };

  const onInput = (): void => {
    // Detect "@..." right before the caret
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      const node = r.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const up = (node.textContent ?? '').slice(0, r.startOffset);
        const m = up.match(/@([a-zA-Z0-9_]*)$/);
        if (m) {
          setPickerAnchor(r.getBoundingClientRect());
          setPickerQuery(m[1] ?? '');
        } else {
          setPickerAnchor(null);
          setPickerQuery('');
        }
      } else {
        setPickerAnchor(null);
        setPickerQuery('');
      }
    }
    emit();
  };

  const onCellClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Method chip click → args popover
    let target = e.target as HTMLElement | null;
    while (target && target !== editorRef.current) {
      if (target.dataset && target.dataset['kind'] === 'method') {
        const a = target.dataset['args'];
        let parsed: ArgsStored | undefined;
        if (a) {
          try {
            parsed = JSON.parse(a) as ArgsStored;
          } catch {
            /* ignore */
          }
        }
        setArgsChip({ el: target, method: target.dataset['method']!, args: parsed });
        return;
      }
      target = target.parentElement;
    }

    // Empty cell click → open picker
    const isEmpty = !value || value.length === 0;
    if (isEmpty) {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) {
        setPickerAnchor(r);
        setPickerQuery('');
      }
    }
  };

  const onMethodArgsChange = (next: ArgsStored | undefined): void => {
    if (!argsChip) return;
    if (next === undefined) delete argsChip.el.dataset['args'];
    else argsChip.el.dataset['args'] = JSON.stringify(next);
    setArgsChip({ ...argsChip, args: next });
    emit();
  };

  const isEmpty = !value || value.length === 0;

  return (
    <div className="relative flex items-center gap-1" ref={triggerRef}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={onInput}
        onBlur={emit}
        onClick={onCellClick}
        className={cn(
          // `block` (not flex) so the browser treats this as a text flow and
          // can compute caret positions natively. `min-h-7` (not `h-7`) lets
          // the cell grow when chips wrap. `py-px` distributes the 2px
          // remainder evenly (border 2 + padding 2 + leading 24 = 28 = h-7),
          // so the line box is vertically centered instead of stuck at top.
          'block min-h-7 flex-1 rounded-md border bg-background px-2 py-px text-[11.5px] leading-6 outline-none focus:ring-[2px] focus:ring-ring/10',
          invalid ? 'border-destructive focus:border-destructive' : 'border-input focus:border-ring',
        )}
      />
      {isEmpty && (
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-[11.5px] text-muted-foreground">
          — type, or @ to insert —
        </div>
      )}
      {pickerAnchor && (
        <SegmentPicker
          rect={pickerAnchor}
          query={pickerQuery}
          siblingFields={siblingFields}
          ownFieldName={ownFieldName}
          refOptions={refOptions}
          customFunctions={customFunctions.data ?? []}
          onPick={insertSegment}
          onClose={() => {
            setPickerAnchor(null);
            setPickerQuery('');
          }}
        />
      )}
      {argsChip && (
        <ArgsPopover
          anchorRef={{ current: argsChip.el } as RefObject<HTMLElement>}
          open
          method={argsChip.method}
          stored={argsChip.args}
          onChange={onMethodArgsChange}
          onClose={() => setArgsChip(null)}
          fields={siblingFields}
          ownField={ownFieldName}
        />
      )}
    </div>
  );
}

function makeChip(
  seg: Exclude<ValueSegment, { kind: 'text' }>,
  fieldTypeByName: Map<string, SchemaProp['type']>,
): HTMLSpanElement {
  const span = document.createElement('span');
  span.contentEditable = 'false';
  span.dataset['kind'] = seg.kind;
  // `mr-1` (not `mx-*`) so the first chip's left edge aligns with plain text
  // (the cell's `px-2` is the only horizontal offset). `relative -top-px`
  // nudges the chip up by 1px to compensate for `align-middle` aligning to
  // text-middle rather than line-box-middle.
  span.className =
    'relative -top-px inline-flex items-center gap-1 mr-1 rounded border px-1.5 py-px align-middle font-mono text-[11px] leading-4';

  if (seg.kind === 'field') {
    span.dataset['name'] = seg.name;
    span.classList.add('border-brand-violet/30', 'bg-brand-violet/10', 'text-brand-violet');
    const dot = document.createElement('span');
    dot.className = `h-1.5 w-1.5 rounded-sm ${TYPE_DOT[fieldTypeByName.get(seg.name) ?? 'string']}`;
    const label = document.createElement('span');
    label.textContent = seg.name;
    span.appendChild(dot);
    span.appendChild(label);
  } else if (seg.kind === 'method') {
    span.dataset['method'] = seg.method;
    if (seg.args !== undefined) span.dataset['args'] = JSON.stringify(seg.args);
    span.classList.add(
      'border-brand-violet/30',
      'bg-brand-violet/10',
      'text-brand-violet',
      'cursor-pointer',
    );
    const sliders = sliderIcon();
    const label = document.createElement('span');
    label.textContent = seg.method;
    span.appendChild(sliders);
    span.appendChild(label);
  } else if (seg.kind === 'ref') {
    span.dataset['target'] = seg.target;
    span.classList.add('border-brand-violet/30', 'bg-brand-violet/10', 'text-brand-violet');
    const link = linkIcon();
    const label = document.createElement('span');
    label.textContent = seg.target;
    span.appendChild(link);
    span.appendChild(label);
  } else if (seg.kind === 'fn') {
    span.dataset['id'] = seg.id;
    span.classList.add('border-brand-emerald/30', 'bg-brand-emerald/10', 'text-brand-emerald');
    const code = codeIcon();
    const label = document.createElement('span');
    label.textContent = seg.id;
    span.appendChild(code);
    span.appendChild(label);
  }
  return span;
}

function svgIcon(d: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '10');
  svg.setAttribute('height', '10');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

const sliderIcon = (): SVGSVGElement =>
  svgIcon('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6');
const linkIcon = (): SVGSVGElement =>
  svgIcon(
    'M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8',
  );
const codeIcon = (): SVGSVGElement =>
  svgIcon('M16 18l6-6-6-6M8 6l-6 6 6 6');

// -------- Picker --------

interface SegmentPickerProps {
  rect: DOMRect;
  query: string;
  siblingFields: RefField[];
  ownFieldName: string;
  refOptions: RefOption[];
  customFunctions: CustomFunction[];
  onPick: (seg: ValueSegment) => void;
  onClose: () => void;
}

interface PickItem {
  key: string;
  section: string;
  seg: ValueSegment;
  render: () => React.ReactNode;
}

function SegmentPicker({
  rect,
  query: initialQuery,
  siblingFields,
  ownFieldName,
  refOptions,
  customFunctions,
  onPick,
  onClose,
}: SegmentPickerProps) {
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useLayoutEffect(() => {
    const w = 360;
    const left = Math.min(window.innerWidth - w - 12, Math.max(12, rect.left));
    setPos({ left, top: rect.bottom + 4, width: w });
  }, [rect]);

  // Focus once `pos` is set — the first render returns null (waiting for
  // `pos`), so an empty-deps effect would fire before the input exists.
  useEffect(() => {
    if (pos) inputRef.current?.focus();
  }, [pos]);
  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  const items = useMemo<PickItem[]>(() => {
    const lower = q.trim().toLowerCase();
    const out: PickItem[] = [];

    const fields = lower
      ? siblingFields.filter((f) => f.name !== ownFieldName && f.name.toLowerCase().includes(lower))
      : siblingFields.filter((f) => f.name !== ownFieldName);
    for (const f of fields) {
      out.push({
        key: `field-${f.name}`,
        section: 'Fields',
        seg: { kind: 'field', name: f.name },
        render: () => (
          <>
            <span className={cn('h-1.5 w-1.5 rounded-sm', TYPE_DOT[f.type] ?? 'bg-brand-violet/50')} />
            <span className="font-mono">{f.name}</span>
            <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground">{f.type}</span>
          </>
        ),
      });
    }

    const methods = lower
      ? FAKER_GROUPS.flatMap((g) =>
          g.methods
            .filter((m) => m.toLowerCase().includes(lower) || g.ns.toLowerCase().includes(lower))
            .map((m) => ({ ns: g.ns, method: m })),
        )
      : FAKER_GROUPS.flatMap((g) => g.methods.map((m) => ({ ns: g.ns, method: m })));
    for (const { ns, method } of methods.slice(0, 200)) {
      out.push({
        key: `method-${ns}.${method}`,
        section: 'Faker methods',
        seg: { kind: 'method', method: `${ns}.${method}` },
        render: () => (
          <>
            <span className="rounded bg-brand-violet/10 px-1 py-0 font-mono text-[10px] text-brand-violet">
              {ns}
            </span>
            <span className="font-mono">.{method}</span>
          </>
        ),
      });
    }

    const refs = lower
      ? refOptions.filter(
          (r) => r.key.toLowerCase().includes(lower) || r.field.toLowerCase().includes(lower),
        )
      : refOptions;
    for (const r of refs) {
      out.push({
        key: `ref-${r.key}.${r.field}`,
        section: 'Cross-schema refs',
        seg: { kind: 'ref', target: `${r.key}.${r.field}` },
        render: () => (
          <>
            <Link2 size={11} className="text-brand-violet" />
            <span className="font-mono">
              <b>{r.key}</b>
              <span className="text-muted-foreground">.</span>
              {r.field}
            </span>
            <span className="ml-auto rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
              {r.type}
            </span>
          </>
        ),
      });
    }

    const fns = lower
      ? customFunctions.filter((f) => f.name.toLowerCase().includes(lower))
      : customFunctions;
    for (const f of fns) {
      out.push({
        key: `fn-${f.id}`,
        section: 'Custom functions',
        seg: { kind: 'fn', id: f.id },
        render: () => (
          <>
            <Code2 size={11} className="text-brand-emerald" />
            <span className="font-mono">{f.name}</span>
            <span className="ml-auto rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
              {f.usage}
            </span>
          </>
        ),
      });
    }

    return out;
  }, [q, siblingFields, ownFieldName, refOptions, customFunctions]);

  // Clamp active index when the result set shrinks; resetting to 0 on every
  // keystroke would fight the user who is arrowing through results.
  useEffect(() => {
    setActiveIndex((i) => (items.length === 0 ? 0 : Math.min(i, items.length - 1)));
  }, [items.length]);

  // Keep the active item scrolled into view as the user arrows through.
  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Listen at the document level so navigation keys work no matter what is
  // focused — the contentEditable cell often steals focus back from the
  // picker's input, which would otherwise swallow ArrowDown/Enter/etc.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (items.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = items[activeIndex];
        if (item) onPick(item.seg);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [items, activeIndex, onClose, onPick]);

  if (!pos) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} />
      <div
        className="fixed z-[61] overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
          <Search size={11} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            className="h-5 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-input bg-muted px-1 font-mono text-[9.5px] text-muted-foreground sm:inline">
            esc
          </kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
              No matches
            </div>
          ) : (
            items.map((item, idx) => {
              const showHeader = idx === 0 || items[idx - 1]!.section !== item.section;
              const isActive = idx === activeIndex;
              return (
                <Fragment key={item.key}>
                  {showHeader && <SectionHeader>{item.section}</SectionHeader>}
                  <button
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onPick(item.seg);
                    }}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 py-1 text-left text-[12px]',
                      isActive ? 'bg-accent' : 'hover:bg-accent',
                    )}
                  >
                    {item.render()}
                  </button>
                </Fragment>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
          <span>
            <span className="font-mono">↑↓</span> navigate
          </span>
          <span>
            <span className="font-mono">↵</span> select
          </span>
          <span className="ml-auto">
            <span className="font-mono">esc</span> close
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

