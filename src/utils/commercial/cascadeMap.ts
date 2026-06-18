/**
 * Cross-Tab Cascade Map (Commercial & Industrial Calculators)
 * ---------------------------------------------------------------------------
 * Single source of truth for which calculator tab outputs cascade into which
 * downstream tabs, and the master-store keys they write to.
 *
 * Producing tabs call `publishTabOutputs('noi', { actualNoi, ... })`. This
 * routes each output to the master assumption store with:
 *   - source = e.g. 'NOI Tab' (so audit shows which tab produced it)
 *   - tabDependencies = the cascade targets defined here (consumers read by tab)
 *   - confidence = inherited or explicit (default: medium for calc outputs)
 *
 * Hard rules enforced here:
 *   1. A downstream report (overview / pdf) NEVER overwrites upstream
 *      calculator assumptions — those keys are marked `reportOnly`.
 *   2. A consuming tab may read upstream assumptions but cannot publish a
 *      value back into a key produced by an upstream tab in the same
 *      acyclic chain — `assertNoCircularWrite` blocks it.
 *   3. Scenario save-back is opt-in and goes through `saveScenarioBack`,
 *      which is the ONLY path that may overwrite an upstream assumption.
 */

import {
  useMasterAssumptionStore,
  type AssumptionConfidence,
  type AssumptionSource,
  type AssumptionValue,
  type CalculatorTabKey,
} from './masterPropertyAssumptionStore';
import { useReportFreshnessStore } from './reportFreshnessStore';

// ---------------------------------------------------------------------------
// Cascade-only tab vocabulary
// ---------------------------------------------------------------------------
// Calculator tabs that produce outputs other tabs consume.
export type ProducerTab =
  | 'noi'
  | 'capRate'
  | 'gst'
  | 'icrDscr'
  | 'borrowing'
  | 'dcf'
  | 'industrialMetrics'
  | 'tenYearCashFlow';

// Reporting destinations that may read outputs but never overwrite upstream.
export type ReportTarget = 'overview' | 'clientPdfReport';

export type CascadeTarget = CalculatorTabKey | ReportTarget;

// Tab-source labels recorded in master store provenance.
const TAB_SOURCE: Record<ProducerTab, Extract<AssumptionSource,
  'NOI Tab' | 'Cap Rate Tab' | 'GST Tab' | 'ICR / DSCR Tab' | 'Borrowing Capacity' | 'DCF Tab' | 'Industrial Metrics' | '10-Year Cash Flow'>> = {
  noi: 'NOI Tab',
  capRate: 'Cap Rate Tab',
  gst: 'GST Tab',
  icrDscr: 'ICR / DSCR Tab',
  borrowing: 'Borrowing Capacity',
  dcf: 'DCF Tab',
  industrialMetrics: 'Industrial Metrics',
  tenYearCashFlow: '10-Year Cash Flow',
};

// ---------------------------------------------------------------------------
// Output → master-store-key + cascade targets registry
// ---------------------------------------------------------------------------
export interface CascadeOutputDefinition {
  /** master store key the output is written to */
  key: string;
  /** human label */
  label: string;
  /** downstream consumers / reporting surfaces */
  cascadeTo: CascadeTarget[];
  /** report-only keys may not be consumed by upstream calculators */
  reportOnly?: boolean;
  /** suggested confidence if caller does not specify */
  defaultConfidence?: AssumptionConfidence;
  /** narrow cascade for sensitivity-only consumers (e.g. cap rate → borrowing) */
  consumerScope?: Partial<Record<CascadeTarget, 'full' | 'sensitivityOnly'>>;
}

type Registry<T extends string> = Record<T, CascadeOutputDefinition>;

// ---- NOI tab outputs ------------------------------------------------------
export type NoiOutputKey =
  | 'actualNoi' | 'stabilisedNoi' | 'lenderAdjustedNoi'
  | 'vacancyAllowancePct' | 'passingRentPa' | 'marketRentPa'
  | 'recoveredOutgoingsPa' | 'ownerBorneExpensesPa';

export const NOI_OUTPUTS: Registry<NoiOutputKey> = {
  actualNoi:            { key: 'noi.actualNoi',            label: 'Actual NOI',                 cascadeTo: ['borrowing', 'capRate', 'icrDscr', 'dcf', 'tenYearCashFlow', 'overview'] },
  stabilisedNoi:        { key: 'noi.stabilisedNoi',        label: 'Stabilised NOI',             cascadeTo: ['borrowing', 'capRate', 'icrDscr', 'dcf', 'tenYearCashFlow', 'overview'] },
  lenderAdjustedNoi:    { key: 'noi.lenderAdjustedNoi',    label: 'Lender-Adjusted NOI',        cascadeTo: ['borrowing', 'icrDscr', 'overview'] },
  vacancyAllowancePct:  { key: 'noi.vacancyAllowancePct',  label: 'Vacancy allowance %',        cascadeTo: ['capRate', 'icrDscr', 'dcf', 'tenYearCashFlow', 'overview'] },
  passingRentPa:        { key: 'lease.passingRentPa',      label: 'Passing rent (p.a.)',        cascadeTo: ['capRate', 'icrDscr', 'dcf', 'tenYearCashFlow', 'overview', 'industrialMetrics'] },
  marketRentPa:         { key: 'lease.marketRentPa',       label: 'Market rent (p.a.)',         cascadeTo: ['capRate', 'dcf', 'tenYearCashFlow', 'overview', 'industrialMetrics'] },
  recoveredOutgoingsPa: { key: 'lease.recoveredOutgoingsPa', label: 'Recovered outgoings',      cascadeTo: ['dcf', 'tenYearCashFlow', 'overview'] },
  ownerBorneExpensesPa: { key: 'noi.ownerBorneExpensesPa', label: 'Owner-borne expenses',       cascadeTo: ['dcf', 'tenYearCashFlow', 'overview'] },
};

// ---- Cap Rate tab outputs --------------------------------------------------
export type CapRateOutputKey = 'targetCapRate' | 'impliedValue' | 'valuationGap' | 'benchmarkStatus';
export const CAPRATE_OUTPUTS: Registry<CapRateOutputKey> = {
  targetCapRate:    { key: 'capRate.targetCapRate',   label: 'Target cap rate',
                      cascadeTo: ['dcf', 'tenYearCashFlow', 'overview', 'borrowing'],
                      consumerScope: { borrowing: 'sensitivityOnly' } },
  impliedValue:     { key: 'capRate.impliedValue',    label: 'Implied value',
                      cascadeTo: ['overview', 'borrowing'],
                      consumerScope: { borrowing: 'sensitivityOnly' } },
  valuationGap:     { key: 'capRate.valuationGap',    label: 'Valuation gap',     cascadeTo: ['overview'] },
  benchmarkStatus:  { key: 'capRate.benchmarkStatus', label: 'Benchmark status',  cascadeTo: ['overview'] },
};

// ---- GST tab outputs -------------------------------------------------------
export type GstOutputKey =
  | 'treatment' | 'gstAmount' | 'gstClaimable'
  | 'settlementCashflow' | 'economicCost' | 'netAcquisitionCost';
export const GST_OUTPUTS: Registry<GstOutputKey> = {
  treatment:           { key: 'gst.treatment',           label: 'GST treatment',          cascadeTo: ['borrowing', 'dcf', 'overview'] },
  gstAmount:           { key: 'gst.gstAmount',           label: 'GST amount',             cascadeTo: ['borrowing', 'dcf', 'overview'] },
  gstClaimable:        { key: 'gst.gstClaimable',        label: 'GST claimable',          cascadeTo: ['borrowing', 'dcf', 'overview'] },
  settlementCashflow:  { key: 'gst.settlementCashflow',  label: 'GST settlement cashflow',cascadeTo: ['borrowing', 'overview'] },
  economicCost:        { key: 'gst.economicCost',        label: 'GST economic cost',      cascadeTo: ['dcf', 'tenYearCashFlow', 'overview'] },
  netAcquisitionCost:  { key: 'gst.netAcquisitionCost',  label: 'Net acquisition cost',   cascadeTo: ['borrowing', 'dcf', 'overview'] },
};

// ---- ICR/DSCR tab outputs --------------------------------------------------
export type IcrDscrOutputKey =
  | 'assessmentRate' | 'annualInterest' | 'annualDebtService'
  | 'icr' | 'dscr' | 'debtYield' | 'maxLoanByCoverage' | 'bindingConstraint';
export const ICR_DSCR_OUTPUTS: Registry<IcrDscrOutputKey> = {
  assessmentRate:     { key: 'icrDscr.assessmentRate',    label: 'Assessment rate',      cascadeTo: ['borrowing', 'dcf', 'tenYearCashFlow', 'overview'] },
  annualInterest:     { key: 'icrDscr.annualInterest',    label: 'Annual interest',      cascadeTo: ['borrowing', 'dcf', 'tenYearCashFlow', 'overview'] },
  annualDebtService:  { key: 'icrDscr.annualDebtService', label: 'Annual debt service',  cascadeTo: ['borrowing', 'dcf', 'tenYearCashFlow', 'overview'] },
  icr:                { key: 'icrDscr.icr',               label: 'ICR',                  cascadeTo: ['borrowing', 'overview'] },
  dscr:               { key: 'icrDscr.dscr',              label: 'DSCR',                 cascadeTo: ['borrowing', 'overview'] },
  debtYield:          { key: 'icrDscr.debtYield',         label: 'Debt yield',           cascadeTo: ['borrowing', 'overview'] },
  maxLoanByCoverage:  { key: 'icrDscr.maxLoanByCoverage', label: 'Max loan by coverage', cascadeTo: ['borrowing', 'overview'] },
  bindingConstraint:  { key: 'icrDscr.bindingConstraint', label: 'Binding constraint',   cascadeTo: ['borrowing', 'overview'] },
};

// ---- Borrowing Capacity tab outputs ---------------------------------------
export type BorrowingOutputKey =
  | 'proposedLoanAmount' | 'requiredEquity' | 'availableEquity'
  | 'maxRiskAdjustedLoan' | 'bindingConstraint' | 'purchaseAbility' | 'lenderProfile';
export const BORROWING_OUTPUTS: Registry<BorrowingOutputKey> = {
  proposedLoanAmount:   { key: 'borrowing.proposedLoanAmount',  label: 'Proposed loan amount',     cascadeTo: ['icrDscr', 'dcf', 'tenYearCashFlow', 'overview'] },
  requiredEquity:       { key: 'borrowing.requiredEquity',      label: 'Required equity',          cascadeTo: ['dcf', 'tenYearCashFlow', 'overview'] },
  availableEquity:      { key: 'borrowing.availableEquity',     label: 'Available equity',         cascadeTo: ['overview'] },
  maxRiskAdjustedLoan:  { key: 'borrowing.maxRiskAdjustedLoan', label: 'Max risk-adjusted loan',   cascadeTo: ['icrDscr', 'overview'] },
  bindingConstraint:    { key: 'borrowing.bindingConstraint',   label: 'Binding constraint',       cascadeTo: ['overview'] },
  purchaseAbility:      { key: 'borrowing.purchaseAbility',     label: 'Purchase ability',         cascadeTo: ['overview'] },
  lenderProfile:        { key: 'borrowing.lenderProfile',       label: 'Lender profile',           cascadeTo: ['icrDscr', 'overview'] },
};

// ---- DCF tab outputs -------------------------------------------------------
export type DcfOutputKey =
  | 'rentalGrowthPct' | 'vacancyAssumptionPct' | 'terminalCapRate'
  | 'discountRate' | 'capexPa' | 'downtimeMonths'
  | 'leveredIrr' | 'unleveredIrr' | 'npv' | 'terminalValue' | 'equityMultiple';
export const DCF_OUTPUTS: Registry<DcfOutputKey> = {
  rentalGrowthPct:      { key: 'dcf.rentalGrowthPct',      label: 'Rental growth %',      cascadeTo: ['tenYearCashFlow', 'overview', 'clientPdfReport'] },
  vacancyAssumptionPct: { key: 'dcf.vacancyAssumptionPct', label: 'Vacancy assumption %', cascadeTo: ['tenYearCashFlow', 'overview', 'clientPdfReport'] },
  terminalCapRate:      { key: 'dcf.terminalCapRate',      label: 'Terminal cap rate',    cascadeTo: ['tenYearCashFlow', 'overview', 'clientPdfReport'] },
  discountRate:         { key: 'dcf.discountRate',         label: 'Discount rate',        cascadeTo: ['tenYearCashFlow', 'overview', 'clientPdfReport'] },
  capexPa:              { key: 'dcf.capexPa',              label: 'Capex (p.a.)',         cascadeTo: ['tenYearCashFlow', 'overview', 'clientPdfReport'] },
  downtimeMonths:       { key: 'dcf.downtimeMonths',       label: 'Downtime (months)',    cascadeTo: ['tenYearCashFlow', 'overview', 'clientPdfReport'] },
  leveredIrr:           { key: 'dcf.leveredIrr',           label: 'Levered IRR',          cascadeTo: ['tenYearCashFlow', 'overview', 'clientPdfReport'], reportOnly: true },
  unleveredIrr:         { key: 'dcf.unleveredIrr',         label: 'Unlevered IRR',        cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
  npv:                  { key: 'dcf.npv',                  label: 'NPV',                  cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
  terminalValue:        { key: 'dcf.terminalValue',        label: 'Terminal value',       cascadeTo: ['tenYearCashFlow', 'overview', 'clientPdfReport'], reportOnly: true },
  equityMultiple:       { key: 'dcf.equityMultiple',       label: 'Equity multiple',      cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
};

// ---- Industrial Metrics tab outputs ---------------------------------------
export type IndustrialOutputKey =
  | 'netRentPerSqm' | 'grossRentPerSqm' | 'siteCoverPct' | 'hardstandRatioPct'
  | 'officeRatioPct' | 'pricePerSqmGla' | 'pricePerSqmSite' | 'benchmarkStatus';
export const INDUSTRIAL_OUTPUTS: Registry<IndustrialOutputKey> = {
  netRentPerSqm:      { key: 'industrial.netRentPerSqm',     label: 'Net rent per m²',     cascadeTo: ['overview', 'tenYearCashFlow', 'clientPdfReport'] },
  grossRentPerSqm:    { key: 'industrial.grossRentPerSqm',   label: 'Gross rent per m²',   cascadeTo: ['overview', 'tenYearCashFlow', 'clientPdfReport'] },
  siteCoverPct:       { key: 'industrial.siteCoverPct',      label: 'Site cover %',        cascadeTo: ['overview', 'clientPdfReport'] },
  hardstandRatioPct:  { key: 'industrial.hardstandRatioPct', label: 'Hardstand ratio %',   cascadeTo: ['overview', 'clientPdfReport'] },
  officeRatioPct:     { key: 'industrial.officeRatioPct',    label: 'Office ratio %',      cascadeTo: ['overview', 'clientPdfReport'] },
  pricePerSqmGla:     { key: 'industrial.pricePerSqmGla',    label: 'Price per m² (GLA)',  cascadeTo: ['overview', 'clientPdfReport'] },
  pricePerSqmSite:    { key: 'industrial.pricePerSqmSite',   label: 'Price per m² (site)', cascadeTo: ['overview', 'clientPdfReport'] },
  benchmarkStatus:    { key: 'industrial.benchmarkStatus',   label: 'Benchmark status',    cascadeTo: ['overview', 'clientPdfReport'] },
};

// ---- 10-Year Cash Flow tab outputs ----------------------------------------
export type TenYearOutputKey =
  | 'year1Noi' | 'year1AfterTaxCashflow' | 'year10PropertyValue'
  | 'year10Equity' | 'terminalValue' | 'cumulativeAfterTaxCashflow'
  | 'leveredIrr' | 'equityMultiple' | 'riskStatus' | 'reportCommentary';
export const TEN_YEAR_OUTPUTS: Registry<TenYearOutputKey> = {
  year1Noi:                   { key: 'tenYear.year1Noi',                   label: 'Year 1 NOI',                    cascadeTo: ['overview', 'clientPdfReport'] },
  year1AfterTaxCashflow:      { key: 'tenYear.year1AfterTaxCashflow',      label: 'Year 1 after-tax cashflow',     cascadeTo: ['overview', 'clientPdfReport'] },
  year10PropertyValue:        { key: 'tenYear.year10PropertyValue',        label: 'Year 10 property value',        cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
  year10Equity:               { key: 'tenYear.year10Equity',               label: 'Year 10 equity',                cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
  terminalValue:              { key: 'tenYear.terminalValue',              label: 'Terminal value',                cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
  cumulativeAfterTaxCashflow: { key: 'tenYear.cumulativeAfterTaxCashflow', label: 'Cumulative after-tax cashflow', cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
  leveredIrr:                 { key: 'tenYear.leveredIrr',                 label: 'Levered IRR',                   cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
  equityMultiple:             { key: 'tenYear.equityMultiple',             label: 'Equity multiple',               cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
  riskStatus:                 { key: 'tenYear.riskStatus',                 label: 'Risk status',                   cascadeTo: ['overview', 'clientPdfReport'] },
  reportCommentary:           { key: 'tenYear.reportCommentary',           label: 'Report commentary',             cascadeTo: ['overview', 'clientPdfReport'], reportOnly: true },
};

// ---------------------------------------------------------------------------
// Merged producer → registry
// ---------------------------------------------------------------------------
export const CASCADE_REGISTRY: Record<ProducerTab, Record<string, CascadeOutputDefinition>> = {
  noi: NOI_OUTPUTS,
  capRate: CAPRATE_OUTPUTS,
  gst: GST_OUTPUTS,
  icrDscr: ICR_DSCR_OUTPUTS,
  borrowing: BORROWING_OUTPUTS,
  dcf: DCF_OUTPUTS,
  industrialMetrics: INDUSTRIAL_OUTPUTS,
  tenYearCashFlow: TEN_YEAR_OUTPUTS,
};

// ---------------------------------------------------------------------------
// Acyclic dependency graph (producer → set of upstream producers)
// Used to block circular overwrites.
// ---------------------------------------------------------------------------
const UPSTREAM_OF: Record<ProducerTab, ProducerTab[]> = {
  noi: [],
  capRate: ['noi'],
  gst: [],
  icrDscr: ['noi'],
  borrowing: ['noi', 'capRate', 'gst', 'icrDscr'],
  dcf: ['noi', 'capRate', 'gst', 'icrDscr', 'borrowing'],
  industrialMetrics: ['noi'],
  tenYearCashFlow: ['noi', 'capRate', 'gst', 'icrDscr', 'borrowing', 'dcf', 'industrialMetrics'],
};

/** True if `candidate` is upstream of `producer` (writing would cycle). */
export function isUpstreamOf(candidate: ProducerTab, producer: ProducerTab): boolean {
  return UPSTREAM_OF[producer].includes(candidate);
}

/** Throws if a producer attempts to publish into a key owned by an upstream tab. */
export function assertNoCircularWrite(producer: ProducerTab, def: CascadeOutputDefinition): void {
  // Key prefix (e.g. 'noi.', 'capRate.') maps to the owning producer; if the
  // owner is upstream of `producer`, refuse the write.
  const prefix = def.key.split('.')[0] as ProducerTab | string;
  const owner = (Object.keys(CASCADE_REGISTRY) as ProducerTab[])
    .find(p => Object.values(CASCADE_REGISTRY[p]).some(d => d.key === def.key));
  if (!owner) return; // ad-hoc key – allowed
  if (owner === producer) return;
  if (isUpstreamOf(owner, producer)) {
    throw new Error(
      `Cross-tab cascade blocked: ${TAB_SOURCE[producer]} cannot overwrite ${def.label} (owned by ${TAB_SOURCE[owner]}). ` +
        `Use saveScenarioBack() if this is an explicit user-confirmed scenario.`,
    );
  }
  // Silence unused
  void prefix;
}

// ---------------------------------------------------------------------------
// Publish API
// ---------------------------------------------------------------------------
export interface PublishOptions {
  /** Confidence override (defaults to medium for calc outputs). */
  confidence?: AssumptionConfidence;
  /** If true, downstream tabs are marked as 'updated' in the report freshness store. */
  markFreshness?: boolean;
}

/**
 * Publish a producing tab's outputs into the Master Assumption Store and
 * propagate cascade targets. Keys not registered are ignored (warned).
 */
export function publishTabOutputs<T extends ProducerTab>(
  producer: T,
  outputs: Partial<Record<keyof (typeof CASCADE_REGISTRY)[T], AssumptionValue>>,
  options: PublishOptions = {},
): { written: string[]; skipped: string[] } {
  const registry = CASCADE_REGISTRY[producer];
  const written: string[] = [];
  const skipped: string[] = [];
  const downstreamTabs = new Set<CalculatorTabKey>();
  const store = useMasterAssumptionStore.getState();

  for (const [outKey, rawValue] of Object.entries(outputs)) {
    const def = (registry as Record<string, CascadeOutputDefinition>)[outKey];
    if (!def) { skipped.push(outKey); continue; }
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      skipped.push(outKey);
      continue;
    }
    try {
      assertNoCircularWrite(producer, def);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[cascade]', (err as Error).message);
      skipped.push(outKey);
      continue;
    }

    // Strip report-only targets out of tabDependencies (those aren't tabs).
    const tabDependencies = def.cascadeTo.filter(
      (t): t is CalculatorTabKey => t !== 'clientPdfReport',
    );
    tabDependencies.forEach(t => { if (t !== producer) downstreamTabs.add(t); });

    store.setAssumption({
      key: def.key,
      value: rawValue as AssumptionValue,
      source: TAB_SOURCE[producer],
      label: def.label,
      confidence: options.confidence ?? def.defaultConfidence ?? 'medium',
      tabDependencies,
    });
    written.push(def.key);
  }

  if (options.markFreshness !== false && downstreamTabs.size > 0) {
    useReportFreshnessStore.getState().markTabsUpdated(
      Array.from(downstreamTabs),
      `${TAB_SOURCE[producer]} recalculated (${written.length} output${written.length === 1 ? '' : 's'}).`,
    );
  }

  return { written, skipped };
}

/**
 * Read all upstream assumption records relevant to a given producer or
 * reporting target. Reporting targets are read-only by contract.
 */
export function readCascadeInputs(target: CascadeTarget) {
  const store = useMasterAssumptionStore.getState();
  if (target === 'clientPdfReport') {
    // PDF report sees everything but never writes.
    return Object.values(store.assumptions);
  }
  return Object.values(store.assumptions).filter(rec =>
    rec.tabDependencies.includes(target as CalculatorTabKey),
  );
}

/**
 * Explicit scenario save-back path. This is the ONLY route allowed to write
 * back into an upstream key from a downstream tab. Requires an explicit
 * `confirmedByUser: true` payload — refuses otherwise.
 */
export function saveScenarioBack(
  producer: ProducerTab,
  upstreamKey: string,
  value: AssumptionValue,
  payload: { confirmedByUser: true; note?: string },
): void {
  if (!payload.confirmedByUser) {
    throw new Error('saveScenarioBack requires explicit user confirmation.');
  }
  const store = useMasterAssumptionStore.getState();
  store.applyUserOverride({
    key: upstreamKey,
    value,
    notes: payload.note ?? `Scenario save-back from ${TAB_SOURCE[producer]}.`,
  });
  useReportFreshnessStore.getState().markTabsUpdated(
    Object.keys(CASCADE_REGISTRY) as CalculatorTabKey[],
    `User saved scenario back into ${upstreamKey} from ${TAB_SOURCE[producer]}.`,
  );
}
