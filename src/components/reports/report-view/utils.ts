import type { InvestmentReport, OverriddenField } from './types';
import { getReportVariantLabel as getCanonicalReportVariantLabel } from '@/lib/reports/reportVariants';

export function getReportScore(report: InvestmentReport | null) {
  const score = report?.investment_score;
  if (!score) return null;
  if (typeof score === 'number' || typeof score === 'string') return score;
  return score.overall_score ?? score.score ?? score.totalScore ?? score.rating ?? null;
}

export function getReportTierLabel(report: InvestmentReport | null) {
  return report?.report_tier ? report.report_tier.replace(/_/g, ' ') : 'Standard';
}

export function getReportVariantLabel(report: InvestmentReport | null) {
  return getCanonicalReportVariantLabel(report);
}

export function getReportStatusLabel(report: InvestmentReport | null) {
  return report?.status ? report.status.replace(/_/g, ' ') : 'Draft';
}

export function getHasOverrides(report: InvestmentReport | null) {
  return !!(report?.manual_overrides && Object.keys(report.manual_overrides).length > 0);
}

export function getInvestmentScoreSummary(report: InvestmentReport | null) {
  const investmentScore = report?.investment_score;
  const score = getReportScore(report);
  const numericScore = typeof score === 'number' ? score : typeof score === 'string' && /^\d+(\.\d+)?$/.test(score) ? Number(score) : null;
  const insufficient = !investmentScore || investmentScore.coverage?.dataInsufficient || numericScore == null;

  return {
    grade: investmentScore?.grade || null,
    recommendation: investmentScore?.recommendation || null,
    score: numericScore,
    insufficient,
    partialLabel: investmentScore?.coverage?.partialLabel || (insufficient ? 'Qualitative review only' : null),
  };
}

export function getInvestmentGradeTone(grade?: string | null) {
  const normalizedGrade = grade?.toUpperCase();
  if (normalizedGrade === 'A+' || normalizedGrade === 'A') return 'bg-emerald-500 text-foreground dark:text-white';
  if (normalizedGrade === 'B+' || normalizedGrade === 'B') return 'bg-yellow-500 text-black';
  if (normalizedGrade === 'C+' || normalizedGrade === 'C') return 'bg-orange-500 text-foreground dark:text-white';
  if (normalizedGrade) return 'bg-red-500 text-foreground dark:text-white';
  return 'bg-muted text-muted-foreground';
}

export function getScoreTone(score: number | null) {
  if (score == null) return 'text-muted-foreground';
  if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 55) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

export function getOverriddenFields(report: InvestmentReport | null): OverriddenField[] {
  if (!getHasOverrides(report) || !report) return [];
  const fieldMappings: Record<string, string> = {
    purchasePrice: 'Purchase Price',
    landPrice: 'Land Price',
    buildPrice: 'Build Price',
    depositValue: 'Deposit Value',
    loanToValueRatio: 'Loan to Value Ratio',
    interestRate: 'Interest Rate',
    capitalGrowth: 'Capital Growth',
    weeklyRent: 'Weekly Rent',
    stampDuty: 'Stamp Duty',
    bodyCorporateFees: 'Body Corporate/Strata Fees',
    councilRates: 'Council Rates',
    waterRates: 'Water Rates',
    solicitorFees: 'Solicitor Fees',
    buildingLandlordInsurance: 'Building & Landlord Insurance',
    propertyManagementFees: 'Property Management',
    repairsMaintenance: 'Repairs & Maintenance',
    lettingFees: 'Letting Fees',
  };
  return Object.keys(report.manual_overrides).map((key) => ({
    key,
    displayName: fieldMappings[key] || key.replace(/([A-Z])/g, ' $1').trim(),
    value: report.manual_overrides[key],
  }));
}
