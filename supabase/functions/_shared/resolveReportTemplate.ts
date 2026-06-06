/**
 * Edge mirror of src/lib/reportTemplate/resolveTemplate.ts
 * KEEP IN SYNC.
 *
 * Resolves the most-specific active `report_templates` row for a given
 * report_type + variant + scope context. First match wins:
 *   1. scope=user    + owner_user_id + variant match
 *   2. scope=agency  + agency_id     + variant match
 *   3. scope=global  + exact variant match
 *   4. scope=global  + variant IS NULL  (catch-all)
 *
 * Filtered by is_active=true, ordered by priority DESC, updated_at DESC.
 *
 * Designed for use by edge generators (render-investment-report-pdf,
 * fork-investment-report, …) so they can route through the Template Builder
 * when an active template resolves. Falls through (returns null) otherwise.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type ReportVariant = 'composite' | 'financial' | 'due_diligence';

export interface ResolveOpts {
  reportType: string;
  variant?: ReportVariant | null;
  agencyId?: string | null;
  userId?: string | null;
}

export interface ResolvedTemplate {
  template: any;
  engine: 'jspdf' | 'weasyprint';
  source: 'user' | 'agency' | 'global-variant' | 'global-any';
}

const ORDER = ['user', 'agency', 'global-variant', 'global-any'] as const;

export async function resolveReportTemplate(
  supabase: SupabaseClient,
  opts: ResolveOpts,
): Promise<ResolvedTemplate | null> {
  const reportType = (opts.reportType || '').toLowerCase();
  if (!reportType) return null;

  const { data, error } = await supabase
    .from('report_templates')
    .select('*')
    .eq('report_type', reportType)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error || !data?.length) return null;

  const variant = opts.variant ?? null;
  const agencyId = opts.agencyId ?? null;
  const userId = opts.userId ?? null;

  const candidates: Array<{ source: ResolvedTemplate['source']; row: any }> = [];
  for (const r of data as any[]) {
    const rScope = r.scope ?? 'global';
    const rVariant = r.variant ?? null;
    const variantOk = rVariant === null || rVariant === variant;
    if (rScope === 'user' && userId && r.owner_user_id === userId && variantOk) {
      candidates.push({ source: 'user', row: r });
    } else if (rScope === 'agency' && agencyId && r.agency_id === agencyId && variantOk) {
      candidates.push({ source: 'agency', row: r });
    } else if (rScope === 'global' && rVariant !== null && rVariant === variant) {
      candidates.push({ source: 'global-variant', row: r });
    } else if (rScope === 'global' && rVariant === null) {
      candidates.push({ source: 'global-any', row: r });
    }
  }
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const sa = ORDER.indexOf(a.source);
    const sb = ORDER.indexOf(b.source);
    if (sa !== sb) return sa - sb;
    const pa = Number(a.row.priority ?? 0);
    const pb = Number(b.row.priority ?? 0);
    if (pa !== pb) return pb - pa;
    return (
      new Date(b.row.updated_at ?? 0).getTime() -
      new Date(a.row.updated_at ?? 0).getTime()
    );
  });

  const winner = candidates[0];
  const engine = (winner.row.engine ?? 'jspdf') as 'jspdf' | 'weasyprint';
  return { template: winner.row, engine, source: winner.source };
}
