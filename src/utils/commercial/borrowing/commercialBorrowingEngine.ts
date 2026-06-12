import { annualInterest, annualPI, maxLoanByIcr } from '../icrDscrCalculator';
import type { BindingConstraint, BorrowingInputs, BorrowingResult, LendingAssumptions, PurchaseAbilityStatus, RiskRating } from './calculatorTypes';
import { generateCommentary } from './commentaryGenerator';
import { generateDocumentChecklist } from './documentChecklistEngine';
import { calculateFundsToComplete } from './fundsToCompleteEngine';
import { calculateNoi } from './noiAdjustmentEngine';
import { assessRiskOverlay } from './riskOverlayEngine';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const pct = (n: number) => clamp(n, 0, 100) / 100;
const round = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

function maxLoanByDscr(noi: number, assessRatePct: number, termYears: number, minDscr: number): number {
  if (noi <= 0 || assessRatePct <= 0 || minDscr <= 0) return 0;
  const targetAnnualPI = noi / minDscr;
  if (termYears <= 0) return targetAnnualPI / (assessRatePct / 100);
  const r = assessRatePct / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return (targetAnnualPI / 12) * n;
  return (targetAnnualPI / 12) * (1 - Math.pow(1 + r, -n)) / r;
}

function valuationUsed(inputs: BorrowingInputs): number {
  const v = inputs.propertyValuation;
  const values = [v.purchasePrice, v.estimatedMarketValue, v.bankValuation ?? 0].filter(value => value > 0);
  if (!v.useConservativeValuation) return v.bankValuation && v.bankValuation > 0 ? v.bankValuation : v.estimatedMarketValue || v.purchasePrice;
  return values.length ? Math.min(...values) : 0;
}

function validate(inputs: BorrowingInputs, assumptions: LendingAssumptions): string[] {
  const warnings: string[] = [];
  if (inputs.propertyValuation.purchasePrice <= 0) warnings.push('Purchase price must be greater than zero.');
  if (valuationUsed(inputs) <= 0) warnings.push('Property value used for LVR must be greater than zero.');
  if (pct(assumptions.maxLvr * 100) <= 0 || assumptions.maxLvr > 1) warnings.push('Maximum LVR must be between 0 and 1.');
  if (assumptions.minIcr <= 0 || assumptions.minDscr <= 0) warnings.push('Minimum ICR and DSCR must be greater than zero.');
  if (assumptions.contractInterestRatePct + assumptions.assessmentBufferPct <= 0) warnings.push('Assessment rate must be greater than zero.');
  if (assumptions.loanTermYears <= 0 || assumptions.amortisationYears <= 0) warnings.push('Loan term and amortisation period must be greater than zero.');
  if (inputs.acquisitionCosts.gstTreatment === 'unknown') warnings.push('GST treatment is unknown.');
  if (inputs.dealProfile.leaseStatus === 'fullyLeased' && inputs.income.grossPassingRent <= 0) warnings.push('Fully leased assets should include passing rent.');
  if (inputs.dealProfile.assetCategory === 'industrial' && (inputs.riskInputs.environmentalRisk == null || inputs.riskInputs.environmentalRisk === 'unknown')) warnings.push('Industrial environmental risk is unknown.');
  if (['discretionaryTrust', 'unitTrust'].includes(inputs.purchaserStructure.purchaserType) && !inputs.purchaserStructure.trusteeDetails) warnings.push('Trust purchaser selected but trustee details are missing.');
  if ((inputs.dealProfile.acquisitionPurpose === 'relatedPartyLease' || inputs.purchaserStructure.relatedPartyTenant) && !inputs.purchaserStructure.existingBusinessEbitda) warnings.push('Related-party lease selected but operating business financial inputs are missing.');
  return warnings;
}

function bindingFromCaps(caps: Array<{ key: BindingConstraint; value: number }>): { key: BindingConstraint; value: number } {
  return caps.reduce((min, c) => (c.value < min.value ? c : min), caps[0]);
}

function derivePurchaseAbility(rating: RiskRating, equityShortfall: number, maxLoan: number): PurchaseAbilityStatus {
  if (rating === 'specialistReview') return 'specialistReviewRequired';
  if (maxLoan <= 0) return 'notSupportable';
  if (equityShortfall < 0) return 'equityShortfall';
  return rating === 'green' ? 'supportable' : 'supportableSubjectToVerification';
}

export function calculateCommercialIndustrialBorrowing(inputs: BorrowingInputs, includeScenarios = true): BorrowingResult {
  const preliminaryOverlay = assessRiskOverlay(inputs);
  const assumptions: LendingAssumptions = {
    ...inputs.lendingAssumptions,
    maxLvr: clamp(inputs.lendingAssumptions.maxLvr + preliminaryOverlay.lvrAdjustmentPct, 0, 1),
    minIcr: Math.max(0.01, inputs.lendingAssumptions.minIcr + preliminaryOverlay.icrAdjustment),
    minDscr: Math.max(0.01, inputs.lendingAssumptions.minDscr + preliminaryOverlay.dscrAdjustment),
  };
  const noi = calculateNoi(inputs, preliminaryOverlay);
  const assessmentRatePct = Math.max(0, assumptions.contractInterestRatePct + assumptions.assessmentBufferPct);
  const propertyValueUsedForLvr = valuationUsed(inputs);
  const lvrCap = Math.max(0, propertyValueUsedForLvr * assumptions.maxLvr);
  const icrCap = Math.max(0, maxLoanByIcr(noi.selectedNoi, assessmentRatePct, assumptions.minIcr));
  const dscrCap = Math.max(0, maxLoanByDscr(noi.selectedNoi, assessmentRatePct, assumptions.amortisationYears || assumptions.loanTermYears, assumptions.minDscr));
  const debtYieldCap = assumptions.debtYieldEnabled && assumptions.minDebtYield > 0 ? Math.max(0, noi.selectedNoi / assumptions.minDebtYield) : Number.POSITIVE_INFINITY;
  const liquidityCap = inputs.purchaserStructure.liquidityMultiplier > 0 ? Math.max(0, inputs.purchaserStructure.sponsorLiquidity * inputs.purchaserStructure.liquidityMultiplier) : null;
  const riskAdjustedCap = preliminaryOverlay.riskAdjustedAssetCap ?? null;
  const propertyCaps = [
    { key: 'lvr' as const, value: lvrCap },
    { key: 'icr' as const, value: icrCap },
    { key: 'dscr' as const, value: dscrCap },
    ...(assumptions.debtYieldEnabled ? [{ key: 'debtYield' as const, value: debtYieldCap }] : []),
  ];
  const propertyBinding = bindingFromCaps(propertyCaps);
  const propertySupportedLoan = Math.max(0, propertyBinding.value);
  const businessSurplus = Math.max(0, (inputs.purchaserStructure.existingBusinessEbitda ?? 0) - (inputs.purchaserStructure.existingBusinessDebts ?? 0) - Math.max(0, (inputs.purchaserStructure.proposedRentPayable ?? 0) - (inputs.purchaserStructure.existingRentPaid ?? 0)));
  const sponsorSupportedUplift = inputs.dealProfile.acquisitionPurpose === 'ownerOccupied' || inputs.dealProfile.acquisitionPurpose === 'relatedPartyLease' ? Math.min(Math.max(0, lvrCap - propertySupportedLoan), businessSurplus / Math.max(assessmentRatePct / 100, 0.01) / 4) : 0;
  const allCaps = [
    { key: propertyBinding.key, value: propertySupportedLoan + sponsorSupportedUplift },
    { key: 'lvr' as const, value: lvrCap },
    ...(liquidityCap != null ? [{ key: 'liquidity' as const, value: liquidityCap }] : []),
    ...(riskAdjustedCap != null ? [{ key: 'riskOverlay' as const, value: riskAdjustedCap }] : []),
    ...(preliminaryOverlay.specialistReview ? [{ key: 'specialistReview' as const, value: Math.min(propertySupportedLoan, lvrCap) }] : []),
  ];
  const finalBinding = bindingFromCaps(allCaps);
  const finalRiskAdjustedLoan = round(Math.max(0, Math.min(finalBinding.value, lvrCap)));
  const fundsToComplete = calculateFundsToComplete(inputs.propertyValuation.purchasePrice, inputs.acquisitionCosts, finalRiskAdjustedLoan, inputs.purchaserStructure.availableCashEquity, preliminaryOverlay.additionalCapexReserve);
  const annualInt = annualInterest(finalRiskAdjustedLoan, assessmentRatePct);
  const annualDebtService = annualPI(finalRiskAdjustedLoan, assessmentRatePct, assumptions.amortisationYears || assumptions.loanTermYears);
  const icr = annualInt > 0 ? noi.selectedNoi / annualInt : 0;
  const dscr = annualDebtService > 0 ? noi.selectedNoi / annualDebtService : 0;
  const debtYield = finalRiskAdjustedLoan > 0 ? noi.selectedNoi / finalRiskAdjustedLoan : 0;
  const impliedLvr = propertyValueUsedForLvr > 0 ? finalRiskAdjustedLoan / propertyValueUsedForLvr : 0;

  const warnings = [...validate(inputs, assumptions), ...preliminaryOverlay.warnings, ...fundsToComplete.warnings];
  let riskRating: RiskRating = 'green';
  if (preliminaryOverlay.specialistReview) riskRating = 'specialistReview';
  else if (finalRiskAdjustedLoan <= 0 || icr < assumptions.minIcr || dscr < assumptions.minDscr || fundsToComplete.equitySurplusShortfall < -Math.max(50000, inputs.propertyValuation.purchasePrice * 0.05) || preliminaryOverlay.level === 'high') riskRating = 'red';
  else if (warnings.length || preliminaryOverlay.level === 'medium' || fundsToComplete.equitySurplusShortfall < 0 || inputs.propertyValuation.valuationConfidence !== 'high') riskRating = 'amber';

  const purchaseAbilityStatus = derivePurchaseAbility(riskRating, fundsToComplete.equitySurplusShortfall, finalRiskAdjustedLoan);
  const documentChecklist = generateDocumentChecklist(inputs);
  const primaryReason = finalBinding.key === 'icr' ? `Income is limited by the minimum ICR hurdle of ${assumptions.minIcr.toFixed(2)}x.` : finalBinding.key === 'dscr' ? `Income is limited by the minimum DSCR hurdle of ${assumptions.minDscr.toFixed(2)}x.` : finalBinding.key === 'lvr' ? `The result is capped by the ${(assumptions.maxLvr * 100).toFixed(0)}% LVR ceiling.` : finalBinding.key === 'liquidity' ? 'Sponsor liquidity caps the supportable loan.' : finalBinding.key === 'specialistReview' ? 'A specialist review trigger prevents reliance on the output.' : 'Debt yield or risk settings are limiting the transaction.';
  const requiredNextAction = riskRating === 'specialistReview' ? 'Obtain specialist lender/legal/accounting review before relying on this result.' : fundsToComplete.equitySurplusShortfall < 0 ? 'Confirm additional equity, vendor terms or a lower purchase price.' : 'Verify lease, valuation, GST, purchaser structure and due-diligence documents.';
  const secondaryRisks = warnings.slice(0, 6);

  const resultWithoutCommentary = {
    propertyValueUsedForLvr,
    propertySupportedLoan: round(propertySupportedLoan),
    sponsorSupportedUplift: round(sponsorSupportedUplift),
    finalRiskAdjustedLoan,
    proposedLoan: inputs.dealProfile.proposedLoan,
    bindingConstraint: finalBinding.key,
    impliedLvr,
    assessmentRate: assessmentRatePct / 100,
    icr,
    dscr,
    debtYield,
    annualInterest: round(annualInt),
    annualDebtService: round(annualDebtService),
    componentCaps: { lvrCap: round(lvrCap), icrCap: round(icrCap), dscrCap: round(dscrCap), debtYieldCap: assumptions.debtYieldEnabled ? round(debtYieldCap) : 0, liquidityCap: liquidityCap == null ? null : round(liquidityCap), riskAdjustedCap },
    noi,
    fundsToComplete,
    purchaseAbilityStatus,
    riskRating,
    primaryReason,
    secondaryRisks,
    requiredNextAction,
    warnings,
    documentChecklist,
    scenarios: [],
  } satisfies Omit<BorrowingResult, 'commentary'>;

  const commentary = generateCommentary(inputs, resultWithoutCommentary);
  const scenarios = includeScenarios ? generateScenarioComparison(inputs, finalRiskAdjustedLoan) : [];
  return { ...resultWithoutCommentary, scenarios, commentary };
}

export function generateScenarioComparison(inputs: BorrowingInputs, baseLoan?: number): BorrowingResult['scenarios'] {
  const variants = [
    ['Base Case', {}],
    ['Conservative Case', { rate: 0.75, lvr: -0.05, vacancy: 2, capex: 25000 }],
    ['Optimistic Case', { rate: -0.5, lvr: 0.025, vacancy: -1, capex: -10000 }],
    ['Mainstream Bank Case', { profile: 'mainstream' }],
    ['Non-Bank Case', { lvr: 0.05, rate: 0.5, icr: -0.15, dscr: -0.1 }],
    ['Interest-Only Case', { amortisation: 0 }],
    ['Principal-and-Interest Case', { amortisation: inputs.lendingAssumptions.loanTermYears }],
  ] as const;
  return variants.map(([name, v]) => {
    const cloned: BorrowingInputs = JSON.parse(JSON.stringify(inputs));
    cloned.lendingAssumptions.contractInterestRatePct += 'rate' in v ? v.rate ?? 0 : 0;
    cloned.lendingAssumptions.maxLvr = clamp(cloned.lendingAssumptions.maxLvr + ('lvr' in v ? v.lvr ?? 0 : 0), 0, 1);
    cloned.lendingAssumptions.minIcr = Math.max(0.01, cloned.lendingAssumptions.minIcr + ('icr' in v ? v.icr ?? 0 : 0));
    cloned.lendingAssumptions.minDscr = Math.max(0.01, cloned.lendingAssumptions.minDscr + ('dscr' in v ? v.dscr ?? 0 : 0));
    cloned.income.vacancyAllowancePct = Math.max(0, cloned.income.vacancyAllowancePct + ('vacancy' in v ? v.vacancy ?? 0 : 0));
    cloned.acquisitionCosts.capexReserve = Math.max(0, cloned.acquisitionCosts.capexReserve + ('capex' in v ? v.capex ?? 0 : 0));
    if ('amortisation' in v) cloned.lendingAssumptions.amortisationYears = v.amortisation || cloned.lendingAssumptions.loanTermYears;
    const r = calculateCommercialIndustrialBorrowingNoScenarios(cloned);
    return { name, maxLoan: r.finalRiskAdjustedLoan || baseLoan || 0, requiredEquity: r.fundsToComplete.requiredEquity, impliedLvr: r.impliedLvr, icr: r.icr, dscr: r.dscr, debtYield: r.debtYield, riskRating: r.riskRating, bindingConstraint: r.bindingConstraint };
  });
}

function calculateCommercialIndustrialBorrowingNoScenarios(inputs: BorrowingInputs): Omit<BorrowingResult, 'scenarios' | 'commentary'> {
  const r = calculateCommercialIndustrialBorrowing({ ...inputs, lendingAssumptions: { ...inputs.lendingAssumptions } }, false);
  const { scenarios: _s, commentary: _c, ...rest } = r;
  return rest;
}
