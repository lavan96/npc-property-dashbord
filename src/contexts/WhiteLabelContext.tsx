import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface WhiteLabelSettings {
  authLogo: string | null;
  sidebarLogo: string | null;
  sidebarIcon: string | null;
  favicon: string | null;
  companyName: string;
  primaryColor: string | null; // HSL format: "43 74% 49%"
  accentColor: string | null;
}

interface WhiteLabelContextType {
  settings: WhiteLabelSettings;
  updateSettings: (newSettings: Partial<WhiteLabelSettings>) => void;
  isLoading: boolean;
}

const defaultSettings: WhiteLabelSettings = {
  authLogo: null,
  sidebarLogo: null,
  sidebarIcon: null,
  favicon: null,
  companyName: 'NPC Property',
  primaryColor: null,
  accentColor: null,
};

const STORAGE_KEY = 'whitelabel_settings';

// Helper to convert hex to HSL string (without hsl() wrapper)
export function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '43 74% 49%';
  
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Helper to convert HSL string to hex
export function hslToHex(hsl: string): string {
  const parts = hsl.match(/(\d+)\s+(\d+)%?\s+(\d+)%?/);
  if (!parts) return '#D4A017';
  
  const h = parseInt(parts[1]) / 360;
  const s = parseInt(parts[2]) / 100;
  const l = parseInt(parts[3]) / 100;
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


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

  // Apply custom colors to CSS variables
  useEffect(() => {
    const root = document.documentElement;
    
    if (settings.primaryColor) {
      root.style.setProperty('--primary', settings.primaryColor);
      root.style.setProperty('--ring', settings.primaryColor);
      root.style.setProperty('--sidebar-primary', settings.primaryColor);
      root.style.setProperty('--sidebar-ring', settings.primaryColor);
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--sidebar-primary');
      root.style.removeProperty('--sidebar-ring');
    }
    
    if (settings.accentColor) {
      root.style.setProperty('--accent', settings.accentColor);
      root.style.setProperty('--sidebar-accent', settings.accentColor);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--sidebar-accent');
    }
  }, [settings.primaryColor, settings.accentColor]);

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
