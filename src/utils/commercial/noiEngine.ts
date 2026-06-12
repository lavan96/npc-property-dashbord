import type { AssumptionConfidenceTag } from './assumptionRegistry';
import { deriveCalculatedConfidence } from './assumptionRegistry';

export type DataSourceMode = 'global' | 'manualOverride' | 'aiEstimate';
export type LeaseType = 'gross' | 'net' | 'semiGross' | 'tripleNet' | 'unknown';
export type IncomeType = 'passingRent' | 'marketRent' | 'stabilisedRent' | 'relatedPartyRent' | 'vacantEstimatedMarketRent';
export type NoiBasis = 'actual' | 'stabilised' | 'lenderAdjusted';

export interface OutgoingsRecoverabilityItem { name: string; amount: number; recoverablePct: number; verified?: boolean; }

export interface NoiEngineInputs {
  dataSourceMode?: DataSourceMode;
  leaseType: LeaseType;
  incomeType?: IncomeType;
  grossPassingRent: number;
  otherIncome?: number;
  marketRent?: number;
  vacancyAllowancePct?: number;
  recoveredOutgoings?: number;
  outgoings?: OutgoingsRecoverabilityItem[];
  normalisedRecoveredOutgoings?: number;
  normalisedVacancyPct?: number;
  normalisedExpenses?: number;
  incentiveAdjustment?: number;
  rentFreeAdjustment?: number;
  arrearsAdjustment?: number;
  overRentAdjustment?: number;
  waleAdjustment?: number;
  leaseRiskHaircut?: number;
  tenantRiskHaircut?: number;
  documentationRiskHaircut?: number;
  lenderAdjustedNoiHaircut?: number;
  fullyLeased?: boolean;
  leaseDocsVerified?: boolean;
  confidenceTags?: AssumptionConfidenceTag[];
}

export interface NoiBridgeItem { label: string; amount: number; }
export interface NoiEngineResult {
  potentialGrossIncome: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;
  totalOperatingExpenses: number;
  ownerBorneExpenses: number;
  recoveredOutgoings: number;
  actualNoi: number;
  stabilisedNoi: number;
  lenderAdjustedNoi: number;
  selectedNoi: number;
  selectedBasis: NoiBasis;
  confidenceTag: AssumptionConfidenceTag;
  bridge: NoiBridgeItem[];
  warnings: string[];
}

const pct = (n = 0) => Math.max(0, n) / 100;
const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

export function calculateNoiEngine(inputs: NoiEngineInputs, selectedBasis: NoiBasis = 'lenderAdjusted'): NoiEngineResult {
  const warnings: string[] = [];
  const otherIncome = inputs.otherIncome ?? 0;
  const potentialGrossIncome = Math.max(0, inputs.grossPassingRent + otherIncome);
  const vacancyLoss = potentialGrossIncome * pct(inputs.vacancyAllowancePct ?? 0);
  const outgoings = inputs.outgoings ?? [];
  const totalOperatingExpenses = sum(outgoings.map(o => o.amount));
  const matrixRecovered = sum(outgoings.map(o => o.amount * Math.min(1, Math.max(0, o.recoverablePct / 100))));
  const recoveredOutgoings = inputs.recoveredOutgoings ?? matrixRecovered;
  const ownerBorneExpenses = Math.max(0, totalOperatingExpenses - recoveredOutgoings);
  const effectiveGrossIncome = potentialGrossIncome - vacancyLoss + recoveredOutgoings;
  const actualNoi = effectiveGrossIncome - totalOperatingExpenses;
  const marketRent = inputs.marketRent ?? inputs.grossPassingRent;
  const normalisedVacancy = (marketRent + otherIncome) * pct(inputs.normalisedVacancyPct ?? inputs.vacancyAllowancePct ?? 0);
  const stabilisedNoi = marketRent + otherIncome + (inputs.normalisedRecoveredOutgoings ?? recoveredOutgoings) - normalisedVacancy - (inputs.normalisedExpenses ?? totalOperatingExpenses);
  const lenderAdjustments = sum([
    inputs.incentiveAdjustment ?? 0,
    inputs.rentFreeAdjustment ?? 0,
    inputs.arrearsAdjustment ?? 0,
    inputs.overRentAdjustment ?? 0,
    inputs.waleAdjustment ?? 0,
    inputs.leaseRiskHaircut ?? 0,
    inputs.tenantRiskHaircut ?? 0,
    inputs.documentationRiskHaircut ?? 0,
    inputs.lenderAdjustedNoiHaircut ?? 0,
  ].map(n => Math.max(0, n)));
  const lenderAdjustedNoi = actualNoi - lenderAdjustments;
  if (inputs.fullyLeased && inputs.grossPassingRent <= 0) warnings.push('Fully leased assets require rent greater than zero.');
  if (inputs.leaseType === 'unknown') warnings.push('Lease type is unknown; NOI cannot be treated as verified.');
  if (recoveredOutgoings > totalOperatingExpenses && totalOperatingExpenses > 0) warnings.push('Recovered outgoings exceed total outgoings; verify recoverability matrix.');
  if (lenderAdjustedNoi > actualNoi) warnings.push('Lender-adjusted NOI exceeds actual NOI; explanation required.');
  if (inputs.leaseDocsVerified === false) warnings.push('Lease documentation is not verified.');
  const confidenceTag = inputs.leaseType === 'unknown' || inputs.leaseDocsVerified === false
    ? 'Specialist Review Required'
    : deriveCalculatedConfidence(inputs.confidenceTags ?? ['Manual Estimate']);
  const selectedNoi = selectedBasis === 'actual' ? actualNoi : selectedBasis === 'stabilised' ? stabilisedNoi : lenderAdjustedNoi;
  return {
    potentialGrossIncome,
    vacancyLoss,
    effectiveGrossIncome,
    totalOperatingExpenses,
    ownerBorneExpenses,
    recoveredOutgoings,
    actualNoi,
    stabilisedNoi,
    lenderAdjustedNoi,
    selectedNoi,
    selectedBasis,
    confidenceTag,
    warnings,
    bridge: [
      { label: 'Potential Gross Income', amount: potentialGrossIncome },
      { label: 'Vacancy Loss', amount: -vacancyLoss },
      { label: 'Recovered Outgoings', amount: recoveredOutgoings },
      { label: 'Total Operating Expenses', amount: -totalOperatingExpenses },
      { label: 'Actual NOI', amount: actualNoi },
      { label: 'Lender Adjustments', amount: -lenderAdjustments },
      { label: 'Lender-Adjusted NOI', amount: lenderAdjustedNoi },
    ],
  };
}
