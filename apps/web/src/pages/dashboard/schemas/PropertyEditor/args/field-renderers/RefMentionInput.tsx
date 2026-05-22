import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2 } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import type { SchemaProp } from '../../../lib/types.js';

export interface RefField {
  name: string;
  type: SchemaProp['type'];
}

export interface RefMentionInputProps {
  value: string;
  onChange: (next: string | undefined) => void;
  placeholder?: string;
  fields: RefField[];
  ownField?: string;
  invalid?: boolean;
}

const FAKER_DOT_COLOR: Record<SchemaProp['type'], string> = {
  string: 'bg-brand-violet',
  number: 'bg-brand-amber',
  integer: 'bg-brand-amber',
  boolean: 'bg-brand-emerald',
  object: 'bg-brand-cyan',
  array: 'bg-brand-cyan',
};

interface Part {
  t: 'text' | 'ref';
  v: string;
}

function tokenize(str: string): Part[] {
  if (!str) return [];
  const out: Part[] = [];
  const re = /\{\{\s*([a-zA-Z_$][\w$.]*)\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: str.slice(last, m.index) });
    out.push({ t: 'ref', v: m[1]! });
    last = re.lastIndex;
  }
  if (last < str.length) out.push({ t: 'text', v: str.slice(last) });
  return out;
}

function chipClass(type: SchemaProp['type'] | undefined): string {
  return FAKER_DOT_COLOR[type ?? 'string'] ?? 'bg-brand-violet/50';
}

interface PickerPos {
  left: number;
  top: number;
  width: number;
}

interface FieldPickerProps {
  rect: DOMRect;
  fields: RefField[];
  ownField?: string;
  query: string;
  onPick: (f: RefField) => void;
  onClose: () => void;
}

function FieldPicker({ rect, fields, ownField, query: initialQuery, onPick, onClose }: FieldPickerProps) {
  const [pos, setPos] = useState<PickerPos | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const w = 240;
    const left = Math.min(window.innerWidth - w - 12, Math.max(12, rect.left));
    setPos({ left, top: rect.bottom + 4, width: w });
  }, [rect]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return fields.filter((f) => f.name !== ownField && f.name.toLowerCase().includes(needle));
  }, [q, fields, ownField]);

  useEffect(() => {
    setHi(0);
  }, [q]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[hi];
      if (pick) onPick(pick);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

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
          <Link2 size={11} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Reference a field…"
            className="h-5 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-input bg-muted px-1 font-mono text-[9.5px] text-muted-foreground sm:inline">
            esc
          </kbd>
        </div>
        <div className="max-h-[200px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-2.5 py-3 text-center text-[11.5px] text-muted-foreground">
              No matching fields
            </div>
          ) : (
            filtered.map((f, i) => (
              <button
                key={f.name}
                type="button"
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  // mousedown (not click) so the contentEditable doesn't lose its
                  // selection before we read the caret position
                  e.preventDefault();
                  onPick(f);
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px]',
                  i === hi ? 'bg-accent text-foreground' : 'text-foreground/90 hover:bg-accent/50',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-sm', chipClass(f.type))} />
                <span className="font-mono">{f.name}</span>
                <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground">
                  {f.type}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
          <span className="font-mono">↑↓</span> navigate · <span className="font-mono">↵</span>{' '}
          insert
        </div>
      </div>
    </>,
    document.body,
  );
}

interface MentionState {
  rect: DOMRect;
  query: string;
}

export function RefMentionInput({
  value,
  onChange,
  placeholder,
  fields,
  ownField,
  invalid,
}: RefMentionInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const lastEmitted = useRef(value);
  const savedSelection = useRef<{ node: Node; offset: number } | null>(null);
  const fieldTypeByName = useMemo(() => {
    const m = new Map<string, SchemaProp['type']>();
    for (const f of fields) m.set(f.name, f.type);
    return m;
  }, [fields]);

  const renderParts = (str: string): void => {
    const ed = editorRef.current;
    if (!ed) return;
    const parts = tokenize(str);
    ed.innerHTML = '';
    for (const p of parts) {
      if (p.t === 'text') {
        ed.appendChild(document.createTextNode(p.v));
      } else {
        ed.appendChild(makeChip(p.v, fieldTypeByName.get(p.v)));
      }
    }
  };

  // External value → DOM (only when external value differs from what we last emitted)
  useEffect(() => {
    if (value !== lastEmitted.current) {
      renderParts(value);
      lastEmitted.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    renderParts(value);
    lastEmitted.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readBack = (): string => {
    const ed = editorRef.current;
    if (!ed) return '';
    let out = '';
    ed.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.textContent ?? '';
      } else if (n instanceof HTMLElement && n.dataset['ref']) {
        out += `{{${n.dataset['ref']}}}`;
      } else if (n instanceof HTMLElement && n.tagName === 'BR') {
        // skip
      } else {
        out += n.textContent ?? '';
      }
    });
    return out;
  };

  const emit = (): void => {
    const txt = readBack();
    lastEmitted.current = txt;
    onChange(txt === '' ? undefined : txt);
  };

  const saveSelection = (): void => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    savedSelection.current = { node: r.startContainer, offset: r.startOffset };
  };

  const insertRefAtCursor = (fieldName: string): void => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();

    // Restore caret if it was lost (mousedown on picker)
    let range: Range | null = null;
    const sel = window.getSelection();
    if (savedSelection.current && ed.contains(savedSelection.current.node)) {
      range = document.createRange();
      range.setStart(savedSelection.current.node, savedSelection.current.offset);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else if (sel && sel.rangeCount > 0) {
      range = sel.getRangeAt(0);
    }
    if (!range || !sel) return;

    // remove the "@query" trigger immediately before the cursor
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

    const chip = makeChip(fieldName, fieldTypeByName.get(fieldName));
    range.insertNode(chip);

    // caret after the chip
    const after = document.createTextNode('​');
    chip.parentNode?.insertBefore(after, chip.nextSibling);
    const r2 = document.createRange();
    r2.setStart(after, 1);
    r2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r2);

    setMention(null);
    emit();
  };

  const onInput = (): void => {
    saveSelection();
    // Look for "@..." just before the caret to decide whether to open the picker.
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      const node = r.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const up = (node.textContent ?? '').slice(0, r.startOffset);
        const m = up.match(/@([a-zA-Z0-9_]*)$/);
        if (m) {
          const rect = r.getBoundingClientRect();
          setMention({ rect, query: m[1] ?? '' });
        } else {
          setMention(null);
        }
      } else {
        setMention(null);
      }
    }
    emit();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && mention) {
      e.preventDefault();
      setMention(null);
    }
  };

  const isEmpty = value === '';

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={onInput}
        onBlur={emit}
        onKeyDown={onKeyDown}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        className={cn(
          'min-h-[2rem] w-full rounded-md border bg-background px-2 py-1 font-mono text-[12px] leading-6 outline-none focus:ring-[2px] focus:ring-ring/10',
          invalid
            ? 'border-destructive focus:border-destructive'
            : 'border-input focus:border-ring',
        )}
      />
      {isEmpty && (
        <div className="pointer-events-none absolute left-2 top-1 select-none font-mono text-[12px] text-muted-foreground">
          {placeholder ?? 'type, or @ to reference'}
        </div>
      )}
      {mention && (
        <FieldPicker
          rect={mention.rect}
          fields={fields}
          {...(ownField !== undefined ? { ownField } : {})}
          query={mention.query}
          onPick={(f) => insertRefAtCursor(f.name)}
          onClose={() => setMention(null)}
        />
      )}
    </div>
  );
}

function makeChip(fieldName: string, type: SchemaProp['type'] | undefined): HTMLSpanElement {
  const span = document.createElement('span');
  span.className =
    'inline-flex items-center gap-1 rounded border border-brand-violet/30 bg-brand-violet/10 px-1.5 py-0.5 align-middle font-mono text-[11px] text-brand-violet mx-0.5';
  span.contentEditable = 'false';
  span.dataset['ref'] = fieldName;
  const dot = document.createElement('span');
  dot.className = `h-1.5 w-1.5 rounded-sm ${chipClass(type)}`;
  const label = document.createElement('span');
  label.textContent = fieldName;
  span.appendChild(dot);
  span.appendChild(label);
  return span;
}

