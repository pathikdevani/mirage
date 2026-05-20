import type { Api } from '@mirage/types';

export type MirageSet = Api.components['schemas']['Set'];
export type Strategy = Api.components['schemas']['Strategy'];
export type StrategyOverride = Api.components['schemas']['StrategyOverride'];
export type SetSchemaInclusion = Api.components['schemas']['SetSchemaInclusion'];
export type SetOutputConfig = Api.components['schemas']['SetOutputConfig'];
export type SetEdge = Api.components['schemas']['SetEdge'];
export type CreateSetBody = Api.components['schemas']['CreateSetBody'];
export type UpdateSetBody = Api.components['schemas']['UpdateSetBody'];

export type BrandColor = MirageSet['color'];

export const KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;

export const STRATEGY_TYPES = ['1:1', 'random', 'evenSplit'] as const;
export type StrategyType = (typeof STRATEGY_TYPES)[number];

export const OUTPUT_FORMATS = ['json', 'ndjson', 'csv', 'sql', 'parquet'] as const;
