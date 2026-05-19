const BRAND_VIOLET = 'hsl(262 83% 58%)';
const BRAND_CYAN = 'hsl(188 86% 53%)';

interface MirageLogoProps {
  size?: number;
}

export function MirageLogo({ size = 28 }: MirageLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="mirage-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={BRAND_VIOLET} />
          <stop offset="100%" stopColor={BRAND_CYAN} />
        </linearGradient>
      </defs>
      <path
        d="M3 10 Q 10 4, 17 10 T 29 10"
        fill="none"
        stroke="url(#mirage-logo-grad)"
        strokeWidth="2.25"
        strokeLinecap="round"
        opacity="1"
      />
      <path
        d="M3 16 Q 10 10, 17 16 T 29 16"
        fill="none"
        stroke="url(#mirage-logo-grad)"
        strokeWidth="2.25"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M3 22 Q 10 16, 17 22 T 29 22"
        fill="none"
        stroke="url(#mirage-logo-grad)"
        strokeWidth="2.25"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}
