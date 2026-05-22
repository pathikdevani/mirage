import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { Api } from '@mirage/types';
import { bff } from '../../../../api/client.js';
import type { Schema, SchemaProp } from '../lib/types.js';
import { validateTree, type ValidationIssue } from '../lib/validateTree.js';
import { PropertyEditorRow, makeProp } from './PropertyEditorRow.js';
import { SegmentEditorProvider, type RefField } from './SegmentEditor.js';

type CustomFunction = Api.components['schemas']['CustomFunction'];

export interface PropertyEditorProps {
  rows: SchemaProp[];
  setRows: (rows: SchemaProp[]) => void;
  availableKeys: ReadonlySet<string>;
  workspaceSchemas: Schema[];
  rowErrors: ReadonlyMap<string, ValidationIssue>;
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
}

export function PropertyEditor({
  rows,
  setRows,
  availableKeys,
  workspaceSchemas,
  rowErrors,
  selectedPath,
  onSelectPath,
}: PropertyEditorProps) {
  const liveIssues = useMemo(() => validateTree(rows, availableKeys), [rows, availableKeys]);
  const liveByPath = useMemo(() => {
    const m = new Map<string, ValidationIssue>();
    for (const i of liveIssues) if (!m.has(i.path)) m.set(i.path, i);
    return m;
  }, [liveIssues]);

  // Fetch custom functions once at the editor root so every nested
  // SegmentEditor (cell + each arg field) can list them without refetching.
  const { wsId } = useParams<{ wsId: string }>();
  const customFunctionsQ = useQuery({
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

  return (
    <SegmentEditorProvider
      workspaceSchemas={workspaceSchemas}
      customFunctions={customFunctionsQ.data ?? []}
    >
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="grid grid-cols-[20px_20px_minmax(140px,1fr)_140px_minmax(140px,1fr)_60px_28px] items-center gap-2 border-b border-border bg-muted px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span />
        <span />
        <span>Name</span>
        <span>Type</span>
        <span>Faker / $ref</span>
        <span className="text-center">Req</span>
        <span />
      </div>
      <NestedBuilder
        rows={rows}
        setRows={setRows}
        depth={0}
        parentKind="root"
        workspaceSchemas={workspaceSchemas}
        rowErrors={rowErrors}
        liveByPath={liveByPath}
        basePath=""
        selectedPath={selectedPath}
        onSelectPath={onSelectPath}
      />
    </div>
    </SegmentEditorProvider>
  );
}

interface NestedBuilderProps {
  rows: SchemaProp[];
  setRows: (rows: SchemaProp[]) => void;
  depth: number;
  parentKind: 'root' | 'object' | 'array';
  workspaceSchemas: Schema[];
  rowErrors: ReadonlyMap<string, ValidationIssue>;
  liveByPath: ReadonlyMap<string, ValidationIssue>;
  basePath: string;
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
}

function NestedBuilder(props: NestedBuilderProps) {
  const {
    rows,
    setRows,
    depth,
    parentKind,
    workspaceSchemas,
    rowErrors,
    liveByPath,
    basePath,
    selectedPath,
    onSelectPath,
  } = props;
  const allSiblings = useMemo<RefField[]>(
    () =>
      rows
        .filter((r) => r.type !== 'object' && r.type !== 'array' && r.name)
        .map((r) => ({ name: r.name, type: r.type })),
    [rows],
  );

  const updateRow = (
    idx: number,
    patch: Partial<SchemaProp> | ((r: SchemaProp) => SchemaProp),
  ): void => {
    const next = rows.map((r, i) => {
      if (i !== idx) return r;
      return typeof patch === 'function' ? patch(r) : { ...r, ...patch };
    });
    setRows(next);
  };
  const removeRow = (idx: number): void => {
    setRows(rows.filter((_, i) => i !== idx));
  };
  const addRow = (): void => {
    setRows([...rows, makeProp('newField', 'string')]);
  };

  return (
    <>
      {rows.map((row, idx) => {
        const isArrayItem = parentKind === 'array';
        const path = isArrayItem
          ? `${basePath}[]`
          : basePath
            ? `${basePath}.${row.name}`
            : row.name;
        const persistedErr = rowErrors.get(path);
        const liveErr = liveByPath.get(path);
        const err = persistedErr ?? liveErr;
        return (
          <PropertyEditorRow
            key={idx}
            row={row}
            depth={depth}
            isArrayItem={isArrayItem}
            workspaceSchemas={workspaceSchemas}
            updateRow={(patch) => updateRow(idx, patch)}
            removeRow={() => removeRow(idx)}
            selected={path === selectedPath}
            onSelect={() => onSelectPath(path)}
            siblingFields={allSiblings}
            {...(err ? { error: err } : {})}
            errorChildren={(() => {
              if (row.type === 'object') {
                return (
                  <NestedBuilder
                    rows={row.fields ?? []}
                    setRows={(nf) => updateRow(idx, { fields: nf })}
                    depth={depth + 1}
                    parentKind="object"
                    workspaceSchemas={workspaceSchemas}
                    rowErrors={rowErrors}
                    liveByPath={liveByPath}
                    basePath={path}
                    selectedPath={selectedPath}
                    onSelectPath={onSelectPath}
                  />
                );
              }
              if (row.type === 'array' && row.items) {
                return (
                  <NestedBuilder
                    rows={[row.items]}
                    setRows={([newItem]) => {
                      if (newItem) updateRow(idx, { items: newItem });
                    }}
                    depth={depth + 1}
                    parentKind="array"
                    workspaceSchemas={workspaceSchemas}
                    rowErrors={rowErrors}
                    liveByPath={liveByPath}
                    basePath={path}
                    selectedPath={selectedPath}
                    onSelectPath={onSelectPath}
                  />
                );
              }
              return null;
            })()}
          />
        );
      })}
      {parentKind !== 'array' && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 border-t border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          style={{ paddingLeft: 32 + depth * 20 }}
        >
          <Plus size={12} strokeWidth={2} />
          Add {depth === 0 ? 'property' : 'field'}
        </button>
      )}
    </>
  );
}
