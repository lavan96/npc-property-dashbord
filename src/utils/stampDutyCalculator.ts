/**
 * Australian Stamp Duty Calculator (transfer duty)
 *
 * Provides progressive bracket calculations for all 8 states/territories with
 * support for First Home Buyer concessions and foreign/investor surcharges.
 *
 * Sourced from state revenue office schedules (2024–25). Used by the borrowing
 * capacity scenario engine to derive acquisition costs alongside the loan.
 *
 * NOTE: Mirrored in `supabase/functions/_shared/stampDutyCalculator.ts` for the
 * edge function. Keep both files in sync.
 */

export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'NT' | 'ACT';

export type PurchaseIntent = 'owner_occupier' | 'investor';
export type PropertyCategory = 'established' | 'new' | 'vacant_land';

export interface StampDutyInput {
  propertyValue: number;
  state: AustralianState;
  intent: PurchaseIntent;
  category?: PropertyCategory;
  isFirstHomeBuyer?: boolean;
  isForeignBuyer?: boolean;
  /** Phase I5 — VIC off-the-plan concession: dutiable value is reduced by
   *  the % of construction not yet complete at contract date. Pass 0–1
   *  (e.g. 0.6 = 60% of price represents future construction). VIC only. */
  offThePlanConstructionFraction?: number;
}

export interface StampDutyBreakdown {
  baseDuty: number;
  fhbConcession: number;        // dollar amount (positive = saved)
  foreignSurcharge: number;     // dollar amount added
  investorSurcharge: number;    // dollar amount added (some states)
  totalDuty: number;
  effectiveRate: number;        // percent of property value
  notes: string[];
  state: AustralianState;
}

// ============================================
// CORE BRACKET CALCULATORS (per state)
// ============================================

function calcNSW(value: number): number {
  if (value <= 16000) return value * 0.0125;
  if (value <= 35000) return 200 + (value - 16000) * 0.015;
  if (value <= 93000) return 485 + (value - 35000) * 0.0175;
  if (value <= 351000) return 1500 + (value - 93000) * 0.035;
  if (value <= 1168000) return 10530 + (value - 351000) * 0.045;
  return 47295 + (value - 1168000) * 0.055;
}

/** VIC general (non-PPR / investor) rates — 2024-25 SRO schedule. */
function calcVIC(value: number): number {
  if (value <= 25000) return value * 0.014;
  if (value <= 130000) return 350 + (value - 25000) * 0.024;
  if (value <= 960000) return 2870 + (value - 130000) * 0.06;
  if (value <= 2000000) return value * 0.055; // flat 5.5% bracket
  return 110000 + (value - 2000000) * 0.065;
}

/** VIC PPR (owner-occupier) rates — preferential brackets to $550k.
 *  Above $550k VIC PPR pays the same as general rates, so we fall through. */
function calcVICppr(value: number): number {
  if (value <= 25000) return value * 0.014;
  if (value <= 130000) return 350 + (value - 25000) * 0.024;
  if (value <= 440000) return 2870 + (value - 130000) * 0.05;
  if (value <= 550000) return 18370 + (value - 440000) * 0.06;
  // ≥ $550k PPR uses general rates
  return calcVIC(value);
}

function calcQLD(value: number): number {
  if (value <= 5000) return 0;
  if (value <= 75000) return (value - 5000) * 0.015;
  if (value <= 540000) return 1050 + (value - 75000) * 0.035;
  if (value <= 1000000) return 17325 + (value - 540000) * 0.045;
  return 38025 + (value - 1000000) * 0.0575;
}

function calcWA(value: number): number {
  if (value <= 120000) return value * 0.019;
  if (value <= 150000) return 2280 + (value - 120000) * 0.029;
  if (value <= 360000) return 3150 + (value - 150000) * 0.038;
  if (value <= 725000) return 11130 + (value - 360000) * 0.047;
  return 28285 + (value - 725000) * 0.051;
}

function calcSA(value: number): number {
  if (value <= 12000) return value * 0.01;
  if (value <= 30000) return 120 + (value - 12000) * 0.02;
  if (value <= 50000) return 480 + (value - 30000) * 0.03;
  if (value <= 100000) return 1080 + (value - 50000) * 0.035;
  if (value <= 200000) return 2830 + (value - 100000) * 0.04;
  if (value <= 300000) return 6830 + (value - 200000) * 0.0425;
  if (value <= 500000) return 11080 + (value - 300000) * 0.045;
  return 20080 + (value - 500000) * 0.0575;
}

function calcTAS(value: number): number {
  if (value <= 3000) return value * 0.0175;
  if (value <= 25000) return 52.5 + (value - 3000) * 0.0225;
  if (value <= 75000) return 547.5 + (value - 25000) * 0.0325;
  if (value <= 200000) return 2172.5 + (value - 75000) * 0.0375;
  if (value <= 375000) return 6859.38 + (value - 200000) * 0.04;
  if (value <= 725000) return 13859.38 + (value - 375000) * 0.0425;
  return 28734.38 + (value - 725000) * 0.045;
}

function calcNT(value: number): number {
  if (value <= 525000) return value * 0.0465;
  if (value <= 3000000) return 24412.5 + (value - 525000) * 0.0565;
  return 164400 + (value - 3000000) * 0.0595;
}

function calcACT(value: number): number {
  if (value <= 200000) return (value / 100) * 0.7;
  if (value <= 300000) return 1400 + ((value - 200000) / 100) * 2.2;
  if (value <= 500000) return 3600 + ((value - 300000) / 100) * 3.4;
  if (value <= 750000) return 10400 + ((value - 500000) / 100) * 4.32;
  if (value <= 1000000) return 21200 + ((value - 750000) / 100) * 5.9;
  if (value <= 1455000) return 35950 + ((value - 1000000) / 100) * 6.4;
  return 65070 + ((value - 1455000) / 100) * 4.54;
}

const STATE_CALCULATORS: Record<AustralianState, (v: number) => number> = {
  NSW: calcNSW, VIC: calcVIC, QLD: calcQLD, WA: calcWA,
  SA: calcSA, TAS: calcTAS, NT: calcNT, ACT: calcACT,
};

// ============================================
// CONCESSIONS & SURCHARGES
// ============================================

/** First-home-buyer relief by state (2024–25). Returns dollars saved. */
function fhbConcession(value: number, state: AustralianState, category: PropertyCategory): number {
  switch (state) {
    case 'NSW':
      // Full exemption new/established up to $800k, partial up to $1M
      if (category === 'vacant_land') {
        if (value <= 350000) return calcNSW(value);
        if (value <= 450000) return calcNSW(value) * Math.max(0, (450000 - value) / 100000);
        return 0;
      }
      if (value <= 800000) return calcNSW(value);
      if (value <= 1000000) return calcNSW(value) * Math.max(0, (1000000 - value) / 200000);
      return 0;
    case 'VIC':
      // Full exemption up to $600k (PPR), tapering to $750k
      if (value <= 600000) return calcVIC(value);
      if (value <= 750000) return calcVIC(value) * Math.max(0, (750000 - value) / 150000);
      return 0;
    case 'QLD':
      // First home concession up to $700k (full) tapering to $800k
      if (value <= 700000) return calcQLD(value);
      if (value <= 800000) return calcQLD(value) * Math.max(0, (800000 - value) / 100000);
      return 0;
    case 'WA':
      if (value <= 450000) return calcWA(value);
      if (value <= 600000) return calcWA(value) * Math.max(0, (600000 - value) / 150000);
      return 0;
    case 'SA':
      // SA abolished stamp duty for FHB on new homes up to $650k from Jun 2023
      if (category === 'new' && value <= 650000) return calcSA(value);
      return 0;
    case 'TAS':
      // 50% concession on established up to $600k
      if (value <= 600000) return calcTAS(value) * 0.5;
      return 0;
    case 'NT':
      // FHB discount up to $10k for established
      return Math.min(10000, calcNT(value));
    case 'ACT':
      // Income-tested; assume eligible — full concession to $1M property value
      if (value <= 1000000) return calcACT(value);
      return 0;
  }
}

/** Foreign-buyer surcharge by state (added on top of base duty). */
function foreignSurcharge(value: number, state: AustralianState): number {
  switch (state) {
    case 'NSW': return value * 0.09;   // 9% surcharge
    case 'VIC': return value * 0.08;   // 8%
    case 'QLD': return value * 0.08;   // 8% AFAD
    case 'WA':  return value * 0.07;   // 7%
    case 'SA':  return value * 0.07;   // 7%
    case 'TAS': return value * 0.08;   // 8%
    case 'NT':  return 0;              // no surcharge currently
    case 'ACT': return 0;              // no surcharge currently
  }
}

/** Investor surcharges (some states have premium rates for non-PPR purchases). */
function investorSurcharge(_value: number, _state: AustralianState): number {
  // Most states do NOT have a separate investor stamp duty surcharge — the
  // base bracket already applies. Land tax surcharges exist but are annual,
  // not at acquisition. Return 0 unless future state policy adds one.
  return 0;
}

// ============================================
// PUBLIC API
// ============================================

export function calculateStampDuty(input: StampDutyInput): StampDutyBreakdown {
  const value = Math.max(0, input.propertyValue || 0);
  const state = input.state;
  const intent = input.intent;
  const category = input.category || 'established';
  const isFhb = !!input.isFirstHomeBuyer && intent === 'owner_occupier';
  const isForeign = !!input.isForeignBuyer;

  if (value <= 0 || !STATE_CALCULATORS[state]) {
    return {
      baseDuty: 0, fhbConcession: 0, foreignSurcharge: 0, investorSurcharge: 0,
      totalDuty: 0, effectiveRate: 0, notes: ['Invalid input'], state,
    };
  }

  // Phase I5 — VIC off-the-plan dutiable-value reduction (PPR / FHB only).
  // Construction-fraction × price is exempt from duty up to the eligibility
  // threshold. Investor purchasers cannot use OTP concessions since 2017.
  let dutiableValue = value;
  let otpReductionApplied = 0;
  const otpFrac = Math.max(0, Math.min(1, input.offThePlanConstructionFraction ?? 0));
  if (state === 'VIC' && otpFrac > 0 && intent === 'owner_occupier' && category === 'new') {
    const otpEligibilityCap = isFhb ? 750000 : 550000;
    if (value <= otpEligibilityCap) {
      dutiableValue = value * (1 - otpFrac);
      otpReductionApplied = value - dutiableValue;
    }
  }

  // Phase I5 — VIC PPR uses preferential brackets <$550k.
  const calc = (state === 'VIC' && intent === 'owner_occupier')
    ? calcVICppr
    : STATE_CALCULATORS[state];

  const baseDuty = Math.round(calc(dutiableValue));
  const fhbSaving = isFhb ? Math.round(fhbConcession(dutiableValue, state, category)) : 0;
  const foreign = isForeign ? Math.round(foreignSurcharge(value, state)) : 0;
  const investor = intent === 'investor' ? Math.round(investorSurcharge(value, state)) : 0;

  const totalDuty = Math.max(0, baseDuty - fhbSaving + foreign + investor);
  const effectiveRate = value > 0 ? (totalDuty / value) * 100 : 0;

  const notes: string[] = [];
  if (otpReductionApplied > 0) notes.push(`VIC off-the-plan: dutiable value reduced by $${Math.round(otpReductionApplied).toLocaleString()} (${(otpFrac * 100).toFixed(0)}% construction)`);
  if (state === 'VIC' && intent === 'owner_occupier' && value <= 550000) notes.push(`VIC PPR brackets applied (preferential <$550k)`);
  if (fhbSaving > 0) notes.push(`FHB concession: −$${fhbSaving.toLocaleString()} (${state} ${category})`);
  if (foreign > 0) notes.push(`Foreign buyer surcharge: +$${foreign.toLocaleString()}`);
  if (investor > 0) notes.push(`Investor surcharge: +$${investor.toLocaleString()}`);
  if (notes.length === 0) notes.push(`Standard ${state} ${intent} duty`);

  return {
    baseDuty,
    fhbConcession: fhbSaving,
    foreignSurcharge: foreign,
    investorSurcharge: investor,
    totalDuty,
    effectiveRate: Math.round(effectiveRate * 100) / 100,
    notes,
    state,
  };
}

/** Estimate other acquisition costs (legals, inspections, transfer fees). */
export function estimateOtherAcquisitionCosts(propertyValue: number): {
  conveyancing: number;
  buildingInspection: number;
  pestInspection: number;
  loanApplicationFee: number;
  registrationFees: number;
  total: number;
} {
  const conveyancing = 1800;
  const buildingInspection = 600;
  const pestInspection = 350;
  const loanApplicationFee = 600;
  // Title transfer + mortgage registration vary by state — use rounded average
  const registrationFees = Math.min(450, Math.max(180, Math.round(propertyValue / 5000)));
  const total = conveyancing + buildingInspection + pestInspection + loanApplicationFee + registrationFees;
  return { conveyancing, buildingInspection, pestInspection, loanApplicationFee, registrationFees, total };
}
