import type { ValueExpr } from '@mirage/types';
import { SegmentEditor, type RefField } from './SegmentEditor.js';
import type { Schema } from '../lib/types.js';

export type { RefField } from './SegmentEditor.js';

export interface FakerCellProps {
  value: ValueExpr | undefined;
  onChange: (next: ValueExpr | undefined) => void;
  // `workspaceSchemas` is now consumed via SegmentEditorContext at the
  // PropertyEditor root, but we keep it in the prop signature so existing
  // callers don't have to change in lockstep with the context wiring.
  workspaceSchemas?: Schema[];
  invalid: boolean;
  siblingFields: RefField[];
  ownFieldName: string;
}

export function FakerCell({
  value,
  onChange,
  invalid,
  siblingFields,
  ownFieldName,
}: FakerCellProps) {
  return (
    <SegmentEditor
      value={value}
      onChange={onChange}
      siblingFields={siblingFields}
      ownFieldName={ownFieldName}
      invalid={invalid}
    />
  );
}
