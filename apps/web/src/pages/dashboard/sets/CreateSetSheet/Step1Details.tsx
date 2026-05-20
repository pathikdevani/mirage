import type { ChangeEvent, ReactNode } from 'react';
import { Shuffle } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { BRAND_COLORS, BRAND_COLOR_BG } from '../lib/colors.js';
import { IconByName, SET_ICON_NAMES } from '../lib/icon.js';
import type { BrandColor } from '../lib/types.js';

export type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

interface Step1Props {
  name: string;
  setName: (v: string) => void;
  setKey: (v: string) => void;
  schemaSetKey: string;
  keyTouched: boolean;
  setKeyTouched: (b: boolean) => void;
  description: string;
  setDescription: (v: string) => void;
  color: BrandColor;
  setColor: (c: BrandColor) => void;
  icon: string;
  setIcon: (n: string) => void;
  tagsInput: string;
  setTagsInput: (v: string) => void;
  salt: string;
  setSalt: (v: string) => void;
  availability: AvailabilityState;
  nameError?: string;
  keyError?: string;
}

export function deriveKey(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 40)
    .replaceAll(/^[^a-z]+/g, '');
}

export function Step1Details({
  name,
  setName,
  setKey,
  schemaSetKey,
  keyTouched: _keyTouched,
  setKeyTouched,
  description,
  setDescription,
  color,
  setColor,
  icon,
  setIcon,
  tagsInput,
  setTagsInput,
  salt,
  setSalt,
  availability,
  nameError,
  keyError,
}: Step1Props) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" error={nameError}>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          placeholder="UAE residents — pilot"
        />
      </Field>
      <Field label="Key" error={keyError} hint={availabilityHint(availability)}>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-[13px] text-foreground"
          value={schemaSetKey}
          onChange={(e) => {
            setKeyTouched(true);
            setKey(e.target.value);
          }}
          placeholder="uae-residents-pilot"
        />
      </Field>
      <Field label="Description">
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this Set is for"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Colour">
          <div className="flex gap-1.5">
            {BRAND_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  'h-7 w-7 rounded-md ring-offset-2 transition',
                  BRAND_COLOR_BG[c],
                  c === color && 'ring-2 ring-foreground',
                )}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
        <Field label="Icon">
          <div className="flex flex-wrap gap-1.5">
            {SET_ICON_NAMES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setIcon(n)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background text-foreground',
                  n === icon && 'border-foreground bg-accent',
                )}
                aria-label={n}
              >
                <IconByName name={n} size={13} />
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Tags" hint="Comma-separated">
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="pilot, qa"
        />
      </Field>

      <Field label="Salt" hint="Used to make runs deterministic">
        <div className="flex gap-2">
          <input
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-[13px] text-foreground"
            value={salt}
            onChange={(e) => setSalt(e.target.value)}
            placeholder="mirage-2026-001"
          />
          <button
            type="button"
            onClick={() => setSalt('mirage-' + Math.random().toString(36).slice(2, 10))}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            <Shuffle size={13} /> Random
          </button>
        </div>
      </Field>
    </div>
  );
}

function availabilityHint(a: AvailabilityState): string | undefined {
  switch (a) {
    case 'checking':
      return 'Checking…';
    case 'available':
      return 'Available';
    case 'taken':
      return 'Already in use';
    case 'invalid':
      return 'Invalid characters';
    default:
      return undefined;
  }
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && (
          <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
            · {hint}
          </span>
        )}
      </span>
      {children}
      {error && <span className="text-[11.5px] text-destructive">{error}</span>}
    </label>
  );
}
