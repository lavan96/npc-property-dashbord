/**
 * Generic Template Builder routing helper.
 *
 * Replaces the old compass-only `tryRouteThroughTemplateBuilder` shim: now
 * resolves a template for ANY report_type + variant via
 * `resolveReportTemplate`, compiles HTML via `renderTemplateToHtml` using a
 * real binding context from `buildTemplateBindingContext`, and routes to
 * `render-template-pdf` (WeasyPrint). Falls through (returns null) when no
 * template resolves — the caller's legacy generator continues unchanged.
 *
 * The legacy `tryRouteThroughTemplateBuilder` name is re-exported for
 * backwards compatibility with existing call sites.
 */
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { renderTemplateToHtml } from '@/lib/reportTemplate/htmlRenderer';
import { parseTemplate } from '@/lib/reportTemplate/templateSchema';
import { preloadImages } from '@/lib/reportTemplate/imagePreloader';
import { resolveReportTemplate, type ReportVariant } from '@/lib/reportTemplate/resolveTemplate';
import { buildTemplateBindingContext } from '@/lib/reportTemplate/buildBindingContext';

export interface TemplateBuilderRouteResult {
  fileUrl: string;
  fileName: string;
  renderer: 'weasyprint';
  templateId: string;
  source: string;
}

export async function routeReportThroughTemplate(
  reportId: string,
  opts?: { agencyId?: string | null; userId?: string | null; brand?: any },
): Promise<TemplateBuilderRouteResult | null> {
  try {
    // 1. Fetch the report (just the routing fields — full data comes via binding context)
    const { data: report, error: rErr } = await supabase
      .from('investment_reports')
      .select('id, report_scope, report_tier, report_variant, property_address')
      .eq('id', reportId)
      .maybeSingle();
    if (rErr || !report) return null;

    const reportType = String((report as any).report_scope ?? '').toLowerCase();
    const variant = ((report as any).report_variant ?? null) as ReportVariant | null;
    if (!reportType) return null;

    // 2. Resolve the best-matching active template
    const resolved = await resolveReportTemplate({
      reportType,
      variant,
      agencyId: opts?.agencyId ?? null,
      userId: opts?.userId ?? null,
    });
    if (!resolved) return null;

    // Only route through Template Builder when the template is WeasyPrint-engine.
    // jsPDF-engine templates stay editor-only until WeasyPrint cutover is broader.
    if (resolved.engine !== 'weasyprint') return null;

    const tplRow = resolved.template;

    // 3. Build the binding context from the real report
    const ctx = await buildTemplateBindingContext(reportId, opts?.brand);
    const bindingData = ctx?.data ?? {};

    // 4. Compile HTML
    const schema = parseTemplate(tplRow.schema);
    await preloadImages(schema).catch(() => {});
    const { html } = renderTemplateToHtml(schema, {
      data: bindingData,
      customCss: tplRow.custom_css ?? undefined,
      title: `${tplRow.name} — ${(report as any).property_address ?? ''}`.trim(),
    });

    // 5. Render via WeasyPrint
    const safeAddr = String((report as any).property_address ?? 'report')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 60);
    const fileName = `${reportType}-${safeAddr}-${reportId.slice(0, 8)}.pdf`;

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
      console.warn('[routeReportThroughTemplate] render-template-pdf failed', pdfErr);
      return null;
    }

    return {
      fileUrl: pdfData.url,
      fileName: pdfData.fileName ?? fileName,
      renderer: 'weasyprint',
      templateId: tplRow.id,
      source: resolved.source,
    };
  } catch (e) {
    console.warn('[routeReportThroughTemplate] unexpected error, falling back', e);
    return null;
  }
}

/** Back-compat alias — the previous compass-only entry point. */
export const tryRouteThroughTemplateBuilder = routeReportThroughTemplate;
