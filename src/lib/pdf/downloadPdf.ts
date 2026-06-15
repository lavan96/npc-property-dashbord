/**
 * Standardised PDF download helpers. Replace the 20+ inline anchor-click
 * patterns scattered around the codebase. Also wires the "Flatten and download"
 * action so every surface gets identical UX.
 */
import { flattenPdfBlob, withFlattenedSuffix } from './flattenPdf';

/**
 * Trigger a browser download for a PDF Blob. Cleans up the object URL after
 * the click resolves (Safari needs a slight delay before revoking).
 */
export function triggerPdfDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Flatten a PDF blob (rasterise every page) and trigger a download. Returns
 * the flattened blob so callers can also persist it server-side if they need.
 */
export async function flattenAndDownloadPdf(
  blob: Blob,
  filename: string,
  opts?: { dpi?: number; jpegQuality?: number; onProgress?: (page: number, total: number) => void },
): Promise<Blob> {
  const flattened = await flattenPdfBlob(blob, opts);
  triggerPdfDownload(flattened, withFlattenedSuffix(filename));
  return flattened;
}

/**
 * Fetch a remote PDF URL (typically a signed Supabase storage URL) into a Blob.
 * Used by surfaces whose current download is `a.href = signedUrl`.
 */
export async function fetchPdfBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
  return await res.blob();
}
