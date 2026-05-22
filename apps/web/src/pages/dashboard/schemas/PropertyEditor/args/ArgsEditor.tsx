import { useEffect, useState } from 'react';
import { FAKER_CATALOG, type MethodEntry, type Param } from '@mirage/fakerjs';
import type { ValueExpr } from '@mirage/types';
import type { RefField } from '../SegmentEditor.js';
import {
  ArrayField,
  BooleanField,
  DateField,
  EnumField,
  ExpressionField,
} from './field-renderers/index.js';
import { toInternal, toStored, type ArgInternal, type ArgsInternal, type ArgsStored } from './serialize.js';
import { validateArgs } from './validate.js';

export interface ArgsEditorProps {
  method: string;
  stored: ArgsStored | undefined;
  onChange: (next: ArgsStored | undefined) => void;
  fields?: RefField[];
  ownField?: string;
}

function renderField(
  param: Param,
  value: ArgInternal | undefined,
  onChange: (v: ArgInternal | undefined) => void,
  invalid: boolean,
  fields: RefField[],
  ownField: string,
) {
  // Boolean/enum/date keep a custom affordance for the common "literal value"
  // case; each also accepts an expression via the same SegmentEditor when the
  // user types `@` or picks a chip.
  switch (param.kind) {
    case 'array':
      return (
        <ArrayField
          param={param}
          value={(value as ValueExpr[] | undefined) ?? []}
          onChange={(v) => onChange(v && v.length > 0 ? v : undefined)}
          fields={fields}
          ownField={ownField}
        />
      );
    case 'boolean':
      return (
        <BooleanField
          param={param}
          value={value as ValueExpr | undefined}
          onChange={onChange}
          fields={fields}
          ownField={ownField}
        />
      );
    case 'enum':
      return (
        <EnumField
          param={param}
          value={value as ValueExpr | undefined}
          onChange={onChange}
          invalid={invalid}
          fields={fields}
          ownField={ownField}
        />
      );
    case 'date':
      return (
        <DateField
          param={param}
          value={value as ValueExpr | undefined}
          onChange={onChange}
          fields={fields}
          ownField={ownField}
        />
      );
    default:
      return (
        <ExpressionField
          param={param}
          value={value as ValueExpr | undefined}
          onChange={onChange}
          invalid={invalid}
          fields={fields}
          ownField={ownField}
        />
      );
  }
}

export function ArgsEditor({ method, stored, onChange, fields, ownField }: ArgsEditorProps) {
  const entry: MethodEntry | undefined = FAKER_CATALOG[method];
  const [advanced, setAdvanced] = useState(false);
  const [internal, setInternal] = useState<ArgsInternal>(() => toInternal(entry, stored));

  useEffect(() => {
    setInternal(toInternal(entry, stored));
    setAdvanced(false);
  }, [method]);

  if (!entry) {
    return (
      <RawJsonEditor
        value={stored}
        onChange={onChange}
        notice="No curated signature — edit args as raw JSON."
      />
    );
  }

  if (entry.shape === 'none') {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-[12px] text-muted-foreground">
        This method takes no arguments.
      </div>
    );
  }

  if (advanced) {
    return (
      <div className="flex flex-col gap-2">
        <RawJsonEditor value={stored} onChange={onChange} notice={null} />
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

  const validation = validateArgs(entry, internal);

  const setParam = (name: string, val: ArgInternal | undefined) => {
    const next = { ...internal };
    if (
      val === undefined ||
      (Array.isArray(val) && val.length === 0)
    ) {
      delete next[name];
    } else {
      next[name] = val;
    }
    setInternal(next);
    onChange(toStored(entry, next));
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          entry.params.length > 2 ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'
        }
      >
        {entry.params.map((p) => (
          <div key={p.name}>
            {renderField(
              p,
              internal[p.name],
              (v) => setParam(p.name, v),
              validation?.paramName === p.name,
              fields ?? [],
              ownField ?? '',
            )}
          </div>
        ))}
      </div>
      {validation && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
          {validation.message}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border pt-2 text-[10.5px] text-muted-foreground">
        <span>
          shape:{' '}
          <span className="font-mono">
            {entry.shape === 'options' ? '{ options }' : '(...positional)'}
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

function RawJsonEditor({
  value,
  onChange,
  notice,
}: {
  value: ArgsStored | undefined;
  onChange: (next: ArgsStored | undefined) => void;
  notice: string | null;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(JSON.stringify(value ?? {}, null, 2));
  }, [value]);

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
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          try {
            const parsed =
              e.target.value.trim() === '' ? undefined : (JSON.parse(e.target.value) as ArgsStored);
            setErr(null);
            onChange(parsed);
          } catch (ex) {
            setErr(ex instanceof Error ? ex.message : String(ex));
          }
        }}
        className={
          'rounded-md border bg-background px-2 py-1.5 font-mono text-[11.5px] leading-snug outline-none focus:ring-[2px] focus:ring-ring/10 ' +
          (err
            ? 'border-destructive focus:border-destructive'
            : 'border-input focus:border-ring')
        }
      />
      {err && <div className="text-[11px] text-destructive">{err}</div>}
    </div>
  );
}
