import type { BrandConfig } from './brand-types';
import { getReadableForeground, normalizeHslString, relativeLuminanceFromHsl } from './color-utils';

export interface BrandAccessibilityCheck {
  id: string;
  label: string;
  detail: string;
  status: 'pass' | 'warning' | 'critical';
}

function contrastRatio(foreground: string, background: string) {
  const fg = relativeLuminanceFromHsl(foreground);
  const bg = relativeLuminanceFromHsl(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getBrandAccessibilityChecks(config: BrandConfig): BrandAccessibilityCheck[] {
  const primary = normalizeHslString(config.primaryColor, '43 74% 49%');
  const accent = normalizeHslString(config.accentColor, primary);
  const primaryForeground = getReadableForeground(primary);
  const accentForeground = getReadableForeground(accent);

  const checks: BrandAccessibilityCheck[] = [
    {
      id: 'company-name',
      label: 'Company name',
      detail: config.companyName.trim()
        ? 'Brand name is set and ready for shell, auth, and browser tab usage.'
        : 'Add a company name so browser titles and shell branding are not blank.',
      status: config.companyName.trim() ? 'pass' : 'critical',
    },
    {
      id: 'primary-contrast',
      label: 'Primary action contrast',
      detail: `Primary actions render at ${contrastRatio(primary, primaryForeground).toFixed(2)}:1 contrast.`,
      status: contrastRatio(primary, primaryForeground) >= 4.5 ? 'pass' : contrastRatio(primary, primaryForeground) >= 3 ? 'warning' : 'critical',
    },
    {
      id: 'accent-contrast',
      label: 'Accent contrast',
      detail: `Accent surfaces render at ${contrastRatio(accent, accentForeground).toFixed(2)}:1 contrast.`,
      status: contrastRatio(accent, accentForeground) >= 4.5 ? 'pass' : contrastRatio(accent, accentForeground) >= 3 ? 'warning' : 'critical',
    },
    {
      id: 'logo-coverage',
      label: 'Brand asset coverage',
      detail: config.authLogo && (config.sidebarLogo || config.sidebarIcon) && config.favicon
        ? 'All primary slots have assets assigned.'
        : 'Consider adding auth, sidebar, and favicon assets for a fully white-labeled experience.',
      status: config.authLogo && (config.sidebarLogo || config.sidebarIcon) && config.favicon ? 'pass' : 'warning',
    },
  ];

  return checks;
}