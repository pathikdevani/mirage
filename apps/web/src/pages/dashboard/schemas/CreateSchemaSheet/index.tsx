import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bff } from '../../../../api/client.js';
import type {
  BrandColor,
  CreateSchemaBody,
  IconName,
  Schema,
  SchemaProp,
} from '../lib/types.js';
import { KEY_RE } from '../lib/types.js';
import { validateTree, type ValidationIssue } from '../lib/validateTree.js';
import { SheetShell } from './SheetShell.js';
import { Step1Details, deriveKey, type AvailabilityState } from './Step1Details.js';
import { Step2Builder } from './Step2Builder.js';
import { Step3Review } from './Step3Review.js';

interface CreateSchemaSheetProps {
  wsId: string;
  workspaceName: string;
  workspaceSchemas: Schema[];
  onClose: () => void;
  onCreated: (schema: Schema) => void;
}

interface ServerError {
  error?: string;
  code?: string;
  detail?: unknown;
}

export function CreateSchemaSheet({
  wsId,
  workspaceName,
  workspaceSchemas,
  onClose,
  onCreated,
}: CreateSchemaSheetProps) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [schemaKey, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<BrandColor>('violet');
  const [icon, setIcon] = useState<IconName>('database');
  const [tagsInput, setTagsInput] = useState('');
  const [rows, setRows] = useState<SchemaProp[]>([]);

  // Server error state
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [keyError, setKeyError] = useState<string | undefined>(undefined);
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, ValidationIssue>>(new Map());
  const [cycleBanner, setCycleBanner] = useState<string | null>(null);
  const [showEmptyError, setShowEmptyError] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);

  const availableKeys = useMemo(
    () => new Set(workspaceSchemas.map((s) => s.key)),
    [workspaceSchemas],
  );

  const isDirty = Boolean(
    name || schemaKey || description || tagsInput || rows.length > 0,
  );

  // Live key availability check
  const [availability, setAvailability] = useState<AvailabilityState>('idle');
  useEffect(() => {
    if (!schemaKey) {
      setAvailability('idle');
      return;
    }
    if (!KEY_RE.test(schemaKey)) {
      setAvailability('invalid');
      return;
    }
    setAvailability('checking');
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await bff.GET('/workspaces/{wsId}/schemas', {
          params: { path: { wsId }, query: { key: schemaKey } },
        });
        if (error) throw error;
        if ((data ?? []).length > 0) setAvailability('taken');
        else setAvailability('available');
      } catch {
        setAvailability('idle');
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [schemaKey, wsId]);

  const create = useMutation({
    mutationFn: async (body: CreateSchemaBody): Promise<Schema> => {
      const { data, error } = await bff.POST('/workspaces/{wsId}/schemas', {
        params: { path: { wsId } },
        body,
      });
      if (error) throw error as ServerError;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: async (schema) => {
      await queryClient.invalidateQueries({ queryKey: ['schemas', wsId] });
      onCreated(schema);
    },
    onError: (err: ServerError) => {
      mapServerError(err);
    },
  });

  const mapServerError = (err: ServerError): void => {
    const code = err?.code;
    setGenericError(null);
    if (code === 'name_required') {
      setNameError(err.error ?? 'Name is required');
      setStep(1);
      return;
    }
    if (code === 'key_invalid') {
      setKeyError(err.error ?? 'Key is invalid');
      setStep(1);
      return;
    }
    if (code === 'key_taken') {
      setAvailability('taken');
      setStep(1);
      return;
    }
    if (code === 'properties_empty') {
      setShowEmptyError(true);
      setStep(2);
      return;
    }
    if (code === 'property_name_invalid') {
      const path = detailString(err.detail, 'name');
      if (path) setRowErrors(new Map([[path, { kind: 'name_invalid', path }]]));
      setStep(2);
      return;
    }
    if (code === 'property_name_duplicate') {
      const sibling = detailString(err.detail, 'name') ?? '';
      if (sibling) setRowErrors(new Map([[sibling, { kind: 'name_duplicate', path: sibling, sibling }]]));
      setStep(2);
      return;
    }
    if (code === 'ref_target_missing') {
      const path = detailString(err.detail, 'path');
      const targetKey = detailString(err.detail, 'targetKey') ?? '';
      if (path) setRowErrors(new Map([[path, { kind: 'ref_target_missing', path, targetKey }]]));
      setStep(2);
      return;
    }
    if (code === 'cycle_detected') {
      const cycle = (err.detail as { cycle?: string[] } | undefined)?.cycle;
      setCycleBanner(
        cycle?.length
          ? `Cycle detected: ${cycle.join(' → ')}`
          : 'A reference cycle was detected.',
      );
      setStep(2);
      return;
    }
    setGenericError(err.error ?? 'Something went wrong creating the schema.');
  };

  // Step 1 validation
  const step1CanContinue =
    name.trim().length > 0 &&
    KEY_RE.test(schemaKey) &&
    (availability === 'available' || availability === 'idle');

  // Step 2 validation
  const liveIssues = useMemo(
    () => validateTree(rows, availableKeys),
    [rows, availableKeys],
  );
  const step2CanContinue = rows.length > 0 && liveIssues.length === 0;

  const goNext = (): void => {
    if (step === 1 && step1CanContinue) {
      setStep(2);
      setNameError(undefined);
      setKeyError(undefined);
      return;
    }
    if (step === 2) {
      if (rows.length === 0) {
        setShowEmptyError(true);
        return;
      }
      if (!step2CanContinue) return;
      setStep(3);
      setCycleBanner(null);
      setRowErrors(new Map());
      return;
    }
    if (step === 3) {
      submit();
    }
  };

  const submit = (): void => {
    setRowErrors(new Map());
    setCycleBanner(null);
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const body: CreateSchemaBody = {
      key: schemaKey,
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      color,
      icon,
      tags,
      properties: rows,
    };
    create.mutate(body);
  };

  const primaryLabel =
    step === 1 ? 'Continue' : step === 2 ? 'Continue' : 'Create schema';
  const primaryDisabled =
    step === 1 ? !step1CanContinue : step === 2 ? !step2CanContinue : false;
  const status = `Step ${step} of 3`;

  // Sync derived key on name blur — handled inside Step1, but if user has not
  // touched the key yet, mirror it as they type so the preview card looks live.
  useEffect(() => {
    if (!keyTouched && name) setKey(deriveKey(name));
  }, [name, keyTouched]);

  return (
    <SheetShell
      step={step}
      workspaceName={workspaceName}
      isDirty={isDirty}
      onClose={onClose}
      status={status}
      primaryLabel={primaryLabel}
      primaryDisabled={primaryDisabled}
      primaryLoading={create.isPending}
      {...(step > 1 ? { onBack: () => setStep((s) => (s - 1) as 1 | 2 | 3) } : {})}
      onPrimary={goNext}
    >
      {step === 1 && (
        <Step1Details
          name={name}
          setName={setName}
          schemaKey={schemaKey}
          setKey={setKey}
          keyTouched={keyTouched}
          setKeyTouched={setKeyTouched}
          description={description}
          setDescription={setDescription}
          color={color}
          setColor={setColor}
          icon={icon}
          setIcon={setIcon}
          tagsInput={tagsInput}
          setTagsInput={setTagsInput}
          availability={availability}
          {...(nameError ? { nameError } : {})}
          {...(keyError ? { keyError } : {})}
        />
      )}
      {step === 2 && (
        <Step2Builder
          rows={rows}
          setRows={setRows}
          availableKeys={availableKeys}
          workspaceSchemas={workspaceSchemas}
          cycleBanner={cycleBanner}
          rowErrors={rowErrors}
          showEmptyError={showEmptyError}
        />
      )}
      {step === 3 && (
        <Step3Review
          name={name}
          schemaKey={schemaKey}
          description={description}
          color={color}
          icon={icon}
          tagsInput={tagsInput}
          rows={rows}
        />
      )}
      {genericError && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {genericError}
        </div>
      )}
    </SheetShell>
  );
}

function detailString(detail: unknown, key: string): string | undefined {
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const v = (detail as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
  }
  return undefined;
}
