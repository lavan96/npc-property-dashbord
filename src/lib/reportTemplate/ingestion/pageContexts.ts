/**
 * Phase 4F.3 — PDF PageContext consumer helpers.
 *
 * The backend now exposes parent-global per-page Docling artifacts from
 * template-import-pdf.get_artifacts. This module normalizes that payload into
 * a stable frontend contract without changing rendering yet.
 */

export type PdfPageContextSource = 'per_page_docling' | 'legacy_docling';

export interface PdfPageContextArtifacts {
  docling_path: string | null;
  blocks_path: string | null;
  tables_path: string | null;
  pictures_path: string | null;
  summary_path: string | null;
  raster_path: string | null;
}

export interface PdfPageContextFlags {
  has_docling: boolean;
  has_blocks: boolean;
  has_tables: boolean;
  has_pictures: boolean;
  has_summary: boolean;
  has_raster: boolean;
  has_parent_global_artifacts: boolean;
}

export interface PdfPageContext {
  version: 'pdf-page-context-v1' | string;
  page_no: number;
  page_index: number;
  width: number | null;
  height: number | null;
  artifacts: PdfPageContextArtifacts;
  source?: {
    manifest_path?: string | null;
    source_chunk_index?: number | null;
    source_chunk_page_no?: number | null;
    source_chunk_artifact_paths?: Record<string, unknown> | null;
  };
  flags: PdfPageContextFlags;
  global_artifact_prefix?: string | null;
  global_artifact_copy_version?: string | null;
}

export interface PdfPageContextSummary {
  version?: string;
  ok: boolean;
  expected_page_count: number | null;
  observed_page_count: number;
  first_page_no?: number | null;
  last_page_no?: number | null;
  parent_global_context_count?: number | null;
  missing_page_numbers?: number[];
  duplicate_page_numbers?: number[];
  problems?: string[];
}

export interface PageContextEntrypoint {
  available: boolean;
  source?: string | null;
  manifest_path?: string | null;
  page_count?: number | null;
  validation_ok?: boolean | null;
  parent_global_paths_ok?: boolean | null;
  page_contexts_ok?: boolean | null;
  page_context_count?: number | null;
}

export interface PreferredPdfPageContextSource {
  source: PdfPageContextSource;
  pageContexts: PdfPageContext[];
  pageContextSummary: PdfPageContextSummary | null;
  pageContextEntrypoint: PageContextEntrypoint | null;
  reason: string;
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeArtifactPath(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function normalizePdfPageContexts(raw: unknown): PdfPageContext[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): PdfPageContext | null => {
      if (!item || typeof item !== 'object') return null;
      const page = item as Record<string, any>;
      const pageNo = Number(page.page_no ?? 0);
      if (!Number.isFinite(pageNo) || pageNo <= 0) return null;

      const artifactsRaw = page.artifacts && typeof page.artifacts === 'object'
        ? page.artifacts as Record<string, unknown>
        : {};

      const artifacts: PdfPageContextArtifacts = {
        docling_path: normalizeArtifactPath(artifactsRaw.docling_path),
        blocks_path: normalizeArtifactPath(artifactsRaw.blocks_path),
        tables_path: normalizeArtifactPath(artifactsRaw.tables_path),
        pictures_path: normalizeArtifactPath(artifactsRaw.pictures_path),
        summary_path: normalizeArtifactPath(artifactsRaw.summary_path),
        raster_path: normalizeArtifactPath(artifactsRaw.raster_path),
      };

      const flagsRaw = page.flags && typeof page.flags === 'object'
        ? page.flags as Record<string, unknown>
        : {};

      const flags: PdfPageContextFlags = {
        has_docling: Boolean(flagsRaw.has_docling ?? artifacts.docling_path),
        has_blocks: Boolean(flagsRaw.has_blocks ?? artifacts.blocks_path),
        has_tables: Boolean(flagsRaw.has_tables ?? artifacts.tables_path),
        has_pictures: Boolean(flagsRaw.has_pictures ?? artifacts.pictures_path),
        has_summary: Boolean(flagsRaw.has_summary ?? artifacts.summary_path),
        has_raster: Boolean(flagsRaw.has_raster ?? artifacts.raster_path),
        has_parent_global_artifacts: Boolean(flagsRaw.has_parent_global_artifacts),
      };

      return {
        version: typeof page.version === 'string' ? page.version : 'pdf-page-context-v1',
        page_no: pageNo,
        page_index: Number.isFinite(Number(page.page_index)) ? Number(page.page_index) : pageNo - 1,
        width: toNumberOrNull(page.width),
        height: toNumberOrNull(page.height),
        artifacts,
        source: page.source && typeof page.source === 'object' ? page.source : undefined,
        flags,
        global_artifact_prefix: normalizeArtifactPath(page.global_artifact_prefix),
        global_artifact_copy_version: normalizeArtifactPath(page.global_artifact_copy_version),
      };
    })
    .filter((ctx): ctx is PdfPageContext => Boolean(ctx))
    .sort((a, b) => a.page_no - b.page_no);
}

export function normalizePdfPageContextSummary(raw: unknown, pageContexts: PdfPageContext[]): PdfPageContextSummary | null {
  if (raw && typeof raw === 'object') {
    const summary = raw as Record<string, any>;
    return {
      version: typeof summary.version === 'string' ? summary.version : 'pdf-page-context-summary-v1',
      ok: Boolean(summary.ok),
      expected_page_count: toNumberOrNull(summary.expected_page_count),
      observed_page_count: Number.isFinite(Number(summary.observed_page_count))
        ? Number(summary.observed_page_count)
        : pageContexts.length,
      first_page_no: toNumberOrNull(summary.first_page_no),
      last_page_no: toNumberOrNull(summary.last_page_no),
      parent_global_context_count: toNumberOrNull(summary.parent_global_context_count),
      missing_page_numbers: Array.isArray(summary.missing_page_numbers) ? summary.missing_page_numbers.map(Number).filter(Number.isFinite) : [],
      duplicate_page_numbers: Array.isArray(summary.duplicate_page_numbers) ? summary.duplicate_page_numbers.map(Number).filter(Number.isFinite) : [],
      problems: Array.isArray(summary.problems) ? summary.problems.map(String) : [],
    };
  }

  return {
    version: 'pdf-page-context-summary-v1',
    ok: pageContexts.length > 0 && pageContexts.every((ctx) =>
      ctx.artifacts.docling_path
      && ctx.artifacts.blocks_path
      && ctx.artifacts.summary_path
      && ctx.flags.has_parent_global_artifacts
    ),
    expected_page_count: pageContexts.length,
    observed_page_count: pageContexts.length,
    first_page_no: pageContexts[0]?.page_no ?? null,
    last_page_no: pageContexts.at(-1)?.page_no ?? null,
    parent_global_context_count: pageContexts.filter((ctx) => ctx.flags.has_parent_global_artifacts).length,
    missing_page_numbers: [],
    duplicate_page_numbers: [],
    problems: [],
  };
}

export function getPreferredPdfPageContextSource(input: {
  pageContextEntrypoint?: PageContextEntrypoint | null;
  pageContexts?: unknown;
  pageContextSummary?: unknown;
}): PreferredPdfPageContextSource {
  const pageContexts = normalizePdfPageContexts(input.pageContexts);
  const pageContextSummary = normalizePdfPageContextSummary(input.pageContextSummary, pageContexts);
  const entrypoint = input.pageContextEntrypoint ?? null;

  const hasRequiredArtifacts = pageContexts.length > 0 && pageContexts.every((ctx) =>
    ctx.artifacts.docling_path
    && ctx.artifacts.blocks_path
    && ctx.artifacts.summary_path
    && ctx.flags.has_parent_global_artifacts
  );

  const entrypointOk = Boolean(entrypoint?.available);
  const summaryOk = Boolean(pageContextSummary?.ok);

  if (entrypointOk && summaryOk && hasRequiredArtifacts) {
    return {
      source: 'per_page_docling',
      pageContexts,
      pageContextSummary,
      pageContextEntrypoint: entrypoint,
      reason: 'parent per-page Docling manifest available',
    };
  }

  return {
    source: 'legacy_docling',
    pageContexts: [],
    pageContextSummary,
    pageContextEntrypoint: entrypoint,
    reason: !entrypointOk
      ? 'page context entrypoint unavailable'
      : !summaryOk
        ? 'page context summary not ok'
        : 'page contexts missing required artifacts',
  };
}
