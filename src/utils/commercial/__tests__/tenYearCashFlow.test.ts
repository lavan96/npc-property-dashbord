import { describe, expect, it } from 'vitest';
import { calculateTenYearCashFlow, type TenYearCashFlowInputs } from '..';

const baseInputs = (patch: Partial<TenYearCashFlowInputs> = {}): TenYearCashFlowInputs => ({
  mode: 'investor', assetDomain: 'commercial', assetSubtype: 'Office', state: 'NSW', purchasePrice: 1_000_000, propertyValue: 1_000_000, loanAmount: 600_000, availableEquity: 500_000, taxRatePct: 30, depreciationPa: 10_000, capitalWorksDeductionPa: 5_000, plantEquipmentDepreciationPa: 0, lossOffsetAllowed: true, accountantReviewRequired: true,
  passingRent: 100_000, marketRent: 110_000, otherIncome: 5_000, recoveredOutgoings: 20_000, vacancyAllowancePct: 5, rentGrowthPct: 3, marketRentGrowthPct: 3, outgoingsGrowthPct: 3, expenseGrowthPct: 3, capitalGrowthPct: 2, selectedCapRatePct: 6.5, terminalCapRatePct: 7, sellingCostPct: 2,
  downtimeMonths: 1, incentiveMonths: 1, leasingFeePct: 10, relettingCostAllowance: 2_000, leaseRiskHaircutPct: 2, tenantRiskHaircutPct: 1, annualCapexReserve: 8_000, majorCapexYear: 5, majorCapexAmount: 50_000, environmentalReserve: 0, asbestosReserve: 0, specialistReserve: 0,
  councilRates: 5_000, waterRates: 1_000, landTax: 4_000, insurance: 2_000, strataOwnersCorp: 0, managementFees: 3_000, repairsMaintenance: 2_000, utilities: 0, cleaning: 0, security: 0, otherOwnerExpenses: 0,
  gstSettlementCashflow: 0, gstEconomicCost: 0, totalAcquisitionCosts: 70_000, totalCostBase: 1_070_000, requiredEquity: 470_000, postSettlementLiquidity: 30_000,
  interestRatePct: 6, annualDebtService: 45_000, amortisationYears: 25, interestOnlyYears: 0, repaymentType: 'principalAndInterest', ownershipStructure: 'company',
  businessRevenue: 1_000_000, businessEbitda: 200_000, businessAddbacks: 20_000, directorDrawings: 60_000, existingBusinessDebtService: 20_000, equipmentFinanceRepayments: 5_000, vehicleFinanceRepayments: 5_000, workingCapitalRequirement: 10_000, businessCashReserves: 100_000, currentRentPaid: 90_000, currentOutgoingsPaid: 10_000, rentEscalationPct: 3, businessIncomeGrowthPct: 3, businessExpenseGrowthPct: 3,
  relatedPartyRent: 100_000, relatedPartyRentGrowthPct: 3, relatedPartyLeaseVerified: true, marketRentSupportAvailable: true, stagedScheduleEnabled: false, ...patch,
});

describe('Commercial / Industrial 10-Year Cash Flow', () => {
  it('Investor Mode calculates rent growth, vacancy, NOI, capex, debt, tax, LVR, ICR, DSCR, debt yield, terminal value, IRR and equity multiple', () => {
    const r = calculateTenYearCashFlow(baseInputs());
    const y1 = r.years[0];
    expect(y1.passingRent).toBe(100_000);
    expect(r.years[1].passingRent).toBeCloseTo(103_000, 0);
    expect(y1.vacancyLoss).toBeCloseTo(5_250, 0);
    expect(y1.recoveredOutgoings).toBe(20_000);
    expect(y1.totalOwnerBorneExpenses).toBe(17_000);
    expect(y1.actualNoi).toBeCloseTo(102_750, 0);
    expect(y1.lenderAdjustedNoi).toBeCloseTo(99_667.5, 0);
    expect(y1.totalCapex).toBe(8_000);
    expect(y1.annualDebtService).toBe(45_000);
    expect(y1.preTaxCashflow).toBeCloseTo(29_416.67, 0);
    expect(y1.taxableIncome).toBeCloseTo(34_750, 0);
    expect(y1.taxPayableBenefit).toBeCloseTo(10_425, 0);
    expect(y1.afterTaxCashflow).toBeCloseTo(18_991.67, 0);
    expect(y1.closingLoanBalance).toBe(591_000);
    expect(y1.equityPosition).toBeCloseTo(429_000, 0);
    expect(y1.lvr).toBeCloseTo(0.5794, 3);
    expect(y1.icr).toBeCloseTo(2.854, 3);
    expect(y1.dscr).toBeCloseTo(2.283, 3);
    expect(y1.debtYield).toBeCloseTo(0.17125, 4);
    expect(r.years[9].terminalValue).toBeGreaterThan(1_000_000);
    expect(r.summary.equityMultiple).toBeGreaterThan(0);
    expect(r.summary.leveredIrr).not.toBeNull();
  });

  it('Owner-Occupier Mode calculates rent avoided, ownership cost, savings, Business DSCR, occupancy ratio and free cashflow; missing EBITDA is N/A', () => {
    const r = calculateTenYearCashFlow(baseInputs({ mode: 'ownerOccupier' }));
    const y1 = r.years[0];
    expect(y1.rentAvoided).toBe(90_000);
    expect(y1.outgoingsAvoided).toBe(10_000);
    expect(y1.ownershipCashCost).toBe(80_000);
    expect(y1.netSavingCostVsLeasing).toBe(20_000);
    expect(y1.businessDscr).toBeCloseTo(160_000 / 75_000, 3);
    expect(y1.occupancyCostRatio).toBeCloseTo(0.08, 3);
    expect(y1.freeCashflowAfterOccupancy).toBeCloseTo(68_000, 0);
    expect(r.years[9].equityCreated).toBeGreaterThan(0);
    expect(r.summary.cumulativeOwnershipBenefit).toBeGreaterThan(0);
    const missing = calculateTenYearCashFlow(baseInputs({ mode: 'ownerOccupier', businessEbitda: null }));
    expect(missing.years[0].businessDscr).toBeNull();
    expect(missing.warnings.join(' ')).toContain('Business DSCR shown as N/A');
  });

  it('Related-Party Lease Mode calculates property entity, operating business and group views with internal rent neutralised', () => {
    const r = calculateTenYearCashFlow(baseInputs({ mode: 'relatedPartyLease' }));
    const y1 = r.years[0];
    expect(y1.propertyEntityCashflow).toBeCloseTo(50_000, 0);
    expect(y1.operatingBusinessOccupancyCost).toBe(120_000);
    expect(y1.groupCashflow).toBeCloseTo(30_000, 0);
    expect(y1.groupDscr).not.toBeNull();
    expect(r.years[9].cumulativeGroupBenefit).toBeGreaterThan(0);
  });

  it('Validation captures GST/tax, capex, terminal cap rate and manual override tags', () => {
    const r = calculateTenYearCashFlow(baseInputs({ annualCapexReserve: 0, terminalCapRatePct: 0, relatedPartyLeaseVerified: false }), ['rentGrowthPct']);
    expect(r.warnings.join(' ')).toContain('Terminal cap rate must be greater than 0');
    expect(r.warnings.join(' ')).toContain('Capex estimates are zero');
    expect(r.assumptions.rentGrowthPct.status).toBe('Overridden');
    expect(r.assumptions.terminalCapRatePct.status).toBe('AI Estimate');
    expect(r.assumptions.taxRatePct.status).toBe('Specialist Review Required');
  });
});
