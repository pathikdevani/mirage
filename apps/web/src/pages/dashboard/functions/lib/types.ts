import type { Api } from '@mirage/types';

export type CustomFunction = Api.components['schemas']['CustomFunction'];
export type CreateCustomFunctionBody = Api.components['schemas']['CreateCustomFunctionBody'];
export type UpdateCustomFunctionBody = Api.components['schemas']['UpdateCustomFunctionBody'];

export const NAME_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$/;
export const USAGES = ['valueGenerator', 'strategy', 'both'] as const;
export type Usage = (typeof USAGES)[number];

export const USAGE_LABEL: Record<Usage, string> = {
  valueGenerator: 'Value generator',
  strategy: 'Strategy',
  both: 'Both',
};
