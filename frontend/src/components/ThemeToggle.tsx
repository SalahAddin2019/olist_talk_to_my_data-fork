import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type Theme = 'system' | 'light' | 'dark';

const options = [
  { value: 'system', label: 'System theme', icon: Monitor },
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
] as const;

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = document.documentElement.dataset.theme;
    return initial === 'light' || initial === 'dark' ? initial : 'system';
  });

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {
      // Not persisted; the choice still applies to this page.
    }
  }

  return { theme, onThemeChange: choose };
}

export default function ThemeToggle({
  theme,
  onThemeChange,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => onThemeChange(value)}
          className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:text-ink aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-sm"
        >
          <Icon aria-hidden="true" size={14} />
        </button>
      ))}
    </div>
  );
}
