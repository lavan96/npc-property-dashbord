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
import { domBoxTreesToCdir, type DomBoxTreePage } from './cdir/adapters';
import { cdirToReportTemplate } from './cdir/mapper';
import type { CdirDocument, CdirSourceKind } from './cdir/schema';
import { buildCdirFidelityReport, type CdirFidelityReport } from './fidelity';
import type { ReportTemplate } from '../templateSchema';

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
  /** Optional filename to preserve in CDIR provenance (especially useful for zips). */
  sourceFilename?: string;
  /** Optional caller-provided checksum when the source file has already been hashed. */
  sourceChecksum?: string;
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
  /** Screenshot of the first render — legacy reference image for reconstruction. */
  rasterDataUrl: string;
  /** Screenshots for every rendered route/page, in CDIR page order. */
  rasterDataUrls: string[];
  /** Measured elements for the first page (same legacy shape OCR grounding produces). */
  grounded: GroundedReference;
  /** Measured elements for every rendered route/page. */
  groundedPages: GroundedReference[];
  /** Editable-first canonical representation for HTML/JSX/URL/zip sources. */
  cdir: CdirDocument;
  /** Shared fidelity report for code/zip imports before editor commit. */
  cdirFidelity: CdirFidelityReport;
  /** CDIR mapped into the existing template schema with trace rasters retained. */
  editableTemplate: ReportTemplate;
  pageWidth: number;
  pageHeight: number;
}

/** Matches `invokeSecureFunction(name, body)` / `supabase.functions.invoke`. */
export type InvokeFn = (
  name: string,
  body: unknown,
) => Promise<{ data: any; error: { message: string } | null }>;


interface RenderSourcePagePayload {
  id?: string;
  label?: string;
  route?: string;
  raster?: string;
  boxTree?: DomBoxTree;
}

function stableChecksum(input: CodeRenderInput): string {
  const text = [input.sourceChecksum, input.url, input.html, input.css, input.jsx, input.entry, input.zipBase64]
    .filter(Boolean)
    .join('\n---template-builder-source-part---\n');
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  return input.sourceChecksum || `local:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function sourceKind(input: CodeRenderInput): CdirSourceKind {
  if (input.zipBase64) return 'zip';
  if (input.jsx) return 'jsx';
  if (input.url) return 'url';
  return 'html';
}

function normalizeRaster(raster: string): string {
  return raster.startsWith('data:') ? raster : `data:image/png;base64,${raster}`;
}

function normalizeRenderPages(data: any): Array<DomBoxTreePage & { rasterDataUrl: string }> {
  const explicitPages = Array.isArray(data?.pages)
    ? data.pages.map((page: RenderSourcePagePayload, index: number) => ({
      id: page.id,
      label: page.label,
      route: page.route,
      tree: page.boxTree,
      raster: page.raster ?? (Array.isArray(data.rasters) ? data.rasters[index] : undefined) ?? (index === 0 ? data.raster : undefined),
    }))
    : [];
  const boxTreePages = !explicitPages.length && Array.isArray(data?.boxTrees)
    ? data.boxTrees.map((tree: DomBoxTree, index: number) => ({
      id: `page_${index + 1}`,
      label: `Rendered page ${index + 1}`,
      tree,
      raster: Array.isArray(data.rasters) ? data.rasters[index] : (index === 0 ? data.raster : undefined),
    }))
    : [];
  const singlePage = !explicitPages.length && !boxTreePages.length && data?.boxTree
    ? [{ id: 'page_1', label: 'Rendered page 1', tree: data.boxTree as DomBoxTree, raster: data.raster }]
    : [];

  return [...explicitPages, ...boxTreePages, ...singlePage]
    .filter((page) => page.tree && page.raster)
    .map((page) => ({ ...page, tree: page.tree as DomBoxTree, rasterDataUrl: normalizeRaster(String(page.raster)) }));
}

function expectedTextForPage(page: DomBoxTreePage, pageId: string) {
  const text = (page.tree.textBoxes ?? [])
    .filter((box) => box?.text?.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((box) => box.text.trim().replace(/\s+/g, ' '))
    .join(' ');
  return text ? { pageId, text } : null;
}

function attachTraceRasters(doc: CdirDocument, rasterDataUrls: string[]): CdirDocument {
  return {
    ...doc,
    pages: doc.pages.map((page, index) => ({ ...page, traceRasterAssetId: rasterDataUrls[index] ? `${page.id}_trace_raster` : page.traceRasterAssetId })),
    assets: [
      ...doc.assets,
      ...doc.pages.flatMap((page, index) => rasterDataUrls[index] ? [{
        id: `${page.id}_trace_raster`,
        kind: 'trace-raster' as const,
        dataUrl: rasterDataUrls[index],
        mimeType: 'image/png',
        width: page.width,
        height: page.height,
      }] : []),
    ],
  };
}

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

  const renderedPages = normalizeRenderPages(data);
  if (!renderedPages.length) throw new Error('render-source returned no render.');

  const rasterDataUrls = renderedPages.map((page) => page.rasterDataUrl);
  const groundedPages = renderedPages.map((page) => groundDomBoxTree(page.tree));
  const cdirBase = domBoxTreesToCdir(renderedPages, {
    kind: sourceKind(input),
    checksum: stableChecksum(input),
    filename: input.sourceFilename ?? input.url,
    originalWidth: renderedPages[0].tree.pageWidthPx,
    originalHeight: renderedPages[0].tree.pageHeightPx,
  });
  const cdir = attachTraceRasters(cdirBase, rasterDataUrls);
  const expectedText = renderedPages
    .map((page, index) => expectedTextForPage(page, cdir.pages[index].id))
    .filter((item): item is { pageId: string; text: string } => Boolean(item));
  const cdirFidelity = buildCdirFidelityReport(cdir, { expectedText });
  const editableTemplate = cdirToReportTemplate(cdir, {
    templateName: input.sourceFilename ?? input.url ?? 'Imported code template',
    includeTraceLayers: true,
  });
  const grounded = groundedPages[0];
  return {
    rasterDataUrl: rasterDataUrls[0],
    rasterDataUrls,
    grounded,
    groundedPages,
    cdir,
    cdirFidelity,
    editableTemplate,
    pageWidth: grounded.pageWidth,
    pageHeight: grounded.pageHeight,
  };
}
