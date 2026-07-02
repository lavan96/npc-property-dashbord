import type { Dispatch, SetStateAction } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface EmailSignatureSettings {
  banner: string | null;
  name: string;
  title: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  disclaimer: string;
}

export interface BrandThemeConfig {
  primaryColor: string | null;
  accentColor: string | null;
  /** Category A brand accent (the "gold"). HSL token string. Cascades to --brand. */
  brandColor: string | null;
  /** Font allow-list key for body text (see brand-fonts.ts). */
  fontFamily: string | null;
  /** Font allow-list key for headings; null → inherits the body font. */
  headingFontFamily: string | null;
  /** Font scale key (compact | default | comfortable). */
  fontScale: string | null;
  darkModeDefault: ThemeMode;
  emailSignature: EmailSignatureSettings;
}

export interface BrandLogoConfig {
  auth: string | null;
  sidebar: string | null;
  sidebarIcon: string | null;
  favicon: string | null;
}

export interface BrandConfig {
  id?: string;
  authLogo: string | null;
  sidebarLogo: string | null;
  sidebarIcon: string | null;
  favicon: string | null;
  companyName: string;
  primaryColor: string | null;
  accentColor: string | null;
  brandColor: string | null;
  fontFamily: string | null;
  headingFontFamily: string | null;
  fontScale: string | null;
  darkModeDefault: ThemeMode;
  emailSignature: EmailSignatureSettings;
  themeConfig?: BrandThemeConfig;
  logoConfig?: BrandLogoConfig;
  themeVersion?: number;
}

export type WhiteLabelSettings = BrandConfig;

export type BrandTokenName = `--${string}`;

export type BrandTokenMap = Record<BrandTokenName, string>;

export interface ResolvedBrandTokens {
  light: BrandTokenMap;
  dark: BrandTokenMap;
}

export interface BrandContextValue {
  settings: WhiteLabelSettings;
  updateSettings: (newSettings: Partial<WhiteLabelSettings>) => void;
  isLoading: boolean;
  currentTheme: 'light' | 'dark';
  themeMode: ThemeMode;
  theme: ThemeMode;
  isDark: boolean;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
  setTheme: Dispatch<SetStateAction<ThemeMode>>;
  resolvedTokens: ResolvedBrandTokens;
}