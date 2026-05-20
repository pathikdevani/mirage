import { cn } from '@mirage/ui-kit';
import { BRAND_COLOR_BG } from '../lib/colors.js';
import { IconByName } from '../lib/icon.js';
import type { BrandColor, SetSchemaInclusion } from '../lib/types.js';

interface Step3Props {
  name: string;
  setKey: string;
  description: string;
  color: BrandColor;
  icon: string;
  tagsInput: string;
  salt: string;
  inclusions: SetSchemaInclusion[];
}

export function Step3Review({
  name,
  setKey,
  description,
  color,
  icon,
  tagsInput,
  salt,
  inclusions,
}: Step3Props) {
  const tags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const total = inclusions.reduce((s, i) => s + i.count, 0);
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl text-white',
              BRAND_COLOR_BG[color],
            )}
          >
            <IconByName name={icon} size={20} />
          </span>
          <div>
            <div className="text-[16px] font-semibold text-foreground">{name}</div>
            <div className="font-mono text-[12px] text-muted-foreground">{setKey}</div>
          </div>
        </div>
        {description && <p className="mt-3 text-[13px] text-muted-foreground">{description}</p>}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 font-mono text-[11.5px] text-muted-foreground">salt · {salt}</div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <h3 className="text-[14px] font-semibold text-foreground">
            Schemas · {inclusions.length} · Total {total.toLocaleString()} rows
          </h3>
        </header>
        <ul>
          {inclusions.map((inc) => (
            <li
              key={inc.schemaKey}
              className="flex items-center justify-between border-b border-border px-5 py-2 last:border-b-0"
            >
              <span className="font-mono text-[12.5px] text-foreground">{inc.schemaKey}</span>
              <span className="font-mono text-[12.5px] text-muted-foreground">
                {inc.count.toLocaleString()} rows
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
