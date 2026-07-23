/** The client-facing variants shown throughout the report library and workspace. */
export const REPORT_VARIANT_ORDER = ['compass', 'financial', 'strategic', 'briefing', 'snapshot'] as const;
export type ReportVariant = typeof REPORT_VARIANT_ORDER[number];

export type ReportVariantSource = {
  report_variant?: unknown;
  report_type?: unknown;
  report_tier?: unknown;
  template_id?: unknown;
  template_identifier?: unknown;
  template?: unknown;
  generation_job?: unknown;
  generation_job_variant?: unknown;
  metadata?: unknown;
  report_metadata?: unknown;
  legacy_report_code?: unknown;
  report_code?: unknown;
  title?: unknown;
  report_title?: unknown;
};

const aliases: Record<string, ReportVariant> = {
  compass: 'compass', composite: 'compass', base: 'compass', investment: 'compass', investment_report: 'compass', primary: 'compass',
  financial: 'financial', finance: 'financial', fin: 'financial', financial_report: 'financial',
  strategic: 'strategic', strategy: 'strategic', pldd: 'strategic', property_level_due_diligence: 'strategic', due_diligence: 'strategic',
  briefing: 'briefing', brief: 'briefing', brf: 'briefing', client_briefing: 'briefing',
  snapshot: 'snapshot', snap: 'snapshot', snp: 'snapshot', overview: 'snapshot', quick_snapshot: 'snapshot',
};

const labels: Record<ReportVariant, string> = {
  compass: 'Compass', financial: 'Financial', strategic: 'Strategic', briefing: 'Briefing', snapshot: 'Snapshot',
};

function normalizeValue(value: unknown): ReportVariant | undefined {
  if (typeof value !== 'string') return undefined;
  return aliases[value.trim().toLowerCase().replace(/[\s-]+/g, '_')];
}

function metadataVariant(value: unknown): ReportVariant | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const metadata = value as Record<string, unknown>;
  return normalizeValue(metadata.report_variant) || normalizeValue(metadata.variant) || normalizeValue(metadata.report_type) || normalizeValue(metadata.report_tier) || normalizeValue(metadata.template_id);
}

/**
 * Resolves the client-facing report variant without using source/parent report IDs.
 * Structured fields are intentionally checked before legacy title inference so a
 * Compass engine parent can never mask a Briefing or Snapshot child report.
 */
export function normalizeReportVariant(report?: ReportVariantSource | string | null): ReportVariant {
  if (typeof report === 'string' || report == null) return normalizeValue(report) || 'compass';

  const structured = [
    report.report_variant,
    report.report_type,
    report.report_tier,
    report.template_id,
    report.template_identifier,
    report.template,
    report.generation_job_variant,
    metadataVariant(report.generation_job),
    metadataVariant(report.metadata),
    metadataVariant(report.report_metadata),
    report.legacy_report_code,
    report.report_code,
  ];
  for (const value of structured) {
    const variant = normalizeValue(value);
    if (variant) return variant;
  }

  // Titles are historical fallback only. Match explicit words, never a vague
  // "investment report" title, which would incorrectly force Compass.
  const title = [report.report_title, report.title].filter((value): value is string => typeof value === 'string').join(' ').toLowerCase();
  if (/\b(financial|finance|fin)\b/.test(title)) return 'financial';
  if (/\b(strategic|strategy|pldd|due diligence)\b/.test(title)) return 'strategic';
  if (/\b(briefing|brief|client briefing)\b/.test(title)) return 'briefing';
  if (/\b(snapshot|quick snapshot|overview)\b/.test(title)) return 'snapshot';
  return 'compass';
}

export function getReportVariantLabel(report?: ReportVariantSource | string | null): string {
  return labels[normalizeReportVariant(report)];
}

export function getReportPackageKey(report: { property_listing_id?: string | null; derived_from_report_id?: string | null; property_address: string }): string {
  return report.property_listing_id || report.derived_from_report_id || `address:${report.property_address.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}
