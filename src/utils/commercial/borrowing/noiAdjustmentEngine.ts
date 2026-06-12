import type { BorrowingInputs, NoiResult, RiskOverlayResult } from './calculatorTypes';

const pct = (v: number) => Math.max(0, v) / 100;
const sum = (values: number[]) => values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

export function calculateNoi(inputs: BorrowingInputs, overlay?: Pick<RiskOverlayResult, 'noiHaircutPct'>): NoiResult {
  const i = inputs.income;
  const potentialGrossIncome = Math.max(0, i.grossPassingRent + i.otherIncome);
  const vacancyLoss = potentialGrossIncome * pct(i.vacancyAllowancePct);
  const effectiveGrossIncome = potentialGrossIncome - vacancyLoss + Math.max(0, i.recoveredOutgoings);
  const totalOperatingExpenses = sum([i.nonRecoverableExpenses, i.councilRates, i.water, i.landTax, i.insurance, i.strataOwnersCorp, i.managementFees, i.repairsMaintenance, i.utilities, i.cleaning, i.security, i.otherExpenses]);
  const actualNoi = Math.max(0, effectiveGrossIncome - totalOperatingExpenses);
  const normalisedVacancy = Math.max(0, i.marketRent + i.otherIncome) * Math.max(pct(i.vacancyAllowancePct), inputs.dealProfile.assetCategory === 'industrial' ? 0.04 : 0.03);
  const normalisedExpenses = Math.max(totalOperatingExpenses, i.nonRecoverableExpenses);
  const stabilisedNoi = Math.max(0, i.marketRent + i.otherIncome + i.recoveredOutgoings - normalisedVacancy - normalisedExpenses);

  const adjustments: Array<{ label: string; amount: number }> = [];
  if (i.incentivesAdjustment > 0) adjustments.push({ label: 'Incentives / rent-free adjustment', amount: i.incentivesAdjustment });
  if (i.tenantArrearsAdjustment > 0) adjustments.push({ label: 'Tenant arrears adjustment', amount: i.tenantArrearsAdjustment });
  if (i.rentOverMarket === 'yes' && i.percentageAboveMarket && i.percentageAboveMarket > 0) adjustments.push({ label: 'Over-market rent haircut', amount: i.grossPassingRent * pct(i.percentageAboveMarket) });
  if (i.wale > 0 && i.wale < 2) adjustments.push({ label: 'Short WALE haircut', amount: actualNoi * 0.05 });
  if (i.tenantCovenant === 'newBusiness' || i.tenantCovenant === 'weakUnknown') adjustments.push({ label: 'Tenant covenant haircut', amount: actualNoi * 0.075 });
  if (i.tenantCovenant === 'relatedParty' || inputs.purchaserStructure.relatedPartyTenant || inputs.dealProfile.acquisitionPurpose === 'relatedPartyLease') adjustments.push({ label: 'Related-party lease haircut', amount: actualNoi * 0.05 });
  if (overlay?.noiHaircutPct) adjustments.push({ label: 'Asset risk overlay haircut', amount: actualNoi * overlay.noiHaircutPct });

  const lenderAdjustedNoi = Math.max(0, actualNoi - sum(adjustments.map(a => a.amount)));
  const selectedNoi = i.noiBasis === 'actual' ? actualNoi : i.noiBasis === 'stabilised' ? stabilisedNoi : lenderAdjustedNoi;
  return { potentialGrossIncome, vacancyLoss, effectiveGrossIncome, totalOperatingExpenses, actualNoi, stabilisedNoi, lenderAdjustedNoi, selectedNoi, adjustments: adjustments.map(a => `${a.label}: -${Math.round(a.amount).toLocaleString('en-AU')}`) };
}
