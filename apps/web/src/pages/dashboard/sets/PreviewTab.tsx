import { Sparkles } from 'lucide-react';

export function PreviewTab() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Sparkles size={26} strokeWidth={1.5} />
      </span>
      <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
        Preview rows after a run
      </h3>
      <p className="max-w-md text-[13px] text-muted-foreground">
        Generation isn't wired up yet. Once the engine + run pipeline land, this tab will show a
        live, filterable view of the rows your Set produces.
      </p>
    </div>
  );
}
