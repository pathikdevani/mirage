import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider.js';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const Icon = theme === 'dark' ? Sun : Moon;
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}
