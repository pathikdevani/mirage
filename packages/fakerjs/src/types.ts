export type ParamKind =
  | 'integer'
  | 'number'
  | 'string'
  | 'boolean'
  | 'enum'
  | 'date'
  | 'array'
  | 'regex';

export interface Param {
  readonly name: string;
  readonly kind: ParamKind;
  readonly label: string;
  readonly hint?: string;
  readonly default?: unknown;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface MethodEntry {
  readonly shape: 'none' | 'options' | 'positional';
  readonly params: readonly Param[];
}

export type FakerCatalog = Readonly<Record<string, MethodEntry>>;
