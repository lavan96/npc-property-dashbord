import type { BorrowingInputs, ReverseCalculatorResult } from './calculatorTypes';

export function calculateReverseCalculators(inputs: BorrowingInputs, proposedLoan: number, requiredEquity: number, assessmentRatePct: number, minIcr: number, maxLvr: number): ReverseCalculatorResult {
  const requiredNoiForProposedLoan = proposedLoan * (assessmentRatePct / 100) * minIcr;
  const requiredEquityForCurrentPurchasePrice = requiredEquity;
  const maximumPurchasePriceBasedOnAvailableEquity = Math.max(0, inputs.purchaserStructure.availableCashEquity + proposedLoan - requiredEquity + inputs.propertyValuation.purchasePrice);
  const requiredValuationToMeetLvr = maxLvr > 0 ? proposedLoan / maxLvr : 0;
  const currentNoi = inputs.income.grossPassingRent + inputs.income.otherIncome - inputs.income.nonRecoverableExpenses;
  const requiredRateToPassIcrPct = proposedLoan > 0 && minIcr > 0 ? (currentNoi / minIcr / proposedLoan) * 100 : 0;
  const requiredPriceReduction = Math.max(0, requiredEquity - inputs.purchaserStructure.availableCashEquity);
  const requiredRentIncrease = Math.max(0, requiredNoiForProposedLoan - currentNoi);
  const requiredAdditionalSponsorLiquidity = Math.max(0, requiredEquity - inputs.purchaserStructure.availableCashEquity);
  const practicalFixes = ['Add equity or verified sponsor liquidity', 'Reduce purchase price or negotiate vendor terms', 'Improve/verify income and lease documentation', 'Confirm GST/duty cashflow with solicitor/accountant', 'Consider an alternative lender profile if risk appetite supports it'].filter(Boolean);
  return { requiredNoiForProposedLoan, requiredEquityForCurrentPurchasePrice, maximumPurchasePriceBasedOnAvailableEquity, requiredValuationToMeetLvr, requiredRateToPassIcrPct, requiredPriceReduction, requiredRentIncrease, requiredAdditionalSponsorLiquidity, practicalFixes };
}
