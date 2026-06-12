import type { LendingAssumptions, LenderPolicyProfileKey } from './calculatorTypes';

export const lenderPolicyProfiles: Record<LenderPolicyProfileKey, Omit<LendingAssumptions, 'profile' | 'contractInterestRatePct' | 'loanTermYears' | 'interestOnlyPeriodYears' | 'amortisationYears' | 'debtYieldEnabled'>> = {
  conservativeBank: { maxLvr: 0.6, minIcr: 1.75, minDscr: 1.35, assessmentBufferPct: 2, minDebtYield: 0.1 },
  mainstreamCommercialBank: { maxLvr: 0.65, minIcr: 1.5, minDscr: 1.25, assessmentBufferPct: 1, minDebtYield: 0.09 },
  nonBankCommercial: { maxLvr: 0.7, minIcr: 1.35, minDscr: 1.15, assessmentBufferPct: 0.5, minDebtYield: 0.08 },
  privateCreditShortTerm: { maxLvr: 0.65, minIcr: 1.25, minDscr: 1.1, assessmentBufferPct: 0, minDebtYield: 0.08 },
  smsfCommercial: { maxLvr: 0.6, minIcr: 1.75, minDscr: 1.35, assessmentBufferPct: 2, minDebtYield: 0.1 },
  ownerOccupiedBusinessLending: { maxLvr: 0.65, minIcr: 1.5, minDscr: 1.25, assessmentBufferPct: 1, minDebtYield: 0.09 },
  custom: { maxLvr: 0.65, minIcr: 1.5, minDscr: 1.25, assessmentBufferPct: 1, minDebtYield: 0.09 },
};

export function applyLenderProfile(current: LendingAssumptions, profile: LenderPolicyProfileKey): LendingAssumptions {
  const defaults = lenderPolicyProfiles[profile];
  return { ...current, ...defaults, profile };
}
