import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BRAND_THEME_STORAGE_KEY,
  defaultBrandConfig,
  defaultEmailSignature,
} from './brand-defaults';
import { getBrandAssetSrc } from './brand-assets';
import { applyBrandTokenMap, resolveBrandTokens } from './token-resolver';
import type { BrandContextValue, ThemeMode, WhiteLabelSettings } from './brand-types';

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

function mapDatabaseSettings(data: Record<string, unknown>): WhiteLabelSettings {
  return {
    id: data.id as string,
    authLogo: (data.auth_logo as string) || null,
    sidebarLogo: (data.sidebar_logo as string) || null,
    sidebarIcon: (data.sidebar_icon as string) || null,
    favicon: (data.favicon as string) || null,
    companyName: (data.company_name as string) || defaultBrandConfig.companyName,
    primaryColor: (data.primary_color as string) || null,
    accentColor: (data.accent_color as string) || null,
    darkModeDefault: (data.dark_mode_default as ThemeMode) || defaultBrandConfig.darkModeDefault,
    emailSignature: {
      banner: (data.email_signature_banner as string) || null,
      name: (data.email_signature_name as string) || defaultEmailSignature.name,
      title: (data.email_signature_title as string) || defaultEmailSignature.title,
      phone: (data.email_signature_phone as string) || '',
      email: (data.email_signature_email as string) || '',
      website: (data.email_signature_website as string) || '',
      address: (data.email_signature_address as string) || '',
      disclaimer:
        (data.email_signature_disclaimer as string) || defaultEmailSignature.disclaimer,
    },
  };
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<WhiteLabelSettings>(defaultBrandConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialThemeMode(defaultBrandConfig.darkModeDefault));
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() =>
    theme === 'system' ? getSystemTheme() : theme
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
          setTheme((prevTheme) => {
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
      const resolvedTheme = nextTheme === 'system' ? getSystemTheme() : nextTheme;
      setCurrentTheme(resolvedTheme);
      document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
      applyBrandTokenMap(resolvedTheme === 'dark' ? resolvedTokens.dark : resolvedTokens.light);
    };

    applyTheme(theme);
    localStorage.setItem(BRAND_THEME_STORAGE_KEY, theme);

    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [resolvedTokens, theme]);

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
        setTheme(newSettings.darkModeDefault);
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
      theme,
      isDark: currentTheme === 'dark',
      setTheme,
      resolvedTokens,
    }),
    [currentTheme, isLoading, resolvedTokens, settings, theme, updateSettings]
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