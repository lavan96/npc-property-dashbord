/**
 * Raw-codebase ingestion orchestrator (plan WS1 §3.2).
 *
 * Calls the `render-source` edge function (headless render → screenshot + DOM box
 * tree), then grounds the box tree into the measured `GroundedReference` the
 * design agent's `screenshot_to_block` mode already consumes. The network call is
 * injected (`InvokeFn`) so this is unit-testable without Supabase.
 */
import { groundDomBoxTree, type DomBoxTree } from '../codeGrounding';
import type { GroundedReference } from '../imageGrounding';

export interface CodeRenderInput {
  /** A live page URL (C2) — rendered headless. */
  url?: string;
  /** Raw HTML (C1) — rendered headless. */
  html?: string;
  /** Optional CSS to inject alongside `html`. */
  css?: string;
  /** Single-file React/JSX component source (C3). */
  jsx?: string;
  /** C3: component name to mount (defaults to the default export / `App`). */
  entry?: string;
  /** Base64 project archive (C4) — extracted, optionally built, then served. */
  zipBase64?: string;
  width?: number;
  height?: number;
}

/** Heuristic: does pasted text look like a React/JSX component (vs plain HTML)? */
export function looksLikeJsx(src: string): boolean {
  const s = String(src || '').trim();
  if (/^<!doctype|^<html|^<head|^<body/i.test(s)) return false; // clearly HTML
  if (/\bimport\s|\bexport\s+default\b|\bexport\s/.test(s)) return true;
  if (/\b(function|const|let)\s+[A-Z]\w*/.test(s)) return true; // Capitalised component decl
  if (/=>\s*[(<]/.test(s)) return true; // arrow returning JSX / paren
  return false;
}

export interface CodeIngestResult {
  /** Screenshot of the render — used as the reference image for reconstruction. */
  rasterDataUrl: string;
  /** Measured elements (same shape OCR grounding produces). */
  grounded: GroundedReference;
  pageWidth: number;
  pageHeight: number;
}

/** Matches `invokeSecureFunction(name, body)` / `supabase.functions.invoke`. */
export type InvokeFn = (
  name: string,
  body: unknown,
) => Promise<{ data: any; error: { message: string } | null }>;

export async function renderAndGroundCode(
  input: CodeRenderInput,
  invoke: InvokeFn,
): Promise<CodeIngestResult> {
  if (!input.url && !input.html && !input.jsx && !input.zipBase64) {
    throw new Error('Provide a URL, HTML, JSX, or a project zip to reconstruct.');
  }
  const { data, error } = await invoke('render-source', {
    url: input.url,
    html: input.html,
    css: input.css,
    jsx: input.jsx,
    entry: input.entry,
    zipBase64: input.zipBase64,
    width: input.width ?? 1280,
    height: input.height ?? 1600,
  });
  if (error) throw new Error(error.message || 'render-source failed');
  if (data?.error) throw new Error(String(data.error));

  const boxTree = data?.boxTree as DomBoxTree | undefined;
  const raster = data?.raster as string | undefined;
  if (!boxTree || !raster) throw new Error('render-source returned no render.');

  const rasterDataUrl = raster.startsWith('data:') ? raster : `data:image/png;base64,${raster}`;
  const grounded = groundDomBoxTree(boxTree);
  return { rasterDataUrl, grounded, pageWidth: grounded.pageWidth, pageHeight: grounded.pageHeight };
}
