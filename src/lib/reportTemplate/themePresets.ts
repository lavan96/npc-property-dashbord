/**
 * Curated theme presets — apply a full brand identity (colors + fonts + spacing)
 * to a template's tokens in one click. Pairs with the Tokens editor and the
 * Command Palette ("Apply theme: …").
 */
import type { Tokens } from './templateSchema';

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  swatch: string[];
  tokens: Tokens;
}

const baseSpacing = { gutter: 16, sectionGap: 24, padding: 24 };

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight-gold',
    label: 'Midnight Gold',
    description: 'Dark luxe — premium investment / private-client reports.',
    swatch: ['#0d0d0d', '#1a1a1a', '#bf9b50', '#f0d78c'],
    tokens: {
      colors: {
        bg: '#0d0d0d', surface: '#1a1a1a', text: '#ffffff',
        muted: '#9a9a9a', primary: '#bf9b50', accent: '#f0d78c',
        success: '#5fb27a', danger: '#e06b6b',
      },
      fonts: { heading: 'Helvetica', body: 'Helvetica', mono: 'Courier' },
      spacing: baseSpacing,
    },
  },
  {
    id: 'paper-ink',
    label: 'Paper & Ink',
    description: 'Editorial off-white & rich black — Swiss-inspired clarity.',
    swatch: ['#f5f3ee', '#e8e4dd', '#2d2d2d', '#0d0d0d'],
    tokens: {
      colors: {
        bg: '#f5f3ee', surface: '#ffffff', text: '#0d0d0d',
        muted: '#6b6b6b', primary: '#2d2d2d', accent: '#bf6a3a',
        success: '#3a7a4f', danger: '#a8302a',
      },
      fonts: { heading: 'Times', body: 'Helvetica', mono: 'Courier' },
      spacing: baseSpacing,
    },
  },
  {
    id: 'navy-trust',
    label: 'Navy Trust',
    description: 'Finance, legal, enterprise — credibility-first palette.',
    swatch: ['#0f1b3d', '#1e3a5f', '#3b6fa0', '#e8edf3'],
    tokens: {
      colors: {
        bg: '#ffffff', surface: '#e8edf3', text: '#0f1b3d',
        muted: '#5a6a85', primary: '#1e3a5f', accent: '#3b6fa0',
        success: '#1f7a4d', danger: '#b3322a',
      },
      fonts: { heading: 'Helvetica', body: 'Helvetica', mono: 'Courier' },
      spacing: baseSpacing,
    },
  },
  {
    id: 'sunset-blaze',
    label: 'Sunset Blaze',
    description: 'High-energy marketing decks — warm gradient palette.',
    swatch: ['#ff6b35', '#f7931e', '#e84393', '#6c5ce7'],
    tokens: {
      colors: {
        bg: '#ffffff', surface: '#fff5ee', text: '#1a1a1a',
        muted: '#7a7a7a', primary: '#e84393', accent: '#ff6b35',
        success: '#3a8a4f', danger: '#c23a2a',
      },
      fonts: { heading: 'Helvetica', body: 'Helvetica', mono: 'Courier' },
      spacing: baseSpacing,
    },
  },
  {
    id: 'forest-moss',
    label: 'Forest & Moss',
    description: 'Organic, sustainability, wellness — grounded greens.',
    swatch: ['#1a3c2a', '#2d5a3d', '#5a8a5c', '#a0c49d'],
    tokens: {
      colors: {
        bg: '#f5f6f1', surface: '#ffffff', text: '#1a3c2a',
        muted: '#6b7a6e', primary: '#2d5a3d', accent: '#5a8a5c',
        success: '#3a8a4f', danger: '#a8302a',
      },
      fonts: { heading: 'Times', body: 'Helvetica', mono: 'Courier' },
      spacing: baseSpacing,
    },
  },
  {
    id: 'arctic-frost',
    label: 'Arctic Frost',
    description: 'Crisp, pristine SaaS — cool blues on white.',
    swatch: ['#e8f0f8', '#b8d4e8', '#6ba3c8', '#2e6b8a'],
    tokens: {
      colors: {
        bg: '#ffffff', surface: '#e8f0f8', text: '#0c2340',
        muted: '#5d738a', primary: '#2e6b8a', accent: '#6ba3c8',
        success: '#3a8a4f', danger: '#b3322a',
      },
      fonts: { heading: 'Helvetica', body: 'Helvetica', mono: 'Courier' },
      spacing: baseSpacing,
    },
  },
];

export function getThemePreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}
