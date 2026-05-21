import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Schema, SchemaProp } from './lib/types.js';
import { useSchemaBuffer } from './EditPane/useSchemaBuffer.js';
import { EditPane } from './EditPane/EditPane.js';
import { SchemaSidePanel } from './SchemaSidePanel/SchemaSidePanel.js';

const SIDE_PANEL_WIDTH_KEY = 'mirage:schema-side-panel-width';
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 320;

function readStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(SIDE_PANEL_WIDTH_KEY);
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
}

export interface SchemaEditorShellProps {
  schema: Schema;
  workspaceSchemas: Schema[];
  wsId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onDeleted?: () => void;
  onSelectReferrer?: (key: string) => void;
}

export function SchemaEditorShell({
  schema,
  workspaceSchemas,
  wsId,
  onDirtyChange,
  onDeleted,
  onSelectReferrer,
}: SchemaEditorShellProps) {
  const buffer = useSchemaBuffer(schema);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const selectedProp = useMemo(
    () => (selectedPath ? buffer.getByPath(selectedPath) : null),
    [selectedPath, buffer],
  );

  useEffect(() => {
    if (selectedPath && !selectedProp) setSelectedPath(null);
  }, [selectedPath, selectedProp]);

  const handlePropChange = (next: SchemaProp): void => {
    if (!selectedPath || !selectedProp) return;
    const prevName = selectedProp.name;
    buffer.updateByPath(selectedPath, () => next);
    if (next.name !== prevName) {
      const idx = selectedPath.lastIndexOf('.');
      const parent = idx >= 0 ? selectedPath.slice(0, idx) : '';
      setSelectedPath(parent ? `${parent}.${next.name}` : next.name);
    }
  };

  const handleDuplicate = (): void => {
    if (!selectedPath) return;
    const newPath = buffer.duplicateByPath(selectedPath);
    if (newPath) setSelectedPath(newPath);
  };

  const handleRemove = (): void => {
    if (!selectedPath) return;
    buffer.removeByPath(selectedPath);
    setSelectedPath(null);
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sideWidth, setSideWidth] = useState<number>(() => readStoredWidth());
  const [dragging, setDragging] = useState(false);

  const startDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent): void => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, rect.right - e.clientX));
      setSideWidth(next);
    };
    const onUp = (): void => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [dragging]);

  useEffect(() => {
    if (dragging) return;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDE_PANEL_WIDTH_KEY, String(sideWidth));
  }, [dragging, sideWidth]);

  return (
    <div
      ref={containerRef}
      className="grid min-h-0 flex-1"
      style={{ gridTemplateColumns: `1fr 6px ${sideWidth}px` }}
    >
      <div className="min-h-0">
        <EditPane
          schema={schema}
          buffer={buffer}
          workspaceSchemas={workspaceSchemas}
          wsId={wsId}
          selectedPath={selectedPath}
          onSelectPath={setSelectedPath}
          onDirtyChange={onDirtyChange}
          onDeleted={onDeleted}
          onSelectReferrer={onSelectReferrer}
        />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={startDrag}
        className={
          'group relative cursor-col-resize select-none ' +
          (dragging ? 'bg-brand-violet/40' : 'hover:bg-brand-violet/30')
        }
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-brand-violet/60" />
      </div>
      <SchemaSidePanel
        wsId={wsId}
        draft={buffer.draft}
        workspaceSchemas={workspaceSchemas}
        selectedProp={selectedProp}
        onPropChange={handlePropChange}
        onDuplicate={handleDuplicate}
        onRemove={handleRemove}
        onClearSelection={() => setSelectedPath(null)}
      />
    </div>
  );
}
