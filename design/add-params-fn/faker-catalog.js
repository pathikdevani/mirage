/**
 * Curated faker.js argument signatures — full coverage.
 *
 * Covers every method on the @faker-js/faker prototype (v9.x) that accepts an
 * argument. Methods that take no arguments are intentionally absent — the
 * args panel renders a friendly "this method takes no arguments" state for
 * those automatically.
 *
 * Each entry:
 *   shape:   'options'      — one options object arg (most modern faker methods)
 *   shape:   'positional'   — positional args, emitted in declared order
 *   params:  ordered list — { name, kind, label, default?, hint?, options?, min?, max? }
 *   kinds:   'integer' | 'number' | 'string' | 'boolean' | 'enum' | 'date' | 'array' | 'regex'
 *
 * Defaults shown as placeholders; absent values fall back to faker's own.
 */

/* eslint-disable max-len */

const SEX = { name: 'sex', kind: 'enum', label: 'sex', options: ['', 'female', 'male'], default: '' };
const REF_DATE = { name: 'refDate', kind: 'date', label: 'reference date', hint: 'leave blank for "now"' };

window.FAKER_CATALOG = {
  // ============================================================
  // airline
  // ============================================================
  'airline.flightNumber': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 4, min: 1, max: 8 },
      { name: 'leadingZeros', kind: 'boolean', label: 'leading zeros', default: false },
      { name: 'addLeadingZeros', kind: 'boolean', label: 'add leading zeros', default: false },
    ],
  },
  'airline.recordLocator': {
    shape: 'options',
    params: [
      { name: 'allowNumerics', kind: 'boolean', label: 'allow numerics', default: false },
      { name: 'allowVisuallySimilarCharacters', kind: 'boolean', label: 'allow O/0, I/1', default: false },
    ],
  },
  'airline.seat': {
    shape: 'options',
    params: [
      { name: 'aircraftType', kind: 'enum', label: 'aircraft type', options: ['', 'regional', 'narrowbody', 'widebody'], default: '' },
    ],
  },

  // ============================================================
  // color
  // ============================================================
  'color.cmyk': {
    shape: 'options',
    params: [
      { name: 'format', kind: 'enum', label: 'format', options: ['decimal', 'css', 'binary'], default: 'decimal' },
    ],
  },
  'color.colorByCSSColorSpace': {
    shape: 'options',
    params: [
      { name: 'format', kind: 'enum', label: 'format', options: ['decimal', 'css', 'binary'], default: 'decimal' },
      { name: 'space', kind: 'enum', label: 'space',
        options: ['sRGB', 'display-p3', 'rec2020', 'a98-rgb', 'prophoto-rgb', 'rec2020'], default: 'sRGB' },
    ],
  },
  'color.hsl': {
    shape: 'options',
    params: [
      { name: 'format', kind: 'enum', label: 'format', options: ['decimal', 'css', 'binary'], default: 'decimal' },
      { name: 'includeAlpha', kind: 'boolean', label: 'include alpha', default: false },
    ],
  },
  'color.hwb': {
    shape: 'options',
    params: [
      { name: 'format', kind: 'enum', label: 'format', options: ['decimal', 'css', 'binary'], default: 'decimal' },
    ],
  },
  'color.lab': {
    shape: 'options',
    params: [
      { name: 'format', kind: 'enum', label: 'format', options: ['decimal', 'css', 'binary'], default: 'decimal' },
    ],
  },
  'color.lch': {
    shape: 'options',
    params: [
      { name: 'format', kind: 'enum', label: 'format', options: ['decimal', 'css', 'binary'], default: 'decimal' },
    ],
  },
  'color.rgb': {
    shape: 'options',
    params: [
      { name: 'format', kind: 'enum', label: 'format', options: ['hex', 'decimal', 'css', 'binary'], default: 'hex' },
      { name: 'casing', kind: 'enum', label: 'casing', options: ['mixed', 'lower', 'upper'], default: 'mixed' },
      { name: 'prefix', kind: 'string', label: 'prefix', default: '#' },
      { name: 'includeAlpha', kind: 'boolean', label: 'include alpha', default: false },
    ],
  },

  // ============================================================
  // commerce
  // ============================================================
  'commerce.isbn': {
    shape: 'options',
    params: [
      { name: 'variant', kind: 'enum', label: 'variant', options: ['', '10', '13'], default: '' },
      { name: 'separator', kind: 'string', label: 'separator', default: '-' },
    ],
  },
  'commerce.price': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'number', label: 'min', default: 1 },
      { name: 'max', kind: 'number', label: 'max', default: 1000 },
      { name: 'dec', kind: 'integer', label: 'decimals', default: 2, min: 0, max: 12 },
      { name: 'symbol', kind: 'string', label: 'symbol' },
    ],
  },

  // ============================================================
  // database
  // ============================================================
  // (no methods with args)

  // ============================================================
  // datatype
  // ============================================================
  'datatype.boolean': {
    shape: 'options',
    params: [
      { name: 'probability', kind: 'number', label: 'probability of true', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
  },

  // ============================================================
  // date
  // ============================================================
  'date.anytime': {
    shape: 'options',
    params: [REF_DATE],
  },
  'date.between': {
    shape: 'options',
    params: [
      { name: 'from', kind: 'date', label: 'from', default: '2020-01-01' },
      { name: 'to', kind: 'date', label: 'to', default: '2025-12-31' },
    ],
  },
  'date.betweens': {
    shape: 'options',
    params: [
      { name: 'from', kind: 'date', label: 'from' },
      { name: 'to', kind: 'date', label: 'to' },
      { name: 'count', kind: 'integer', label: 'count', default: 3, min: 1 },
    ],
  },
  'date.birthdate': {
    shape: 'options',
    params: [
      { name: 'mode', kind: 'enum', label: 'mode', options: ['age', 'year'], default: 'age' },
      { name: 'min', kind: 'integer', label: 'min', default: 18, hint: 'age or year' },
      { name: 'max', kind: 'integer', label: 'max', default: 80, hint: 'age or year' },
      REF_DATE,
    ],
  },
  'date.future': {
    shape: 'options',
    params: [
      { name: 'years', kind: 'number', label: 'years', default: 1, min: 0, step: 0.5 },
      REF_DATE,
    ],
  },
  'date.month': {
    shape: 'options',
    params: [
      { name: 'abbreviated', kind: 'boolean', label: 'abbreviated', default: false },
      { name: 'context', kind: 'boolean', label: 'context-aware', default: false },
    ],
  },
  'date.past': {
    shape: 'options',
    params: [
      { name: 'years', kind: 'number', label: 'years', default: 1, min: 0, step: 0.5 },
      REF_DATE,
    ],
  },
  'date.recent': {
    shape: 'options',
    params: [
      { name: 'days', kind: 'number', label: 'days', default: 1, min: 0, step: 0.5 },
      REF_DATE,
    ],
  },
  'date.soon': {
    shape: 'options',
    params: [
      { name: 'days', kind: 'number', label: 'days', default: 1, min: 0, step: 0.5 },
      REF_DATE,
    ],
  },
  'date.weekday': {
    shape: 'options',
    params: [
      { name: 'abbreviated', kind: 'boolean', label: 'abbreviated', default: false },
      { name: 'context', kind: 'boolean', label: 'context-aware', default: false },
    ],
  },

  // ============================================================
  // finance
  // ============================================================
  'finance.accountNumber': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 8, min: 1, max: 32 },
    ],
  },
  'finance.amount': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'number', label: 'min', default: 0 },
      { name: 'max', kind: 'number', label: 'max', default: 1000 },
      { name: 'dec', kind: 'integer', label: 'decimals', default: 2, min: 0, max: 12 },
      { name: 'symbol', kind: 'string', label: 'symbol', default: '' },
      { name: 'autoFormat', kind: 'boolean', label: 'auto format', default: false },
    ],
  },
  'finance.bic': {
    shape: 'options',
    params: [
      { name: 'includeBranchCode', kind: 'boolean', label: 'include branch code', default: false },
    ],
  },
  'finance.creditCardNumber': {
    shape: 'options',
    params: [
      { name: 'issuer', kind: 'enum', label: 'issuer',
        options: ['', 'visa', 'mastercard', 'american_express', 'discover', 'diners_club', 'jcb', 'maestro'], default: '' },
    ],
  },
  'finance.iban': {
    shape: 'options',
    params: [
      { name: 'formatted', kind: 'boolean', label: 'formatted', default: false },
      { name: 'countryCode', kind: 'string', label: 'country code', hint: 'ISO-3166 alpha-2, e.g. "DE"' },
    ],
  },
  'finance.maskedNumber': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 4, min: 1 },
      { name: 'parens', kind: 'boolean', label: 'parens', default: true },
      { name: 'ellipsis', kind: 'boolean', label: 'ellipsis', default: true },
    ],
  },
  'finance.pin': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 4, min: 1, max: 32 },
    ],
  },

  // ============================================================
  // git
  // ============================================================
  'git.commitDate': {
    shape: 'options',
    params: [REF_DATE],
  },
  'git.commitEntry': {
    shape: 'options',
    params: [
      { name: 'merge', kind: 'boolean', label: 'merge commit' },
      { name: 'eol', kind: 'enum', label: 'EOL', options: ['CRLF', 'LF'], default: 'CRLF' },
      REF_DATE,
    ],
  },
  'git.commitSha': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 40, min: 7, max: 40 },
    ],
  },

  // ============================================================
  // helpers
  // ============================================================
  'helpers.arrayElement': {
    shape: 'positional',
    params: [
      { name: 'array', kind: 'array', label: 'choices', default: ['option-a', 'option-b'], hint: 'one per line' },
    ],
  },
  'helpers.arrayElements': {
    shape: 'positional',
    params: [
      { name: 'array', kind: 'array', label: 'choices', default: ['option-a', 'option-b', 'option-c'] },
      { name: 'count', kind: 'integer', label: 'count', hint: 'exact count, or leave blank for random' },
    ],
  },
  'helpers.enumValue': {
    shape: 'positional',
    params: [
      { name: 'enum', kind: 'array', label: 'enum members', default: ['ACTIVE', 'PAUSED', 'ARCHIVED'] },
    ],
  },
  'helpers.fake': {
    shape: 'positional',
    params: [
      { name: 'pattern', kind: 'string', label: 'template', default: '{{person.firstName}} {{person.lastName}}', hint: '{{ns.method}} placeholders' },
    ],
  },
  'helpers.fromRegExp': {
    shape: 'positional',
    params: [
      { name: 'pattern', kind: 'regex', label: 'pattern', default: '[A-Z]{3}-[0-9]{4}', hint: 'JS regex source' },
    ],
  },
  'helpers.maybe': {
    shape: 'options',
    params: [
      { name: 'probability', kind: 'number', label: 'probability', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
  },
  'helpers.multiple': {
    shape: 'options',
    params: [
      { name: 'count', kind: 'integer', label: 'count', default: 3, min: 1 },
    ],
  },
  'helpers.mustache': {
    shape: 'positional',
    params: [
      { name: 'string', kind: 'string', label: 'template', default: 'Hello {{name}}', hint: 'mustache placeholders' },
      { name: 'data', kind: 'string', label: 'data (JSON object)', hint: 'e.g. {"name":"World"}' },
    ],
  },
  'helpers.objectEntry': {
    shape: 'positional',
    params: [{ name: 'object', kind: 'string', label: 'object (JSON)', default: '{"a":1,"b":2}' }],
  },
  'helpers.objectKey': {
    shape: 'positional',
    params: [{ name: 'object', kind: 'string', label: 'object (JSON)', default: '{"a":1,"b":2}' }],
  },
  'helpers.objectValue': {
    shape: 'positional',
    params: [{ name: 'object', kind: 'string', label: 'object (JSON)', default: '{"a":1,"b":2}' }],
  },
  'helpers.rangeToNumber': {
    shape: 'positional',
    params: [
      { name: 'min', kind: 'integer', label: 'min', default: 0 },
      { name: 'max', kind: 'integer', label: 'max', default: 10 },
    ],
  },
  'helpers.replaceCreditCardSymbols': {
    shape: 'positional',
    params: [
      { name: 'string', kind: 'string', label: 'pattern', default: '6453-####-####-####-###L' },
      { name: 'symbol', kind: 'string', label: 'symbol', default: '#' },
    ],
  },
  'helpers.replaceSymbols': {
    shape: 'positional',
    params: [
      { name: 'string', kind: 'string', label: 'pattern', default: '###-???-###', hint: '# digit · ? letter · * either' },
    ],
  },
  'helpers.shuffle': {
    shape: 'positional',
    params: [
      { name: 'array', kind: 'array', label: 'array', default: ['a', 'b', 'c'] },
    ],
  },
  'helpers.slugify': {
    shape: 'positional',
    params: [
      { name: 'string', kind: 'string', label: 'string', default: 'Hello World' },
    ],
  },
  'helpers.uniqueArray': {
    shape: 'positional',
    params: [
      { name: 'source', kind: 'array', label: 'source', default: ['a', 'b', 'c', 'd', 'e'] },
      { name: 'length', kind: 'integer', label: 'length', default: 3, min: 1 },
    ],
  },
  'helpers.weightedArrayElement': {
    shape: 'positional',
    params: [
      { name: 'array', kind: 'string', label: 'weighted entries (JSON)',
        default: '[{"weight":5,"value":"a"},{"weight":1,"value":"b"}]',
        hint: '[{weight, value}, …]' },
    ],
  },

  // ============================================================
  // image
  // ============================================================
  'image.dataUri': {
    shape: 'options',
    params: [
      { name: 'width', kind: 'integer', label: 'width', default: 640, min: 1 },
      { name: 'height', kind: 'integer', label: 'height', default: 480, min: 1 },
      { name: 'color', kind: 'string', label: 'color', hint: 'e.g. #aaaaaa' },
      { name: 'type', kind: 'enum', label: 'type', options: ['svg-uri', 'svg-base64'], default: 'svg-uri' },
    ],
  },
  'image.url': {
    shape: 'options',
    params: [
      { name: 'width', kind: 'integer', label: 'width', default: 640, min: 1 },
      { name: 'height', kind: 'integer', label: 'height', default: 480, min: 1 },
    ],
  },
  'image.urlLoremFlickr': {
    shape: 'options',
    params: [
      { name: 'width', kind: 'integer', label: 'width', default: 640, min: 1 },
      { name: 'height', kind: 'integer', label: 'height', default: 480, min: 1 },
      { name: 'category', kind: 'string', label: 'category', hint: 'e.g. nature, city' },
    ],
  },
  'image.urlPicsumPhotos': {
    shape: 'options',
    params: [
      { name: 'width', kind: 'integer', label: 'width', default: 640, min: 1 },
      { name: 'height', kind: 'integer', label: 'height', default: 480, min: 1 },
      { name: 'grayscale', kind: 'boolean', label: 'grayscale', default: false },
      { name: 'blur', kind: 'integer', label: 'blur', min: 0, max: 10 },
    ],
  },
  'image.urlPlaceholder': {
    shape: 'options',
    params: [
      { name: 'width', kind: 'integer', label: 'width', default: 640, min: 1 },
      { name: 'height', kind: 'integer', label: 'height', default: 480, min: 1 },
      { name: 'backgroundColor', kind: 'string', label: 'background', hint: '#rgb hex' },
      { name: 'textColor', kind: 'string', label: 'text color', hint: '#rgb hex' },
      { name: 'format', kind: 'enum', label: 'format', options: ['png', 'jpeg', 'jpg', 'gif', 'webp'], default: 'png' },
      { name: 'text', kind: 'string', label: 'text' },
    ],
  },
  'image.personPortrait': {
    shape: 'options',
    params: [
      { name: 'sex', kind: 'enum', label: 'sex', options: ['', 'female', 'male'], default: '' },
      { name: 'size', kind: 'enum', label: 'size', options: ['', '256', '512', '1024'], default: '' },
    ],
  },

  // ============================================================
  // internet
  // ============================================================
  'internet.color': {
    shape: 'options',
    params: [
      { name: 'redBase', kind: 'integer', label: 'red base', min: 0, max: 255 },
      { name: 'greenBase', kind: 'integer', label: 'green base', min: 0, max: 255 },
      { name: 'blueBase', kind: 'integer', label: 'blue base', min: 0, max: 255 },
    ],
  },
  'internet.displayName': {
    shape: 'options',
    params: [
      { name: 'firstName', kind: 'string', label: 'first name' },
      { name: 'lastName', kind: 'string', label: 'last name' },
    ],
  },
  'internet.email': {
    shape: 'options',
    params: [
      { name: 'firstName', kind: 'string', label: 'first name' },
      { name: 'lastName', kind: 'string', label: 'last name' },
      { name: 'provider', kind: 'string', label: 'provider', hint: 'e.g. acme.com' },
      { name: 'allowSpecialCharacters', kind: 'boolean', label: 'special chars', default: false },
    ],
  },
  'internet.emoji': {
    shape: 'options',
    params: [
      { name: 'types', kind: 'array', label: 'types',
        hint: 'smiley, body, person, nature, food, travel, activity, object, symbol, flag' },
    ],
  },
  'internet.exampleEmail': {
    shape: 'options',
    params: [
      { name: 'firstName', kind: 'string', label: 'first name' },
      { name: 'lastName', kind: 'string', label: 'last name' },
      { name: 'allowSpecialCharacters', kind: 'boolean', label: 'special chars', default: false },
    ],
  },
  'internet.httpStatusCode': {
    shape: 'options',
    params: [
      { name: 'types', kind: 'array', label: 'types',
        hint: 'informational, success, redirection, clientError, serverError' },
    ],
  },
  'internet.ipv4': {
    shape: 'options',
    params: [
      { name: 'cidrBlock', kind: 'string', label: 'CIDR block', hint: 'e.g. 10.0.0.0/8' },
    ],
  },
  'internet.jwt': {
    shape: 'options',
    params: [
      { name: 'header', kind: 'string', label: 'header (JSON)' },
      { name: 'payload', kind: 'string', label: 'payload (JSON)' },
      REF_DATE,
    ],
  },
  'internet.mac': {
    shape: 'options',
    params: [
      { name: 'separator', kind: 'enum', label: 'separator', options: [':', '-', ''], default: ':' },
    ],
  },
  'internet.password': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 15, min: 1 },
      { name: 'memorable', kind: 'boolean', label: 'memorable', default: false },
      { name: 'pattern', kind: 'regex', label: 'pattern' },
      { name: 'prefix', kind: 'string', label: 'prefix' },
    ],
  },
  'internet.url': {
    shape: 'options',
    params: [
      { name: 'protocol', kind: 'enum', label: 'protocol', options: ['http', 'https'], default: 'https' },
      { name: 'appendSlash', kind: 'boolean', label: 'append slash', default: false },
    ],
  },
  'internet.username': {
    shape: 'options',
    params: [
      { name: 'firstName', kind: 'string', label: 'first name' },
      { name: 'lastName', kind: 'string', label: 'last name' },
    ],
  },
  'internet.userName': {
    shape: 'options',
    params: [
      { name: 'firstName', kind: 'string', label: 'first name' },
      { name: 'lastName', kind: 'string', label: 'last name' },
    ],
  },
  'internet.domainName': { shape: 'options', params: [] },

  // ============================================================
  // location
  // ============================================================
  'location.cardinalDirection': {
    shape: 'options',
    params: [{ name: 'abbreviated', kind: 'boolean', label: 'abbreviated', default: false }],
  },
  'location.countryCode': {
    shape: 'options',
    params: [
      { name: 'variant', kind: 'enum', label: 'variant', options: ['alpha-2', 'alpha-3', 'numeric'], default: 'alpha-2' },
    ],
  },
  'location.direction': {
    shape: 'options',
    params: [{ name: 'abbreviated', kind: 'boolean', label: 'abbreviated', default: false }],
  },
  'location.latitude': {
    shape: 'options',
    params: [
      { name: 'max', kind: 'number', label: 'max', default: 90, min: -90, max: 90 },
      { name: 'min', kind: 'number', label: 'min', default: -90, min: -90, max: 90 },
      { name: 'precision', kind: 'integer', label: 'precision', default: 4, min: 0, max: 12 },
    ],
  },
  'location.longitude': {
    shape: 'options',
    params: [
      { name: 'max', kind: 'number', label: 'max', default: 180, min: -180, max: 180 },
      { name: 'min', kind: 'number', label: 'min', default: -180, min: -180, max: 180 },
      { name: 'precision', kind: 'integer', label: 'precision', default: 4, min: 0, max: 12 },
    ],
  },
  'location.nearbyGPSCoordinate': {
    shape: 'options',
    params: [
      { name: 'origin', kind: 'string', label: 'origin (lat,lng)', hint: 'e.g. 33.84,-118.39' },
      { name: 'radius', kind: 'number', label: 'radius', default: 10 },
      { name: 'isMetric', kind: 'boolean', label: 'metric', default: false },
    ],
  },
  'location.ordinalDirection': {
    shape: 'options',
    params: [{ name: 'abbreviated', kind: 'boolean', label: 'abbreviated', default: false }],
  },
  'location.state': {
    shape: 'options',
    params: [
      { name: 'abbreviated', kind: 'boolean', label: 'abbreviated', default: false },
    ],
  },
  'location.streetAddress': {
    shape: 'options',
    params: [
      { name: 'useFullAddress', kind: 'boolean', label: 'full address', default: false },
    ],
  },
  'location.zipCode': {
    shape: 'options',
    params: [
      { name: 'format', kind: 'string', label: 'format', hint: '# digit · ? letter, e.g. "#####-####"' },
      { name: 'state', kind: 'string', label: 'state', hint: 'US state code' },
    ],
  },

  // ============================================================
  // lorem
  // ============================================================
  'lorem.lines': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'integer', label: 'min', default: 1, min: 1 },
      { name: 'max', kind: 'integer', label: 'max', default: 5, min: 1 },
    ],
  },
  'lorem.paragraph': {
    shape: 'positional',
    params: [{ name: 'sentenceCount', kind: 'integer', label: 'sentence count', default: 3, min: 1 }],
  },
  'lorem.paragraphs': {
    shape: 'positional',
    params: [
      { name: 'count', kind: 'integer', label: 'count', default: 3, min: 1 },
      { name: 'separator', kind: 'string', label: 'separator', default: '\\n' },
    ],
  },
  'lorem.sentence': {
    shape: 'positional',
    params: [{ name: 'wordCount', kind: 'integer', label: 'word count', default: 6, min: 1 }],
  },
  'lorem.sentences': {
    shape: 'positional',
    params: [
      { name: 'count', kind: 'integer', label: 'count', default: 3, min: 1 },
      { name: 'separator', kind: 'string', label: 'separator', default: ' ' },
    ],
  },
  'lorem.slug': {
    shape: 'positional',
    params: [{ name: 'wordCount', kind: 'integer', label: 'word count', default: 3, min: 1 }],
  },
  'lorem.text': { shape: 'options', params: [] },
  'lorem.word': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', hint: 'exact length' },
      { name: 'strategy', kind: 'enum', label: 'strategy', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    ],
  },
  'lorem.words': {
    shape: 'positional',
    params: [{ name: 'count', kind: 'integer', label: 'count', default: 3, min: 1 }],
  },

  // ============================================================
  // number
  // ============================================================
  'number.bigInt': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'string', label: 'min', hint: 'JS bigint, e.g. 1000n' },
      { name: 'max', kind: 'string', label: 'max', hint: 'JS bigint' },
    ],
  },
  'number.binary': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'integer', label: 'min', default: 0 },
      { name: 'max', kind: 'integer', label: 'max', default: 1 },
    ],
  },
  'number.float': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'number', label: 'min', default: 0 },
      { name: 'max', kind: 'number', label: 'max', default: 1 },
      { name: 'fractionDigits', kind: 'integer', label: 'fraction digits', default: 2, min: 0, max: 12 },
      { name: 'multipleOf', kind: 'number', label: 'multiple of' },
    ],
  },
  'number.hex': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'integer', label: 'min', default: 0 },
      { name: 'max', kind: 'integer', label: 'max', default: 15 },
    ],
  },
  'number.int': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'integer', label: 'min', default: 0 },
      { name: 'max', kind: 'integer', label: 'max', default: 1000 },
      { name: 'multipleOf', kind: 'integer', label: 'multiple of', hint: 'round to nearest' },
    ],
  },
  'number.octal': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'integer', label: 'min', default: 0 },
      { name: 'max', kind: 'integer', label: 'max', default: 7 },
    ],
  },
  'number.romanNumeral': {
    shape: 'options',
    params: [
      { name: 'min', kind: 'integer', label: 'min', default: 1, min: 1, max: 3999 },
      { name: 'max', kind: 'integer', label: 'max', default: 3999, min: 1, max: 3999 },
    ],
  },

  // ============================================================
  // person
  // ============================================================
  'person.firstName': { shape: 'positional', params: [SEX] },
  'person.lastName': { shape: 'positional', params: [SEX] },
  'person.middleName': { shape: 'positional', params: [SEX] },
  'person.prefix': { shape: 'positional', params: [SEX] },
  'person.suffix': { shape: 'positional', params: [] },
  'person.fullName': {
    shape: 'options',
    params: [
      { name: 'firstName', kind: 'string', label: 'first name' },
      { name: 'lastName', kind: 'string', label: 'last name' },
      { name: 'sex', kind: 'enum', label: 'sex', options: ['', 'female', 'male'], default: '' },
    ],
  },

  // ============================================================
  // phone
  // ============================================================
  'phone.number': {
    shape: 'options',
    params: [
      { name: 'style', kind: 'enum', label: 'style', options: ['human', 'national', 'international'], default: 'human' },
    ],
  },

  // ============================================================
  // string
  // ============================================================
  'string.alpha': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 10, min: 1 },
      { name: 'casing', kind: 'enum', label: 'casing', options: ['mixed', 'upper', 'lower'], default: 'mixed' },
      { name: 'exclude', kind: 'string', label: 'exclude chars', hint: 'characters to omit' },
    ],
  },
  'string.alphanumeric': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 10, min: 1 },
      { name: 'casing', kind: 'enum', label: 'casing', options: ['mixed', 'upper', 'lower'], default: 'mixed' },
      { name: 'exclude', kind: 'string', label: 'exclude chars' },
    ],
  },
  'string.binary': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 1, min: 1 },
      { name: 'prefix', kind: 'string', label: 'prefix', default: '0b' },
    ],
  },
  'string.fromCharacters': {
    shape: 'positional',
    params: [
      { name: 'characters', kind: 'string', label: 'characters', default: 'abcdef0123456789', hint: 'alphabet to pick from' },
      { name: 'length', kind: 'integer', label: 'length', default: 8, min: 1 },
    ],
  },
  'string.hexadecimal': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 1, min: 1 },
      { name: 'casing', kind: 'enum', label: 'casing', options: ['mixed', 'upper', 'lower'], default: 'mixed' },
      { name: 'prefix', kind: 'string', label: 'prefix', default: '0x' },
    ],
  },
  'string.nanoid': {
    shape: 'options',
    params: [{ name: 'length', kind: 'integer', label: 'length', default: 21, min: 1 }],
  },
  'string.numeric': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 1, min: 1 },
      { name: 'allowLeadingZeros', kind: 'boolean', label: 'allow leading zeros', default: true },
      { name: 'exclude', kind: 'string', label: 'exclude digits' },
    ],
  },
  'string.octal': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', default: 1, min: 1 },
      { name: 'prefix', kind: 'string', label: 'prefix', default: '0o' },
    ],
  },
  'string.sample': {
    shape: 'options',
    params: [{ name: 'length', kind: 'integer', label: 'length', default: 10, min: 1 }],
  },
  'string.symbol': {
    shape: 'options',
    params: [{ name: 'length', kind: 'integer', label: 'length', default: 1, min: 1 }],
  },
  'string.ulid': {
    shape: 'options',
    params: [REF_DATE],
  },
  'string.uuid': { shape: 'options', params: [] },

  // ============================================================
  // system
  // ============================================================
  'system.cron': {
    shape: 'options',
    params: [
      { name: 'includeYear', kind: 'boolean', label: 'include year', default: false },
      { name: 'includeNonStandard', kind: 'boolean', label: 'allow @yearly etc.', default: false },
    ],
  },
  'system.fileExt': {
    shape: 'positional',
    params: [
      { name: 'mimeType', kind: 'string', label: 'mime type', hint: 'e.g. application/json' },
    ],
  },
  'system.fileName': {
    shape: 'options',
    params: [
      { name: 'extensionCount', kind: 'integer', label: 'extension count', default: 1, min: 0, max: 4 },
    ],
  },
  'system.networkInterface': {
    shape: 'options',
    params: [
      { name: 'interfaceType', kind: 'enum', label: 'interface type', options: ['', 'en', 'wl', 'ww'], default: '' },
      { name: 'interfaceSchema', kind: 'enum', label: 'schema',
        options: ['', 'index', 'slot', 'mac', 'pci'], default: '' },
    ],
  },

  // ============================================================
  // word
  // ============================================================
  // All word.* methods share the same { length?, strategy? } shape.
  'word.adjective': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length', hint: 'exact length' },
      { name: 'strategy', kind: 'enum', label: 'strategy', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    ],
  },
  'word.adverb': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length' },
      { name: 'strategy', kind: 'enum', label: 'strategy', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    ],
  },
  'word.conjunction': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length' },
      { name: 'strategy', kind: 'enum', label: 'strategy', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    ],
  },
  'word.interjection': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length' },
      { name: 'strategy', kind: 'enum', label: 'strategy', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    ],
  },
  'word.noun': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length' },
      { name: 'strategy', kind: 'enum', label: 'strategy', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    ],
  },
  'word.preposition': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length' },
      { name: 'strategy', kind: 'enum', label: 'strategy', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    ],
  },
  'word.sample': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length' },
      { name: 'strategy', kind: 'enum', label: 'strategy', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    ],
  },
  'word.verb': {
    shape: 'options',
    params: [
      { name: 'length', kind: 'integer', label: 'length' },
      { name: 'strategy', kind: 'enum', label: 'strategy', options: ['any-length', 'closest', 'fail', 'longest', 'shortest'], default: 'any-length' },
    ],
  },
  'word.words': {
    shape: 'options',
    params: [
      { name: 'count', kind: 'integer', label: 'count', default: 3, min: 1 },
    ],
  },
};

/**
 * Every method on the @faker-js/faker v9 prototype. Used by the picker so
 * users can find the no-arg helpers too (faker.company.name, faker.book.title,
 * faker.food.fruit, …). Methods present in FAKER_CATALOG above get a small
 * "args" badge in the picker; the rest render as plain entries.
 */
window.FAKER_GROUPS = [
  { ns: 'airline', methods: ['aircraftType', 'airline', 'airplane', 'airport', 'flightNumber', 'recordLocator', 'seat'] },
  { ns: 'animal', methods: ['bear', 'bird', 'cat', 'cetacean', 'cow', 'crocodilia', 'dog', 'fish', 'horse', 'insect', 'lion', 'petName', 'rabbit', 'rodent', 'snake', 'type'] },
  { ns: 'book', methods: ['author', 'format', 'genre', 'publisher', 'series', 'title'] },
  { ns: 'color', methods: ['cmyk', 'colorByCSSColorSpace', 'cssSupportedFunction', 'cssSupportedSpace', 'hsl', 'human', 'hwb', 'lab', 'lch', 'rgb', 'space'] },
  { ns: 'commerce', methods: ['department', 'isbn', 'price', 'product', 'productAdjective', 'productDescription', 'productMaterial', 'productName'] },
  { ns: 'company', methods: ['buzzAdjective', 'buzzNoun', 'buzzPhrase', 'buzzVerb', 'catchPhrase', 'catchPhraseAdjective', 'catchPhraseDescriptor', 'catchPhraseNoun', 'name'] },
  { ns: 'database', methods: ['collation', 'column', 'engine', 'mongodbObjectId', 'type'] },
  { ns: 'datatype', methods: ['boolean'] },
  { ns: 'date', methods: ['anytime', 'between', 'betweens', 'birthdate', 'future', 'month', 'past', 'recent', 'soon', 'timeZone', 'weekday'] },
  { ns: 'finance', methods: ['accountName', 'accountNumber', 'amount', 'bic', 'bitcoinAddress', 'creditCardCVV', 'creditCardIssuer', 'creditCardNumber', 'currency', 'currencyCode', 'currencyName', 'currencyNumericCode', 'currencySymbol', 'ethereumAddress', 'iban', 'litecoinAddress', 'maskedNumber', 'pin', 'routingNumber', 'transactionDescription', 'transactionType'] },
  { ns: 'food', methods: ['adjective', 'description', 'dish', 'ethnicCategory', 'fruit', 'ingredient', 'meat', 'spice', 'vegetable'] },
  { ns: 'git', methods: ['branch', 'commitDate', 'commitEntry', 'commitMessage', 'commitSha'] },
  { ns: 'hacker', methods: ['abbreviation', 'adjective', 'ingverb', 'noun', 'phrase', 'verb'] },
  { ns: 'helpers', methods: ['arrayElement', 'arrayElements', 'enumValue', 'fake', 'fromRegExp', 'maybe', 'multiple', 'mustache', 'objectEntry', 'objectKey', 'objectValue', 'rangeToNumber', 'replaceCreditCardSymbols', 'replaceSymbols', 'shuffle', 'slugify', 'uniqueArray', 'weightedArrayElement'] },
  { ns: 'image', methods: ['avatar', 'avatarGitHub', 'avatarLegacy', 'dataUri', 'personPortrait', 'url', 'urlLoremFlickr', 'urlPicsumPhotos', 'urlPlaceholder'] },
  { ns: 'internet', methods: ['color', 'displayName', 'domainName', 'domainSuffix', 'domainWord', 'email', 'emoji', 'exampleEmail', 'httpMethod', 'httpStatusCode', 'ip', 'ipv4', 'ipv6', 'jwt', 'jwtAlgorithm', 'mac', 'password', 'port', 'protocol', 'url', 'userAgent', 'username'] },
  { ns: 'location', methods: ['buildingNumber', 'cardinalDirection', 'city', 'continent', 'country', 'countryCode', 'county', 'direction', 'language', 'latitude', 'longitude', 'nearbyGPSCoordinate', 'ordinalDirection', 'secondaryAddress', 'state', 'street', 'streetAddress', 'timeZone', 'zipCode'] },
  { ns: 'lorem', methods: ['lines', 'paragraph', 'paragraphs', 'sentence', 'sentences', 'slug', 'text', 'word', 'words'] },
  { ns: 'music', methods: ['album', 'artist', 'genre', 'songName'] },
  { ns: 'number', methods: ['bigInt', 'binary', 'float', 'hex', 'int', 'octal', 'romanNumeral'] },
  { ns: 'person', methods: ['bio', 'firstName', 'fullName', 'gender', 'jobArea', 'jobDescriptor', 'jobTitle', 'jobType', 'lastName', 'middleName', 'prefix', 'sex', 'sexType', 'suffix', 'zodiacSign'] },
  { ns: 'phone', methods: ['imei', 'number'] },
  { ns: 'science', methods: ['chemicalElement', 'unit'] },
  { ns: 'string', methods: ['alpha', 'alphanumeric', 'binary', 'fromCharacters', 'hexadecimal', 'nanoid', 'numeric', 'octal', 'sample', 'symbol', 'ulid', 'uuid'] },
  { ns: 'system', methods: ['commonFileExt', 'commonFileName', 'commonFileType', 'cron', 'directoryPath', 'fileExt', 'fileName', 'filePath', 'fileType', 'mimeType', 'networkInterface', 'semver'] },
  { ns: 'vehicle', methods: ['bicycle', 'color', 'fuel', 'manufacturer', 'model', 'type', 'vehicle', 'vin', 'vrm'] },
  { ns: 'word', methods: ['adjective', 'adverb', 'conjunction', 'interjection', 'noun', 'preposition', 'sample', 'verb', 'words'] },
];
