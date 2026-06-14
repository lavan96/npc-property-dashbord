import type { BorrowingResult } from './borrowing/calculatorTypes';
import { summarizeClientPortfolio } from './clientPortfolioEngine';
import type { ClientProfile, ClientScenario, ScenarioStatus, ScenarioType } from './clientPortfolioTypes';

export interface ProposedScenarioInputs { scenarioName: string; scenarioType: ScenarioType; status?: ScenarioStatus; purchasePrice: number; proposedDebt: number; requiredEquity: number; annualNoi: number; annualDebtService: number; annualCashflow?: number; selectedProperty?: string; borrowingResult?: BorrowingResult; }

export function buildClientScenario(client: ClientProfile, inputs: ProposedScenarioInputs): ClientScenario {
  const current = summarizeClientPortfolio(client);
  const proposed = { ...current };
  proposed.totalAssetValue += inputs.purchasePrice;
  proposed.commercialAssetValue += inputs.scenarioType.includes('Commercial') ? inputs.purchasePrice : 0;
  proposed.industrialAssetValue += inputs.scenarioType.includes('Industrial') || inputs.scenarioType.includes('Owner-Occupied') ? inputs.purchasePrice : 0;
  proposed.totalDebt += inputs.proposedDebt;
  proposed.commercialDebt += inputs.proposedDebt;
  proposed.annualNoi += inputs.annualNoi;
  proposed.annualDebtService += inputs.annualDebtService;
  proposed.requiredEquity = inputs.requiredEquity;
  proposed.availableLiquidity = Math.max(0, current.availableLiquidity - inputs.requiredEquity);
  proposed.postSettlementLiquidity = current.availableLiquidity - inputs.requiredEquity;
  proposed.netEquity = proposed.totalAssetValue - proposed.totalDebt;
  proposed.weightedLvr = proposed.totalAssetValue > 0 ? proposed.totalDebt / proposed.totalAssetValue : null;
  proposed.portfolioIcr = proposed.annualDebtService > 0 ? proposed.annualNoi / proposed.annualDebtService : null;
  proposed.portfolioDscr = proposed.annualDebtService > 0 ? (proposed.annualNoi + proposed.annualBusinessIncome) / proposed.annualDebtService : null;
  proposed.debtYield = proposed.totalDebt > 0 ? proposed.annualNoi / proposed.totalDebt : null;
  proposed.preTaxCashflow += inputs.annualCashflow ?? (inputs.annualNoi - inputs.annualDebtService);
  proposed.afterTaxCashflow = proposed.preTaxCashflow * 0.7;
  proposed.borrowingCapacity = Math.max(0, (proposed.annualNoi + proposed.annualBusinessIncome) * 6 - proposed.totalDebt);
  proposed.keyConstraint = inputs.borrowingResult?.bindingConstraint ?? 'Portfolio scenario';
  proposed.riskRating = proposed.postSettlementLiquidity < 0 ? 'red' : proposed.weightedLvr != null && proposed.weightedLvr > 0.75 ? 'red' : proposed.portfolioDscr != null && proposed.portfolioDscr < 1.25 ? 'amber' : 'green';
  const warnings = [client.businessFinancials.ebitdaNpbt == null ? 'Business financials missing; business servicing cannot be applied.' : '', proposed.postSettlementLiquidity < 0 ? 'Proposed acquisition creates an equity/liquidity shortfall.' : '', client.lastUpdated ? '' : 'Client profile data may be stale.'].filter(Boolean);
  return { scenarioId: `scenario-${Date.now()}`, clientId: client.clientId, scenarioName: inputs.scenarioName, scenarioType: inputs.scenarioType, status: inputs.status ?? 'Draft', createdAt: new Date().toISOString(), createdBy: 'Calculator user', currentPositionSnapshot: current, proposedChanges: inputs as unknown as Record<string, unknown>, resultingPosition: proposed, calculatorInputs: { selectedProperty: inputs.selectedProperty }, calculatorOutputs: inputs.borrowingResult, warnings, requiredDocuments: ['Updated asset values', 'Loan statements', 'Business financials', 'Bank statements', 'Scenario approval confirmation'], reportSummary: `${inputs.scenarioName}: portfolio debt changes by ${Math.round(inputs.proposedDebt).toLocaleString('en-AU')} and post-settlement liquidity becomes ${Math.round(proposed.postSettlementLiquidity).toLocaleString('en-AU')}.`, auditLog: [{ timestamp: new Date().toISOString(), user: 'Calculator user', action: 'Scenario generated', source: 'Commercial / Industrial calculator', scenarioId: `scenario-${Date.now()}` }] };
}
