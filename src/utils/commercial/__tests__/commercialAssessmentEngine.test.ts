import { describe, expect, it } from 'vitest';
import { acceptAiEstimate, calculateCapRateEngine, calculateCommercialGstEngine, calculateIcrDscrEngine, calculateNoiEngine, createAiEstimate, markEstimateVerified, rejectAiEstimate, replaceWithManualValue, runDcfAssessment } from '..';
import { calculateCommercialIndustrialBorrowing } from '../borrowing/commercialBorrowingEngine';
import type { BorrowingInputs } from '../borrowing/calculatorTypes';

const borrowingBase = (patch: Partial<BorrowingInputs> = {}): BorrowingInputs => ({
  dealProfile: { assetCategory: 'commercial', assetSubtype: 'Office', acquisitionPurpose: 'investment', leaseStatus: 'fullyLeased', state: 'NSW', proposedLoan: undefined },
  purchaserStructure: { purchaserType: 'company', guaranteesAvailable: 'yes', gstRegistered: 'unknown', availableCashEquity: 1_000_000, sponsorLiquidity: 0, liquidityMultiplier: 0, existingBusinessEbitda: 0 },
  propertyValuation: { purchasePrice: 3_000_000, estimatedMarketValue: 3_000_000, useConservativeValuation: true, valuationConfidence: 'medium' },
  income: { grossPassingRent: 240_000, otherIncome: 10_000, recoveredOutgoings: 30_000, marketRent: 260_000, vacancyAllowancePct: 5, incentivesAdjustment: 0, tenantArrearsAdjustment: 0, nonRecoverableExpenses: 20_000, councilRates: 10_000, water: 2_000, landTax: 8_000, insurance: 5_000, strataOwnersCorp: 0, managementFees: 6_000, repairsMaintenance: 4_000, utilities: 0, cleaning: 0, security: 0, otherExpenses: 0, wale: 3, tenantCovenant: 'establishedSme', rentOverMarket: 'no', noiBasis: 'lenderAdjusted' },
  acquisitionCosts: { depositPaid: 0, stampDuty: 150_000, transferRegistrationFee: 180, mortgageRegistrationFee: 180, pexaSettlementFee: 150, legalConveyancingFee: 10_000, bankLegalFee: 5_000, valuationFee: 4_000, loanApplicationFee: 0, buyersAgentFee: 0, buildingInspection: 0, pestInspection: 0, structuralInspection: 0, fireComplianceInspection: 0, planningZoningReview: 0, environmentalReport: 0, asbestosReport: 0, dueDiligence: 5_000, capexReserve: 20_000, workingCapitalReserve: 10_000, otherAcquisitionCosts: 0, gstTreatment: 'gstInclusive', gstAmount: 0, gstClaimable: 'yes', gstCashflowRequired: 'no', goingConcernConfirmed: 'yes' },
  lendingAssumptions: { profile: 'mainstreamCommercialBank', contractInterestRatePct: 7, assessmentBufferPct: 1, assessmentFloorRatePct: 0, loanTermYears: 25, interestOnlyPeriodYears: 0, amortisationYears: 25, maxLvr: 0.65, minIcr: 1.5, minDscr: 1.25, minDebtYield: 0.09, debtYieldEnabled: true },
  riskInputs: { tenantStrength: 'established', vacancyLevel: 'minor', buildingCondition: 'good', zoningPlanningRisk: 'low', leaseDocumentationQuality: 'complete', environmentalRisk: 'low', asbestosRisk: 'low', capexRequired: 'minor' },
  ...patch,
} as BorrowingInputs);

describe('Commercial / Industrial Assessment Engine', () => {
  it('NOI supports recovered outgoings, vacancy, lender adjustment, over-rent and unknown lease docs', () => {
    const r = calculateNoiEngine({ leaseType: 'unknown', grossPassingRent: 100_000, otherIncome: 5_000, marketRent: 90_000, vacancyAllowancePct: 5, recoveredOutgoings: 20_000, outgoings: [{ name: 'rates', amount: 20_000, recoverablePct: 100 }], incentiveAdjustment: 2_000, overRentAdjustment: 4_000, leaseDocsVerified: false }, 'lenderAdjusted');
    expect(r.potentialGrossIncome).toBe(105_000);
    expect(r.vacancyLoss).toBe(5_250);
    expect(r.actualNoi).toBe(99_750);
    expect(r.lenderAdjustedNoi).toBe(93_750);
    expect(r.confidenceTag).toBe('Specialist Review Required');
  });

  it('Cap rate calculates passing, reversionary, blended, implied value and sensitivity', () => {
    const r = calculateCapRateEngine({ passingNoi: 70_000, marketNoi: 80_000, selectedNoi: 75_000, price: 1_000_000, targetCapRatePct: 7.5, sensitivityCapRatesPct: [7, 8] });
    expect(r.passingYield).toBe(7);
    expect(r.reversionaryYield).toBe(8);
    expect(r.blendedYield).toBe(7.5);
    expect(r.impliedValue).toBeCloseTo(1_000_000, 0);
    expect(r.valuationGap).toBeCloseTo(0, 0);
    expect(r.valueSensitivity).toHaveLength(2);
  });

  it('ICR/DSCR calculates interest, P&I service, debt yield and max loans', () => {
    const r = calculateIcrDscrEngine({ noi: 150_000, loanAmount: 1_000_000, contractInterestRatePct: 7, assessmentBufferPct: 1, repaymentType: 'principalAndInterest', amortisationYears: 25, minimumIcr: 1.5, minimumDscr: 1.25, minimumDebtYield: 0.09 });
    expect(r.annualInterest).toBe(80_000);
    expect(r.annualDebtService).toBeGreaterThan(90_000);
    expect(r.icr).toBe(1.88);
    expect(r.dscr).toBeGreaterThan(1);
    expect(r.debtYield).toBe(0.15);
    expect(r.maxLoanByIcr).toBeCloseTo(1_250_000, 0);
    expect(r.maxLoanByDscr).toBeGreaterThan(0);
    expect(r.maxLoanByDebtYield).toBeCloseTo(1_666_666, 0);
  });

  it('GST handles inclusive, plus GST, verified/unverified going concern, unknown and claimable cashflow', () => {
    expect(calculateCommercialGstEngine({ purchasePrice: 1_100_000, treatment: 'gstInclusive', purchaserGstRegistered: 'yes' }).gstClaimableAmount).toBeCloseTo(100_000, 0);
    expect(calculateCommercialGstEngine({ purchasePrice: 1_000_000, treatment: 'plusGst', purchaserGstRegistered: 'yes' }).gstSettlementCashflowRequirement).toBe(100_000);
    expect(calculateCommercialGstEngine({ purchasePrice: 1_000_000, treatment: 'goingConcern', vendorGstRegistered: 'yes', purchaserGstRegistered: 'yes', goingConcernAgreedInWriting: 'yes', enterpriseCarriedOnUntilSettlement: 'yes', supplierProvidesAllThingsNecessary: 'yes', propertyLeasedOrOperatingEnterprise: 'yes' }).gstVerificationStatus).toBe('Verified');
    expect(calculateCommercialGstEngine({ purchasePrice: 1_000_000, treatment: 'goingConcern' }).gstVerificationStatus).toBe('Specialist Review Required');
    expect(calculateCommercialGstEngine({ purchasePrice: 1_000_000, treatment: 'unknown' }).warnings.join(' ')).toContain('Unknown GST');
  });

  it('DCF includes growth, vacancy, capex, debt service, terminal value, sale proceeds, IRR, NPV and equity multiple', () => {
    const r = runDcfAssessment({ purchasePrice: 5_000_000, acquisitionCosts: 250_000, initialNoi: 400_000, holdPeriodYears: 10, rentalGrowthPct: 3, vacancyAllowancePct: 5, annualCapex: 10_000, terminalCapRatePct: 6.5, sellingCostsPct: 1.5, discountRatePct: 8, loanAmount: 3_000_000, interestRatePct: 6, loanTermYears: 25 });
    expect(r.rows[1].grossNoi).toBeGreaterThan(r.rows[0].grossNoi);
    expect(r.rows[0].capex).toBe(10_000);
    expect(r.rows[0].debtService).toBeGreaterThan(0);
    expect(r.terminalValue).toBeGreaterThan(0);
    expect(r.netSaleProceeds).toBeGreaterThan(0);
    expect(r.unleveredIrr).not.toBeNull();
    expect(r.leveredIrr).not.toBeNull();
    expect(r.unleveredNpv).not.toBe(0);
    expect(r.equityMultiple).toBeGreaterThan(1);
  });

  it('Borrowing fixes blank proposed loan, invalid EBITDA, liquidity N/A and price solver', () => {
    const r = calculateCommercialIndustrialBorrowing(borrowingBase({ purchaserStructure: { ...borrowingBase().purchaserStructure, availableCashEquity: 100_000, existingBusinessEbitda: 0 } }));
    expect(r.proposedLoanSupportabilityMessage).toContain('No proposed loan entered');
    expect(r.groupDebt.debtToEbitda).toBeNull();
    expect(r.fundsToComplete.monthsDebtServiceCovered).toBeNull();
    expect(r.reverseCalculators.requiredPurchasePriceToFitAvailableEquity).toBeGreaterThanOrEqual(0);
    expect(r.fundsToComplete.acquisitionCostLineItems?.transferRegistrationFee).toBe(180);
  });

  it('Borrowing scenarios explain changed or unchanged values', () => {
    const r = calculateCommercialIndustrialBorrowing(borrowingBase({ dealProfile: { ...borrowingBase().dealProfile, proposedLoan: 1_000_000 } }));
    expect(r.scenarios.length).toBeGreaterThan(0);
    expect(r.scenarios[0].explanation).toBeTruthy();
  });

  it('AI estimates can be accepted, rejected, overridden, verified and audited safely', () => {
    const estimate = createAiEstimate({ fieldKey: 'leaseIncome.vacancyAllowancePct', estimatedValue: 5, confidence: 'medium', impactAreas: ['lending'], requiredDocuments: ['Lease schedule'] });
    expect(estimate.canProduceGreenStatus).toBe(false);
    expect(acceptAiEstimate(estimate).confidenceTag).toBe('AI Estimate');
    expect(rejectAiEstimate(estimate).canUseInFinalReport).toBe(false);
    expect(replaceWithManualValue(estimate, 6).confidenceTag).toBe('Manual Estimate');
    expect(markEstimateVerified(estimate).canProduceGreenStatus).toBe(true);
  });
});
