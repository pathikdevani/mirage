import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { Schema } from '../lib/types.js';

export interface JsonTabContentProps {
  draft: Schema;
}

export function JsonTabContent({ draft }: JsonTabContentProps) {
  const text = useMemo(() => {
    const body = {
      key: draft.key,
      name: draft.name,
      ...(draft.description ? { description: draft.description } : {}),
      color: draft.color,
      icon: draft.icon,
      tags: draft.tags ?? [],
      properties: draft.properties ?? [],
    };
    return JSON.stringify(body, null, 2);
  }, [draft]);

  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore; clipboard not available
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center justify-between border-b border-border px-4 py-2 text-[12px]">
        <span className="text-muted-foreground">Schema JSON</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-[11.5px] font-medium hover:bg-accent"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-5 text-foreground">
        {text}
      </pre>
    </div>
  );
}
