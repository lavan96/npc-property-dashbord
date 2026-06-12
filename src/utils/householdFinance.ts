/**
 * Centralised household income, liability servicing and property cash-flow
 * engine. Single source of truth for all PDF generators, borrowing capacity
 * calculators and client summary surfaces.
 *
 * Rules baked in here (do NOT duplicate elsewhere):
 *  1. `client_employment` is the source of truth for salary income. The
 *     legacy `client_income` table is only consulted per contact when no
 *     employment row exists.
 *  2. Secondary contact income MUST be aggregated separately and added to
 *     the household total.
 *  3. Non-employment income from `client_income_sources` (dividends,
 *     government payments, trust distributions, child support, etc.) is
 *     itemised on its own row so the figure is fully traceable.
 *  4. Owner-occupied mortgage repayments are reported as
 *     "Home Loan Repayments", NOT as "Property Holding Costs".
 *  5. Credit cards with $0 captured monthly repayment fall back to the
 *     APRA-style 3% of credit-limit (or balance) estimate. BNPL → 5%.
 *     Other loans with $0 captured but a positive balance fall back to a
 *     P&I estimate. HECS uses ATO brackets via getHecsRepayment().
 */

import { getHecsRepayment } from '@/utils/borrowingCapacityCalculations';

export type IncomeFrequency =
  | 'weekly' | 'fortnightly' | 'monthly'
  | 'annual' | 'annually' | 'yearly' | string | null | undefined;

export const freqToMonthly = (amount: number, freq?: IncomeFrequency): number => {
  const a = Number(amount) || 0;
  const f = String(freq || 'annual').toLowerCase();
  if (f === 'weekly') return a * (52 / 12);
  if (f === 'fortnightly') return a * (26 / 12);
  if (f === 'monthly') return a;
  return a / 12;
};

const isOwnerOccupiedType = (t?: string | null) => {
  const v = String(t || '').toLowerCase();
  return ['owner_occupied', 'ppor', 'principal_place_of_residence', 'home'].includes(v);
};

// ─── Income ────────────────────────────────────────────────────────────────
export interface EmploymentRowLike {
  contact_type?: string | null;
  is_current?: boolean | null;
  gross_annual_salary?: number | null;
  salary_amount?: number | null;
  salary_frequency?: string | null;
  bonus?: number | null;
  commission?: number | null;
  overtime_essential?: number | null;
  overtime_non_essential?: number | null;
  allowance?: number | null;
  other_taxable_income?: number | null;
}

export interface IncomeRowLike {
  contact_type?: string | null;
  gross_salary?: number | null;
  salary_frequency?: string | null;
  bonus?: number | null;
  commission?: number | null;
  overtime_essential?: number | null;
  overtime_non_essential?: number | null;
  allowance?: number | null;
  other_taxable_income?: number | null;
}

export interface IncomeSourceRowLike {
  is_active?: boolean | null;
  source_category?: string | null;
  source_type?: string | null;
  source_name?: string | null;
  contact_type?: string | null;
  gross_annual_amount?: number | null;
  input_amount?: number | null;
  input_frequency?: string | null;
}

export interface OtherIncomeLine {
  label: string;
  monthly: number;
  contactType: 'primary' | 'secondary' | string;
}

export interface HouseholdIncome {
  primaryEmploymentMonthly: number;
  secondaryEmploymentMonthly: number;
  totalEmploymentMonthly: number;
  byContactMonthly: Record<string, number>;
  otherIncome: OtherIncomeLine[];
  totalOtherIncomeMonthly: number;
  totalRentalMonthly: number;
  totalMonthly: number;
  totalGrossAnnual: number;
}

export interface BuildIncomeOptions {
  employment?: EmploymentRowLike[];
  income?: IncomeRowLike[];
  incomeSources?: IncomeSourceRowLike[];
  /** Aggregated monthly rental income across investment properties. */
  monthlyRentalIncome?: number;
}

export function buildHouseholdIncome(opts: BuildIncomeOptions): HouseholdIncome {
  const employment = opts.employment ?? [];
  const income = opts.income ?? [];
  const incomeSources = opts.incomeSources ?? [];
  const monthlyRental = Number(opts.monthlyRentalIncome) || 0;

  const byContact: Record<string, number> = {};
  for (const e of employment) {
    if (e.is_current === false) continue;
    const key = String(e.contact_type || 'primary').toLowerCase();
    const base = Number(e.gross_annual_salary || e.salary_amount || 0);
    const baseMonthly = base ? freqToMonthly(base, e.salary_frequency) : 0;
    const extras =
      ((e.bonus || 0) + (e.commission || 0) + (e.overtime_essential || 0) +
       (e.overtime_non_essential || 0) + (e.allowance || 0) + (e.other_taxable_income || 0)) / 12;
    byContact[key] = (byContact[key] || 0) + baseMonthly + extras;
  }
  for (const inc of income) {
    const key = String(inc.contact_type || 'primary').toLowerCase();
    if (byContact[key]) continue; // employment row wins
    const baseMonthly = freqToMonthly(Number(inc.gross_salary || 0), inc.salary_frequency);
    const extras =
      ((inc.bonus || 0) + (inc.commission || 0) + (inc.overtime_essential || 0) +
       (inc.overtime_non_essential || 0) + (inc.allowance || 0) + (inc.other_taxable_income || 0)) / 12;
    byContact[key] = baseMonthly + extras;
  }

  const primary = byContact['primary'] || 0;
  const secondary = Object.entries(byContact)
    .filter(([k]) => k !== 'primary')
    .reduce((s, [, v]) => s + v, 0);

  const otherIncome: OtherIncomeLine[] = incomeSources
    .filter((s) => s.is_active !== false)
    .filter((s) => !['employment', 'salary', 'paye', 'wages']
      .includes(String(s.source_category || '').toLowerCase()))
    .map((s) => {
      const annual = Number(s.gross_annual_amount || 0);
      const inputAmt = Number(s.input_amount || 0);
      const monthly = annual > 0
        ? annual / 12
        : (inputAmt > 0 ? freqToMonthly(inputAmt, s.input_frequency) : 0);
      const label = s.source_name || s.source_type || s.source_category || 'Other income';
      const contactType = String(s.contact_type || 'primary').toLowerCase();
      const who = contactType === 'primary' ? '' : ' (Secondary)';
      return { label: `${label}${who}`, monthly, contactType };
    })
    .filter((s) => s.monthly > 0);

  const totalEmployment = primary + secondary;
  const totalOther = otherIncome.reduce((s, x) => s + x.monthly, 0);
  const totalMonthly = totalEmployment + totalOther + monthlyRental;

  return {
    primaryEmploymentMonthly: primary,
    secondaryEmploymentMonthly: secondary,
    totalEmploymentMonthly: totalEmployment,
    byContactMonthly: byContact,
    otherIncome,
    totalOtherIncomeMonthly: totalOther,
    totalRentalMonthly: monthlyRental,
    totalMonthly,
    totalGrossAnnual: totalMonthly * 12,
  };
}

// ─── Liability servicing ───────────────────────────────────────────────────
export interface LiabilityRowLike {
  id?: string;
  liability_type?: string | null;
  provider_name?: string | null;
  current_balance?: number | null;
  credit_limit?: number | null;
  monthly_repayment?: number | null;
}

export interface LiabilityServicing {
  id?: string;
  type: string;
  label: string;
  balance: number;
  limit?: number;
  monthlyServicing: number;
  captured: number;
  isEstimated: boolean;
  calculationNote: string;
}

const ASSUMED_TERMS: Record<string, { rate: number; years: number; label: string }> = {
  car_loan:      { rate: 0.08, years: 5, label: 'Est. P&I @ 8% / 5yr' },
  personal_loan: { rate: 0.10, years: 7, label: 'Est. P&I @ 10% / 7yr' },
  afterpay_bnpl: { rate: 0,    years: 0, label: '5% of limit/balance' },
  other:         { rate: 0.09, years: 5, label: 'Est. P&I @ 9% / 5yr' },
};

const estimatePIRepayment = (balance: number, annualRate: number, years: number): number => {
  if (balance <= 0 || years <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const periods = years * 12;
  if (monthlyRate === 0) return balance / periods;
  return balance * (monthlyRate * Math.pow(1 + monthlyRate, periods)) /
                   (Math.pow(1 + monthlyRate, periods) - 1);
};

export function computeLiabilityServicing(
  lib: LiabilityRowLike,
  opts: { totalGrossAnnualIncome?: number; balanceOverride?: number; limitOverride?: number } = {}
): LiabilityServicing {
  const balance = opts.balanceOverride ?? (Number(lib.current_balance) || 0);
  const creditLimit = opts.limitOverride ?? (Number(lib.credit_limit) || 0);
  const captured = Number(lib.monthly_repayment) || 0;
  const type = String(lib.liability_type || 'other').toLowerCase();

  let monthlyServicing = captured;
  let isEstimated = false;
  let calculationNote = '';

  if (type === 'credit_card' || type.includes('credit')) {
    const base = creditLimit > 0 ? creditLimit : balance;
    monthlyServicing = Math.round(base * 0.03);
    isEstimated = captured === 0;
    calculationNote = '3% of credit limit';
  } else if (type === 'afterpay_bnpl' || type === 'bnpl') {
    const bnplBase = Math.max(creditLimit, balance);
    monthlyServicing = Math.round(bnplBase * 0.05);
    isEstimated = captured === 0;
    calculationNote = '5% of limit/balance';
  } else if (type === 'hecs' || type === 'help') {
    const annualIncome = Number(opts.totalGrossAnnualIncome) || 0;
    monthlyServicing = getHecsRepayment(annualIncome);
    isEstimated = true;
    calculationNote = monthlyServicing > 0
      ? `${((monthlyServicing * 12) / Math.max(annualIncome, 1) * 100).toFixed(1)}% of income (ATO brackets)`
      : 'Below repayment threshold';
  } else if (captured === 0 && balance > 0) {
    const assumed = ASSUMED_TERMS[type] || ASSUMED_TERMS.other;
    monthlyServicing = Math.round(estimatePIRepayment(balance, assumed.rate, assumed.years));
    isEstimated = true;
    calculationNote = assumed.label;
  }

  return {
    id: lib.id,
    type,
    label: lib.provider_name || type,
    balance,
    limit: (type === 'credit_card' || type === 'afterpay_bnpl') ? creditLimit : undefined,
    monthlyServicing: Math.round(monthlyServicing * 100) / 100,
    captured,
    isEstimated,
    calculationNote,
  };
}

export interface LiabilityServicingSummary {
  items: LiabilityServicing[];
  totalMonthly: number;
  hasEstimated: boolean;
  hasAny: boolean;
}

export function buildLiabilityServicing(
  liabilities: LiabilityRowLike[],
  opts: { totalGrossAnnualIncome?: number } = {}
): LiabilityServicingSummary {
  const items = (liabilities || []).map((l) => computeLiabilityServicing(l, opts));
  return {
    items,
    totalMonthly: items.reduce((s, x) => s + x.monthlyServicing, 0),
    hasEstimated: items.some((x) => x.isEstimated && x.monthlyServicing > 0),
    hasAny: items.length > 0,
  };
}

// ─── Property holding costs / home loan repayments ─────────────────────────
export interface PropertyRowLike {
  property_type?: string | null;
  monthly_interest_repayment?: number | null;
  monthly_body_corporate?: number | null;
  monthly_landlord_insurance?: number | null;
  monthly_building_insurance?: number | null;
  monthly_repairs_maintenance?: number | null;
  monthly_property_management?: number | null;
  monthly_council_rates?: number | null; // annual
  monthly_water_rates?: number | null;   // annual
}

export const isInvestmentProperty = (p: PropertyRowLike): boolean =>
  !!p.property_type && !isOwnerOccupiedType(p.property_type);

const sumTrueHolding = (p: PropertyRowLike): number =>
  (p.monthly_body_corporate || 0) +
  (p.monthly_landlord_insurance || 0) +
  (p.monthly_building_insurance || 0) +
  (p.monthly_repairs_maintenance || 0) +
  (p.monthly_property_management || 0) +
  ((p.monthly_council_rates || 0) / 12) +
  ((p.monthly_water_rates || 0) / 12);

export interface PropertyExpenditure {
  homeLoanRepayments: number;        // owner-occupied loan interest/repayments
  investmentHoldingCosts: number;    // investment loan interest + true costs
  ownerOccHoldingCosts: number;      // true holding costs on owner-occupied
  totalHoldingCosts: number;         // both investment + owner-occ true costs
}

export function buildPropertyExpenditure(properties: PropertyRowLike[]): PropertyExpenditure {
  const props = properties || [];
  const investment = props.filter(isInvestmentProperty);
  const ownerOcc = props.filter((p) => !isInvestmentProperty(p));

  const investmentHoldingCosts = investment.reduce(
    (s, p) => s + sumTrueHolding(p) + (p.monthly_interest_repayment || 0), 0);
  const ownerOccHoldingCosts = ownerOcc.reduce((s, p) => s + sumTrueHolding(p), 0);
  const homeLoanRepayments = ownerOcc.reduce(
    (s, p) => s + (p.monthly_interest_repayment || 0), 0);

  return {
    homeLoanRepayments,
    investmentHoldingCosts,
    ownerOccHoldingCosts,
    totalHoldingCosts: investmentHoldingCosts + ownerOccHoldingCosts,
  };
}
