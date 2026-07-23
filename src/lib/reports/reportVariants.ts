export const REPORT_VARIANT_ORDER = ['compass', 'financial', 'strategic', 'briefing', 'snapshot'] as const;
export type ReportVariant = typeof REPORT_VARIANT_ORDER[number];

const aliases: Record<string, ReportVariant> = {
  compass: 'compass', composite: 'compass',
  financial: 'financial', fin: 'financial',
  strategic: 'strategic', pldd: 'strategic', due_diligence: 'strategic', 'due diligence': 'strategic',
  briefing: 'briefing', brief: 'briefing', brf: 'briefing',
  snapshot: 'snapshot', snap: 'snapshot', snp: 'snapshot',
};

export function normalizeReportVariant(value?: string | null): ReportVariant {
  return aliases[(value || 'compass').trim().toLowerCase().replace(/[\s-]+/g, '_')] || 'compass';
}

export function getReportVariantLabel(value?: string | null): string {
  return ({ compass: 'Compass', financial: 'Financial', strategic: 'Strategic', briefing: 'Briefing', snapshot: 'Snapshot' } as const)[normalizeReportVariant(value)];
}

export function getReportPackageKey(report: { property_listing_id?: string | null; derived_from_report_id?: string | null; property_address: string }): string {
  return report.property_listing_id || report.derived_from_report_id || `address:${report.property_address.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}
