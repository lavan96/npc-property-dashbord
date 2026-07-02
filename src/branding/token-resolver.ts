import {
  defaultDarkTokenMap,
  defaultLightTokenMap,
  DEFAULT_ACCENT,
  DEFAULT_PRIMARY,
} from './brand-defaults';
import type { BrandConfig, BrandTokenMap, ResolvedBrandTokens } from './brand-types';
import {
  getReadableForeground,
  normalizeHslString,
  rotateHue,
  shiftLightness,
  shiftSaturation,
} from './color-utils';

function createChartPalette(primary: string, accent: string, isDark: boolean) {
  return {
    '--chart-1': primary,
    '--chart-2': accent,
    '--chart-3': rotateHue(primary, 120),
    '--chart-4': rotateHue(primary, -34),
    '--chart-5': rotateHue(accent, 54),
    '--chart-6': rotateHue(primary, 176),
    '--chart-7': shiftSaturation(rotateHue(accent, -90), isDark ? 10 : -2),
    '--chart-8': rotateHue(primary, 214),
    '--chart-9': shiftLightness(primary, isDark ? 12 : -12),
    '--chart-10': shiftLightness(accent, isDark ? 10 : -10),
  } satisfies BrandTokenMap;
}

function createLightTokens(config: BrandConfig): BrandTokenMap {
  const primary = normalizeHslString(config.primaryColor, DEFAULT_PRIMARY);
  const accent = normalizeHslString(config.accentColor, defaultLightTokenMap['--accent'] || DEFAULT_ACCENT);

  // Phase 2 contract: light mode starts from the luxury surface baseline and
  // brand colours are applied only to semantic emphasis tokens. Warm ivory,
  // porcelain, champagne, and sidebar surface tokens intentionally remain from
  // defaultLightTokenMap so a client's brand colour cannot wash out the entire
  // dashboard.
  return {
    ...defaultLightTokenMap,
    '--primary': primary,
    '--primary-foreground': getReadableForeground(primary),
    '--primary-hover': shiftLightness(primary, -7),
    '--accent': accent,
    '--accent-foreground': getReadableForeground(accent),
    '--info': defaultLightTokenMap['--info'],
    '--info-foreground': defaultLightTokenMap['--info-foreground'],
    '--info-light': defaultLightTokenMap['--info-light'],
    '--ring': primary,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': getReadableForeground(primary),
    '--sidebar-accent': accent,
    '--sidebar-accent-foreground': getReadableForeground(accent),
    '--sidebar-ring': primary,
    '--dashboard-primary-strong': primary,
    '--dashboard-primary-soft': shiftLightness(primary, 45),
    '--topbar-background': defaultLightTokenMap['--dashboard-surface'],
    '--sidebar-surface': defaultLightTokenMap['--sidebar-background'],
    '--mobile-nav-background': defaultLightTokenMap['--dashboard-surface'],
    ...createChartPalette(primary, accent, false),
  };
}

function createDarkTokens(config: BrandConfig): BrandTokenMap {
  const primary = normalizeHslString(config.primaryColor, DEFAULT_PRIMARY);
  const accent = normalizeHslString(config.accentColor, primary || DEFAULT_ACCENT);

  return {
    ...defaultDarkTokenMap,
    '--primary': primary,
    '--primary-foreground': getReadableForeground(primary),
    '--primary-hover': shiftLightness(primary, -7),
    '--accent': accent,
    '--accent-foreground': getReadableForeground(accent),
    '--info': rotateHue(primary, 160),
    '--info-foreground': getReadableForeground(rotateHue(primary, 160)),
    '--info-light': shiftLightness(rotateHue(primary, 160), -35),
    '--ring': primary,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': getReadableForeground(primary),
    '--sidebar-accent': accent,
    '--sidebar-accent-foreground': getReadableForeground(accent),
    '--sidebar-ring': primary,
    '--dashboard-primary-strong': primary,
    '--dashboard-primary-soft': shiftLightness(primary, -35),
    '--dashboard-border-strong': shiftLightness(primary, -20),
    '--topbar-background': defaultDarkTokenMap['--dashboard-surface'],
    '--sidebar-surface': defaultDarkTokenMap['--sidebar-background'],
    '--mobile-nav-background': defaultDarkTokenMap['--dashboard-surface'],
    ...createChartPalette(primary, accent, true),
  };
}

export function resolveBrandTokens(config: BrandConfig): ResolvedBrandTokens {
  return {
    light: createLightTokens(config),
    dark: createDarkTokens(config),
  };
}

export function applyBrandTokenMap(tokenMap: BrandTokenMap) {
  const root = document.documentElement;

  Object.entries(tokenMap).forEach(([token, value]) => {
    root.style.setProperty(token, value);
  });
}