import type { ValidationIssue } from './validateTree.js';

export interface ServerError {
  error?: string;
  code?: string;
  detail?: unknown;
}

export interface ServerErrorHandlers {
  setNameError?: (msg: string | null) => void;
  setKeyError?: (msg: string | null) => void;
  setRowErrors?: (next: ReadonlyMap<string, ValidationIssue>) => void;
  setCycleBanner?: (text: string | null) => void;
  setShowEmptyError?: (show: boolean) => void;
  setStep?: (step: 1 | 2 | 3) => void;
  setStaleUpdate?: (currentUpdatedAt: string | null) => void;
  setKeyRewriteFailed?: (detail: { cycle?: string[] } | null) => void;
  setGenericBanner?: (msg: string | null) => void;
  /** Called specifically for `key_taken` — Create uses it to update its availability badge. */
  onKeyTaken?: () => void;
}

export function makeServerErrorHandler(handlers: ServerErrorHandlers): (err: ServerError) => void {
  return (err: ServerError) => {
    const code = err?.code;
    handlers.setGenericBanner?.(null);

    if (code === 'name_required') {
      handlers.setNameError?.(err.error ?? 'Name is required');
      handlers.setStep?.(1);
      return;
    }
    if (code === 'key_invalid') {
      handlers.setKeyError?.(err.error ?? 'Key is invalid');
      handlers.setStep?.(1);
      return;
    }
    if (code === 'key_taken') {
      if (handlers.onKeyTaken) {
        handlers.onKeyTaken();
      } else {
        handlers.setKeyError?.('Key already in use in this workspace.');
      }
      handlers.setStep?.(1);
      return;
    }
    if (code === 'properties_empty') {
      handlers.setShowEmptyError?.(true);
      handlers.setStep?.(2);
      return;
    }
    if (code === 'property_name_invalid') {
      const path = detailString(err.detail, 'name');
      if (path) handlers.setRowErrors?.(new Map([[path, { kind: 'name_invalid', path }]]));
      handlers.setStep?.(2);
      return;
    }
    if (code === 'property_name_duplicate') {
      const sibling = detailString(err.detail, 'name') ?? '';
      if (sibling) {
        handlers.setRowErrors?.(
          new Map([[sibling, { kind: 'name_duplicate', path: sibling, sibling }]]),
        );
      }
      handlers.setStep?.(2);
      return;
    }
    if (code === 'ref_target_missing') {
      const path = detailString(err.detail, 'path');
      const targetKey = detailString(err.detail, 'targetKey') ?? '';
      if (path) {
        handlers.setRowErrors?.(
          new Map([[path, { kind: 'ref_target_missing', path, targetKey }]]),
        );
      }
      handlers.setStep?.(2);
      return;
    }
    if (code === 'cycle_detected') {
      const cycle = (err.detail as { cycle?: string[] } | undefined)?.cycle;
      handlers.setCycleBanner?.(
        cycle?.length
          ? `Cycle detected: ${cycle.join(' → ')}`
          : 'A reference cycle was detected.',
      );
      handlers.setStep?.(2);
      return;
    }
    if (code === 'stale_update') {
      handlers.setStaleUpdate?.(detailString(err.detail, 'currentUpdatedAt') ?? '');
      return;
    }
    if (code === 'key_rewrite_failed') {
      const detail = err.detail as { cycle?: string[] } | null;
      handlers.setKeyRewriteFailed?.(detail);
      return;
    }
    handlers.setGenericBanner?.(err.error ?? 'Something went wrong.');
  };
}

export function detailString(detail: unknown, key: string): string | undefined {
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const v = (detail as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
  }
  return undefined;
}
