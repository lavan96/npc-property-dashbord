import { useEffect, useMemo, useState } from 'react';

export type DashboardTheme = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

function resolveTheme(theme: DashboardTheme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme;
}

function applyThemeClass(theme: DashboardTheme): boolean {
  const resolvedTheme = resolveTheme(theme);
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  return resolvedTheme === 'dark';
}

export function useDashboardTheme() {
  const [theme, setTheme] = useState<DashboardTheme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem(THEME_STORAGE_KEY) as DashboardTheme) || 'system';
  });

  const [isDark, setIsDark] = useState(() =>
    typeof window === 'undefined' ? true : applyThemeClass(theme)
  );

  useEffect(() => {
    setIsDark(applyThemeClass(theme));
    localStorage.setItem(THEME_STORAGE_KEY, theme);

    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setIsDark(applyThemeClass('system'));

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const cycleTheme = useMemo(
    () => () => {
      setTheme((current) => {
        if (current === 'dark') return 'light';
        if (current === 'light') return 'system';
        return 'dark';
      });
    },
    []
  );

  return {
    theme,
    isDark,
    setTheme,
    cycleTheme,
  };
}