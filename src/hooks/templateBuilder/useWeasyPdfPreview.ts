/**
 * useWeasyPdfPreview — render-on-demand production-parity PDF preview for the
 * editor's "Final PDF" tab (rehaul Phase 3).
 *
 * The live HTML preview is the realtime surface; the WeasyPrint round-trip is
 * expensive (image preload + edge function + storage upload), so it no longer
 * re-renders on a debounce while you type. Instead:
 * - opening the tab renders once automatically,
 * - subsequent edits flip `stale` (cheap content-key comparison) and the user
 *   re-renders explicitly via `refresh()`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { renderTemplateToHtml } from '@/lib/reportTemplate/htmlRenderer';
import { preloadImages } from '@/lib/reportTemplate/imagePreloader';
import { makePreviewKey } from '@/lib/reportTemplate/previewCache';
import { renderHtmlToPdfUrl, pdfFileNameFor } from '@/lib/reportTemplate/weasyRenderClient';
import type { ReportTemplate } from '@/lib/reportTemplate/templateSchema';

interface Args {
  enabled: boolean;
  template: ReportTemplate;
  sampleData: Record<string, any>;
  customCss?: string;
  name: string;
  templateId?: string;
}

export function useWeasyPdfPreview({ enabled, template, sampleData, customCss, name, templateId }: Args) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Content key of the last render attempt (null = never attempted).
  const [renderedKey, setRenderedKey] = useState<string | null>(null);

  // Cheap: serialization inside makePreviewKey is identity-memoized.
  const contentKey = `${makePreviewKey(template, sampleData, customCss)}\u0000${name}`;
  const stale = renderedKey !== null && renderedKey !== contentKey;

  // Latest-ref so refresh() is identity-stable and always renders current state.
  const argsRef = useRef({ template, sampleData, customCss, name, templateId, contentKey });
  argsRef.current = { template, sampleData, customCss, name, templateId, contentKey };
  const runIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const { template, sampleData, customCss, name, templateId, contentKey } = argsRef.current;
    const runId = ++runIdRef.current;
    setPreviewing(true);
    setPreviewError(null);
    // Mark attempted immediately so a failed render doesn't auto-retry forever.
    setRenderedKey(contentKey);
    try {
      const prepared = await preloadImages(template);
      if (runId !== runIdRef.current) return;
      // Production parity: render via WeasyPrint (same engine as final PDFs).
      const { html } = renderTemplateToHtml(prepared, {
        data: sampleData,
        title: name || 'Template Preview',
        customCss: customCss || undefined,
      });
      const url = await renderHtmlToPdfUrl({
        html,
        fileName: pdfFileNameFor(name, '-preview'),
        templateId,
        mode: 'preview',
      });
      if (runId !== runIdRef.current) return;
      setPreviewUrl(url);
    } catch (e: any) {
      if (runId === runIdRef.current) setPreviewError(e?.message ?? 'Render failed');
    } finally {
      if (runId === runIdRef.current) setPreviewing(false);
    }
  }, []);

  // Render once on first open; afterwards `stale` + manual refresh take over.
  useEffect(() => {
    if (enabled && renderedKey === null && !previewing) void refresh();
  }, [enabled, renderedKey, previewing, refresh]);

  return { previewUrl, previewing, previewError, stale, refresh };
}
