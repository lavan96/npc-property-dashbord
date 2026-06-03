/**
 * Batch 13 #66 — Finance partner theme & density.
 * Tiny client-side applier that toggles a class on <html>; index.css can
 * pin overrides on `.finance-theme-{name}` / `.finance-density-compact`.
 */
export type FinanceTheme = 'dark' | 'midnight' | 'graphite';
export type FinanceDensity = 'comfortable' | 'compact';

const THEME_KEY = 'finance_theme';
const DENSITY_KEY = 'finance_density';
const THEMES: FinanceTheme[] = ['dark', 'midnight', 'graphite'];

export function getCachedTheme(): FinanceTheme {
  try {
    const v = localStorage.getItem(THEME_KEY) as FinanceTheme | null;
    return v && THEMES.includes(v) ? v : 'dark';
  } catch { return 'dark'; }
}

export function getCachedDensity(): FinanceDensity {
  try {
    return (localStorage.getItem(DENSITY_KEY) as FinanceDensity) || 'comfortable';
  } catch { return 'comfortable'; }
}

export function applyFinanceTheme(theme: FinanceTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  THEMES.forEach(t => root.classList.remove(`finance-theme-${t}`));
  root.classList.add(`finance-theme-${theme}`);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

export function applyFinanceDensity(density: FinanceDensity) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('finance-density-compact', density === 'compact');
  try { localStorage.setItem(DENSITY_KEY, density); } catch {}
}

export function bootFinanceAppearance() {
  applyFinanceTheme(getCachedTheme());
  applyFinanceDensity(getCachedDensity());
}
