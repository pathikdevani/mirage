import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Api } from '@mirage/types';
import { bff } from '../../../../api/client.js';
import type { Schema } from '../lib/types.js';
import { useDebouncedValue } from './useDebouncedValue.js';

type DryRunResponse = Api.components['schemas']['DryRunSchemaResponse'];

export interface DryRunState {
  data: DryRunResponse | null;
  isLoading: boolean;
  error: string | null;
  validationError: string | null;
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
        const msg = typeof (error as { error?: string }).error === 'string'
          ? (error as { error: string }).error
          : `Preview failed (${response?.status ?? 'unknown'})`;
        const e = new Error(msg) as Error & { status?: number };
        e.status = response?.status;
        throw e;
      }
      return data!;
    },
    retry: false,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

  const err = query.error as (Error & { status?: number }) | null;
  return {
    data: query.data ?? null,
    isLoading: query.isFetching,
    error: err && err.status !== 422 ? err.message : null,
    validationError: err && err.status === 422 ? err.message : null,
  };
}
