interface ComingSoonChipProps {
  /** Slight visual tweak when placed inline next to a control vs. next to a label. */
  variant?: 'label' | 'inline';
}

export function ComingSoonChip({ variant = 'label' }: ComingSoonChipProps) {
  const isInline = variant === 'inline';
  return (
    <span
      className={
        isInline
          ? 'ml-2 inline-flex h-[18px] items-center rounded-full bg-muted px-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground'
          : 'ml-2 inline-flex h-4 items-center rounded-full bg-muted px-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground'
      }
    >
      Soon
    </span>
  );
}
