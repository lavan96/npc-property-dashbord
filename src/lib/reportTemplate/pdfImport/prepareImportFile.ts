/**
 * Universal import intake (browser-side).
 *
 * Accepts ANY file, detects what it really is (magic bytes + MIME + extension),
 * and normalises it into something the reconstruction pipeline understands —
 * a PDF or a raster image — by routing to the right worker:
 *   pdf      → as-is (PDF pipeline)
 *   image    → as-is (image reconstruct)
 *   svg      → rasterised to PNG (image)
 *   text/md  → laid out into a PDF (pdf-lib)
 *   office/html/rtf/csv/unknown → LibreOffice `convert-to-pdf` service → PDF
 *   archive  → rejected (nothing to reconstruct)
 *
 * The detection/routing brain is the pure, unit-tested `importFileType`. The
 * transforms here are impure (canvas / pdf-lib / an edge function) so they live
 * outside the tested core.
 */
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { routeForFile, describeKind, type FileKind, type ImportRoute } from '@/lib/reportTemplate/importFileType';

export interface PreparedImport {
  /** A PDF or raster-image File the pipeline can consume. */
  file: File;
  kind: 'pdf' | 'image';
  /** What the original upload was detected as. */
  sourceKind: FileKind;
  route: ImportRoute;
  converted: boolean;
}

const MAX_CONVERT_BYTES = 20 * 1024 * 1024; // service request-body ceiling

function stripExt(name: string): string { return name.replace(/\.[^./\\]+$/, ''); }

async function fileToBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

function base64ToFile(b64: string, filename: string, type: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image decode failed'));
    im.src = src;
  });
}

/** SVG → PNG via an offscreen canvas (white background, 2× for crispness). */
async function rasterizeSvg(file: File): Promise<File> {
  const text = await file.text();
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const w = Math.min(4000, Math.max(1, img.naturalWidth || 1024));
    const h = Math.min(4000, Math.max(1, img.naturalHeight || 768));
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'));
    canvas.width = 0; canvas.height = 0;
    if (!blob) throw new Error('SVG rasterisation failed');
    return new File([blob], `${stripExt(file.name)}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Plain text / Markdown → a laid-out PDF (real text, so it stays editable). */
async function textToPdf(file: File): Promise<File> {
  const raw = await file.text();
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 11, margin = 48, pageW = 595, pageH = 842, lineH = size * 1.45, maxW = pageW - margin * 2;
  // WinAnsi-safe (StandardFonts can't draw arbitrary unicode).
  const safe = (s: string) => s.replace(/\t/g, '    ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  const wrap = (line: string): string[] => {
    const words = safe(line).split(/(\s+)/);
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur + w;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) { out.push(cur.trimEnd()); cur = w.trimStart(); }
      else cur = test;
    }
    out.push(cur);
    // hard-break any single token wider than the page
    return out.flatMap((l) => {
      if (font.widthOfTextAtSize(l, size) <= maxW) return [l];
      const chunks: string[] = []; let c = '';
      for (const ch of l) { if (font.widthOfTextAtSize(c + ch, size) > maxW && c) { chunks.push(c); c = ch; } else c += ch; }
      if (c) chunks.push(c);
      return chunks;
    });
  };
  const lines = raw.replace(/\r/g, '').split('\n').flatMap(wrap);
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;
  for (const ln of lines) {
    if (y < margin) { page = doc.addPage([pageW, pageH]); y = pageH - margin; }
    if (ln) page.drawText(ln, { x: margin, y, size, font });
    y -= lineH;
  }
  if (!lines.length) doc.addPage([pageW, pageH]);
  const bytes = await doc.save();
  return new File([bytes], `${stripExt(file.name)}.pdf`, { type: 'application/pdf' });
}

/** Anything LibreOffice can open → PDF, via the convert-to-pdf edge function. */
async function convertToPdf(file: File): Promise<File> {
  if (file.size > MAX_CONVERT_BYTES) {
    throw new Error(`This document is too large to convert (max ${Math.round(MAX_CONVERT_BYTES / 1024 / 1024)} MB). Export it to PDF and import that.`);
  }
  const dataBase64 = await fileToBase64(file);
  const { data, error } = await invokeSecureFunction('convert-to-pdf', {
    filename: file.name, contentType: file.type, dataBase64,
  }, { timeoutMs: 120000 });
  if (error) throw new Error(error.message);
  const d = data as any;
  if (d?.error) throw new Error(d.error);
  if (d?.kind === 'needs_service') throw new Error(d.guidance || 'Document conversion isn’t configured on the server.');
  if (!d?.dataBase64) throw new Error('Conversion produced no PDF.');
  return base64ToFile(d.dataBase64, `${stripExt(file.name)}.pdf`, 'application/pdf');
}

/** Any browser-decodable image → PNG (so exotic formats can be embedded/handled). */
async function rasterizeImageToPng(file: File): Promise<File> {
  if (file.type === 'image/png') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = Math.min(6000, Math.max(1, img.naturalWidth || 1024));
    const h = Math.min(6000, Math.max(1, img.naturalHeight || 768));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'));
    canvas.width = 0; canvas.height = 0;
    if (!blob) throw new Error('image could not be decoded');
    return new File([blob], `${stripExt(file.name)}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Detect + transform any upload into a pipeline-ready PDF or image. */
export async function prepareImportFile(file: File, opts: { onStage?: (s: string) => void } = {}): Promise<PreparedImport> {
  const onStage = opts.onStage ?? (() => {});
  let head: Uint8Array | undefined;
  try { head = new Uint8Array(await file.slice(0, 64).arrayBuffer()); } catch { head = undefined; }
  const { kind, route } = routeForFile({ name: file.name, type: file.type, bytes: head });

  if (route === 'pdf') return { file, kind: 'pdf', sourceKind: kind, route, converted: false };
  if (route === 'image') return { file, kind: 'image', sourceKind: kind, route, converted: false };
  if (route === 'unsupported') throw new Error(`${describeKind(kind)} files can’t be reconstructed — try a PDF, image, document, or a link.`);

  onStage(`Preparing ${describeKind(kind)}…`);
  if (route === 'svg') return { file: await rasterizeSvg(file), kind: 'image', sourceKind: kind, route, converted: true };
  if (route === 'text') return { file: await textToPdf(file), kind: 'pdf', sourceKind: kind, route, converted: true };
  // route === 'convert'
  return { file: await convertToPdf(file), kind: 'pdf', sourceKind: kind, route, converted: true };
}

/**
 * Like `prepareImportFile` but always yields a PDF — for the PDF-only importer.
 * Images (incl. svg/exotic) become a single-page PDF via canvas rasterisation.
 */
export async function prepareImportFileAsPdf(file: File, opts: { onStage?: (s: string) => void } = {}): Promise<File> {
  const prepared = await prepareImportFile(file, opts);
  if (prepared.kind === 'pdf') return prepared.file;
  const png = await rasterizeImageToPng(prepared.file);
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const embedded = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
  const page = doc.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  const out = await doc.save();
  return new File([out], `${stripExt(file.name)}.pdf`, { type: 'application/pdf' });
}
