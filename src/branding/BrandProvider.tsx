import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  BRAND_THEME_STORAGE_KEY,
  defaultBrandConfig,
  defaultEmailSignature,
  defaultBrandLogoConfig,
  defaultBrandThemeConfig,
} from './brand-defaults';
import { getBrandAssetSrc } from './brand-assets';
import { applyBrandTokenMap, resolveBrandTokens } from './token-resolver';
import type { BrandContextValue, BrandLogoConfig, BrandThemeConfig, ThemeMode, WhiteLabelSettings } from './brand-types';

const BrandContext = createContext<BrandContextValue | undefined>(undefined);

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialThemeMode(defaultTheme: ThemeMode): ThemeMode {
  if (typeof window === 'undefined') return defaultTheme;
  const storedTheme = localStorage.getItem(BRAND_THEME_STORAGE_KEY) as ThemeMode | null;
  return storedTheme || defaultTheme;
}

function mergeThemeConfig(themeConfig: Partial<BrandThemeConfig> | null | undefined): BrandThemeConfig {
  return {
    ...defaultBrandThemeConfig,
    ...themeConfig,
    emailSignature: {
      ...defaultEmailSignature,
      ...(themeConfig?.emailSignature || {}),
    },
  };
}

function mergeLogoConfig(logoConfig: Partial<BrandLogoConfig> | null | undefined): BrandLogoConfig {
  return {
    ...defaultBrandLogoConfig,
    ...logoConfig,
  };
}

function buildStructuredConfig(settings: WhiteLabelSettings) {
  const themeConfig: BrandThemeConfig = mergeThemeConfig({
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
    darkModeDefault: settings.darkModeDefault,
    emailSignature: settings.emailSignature,
  });

  const logoConfig: BrandLogoConfig = mergeLogoConfig({
    auth: settings.authLogo,
    sidebar: settings.sidebarLogo,
    sidebarIcon: settings.sidebarIcon,
    favicon: settings.favicon,
  });

  return {
    themeConfig,
    logoConfig,
    themeVersion: settings.themeVersion ?? 1,
  };
}

function mapDatabaseSettings(data: Record<string, unknown>): WhiteLabelSettings {
  const rawThemeConfig = (data.theme_config as Partial<BrandThemeConfig> | null | undefined) ?? null;
  const rawLogoConfig = (data.logo_config as Partial<BrandLogoConfig> | null | undefined) ?? null;
  const themeConfig = mergeThemeConfig(rawThemeConfig);
  const logoConfig = mergeLogoConfig(rawLogoConfig);

  return {
    id: data.id as string,
    authLogo: logoConfig.auth || (data.auth_logo as string) || null,
    sidebarLogo: logoConfig.sidebar || (data.sidebar_logo as string) || null,
    sidebarIcon: logoConfig.sidebarIcon || (data.sidebar_icon as string) || null,
    favicon: logoConfig.favicon || (data.favicon as string) || null,
    companyName: (data.company_name as string) || defaultBrandConfig.companyName,
    primaryColor: themeConfig.primaryColor || (data.primary_color as string) || null,
    accentColor: themeConfig.accentColor || (data.accent_color as string) || null,
    darkModeDefault: themeConfig.darkModeDefault || (data.dark_mode_default as ThemeMode) || defaultBrandConfig.darkModeDefault,
    emailSignature: mergeThemeConfig({
      emailSignature: {
        banner: themeConfig.emailSignature.banner || (data.email_signature_banner as string) || null,
        name: themeConfig.emailSignature.name || (data.email_signature_name as string) || defaultEmailSignature.name,
        title: themeConfig.emailSignature.title || (data.email_signature_title as string) || defaultEmailSignature.title,
        phone: themeConfig.emailSignature.phone || (data.email_signature_phone as string) || '',
        email: themeConfig.emailSignature.email || (data.email_signature_email as string) || '',
        website: themeConfig.emailSignature.website || (data.email_signature_website as string) || '',
        address: themeConfig.emailSignature.address || (data.email_signature_address as string) || '',
        disclaimer: themeConfig.emailSignature.disclaimer || (data.email_signature_disclaimer as string) || defaultEmailSignature.disclaimer,
      },
    }).emailSignature,
    themeConfig,
    logoConfig,
    themeVersion: (data.theme_version as number) || 1,
  };
}

function applyResolvedTheme(themeMode: ThemeMode, resolvedTokens: ReturnType<typeof resolveBrandTokens>) {
  const resolvedTheme = themeMode === 'system' ? getSystemTheme() : themeMode;
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  applyBrandTokenMap(resolvedTheme === 'dark' ? resolvedTokens.dark : resolvedTokens.light);
  return resolvedTheme;
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<WhiteLabelSettings>(defaultBrandConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialThemeMode(defaultBrandConfig.darkModeDefault));
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() =>
    themeMode === 'system' ? getSystemTheme() : themeMode
  );

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('whitelabel_settings')
          .select('*')
          .limit(1)
          .single();

        if (error) {
          console.error('Failed to fetch whitelabel settings:', error);
          return;
        }

        if (data) {
          const mapped = mapDatabaseSettings(data as Record<string, unknown>);
          setSettings(mapped);
          setThemeMode((prevTheme) => {
            if (typeof window === 'undefined') return mapped.darkModeDefault;
            const storedTheme = localStorage.getItem(BRAND_THEME_STORAGE_KEY) as ThemeMode | null;
            return storedTheme || prevTheme || mapped.darkModeDefault;
          });
        }
      } catch (error) {
        console.error('Failed to load whitelabel settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const resolvedTokens = useMemo(() => resolveBrandTokens(settings), [settings]);

  useEffect(() => {
    const applyTheme = (nextTheme: ThemeMode) => {
      const resolvedTheme = applyResolvedTheme(nextTheme, resolvedTokens);
      setCurrentTheme(resolvedTheme);
    };

    applyTheme(themeMode);
    localStorage.setItem(BRAND_THEME_STORAGE_KEY, themeMode);

    if (themeMode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [resolvedTokens, themeMode]);

  useEffect(() => {
    const favicon = getBrandAssetSrc(settings, 'favicon');
    if (!favicon) return;

    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (link) {
      link.href = favicon;
      return;
    }

    const newLink = document.createElement('link');
    newLink.rel = 'icon';
    newLink.href = favicon;
    document.head.appendChild(newLink);
  }, [settings]);

  useEffect(() => {
    if (settings.companyName) {
      document.title = `${settings.companyName} Dashboard`;
    }
  }, [settings.companyName]);

  const updateSettings = useCallback((newSettings: Partial<WhiteLabelSettings>) => {
    setSettings((prev) => {
      const updated: WhiteLabelSettings = {
        ...prev,
        ...newSettings,
        emailSignature: {
          ...prev.emailSignature,
          ...(newSettings.emailSignature || {}),
        },
      };
      const structured = buildStructuredConfig(updated);
      updated.themeConfig = structured.themeConfig;
      updated.logoConfig = structured.logoConfig;
      updated.themeVersion = structured.themeVersion;

      const saveToSupabase = async () => {
        try {
          const { error } = await supabase
            .from('whitelabel_settings')
            .update({
              auth_logo: updated.authLogo,
              sidebar_logo: updated.sidebarLogo,
              sidebar_icon: updated.sidebarIcon,
              favicon: updated.favicon,
              company_name: updated.companyName,
              primary_color: updated.primaryColor,
              accent_color: updated.accentColor,
              dark_mode_default: updated.darkModeDefault,
              email_signature_banner: updated.emailSignature.banner,
              email_signature_name: updated.emailSignature.name,
              email_signature_title: updated.emailSignature.title,
              email_signature_phone: updated.emailSignature.phone,
              email_signature_email: updated.emailSignature.email,
              email_signature_website: updated.emailSignature.website,
              email_signature_address: updated.emailSignature.address,
              email_signature_disclaimer: updated.emailSignature.disclaimer,
              theme_config: structured.themeConfig as unknown as Json,
              logo_config: structured.logoConfig as unknown as Json,
              theme_version: structured.themeVersion,
            })
            .eq('id', updated.id || '');

          if (error) {
            console.error('Failed to save whitelabel settings:', error);
          }
        } catch (error) {
          console.error('Failed to save whitelabel settings:', error);
        }
      };

      if (newSettings.darkModeDefault) {
        setThemeMode(newSettings.darkModeDefault);
      }

      void saveToSupabase();
      return updated;
    });
  }, []);

  const value = useMemo<BrandContextValue>(
    () => ({
      settings,
      updateSettings,
      isLoading,
      currentTheme,
      themeMode,
      theme: themeMode,
      isDark: currentTheme === 'dark',
      setThemeMode,
      setTheme: setThemeMode,
      resolvedTokens,
    }),
    [currentTheme, isLoading, resolvedTokens, settings, themeMode, updateSettings]
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const context = useContext(BrandContext);
  if (!context) {
    throw new Error('useBrand must be used within a BrandProvider');
  }
  return context;
}