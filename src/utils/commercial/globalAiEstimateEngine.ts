/**
 * Global AI Estimate Engine (client)
 * -----------------------------------------------------------------------------
 * Unified gateway for generating AI-driven estimates of missing Commercial &
 * Industrial calculator assumptions. Wraps the
 * `commercial-global-ai-estimate-engine` edge function and writes accepted
 * estimates into the Master Property Assumption Store with full provenance.
 *
 * All estimates returned by this engine MUST be treated as unverified until
 * a specialist or document confirms them. Restricted fields (GST, loan,
 * ICR/DSCR thresholds, terminal cap rate, discount rate, environmental) are
 * automatically flagged for specialist review.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  useMasterAssumptionStore,
  type AssumptionConfidence,
  type AssumptionValue,
  type CalculatorTabKey,
} from './masterPropertyAssumptionStore';

// -----------------------------------------------------------------------------
// Supported field registry
// -----------------------------------------------------------------------------

export type GlobalEstimateUnit =
  | 'percent'
  | 'aud'
  | 'aud_per_sqm'
  | 'sqm'
  | 'months'
  | 'ratio'
  | 'text';

export interface GlobalEstimateFieldDefinition {
  /** Stable assumption key (matches master store key) */
  key: string;
  /** Human label */
  label: string;
  /** Expected unit */
  unit: GlobalEstimateUnit;
  /** Calculator tabs that consume this field */
  affectedTabs: CalculatorTabKey[];
  /** Force specialist review even when AI confidence is high */
  alwaysSpecialistReview?: boolean;
}

export const GLOBAL_ESTIMATE_FIELDS = {
  passingRent: { key: 'lease.passingRentPa', label: 'Passing rent (net p.a.)', unit: 'aud', affectedTabs: ['noi', 'capRate', 'tenYearCashFlow'] },
  marketRent: { key: 'lease.marketRentPa', label: 'Market rent (net p.a.)', unit: 'aud', affectedTabs: ['noi', 'capRate', 'dcf', 'tenYearCashFlow'] },
  recoveredOutgoings: { key: 'lease.recoveredOutgoingsPa', label: 'Recovered outgoings (p.a.)', unit: 'aud', affectedTabs: ['noi', 'tenYearCashFlow'] },
  vacancyAllowance: { key: 'noi.vacancyAllowancePct', label: 'Vacancy allowance (%)', unit: 'percent', affectedTabs: ['noi', 'dcf', 'tenYearCashFlow'] },
  ownerBorneExpenses: { key: 'noi.ownerBorneExpensesPa', label: 'Owner-borne expenses (p.a.)', unit: 'aud', affectedTabs: ['noi', 'tenYearCashFlow'] },
  noiAdjustments: { key: 'noi.adjustmentsPa', label: 'NOI adjustments (p.a.)', unit: 'aud', affectedTabs: ['noi', 'capRate'] },
  capRate: { key: 'capRate.marketCapRate', label: 'Market cap rate', unit: 'percent', affectedTabs: ['capRate', 'dcf'] },
  terminalCapRate: { key: 'dcf.terminalCapRate', label: 'Terminal cap rate', unit: 'percent', affectedTabs: ['dcf', 'tenYearCashFlow'], alwaysSpecialistReview: true },
  rentalGrowth: { key: 'dcf.rentalGrowthPct', label: 'Rental growth (% p.a.)', unit: 'percent', affectedTabs: ['dcf', 'tenYearCashFlow'] },
  capitalGrowth: { key: 'dcf.capitalGrowthPct', label: 'Capital growth (% p.a.)', unit: 'percent', affectedTabs: ['dcf', 'tenYearCashFlow'] },
  discountRate: { key: 'dcf.discountRate', label: 'Discount rate', unit: 'percent', affectedTabs: ['dcf'], alwaysSpecialistReview: true },
  sellingCosts: { key: 'dcf.sellingCostsPct', label: 'Selling costs (% of sale)', unit: 'percent', affectedTabs: ['dcf', 'tenYearCashFlow'] },
  gstTreatment: { key: 'gst.treatment', label: 'GST treatment suggestion', unit: 'text', affectedTabs: ['gst'], alwaysSpecialistReview: true },
  gstClaimabilityRisk: { key: 'gst.claimabilityRisk', label: 'GST claimability risk', unit: 'text', affectedTabs: ['gst'], alwaysSpecialistReview: true },
  loanLvr: { key: 'borrowing.lvr', label: 'Loan LVR', unit: 'percent', affectedTabs: ['borrowing', 'icrDscr'], alwaysSpecialistReview: true },
  loanInterestRate: { key: 'borrowing.interestRate', label: 'Loan interest rate', unit: 'percent', affectedTabs: ['borrowing', 'icrDscr', 'tenYearCashFlow'], alwaysSpecialistReview: true },
  loanTermYears: { key: 'borrowing.termYears', label: 'Loan term (years)', unit: 'ratio', affectedTabs: ['borrowing', 'icrDscr'], alwaysSpecialistReview: true },
  icrThreshold: { key: 'icrDscr.icrThreshold', label: 'ICR threshold', unit: 'ratio', affectedTabs: ['icrDscr'], alwaysSpecialistReview: true },
  dscrThreshold: { key: 'icrDscr.dscrThreshold', label: 'DSCR threshold', unit: 'ratio', affectedTabs: ['icrDscr'], alwaysSpecialistReview: true },
  capexReserve: { key: 'tenYearCashFlow.capexReservePa', label: 'Capex reserve (p.a.)', unit: 'aud', affectedTabs: ['tenYearCashFlow', 'dcf'] },
  downtimeMonths: { key: 'lease.downtimeMonths', label: 'Re-lease downtime (months)', unit: 'months', affectedTabs: ['dcf', 'tenYearCashFlow'] },
  tenantIncentives: { key: 'lease.tenantIncentivesPct', label: 'Tenant incentives (% of rent)', unit: 'percent', affectedTabs: ['dcf', 'tenYearCashFlow'] },
  hardstandArea: { key: 'industrial.hardstandSqm', label: 'Hardstand area (m²)', unit: 'sqm', affectedTabs: ['industrialMetrics', 'overview'] },
  officeComponent: { key: 'industrial.officeSqm', label: 'Office component (m²)', unit: 'sqm', affectedTabs: ['industrialMetrics', 'overview'] },
  siteCoverBenchmark: { key: 'industrial.siteCoverPct', label: 'Site cover benchmark', unit: 'percent', affectedTabs: ['industrialMetrics'] },
  rentPerSqmBenchmark: { key: 'benchmarks.rentPerSqm', label: 'Rent per m² benchmark', unit: 'aud_per_sqm', affectedTabs: ['noi', 'capRate', 'industrialMetrics'] },
  pricePerSqmBenchmark: { key: 'benchmarks.pricePerSqm', label: 'Price per m² benchmark', unit: 'aud_per_sqm', affectedTabs: ['capRate', 'industrialMetrics', 'overview'] },
  tenYearCashFlowAssumptions: { key: 'tenYearCashFlow.assumptionsBundle', label: '10-year cashflow assumptions bundle', unit: 'text', affectedTabs: ['tenYearCashFlow'] },
} as const satisfies Record<string, GlobalEstimateFieldDefinition>;

export type GlobalEstimateFieldId = keyof typeof GLOBAL_ESTIMATE_FIELDS;

// -----------------------------------------------------------------------------
// Engine I/O
// -----------------------------------------------------------------------------

export interface GlobalEstimateContext {
  scraped?: Record<string, unknown>;
  contract?: Record<string, unknown>;
  lease?: Record<string, unknown>;
  research?: Record<string, unknown>;
  tabOutputs?: Record<string, unknown>;
  comparables?: Array<Record<string, unknown>>;
}

export interface GlobalEstimateRequest {
  domain: 'commercial' | 'industrial';
  propertyId?: string;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  assetType?: string | null;
  assetSubtype?: string | null;
  knownFields?: Record<string, unknown>;
  context?: GlobalEstimateContext;
  /** Either registry field ids OR ad-hoc field definitions */
  fields: Array<GlobalEstimateFieldId | GlobalEstimateFieldDefinition>;
}

export interface GlobalEstimate {
  key: string;
  fieldId?: GlobalEstimateFieldId;
  label: string;
  unit: GlobalEstimateUnit | null;
  /** Suggested point estimate */
  value: AssumptionValue;
  /** Suggested range around the point estimate */
  range: { low: number | null; high: number | null };
  confidence: AssumptionConfidence;
  dataUsed: string[];
  missingData: string[];
  riskNotes: string[];
  sourceBasis: string[];
  affectedTabs: CalculatorTabKey[];
  specialistReview: boolean;
  rationale: string | null;
}

export interface GlobalEstimateResponse {
  success: boolean;
  estimates: GlobalEstimate[];
  error?: string;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Resolve a request field (id or full definition) to a definition.
 */
function resolveDefinition(
  input: GlobalEstimateFieldId | GlobalEstimateFieldDefinition,
): GlobalEstimateFieldDefinition {
  if (typeof input === 'string') return GLOBAL_ESTIMATE_FIELDS[input];
  return input;
}

const RESTRICTED_KEY_PATTERNS = [
  /^gst\./i,
  /^borrowing\./i,
  /^icrDscr\./i,
  /^dcf\.terminalCapRate$/i,
  /^dcf\.discountRate$/i,
  /environmental/i,
  /contamination/i,
];

function isRestrictedKey(key: string): boolean {
  return RESTRICTED_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Generate AI estimates for the supplied fields.
 * Returns rich per-field metadata; does NOT write to the master store.
 */
export async function generateGlobalAiEstimates(
  request: GlobalEstimateRequest,
): Promise<GlobalEstimateResponse> {
  const defs = request.fields.map(resolveDefinition).filter(Boolean);
  if (defs.length === 0) return { success: true, estimates: [] };

  const idByKey = new Map<string, GlobalEstimateFieldId>();
  for (const id of Object.keys(GLOBAL_ESTIMATE_FIELDS) as GlobalEstimateFieldId[]) {
    idByKey.set(GLOBAL_ESTIMATE_FIELDS[id].key, id);
  }

  const { data, error } = await supabase.functions.invoke('commercial-global-ai-estimate-engine', {
    body: {
      domain: request.domain,
      propertyId: request.propertyId,
      address: request.address,
      suburb: request.suburb,
      state: request.state,
      postcode: request.postcode,
      assetType: request.assetType,
      assetSubtype: request.assetSubtype,
      knownFields: request.knownFields ?? {},
      context: request.context ?? {},
      fields: defs.map((d) => ({
        key: d.key,
        label: d.label,
        unit: d.unit,
        affectedTabs: d.affectedTabs,
      })),
    },
  });

  if (error) return { success: false, estimates: [], error: error.message };
  if (!data?.success) return { success: false, estimates: [], error: data?.error ?? 'Unknown error' };

  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const estimates: GlobalEstimate[] = (data.estimates ?? []).map((raw: any): GlobalEstimate => {
    const def = defByKey.get(raw.key);
    const specialistReview = Boolean(raw.specialistReview) || isRestrictedKey(raw.key) || def?.alwaysSpecialistReview === true;
    return {
      key: raw.key,
      fieldId: idByKey.get(raw.key),
      label: def?.label ?? raw.key,
      unit: raw.unit ?? def?.unit ?? null,
      value: raw.value ?? null,
      range: raw.range ?? { low: null, high: null },
      confidence: raw.confidence ?? 'low',
      dataUsed: raw.dataUsed ?? [],
      missingData: raw.missingData ?? [],
      riskNotes: raw.riskNotes ?? [],
      sourceBasis: raw.sourceBasis ?? ['AI estimate'],
      affectedTabs: (raw.affectedTabs ?? def?.affectedTabs ?? []) as CalculatorTabKey[],
      specialistReview,
      rationale: raw.rationale ?? null,
    };
  });

  return { success: true, estimates };
}

/**
 * Apply a single AI estimate as the active value in the Master Assumption Store.
 * Records source = 'AI Estimate', verificationStatus = 'unverified', and writes
 * risk notes onto the record. Specialist-review fields are written with a
 * 'caution' warning so downstream tabs can surface a banner.
 */
export function applyEstimateToMasterStore(estimate: GlobalEstimate): void {
  const store = useMasterAssumptionStore.getState();
  store.acceptAiEstimate({
    key: estimate.key,
    estimatedValue: estimate.value,
    confidence: estimate.confidence,
    label: estimate.label,
    tabDependencies: estimate.affectedTabs,
    notes: [
      estimate.rationale,
      estimate.riskNotes.length ? `Risk: ${estimate.riskNotes.join('; ')}` : null,
      estimate.missingData.length ? `Missing: ${estimate.missingData.join('; ')}` : null,
      estimate.range.low != null || estimate.range.high != null
        ? `Range: ${estimate.range.low ?? '—'} to ${estimate.range.high ?? '—'}`
        : null,
    ]
      .filter(Boolean)
      .join(' • ') || undefined,
  });

  if (estimate.specialistReview) {
    store.setWarning(estimate.key, 'caution', 'Specialist review required before relying on this AI estimate.');
  }
}

/**
 * Apply many estimates in one pass.
 */
export function applyEstimatesToMasterStore(estimates: GlobalEstimate[]): void {
  for (const e of estimates) {
    if (e.value === null || e.value === undefined) continue;
    applyEstimateToMasterStore(e);
  }
}

/**
 * Convenience: generate + apply in one call. Returns the full estimate list
 * so callers can show ranges/risk notes alongside the new master-store values.
 */
export async function runGlobalAiEstimateEngine(
  request: GlobalEstimateRequest,
  options: { autoApply?: boolean } = { autoApply: true },
): Promise<GlobalEstimateResponse> {
  const result = await generateGlobalAiEstimates(request);
  if (result.success && options.autoApply) {
    applyEstimatesToMasterStore(result.estimates);
  }
  return result;
}
