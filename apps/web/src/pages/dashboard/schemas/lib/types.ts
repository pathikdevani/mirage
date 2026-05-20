import type { Api } from '@mirage/types';

export type Schema = Api.components['schemas']['Schema'];
export type SchemaProp = Api.components['schemas']['SchemaProp'];
export type CreateSchemaBody = Api.components['schemas']['CreateSchemaBody'];

export type BrandColor = Schema['color'];

export const BRAND_COLORS: BrandColor[] = ['violet', 'cyan', 'emerald', 'amber', 'rose', 'slate'];

export const ICON_NAMES = [
  'home',
  'briefcase',
  'mail',
  'phone',
  'id-card',
  'globe',
  'tag',
  'package',
  'key',
  'database',
  'user',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const FAKER_GROUPS: ReadonlyArray<{ ns: string; methods: readonly string[] }> = [
  {
    ns: 'person',
    methods: ['firstName', 'lastName', 'fullName', 'sex', 'jobTitle', 'middleName', 'bio'],
  },
  {
    ns: 'internet',
    methods: ['email', 'url', 'ipv4', 'userAgent', 'mac', 'domainName', 'username'],
  },
  { ns: 'string', methods: ['uuid', 'numeric', 'alpha', 'alphanumeric', 'nanoid', 'hexadecimal'] },
  { ns: 'phone', methods: ['number', 'imei'] },
  { ns: 'date', methods: ['past', 'future', 'birthdate', 'recent', 'soon', 'between'] },
  {
    ns: 'location',
    methods: ['city', 'country', 'streetAddress', 'zipCode', 'latitude', 'longitude'],
  },
  { ns: 'helpers', methods: ['arrayElement', 'slugify', 'replaceSymbols', 'fromRegExp'] },
  { ns: 'finance', methods: ['accountNumber', 'iban', 'currency', 'amount', 'creditCardNumber'] },
  { ns: 'datatype', methods: ['boolean', 'json'] },
  { ns: 'lorem', methods: ['word', 'words', 'sentence', 'paragraph'] },
];

/** The 9 type/format combinations used in the type selector. */
export type TypeOption =
  | { type: 'string'; format?: 'uuid' | 'email' | 'date' | 'date-time' }
  | { type: 'number' }
  | { type: 'integer' }
  | { type: 'boolean' }
  | { type: 'object' }
  | { type: 'array' };

export const TYPE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  type: SchemaProp['type'];
  format?: SchemaProp['format'];
}> = [
  { value: 'string', label: 'string', type: 'string' },
  { value: 'string|uuid', label: 'string · uuid', type: 'string', format: 'uuid' },
  { value: 'string|email', label: 'string · email', type: 'string', format: 'email' },
  { value: 'string|date', label: 'string · date', type: 'string', format: 'date' },
  { value: 'string|date-time', label: 'string · date-time', type: 'string', format: 'date-time' },
  { value: 'number', label: 'number', type: 'number' },
  { value: 'integer', label: 'integer', type: 'integer' },
  { value: 'boolean', label: 'boolean', type: 'boolean' },
  { value: 'object', label: 'object {}', type: 'object' },
  { value: 'array', label: 'array []', type: 'array' },
];

export const PROP_NAME_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]{0,63}$/;
export const KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;
export const REF_PREFIX = '$ref:';
export const FN_PREFIX = '$fn:';
