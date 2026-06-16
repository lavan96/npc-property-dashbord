/**
 * Visual Import Quality Contract — persistence shim.
 *
 * Phase 2 only defines the contract the edge function (`template-import-pdf`)
 * will satisfy in Phase 5. Keeping the wire shapes here means UI code can
 * already import them without knowing the storage layout.
 *
 * Storage layout (Phase 5):
 *   template-import-artifacts/{importId}/visual-quality.json
 *   template-import-artifacts/{importId}/pages/page-{NNN}-source.png
 *   template-import-artifacts/{importId}/pages/page-{NNN}-generated.png
 *   template-import-artifacts/{importId}/pages/page-{NNN}-diff.png
 */
import { invokeSecureFunction } from '@/lib/secureInvoke';
import type { VisualImportQualityReport } from './schema';

export interface VisualQualityArtifactPaths {
  /** JSON summary path within the `template-import-artifacts` bucket. */
  summary: string;
  /** Folder prefix containing the per-page source rasters. */
  sourceRasters: string;
  /** Folder prefix containing the per-page rendered rasters. */
  generatedRasters: string;
  /** Folder prefix containing the per-page diff rasters. */
  diffRasters: string;
}

export interface PersistedVisualQuality {
  importId: string;
  report: VisualImportQualityReport;
  artifactPaths: VisualQualityArtifactPaths;
}

export type LoadVisualQualityResult =
  | { kind: 'ok'; payload: PersistedVisualQuality }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

/**
 * Default storage path helpers. Centralised so the edge function and the
 * frontend agree on layout without copy-pasting strings.
 */
export const visualQualityPaths = {
  bucket: 'template-import-artifacts' as const,
  summary: (importId: string) => `${importId}/visual-quality.json`,
  pageImage: (importId: string, pageNumber: number, kind: 'source' | 'generated' | 'diff') =>
    `${importId}/pages/page-${String(pageNumber).padStart(3, '0')}-${kind}.png`,
  pagesPrefix: (importId: string) => `${importId}/pages`,
};

/**
 * Load a previously persisted visual quality report through the secure
 * `template-import-pdf` edge function. Returns a discriminated union so
 * callers can distinguish "not produced yet" from a real failure.
 *
 * Phase 5 will add the matching `get_visual_quality` operation server-side.
 * Until then this throws `missing` for every call, which is the correct
 * placeholder behaviour for the review UI.
 */
export async function loadVisualQuality(importId: string): Promise<LoadVisualQualityResult> {
  if (!importId) return { kind: 'error', message: 'importId is required' };
  try {
    const { data, error } = await invokeSecureFunction<PersistedVisualQuality | null>(
      'template-import-pdf',
      { body: { operation: 'get_visual_quality', import_id: importId } } as any,
    );
    if (error) {
      // Edge fn not deployed yet — treat as "not produced".
      const msg = String(error?.message ?? '');
      if (/unknown operation|not implemented|not found/i.test(msg)) {
        return { kind: 'missing' };
      }
      return { kind: 'error', message: msg };
    }
    if (!data) return { kind: 'missing' };
    return { kind: 'ok', payload: data };
  } catch (e) {
    return { kind: 'error', message: (e as Error).message };
  }
}
