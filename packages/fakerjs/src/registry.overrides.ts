/**
 * Hand-curated overrides for FAKER_REGISTRY.
 *
 * Merge-catalog reads this file and applies per-method, per-param patches on
 * top of the generated skeleton. Anything not patched here uses the skeleton
 * verbatim.
 *
 * Patch semantics:
 *  - Method-level patch object replaces the whole entry if it includes `shape`.
 *  - Otherwise, patches under `paramOverrides[paramName]` are merged onto the
 *    skeleton's matching param (shallow merge).
 *  - If a param name in `paramOverrides` is not present in the skeleton, it
 *    is appended.
 */

import type { MethodEntry, Param } from './types.js';

export interface ParamOverride extends Partial<Param> {
  readonly name?: string;
}

export interface MethodOverride extends Partial<MethodEntry> {
  readonly paramOverrides?: Readonly<Record<string, ParamOverride>>;
}

const REF_DATE: ParamOverride = {
  label: 'reference date',
  hint: 'leave blank for "now"',
  kind: 'date',
};
const SEX_ENUM: ParamOverride = {
  kind: 'enum',
  label: 'sex',
  options: ['', 'female', 'male'],
  default: '',
};

export const FAKER_OVERRIDES: Readonly<Record<string, MethodOverride>> = {
  // ============ airline ============
  'airline.flightNumber': {
    paramOverrides: {
      length: { kind: 'integer', label: 'length', default: 4, min: 1, max: 8 },
      leadingZeros: { kind: 'boolean', label: 'leading zeros', default: false },
      addLeadingZeros: { kind: 'boolean', label: 'add leading zeros', default: false },
    },
  },
  'airline.recordLocator': {
    paramOverrides: {
      allowNumerics: { kind: 'boolean', label: 'allow numerics', default: false },
      allowVisuallySimilarCharacters: { kind: 'boolean', label: 'allow O/0, I/1', default: false },
    },
  },
  'airline.seat': {
    paramOverrides: {
      aircraftType: {
        kind: 'enum',
        label: 'aircraft type',
        options: ['', 'regional', 'narrowbody', 'widebody'],
        default: '',
      },
    },
  },

  // ============ color ============
  'color.cmyk': {
    paramOverrides: {
      format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' },
    },
  },
  'color.colorByCSSColorSpace': {
    paramOverrides: {
      format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' },
      space: {
        kind: 'enum',
        options: ['sRGB', 'display-p3', 'rec2020', 'a98-rgb', 'prophoto-rgb'],
        default: 'sRGB',
      },
    },
  },
  'color.hsl': {
    paramOverrides: {
      format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' },
      includeAlpha: { kind: 'boolean', default: false },
    },
  },
  'color.hwb': {
    paramOverrides: {
      format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' },
    },
  },
  'color.lab': {
    paramOverrides: {
      format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' },
    },
  },
  'color.lch': {
    paramOverrides: {
      format: { kind: 'enum', options: ['decimal', 'css', 'binary'], default: 'decimal' },
    },
  },
  'color.rgb': {
    paramOverrides: {
      format: { kind: 'enum', options: ['hex', 'decimal', 'css', 'binary'], default: 'hex' },
      casing: { kind: 'enum', options: ['mixed', 'lower', 'upper'], default: 'mixed' },
      prefix: { default: '#' },
      includeAlpha: { default: false },
    },
  },

  // ============ commerce ============
  'commerce.isbn': {
    paramOverrides: {
      variant: { kind: 'enum', options: ['', '10', '13'], default: '' },
      separator: { default: '-' },
    },
  },
  'commerce.price': {
    paramOverrides: {
      min: { kind: 'number', default: 1 },
      max: { kind: 'number', default: 1000 },
      dec: { kind: 'integer', label: 'decimals', default: 2, min: 0, max: 12 },
      symbol: { kind: 'string' },
    },
  },

  // ============ datatype ============
  'datatype.boolean': {
    paramOverrides: {
      probability: {
        kind: 'number',
        label: 'probability of true',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
  },

  // ============ date ============
  'date.anytime': { paramOverrides: { refDate: REF_DATE } },
  'date.between': {
    paramOverrides: {
      from: { kind: 'date', default: '2020-01-01' },
      to: { kind: 'date', default: '2025-12-31' },
    },
  },
  'date.betweens': {
    paramOverrides: {
      from: { kind: 'date' },
      to: { kind: 'date' },
      count: { kind: 'integer', default: 3, min: 1 },
    },
  },
  'date.birthdate': {
    paramOverrides: {
      mode: { kind: 'enum', options: ['age', 'year'], default: 'age' },
      min: { kind: 'integer', default: 18, hint: 'age or year' },
      max: { kind: 'integer', default: 80, hint: 'age or year' },
      refDate: REF_DATE,
    },
  },
  'date.future': {
    paramOverrides: {
      years: { kind: 'number', default: 1, min: 0, step: 0.5 },
      refDate: REF_DATE,
    },
  },
  'date.month': {
    paramOverrides: {
      abbreviated: { kind: 'boolean', default: false },
      context: { kind: 'boolean', label: 'context-aware', default: false },
    },
  },
  'date.past': {
    paramOverrides: {
      years: { kind: 'number', default: 1, min: 0, step: 0.5 },
      refDate: REF_DATE,
    },
  },
  'date.recent': {
    paramOverrides: {
      days: { kind: 'number', default: 1, min: 0, step: 0.5 },
      refDate: REF_DATE,
    },
  },
  'date.soon': {
    paramOverrides: {
      days: { kind: 'number', default: 1, min: 0, step: 0.5 },
      refDate: REF_DATE,
    },
  },
  'date.weekday': {
    paramOverrides: {
      abbreviated: { kind: 'boolean', default: false },
      context: { kind: 'boolean', label: 'context-aware', default: false },
    },
  },

  // ============ finance ============
  'finance.accountNumber': {
    paramOverrides: { length: { kind: 'integer', default: 8, min: 1, max: 32 } },
  },
  'finance.amount': {
    paramOverrides: {
      min: { kind: 'number', default: 0 },
      max: { kind: 'number', default: 1000 },
      dec: { kind: 'integer', label: 'decimals', default: 2, min: 0, max: 12 },
      symbol: { default: '' },
      autoFormat: { kind: 'boolean', default: false },
    },
  },
  'finance.bic': { paramOverrides: { includeBranchCode: { kind: 'boolean', default: false } } },
  'finance.creditCardNumber': {
    paramOverrides: {
      issuer: {
        kind: 'enum',
        options: [
          '',
          'visa',
          'mastercard',
          'american_express',
          'discover',
          'diners_club',
          'jcb',
          'maestro',
        ],
        default: '',
      },
    },
  },
  'finance.iban': {
    paramOverrides: {
      formatted: { kind: 'boolean', default: false },
      countryCode: { hint: 'ISO-3166 alpha-2, e.g. "DE"' },
    },
  },
  'finance.maskedNumber': {
    paramOverrides: {
      length: { kind: 'integer', default: 4, min: 1 },
      parens: { kind: 'boolean', default: true },
      ellipsis: { kind: 'boolean', default: true },
    },
  },
  'finance.pin': { paramOverrides: { length: { kind: 'integer', default: 4, min: 1, max: 32 } } },

  // ============ git ============
  'git.commitDate': { paramOverrides: { refDate: REF_DATE } },
  'git.commitEntry': {
    paramOverrides: {
      merge: { kind: 'boolean' },
      eol: { kind: 'enum', options: ['CRLF', 'LF'], default: 'CRLF' },
      refDate: REF_DATE,
    },
  },
  'git.commitSha': { paramOverrides: { length: { kind: 'integer', default: 40, min: 7, max: 40 } } },

  // ============ helpers ============
  'helpers.arrayElement': {
    paramOverrides: {
      array: {
        kind: 'array',
        label: 'choices',
        default: ['option-a', 'option-b'],
        hint: 'one per line',
      },
    },
  },
  'helpers.arrayElements': {
    paramOverrides: {
      array: { kind: 'array', default: ['option-a', 'option-b', 'option-c'] },
      count: { kind: 'integer', hint: 'exact count, or leave blank for random' },
    },
  },
  'helpers.enumValue': {
    paramOverrides: {
      enum: { kind: 'array', label: 'enum members', default: ['ACTIVE', 'PAUSED', 'ARCHIVED'] },
    },
  },
  'helpers.fake': {
    paramOverrides: {
      pattern: {
        label: 'template',
        default: '{{person.firstName}} {{person.lastName}}',
        hint: '{{ns.method}} placeholders',
      },
    },
  },
  'helpers.fromRegExp': {
    paramOverrides: {
      pattern: { kind: 'regex', default: '[A-Z]{3}-[0-9]{4}', hint: 'JS regex source' },
    },
  },
  'helpers.maybe': {
    paramOverrides: {
      probability: { kind: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
    },
  },
  'helpers.multiple': { paramOverrides: { count: { kind: 'integer', default: 3, min: 1 } } },
  'helpers.mustache': {
    paramOverrides: {
      string: { label: 'template', default: 'Hello {{name}}', hint: 'mustache placeholders' },
      data: { label: 'data (JSON object)', hint: 'e.g. {"name":"World"}' },
    },
  },
  'helpers.objectEntry': {
    paramOverrides: { object: { label: 'object (JSON)', default: '{"a":1,"b":2}' } },
  },
  'helpers.objectKey': {
    paramOverrides: { object: { label: 'object (JSON)', default: '{"a":1,"b":2}' } },
  },
  'helpers.objectValue': {
    paramOverrides: { object: { label: 'object (JSON)', default: '{"a":1,"b":2}' } },
  },
  'helpers.rangeToNumber': {
    paramOverrides: {
      min: { kind: 'integer', default: 0 },
      max: { kind: 'integer', default: 10 },
    },
  },
  'helpers.replaceCreditCardSymbols': {
    paramOverrides: {
      string: { default: '6453-####-####-####-###L' },
      symbol: { default: '#' },
    },
  },
  'helpers.replaceSymbols': {
    paramOverrides: { string: { default: '###-???-###', hint: '# digit · ? letter · * either' } },
  },
  'helpers.shuffle': { paramOverrides: { array: { kind: 'array', default: ['a', 'b', 'c'] } } },
  'helpers.slugify': { paramOverrides: { string: { default: 'Hello World' } } },
  'helpers.uniqueArray': {
    paramOverrides: {
      source: { kind: 'array', default: ['a', 'b', 'c', 'd', 'e'] },
      length: { kind: 'integer', default: 3, min: 1 },
    },
  },
  'helpers.weightedArrayElement': {
    paramOverrides: {
      array: {
        label: 'weighted entries (JSON)',
        default: '[{"weight":5,"value":"a"},{"weight":1,"value":"b"}]',
        hint: '[{weight, value}, …]',
      },
    },
  },

  // ============ image ============
  'image.dataUri': {
    paramOverrides: {
      width: { kind: 'integer', default: 640, min: 1 },
      height: { kind: 'integer', default: 480, min: 1 },
      color: { hint: 'e.g. #aaaaaa' },
      type: { kind: 'enum', options: ['svg-uri', 'svg-base64'], default: 'svg-uri' },
    },
  },
  'image.url': {
    paramOverrides: {
      width: { kind: 'integer', default: 640, min: 1 },
      height: { kind: 'integer', default: 480, min: 1 },
    },
  },
  'image.urlLoremFlickr': {
    paramOverrides: {
      width: { kind: 'integer', default: 640, min: 1 },
      height: { kind: 'integer', default: 480, min: 1 },
      category: { hint: 'e.g. nature, city' },
    },
  },
  'image.urlPicsumPhotos': {
    paramOverrides: {
      width: { kind: 'integer', default: 640, min: 1 },
      height: { kind: 'integer', default: 480, min: 1 },
      grayscale: { kind: 'boolean', default: false },
      blur: { kind: 'integer', min: 0, max: 10 },
    },
  },
  'image.urlPlaceholder': {
    paramOverrides: {
      width: { kind: 'integer', default: 640, min: 1 },
      height: { kind: 'integer', default: 480, min: 1 },
      backgroundColor: { hint: '#rgb hex' },
      textColor: { hint: '#rgb hex' },
      format: {
        kind: 'enum',
        options: ['png', 'jpeg', 'jpg', 'gif', 'webp'],
        default: 'png',
      },
    },
  },
  // ============ internet ============
  'internet.color': {
    paramOverrides: {
      redBase: { kind: 'integer', min: 0, max: 255 },
      greenBase: { kind: 'integer', min: 0, max: 255 },
      blueBase: { kind: 'integer', min: 0, max: 255 },
    },
  },
  'internet.email': {
    paramOverrides: {
      provider: { hint: 'e.g. acme.com' },
      allowSpecialCharacters: { kind: 'boolean', default: false },
    },
  },
  'internet.emoji': {
    paramOverrides: {
      types: {
        kind: 'array',
        hint: 'smiley, body, person, nature, food, travel, activity, object, symbol, flag',
      },
    },
  },
  'internet.httpStatusCode': {
    paramOverrides: {
      types: {
        kind: 'array',
        hint: 'informational, success, redirection, clientError, serverError',
      },
    },
  },
  'internet.ipv4': { paramOverrides: { cidrBlock: { hint: 'e.g. 10.0.0.0/8' } } },
  'internet.jwt': {
    paramOverrides: {
      header: { label: 'header (JSON)' },
      payload: { label: 'payload (JSON)' },
      refDate: REF_DATE,
    },
  },
  'internet.mac': {
    paramOverrides: {
      separator: { kind: 'enum', options: [':', '-', ''], default: ':' },
    },
  },
  'internet.password': {
    paramOverrides: {
      length: { kind: 'integer', default: 15, min: 1 },
      memorable: { kind: 'boolean', default: false },
      pattern: { kind: 'regex' },
    },
  },
  'internet.url': {
    paramOverrides: {
      protocol: { kind: 'enum', options: ['http', 'https'], default: 'https' },
      appendSlash: { kind: 'boolean', default: false },
    },
  },

  // ============ location ============
  'location.cardinalDirection': {
    paramOverrides: { abbreviated: { kind: 'boolean', default: false } },
  },
  'location.countryCode': {
    paramOverrides: {
      variant: { kind: 'enum', options: ['alpha-2', 'alpha-3', 'numeric'], default: 'alpha-2' },
    },
  },
  'location.direction': {
    paramOverrides: { abbreviated: { kind: 'boolean', default: false } },
  },
  'location.latitude': {
    paramOverrides: {
      max: { kind: 'number', default: 90, min: -90, max: 90 },
      min: { kind: 'number', default: -90, min: -90, max: 90 },
      precision: { kind: 'integer', default: 4, min: 0, max: 12 },
    },
  },
  'location.longitude': {
    paramOverrides: {
      max: { kind: 'number', default: 180, min: -180, max: 180 },
      min: { kind: 'number', default: -180, min: -180, max: 180 },
      precision: { kind: 'integer', default: 4, min: 0, max: 12 },
    },
  },
  'location.nearbyGPSCoordinate': {
    paramOverrides: {
      origin: { hint: 'e.g. 33.84,-118.39' },
      radius: { kind: 'number', default: 10 },
      isMetric: { kind: 'boolean', default: false },
    },
  },
  'location.ordinalDirection': {
    paramOverrides: { abbreviated: { kind: 'boolean', default: false } },
  },
  'location.state': { paramOverrides: { abbreviated: { kind: 'boolean', default: false } } },
  'location.streetAddress': {
    paramOverrides: { useFullAddress: { kind: 'boolean', default: false } },
  },
  'location.zipCode': {
    paramOverrides: {
      format: { hint: '# digit · ? letter, e.g. "#####-####"' },
      state: { hint: 'US state code' },
    },
  },

  // ============ lorem ============
  'lorem.lines': {
    paramOverrides: {
      min: { kind: 'integer', default: 1, min: 1 },
      max: { kind: 'integer', default: 5, min: 1 },
    },
  },
  'lorem.paragraph': {
    paramOverrides: { sentenceCount: { kind: 'integer', default: 3, min: 1 } },
  },
  'lorem.paragraphs': {
    paramOverrides: {
      count: { kind: 'integer', default: 3, min: 1 },
      separator: { default: '\\n' },
    },
  },
  'lorem.sentence': {
    paramOverrides: { wordCount: { kind: 'integer', default: 6, min: 1 } },
  },
  'lorem.sentences': {
    paramOverrides: {
      count: { kind: 'integer', default: 3, min: 1 },
      separator: { default: ' ' },
    },
  },
  'lorem.slug': { paramOverrides: { wordCount: { kind: 'integer', default: 3, min: 1 } } },
  'lorem.word': {
    paramOverrides: {
      length: { kind: 'integer', hint: 'exact length' },
      strategy: {
        kind: 'enum',
        options: ['any-length', 'closest', 'fail', 'longest', 'shortest'],
        default: 'any-length',
      },
    },
  },
  'lorem.words': { paramOverrides: { count: { kind: 'integer', default: 3, min: 1 } } },

  // ============ number ============
  'number.bigInt': {
    paramOverrides: {
      min: { hint: 'JS bigint, e.g. 1000n' },
      max: { hint: 'JS bigint' },
    },
  },
  'number.binary': {
    paramOverrides: {
      min: { kind: 'integer', default: 0 },
      max: { kind: 'integer', default: 1 },
    },
  },
  'number.float': {
    paramOverrides: {
      min: { kind: 'number', default: 0 },
      max: { kind: 'number', default: 1 },
      fractionDigits: { kind: 'integer', default: 2, min: 0, max: 12 },
      multipleOf: { kind: 'number' },
    },
  },
  'number.hex': {
    paramOverrides: {
      min: { kind: 'integer', default: 0 },
      max: { kind: 'integer', default: 15 },
    },
  },
  'number.int': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'integer', label: 'min', default: 0 },
      { name: 'max', kind: 'integer', label: 'max', default: 1000 },
      {
        name: 'multipleOf',
        kind: 'integer',
        label: 'multiple of',
        hint: 'round to nearest',
      },
    ],
  },
  'number.octal': {
    paramOverrides: {
      min: { kind: 'integer', default: 0 },
      max: { kind: 'integer', default: 7 },
    },
  },
  'number.romanNumeral': {
    paramOverrides: {
      min: { kind: 'integer', default: 1, min: 1, max: 3999 },
      max: { kind: 'integer', default: 3999, min: 1, max: 3999 },
    },
  },

  // ============ person ============
  'person.firstName': { paramOverrides: { sex: SEX_ENUM } },
  'person.lastName': { paramOverrides: { sex: SEX_ENUM } },
  'person.middleName': { paramOverrides: { sex: SEX_ENUM } },
  'person.prefix': { paramOverrides: { sex: SEX_ENUM } },
  'person.fullName': {
    paramOverrides: { sex: SEX_ENUM },
  },

  // ============ phone ============
  'phone.number': {
    paramOverrides: {
      style: {
        kind: 'enum',
        options: ['human', 'national', 'international'],
        default: 'human',
      },
    },
  },

  // ============ string ============
  'string.alpha': {
    paramOverrides: {
      length: { kind: 'integer', default: 10, min: 1 },
      casing: { kind: 'enum', options: ['mixed', 'upper', 'lower'], default: 'mixed' },
      exclude: { hint: 'characters to omit' },
    },
  },
  'string.alphanumeric': {
    paramOverrides: {
      length: { kind: 'integer', default: 10, min: 1 },
      casing: { kind: 'enum', options: ['mixed', 'upper', 'lower'], default: 'mixed' },
    },
  },
  'string.binary': {
    paramOverrides: {
      length: { kind: 'integer', default: 1, min: 1 },
      prefix: { default: '0b' },
    },
  },
  'string.fromCharacters': {
    paramOverrides: {
      characters: { default: 'abcdef0123456789', hint: 'alphabet to pick from' },
      length: { kind: 'integer', default: 8, min: 1 },
    },
  },
  'string.hexadecimal': {
    paramOverrides: {
      length: { kind: 'integer', default: 1, min: 1 },
      casing: { kind: 'enum', options: ['mixed', 'upper', 'lower'], default: 'mixed' },
      prefix: { default: '0x' },
    },
  },
  'string.nanoid': { paramOverrides: { length: { kind: 'integer', default: 21, min: 1 } } },
  'string.numeric': {
    paramOverrides: {
      length: { kind: 'integer', default: 1, min: 1 },
      allowLeadingZeros: { kind: 'boolean', default: true },
    },
  },
  'string.octal': {
    paramOverrides: {
      length: { kind: 'integer', default: 1, min: 1 },
      prefix: { default: '0o' },
    },
  },
  'string.sample': { paramOverrides: { length: { kind: 'integer', default: 10, min: 1 } } },
  'string.symbol': { paramOverrides: { length: { kind: 'integer', default: 1, min: 1 } } },
  'string.ulid': { paramOverrides: { refDate: REF_DATE } },

  // ============ system ============
  'system.cron': {
    paramOverrides: {
      includeYear: { kind: 'boolean', default: false },
      includeNonStandard: { kind: 'boolean', label: 'allow @yearly etc.', default: false },
    },
  },
  'system.fileExt': { paramOverrides: { mimeType: { hint: 'e.g. application/json' } } },
  'system.fileName': {
    paramOverrides: { extensionCount: { kind: 'integer', default: 1, min: 0, max: 4 } },
  },
  'system.networkInterface': {
    paramOverrides: {
      interfaceType: { kind: 'enum', options: ['', 'en', 'wl', 'ww'], default: '' },
      interfaceSchema: {
        kind: 'enum',
        options: ['', 'index', 'slot', 'mac', 'pci'],
        default: '',
      },
    },
  },

  // ============ word (length+strategy on every word.* method) ============
  ...Object.fromEntries(
    ['adjective', 'adverb', 'conjunction', 'interjection', 'noun', 'preposition', 'sample', 'verb'].map(
      (m) => [
        `word.${m}`,
        {
          paramOverrides: {
            length: { kind: 'integer', hint: 'exact length' },
            strategy: {
              kind: 'enum',
              options: ['any-length', 'closest', 'fail', 'longest', 'shortest'],
              default: 'any-length',
            },
          },
        } as MethodOverride,
      ],
    ),
  ),
  'word.words': { paramOverrides: { count: { kind: 'integer', default: 3, min: 1 } } },
};
