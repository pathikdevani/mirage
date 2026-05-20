import { useEffect } from 'react';
import { Eye, Tag } from 'lucide-react';
import { cn } from '@mirage/ui-kit';
import { KEY_RE, type BrandColor, type IconName } from '../lib/types.js';
import { COLOR_BG } from '../lib/colors.js';
import { resolveIcon } from '../lib/icon.js';
import { IdentityPopover } from '../IdentityPopover.js';

export type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

interface Step1Props {
  name: string;
  setName: (v: string) => void;
  schemaKey: string;
  setKey: (v: string) => void;
  keyTouched: boolean;
  setKeyTouched: (v: boolean) => void;
  description: string;
  setDescription: (v: string) => void;
  color: BrandColor;
  setColor: (v: BrandColor) => void;
  icon: IconName;
  setIcon: (v: IconName) => void;
  tagsInput: string;
  setTagsInput: (v: string) => void;
  availability: AvailabilityState;
  nameError?: string | undefined;
  keyError?: string | undefined;
}

export function deriveKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
}

export function Step1Details(props: Step1Props) {
  const {
    name, setName,
    schemaKey, setKey, keyTouched, setKeyTouched,
    description, setDescription,
    color, setColor,
    icon, setIcon,
    tagsInput, setTagsInput,
    availability, nameError, keyError,
  } = props;

  // Auto-derive key on name blur (if user hasn't manually touched it yet).
  const handleNameBlur = (): void => {
    if (!keyTouched && name.trim()) setKey(deriveKey(name));
  };

  // If user types a key, it counts as touched.
  useEffect(() => {
    if (schemaKey && !keyTouched) {
      // No-op — touched flag is set on user-edit handler.
    }
  }, [schemaKey, keyTouched]);

  const tags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const Icon = resolveIcon(icon);
  const keyValid = KEY_RE.test(schemaKey);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-foreground">
            Schema name <span className="text-destructive">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="e.g. Person"
            autoFocus
            maxLength={80}
            className={cn(
              'h-10 w-full rounded-md border bg-background px-3 text-[14px] outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/10',
              nameError ? 'border-destructive' : 'border-input',
            )}
          />
          {nameError ? (
            <p className="mt-1 text-[11.5px] text-destructive">{nameError}</p>
          ) : (
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Human-readable title shown in the UI.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-foreground">
            Key <span className="text-destructive">*</span>
          </label>
          <div
            className={cn(
              'flex h-10 items-center overflow-hidden rounded-md border bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/10',
              (keyError || (schemaKey && !keyValid))
                ? 'border-destructive'
                : 'border-input',
            )}
          >
            <span className="border-r border-input px-2 font-mono text-[11.5px] text-muted-foreground">
              #/schema/
            </span>
            <input
              value={schemaKey}
              onChange={(e) => {
                setKey(e.target.value);
                if (!keyTouched) setKeyTouched(true);
              }}
              placeholder="person"
              maxLength={40}
              className="flex-1 bg-transparent px-3 font-mono text-[13px] outline-none placeholder:text-muted-foreground"
            />
            <AvailabilityBadge state={availability} valid={keyValid} value={schemaKey} />
          </div>
          {keyError ? (
            <p className="mt-1 text-[11.5px] text-destructive">{keyError}</p>
          ) : (
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Lowercase letters, digits, and hyphens. Used in <span className="font-mono">$ref</span> paths.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-foreground">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="What does this schema represent?"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-[14px] outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/10"
        />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">
          {description.length} / 500
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-foreground">
          Appearance
        </label>
        <IdentityPopover
          color={color}
          icon={icon}
          onChange={(next) => {
            setColor(next.color);
            setIcon(next.icon);
          }}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-foreground">
          Tags <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="pii, geo, internal"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/10"
        />
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
              >
                <Tag size={9} /> {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-10 w-10 flex-none items-center justify-center rounded-lg text-white',
              COLOR_BG[color],
            )}
          >
            <Icon size={20} strokeWidth={2} />
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <strong className="text-[14px] text-foreground">
                {name || 'Untitled schema'}
              </strong>
              <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {schemaKey || '—'}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {description || 'No description'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
            <Eye size={10} /> live preview
          </span>
        </div>
      </div>
    </div>
  );
}

interface AvailabilityBadgeProps {
  state: AvailabilityState;
  valid: boolean;
  value: string;
}

function AvailabilityBadge({ state, valid, value }: AvailabilityBadgeProps) {
  if (!value) return null;
  if (!valid) {
    return (
      <span className="mr-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10.5px] font-medium text-destructive">
        Invalid
      </span>
    );
  }
  if (state === 'checking') {
    return (
      <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
        Checking…
      </span>
    );
  }
  if (state === 'taken') {
    return (
      <span className="mr-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10.5px] font-medium text-destructive">
        Taken
      </span>
    );
  }
  if (state === 'available') {
    return (
      <span className="mr-2 rounded bg-brand-emerald/10 px-1.5 py-0.5 text-[10.5px] font-medium text-brand-emerald">
        Available
      </span>
    );
  }
  return null;
}
