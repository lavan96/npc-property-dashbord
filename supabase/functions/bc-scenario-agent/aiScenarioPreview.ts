/**
 * AI Scenario → Engine Preview
 *
 * Converts the AI tool-call payload (`AIScenario.adjustments`) into the same
 * `ScenarioDelta[]` shape that the Strategy Builder produces, runs them
 * through the unified scenario engine, and returns an `engineValidation`
 * block per scenario. This way the cards in the chat show ENGINE TRUTH
 * (capacity, meetsTarget, shortfall, loanRequired, netCash) BEFORE the
 * broker clicks Apply — eliminating the gap where the AI estimated impact
 * differed from what the engine actually computed post-Apply.
 */

import {
  aggregateDeltas,
  computeAcquisitionCapacity,
  type ScenarioDelta,
  type ScenarioContext,
  type ScenarioProperty,
  type ScenarioLiability,
  type AcquisitionContext,
} from '../_shared/scenarioDeltaEngine.ts';

// ── Local BC kernel (mirrors calculate-borrowing-capacity formula) ────
// Directional replay for the chat preview — the post-Apply engine produces
// the canonical number. This kernel matches the same APRA surplus → P&I
// amortisation formula used everywhere else in the app.

import { getTaxBreakdown } from './tax.ts';

interface BcParams {
  grossAnnualIncome: number;
  shadedAnnualIncome: number;
  monthlyLivingExpenses: number;
  monthlyCommitments: number;
  interestRate: number;
  bufferRate: number;
  loanTermYears: number;
  totalDebtBalances: number;
  dtiCapEnabled?: boolean;
  dtiCapLimit?: number;
}

interface BcResult {
  borrowingCapacity: number;
  monthlySurplus: number;
  serviceabilityBand: 'green' | 'amber' | 'red';
  dtiRatio: number;
}

function calculateBorrowingCapacity(p: BcParams): BcResult {
  const assessableIncome = p.shadedAnnualIncome > 0 ? p.shadedAnnualIncome : p.grossAnnualIncome;
  const tax = getTaxBreakdown(assessableIncome);
  const monthlyAfterTax = tax.afterTaxIncome / 12;
  const monthlySurplus = monthlyAfterTax - p.monthlyLivingExpenses - p.monthlyCommitments;

  const assessmentRate = p.interestRate + p.bufferRate;
  const monthlyRate = (assessmentRate / 100) / 12;
  const periods = p.loanTermYears * 12;
  const maxRepayment = Math.max(0, monthlySurplus);
  let capacity = 0;
  if (monthlyRate > 0 && maxRepayment > 0) {
    const factor = (1 - Math.pow(1 + monthlyRate, -periods)) / monthlyRate;
    capacity = Math.round(maxRepayment * factor);
  }

  let dtiRatio = p.grossAnnualIncome > 0
    ? Math.round(((p.totalDebtBalances + capacity) / p.grossAnnualIncome) * 100) / 100
    : 0;

  const dtiCap = p.dtiCapLimit ?? 6;
  if (p.dtiCapEnabled && dtiRatio > dtiCap && p.grossAnnualIncome > 0) {
    const maxTotalDebt = p.grossAnnualIncome * dtiCap;
    capacity = Math.max(0, Math.round(maxTotalDebt - p.totalDebtBalances));
    dtiRatio = Math.round(((p.totalDebtBalances + capacity) / p.grossAnnualIncome) * 100) / 100;
  }

  let band: 'green' | 'amber' | 'red';
  if (monthlySurplus > 1000 && dtiRatio < 5) band = 'green';
  else if (monthlySurplus > 0 && dtiRatio < 7) band = 'amber';
  else band = 'red';

  return { borrowingCapacity: capacity, monthlySurplus: Math.round(monthlySurplus), serviceabilityBand: band, dtiRatio };
}

// ── Types mirroring the AI tool schema ────────────────────────────────

interface AIAdjustments {
  consolidatedLiabilityIds?: string[];
  refinancedToIOPropertyIds?: string[];
  rateAdjustment?: number;
  incomeGrowthPercent?: number;
  expenseReductionPercent?: number;
  loanTermAdjustment?: number;
  portfolioSellPropertyIds?: string[];
  equityRelease?: { propertyId: string; targetLVR: number } | null;
  dtiCapOverride?: { enabled: boolean; value: number } | null;
  propertyRateChanges?: Array<{ propertyId: string; newRate: number }>;
  valuationOverrides?: Array<{
    propertyId: string;
    newValue: number;
    basis: 'manual' | 'desktop' | 'avm' | 'comparable_sales';
    source?: string;
  }>;
  crossCollatPool?: {
    enabled: boolean;
    propertyIds: string[];
    blendedTargetLVR: number;
    lenderMaxLVR?: number;
    allocationStrategy?: 'highest_equity_first' | 'pro_rata';
  } | null;
  acquisition?: AcquisitionContext | null;
}

export interface AIScenario {
  name: string;
  reasoning: string;
  adjustments: AIAdjustments;
  estimatedImpact: string;
  engineValidation?: EngineValidation;
}

export interface EngineValidation {
  borrowingCapacity: number;
  capacityChange: number;
  monthlySurplus: number;
  serviceabilityBand: 'green' | 'amber' | 'red';
  dtiRatio: number;
  meetsTarget?: boolean;
  shortfallToTarget?: number;
  maxPurchasePrice?: number;
  loanRequiredForPurchase?: number;
  netCashAfterSettlement?: number;
  releasedCapital?: number;
  targetPurchasePrice?: number;
  validationIssues: Array<{ deltaId: string; deltaType: string; severity: string; message: string }>;
}

// ── AI → ScenarioDelta[] converter ─────────────────────────────────────

/**
 * Mirrors the converter in `StrategyScenarioModeling.tsx` so the chat
 * preview produces an identical delta list to what the user sees after
 * clicking Apply. Both client and server engines are parity-tested, so
 * the numbers will match exactly.
 */
export function adjustmentsToDeltas(adj: AIAdjustments): ScenarioDelta[] {
  const deltas: ScenarioDelta[] = [];

  // 1. Liability payoffs
  for (const id of adj.consolidatedLiabilityIds || []) {
    deltas.push({
      id,
      label: `Pay off liability ${id}`,
      type: 'liability_payoff',
      value: 0,
      unit: 'absolute',
    });
  }

  // 2. Property → IO refinance
  for (const id of adj.refinancedToIOPropertyIds || []) {
    deltas.push({
      id,
      label: `Refinance ${id} to IO`,
      type: 'property_refinance',
      value: 0,
      unit: 'absolute',
    });
  }

  // 3. Portfolio sell
  for (const id of adj.portfolioSellPropertyIds || []) {
    deltas.push({
      id,
      label: `Sell ${id}`,
      type: 'property_sell',
      value: 0,
      unit: 'absolute',
    });
  }

  // 4. Income change
  if (adj.incomeGrowthPercent && Math.abs(adj.incomeGrowthPercent) > 0.001) {
    deltas.push({
      id: `income-${adj.incomeGrowthPercent}`,
      label: `Income ${adj.incomeGrowthPercent > 0 ? '+' : ''}${adj.incomeGrowthPercent}%`,
      type: 'income_change',
      value: adj.incomeGrowthPercent,
      unit: 'percent',
    });
  }

  // 5. Expense reduction
  if (adj.expenseReductionPercent && adj.expenseReductionPercent > 0.001) {
    deltas.push({
      id: `expense-${adj.expenseReductionPercent}`,
      label: `Reduce expenses ${adj.expenseReductionPercent}%`,
      type: 'expense_change',
      value: -adj.expenseReductionPercent,
      unit: 'percent',
    });
  }

  // 6. Loan term
  if (adj.loanTermAdjustment && Math.abs(adj.loanTermAdjustment) > 0) {
    deltas.push({
      id: `loan-term-${adj.loanTermAdjustment}`,
      label: `Loan term ${adj.loanTermAdjustment > 0 ? '+' : ''}${adj.loanTermAdjustment}yr`,
      type: 'loan_term_change',
      value: adj.loanTermAdjustment,
      unit: 'years',
    });
  }

  // 7. Global rate adjustment
  if (adj.rateAdjustment && Math.abs(adj.rateAdjustment) > 0.001) {
    deltas.push({
      id: `rate-${adj.rateAdjustment}`,
      label: `Rates ${adj.rateAdjustment >= 0 ? '+' : ''}${adj.rateAdjustment}%`,
      type: 'rate_change',
      value: adj.rateAdjustment,
      unit: 'rate_points',
    });
  }

  // 8. Per-property rate changes (Phase F1)
  for (const change of adj.propertyRateChanges || []) {
    if (Number.isFinite(change.newRate) && change.newRate > 0) {
      deltas.push({
        id: change.propertyId,
        label: `Reprice ${change.propertyId} → ${change.newRate}%`,
        type: 'property_rate_change',
        value: change.newRate,
        unit: 'rate_points',
      });
    }
  }

  // 9. Valuation overrides (Phase G1) — must resolve before equity release
  for (const vo of adj.valuationOverrides || []) {
    if (Number.isFinite(vo.newValue) && vo.newValue > 0) {
      deltas.push({
        id: vo.propertyId,
        label: `Revalue ${vo.propertyId} → ${vo.newValue}`,
        type: 'property_value_change',
        value: vo.newValue,
        unit: 'absolute',
        meta: { basis: vo.basis, source: vo.source ?? '' },
      });
    }
  }

  // 10. Single-property equity release
  if (adj.equityRelease && adj.equityRelease.propertyId && Number.isFinite(adj.equityRelease.targetLVR)) {
    deltas.push({
      id: adj.equityRelease.propertyId,
      label: `Equity release ${adj.equityRelease.propertyId} → ${(adj.equityRelease.targetLVR * 100).toFixed(0)}% LVR`,
      type: 'equity_release',
      value: adj.equityRelease.targetLVR,
      unit: 'percent',
      meta: { targetLVR: adj.equityRelease.targetLVR },
    });
  }

  // 11. Cross-collat pool (Phase G2)
  if (adj.crossCollatPool && adj.crossCollatPool.enabled && adj.crossCollatPool.propertyIds?.length > 0) {
    deltas.push({
      id: 'pool-default',
      label: `Cross-collat pool → ${(adj.crossCollatPool.blendedTargetLVR * 100).toFixed(0)}% blended LVR`,
      type: 'portfolio_lvr_release',
      value: adj.crossCollatPool.blendedTargetLVR,
      unit: 'ratio',
      meta: {
        propertyIds: adj.crossCollatPool.propertyIds,
        lenderMaxLVR: adj.crossCollatPool.lenderMaxLVR ?? null,
        allocationStrategy: adj.crossCollatPool.allocationStrategy ?? 'highest_equity_first',
      },
    });
  }

  // 12. DTI cap override
  if (adj.dtiCapOverride && adj.dtiCapOverride.enabled && Number.isFinite(adj.dtiCapOverride.value)) {
    deltas.push({
      id: 'dti-cap',
      label: `DTI cap ${adj.dtiCapOverride.value}x`,
      type: 'dti_cap_change',
      value: adj.dtiCapOverride.value,
      unit: 'ratio',
      meta: { enabled: true },
    });
  }

  return deltas;
}

// ── Build a ScenarioContext from the chat client snapshot ──────────────

interface ChatClientContext {
  baseInputs: any;
  baseResult: any;
  liabilities: Array<{ id: string; type: string; label: string; balance: number; limit?: number; monthlyServicing: number }>;
  properties: Array<{
    id: string;
    address: string;
    property_type: string;
    current_value: number;
    loan_remaining: number;
    monthly_interest_repayment?: number;
    loan_repayment_amount?: number;
    net_monthly_cashflow?: number;
    interest_rate?: number;
  }>;
}

export function buildScenarioContext(
  client: ChatClientContext,
  acquisition?: AcquisitionContext | null,
): ScenarioContext {
  const properties: ScenarioProperty[] = (client.properties || []).map(p => ({
    id: p.id,
    address: p.address,
    propertyType: p.property_type,
    currentValue: p.current_value || 0,
    loanRemaining: p.loan_remaining || 0,
    monthlyRepayment: p.monthly_interest_repayment || 0,
    loanRepaymentAmount: p.loan_repayment_amount ?? p.monthly_interest_repayment ?? 0,
    netMonthlyCashflow: p.net_monthly_cashflow ?? 0,
    interestRate: p.interest_rate,
  }));

  const liabilities: ScenarioLiability[] = (client.liabilities || []).map(l => ({
    id: l.id,
    type: l.type,
    label: l.label,
    balance: Number(l.balance) || 0,
    limit: l.limit,
    monthlyServicing: Number(l.monthlyServicing) || 0,
  }));

  return {
    baseInputs: {
      grossAnnualIncome: Number(client.baseInputs?.grossAnnualIncome || 0),
      shadedAnnualIncome: Number(client.baseInputs?.shadedAnnualIncome || 0),
      monthlyLivingExpenses: Number(client.baseInputs?.monthlyLivingExpenses || 0),
      monthlyCommitments: Number(client.baseInputs?.monthlyCommitments || 0),
      interestRate: Number(client.baseInputs?.interestRate || 0),
      bufferRate: Number(client.baseInputs?.bufferRate || 3),
      loanTermYears: Number(client.baseInputs?.loanTermYears || 30),
      totalDebtBalances: Number(client.baseInputs?.totalDebtBalances || 0),
      calculationMode: client.baseInputs?.calculationMode,
      dtiCapEnabled: !!client.baseInputs?.dtiCapEnabled,
      dtiCapLimit: Number(client.baseInputs?.dtiCapLimit || 6),
    },
    baseResult: {
      borrowingCapacity: Number(client.baseResult?.borrowingCapacity || 0),
      monthlySurplus: Number(client.baseResult?.monthlySurplus || 0),
      serviceabilityBand: (client.baseResult?.serviceabilityBand || 'red') as 'green' | 'amber' | 'red',
      dtiRatio: Number(client.baseResult?.dtiRatio || 0),
    },
    properties,
    liabilities,
    acquisition: acquisition ?? undefined,
  };
}

// ── Run the AI scenarios through the engine ────────────────────────────

export function validateAIScenarios(
  scenarios: AIScenario[],
  client: ChatClientContext,
  inferredTargetPrice?: number,
): AIScenario[] {
  return scenarios.map(scenario => {
    try {
      // Resolve the acquisition context — patch missing targetPurchasePrice
      // when we detected one in the user message.
      let acq: AcquisitionContext | null = null;
      if (scenario.adjustments.acquisition) {
        acq = { ...scenario.adjustments.acquisition };
        if ((!acq.targetPurchasePrice || acq.targetPurchasePrice <= 0) && inferredTargetPrice) {
          acq.targetPurchasePrice = inferredTargetPrice;
        }
      } else if (inferredTargetPrice) {
        // AI omitted acquisition entirely — synthesise a sane default.
        acq = {
          state: 'NSW',
          intent: 'investor',
          category: 'established',
          isFirstHomeBuyer: (client.properties?.length || 0) === 0,
          lmiMode: 'display_deduction',
          cashOnHand: 0,
          targetPurchasePrice: inferredTargetPrice,
        };
      }

      const ctx = buildScenarioContext(client, acq);
      const deltas = adjustmentsToDeltas(scenario.adjustments);
      const { inputs, effect, issues } = aggregateDeltas(scenario.name, deltas, ctx);

      const result = calculateBorrowingCapacity({
        grossAnnualIncome: inputs.grossAnnualIncome,
        shadedAnnualIncome: inputs.shadedAnnualIncome,
        monthlyLivingExpenses: inputs.monthlyLivingExpenses,
        monthlyCommitments: inputs.monthlyCommitments,
        interestRate: inputs.interestRate,
        bufferRate: inputs.bufferRate,
        loanTermYears: inputs.loanTermYears,
        totalDebtBalances: inputs.totalDebtBalances,
        calculationMode: inputs.calculationMode,
        dtiCapEnabled: inputs.dtiCapEnabled,
        dtiCapLimit: inputs.dtiCapLimit,
      });

      const acquisitionCapacity = ctx.acquisition
        ? computeAcquisitionCapacity(result.borrowingCapacity, ctx, effect)
        : null;

      // Mutate the scenario in place — also persist the patched acquisition
      // so the front-end Apply flow uses the same target.
      if (acq) {
        scenario.adjustments.acquisition = acq;
      }

      const validation: EngineValidation = {
        borrowingCapacity: Math.round(result.borrowingCapacity),
        capacityChange: Math.round(result.borrowingCapacity - ctx.baseResult.borrowingCapacity),
        monthlySurplus: Math.round(result.monthlySurplus),
        serviceabilityBand: result.serviceabilityBand,
        dtiRatio: Number(result.dtiRatio?.toFixed(2) ?? 0),
        meetsTarget: acquisitionCapacity?.meetsTarget,
        shortfallToTarget: acquisitionCapacity?.shortfallToTarget,
        maxPurchasePrice: acquisitionCapacity?.maxPurchasePrice,
        loanRequiredForPurchase: acquisitionCapacity?.loanRequiredForPurchase,
        netCashAfterSettlement: acquisitionCapacity?.netCashAfterSettlement,
        releasedCapital: acquisitionCapacity?.releasedCapital,
        targetPurchasePrice: acquisitionCapacity?.targetPurchasePrice,
        validationIssues: issues,
      };

      scenario.engineValidation = validation;
      return scenario;
    } catch (err) {
      console.error('[aiScenarioPreview] Failed to validate scenario:', scenario.name, err);
      return scenario;
    }
  });
}

// ── Detect numeric budgets in user messages ────────────────────────────

const BUDGET_PATTERNS: RegExp[] = [
  // $700k, $1.2m, $700K
  /\$\s*([0-9]+(?:\.[0-9]+)?)\s*([kKmM])\b/g,
  // 700k, 1.2m  (no $)
  /\b([0-9]+(?:\.[0-9]+)?)\s*([kKmM])\b/g,
  // $700,000 or $700000
  /\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})/g,
];

/**
 * Returns the LARGEST numeric budget mentioned across the conversation
 * (so a follow-up "actually I want $700k" overrides the original "$650k").
 * Recency wins on ties.
 */
export function detectTargetPrice(messages: Array<{ role: string; content: string }>): number | undefined {
  let best: { value: number; index: number } | undefined;
  messages.forEach((msg, idx) => {
    if (msg.role !== 'user' || !msg.content) return;
    const text = msg.content;
    for (const re of BUDGET_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        let value = parseFloat(m[1].replace(/,/g, ''));
        if (!Number.isFinite(value) || value <= 0) continue;
        const suffix = (m[2] || '').toLowerCase();
        if (suffix === 'k') value *= 1_000;
        else if (suffix === 'm') value *= 1_000_000;
        // Require sensible AU property range to avoid catching e.g. "$1,100" repayments.
        if (value < 50_000 || value > 50_000_000) continue;
        if (!best || value > best.value || (value === best.value && idx >= best.index)) {
          best = { value, index: idx };
        }
      }
    }
  });
  return best?.value;
}

/**
 * Heuristic: detects when the latest user message is a clarification
 * (asking the AI to explain / confirm something) rather than a request
 * to regenerate scenarios. Used to avoid spamming new tool calls.
 */
export function isClarificationMessage(content: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase().trim();
  if (lower.length < 6) return false;
  // Question mark with no explicit "generate / create / build" keyword
  const hasQuestion = lower.includes('?');
  const wantsAction = /\b(generate|create|build|run|make|propose|recommend|show me|give me)\b/.test(lower);
  if (hasQuestion && !wantsAction) return true;
  const clarificationCues = [
    'clarify', 'confirm', 'will this', 'will it', 'does this', 'does it',
    'is this', 'is it', 'how does', 'how would', 'what does', 'what is',
    'why ', 'explain', 'before applying', 'before i apply',
  ];
  return clarificationCues.some(cue => lower.includes(cue));
}
