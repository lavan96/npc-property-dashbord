/**
 * Universal import file-type detection + routing.
 *
 * The importer accepts ANY file. This module decides what a file actually is —
 * from its magic bytes first (most reliable), then MIME, then extension — and
 * routes it to the right worker:
 *   - 'pdf'     → extractPdfToTemplate
 *   - 'image'   → image reconstruct (raster formats)
 *   - 'svg'     → rasterise client-side → image reconstruct
 *   - 'text'    → text → PDF (pdf-lib) → pipeline
 *   - 'convert' → LibreOffice convert-to-pdf service → pipeline (office/html/rtf/…)
 *   - 'unsupported' → archives etc. (nothing to reconstruct)
 *
 * Pure + unit-tested. Magic-byte sniffing makes detection robust to wrong or
 * missing extensions/MIME (common with downloads and URL fetches).
 */

export type FileKind =
  | 'pdf' | 'image' | 'svg' | 'office' | 'html' | 'rtf' | 'csv' | 'text' | 'markdown'
  | 'archive' | 'unknown';

export type ImportRoute = 'pdf' | 'image' | 'svg' | 'text' | 'convert' | 'unsupported';

export interface DetectInput {
  name?: string | null;
  type?: string | null;          // MIME
  bytes?: ArrayLike<number> | null; // first bytes of the file (>= 16 recommended)
}

// ─── magic-byte sniffing ───────────────────────────────────────────────────────

type MagicResult = 'pdf' | 'image' | 'svg' | 'rtf' | 'html' | 'zip' | 'ole2' | null;

const ascii = (b: ArrayLike<number>, off: number, len: number): string => {
  let s = '';
  for (let i = 0; i < len && off + i < b.length; i++) s += String.fromCharCode(b[off + i]);
  return s;
};

/** Identify a file by its leading bytes. Returns a container hint for zip/ole2. */
export function detectMagic(bytes: ArrayLike<number> | null | undefined): MagicResult {
  const b = bytes;
  if (!b || b.length < 3) return null;
  const u = (i: number) => b[i];

  if (ascii(b, 0, 4) === '%PDF') return 'pdf';

  // raster images
  if (u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4e && u(3) === 0x47) return 'image';        // PNG
  if (u(0) === 0xff && u(1) === 0xd8 && u(2) === 0xff) return 'image';                          // JPEG
  if (ascii(b, 0, 3) === 'GIF') return 'image';                                                 // GIF
  if (ascii(b, 0, 4) === 'RIFF' && b.length >= 12 && ascii(b, 8, 4) === 'WEBP') return 'image'; // WEBP
  if (u(0) === 0x42 && u(1) === 0x4d) return 'image';                                           // BMP
  if ((u(0) === 0x49 && u(1) === 0x49 && u(2) === 0x2a && u(3) === 0x00) ||
      (u(0) === 0x4d && u(1) === 0x4d && u(2) === 0x00 && u(3) === 0x2a)) return 'image';       // TIFF
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {                                            // HEIC/AVIF
    const brand = ascii(b, 8, 4).toLowerCase();
    if (['heic', 'heix', 'heif', 'hevc', 'mif1', 'msf1', 'avif', 'avis'].includes(brand)) return 'image';
  }
  if (u(0) === 0x00 && u(1) === 0x00 && (u(2) === 0x01 || u(2) === 0x02) && u(3) === 0x00) return 'image'; // ICO/CUR

  if (ascii(b, 0, 5) === '{\\rtf') return 'rtf';
  if (u(0) === 0xd0 && u(1) === 0xcf && u(2) === 0x11 && u(3) === 0xe0) return 'ole2';          // legacy MS Office
  if (u(0) === 0x50 && u(1) === 0x4b && (u(2) === 0x03 || u(2) === 0x05 || u(2) === 0x07)) return 'zip'; // PK (docx/odf/epub/zip)

  // text-based markup (sniff the head, ignoring BOM/whitespace)
  const head = ascii(b, 0, Math.min(b.length, 256)).replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<head') || head.startsWith('<body')) return 'html';
  return null;
}

// ─── extension + MIME maps ─────────────────────────────────────────────────────

const EXT_MAP: Record<string, FileKind> = {
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', jfif: 'image', gif: 'image', webp: 'image',
  bmp: 'image', tif: 'image', tiff: 'image', heic: 'image', heif: 'image', avif: 'image', ico: 'image',
  svg: 'svg', svgz: 'svg',
  doc: 'office', docx: 'office', odt: 'office', dot: 'office', dotx: 'office', pages: 'office', wpd: 'office',
  ppt: 'office', pptx: 'office', odp: 'office', pps: 'office', ppsx: 'office', key: 'office',
  xls: 'office', xlsx: 'office', ods: 'office', xlsm: 'office', numbers: 'office',
  rtf: 'rtf',
  csv: 'csv', tsv: 'csv',
  txt: 'text', text: 'text', log: 'text',
  md: 'markdown', markdown: 'markdown', mdown: 'markdown', mkd: 'markdown',
  html: 'html', htm: 'html', xhtml: 'html',
  epub: 'office', fodt: 'office', fodp: 'office', fods: 'office',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive', dmg: 'archive',
};

export function detectFromExtension(name: string | null | undefined): FileKind | null {
  if (!name) return null;
  const m = /\.([a-z0-9]+)\s*$/i.exec(name.trim());
  if (!m) return null;
  return EXT_MAP[m[1].toLowerCase()] ?? null;
}

export function detectFromMime(type: string | null | undefined): FileKind | null {
  const t = (type || '').toLowerCase().split(';')[0].trim();
  if (!t) return null;
  if (t === 'application/pdf' || t === 'application/x-pdf') return 'pdf';
  if (t === 'image/svg+xml') return 'svg';
  if (t.startsWith('image/')) return 'image';
  if (t === 'text/rtf' || t === 'application/rtf') return 'rtf';
  if (t === 'text/csv' || t === 'text/tab-separated-values') return 'csv';
  if (t === 'text/markdown') return 'markdown';
  if (t === 'text/html' || t === 'application/xhtml+xml') return 'html';
  if (t.startsWith('text/')) return 'text';
  if (
    t.includes('word') || t.includes('presentation') || t.includes('spreadsheet') ||
    t.includes('officedocument') || t.includes('opendocument') ||
    t === 'application/msword' || t === 'application/vnd.ms-excel' || t === 'application/vnd.ms-powerpoint' ||
    t === 'application/epub+zip'
  ) return 'office';
  if (t === 'application/zip' || t === 'application/x-7z-compressed' || t === 'application/x-rar-compressed' || t === 'application/gzip' || t === 'application/x-tar') return 'archive';
  return null;
}

// ─── combine ───────────────────────────────────────────────────────────────────

/** Decide the file kind: magic bytes first, then MIME, then extension. */
export function detectFileKind(input: DetectInput): FileKind {
  const magic = detectMagic(input.bytes ?? null);
  const ext = detectFromExtension(input.name);
  const mime = detectFromMime(input.type);

  // Decisive magic results.
  if (magic === 'pdf' || magic === 'image' || magic === 'svg' || magic === 'rtf' || magic === 'html') return magic;
  // Zip container: it's docx/pptx/xlsx/odf/epub (→office) or a real archive.
  if (magic === 'zip') {
    if (ext === 'office') return 'office';
    if (ext === 'archive') return 'archive';
    return mime === 'office' ? 'office' : (ext ?? 'archive');
  }
  // Legacy MS Office container.
  if (magic === 'ole2') return ext === 'office' || mime === 'office' ? 'office' : 'office';

  // No decisive magic → MIME, then extension.
  return mime ?? ext ?? 'unknown';
}

/** Map a kind to the worker route. */
export function routeForKind(kind: FileKind): ImportRoute {
  switch (kind) {
    case 'pdf': return 'pdf';
    case 'image': return 'image';
    case 'svg': return 'svg';
    case 'text':
    case 'markdown': return 'text';
    case 'office':
    case 'html':
    case 'rtf':
    case 'csv': return 'convert';
    case 'archive': return 'unsupported';
    default: return 'convert'; // unknown → best-effort conversion (LibreOffice opens a lot)
  }
}

/** Convenience: detect + route in one call. */
export function routeForFile(input: DetectInput): { kind: FileKind; route: ImportRoute } {
  const kind = detectFileKind(input);
  return { kind, route: routeForKind(kind) };
}

const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF', image: 'image', svg: 'SVG', office: 'document', html: 'web page',
  rtf: 'rich text', csv: 'spreadsheet', text: 'text', markdown: 'Markdown',
  archive: 'archive', unknown: 'file',
};
export function describeKind(kind: FileKind): string { return KIND_LABEL[kind] ?? 'file'; }
