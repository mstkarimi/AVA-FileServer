import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, Theme } from '../lib/theme';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <button
      onClick={() => setTheme(NEXT[theme])}
      title={LABEL[theme] + ' (click to cycle)'}
      className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      aria-label={LABEL[theme]}
    >
      <Icon size={16} />
      <span className="sr-only">{ORDER.indexOf(theme) + 1} of {ORDER.length}</span>
    </button>
  );
}
