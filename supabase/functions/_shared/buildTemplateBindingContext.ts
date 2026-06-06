/**
 * Edge mirror of src/lib/reportTemplate/buildBindingContext.ts
 * KEEP IN SYNC.
 *
 * Flattens an `investment_reports` row into the stable shape templates bind
 * against — works with service_role from edge functions (no RLS hop required).
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface TemplateBindingContext {
  data: Record<string, any>;
  meta: { reportId: string; reportType: string; variant: string | null; tier: string | null };
}

const flatten = (o: any): Record<string, any> => (o && typeof o === 'object' ? { ...o } : {});

export async function buildTemplateBindingContext(
  supabase: SupabaseClient,
  reportId: string,
  brand?: { tokens?: any; logoUrl?: string | null } | null,
): Promise<TemplateBindingContext | null> {
  const { data: row, error } = await supabase
    .from('investment_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle();
  if (error || !row) return null;

  const reportType = String((row as any).report_type ?? (row as any).report_scope ?? '').toLowerCase();
  const variant = ((row as any).report_variant ?? null) as string | null;
  const tier = ((row as any).report_tier ?? null) as string | null;

  const data: Record<string, any> = {
    report: {
      id: (row as any).id,
      type: reportType,
      variant,
      tier,
      address: (row as any).property_address ?? '',
      generated_at: (row as any).updated_at ?? (row as any).created_at,
      status: (row as any).status,
    },
    property: flatten((row as any).property_specs),
    financials: flatten((row as any).financial_calculations),
    scores: flatten((row as any).investment_score),
    demographics: flatten((row as any).demographics_data),
    economic: flatten((row as any).economic_data),
    location: flatten((row as any).location_intelligence),
    sections: flatten((row as any).report_content),
    sources: flatten((row as any).sources_content),
    overrides: flatten((row as any).manual_overrides),
    tier,
    variant,
    brand: {
      tokens: brand?.tokens ?? {},
      logo: brand?.logoUrl ?? null,
    },
  };

  return { data, meta: { reportId, reportType, variant, tier } };
}
