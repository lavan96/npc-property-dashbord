import type { AcquisitionCosts, FundsToCompleteResult, GstTreatment } from './calculatorTypes';

const sum = (values: number[]) => values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

export function calculateGstCashflow(purchasePrice: number, treatment: GstTreatment, gstCashflowRequired: string): number {
  if (treatment === 'plusGst' && gstCashflowRequired === 'yes') return Math.max(0, purchasePrice * 0.1);
  return 0;
}

export function calculateFundsToComplete(purchasePrice: number, costs: AcquisitionCosts, finalLoan: number, availableEquity: number, additionalCapexReserve = 0): FundsToCompleteResult {
  const warnings: string[] = [];
  const acquisitionCostItems = [costs.stampDuty, costs.transferRegistrationFee, costs.mortgageRegistrationFee, costs.pexaSettlementFee, costs.legalConveyancingFee, costs.bankLegalFee, costs.valuationFee, costs.loanApplicationFee, costs.buyersAgentFee, costs.buildingInspection, costs.pestInspection, costs.structuralInspection, costs.fireComplianceInspection, costs.planningZoningReview, costs.environmentalReport, costs.asbestosReport, costs.dueDiligence, costs.otherAcquisitionCosts];
  const totalAcquisitionCosts = sum(acquisitionCostItems);
  const gstCashflowRequirement = calculateGstCashflow(purchasePrice, costs.gstTreatment, costs.gstCashflowRequired);
  if (costs.gstTreatment === 'unknown' || costs.gstClaimable === 'unknown' || costs.gstCashflowRequired === 'unknown') warnings.push('GST treatment or settlement cashflow is unknown.');
  const capexReserve = Math.max(0, costs.capexReserve + additionalCapexReserve);
  const totalCostBase = Math.max(0, purchasePrice + totalAcquisitionCosts + gstCashflowRequirement + capexReserve + costs.workingCapitalReserve);
  const requiredEquity = Math.max(0, totalCostBase - Math.max(0, finalLoan));
  const equitySurplusShortfall = availableEquity - requiredEquity;
  if (equitySurplusShortfall < 0) warnings.push('Available equity is below required funds to complete.');
  return { totalAcquisitionCosts, gstCashflowRequirement, totalCostBase, requiredEquity, equitySurplusShortfall, warnings };
}
