import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface WhiteLabelSettings {
  authLogo: string | null;
  sidebarLogo: string | null;
  favicon: string | null;
  companyName: string;
  primaryColor?: string;
}

interface WhiteLabelContextType {
  settings: WhiteLabelSettings;
  updateSettings: (newSettings: Partial<WhiteLabelSettings>) => void;
  isLoading: boolean;
}

const defaultSettings: WhiteLabelSettings = {
  authLogo: null,
  sidebarLogo: null,
  favicon: null,
  companyName: 'NPC Property',
};

const STORAGE_KEY = 'whitelabel_settings';

const WhiteLabelContext = createContext<WhiteLabelContextType | undefined>(undefined);

export function WhiteLabelProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<WhiteLabelSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load whitelabel settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Apply favicon whenever it changes
  useEffect(() => {
    if (settings.favicon) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) {
        link.href = settings.favicon;
      } else {
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.href = settings.favicon;
        document.head.appendChild(newLink);
      }
    }
  }, [settings.favicon]);

  // Update document title with company name
  useEffect(() => {
    if (settings.companyName) {
      document.title = `${settings.companyName} Dashboard`;
    }
  }, [settings.companyName]);

  const updateSettings = useCallback((newSettings: Partial<WhiteLabelSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <WhiteLabelContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </WhiteLabelContext.Provider>
  );
}

export function useWhiteLabel() {
  const context = useContext(WhiteLabelContext);
  if (context === undefined) {
    throw new Error('useWhiteLabel must be used within a WhiteLabelProvider');
  }
  return context;
}
