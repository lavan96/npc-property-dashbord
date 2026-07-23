/** The client-facing variants shown throughout the report library and workspace. */
/** This is the business order used in property-package summaries. */
export const REPORT_VARIANT_ORDER = ['compass', 'financial', 'strategic', 'snapshot', 'briefing'] as const;
export type ReportVariant = typeof REPORT_VARIANT_ORDER[number];
export const CLIENT_REPORT_VARIANTS = ['financial', 'strategic', 'briefing', 'snapshot'] as const;
export type ClientReportVariant = typeof CLIENT_REPORT_VARIANTS[number];

export type ReportVariantSource = {
  report_variant?: unknown;
  report_subtype?: unknown;
  variant?: unknown;
  report_type?: unknown;
  report_tier?: unknown;
  template_id?: unknown;
  template_identifier?: unknown;
  template?: unknown;
  generation_job?: unknown;
  generation_job_variant?: unknown;
  generation_mode?: unknown;
  engine?: unknown;
  generation_engine?: unknown;
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

export const REPORT_VARIANT_LABELS: Record<ReportVariant, string> = {
  compass: 'Compass', financial: 'Financial', strategic: 'Strategic', briefing: 'Briefing', snapshot: 'Snapshot',
};

export function isClientReportVariant(value: unknown): value is ClientReportVariant {
  return typeof value === 'string' && (CLIENT_REPORT_VARIANTS as readonly string[]).includes(value);
}

function normalizeValue(value: unknown): ReportVariant | undefined {
  if (typeof value !== 'string') return undefined;
  return aliases[value.trim().toLowerCase().replace(/[\s-]+/g, '_')];
}

function metadataCandidates(value: unknown): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const metadata = value as Record<string, unknown>;
  return [
    metadata.report_variant, metadata.report_subtype, metadata.variant,
    metadata.reportType, metadata.reportSubtype, metadata.tier,
    metadata.report_type, metadata.report_tier, metadata.report_code,
    metadata.template_type, metadata.template_id, metadata.generation_mode,
  ];
}

function findSpecific(candidates: unknown[]): ReportVariant | undefined {
  for (const candidate of candidates) {
    const variant = normalizeValue(candidate);
    if (variant && variant !== 'compass') return variant;
  }
  return undefined;
}

function hasKnownBase(candidates: unknown[]): boolean {
  return candidates.some((candidate) => normalizeValue(candidate) === 'compass');
}

/**
 * Resolves the client-facing report variant without using source/parent report IDs.
 * Structured fields are intentionally checked before legacy title inference so a
 * Compass engine parent can never mask a Briefing or Snapshot child report.
 */
export function resolveInvestmentReportType(report?: ReportVariantSource | string | null): ReportVariant | undefined {
  if (typeof report === 'string') return normalizeValue(report);
  if (report == null) return undefined;

  // A Compass/composite engine is deliberately evaluated last. Historical
  // Snapshot and Briefing rows often retain that base value while their actual
  // variant lives in report_tier or metadata.
  const metadata = [
    ...metadataCandidates(report.metadata),
    ...metadataCandidates(report.report_metadata),
    ...metadataCandidates(report.generation_job),
  ];
  const specific = [
    report.report_variant, report.report_subtype, report.variant,
    ...metadata,
    report.report_tier, report.legacy_report_code, report.report_code,
    report.template_id, report.template_identifier, report.template,
    report.generation_job_variant, report.generation_mode,
  ];
  const specificMatch = findSpecific(specific);
  if (specificMatch) return specificMatch;

  // Titles are historical fallback only. Match explicit words, never a vague
  // "investment report" title, which would incorrectly force Compass.
  const title = [report.report_title, report.title].filter((value): value is string => typeof value === 'string').join(' ').toLowerCase();
  if (/\b(financial|finance|fin)\b/.test(title)) return 'financial';
  if (/\b(strategic|strategy|pldd|due diligence)\b/.test(title)) return 'strategic';
  if (/\b(briefing|brief|client briefing)\b/.test(title)) return 'briefing';
  if (/\b(snapshot|quick snapshot|overview)\b/.test(title)) return 'snapshot';

  const base = [report.report_type, report.engine, report.generation_engine, report.report_variant, ...metadata, report.report_tier];
  if (hasKnownBase(base)) return 'compass';

  // Rows with no type identifiers pre-date variants and are genuine base
  // investment reports. Rows carrying an unrecognised identifier stay neutral.
  const hasIdentifier = [...specific, ...base].some((value) => typeof value === 'string' && value.trim().length > 0);
  return hasIdentifier ? undefined : 'compass';
}

export function normalizeReportVariant(report?: ReportVariantSource | string | null): ReportVariant {
  return resolveInvestmentReportType(report) || 'compass';
}

export function getReportVariantLabel(report?: ReportVariantSource | string | null): string {
  const resolved = resolveInvestmentReportType(report);
  return resolved ? REPORT_VARIANT_LABELS[resolved] : 'Report';
}

export function getReportPackageKey(report: { property_listing_id?: string | null; derived_from_report_id?: string | null; property_address: string }): string {
  return report.property_listing_id || report.derived_from_report_id || `address:${report.property_address.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}
