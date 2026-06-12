/**
 * Cap Rate / Yield Calculators
 *  - Passing Yield = NOI based on CURRENT (passing) rent / Price
 *  - Reversionary Yield = NOI based on MARKET rent / Price
 *  - Blended Yield / Simple Average Yield approximation = weighted average using over/under-rented adjustment
 */

export interface CapRateInputs {
  noi: number;
  price: number;
}

export function capRate({ noi, price }: CapRateInputs): number {
  if (!price || price <= 0) return 0;
  return Number(((noi / price) * 100).toFixed(2));
}

export interface YieldSetInputs {
  passingNoi: number;
  marketNoi: number;
  price: number;
}

export interface YieldSetResult {
  passingYield: number;
  reversionaryYield: number;
  equivalentYield: number;
  blendedYield: number;
  simpleAverageYield: number;
}

export function calculateYields({ passingNoi, marketNoi, price }: YieldSetInputs): YieldSetResult {
  const passing = capRate({ noi: passingNoi, price });
  const reversionary = capRate({ noi: marketNoi, price });
  // Simple equivalent yield: arithmetic mean of passing & reversionary
  // (Full equivalent yield is IRR of rent reversions — done in DCF engine)
  const equivalent = Number(((passing + reversionary) / 2).toFixed(2));
  return { passingYield: passing, reversionaryYield: reversionary, equivalentYield: equivalent, blendedYield: equivalent, simpleAverageYield: equivalent };
}

/** Value derived from a NOI and target cap rate (cap rate as %) */
export function valueFromCap(noi: number, capPct: number): number {
  if (!capPct || capPct <= 0) return 0;
  return noi / (capPct / 100);
}
