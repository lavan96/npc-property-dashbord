export type CapRateNoiBasis = 'passing' | 'market' | 'actual' | 'stabilised' | 'lenderAdjusted';
export interface CapRateEngineInputs { passingNoi: number; marketNoi: number; selectedNoi: number; price: number; targetCapRatePct: number; sensitivityCapRatesPct?: number[]; benchmarkLowPct?: number; benchmarkHighPct?: number; aiBenchmark?: boolean; }
export interface CapRateEngineResult { passingYield: number; reversionaryYield: number; blendedYield: number; simpleAverageYield: number; impliedValue: number; valuationGap: number; valueSensitivity: Array<{ capRatePct: number; impliedValue: number }>; warnings: string[]; benchmarkLabel?: string; }
const round2 = (n: number) => Number(n.toFixed(2));
export function calculateCapRateEngine(i: CapRateEngineInputs): CapRateEngineResult {
  const warnings: string[] = [];
  const y = (noi: number) => i.price > 0 ? round2((noi / i.price) * 100) : 0;
  if (i.price <= 0) warnings.push('Purchase price must be greater than zero.');
  if (i.targetCapRatePct <= 0) warnings.push('Capitalisation rate is zero; implied value not calculated.');
  if (i.aiBenchmark) warnings.push('AI cap-rate estimate is benchmark only — valuer confirmation required.');
  const impliedValue = i.targetCapRatePct > 0 ? i.selectedNoi / (i.targetCapRatePct / 100) : 0;
  const valuationGap = impliedValue - i.price;
  if (impliedValue > 0 && Math.abs(valuationGap) / impliedValue > 0.1) warnings.push('Purchase price/value differs materially from implied value; valuation risk exists.');
  const passingYield = y(i.passingNoi);
  const reversionaryYield = y(i.marketNoi);
  const blendedYield = round2((passingYield + reversionaryYield) / 2);
  return {
    passingYield,
    reversionaryYield,
    blendedYield,
    simpleAverageYield: blendedYield,
    impliedValue,
    valuationGap,
    valueSensitivity: (i.sensitivityCapRatesPct ?? []).map(capRatePct => ({ capRatePct, impliedValue: capRatePct > 0 ? i.selectedNoi / (capRatePct / 100) : 0 })),
    warnings,
    benchmarkLabel: i.aiBenchmark || i.benchmarkLowPct || i.benchmarkHighPct ? 'Benchmark only — valuer confirmation required.' : undefined,
  };
}
