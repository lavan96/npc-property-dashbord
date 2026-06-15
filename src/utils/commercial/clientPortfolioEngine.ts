import type { BusinessFinancials, CashAndOffsets, ClientLiabilities, ClientProfile, PortfolioPositionSummary, SharePortfolio } from './clientPortfolioTypes';
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + (f(x) || 0), 0);

export interface PortfolioImportToggles {
  residential?: boolean;
  commercial?: boolean;
  industrial?: boolean;
  shares?: boolean;
  cash?: boolean;
  businessFinancials?: boolean;
  liabilities?: boolean;
  income?: boolean;
  existingLoans?: boolean;
}

const zeroLiabilities = (): ClientLiabilities => ({ residentialLoans: 0, commercialLoans: 0, businessLoans: 0, equipmentFinance: 0, vehicleFinance: 0, creditCards: 0, overdrafts: 0, atoPaymentPlans: 0, personalLoans: 0, directorGuarantees: 0, relatedPartyLoans: 0, annualDebtService: 0 });
const zeroShares = (): SharePortfolio => ({ portfolioValue: 0, listedShares: 0, etfs: 0, managedFunds: 0, dividendIncome: 0, marginLoan: 0, liquidityHaircutPct: 0, availableLiquidValue: 0 });
const zeroCash = (): CashAndOffsets => ({ cashBalance: 0, offsetBalance: 0, businessCash: 0, availableEquityContribution: 0, postSettlementLiquidity: 0 });
const zeroBusinessFinancials = (): BusinessFinancials => ({ businessRevenue: 0, ebitdaNpbt: null, addbacks: 0, directorDrawings: 0, existingRent: 0, existingDebtService: 0, equipmentFinance: 0, workingCapitalRequirement: 0, basAvailable: false, financialsAvailable: false, taxReturnsAvailable: false });

export function applyPortfolioImportToggles(client: ClientProfile, toggles: PortfolioImportToggles = {}): ClientProfile {
  const include = (key: keyof PortfolioImportToggles) => toggles[key] !== false;
  const businessFinancials = include('businessFinancials') ? client.businessFinancials : zeroBusinessFinancials();
  const sharePortfolio = include('shares') ? client.sharePortfolio : zeroShares();
  const cashAndOffsets = include('cash') ? client.cashAndOffsets : zeroCash();
  const liabilities = include('liabilities') ? client.liabilities : zeroLiabilities();
  const existingLoans = include('existingLoans') ? client.existingLoans : zeroLiabilities();
  const stripIncome = <T extends { annualRent?: number; expenses?: number; noi?: number }>(asset: T): T => include('income') ? asset : { ...asset, annualRent: 0, expenses: 0, noi: 0 };
  return {
    ...client,
    personalIncome: include('income') ? client.personalIncome : 0,
    businessIncome: include('income') ? client.businessIncome : 0,
    residentialAssets: include('residential') ? client.residentialAssets.map(stripIncome) as any : [],
    commercialAssets: include('commercial') ? client.commercialAssets.map(stripIncome) as any : [],
    industrialAssets: include('industrial') ? client.industrialAssets.map(stripIncome) as any : [],
    sharePortfolio: include('income') ? sharePortfolio : { ...sharePortfolio, dividendIncome: 0 },
    cashAndOffsets,
    liabilities,
    existingLoans,
    businessFinancials: include('income') ? businessFinancials : { ...businessFinancials, ebitdaNpbt: null, existingRent: 0, existingDebtService: 0 },
  };
}
export function summarizeClientPortfolio(client: ClientProfile): PortfolioPositionSummary {
  const residentialAssetValue = sum(client.residentialAssets, a => a.currentValue);
  const commercialAssetValue = sum(client.commercialAssets, a => a.currentValue);
  const industrialAssetValue = sum(client.industrialAssets, a => a.currentValue);
  const assets = [...client.residentialAssets, ...client.commercialAssets, ...client.industrialAssets];
  const totalPropertyDebt = sum(assets, a => a.loanBalance);
  const residentialDebt = sum(client.residentialAssets, a => a.loanBalance);
  const commercialDebt = sum(client.commercialAssets, a => a.loanBalance) + client.liabilities.commercialLoans;
  const businessDebt = client.liabilities.businessLoans + client.liabilities.atoPaymentPlans + client.liabilities.directorGuarantees + client.liabilities.relatedPartyLoans;
  const equipmentVehicleFinance = client.liabilities.equipmentFinance + client.liabilities.vehicleFinance;
  const otherDebt = client.liabilities.creditCards + client.liabilities.overdrafts + client.liabilities.personalLoans + client.sharePortfolio.marginLoan;
  const totalDebt = totalPropertyDebt + businessDebt + equipmentVehicleFinance + otherDebt;
  const annualRentalIncome = sum(assets, a => a.annualRent ?? 0);
  const annualNoi = sum(assets, a => a.noi ?? ((a.annualRent ?? 0) - (a.expenses ?? 0)));
  const annualBusinessIncome = client.businessFinancials.ebitdaNpbt ?? client.businessIncome;
  const annualDebtService = client.liabilities.annualDebtService + client.businessFinancials.existingDebtService;
  const totalAssetValue = residentialAssetValue + commercialAssetValue + industrialAssetValue + client.sharePortfolio.portfolioValue + client.cashAndOffsets.cashBalance + client.cashAndOffsets.offsetBalance + client.otherInvestments;
  const availableLiquidity = client.cashAndOffsets.availableEquityContribution + client.sharePortfolio.availableLiquidValue;
  const preTaxCashflow = annualNoi + annualBusinessIncome + client.sharePortfolio.dividendIncome - annualDebtService;
  const summary: PortfolioPositionSummary = { totalAssetValue, residentialAssetValue, commercialAssetValue, industrialAssetValue, shareLiquidInvestmentValue: client.sharePortfolio.availableLiquidValue, cashOffsets: client.cashAndOffsets.cashBalance + client.cashAndOffsets.offsetBalance, totalDebt, residentialDebt, commercialDebt, businessDebt, equipmentVehicleFinance, netEquity: totalAssetValue - totalDebt, weightedLvr: totalAssetValue > 0 ? totalDebt / totalAssetValue : null, annualGrossIncome: client.personalIncome + annualRentalIncome + annualBusinessIncome + client.sharePortfolio.dividendIncome, annualRentalIncome, annualNoi, annualBusinessIncome, annualDebtService, portfolioIcr: annualDebtService > 0 ? annualNoi / annualDebtService : null, portfolioDscr: annualDebtService > 0 ? (annualNoi + annualBusinessIncome) / annualDebtService : null, debtYield: totalDebt > 0 ? annualNoi / totalDebt : null, availableLiquidity, requiredEquity: 0, postSettlementLiquidity: availableLiquidity, preTaxCashflow, afterTaxCashflow: preTaxCashflow * 0.7, riskRating: 'green', borrowingCapacity: Math.max(0, (annualNoi + annualBusinessIncome) * 6 - totalDebt), keyConstraint: 'Current portfolio' };
  summary.riskRating = summary.weightedLvr != null && summary.weightedLvr > 0.75 ? 'red' : summary.portfolioDscr != null && summary.portfolioDscr < 1.25 ? 'amber' : 'green';
  return summary;
}

export const sampleClientProfiles: ClientProfile[] = [{ clientId: 'client-001', clientName: 'Harper Family Group', lastUpdated: new Date().toISOString(), personalIncome: 240_000, businessIncome: 0, ownershipStructures: ['Company', 'Discretionary Trust'], residentialAssets: [{ id: 'r1', address: '12 Bay St, Brighton', assetType: 'residential', propertyType: 'House', subtype: 'House', currentValue: 1_600_000, loanBalance: 820_000, annualRent: 62_400, expenses: 18_000 }], commercialAssets: [{ id: 'c1', address: '44 Queen St, Melbourne', assetType: 'commercial', assetSubtype: 'Office', subtype: 'Office', currentValue: 2_200_000, loanBalance: 1_250_000, annualRent: 165_000, expenses: 35_000, noi: 130_000, tenant: 'Professional services tenant', wale: 3.2, leaseStatus: 'Leased', capRate: 0.06, icr: 1.7, dscr: 1.35, debtYield: 0.104 }], industrialAssets: [{ id: 'i1', address: '8 Logistics Dr, Truganina', assetType: 'industrial', industrialSubtype: 'Warehouse', subtype: 'Warehouse', currentValue: 3_100_000, loanBalance: 1_850_000, annualRent: 235_000, expenses: 42_000, noi: 193_000, gla: 1800, siteArea: 3200, siteCover: 0.56, hardstand: 900, tenant: '3PL operator', wale: 4.1, leaseStatus: 'Leased', capRate: 0.062, environmentalStatus: 'Unknown', asbestosStatus: 'Unknown' }], sharePortfolio: { portfolioValue: 420_000, listedShares: 220_000, etfs: 150_000, managedFunds: 50_000, dividendIncome: 14_000, marginLoan: 0, liquidityHaircutPct: 20, availableLiquidValue: 336_000 }, cashAndOffsets: { cashBalance: 260_000, offsetBalance: 180_000, businessCash: 150_000, availableEquityContribution: 360_000, postSettlementLiquidity: 80_000 }, otherInvestments: 50_000, liabilities: { residentialLoans: 820_000, commercialLoans: 0, businessLoans: 180_000, equipmentFinance: 65_000, vehicleFinance: 35_000, creditCards: 25_000, overdrafts: 40_000, atoPaymentPlans: 0, personalLoans: 0, directorGuarantees: 0, relatedPartyLoans: 0, annualDebtService: 310_000 }, existingLoans: { residentialLoans: 820_000, commercialLoans: 3_100_000, businessLoans: 180_000, equipmentFinance: 65_000, vehicleFinance: 35_000, creditCards: 25_000, overdrafts: 40_000, atoPaymentPlans: 0, personalLoans: 0, directorGuarantees: 0, relatedPartyLoans: 0, annualDebtService: 310_000 }, businessFinancials: { businessRevenue: 2_800_000, ebitdaNpbt: 520_000, addbacks: 45_000, directorDrawings: 180_000, existingRent: 190_000, existingDebtService: 85_000, equipmentFinance: 65_000, workingCapitalRequirement: 120_000, basAvailable: true, financialsAvailable: true, taxReturnsAvailable: false }, guarantors: ['Spouse guarantee available'], taxProfile: { accountantReviewRequired: true }, gstProfile: { registered: true }, latestBorrowingCapacity: 2_400_000, scenarios: [] }];
