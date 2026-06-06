/**
 * Frontend mirror of supabase/functions/_shared/resolveReportTemplate.ts
 * KEEP IN SYNC.
 *
 * Resolves the most-specific active `report_templates` row for a given
 * report_type + variant + scope context. First match wins:
 *   1. scope=user    + owner_user_id  + variant match
 *   2. scope=agency  + agency_id      + variant match
 *   3. scope=global  + exact variant match
 *   4. scope=global  + variant IS NULL  (catch-all)
 *
 * Filtered by is_active=true, ordered by priority DESC, updated_at DESC.
 */
import { invokeSecureFunction } from '@/lib/secureInvoke';

export type ReportVariant = 'composite' | 'financial' | 'due_diligence';

export interface ResolveOpts {
  reportType: string;
  variant?: ReportVariant | null;
  agencyId?: string | null;
  userId?: string | null;
}

export interface ResolvedTemplate {
  template: any; // report_templates row
  engine: 'jspdf' | 'weasyprint';
  source: 'user' | 'agency' | 'global-variant' | 'global-any';
}

const ORDER = ['user', 'agency', 'global-variant', 'global-any'] as const;

export async function resolveReportTemplate(
  opts: ResolveOpts,
): Promise<ResolvedTemplate | null> {
  const reportType = (opts.reportType || '').toLowerCase();
  if (!reportType) return null;

  const baseFilters: Record<string, any> = {
    report_type: reportType,
    is_active: true,
  };

  // Pull a small superset (all active templates of this type) once and rank in JS.
  // Cheaper than 4 round trips and lets us deterministically apply precedence.
  const { data, error } = await invokeSecureFunction('manage-templates', {
    operation: 'list',
    table: 'report_templates',
    listOptions: {
      orderBy: 'updated_at',
      orderAsc: false,
      filters: baseFilters,
      limit: 200,
    },
  });
  if (error || !data?.records?.length) return null;

  const rows = data.records as any[];
  const variant = opts.variant ?? null;
  const agencyId = opts.agencyId ?? null;
  const userId = opts.userId ?? null;

  const candidates: Array<{ source: ResolvedTemplate['source']; row: any }> = [];
  for (const r of rows) {
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
