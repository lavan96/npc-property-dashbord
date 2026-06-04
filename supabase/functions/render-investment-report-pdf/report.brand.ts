// Canonical brand tokens for the editorial Premium PDF track.
// One source of truth — referenced by report.css.ts and report.html.ts.
// Do NOT introduce per-section overrides here; keep this tight.

export const BRAND = {
  // Surfaces
  paper:      "#FAF7F1", // warm cream, the page background
  paperAlt:   "#F2ECDD", // panel / pull-quote ground
  ink:        "#0F0F10", // primary text
  inkMuted:   "#5C5648", // captions, eyebrows, secondary
  rule:       "#D8CBB6", // hairlines

  // Brand colour
  gold:       "#D4A843", // primary accent
  goldDeep:   "#B5892E", // accent on light grounds (better contrast)
  goldGlow:   "#F0CE6E", // foil highlights

  // Cover / dramatic grounds
  navyDeep:   "#061A33",
  navyMid:    "#0E2B4D",
  navyAccent: "#1D4F8B",

  // Semantic
  good:       "#3F8A4F",
  warn:       "#B07A1F",
  risk:       "#A23A28",
} as const;

export const TYPE = {
  // Distinctive display serif (already bundled in weasyprint-service)
  display:   "'Playfair Display', 'Fraunces', Georgia, serif",
  // Refined body sans
  body:      "'Inter', 'Helvetica Neue', Arial, sans-serif",
  // Mono for eyebrows, page numbers, ledger numerics
  mono:      "'IBM Plex Mono', 'SFMono-Regular', 'Consolas', monospace",
  // Editorial italic accents
  accent:    "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
} as const;

export const SCALE = {
  // pt sizes tuned for A4 at 22mm margins
  micro:        7.5,
  caption:      8.5,
  body:        10.5,
  bodyLg:      11.5,
  pullQuote:   22,
  h3:          14,
  h2:          20,
  h1:          34,
  coverTitle:  56,
  coverDisplay: 72,
} as const;

export const PAGE = {
  size: "A4",
  marginTop:    "22mm",
  marginRight:  "18mm",
  marginBottom: "22mm",
  marginLeft:   "18mm",
  // running chrome heights (subtracted from text area)
  headerHeight: "10mm",
  footerHeight: "10mm",
} as const;

// Helper: hex → rgba with explicit alpha
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
