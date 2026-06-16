/**
 * Phase 9 — Multi-service dispatcher.
 *
 * Higher-level entry point that picks the right primary provider for an input,
 * runs the Phase 7 fallback chain, and persists the resulting
 * `ProviderAttempt[]` audit trail to `template_imports.meta.provider_attempts`
 * so the Phase 8 diagnostics dashboard can render the cross-service trace.
 *
 * The dispatcher is additive — existing callers of `extractPdfViaDocling` keep
 * working unchanged. New callers (e.g. the unified `ReferenceImportDialog`)
 * can opt in by importing `dispatchImport`.
 */
import type { ImportOptions, ImportResult } from '../types';
import {
  runImportWithFallback,
  type ProviderAttempt,
  type ImportProvider,
  doclingProvider,
  pixelFallbackProvider,
} from './index';
import { renderSourceProvider, weasyprintReverseProvider } from './services';
import { invokeSecureFunction } from '@/lib/secureInvoke';

export interface DispatchResult {
  result: ImportResult;
  attempts: ProviderAttempt[];
  usedFallback: boolean;
}

export interface DispatchOptions extends ImportOptions {
  /** Skip the provider-attempts persistence step (useful in tests). */
  skipAuditPersist?: boolean;
  /** Force a specific primary provider id — bypasses auto-detection. */
  forcePrimary?: 'docling' | 'render-source' | 'weasyprint-reverse';
  onAttempt?: (attempt: ProviderAttempt) => void;
}

/** Choose the best primary provider for the given file. */
function pickPrimary(file: File, opts: DispatchOptions): { primary: ImportProvider; fallbacks: ImportProvider[] } {
  if (opts.forcePrimary === 'render-source') {
    return { primary: renderSourceProvider, fallbacks: [doclingProvider, pixelFallbackProvider] };
  }
  if (opts.forcePrimary === 'weasyprint-reverse') {
    return { primary: weasyprintReverseProvider, fallbacks: [doclingProvider, pixelFallbackProvider] };
  }
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
  if (!isPdf) {
    return { primary: renderSourceProvider, fallbacks: [] };
  }
  // PDFs → Docling primary, pixel + WeasyPrint reverse as escalating fallbacks.
  return {
    primary: doclingProvider,
    fallbacks: [pixelFallbackProvider, weasyprintReverseProvider],
  };
}

/**
 * Best-effort persistence — never throws. The orchestrator's result is the
 * source of truth; this just records the audit trail for the dashboard.
 */
async function persistAttempts(importId: string | undefined, attempts: ProviderAttempt[]): Promise<void> {
  if (!importId || attempts.length === 0) return;
  try {
    await invokeSecureFunction(
      'template-import-pdf',
      {
        operation: 'append_meta',
        import_id: importId,
        meta_patch: { provider_attempts: attempts },
      },
      { timeoutMs: 30_000 },
    );
  } catch {
    /* swallow — diagnostic-only */
  }
}

export async function dispatchImport(file: File, opts: DispatchOptions): Promise<DispatchResult> {
  const providers = pickPrimary(file, opts);
  const run = await runImportWithFallback(file, {
    ...opts,
    providers,
    onAttempt: opts.onAttempt,
  });
  if (!opts.skipAuditPersist) {
    await persistAttempts(run.result.importId, run.attempts);
  }
  return run;
}
