import { useMemo } from 'react';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';

export type DashboardTheme = 'light' | 'dark' | 'system';

export function useDashboardTheme() {
  const { theme, isDark, setTheme } = useWhiteLabel();

  const cycleTheme = useMemo(
    () => () => {
      setTheme((current) => {
        if (current === 'dark') return 'light';
        if (current === 'light') return 'system';
        return 'dark';
      });
    },
    [setTheme]
  );

  return {
    theme,
    isDark,
    setTheme,
    cycleTheme,
  };
}