// Per-integration brand profiles.
// Logos come from Simple Icons CDN (SVG, no auth, cached on their edge).
// `slug` is the simple-icons slug — see https://simpleicons.org
// `color` is the official brand hex (used for icon halo, header wash, hover ring).
// Third-party brand identity is not a theme token — hex is correct here.

export interface BrandProfile {
  /** simple-icons slug — omit to fall back to the lucide icon in Integrations.tsx */
  slug?: string;
  /** Official brand hex, no leading # */
  color: string;
  /** Optional secondary hex for two-tone wash (Gemini spectrum, etc.) */
  color2?: string;
  /** Legibility of the brand color on the header wash — currently informational */
  luminance?: 'light' | 'dark';
}

export const BRAND_PROFILES: Record<string, BrandProfile> = {
  openai:      { slug: 'openai',           color: '10A37F', luminance: 'dark' },
  anthropic:   { slug: 'anthropic',        color: 'D97757', luminance: 'dark' },
  gemini:      { slug: 'googlegemini',     color: '4285F4', color2: '9B72CB', luminance: 'dark' },
  perplexity:  { slug: 'perplexity',       color: '20808D', luminance: 'dark' },
  openrouter:  { slug: 'openrouter',       color: '6467F2', luminance: 'dark' },
  // xAI's mark on simple-icons is `x`; keep for now, falls back gracefully if missing.
  xai:         { slug: 'x',                color: '000000', luminance: 'dark' },
  airtable:    { slug: 'airtable',         color: '18BFFF', luminance: 'dark' },
  twilio:      { slug: 'twilio',           color: 'F22F46', luminance: 'dark' },
  microsoft:   { slug: 'microsoft',        color: '0078D4', luminance: 'dark' },
  make:        { slug: 'make',             color: '6D00CC', luminance: 'dark' },
  cloudflare:  { slug: 'cloudflare',       color: 'F38020', luminance: 'dark' },
  // No canonical simple-icons slug — brand color only, lucide icon renders.
  gohighlevel: {                           color: 'FFB800', luminance: 'dark' },
  vapi:        {                           color: '14B8A6', luminance: 'dark' },
};

export function getBrandProfile(id: string): BrandProfile | undefined {
  return BRAND_PROFILES[id];
}

/** Build the Simple Icons CDN URL for a colored SVG mark. */
export function brandLogoUrl(slug: string, colorHex: string): string {
  return `https://cdn.simpleicons.org/${slug}/${colorHex}`;
}
