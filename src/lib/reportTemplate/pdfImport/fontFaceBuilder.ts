/**
 * Pure embedded-font → `@font-face` entry builder for PDF reconstruction (R3).
 *
 * pdf.js reconstructs each embedded font program into an sfnt (OpenType) byte
 * buffer. This module turns that buffer (already base64-encoded by the impure
 * caller) into a `tokens.fontFaces` entry with a `data:` URL, a CSS-safe unique
 * family name, and a derived weight/style — so imported text renders in the
 * SOURCE font instead of a Helvetica substitute.
 *
 * Each embedded program gets its OWN family (unique by pdf.js `loadedName`),
 * carrying exactly one face, declared at its derived weight/style. The text
 * overlay is set to the same weight/style, so the browser matches the single
 * face exactly — no synthetic bold/italic, faithful glyphs.
 *
 * Pure + unit-tested. The impure pdf.js object resolution / base64 lives in
 * `extractPdfToTemplate`.
 */

export interface FontFaceEntry {
  family: string;
  src: string;                       // data: URL
  weight: number;
  style: 'normal' | 'italic';
  display: 'swap';
  source: 'embedded';
}

export interface EmbeddedFontInput {
  loadedName: string;                // pdf.js loadedName (also the commonObjs key)
  postscriptName?: string;           // font.name, e.g. "ABCDEF+Helvetica-Bold"
  base64: string;                    // base64 of the font bytes
  mimetype?: string;                 // pdf.js font.mimetype
  bold?: boolean;
  italic?: boolean;
}

export interface EmbeddedFontResult {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  face: FontFaceEntry;
}

/** Strip a subset tag ("ABCDEF+") and reduce to a CSS-identifier-safe token. */
export function sanitizeFamilyName(name: string): string {
  const base = (name || '').replace(/^[A-Z]{6}\+/, '').trim().replace(/[^A-Za-z0-9-]+/g, '');
  return base || 'Font';
}

/** Reduce a pdf.js loadedName to an alphanumeric uniqueness suffix. */
export function sanitizeId(loadedName: string): string {
  return (loadedName || '').replace(/[^A-Za-z0-9]+/g, '') || 'x';
}

/** Map a font/PostScript name (or pdf.js bold flag) to a numeric weight. */
export function deriveWeight(name: string, boldFlag?: boolean): number {
  const n = (name || '').toLowerCase();
  if (/thin|hairline/.test(n)) return 100;
  if (/extralight|ultralight/.test(n)) return 200;
  if (/semibold|demibold|demi/.test(n)) return 600;   // before "light"/"bold"
  if (/extrabold|ultrabold/.test(n)) return 800;
  if (/black|heavy/.test(n)) return 900;
  if (/light/.test(n)) return 300;
  if (/medium/.test(n)) return 500;
  if (/bold/.test(n)) return 700;
  return boldFlag ? 700 : 400;
}

export function deriveStyle(name: string, italicFlag?: boolean): 'normal' | 'italic' {
  if (/italic|oblique/i.test(name || '')) return 'italic';
  return italicFlag ? 'italic' : 'normal';
}

/** Choose a font `data:` MIME from pdf.js' mimetype (defaults to sfnt/otf). */
export function dataUrlMime(mimetype?: string): string {
  const m = (mimetype || '').toLowerCase();
  if (m.includes('woff2')) return 'font/woff2';
  if (m.includes('woff')) return 'font/woff';
  if (m.includes('truetype') || m.includes('ttf')) return 'font/ttf';
  return 'font/otf';
}

/** Build a self-hosted, embedded `@font-face` entry + the family/weight to use. */
export function buildEmbeddedFontFace(input: EmbeddedFontInput): EmbeddedFontResult {
  const psName = input.postscriptName || input.loadedName;
  let family = `${sanitizeFamilyName(psName)}-${sanitizeId(input.loadedName)}`;
  if (!/^[A-Za-z]/.test(family)) family = `F${family}`;  // CSS identifiers start with a letter
  const weight = deriveWeight(psName, input.bold);
  const style = deriveStyle(psName, input.italic);
  const src = `data:${dataUrlMime(input.mimetype)};base64,${input.base64}`;
  return {
    family,
    weight,
    style,
    face: { family, src, weight, style, display: 'swap', source: 'embedded' },
  };
}
