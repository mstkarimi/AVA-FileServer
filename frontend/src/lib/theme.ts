import { useState, useEffect, useCallback } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'theme';

function readPreference(): Theme {
  const v = localStorage.getItem(KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function effective(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function apply(theme: Theme): void {
  const eff = effective(theme);
  const root = document.documentElement;
  root.classList.toggle('dark', eff === 'dark');
  root.style.colorScheme = eff;
}

/**
 * Boot-time call (synchronous, before React mounts) — applies the saved
 * preference so there is no flash of the wrong theme.
 */
export function bootstrapTheme(): void {
  apply(readPreference());
}

/**
 * Hook: returns [theme, setTheme]. Persists to localStorage and reapplies
 * the document classes when the preference (or system color-scheme) changes.
 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => readPreference());

  useEffect(() => apply(theme), [theme]);

  // React to OS-level changes when in `system` mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(KEY, next);
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}
