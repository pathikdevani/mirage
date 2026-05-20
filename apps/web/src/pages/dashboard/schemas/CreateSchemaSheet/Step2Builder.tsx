import type { Schema, SchemaProp } from '../lib/types.js';
import { countTreeStats } from '../lib/treeStats.js';
import type { ValidationIssue } from '../lib/validateTree.js';
import { PropertyEditor } from '../PropertyEditor/PropertyEditor.js';

interface Step2Props {
  rows: SchemaProp[];
  setRows: (rows: SchemaProp[]) => void;
  availableKeys: ReadonlySet<string>;
  workspaceSchemas: Schema[];
  cycleBanner: string | null;
  rowErrors: ReadonlyMap<string, ValidationIssue>;
  showEmptyError: boolean;
}

export function Step2Builder({
  rows,
  setRows,
  availableKeys,
  workspaceSchemas,
  cycleBanner,
  rowErrors,
  showEmptyError,
}: Step2Props) {
  const stats = countTreeStats(rows);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[13.5px] font-semibold text-foreground">Properties</div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Define the shape of each generated row. Use <span className="font-mono">object</span> /
          <span className="font-mono"> array</span> to nest fields at any depth.
        </p>
      </div>

      {showEmptyError && rows.length === 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          Add at least one property to continue.
        </div>
      )}
      {cycleBanner && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {cycleBanner}
        </div>
      )}

      <PropertyEditor
        rows={rows}
        setRows={setRows}
        availableKeys={availableKeys}
        workspaceSchemas={workspaceSchemas}
        rowErrors={rowErrors}
        selectedPath={null}
        onSelectPath={() => {}}
      />

      <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
        <span><b className="text-foreground">{stats.total}</b> total fields</span>
        <span>·</span>
        <span><b className="text-foreground">{stats.required}</b> required</span>
        <span>·</span>
        <span>
          <b className="text-brand-violet">{stats.refs}</b> references
        </span>
        <span>·</span>
        <span>max depth <b className="text-foreground">{stats.maxDepth}</b></span>
      </div>
    </div>
  );
}
