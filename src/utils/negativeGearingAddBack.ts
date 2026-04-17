/**
 * Negative Gearing Add-Back — Phase I6
 *
 * When an investor's property is negatively geared (deductible expenses
 * exceed rental income), the loss reduces taxable income → reduces tax.
 * APRA-aligned lenders add back the **tax saving** to assessed income so
 * the investor isn't penalised twice (once for the cash loss in
 * commitments, once for the income reduction).
 *
 * Convention (most banks):
 *   • Annual loss = deductible interest + holding costs − gross rent
 *   • Tax saving = annual loss × marginal tax rate
 *   • Add-back  = tax saving × shadingFactor (default 1.0; some shade 0.8)
 *
 * The add-back is APPLIED TO SHADED INCOME (it's already net of typical
 * income-shading, since it's a deterministic ATO outcome).
 *
 * Notes:
 *   • Only investor properties qualify (PPR loans aren't deductible).
 *   • Depreciation is excluded from the cash loss but included in the
 *     deductible loss when reported. We use cash-basis numbers here for
 *     conservatism — depreciation requires a quantity surveyor schedule.
 *   • This module returns the **annual** add-back; convert to monthly
 *     where the engine speaks monthly.
 */

import type { ScenarioProperty } from './scenarioDeltaEngine';

export interface NegativeGearingInput {
  /** Investment properties currently owned (excludes PPR) */
  investmentProperties: Array<Pick<ScenarioProperty,
    'id' | 'address' | 'monthlyRentalIncome' | 'monthlyRepayment' |
    'loanRepaymentAmount' | 'netMonthlyCashflow' | 'interestRate' | 'loanRemaining'
  >>;
  /** Marginal tax rate (0–1). Derive from the household's gross income. */
  marginalTaxRate: number;
  /** Lender shading on the add-back (default 1.0 = 100% of tax saving). */
  addBackShading?: number;
}

export interface NegativeGearingResult {
  /** Annual add-back to be added to shaded income (AUD). */
  annualAddBack: number;
  /** Per-property breakdown for audit. */
  perProperty: Array<{
    id: string;
    address: string;
    annualLoss: number;       // positive number when negatively geared
    taxSaving: number;        // loss × marginal rate
    addBack: number;          // taxSaving × shadingFactor
  }>;
  /** Notes for the rationale PDF / audit trail. */
  notes: string[];
}

/** Australian resident marginal tax rates 2024-25 (excluding Medicare 2%).
 *  Returns the marginal rate for the next dollar of income. */
export function marginalTaxRateFor(grossAnnualIncome: number): number {
  const inc = Math.max(0, grossAnnualIncome);
  // 2024-25 stage-3-cut brackets
  if (inc <= 18200)  return 0.00 + 0.02; // tax-free + medicare
  if (inc <= 45000)  return 0.16 + 0.02;
  if (inc <= 135000) return 0.30 + 0.02;
  if (inc <= 190000) return 0.37 + 0.02;
  return 0.45 + 0.02;
}

export function computeNegativeGearingAddBack(input: NegativeGearingInput): NegativeGearingResult {
  const shading = Math.max(0, Math.min(1, input.addBackShading ?? 1));
  const mrt = Math.max(0, Math.min(0.5, input.marginalTaxRate));
  let totalAnnualAddBack = 0;
  const perProperty: NegativeGearingResult['perProperty'] = [];
  const notes: string[] = [];

  for (const p of input.investmentProperties || []) {
    const monthlyRent = p.monthlyRentalIncome ?? 0;
    // Prefer explicit netMonthlyCashflow when present (richest signal),
    // otherwise approximate from rent − loan servicing only.
    const monthlyNet = typeof p.netMonthlyCashflow === 'number'
      ? p.netMonthlyCashflow
      : monthlyRent - (p.loanRepaymentAmount ?? p.monthlyRepayment ?? 0);
    if (monthlyNet >= 0) continue; // not negatively geared
    const annualLoss = Math.abs(monthlyNet) * 12;
    const taxSaving = annualLoss * mrt;
    const addBack = taxSaving * shading;
    totalAnnualAddBack += addBack;
    perProperty.push({
      id: p.id,
      address: p.address || p.id,
      annualLoss: Math.round(annualLoss),
      taxSaving: Math.round(taxSaving),
      addBack: Math.round(addBack),
    });
  }

  if (perProperty.length > 0) {
    notes.push(
      `Negative-gearing add-back: $${Math.round(totalAnnualAddBack).toLocaleString()}/yr ` +
      `from ${perProperty.length} investment ${perProperty.length === 1 ? 'property' : 'properties'} ` +
      `at marginal rate ${(mrt * 100).toFixed(1)}%${shading < 1 ? ` (shaded ${(shading * 100).toFixed(0)}%)` : ''}.`
    );
  }

  return { annualAddBack: Math.round(totalAnnualAddBack), perProperty, notes };
}
