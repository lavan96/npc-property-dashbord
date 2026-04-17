/**
 * Australian Stamp Duty Calculator — Deno mirror of `src/utils/stampDutyCalculator.ts`.
 * Keep in sync. Imported by `calculate-borrowing-capacity` for server-side
 * acquisition cost estimation in scenario outputs.
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
}

export interface StampDutyBreakdown {
  baseDuty: number;
  fhbConcession: number;
  foreignSurcharge: number;
  investorSurcharge: number;
  totalDuty: number;
  effectiveRate: number;
  notes: string[];
  state: AustralianState;
}

function calcNSW(v: number): number {
  if (v <= 16000) return v * 0.0125;
  if (v <= 35000) return 200 + (v - 16000) * 0.015;
  if (v <= 93000) return 485 + (v - 35000) * 0.0175;
  if (v <= 351000) return 1500 + (v - 93000) * 0.035;
  if (v <= 1168000) return 10530 + (v - 351000) * 0.045;
  return 47295 + (v - 1168000) * 0.055;
}
function calcVIC(v: number): number {
  if (v <= 25000) return v * 0.014;
  if (v <= 130000) return 350 + (v - 25000) * 0.024;
  if (v <= 960000) return 2870 + (v - 130000) * 0.06;
  if (v <= 2000000) return 52470 + (v - 960000) * 0.06;
  return 110070 + (v - 2000000) * 0.065;
}
function calcQLD(v: number): number {
  if (v <= 5000) return 0;
  if (v <= 75000) return (v - 5000) * 0.015;
  if (v <= 540000) return 1050 + (v - 75000) * 0.035;
  if (v <= 1000000) return 17325 + (v - 540000) * 0.045;
  return 38025 + (v - 1000000) * 0.0575;
}
function calcWA(v: number): number {
  if (v <= 120000) return v * 0.019;
  if (v <= 150000) return 2280 + (v - 120000) * 0.029;
  if (v <= 360000) return 3150 + (v - 150000) * 0.038;
  if (v <= 725000) return 11130 + (v - 360000) * 0.047;
  return 28285 + (v - 725000) * 0.051;
}
function calcSA(v: number): number {
  if (v <= 12000) return v * 0.01;
  if (v <= 30000) return 120 + (v - 12000) * 0.02;
  if (v <= 50000) return 480 + (v - 30000) * 0.03;
  if (v <= 100000) return 1080 + (v - 50000) * 0.035;
  if (v <= 200000) return 2830 + (v - 100000) * 0.04;
  if (v <= 300000) return 6830 + (v - 200000) * 0.0425;
  if (v <= 500000) return 11080 + (v - 300000) * 0.045;
  return 20080 + (v - 500000) * 0.0575;
}
function calcTAS(v: number): number {
  if (v <= 3000) return v * 0.0175;
  if (v <= 25000) return 52.5 + (v - 3000) * 0.0225;
  if (v <= 75000) return 547.5 + (v - 25000) * 0.0325;
  if (v <= 200000) return 2172.5 + (v - 75000) * 0.0375;
  if (v <= 375000) return 6859.38 + (v - 200000) * 0.04;
  if (v <= 725000) return 13859.38 + (v - 375000) * 0.0425;
  return 28734.38 + (v - 725000) * 0.045;
}
function calcNT(v: number): number {
  if (v <= 525000) return v * 0.0465;
  if (v <= 3000000) return 24412.5 + (v - 525000) * 0.0565;
  return 164400 + (v - 3000000) * 0.0595;
}
function calcACT(v: number): number {
  if (v <= 200000) return (v / 100) * 0.7;
  if (v <= 300000) return 1400 + ((v - 200000) / 100) * 2.2;
  if (v <= 500000) return 3600 + ((v - 300000) / 100) * 3.4;
  if (v <= 750000) return 10400 + ((v - 500000) / 100) * 4.32;
  if (v <= 1000000) return 21200 + ((v - 750000) / 100) * 5.9;
  if (v <= 1455000) return 35950 + ((v - 1000000) / 100) * 6.4;
  return 65070 + ((v - 1455000) / 100) * 4.54;
}

const CALC: Record<AustralianState, (v: number) => number> = {
  NSW: calcNSW, VIC: calcVIC, QLD: calcQLD, WA: calcWA,
  SA: calcSA, TAS: calcTAS, NT: calcNT, ACT: calcACT,
};

function fhbConcession(value: number, state: AustralianState, category: PropertyCategory): number {
  switch (state) {
    case 'NSW':
      if (category === 'vacant_land') {
        if (value <= 350000) return calcNSW(value);
        if (value <= 450000) return calcNSW(value) * Math.max(0, (450000 - value) / 100000);
        return 0;
      }
      if (value <= 800000) return calcNSW(value);
      if (value <= 1000000) return calcNSW(value) * Math.max(0, (1000000 - value) / 200000);
      return 0;
    case 'VIC':
      if (value <= 600000) return calcVIC(value);
      if (value <= 750000) return calcVIC(value) * Math.max(0, (750000 - value) / 150000);
      return 0;
    case 'QLD':
      if (value <= 700000) return calcQLD(value);
      if (value <= 800000) return calcQLD(value) * Math.max(0, (800000 - value) / 100000);
      return 0;
    case 'WA':
      if (value <= 450000) return calcWA(value);
      if (value <= 600000) return calcWA(value) * Math.max(0, (600000 - value) / 150000);
      return 0;
    case 'SA':
      if (category === 'new' && value <= 650000) return calcSA(value);
      return 0;
    case 'TAS':
      if (value <= 600000) return calcTAS(value) * 0.5;
      return 0;
    case 'NT':
      return Math.min(10000, calcNT(value));
    case 'ACT':
      if (value <= 1000000) return calcACT(value);
      return 0;
  }
}

function foreignSurcharge(value: number, state: AustralianState): number {
  switch (state) {
    case 'NSW': return value * 0.09;
    case 'VIC': return value * 0.08;
    case 'QLD': return value * 0.08;
    case 'WA':  return value * 0.07;
    case 'SA':  return value * 0.07;
    case 'TAS': return value * 0.08;
    case 'NT':  return 0;
    case 'ACT': return 0;
  }
}

export function calculateStampDuty(input: StampDutyInput): StampDutyBreakdown {
  const value = Math.max(0, input.propertyValue || 0);
  const state = input.state;
  const intent = input.intent;
  const category = input.category || 'established';
  const isFhb = !!input.isFirstHomeBuyer && intent === 'owner_occupier';
  const isForeign = !!input.isForeignBuyer;

  if (value <= 0 || !CALC[state]) {
    return { baseDuty: 0, fhbConcession: 0, foreignSurcharge: 0, investorSurcharge: 0, totalDuty: 0, effectiveRate: 0, notes: ['Invalid input'], state };
  }

  const baseDuty = Math.round(CALC[state](value));
  const fhbSaving = isFhb ? Math.round(fhbConcession(value, state, category)) : 0;
  const foreign = isForeign ? Math.round(foreignSurcharge(value, state)) : 0;
  const investor = 0;
  const totalDuty = Math.max(0, baseDuty - fhbSaving + foreign + investor);
  const effectiveRate = value > 0 ? (totalDuty / value) * 100 : 0;

  const notes: string[] = [];
  if (fhbSaving > 0) notes.push(`FHB concession: −$${fhbSaving.toLocaleString()} (${state} ${category})`);
  if (foreign > 0) notes.push(`Foreign buyer surcharge: +$${foreign.toLocaleString()}`);
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

export function estimateOtherAcquisitionCosts(propertyValue: number): {
  conveyancing: number; buildingInspection: number; pestInspection: number;
  loanApplicationFee: number; registrationFees: number; total: number;
} {
  const conveyancing = 1800;
  const buildingInspection = 600;
  const pestInspection = 350;
  const loanApplicationFee = 600;
  const registrationFees = Math.min(450, Math.max(180, Math.round(propertyValue / 5000)));
  const total = conveyancing + buildingInspection + pestInspection + loanApplicationFee + registrationFees;
  return { conveyancing, buildingInspection, pestInspection, loanApplicationFee, registrationFees, total };
}
