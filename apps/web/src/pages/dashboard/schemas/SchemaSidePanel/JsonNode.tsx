import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface JsonNodeProps {
  value: unknown;
  name?: string;
  depth?: number;
  initiallyOpen?: boolean;
}

export function JsonNode({ value, name, depth = 0, initiallyOpen = true }: JsonNodeProps) {
  const isArr = Array.isArray(value);
  const isObj = !isArr && value !== null && typeof value === 'object';
  const collapsible = isArr || isObj;
  const [open, setOpen] = useState(initiallyOpen || depth < 2);

  const label = name !== undefined ? <span className="text-foreground/70">{name}</span> : null;

  if (!collapsible) {
    return (
      <div className="flex items-baseline gap-1.5 leading-5">
        {label && <>{label}<span className="text-muted-foreground">:</span></>}
        <Scalar value={value} />
      </div>
    );
  }

  const entries: Array<[string, unknown]> = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);

  const summary = isArr ? `[${entries.length}]` : `{${entries.length}}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-baseline gap-1 leading-5 text-left hover:text-foreground"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {label && <>{label}<span className="text-muted-foreground">:</span></>}
        <span className="text-muted-foreground">{summary}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border/60 pl-2">
          {entries.map(([k, v]) => (
            <JsonNode key={k} name={k} value={v} depth={depth + 1} initiallyOpen={depth < 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function Scalar({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-brand-violet">&quot;{value}&quot;</span>;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-foreground">{String(value)}</span>;
  }
  return <span className="text-foreground">{String(value)}</span>;
}
