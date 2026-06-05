/**
 * Compass → Template Builder routing helper.
 *
 * Phase 5 pilot: if an active WeasyPrint template exists for the report's
 * type (e.g. `investment_compass`), compile its HTML client-side via
 * `renderTemplateToHtml` and POST to `render-template-pdf`. Returns
 * `{ fileUrl, fileName, renderer: 'weasyprint' }` on success, or null
 * to fall through to the legacy renderer.
 */
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { renderTemplateToHtml } from '@/lib/reportTemplate/htmlRenderer';
import { parseTemplate } from '@/lib/reportTemplate/templateSchema';
import { preloadImages } from '@/lib/reportTemplate/imagePreloader';

export interface TemplateBuilderRouteResult {
  fileUrl: string;
  fileName: string;
  renderer: 'weasyprint';
}

const COMPATIBLE_REPORT_TYPES = new Set([
  'investment_compass',
  'investor_compass',
  'compass',
]);

export async function tryRouteThroughTemplateBuilder(
  reportId: string,
): Promise<TemplateBuilderRouteResult | null> {
  try {
    // 1. Fetch the report
    const { data: report, error: rErr } = await supabase
      .from('investment_reports')
      .select('id, report_type, report_data, property_address')
      .eq('id', reportId)
      .maybeSingle();
    if (rErr || !report) return null;

    const reportType = String((report as any).report_type ?? '').toLowerCase();
    if (!COMPATIBLE_REPORT_TYPES.has(reportType)) return null;

    // 2. Look for an active WeasyPrint template matching this report type
    const { data: listData, error: listErr } = await invokeSecureFunction(
      'manage-templates',
      {
        operation: 'list',
        table: 'report_templates',
        listOptions: {
          orderBy: 'updated_at',
          orderAsc: false,
          filters: { report_type: 'investment_compass', is_active: true },
        },
      },
    );
    if (listErr || !listData?.records?.length) return null;

    const tplRow = (listData.records as any[]).find(
      (r) => (r.engine ?? 'jspdf') === 'weasyprint',
    );
    if (!tplRow) return null;

    // 3. Compile HTML
    const schema = parseTemplate(tplRow.schema);
    const data = (report as any).report_data || {};
    await preloadImages(schema).catch(() => {});
    const { html } = renderTemplateToHtml(schema, {
      data,
      customCss: tplRow.custom_css ?? undefined,
      title: `${tplRow.name} — ${(report as any).property_address ?? ''}`.trim(),
    });

    // 4. POST to render-template-pdf
    const safeAddr = String((report as any).property_address ?? 'compass')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 60);
    const fileName = `compass-${safeAddr}-${reportId.slice(0, 8)}.pdf`;
    const { data: pdfData, error: pdfErr } = await invokeSecureFunction<{
      url: string;
      fileName: string;
    }>('render-template-pdf', {
      html,
      fileName,
      templateId: tplRow.id,
      mode: 'final',
    });
    if (pdfErr || !pdfData?.url) {
      console.warn('[compassRoute] render-template-pdf failed', pdfErr);
      return null;
    }

    return { fileUrl: pdfData.url, fileName: pdfData.fileName ?? fileName, renderer: 'weasyprint' };
  } catch (e) {
    console.warn('[compassRoute] unexpected error, falling back', e);
    return null;
  }
}
