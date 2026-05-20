import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bff } from '../../../../api/client.js';
import {
  KEY_RE,
  type BrandColor,
  type CreateSetBody,
  type MirageSet,
  type SetSchemaInclusion,
} from '../lib/types.js';
import { makeSetServerErrorHandler, type ServerError } from '../lib/mapServerError.js';
import { SheetShell } from './SheetShell.js';
import { Step1Details, deriveKey, type AvailabilityState } from './Step1Details.js';
import { Step2Schemas } from './Step2Schemas.js';
import { Step3Review } from './Step3Review.js';
import type { Api } from '@mirage/types';

type Schema = Api.components['schemas']['Schema'];

interface Props {
  wsId: string;
  workspaceName: string;
  onClose: () => void;
  onCreated: (set: MirageSet) => void;
}

export function CreateSetSheet({ wsId, workspaceName, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [schemaSetKey, setSchemaSetKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<BrandColor>('cyan');
  const [icon, setIcon] = useState('box');
  const [tagsInput, setTagsInput] = useState('');
  const [salt, setSalt] = useState('mirage-' + Math.random().toString(36).slice(2, 10));
  const [inclusions, setInclusions] = useState<SetSchemaInclusion[]>([]);
  const [availability, setAvailability] = useState<AvailabilityState>('idle');
  const [nameError, setNameError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [schemasError, setSchemasError] = useState<string | null>(null);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [strategiesError, setStrategiesError] = useState<string | null>(null);
  const [genericBanner, setGenericBanner] = useState<string | null>(null);
  const [showEmptyError, setShowEmptyError] = useState(false);

  const workspaceSchemas = useQuery({
    queryKey: ['schemas', wsId],
    queryFn: async (): Promise<Schema[]> => {
      const { data, error } = await bff.GET('/workspaces/{wsId}/schemas', {
        params: { path: { wsId } },
      });
      if (error) throw error;
      return (data ?? []) as Schema[];
    },
  });

  useEffect(() => {
    if (!keyTouched && name) setSchemaSetKey(deriveKey(name));
  }, [name, keyTouched]);

  useEffect(() => {
    if (!schemaSetKey) {
      setAvailability('idle');
      return;
    }
    if (!KEY_RE.test(schemaSetKey)) {
      setAvailability('invalid');
      return;
    }
    setAvailability('checking');
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await bff.GET('/workspaces/{wsId}/sets', {
          params: { path: { wsId } },
        });
        if (error) throw error;
        if ((data ?? []).some((s) => s.key === schemaSetKey)) setAvailability('taken');
        else setAvailability('available');
      } catch {
        setAvailability('idle');
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [schemaSetKey, wsId]);

  const create = useMutation({
    mutationFn: async (body: CreateSetBody): Promise<MirageSet> => {
      const { data, error } = await bff.POST('/workspaces/{wsId}/sets', {
        params: { path: { wsId } },
        body,
      });
      if (error) throw error as ServerError;
      if (!data) throw new Error('Empty response');
      return data;
    },
    onSuccess: async (s) => {
      await queryClient.invalidateQueries({ queryKey: ['sets', wsId] });
      onCreated(s);
    },
    onError: makeSetServerErrorHandler({
      setNameError,
      setKeyError,
      setSchemasError,
      setOutputError,
      setStrategiesError,
      setGenericBanner,
      setStep,
    }),
  });

  const isDirty = useMemo(
    () => Boolean(name || schemaSetKey || description || tagsInput || inclusions.length > 0),
    [name, schemaSetKey, description, tagsInput, inclusions],
  );

  const step1CanContinue =
    name.trim().length > 0 &&
    KEY_RE.test(schemaSetKey) &&
    (availability === 'available' || availability === 'idle') &&
    salt.length > 0;
  const step2CanContinue = inclusions.length > 0;

  const goNext = (): void => {
    if (step === 1 && step1CanContinue) {
      setStep(2);
      setNameError(null);
      setKeyError(null);
      return;
    }
    if (step === 2) {
      if (inclusions.length === 0) {
        setShowEmptyError(true);
        return;
      }
      setStep(3);
      setSchemasError(null);
      return;
    }
    if (step === 3) submit();
  };

  const submit = (): void => {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const body: CreateSetBody = {
      key: schemaSetKey,
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      color,
      icon,
      tags,
      salt,
      schemas: inclusions,
      strategies: [],
      output: { format: 'json', locale: 'en_US', workerPool: 4 },
    };
    create.mutate(body);
  };

  return (
    <SheetShell
      step={step}
      workspaceName={workspaceName}
      isDirty={isDirty}
      onClose={onClose}
      status={`Step ${step} of 3`}
      primaryLabel={step === 3 ? 'Create set' : 'Continue'}
      primaryDisabled={step === 1 ? !step1CanContinue : step === 2 ? !step2CanContinue : false}
      primaryLoading={create.isPending}
      {...(step > 1 ? { onBack: () => setStep((s) => (s - 1) as 1 | 2 | 3) } : {})}
      onPrimary={goNext}
    >
      {step === 1 && (
        <Step1Details
          name={name}
          setName={setName}
          schemaSetKey={schemaSetKey}
          setKey={setSchemaSetKey}
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
          salt={salt}
          setSalt={setSalt}
          availability={availability}
          {...(nameError ? { nameError } : {})}
          {...(keyError ? { keyError } : {})}
        />
      )}
      {step === 2 && (
        <Step2Schemas
          workspaceSchemas={workspaceSchemas.data ?? []}
          inclusions={inclusions}
          setInclusions={setInclusions}
          {...(schemasError ? { error: schemasError } : {})}
          showEmptyError={showEmptyError}
        />
      )}
      {step === 3 && (
        <Step3Review
          name={name}
          setKey={schemaSetKey}
          description={description}
          color={color}
          icon={icon}
          tagsInput={tagsInput}
          salt={salt}
          inclusions={inclusions}
        />
      )}
      {genericBanner && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {genericBanner}
        </div>
      )}
      {strategiesError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {strategiesError}
        </div>
      )}
      {outputError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {outputError}
        </div>
      )}
    </SheetShell>
  );
}
