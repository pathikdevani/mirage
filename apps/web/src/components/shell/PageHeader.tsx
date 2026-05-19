interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="border-b border-border px-8 py-6">
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
      )}
    </header>
  );
}
