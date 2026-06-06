/**
 * BeforeAfterDiff — renders the reference image alongside a thumbnail of the
 * synthesised page. Used inside chat bubbles after the brief pipeline runs.
 */
import { useEffect, useMemo, useState } from 'react';
import { renderTemplateToBlob } from '@/lib/reportTemplate/pdfRenderer';
import type { ReportTemplate } from '@/lib/reportTemplate/templateSchema';

interface Props {
  referenceImageUrl: string;
  template: ReportTemplate;
  activePageId: string;
}

export function BeforeAfterDiff({ referenceImageUrl, template, activePageId }: Props) {
  // Render just the active page to a single-page template, then convert PDF
  // first page to an <iframe> preview. For speed, we use jsPDF's `output('bloburl')`
  // and let the browser render it inline.
  const singlePageTemplate = useMemo<ReportTemplate>(() => {
    const page = template.pages.find((p) => p.id === activePageId) ?? template.pages[0];
    return { ...template, pages: page ? [page] : [] };
  }, [template, activePageId]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!singlePageTemplate.pages.length) { setPreviewUrl(null); return; }
    let revoked = false;
    let url = '';
    try {
      const blob = renderTemplateToBlob(singlePageTemplate, { data: {} });
      url = URL.createObjectURL(blob);
      if (!revoked) setPreviewUrl(url);
    } catch (e) {
      console.warn('[BeforeAfterDiff] render failed', e);
      setPreviewUrl(null);
    }
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [singlePageTemplate]);

  return (
    <div className="mt-3 rounded-md border bg-muted/20 p-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1.5 px-1">
        Reference ↔ Rendered
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border bg-background overflow-hidden">
          <img
            src={referenceImageUrl}
            alt="Reference"
            className="w-full h-44 object-contain bg-[repeating-conic-gradient(#f5f5f5_0_25%,_#ffffff_0_50%)_50%/12px_12px]"
          />
          <div className="text-[9px] text-center text-muted-foreground py-0.5">Reference</div>
        </div>
        <div className="rounded border bg-background overflow-hidden">
          {previewUrl ? (
            <iframe
              title="Rendered preview"
              src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              className="w-full h-44 bg-white"
            />
          ) : (
            <div className="w-full h-44 flex items-center justify-center text-[10px] text-muted-foreground">
              No preview
            </div>
          )}
          <div className="text-[9px] text-center text-muted-foreground py-0.5">Rendered</div>
        </div>
      </div>
    </div>
  );
}
