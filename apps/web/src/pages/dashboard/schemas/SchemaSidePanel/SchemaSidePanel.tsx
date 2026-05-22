import { useEffect, useState } from 'react';
import { cn } from '@mirage/ui-kit';
import type { Schema, SchemaProp } from '../lib/types.js';
import { PreviewTabContent } from './PreviewTabContent.js';
import { EditTabContent } from './EditTabContent.js';
import { JsonTabContent } from './JsonTabContent.js';
import { useSchemaDryRun } from './useSchemaDryRun.js';

type Tab = 'preview' | 'edit' | 'json';

export interface SchemaSidePanelProps {
  wsId: string;
  draft: Schema;
  workspaceSchemas: Schema[];
  selectedProp: SchemaProp | null;
  onPropChange: (next: SchemaProp) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClearSelection: () => void;
}

export function SchemaSidePanel({
  wsId,
  draft,
  workspaceSchemas,
  selectedProp,
  onPropChange,
  onDuplicate,
  onRemove,
  onClearSelection,
}: SchemaSidePanelProps) {
  const [tab, setTab] = useState<Tab>('preview');
  const [count, setCount] = useState(1);

  // Auto-switch to Edit when a property is selected; back to Preview when cleared.
  // Don't override the JSON tab — the user explicitly picked it.
  useEffect(() => {
    if (selectedProp) setTab('edit');
    else setTab((prev) => (prev === 'json' ? prev : 'preview'));
  }, [selectedProp]);

  const dry = useSchemaDryRun(wsId, draft, count);

  return (
    <aside className="flex h-full min-w-0 flex-col bg-card">
      <div className="flex h-12 flex-none items-center gap-1 border-b border-border px-3">
        <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
          Preview
        </TabButton>
        <TabButton
          active={tab === 'edit'}
          disabled={!selectedProp}
          onClick={() => selectedProp && setTab('edit')}
        >
          Edit property
        </TabButton>
        <TabButton active={tab === 'json'} onClick={() => setTab('json')}>
          JSON
        </TabButton>
      </div>

      <div className="min-h-0 min-w-0 flex-1">
        {tab === 'preview' && (
          <PreviewTabContent
            draft={draft}
            count={count}
            onCountChange={setCount}
            data={dry.data}
            isLoading={dry.isLoading}
            error={dry.error}
            validationError={dry.validationError}
          />
        )}
        {tab === 'edit' && selectedProp && (
          <EditTabContent
            prop={selectedProp}
            workspaceSchemas={workspaceSchemas}
            onChange={onPropChange}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
            onBack={onClearSelection}
          />
        )}
        {tab === 'json' && <JsonTabContent draft={draft} />}
      </div>
    </aside>
  );
}

interface TabButtonProps {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, disabled, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-8 rounded-md px-3 text-[12.5px] font-medium transition-colors',
        active
          ? 'bg-accent text-foreground'
          : disabled
            ? 'text-muted-foreground/40'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
      )}
    >
      {children}
    </button>
  );
}
