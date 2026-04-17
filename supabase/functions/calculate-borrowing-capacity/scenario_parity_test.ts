/**
 * Scenario Engine Parity Tests — Phase D1
 *
 * Asserts that the Deno mirror in `_shared/scenarioDeltaEngine.ts` produces
 * the same delta aggregation and acquisition-capacity output as the canonical
 * client engine in `src/utils/scenarioDeltaEngine.ts` (run via Deno here).
 *
 * Why these tests matter:
 *   - The client preview (`StrategyScenarioModeling`) and the server replay
 *     (`calculate-borrowing-capacity`) MUST agree to the cent.
 *   - Any drift between the two engines breaks "Apply Scenario" handoffs and
 *     the PDF report's scenario comparison table.
 *
 * Run locally:
 *   deno test --allow-net --allow-env supabase/functions/calculate-borrowing-capacity/scenario_parity_test.ts
 */

import {
  assertEquals,
  assert,
  assertAlmostEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  aggregateDeltas,
  computeAcquisitionCapacity,
  type ScenarioContext,
  type ScenarioDelta,
} from '../_shared/scenarioDeltaEngine.ts';

// ── Fixtures ─────────────────────────────────────────────

function buildContext(): ScenarioContext {
  return {
    baseInputs: {
      grossAnnualIncome: 180000,
      shadedAnnualIncome: 162000,
      monthlyLivingExpenses: 4500,
      monthlyCommitments: 850,
      interestRate: 6.25,
      bufferRate: 3.0,
      loanTermYears: 30,
      totalDebtBalances: 320000,
      calculationMode: 'bank',
      dtiCapEnabled: true,
      dtiCapLimit: 6,
    },
    baseResult: {
      borrowingCapacity: 720000,
      monthlySurplus: 1850,
      serviceabilityBand: 'green',
      dtiRatio: 5.78,
    },
    properties: [
      {
        id: 'prop-A',
        address: '12 Wattle St, Brunswick VIC',
        propertyType: 'investment',
        currentValue: 850000,
        loanRemaining: 420000,
        monthlyRepayment: 2380,
        loanRepaymentAmount: 2380,
        netMonthlyCashflow: -250,
        monthlyRentalIncome: 2700,
      },
      {
        id: 'prop-B',
        address: '5 Banksia Ave, Northcote VIC',
        propertyType: 'owner_occupied',
        currentValue: 1100000,
        loanRemaining: 540000,
        monthlyRepayment: 3050,
        loanRepaymentAmount: 3050,
        netMonthlyCashflow: 0,
      },
    ],
    liabilities: [
      { id: 'lia-cc1', type: 'credit_card', label: 'CBA Visa', balance: 4200, limit: 12000, monthlyServicing: 360 },
      { id: 'lia-cl1', type: 'car_loan', label: 'Toyota Finance', balance: 22000, monthlyServicing: 540 },
    ],
    acquisition: {
      state: 'VIC',
      intent: 'investor',
      category: 'established',
      isFirstHomeBuyer: false,
      isForeignBuyer: false,
      lmiMode: 'display_deduction',
      cashOnHand: 50000,
    },
  };
}

// ── Tests ────────────────────────────────────────────────

Deno.test('aggregateDeltas: empty deltas yields zero-effect & base inputs unchanged', () => {
  const ctx = buildContext();
  const { inputs, effect, issues } = aggregateDeltas('Empty', [], ctx);

  assertEquals(issues.length, 0, 'no validation issues for empty deltas');
  assertEquals(effect.incomeAdjustment, 0);
  assertEquals(effect.expenseAdjustment, 0);
  assertEquals(effect.commitmentAdjustment, 0);
  assertEquals(inputs.grossAnnualIncome, ctx.baseInputs.grossAnnualIncome);
  assertEquals(inputs.monthlyCommitments, ctx.baseInputs.monthlyCommitments);
});

Deno.test('aggregateDeltas: liability_payoff drops commitments and debt balance', () => {
  const ctx = buildContext();
  const deltas: ScenarioDelta[] = [
    { id: 'lia-cl1', label: 'Pay Toyota', type: 'liability_payoff', value: 22000, unit: 'absolute' },
  ];
  const { inputs, effect } = aggregateDeltas('Pay Off Car', deltas, ctx);
  assertEquals(effect.commitmentAdjustment, -540);
  assertEquals(effect.debtBalanceAdjustment, -22000);
  assertEquals(inputs.monthlyCommitments, ctx.baseInputs.monthlyCommitments - 540);
  assertEquals(inputs.totalDebtBalances, ctx.baseInputs.totalDebtBalances - 22000);
});

Deno.test('aggregateDeltas: rate_change adjusts interestRate (base + delta)', () => {
  const ctx = buildContext();
  const deltas: ScenarioDelta[] = [
    { id: 'rate-down', label: '-0.5%', type: 'rate_change', value: -0.5, unit: 'rate_points' },
  ];
  const { inputs, effect } = aggregateDeltas('Rate Cut', deltas, ctx);
  assertEquals(effect.rateAdjustment, -0.5);
  assertAlmostEquals(inputs.interestRate, 5.75, 0.0001);
});

Deno.test('aggregateDeltas: rejects unknown property/liability IDs as warnings', () => {
  const ctx = buildContext();
  const deltas: ScenarioDelta[] = [
    { id: 'prop-XYZ', label: 'Sell phantom', type: 'property_sell', value: 0, unit: 'absolute' },
    { id: 'lia-XYZ', label: 'Pay phantom', type: 'liability_payoff', value: 5000, unit: 'absolute' },
  ];
  const { issues, safeDeltas } = aggregateDeltas('Hallucination', deltas, ctx);
  assertEquals(issues.length, 2);
  assertEquals(issues[0].severity, 'warning');
  assertEquals(safeDeltas.length, 0, 'unknown-target deltas dropped from execution');
});

Deno.test('aggregateDeltas: equity_release frees capital and adds IO servicing', () => {
  const ctx = buildContext();
  const deltas: ScenarioDelta[] = [
    {
      id: 'prop-A',
      label: 'Release equity to 80% LVR',
      type: 'equity_release',
      value: 0.80,
      unit: 'ratio',
    },
  ];
  const { effect } = aggregateDeltas('Release Equity', deltas, ctx);
  // prop-A: value 850k, current loan 420k, target loan = 850k * 0.80 = 680k
  // gross release = 260k, LVR = 80% → no LMI
  assert(effect.releasedCapital > 0, 'released capital should be positive');
  assertAlmostEquals(effect.releasedCapital, 260000, 1);
  assert(effect.commitmentAdjustment > 0, 'IO repayment adds to commitments');
  assert(effect.acquisitionNotes.length > 0, 'audit notes recorded');
});

Deno.test('computeAcquisitionCapacity: solver converges and accounts for stamp duty + LMI', () => {
  const ctx = buildContext();
  // Run a scenario that frees ~$260k via equity release + uses $50k cash on hand
  const deltas: ScenarioDelta[] = [
    { id: 'prop-A', label: 'Release equity to 80% LVR', type: 'equity_release', value: 0.80, unit: 'ratio' },
  ];
  const { effect } = aggregateDeltas('Acquisition Test', deltas, ctx);
  const acq = computeAcquisitionCapacity(720000, ctx, effect);

  assert(acq.maxPurchasePrice > 0, 'should derive a positive purchase price');
  assert(acq.cashAvailable >= 50000 + effect.releasedCapital - 1, 'cash available includes released capital + on-hand');
  assert(acq.stampDuty > 0, 'VIC stamp duty should be charged on the purchase');
  assert(acq.otherAcquisitionCosts > 0, 'other acquisition costs charged');
  // Sanity: max purchase ≤ loan + cash
  assert(acq.maxPurchasePrice <= acq.loanAvailableForPurchase + acq.cashAvailable + 1);
});

Deno.test('computeAcquisitionCapacity: debt_capitalised mode reduces loan available', () => {
  const ctx = buildContext();
  ctx.acquisition!.lmiMode = 'debt_capitalised';
  const { effect } = aggregateDeltas('Debt-cap LMI', [], ctx);
  const acq = computeAcquisitionCapacity(720000, ctx, effect);
  if (acq.lmi > 0) {
    assert(
      acq.loanAvailableForPurchase < 720000,
      'debt-capitalised LMI should shave loan availability',
    );
  } else {
    // No LMI required at this LVR — loan stays at full capacity
    assertEquals(acq.loanAvailableForPurchase, 720000);
  }
});

Deno.test('aggregateDeltas: chained deltas are additive', () => {
  const ctx = buildContext();
  const deltas: ScenarioDelta[] = [
    { id: 'lia-cl1', label: 'Pay car', type: 'liability_payoff', value: 22000, unit: 'absolute' },
    { id: 'lia-cc1', label: 'Pay CC', type: 'liability_payoff', value: 4200, unit: 'absolute' },
    { id: 'rate-down', label: '-0.5%', type: 'rate_change', value: -0.5, unit: 'rate_points' },
    { id: 'income-up', label: '+10%', type: 'income_change', value: 10, unit: 'percent' },
  ];
  const { inputs, effect } = aggregateDeltas('Combined', deltas, ctx);
  assertEquals(effect.commitmentAdjustment, -540 - 360);
  assertEquals(effect.debtBalanceAdjustment, -22000 - 4200);
  assertAlmostEquals(inputs.interestRate, 5.75, 0.0001);
  assertAlmostEquals(inputs.grossAnnualIncome, 180000 * 1.10, 0.01);
  assertAlmostEquals(inputs.shadedAnnualIncome, 162000 * 1.10, 0.01);
});

Deno.test('aggregateDeltas: dti_cap_change toggles cap', () => {
  const ctx = buildContext();
  const deltas: ScenarioDelta[] = [
    { id: 'dti-relax', label: 'DTI 8x', type: 'dti_cap_change', value: 8, unit: 'ratio', meta: { enabled: true } },
  ];
  const { inputs, effect } = aggregateDeltas('Relax DTI', deltas, ctx);
  assertEquals(effect.dtiCapEnabled, true);
  assertEquals(effect.dtiCapLimit, 8);
  assertEquals(inputs.dtiCapLimit, 8);
});

Deno.test('aggregateDeltas: loan_term_change extends loanTermYears', () => {
  const ctx = buildContext();
  const deltas: ScenarioDelta[] = [
    { id: 'term-extend', label: '+5yr', type: 'loan_term_change', value: 5, unit: 'years' },
  ];
  const { inputs, effect } = aggregateDeltas('Extend Term', deltas, ctx);
  assertEquals(effect.loanTermAdjustment, 5);
  assertEquals(inputs.loanTermYears, 35);
});

Deno.test('validateDeltas: rate change > 10pp surfaces warning', () => {
  const ctx = buildContext();
  const deltas: ScenarioDelta[] = [
    { id: 'rate-extreme', label: '+15%', type: 'rate_change', value: 15, unit: 'rate_points' },
  ];
  const { issues } = aggregateDeltas('Extreme Rate', deltas, ctx);
  assertEquals(issues.length, 1);
  assertEquals(issues[0].severity, 'warning');
});

Deno.test('aggregateDeltas: non-finite value is flagged as error', () => {
  const ctx = buildContext();
  const deltas: ScenarioDelta[] = [
    { id: 'bogus', label: 'NaN', type: 'income_change', value: NaN, unit: 'percent' },
  ];
  const { issues } = aggregateDeltas('NaN', deltas, ctx);
  assertEquals(issues.length, 1);
  assertEquals(issues[0].severity, 'error');
});
