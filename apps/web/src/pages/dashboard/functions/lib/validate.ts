import { NAME_RE, USAGES, type CreateCustomFunctionBody } from './types.js';

export type FnValidationIssue =
  | { field: 'name'; message: string }
  | { field: 'usage'; message: string }
  | { field: 'source'; message: string };

export function validateFn(body: CreateCustomFunctionBody): FnValidationIssue[] {
  const out: FnValidationIssue[] = [];
  if (!NAME_RE.test(body.name)) {
    out.push({ field: 'name', message: 'Name must be a JavaScript-style identifier.' });
  }
  if (!USAGES.includes(body.usage)) {
    out.push({ field: 'usage', message: 'Pick a usage.' });
  }
  if (typeof body.source !== 'string' || body.source.length < 1 || body.source.length > 20000) {
    out.push({ field: 'source', message: 'Source must be 1..20000 characters.' });
  }
  return out;
}
