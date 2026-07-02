import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandProvider, useBrand } from '../BrandProvider';
import { defaultBrandConfig } from '../brand-defaults';
import {
  clearPersistedDraft,
  loadPersistedDraft,
  loadStoredBrandPresets,
  savePersistedDraft,
  saveStoredBrandPresets,
  type StoredBrandPreset,
} from '../brand-draft-storage';

const updateMock = vi.fn();
let databaseRow: Record<string, unknown> | null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table !== 'whitelabel_settings') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: vi.fn(() => ({
          limit: vi.fn(() => ({
            single: vi.fn(async () => ({ data: databaseRow, error: null })),
          })),
        })),
        update: updateMock,
      };
    }),
  },
}));

function BrandProbe() {
  const { settings, updateSettings, isLoading, currentTheme, themeMode, resolvedTokens } = useBrand();

  return (
    <div>
      <p data-testid="loading">{String(isLoading)}</p>
      <p data-testid="company">{settings.companyName}</p>
      <p data-testid="primary">{settings.primaryColor}</p>
      <p data-testid="accent">{settings.accentColor}</p>
      <p data-testid="theme-mode">{themeMode}</p>
      <p data-testid="current-theme">{currentTheme}</p>
      <p data-testid="sidebar-logo">{settings.sidebarLogo}</p>
      <p data-testid="favicon">{settings.favicon}</p>
      <p data-testid="soft-token">{resolvedTokens.light['--dashboard-primary-soft']}</p>
      <button
        type="button"
        onClick={() =>
          updateSettings({
            companyName: 'Naidu Advisory',
            primaryColor: '285 90% 45%',
            accentColor: '205 95% 45%',
            darkModeDefault: 'dark',
            authLogo: 'https://cdn.example.com/auth.png',
            sidebarLogo: 'https://cdn.example.com/sidebar.png',
            sidebarIcon: 'https://cdn.example.com/sidebar-icon.png',
            favicon: 'https://cdn.example.com/favicon.png',
          })
        }
      >
        Save brand changes
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <BrandProvider>
      <BrandProbe />
    </BrandProvider>
  );
}

describe('BrandProvider persistence and theme application', () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
    document.head.innerHTML = '';
    document.title = '';

    databaseRow = {
      id: 'brand-row-1',
      company_name: 'Loaded Brand',
      primary_color: '210 80% 50%',
      accent_color: '25 85% 52%',
      dark_mode_default: 'light',
      auth_logo: 'https://cdn.example.com/loaded-auth.png',
      sidebar_logo: 'https://cdn.example.com/loaded-sidebar.png',
      sidebar_icon: 'https://cdn.example.com/loaded-sidebar-icon.png',
      favicon: 'https://cdn.example.com/loaded-favicon.png',
      email_signature_name: 'Advisor',
      email_signature_title: 'Principal',
      email_signature_phone: '555',
      email_signature_email: 'advisor@example.com',
      email_signature_website: 'example.com',
      email_signature_address: '1 Main St',
      email_signature_disclaimer: 'Disclaimer',
      theme_version: 1,
    };
  });

  it('loads whitelabel_settings, resolves light tokens, and applies document identity', async () => {
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    expect(screen.getByTestId('company')).toHaveTextContent('Loaded Brand');
    expect(screen.getByTestId('primary')).toHaveTextContent('210 80% 50%');
    expect(screen.getByTestId('accent')).toHaveTextContent('25 85% 52%');
    expect(screen.getByTestId('sidebar-logo')).toHaveTextContent('https://cdn.example.com/loaded-sidebar.png');
    expect(screen.getByTestId('favicon')).toHaveTextContent('https://cdn.example.com/loaded-favicon.png');

    await waitFor(() => expect(document.title).toBe('Loaded Brand Dashboard'));
    expect(document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.href).toBe('https://cdn.example.com/loaded-favicon.png');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('42 52% 96%');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('210 80% 50%');
  });

  it('persists live brand changes with legacy columns and structured JSON configs', async () => {
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    screen.getByRole('button', { name: 'Save brand changes' }).click();

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const persisted = updateMock.mock.calls[0][0];

    expect(persisted).toMatchObject({
      company_name: 'Naidu Advisory',
      primary_color: '285 90% 45%',
      accent_color: '205 95% 45%',
      dark_mode_default: 'dark',
      auth_logo: 'https://cdn.example.com/auth.png',
      sidebar_logo: 'https://cdn.example.com/sidebar.png',
      sidebar_icon: 'https://cdn.example.com/sidebar-icon.png',
      favicon: 'https://cdn.example.com/favicon.png',
      theme_version: 1,
    });
    expect(persisted.theme_config).toMatchObject({
      primaryColor: '285 90% 45%',
      accentColor: '205 95% 45%',
      darkModeDefault: 'dark',
    });
    expect(persisted.logo_config).toMatchObject({
      auth: 'https://cdn.example.com/auth.png',
      sidebar: 'https://cdn.example.com/sidebar.png',
      sidebarIcon: 'https://cdn.example.com/sidebar-icon.png',
      favicon: 'https://cdn.example.com/favicon.png',
    });

    await waitFor(() => expect(document.title).toBe('Naidu Advisory Dashboard'));
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('0 0% 4%');
    expect(screen.getByTestId('soft-token')).toHaveTextContent('285 29% 90%');
  });
});

describe('Branding drafts and presets', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves, restores, clears, and reapplies local brand drafts and presets', () => {
    const draftSettings = {
      ...defaultBrandConfig,
      companyName: 'Draft Brand',
      primaryColor: '285 90% 45%',
      accentColor: '205 95% 45%',
      authLogo: 'https://cdn.example.com/auth.png',
      sidebarLogo: 'https://cdn.example.com/sidebar.png',
      sidebarIcon: 'https://cdn.example.com/sidebar-icon.png',
      favicon: 'https://cdn.example.com/favicon.png',
    };

    const savedDraft = savePersistedDraft(draftSettings);
    expect(loadPersistedDraft()).toEqual(savedDraft);

    const preset: StoredBrandPreset = {
      ...savedDraft,
      id: 'preset-1',
      name: 'Luxury Draft',
    };
    saveStoredBrandPresets([preset]);
    expect(loadStoredBrandPresets()).toEqual([preset]);

    clearPersistedDraft();
    expect(loadPersistedDraft()).toBeNull();
  });
});
