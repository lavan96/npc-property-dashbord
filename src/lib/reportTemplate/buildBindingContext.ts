/**
 * Build the data + tokens context used by `resolveBindable` and
 * `evalConditional` when rendering a template against a real report.
 *
 * Flattens the heterogeneous shapes on `investment_reports` into a stable
 * shape that template bindings can rely on, regardless of which generator
 * wrote the row:
 *
 *   data.report        — id, type, variant, address, generated_at, status
 *   data.property      — flattened from report.property_specs + report_data.property
 *   data.financials    — flattened from financial_calculations
 *   data.scores        — from investment_score
 *   data.demographics  — demographics_data
 *   data.economic      — economic_data
 *   data.location      — location_intelligence
 *   data.sections      — report_content (markdown sections, keyed by sectionKey)
 *   data.sources       — sources_content
 *   data.tier          — report_tier  (for conditional gates)
 *   data.variant       — report_variant
 *   data.brand         — brand tokens + logo from the active BrandProvider
 */
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';

export interface TemplateBindingContext {
  data: Record<string, any>;
  meta: { reportId: string; reportType: string; variant: string | null; tier: string | null };
}

function flatten(obj: any): Record<string, any> {
  if (!obj || typeof obj !== 'object') return {};
  return { ...obj };
}

export async function buildTemplateBindingContext(
  reportId: string,
  brand?: { tokens?: any; logoUrl?: string | null } | null,
): Promise<TemplateBindingContext | null> {
  // Pull via secure mediator (RLS-locked)
  const { data: resp, error } = await invokeSecureFunction('secure-data-mediator', {
    operation: 'get',
    table: 'investment_reports',
    recordId: reportId,
  } as any);

  let row: any = resp?.record ?? resp?.data ?? null;
  if ((error || !row) && supabase) {
    // Fallback for callers without secure mediator wiring
    const r = await supabase
      .from('investment_reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();
    row = r.data;
  }
  if (!row) return null;

  const reportType = String(row.report_type ?? row.report_scope ?? '').toLowerCase();
  const variant = (row.report_variant ?? null) as string | null;
  const tier = (row.report_tier ?? null) as string | null;

  const data: Record<string, any> = {
    report: {
      id: row.id,
      type: reportType,
      variant,
      tier,
      address: row.property_address ?? '',
      generated_at: row.updated_at ?? row.created_at,
      status: row.status,
    },
    property: flatten(row.property_specs),
    financials: flatten(row.financial_calculations),
    scores: flatten(row.investment_score),
    demographics: flatten(row.demographics_data),
    economic: flatten(row.economic_data),
    location: flatten(row.location_intelligence),
    sections: flatten(row.report_content),
    sources: flatten(row.sources_content),
    overrides: flatten(row.manual_overrides),
    tier,
    variant,
    brand: {
      tokens: brand?.tokens ?? {},
      logo: brand?.logoUrl ?? null,
    },
  };

  return {
    data,
    meta: { reportId, reportType, variant, tier },
  };
}
