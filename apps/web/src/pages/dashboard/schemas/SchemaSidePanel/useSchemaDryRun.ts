import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Api } from '@mirage/types';
import { bff } from '../../../../api/client.js';
import type { Schema } from '../lib/types.js';
import { useDebouncedValue } from './useDebouncedValue.js';

type DryRunResponse = Api.components['schemas']['DryRunSchemaResponse'];

export interface PreviewError {
  status: number | undefined;
  /** Server-supplied `code` (e.g. `preview_failed`, validation codes). */
  code: string | undefined;
  /** Server-supplied human message, or a generic fallback. */
  message: string;
  /** Server-supplied structured detail, untouched. */
  detail: unknown;
  /** When the engine throws, this is parsed out of `detail` for easy rendering. */
  engine: EngineErrorDetail | null;
}

export interface EngineErrorDetail {
  code: string;
  fieldPath?: string;
  cycle?: string[];
  /** Any other engine detail keys we didn't pull up. */
  rest: Record<string, unknown>;
}

export interface DryRunState {
  data: DryRunResponse | null;
  isLoading: boolean;
  /** Non-422 errors (engine, network, 5xx). */
  error: PreviewError | null;
  /** 422 schema-validation errors. */
  validationError: PreviewError | null;
}

function toDraftBody(draft: Schema): Api.components['schemas']['CreateSchemaBody'] {
  return {
    key: draft.key,
    name: draft.name,
    ...(draft.description ? { description: draft.description } : {}),
    color: draft.color,
    icon: draft.icon,
    tags: draft.tags ?? [],
    properties: draft.properties ?? [],
  } as Api.components['schemas']['CreateSchemaBody'];
}

interface RawErrorBody {
  error?: unknown;
  code?: unknown;
  message?: unknown;
  detail?: unknown;
}

function parseEngineDetail(detail: unknown): EngineErrorDetail | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  const engineCode = d['engineCode'];
  if (typeof engineCode !== 'string') return null;
  const engineDetail = d['engineDetail'];
  const inner =
    engineDetail && typeof engineDetail === 'object'
      ? (engineDetail as Record<string, unknown>)
      : {};
  const { fieldPath, cycle, ...rest } = inner;
  return {
    code: engineCode,
    ...(typeof fieldPath === 'string' ? { fieldPath } : {}),
    ...(Array.isArray(cycle) && cycle.every((c) => typeof c === 'string')
      ? { cycle: cycle as string[] }
      : {}),
    rest,
  };
}

function toPreviewError(body: unknown, status: number | undefined, fallback: string): PreviewError {
  const b = (body ?? {}) as RawErrorBody;
  const message =
    typeof b.error === 'string'
      ? b.error
      : typeof b.message === 'string'
        ? b.message
        : fallback;
  return {
    status,
    code: typeof b.code === 'string' ? b.code : undefined,
    message,
    detail: b.detail,
    engine: parseEngineDetail(b.detail),
  };
}

export function useSchemaDryRun(wsId: string, draft: Schema, count: number): DryRunState {
  const debouncedDraft = useDebouncedValue(draft, 400);
  const debouncedCount = useDebouncedValue(count, 200);

  const draftKey = useMemo(() => JSON.stringify(toDraftBody(debouncedDraft)), [debouncedDraft]);

  const query = useQuery({
    queryKey: ['schema-dry-run', wsId, debouncedDraft.id, draftKey, debouncedCount],
    queryFn: async (): Promise<DryRunResponse> => {
      const { data, error, response } = await bff.POST('/workspaces/{wsId}/schemas/dry-run', {
        params: {
          path: { wsId },
          query: { count: debouncedCount },
        },
        body: {
          schema: toDraftBody(debouncedDraft),
        },
      });
      if (error) {
        const status = response?.status;
        const previewError = toPreviewError(
          error,
          status,
          `Preview failed (${status ?? 'unknown'})`,
        );
        const e = new Error(previewError.message) as Error & { previewError?: PreviewError };
        e.previewError = previewError;
        throw e;
      }
      return data!;
    },
    retry: false,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

  const queryErr = query.error as (Error & { previewError?: PreviewError }) | null;
  const previewError = queryErr?.previewError ?? null;
  return {
    data: query.data ?? null,
    isLoading: query.isFetching,
    error: previewError && previewError.status !== 422 ? previewError : null,
    validationError: previewError && previewError.status === 422 ? previewError : null,
  };
}
