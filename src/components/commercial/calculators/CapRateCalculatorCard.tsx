import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { calculateYields, calculateCapRateEngine } from '@/utils/commercial';
import { useCalculatorPrefill, type CalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useCommercialDealState } from '@/utils/commercial/commercialDealState';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const PENDING = 'Pending';
const num = (v: string) => (v === '' ? 0 : Number(v));
const hasPositiveNumber = (v: string) => Number.isFinite(Number(v)) && Number(v) > 0;
const pct = (n: number) => `${Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '0'}%`;
const displayPct = (n: number, ready: boolean) => ready && Number.isFinite(n) ? pct(n) : PENDING;
const displayMoney = (n: number, ready: boolean) => ready && Number.isFinite(n) && n !== 0 ? fmt(n) : PENDING;

type FieldSource = 'Blank' | 'Scraped' | 'NOI Tab' | 'Property Profile' | 'AI Benchmark' | 'Manual' | 'User Override' | 'Verified';
type CapField = 'passingNoi' | 'marketNoi' | 'price' | 'targetCap';

interface CapRateAiEstimate {
  propertyId: string;
  dealId: string;
  estimateType: 'CAP_RATE_RANGE';
  summary: string;
  capRateRange: { low: number | null; mid: number | null; high: number | null };
  recommendedTargetCapRate: number | null;
  confidence: 'High' | 'Medium' | 'Low';
  supportingInputsUsed: string[];
  missingInputs: string[];
  reasoningSummary: string;
  warnings: string[];
  requiredDocuments: string[];
  requiresValuerConfirmation: boolean;
  estimatedFields: Array<{ field: string; currentValue: number | null; estimatedValue: number | null; unit: '%'; confidence: 'High' | 'Medium' | 'Low'; sourceStatusBefore: string; sourceStatusAfter: 'AI Estimate'; reasoningSummary: string; requiresSpecialistReview: boolean; requiredDocument: string; shouldOverwrite: boolean }>;
  recommendedNextAction: string;
}

interface SourceCandidate { value: number; source: FieldSource; sourceDetail: string }
interface PendingSource extends SourceCandidate { noticedAt: string }
interface FieldState { value: string; source: FieldSource; dirty: boolean; originalValue?: string; originalSource?: FieldSource; sourceDetail?: string; pendingSource?: PendingSource }
const field = (value: string, source: FieldSource = value ? 'Manual' : 'Blank', sourceDetail?: string): FieldState => ({ value, source, sourceDetail, dirty: false });
const sourceBadge = (source: FieldSource) => ({ Blank: 'Blank', Scraped: 'Scraped', 'NOI Tab': 'From NOI', 'Property Profile': 'From Property', 'AI Benchmark': 'AI Benchmark', Manual: 'Manual', 'User Override': 'Override', Verified: 'Verified' }[source]);

function firstNumber(...values: unknown[]) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function normaliseEstimate(raw: any, snapshot: any, sourceBefore: string): CapRateAiEstimate {
  const low = firstNumber(raw?.capRateRange?.low, raw?.capRateLowPct) ?? null;
  const mid = firstNumber(raw?.capRateRange?.mid, raw?.capRateMidPct) ?? null;
  const high = firstNumber(raw?.capRateRange?.high, raw?.capRateHighPct) ?? null;
  const rec = firstNumber(raw?.recommendedTargetCapRate, raw?.targetCapRatePct, mid) ?? null;
  const confidence = String(raw?.confidence ?? 'Low').toLowerCase();
  const confidenceTitle = confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low';
  const missingInputs = raw?.missingInputs ?? snapshot.missingInputs ?? [];
  const warnings = [...(raw?.warnings ?? []), ...(missingInputs.length ? ['AI cap rate estimate accuracy is limited because key property details are missing.'] : [])];
  return {
    propertyId: snapshot.propertyId ?? '',
    dealId: snapshot.dealId ?? snapshot.propertyId ?? '',
    estimateType: 'CAP_RATE_RANGE',
    summary: raw?.summary ?? raw?.evidenceBasis ?? 'Property-specific cap-rate benchmark estimate.',
    capRateRange: { low, mid, high },
    recommendedTargetCapRate: rec,
    confidence: confidenceTitle,
    supportingInputsUsed: raw?.supportingInputsUsed ?? snapshot.supportingInputsUsed ?? [],
    missingInputs,
    reasoningSummary: raw?.reasoningSummary ?? raw?.reasoning ?? 'Estimate generated from supplied property, NOI, value, lease and asset-quality context.',
    warnings,
    requiredDocuments: raw?.requiredDocuments ?? ['Independent valuation or valuer confirmation'],
    requiresValuerConfirmation: true,
    estimatedFields: [{ field: 'targetCapRatePct', currentValue: snapshot.current?.targetCapRatePct ?? null, estimatedValue: rec, unit: '%', confidence: confidenceTitle, sourceStatusBefore: sourceBefore, sourceStatusAfter: 'AI Estimate', reasoningSummary: raw?.reasoningSummary ?? raw?.reasoning ?? '', requiresSpecialistReview: confidenceTitle === 'Low', requiredDocument: 'Independent valuation or valuer confirmation', shouldOverwrite: false }],
    recommendedNextAction: raw?.recommendedNextAction ?? 'Review the benchmark estimate, then accept a selected cap rate or keep the current manual value.',
  };
}

export function CapRateCalculatorCard() {
  const { prefill, property } = useCalculatorPrefill();
  const { profile, updateGlobal, setSourceMode, appendAiAudit } = useCommercialDealState();
  const [fields, setFields] = useState<Record<CapField, FieldState>>({ passingNoi: field(''), marketNoi: field(''), price: field(''), targetCap: field('') });
  const [estimating, setEstimating] = useState(false);
  const [aiEstimate, setAiEstimate] = useState<CapRateAiEstimate | null>(null);
  const [proposedCap, setProposedCap] = useState('');
  const [showBenchmark, setShowBenchmark] = useState(false);

  const audit = (action: string, fieldName: string, previousValue: unknown, newValue: unknown, source: string) => appendAiAudit({ action, fieldKey: fieldName, previousValue, newValue, source, timestamp: new Date().toISOString(), user: 'current-user', propertyId: prefill?.propertyId, dealId: prefill?.propertyId } as any);

  const resolveCascade = (p: CalculatorPrefill): Record<CapField, SourceCandidate | undefined> => {
    const rawProperty = (property ?? {}) as Record<string, any>;
    const actualNoi = firstNumber((profile.noiOutputs as any)?.actualNoi, (profile.noiOutputs as any)?.noi);
    const stabilisedNoi = firstNumber((profile.noiOutputs as any)?.stabilisedNoi);
    const lenderAdjustedNoi = profile.leaseIncome?.noiBasis === 'lenderAdjusted' ? firstNumber((profile.noiOutputs as any)?.lenderAdjustedNoi) : undefined;
    const profilePassingNoi = firstNumber(p.passingNoi);
    const scrapedPassingNoi = firstNumber(rawProperty.scraped_passing_noi, rawProperty.extracted_passing_noi_pa, rawProperty.extractedPassingNoiPa, rawProperty.passing_noi_pa, rawProperty.noi, p.grossPassingRentPa);
    const profileMarketNoi = firstNumber(p.marketNoi, (profile.leaseIncome as any)?.marketRent);
    const scrapedMarketNoi = firstNumber(rawProperty.scraped_market_noi, rawProperty.extracted_market_noi_pa, rawProperty.extractedMarketNoiPa, rawProperty.market_noi_pa, rawProperty.market_rent_pa, p.marketRentPa);
    const purchasePrice = firstNumber(p.purchasePrice, profile.propertyValuation.purchasePrice);
    const estimatedValue = firstNumber(p.valuation, profile.propertyValuation.estimatedMarketValue);
    const bankValue = firstNumber(profile.propertyValuation.bankValuation, rawProperty.bank_valuation, rawProperty.bankValuation);
    const scrapedPrice = firstNumber(rawProperty.scraped_asking_price, rawProperty.asking_price, rawProperty.guide_price, rawProperty.price_guide, rawProperty.extracted_price, rawProperty.extractedAskingPrice);
    const acceptedAiCap = fields.targetCap.source === 'AI Benchmark' ? firstNumber(fields.targetCap.value) : undefined;
    const savedBenchmark = firstNumber((profile.capRateOutputs as any)?.targetCapRatePct, (profile.capRateOutputs as any)?.capitalisationRate, profile.propertyValuation.estimatedCapRate, rawProperty.benchmark_cap_rate, rawProperty.cap_rate);

    const pick = (...items: Array<SourceCandidate | undefined>) => items.find(item => item && item.value > 0);
    return {
      passingNoi: pick(actualNoi ? { value: actualNoi, source: 'NOI Tab', sourceDetail: 'NOI tab Actual NOI' } : undefined, profilePassingNoi ? { value: profilePassingNoi, source: 'Property Profile', sourceDetail: 'Property profile Passing NOI' } : undefined, scrapedPassingNoi ? { value: scrapedPassingNoi, source: 'Scraped', sourceDetail: 'Scraped rental / income data' } : undefined),
      marketNoi: pick(stabilisedNoi ? { value: stabilisedNoi, source: 'NOI Tab', sourceDetail: 'NOI tab Stabilised NOI' } : undefined, lenderAdjustedNoi ? { value: lenderAdjustedNoi, source: 'NOI Tab', sourceDetail: 'NOI tab Lender-Adjusted NOI' } : undefined, profileMarketNoi ? { value: profileMarketNoi, source: 'Property Profile', sourceDetail: 'Property profile market rent / stabilised NOI' } : undefined, scrapedMarketNoi ? { value: scrapedMarketNoi, source: 'Scraped', sourceDetail: 'Scraped market rental / income data' } : undefined),
      price: pick(purchasePrice ? { value: purchasePrice, source: 'Property Profile', sourceDetail: 'Property profile purchase price' } : undefined, estimatedValue ? { value: estimatedValue, source: 'Property Profile', sourceDetail: 'Estimated market value' } : undefined, bankValue ? { value: bankValue, source: 'Property Profile', sourceDetail: 'Bank valuation' } : undefined, scrapedPrice ? { value: scrapedPrice, source: 'Scraped', sourceDetail: 'Scraped asking price / guide price' } : undefined),
      targetCap: pick(acceptedAiCap ? { value: acceptedAiCap, source: 'AI Benchmark', sourceDetail: 'Accepted AI benchmark cap rate' } : undefined, savedBenchmark ? { value: savedBenchmark, source: savedBenchmark === (profile.capRateOutputs as any)?.targetCapRatePct ? 'AI Benchmark' : 'Property Profile', sourceDetail: 'Saved property benchmark cap rate' } : undefined),
    };
  };

  const applyCascade = (p: CalculatorPrefill, explicit = false) => {
    const candidates = resolveCascade(p);
    setFields(current => {
      const next = { ...current };
      (Object.keys(candidates) as CapField[]).forEach(k => {
        const candidate = candidates[k];
        if (!candidate) return;
        const candidateValue = String(candidate.value);
        const existing = current[k];
        if (existing.source === 'User Override' && !explicit) {
          if (existing.value !== candidateValue) next[k] = { ...existing, pendingSource: { ...candidate, noticedAt: new Date().toISOString() } };
          return;
        }
        if (existing.source === 'Verified' && !explicit) return;
        if (!existing.dirty || existing.source === 'Blank' || explicit) next[k] = { value: candidateValue, source: candidate.source, sourceDetail: candidate.sourceDetail, dirty: false, originalValue: existing.originalValue, originalSource: existing.originalSource };
      });
      return next;
    });
    audit('cap rate editable data cascade applied', 'capRate', null, candidates, 'Global Input Sync');
  };

  useEffect(() => {
    if (prefill) applyCascade(prefill, false);
    else setFields(current => Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v.source === 'User Override' ? v : field('')])) as Record<CapField, FieldState>);
    setAiEstimate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.propertyId, profile.noiOutputs, profile.propertyValuation, profile.capRateOutputs, property]);

  const setManual = (key: CapField, value: string) => setFields(prev => {
    const previous = prev[key];
    const nextSource: FieldSource = previous.source === 'Blank' || previous.source === 'Manual' ? 'Manual' : 'User Override';
    audit('manual cap rate/yield field edit', key, { value: previous.value, source: previous.source }, { value, source: nextSource, originalValue: previous.originalValue ?? previous.value, originalSource: previous.originalSource ?? previous.source }, nextSource);
    return { ...prev, [key]: { ...previous, value, source: nextSource, dirty: true, originalValue: previous.originalValue ?? previous.value, originalSource: previous.originalSource ?? previous.source, pendingSource: undefined } };
  });

  const useSourceValue = (key: CapField) => setFields(prev => {
    const pending = prev[key].pendingSource;
    if (!pending) return prev;
    audit('cap rate source value accepted over override', key, { value: prev[key].value, source: prev[key].source }, pending, pending.source);
    return { ...prev, [key]: { value: String(pending.value), source: pending.source, sourceDetail: pending.sourceDetail, dirty: false, originalValue: prev[key].originalValue, originalSource: prev[key].originalSource } };
  });

  const keepOverride = (key: CapField) => setFields(prev => {
    const pending = prev[key].pendingSource;
    if (pending) audit('cap rate source value declined; override kept', key, pending, { value: prev[key].value, source: prev[key].source }, 'User Override');
    return { ...prev, [key]: { ...prev[key], pendingSource: undefined } };
  });

  const passingNoi = fields.passingNoi.value, marketNoi = fields.marketNoi.value, price = fields.price.value, targetCap = fields.targetCap.value;
  const hasPassingNoi = hasPositiveNumber(passingNoi);
  const hasMarketNoi = hasPositiveNumber(marketNoi);
  const hasPrice = hasPositiveNumber(price);
  const hasTargetCap = hasPositiveNumber(targetCap);
  const hasSelectedNoi = hasPassingNoi || hasMarketNoi;
  const hasYieldInputs = hasPrice && hasSelectedNoi;
  const hasImpliedValueInputs = hasSelectedNoi && hasTargetCap;
  const hasValuationGapInputs = hasImpliedValueInputs && hasPrice;
  const canEstimateCapRate = Boolean(prefill && prefill.address && prefill.state && prefill.assetSubtype && hasPrice && hasSelectedNoi);
  const sensitivityRates = useMemo(() => {
    const target = num(targetCap);
    return target > 0 ? [target - 1, target - 0.5, target, target + 0.5, target + 1].filter(r => r > 0).map(r => Number(r.toFixed(2))) : [5.5, 6, 6.5, 7, 7.5];
  }, [targetCap]);
  const yields = useMemo(() => calculateYields({ passingNoi: num(passingNoi), marketNoi: num(marketNoi), price: num(price) }), [passingNoi, marketNoi, price]);
  const capAssessment = useMemo(() => calculateCapRateEngine({ passingNoi: num(passingNoi), marketNoi: num(marketNoi), selectedNoi: num(marketNoi) || num(passingNoi), price: num(price), targetCapRatePct: num(targetCap), sensitivityCapRatesPct: sensitivityRates, aiBenchmark: fields.targetCap.source === 'AI Benchmark' }), [passingNoi, marketNoi, price, targetCap, sensitivityRates, fields.targetCap.source]);
  const reversionarySpread = Number((yields.reversionaryYield - yields.passingYield).toFixed(2));

  const warnings = useMemo(() => {
    const list = [...capAssessment.warnings];
    if (!prefill) list.push('Property record not linked.');
    if (prefill && (!prefill.address || !prefill.assetSubtype || !prefill.state)) list.push('Selected property missing key details.');
    if (!num(passingNoi)) list.push('Passing NOI is missing.');
    if (!num(marketNoi)) list.push('Market NOI is missing.');
    if (!num(price)) list.push('Price/value is missing.');
    if (!num(targetCap)) list.push('Target cap rate is missing.');
    if (num(marketNoi) && num(passingNoi) && num(marketNoi) < num(passingNoi)) list.push('Market NOI is lower than passing NOI.');
    if (Math.abs(reversionarySpread) > 2) list.push('Reversion spread is unusually high.');
    if (num(price) && capAssessment.impliedValue > num(price) * 1.15) list.push('Implied value materially exceeds purchase price/value.');
    if (fields.targetCap.source === 'AI Benchmark') list.push('AI benchmark requires valuer confirmation.');
    return Array.from(new Set(list));
  }, [capAssessment, fields.targetCap.source, marketNoi, passingNoi, prefill, price, reversionarySpread, targetCap]);

  const buildSnapshot = () => {
    const missingInputs = ['address', 'assetSubtype', 'state', 'glaSqm', 'siteAreaSqm', 'walesYears', 'passingNoi', 'marketNoi', 'price'].filter(k => !({ ...prefill, price: num(price), passingNoi: num(passingNoi), marketNoi: num(marketNoi) } as any)?.[k]);
    const supportingInputsUsed = Object.entries({ address: prefill?.address, state: prefill?.state, assetSubtype: prefill?.assetSubtype, glaSqm: prefill?.glaSqm, siteAreaSqm: prefill?.siteAreaSqm, hardstandSqm: prefill?.hardstandSqm, walesYears: prefill?.walesYears, passingNoi: num(passingNoi), marketNoi: num(marketNoi), price: num(price) }).filter(([, v]) => v != null && v !== '' && v !== 0).map(([k]) => k);
    return { propertyId: prefill?.propertyId, dealId: prefill?.propertyId, address: prefill?.address, state: prefill?.state, propertyType: prefill?.assetCategory, assetSubtype: prefill?.assetSubtype, glaSqm: prefill?.glaSqm, siteAreaSqm: prefill?.siteAreaSqm, siteCoverPct: prefill?.siteCoverPct, hardstandSqm: prefill?.hardstandSqm, tenant: (property as any)?.tenant, tenantQuality: (property as any)?.tenant_quality, leaseStatus: (property as any)?.lease_status, leaseType: profile.leaseIncome.leaseType, wale: prefill?.walesYears ?? (property as any)?.wale, leaseExpiry: (property as any)?.lease_expiry, currentRent: prefill?.grossPassingRentPa, marketRent: prefill?.marketRentPa, passingNoi: num(passingNoi), marketNoi: num(marketNoi), actualNoi: (profile.noiOutputs as any)?.actualNoi, stabilisedNoi: (profile.noiOutputs as any)?.stabilisedNoi, lenderAdjustedNoi: (profile.noiOutputs as any)?.lenderAdjustedNoi, vacancyAllowance: profile.leaseIncome.vacancyAllowancePct, outgoingsRecovery: prefill?.recoveredOutgoingsPa, currentPriceValue: num(price), purchasePrice: prefill?.purchasePrice, ownershipEntity: (property as any)?.ownership_entity, current: { passingNoi: num(passingNoi), marketNoi: num(marketNoi), price: num(price), targetCapRatePct: num(targetCap), statuses: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.source])) }, riskWarnings: warnings, supportingInputsUsed, missingInputs };
  };

  const requestEstimate = async () => {
    if (!prefill) { toast.error('Select a property in the Overview tab to anchor the AI cap-rate estimate.'); return; }
    if (!canEstimateCapRate) { toast.error('Add property details, NOI and price/value before estimating a cap-rate range.'); return; }
    setEstimating(true); audit('AI cap rate estimate requested', 'targetCapRatePct', num(targetCap), null, 'AI Estimate');
    try {
      const snapshot = buildSnapshot();
      const { data, error } = await invokeSecureFunction<{ success: boolean; estimate?: any; error?: string }>('estimate-commercial-caprate', { snapshot });
      if (error || !data?.success || !data.estimate) { toast.error(data?.error || error?.message || 'Failed to generate cap-rate estimate'); return; }
      const estimate = normaliseEstimate(data.estimate, snapshot, fields.targetCap.source);
      setAiEstimate(estimate); setProposedCap(String(estimate.recommendedTargetCapRate ?? ''));
      setSourceMode('capRate', 'aiPending'); audit('AI cap rate estimate generated', 'targetCapRatePct', num(targetCap), estimate.recommendedTargetCapRate, 'AI Estimate');
      toast.success(`AI cap-rate range ready (${estimate.confidence} confidence).`);
    } catch (err: any) { toast.error(err?.message || 'AI estimate failed'); } finally { setEstimating(false); }
  };

  const acceptEstimate = (value?: number | null) => {
    if (!canEstimateCapRate) { toast.error('Add property details, NOI and price/value before accepting an AI benchmark.'); return; }
    const accepted = value ?? num(proposedCap);
    if (!accepted) { toast.error('Enter a cap rate to apply.'); return; }
    setFields(prev => ({ ...prev, targetCap: { value: String(accepted), source: 'AI Benchmark', sourceDetail: 'Accepted AI benchmark cap rate', dirty: true, originalValue: prev.targetCap.originalValue ?? prev.targetCap.value, originalSource: prev.targetCap.originalSource ?? prev.targetCap.source } }));
    updateGlobal('capRateOutputs', { ...capAssessment, impliedValue: (num(marketNoi) || num(passingNoi)) / (accepted / 100), benchmarkLabel: 'Benchmark only — valuer confirmation required.' } as any);
    updateGlobal('assumptions', { 'capRate.targetCapRatePct': { fieldKey: 'capRate.targetCapRatePct', label: 'Target Cap Rate %', confidenceTag: 'AI Estimate', source: 'ai', sourceDetail: aiEstimate?.reasoningSummary, verificationRequired: true, requiredDocuments: aiEstimate?.requiredDocuments, updatedAt: new Date().toISOString() } } as any);
    audit('AI cap rate estimate accepted', 'targetCapRatePct', targetCap, accepted, 'AI Estimate');
    toast.success('AI benchmark cap rate applied. Valuer confirmation still required.');
  };
  const rejectEstimate = () => { audit('AI cap rate estimate rejected', 'targetCapRatePct', aiEstimate?.recommendedTargetCapRate, targetCap, 'AI Estimate'); setAiEstimate(null); toast.info('AI cap-rate estimate rejected; current value kept.'); };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cap Rate & Yield</CardTitle>
        <CardDescription>Passing, reversionary and Blended Yield / Simple Average Yield. Benchmark only — valuer confirmation required.</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2 items-center">
          <Button size="sm" variant="outline" className="border-primary/40 text-primary" onClick={() => prefill && applyCascade(prefill, true)} disabled={!prefill}>Global Input Sync: On</Button>
          <Button size="sm" variant="secondary" onClick={() => setShowBenchmark(v => !v)}>AI Estimate benchmark only</Button>
          {prefill ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 max-w-[260px] truncate" title={prefill.address}>Anchored: {prefill.address}</Badge> : <Badge variant="outline" className="border-amber-500/40 text-amber-400">No property selected</Badge>}
          <Button size="sm" variant="outline" onClick={requestEstimate} disabled={estimating || !canEstimateCapRate}>{estimating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}Estimate cap rate range</Button>
          <SaveBackButton build={() => { audit('cap rate outputs saved back to property', 'capRate', null, capAssessment, 'Save back to property'); updateGlobal('capRateOutputs', { ...capAssessment, reversionSpread: reversionarySpread, targetCapRatePct: num(targetCap), assumptionStatuses: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.source])) } as any); const capRateNote = `Cap rate outputs saved ${new Date().toISOString()}: ${JSON.stringify({ passingNoi: num(passingNoi), marketNoi: num(marketNoi), price: num(price), targetCapRatePct: num(targetCap), passingYield: yields.passingYield, reversionaryYield: yields.reversionaryYield, blendedYield: yields.blendedYield, reversionSpread: reversionarySpread, impliedValue: capAssessment.impliedValue, valuationGap: capAssessment.valuationGap, valueSensitivity: capAssessment.valueSensitivity, assumptionStatuses: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.source])) })}`;
            return prefill?.domain === 'industrial' ? { purchase_price: hasPrice ? num(price) : undefined, current_valuation: capAssessment.impliedValue || undefined, notes: capRateNote } : { purchase_price: hasPrice ? num(price) : undefined, valuation: capAssessment.impliedValue || undefined, notes: capRateNote }; }} />
        </div>
        {showBenchmark && <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-100">AI cap-rate outputs are benchmark-only estimates. They do not replace an independent valuation and remain tagged as Valuer Confirmation Required until verified.</div>}
        {aiEstimate && <div className="mt-2 rounded border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-2"><div><span className="font-medium text-primary">AI cap-rate range ({aiEstimate.confidence}):</span> {pct(aiEstimate.capRateRange.low ?? 0)} – {pct(aiEstimate.capRateRange.high ?? 0)} · recommended <span className="font-semibold text-primary">{pct(aiEstimate.recommendedTargetCapRate ?? 0)}</span></div><div>{aiEstimate.reasoningSummary}</div><div>Supporting inputs: {aiEstimate.supportingInputsUsed.join(', ') || 'None supplied'}.</div><div>Missing inputs: {aiEstimate.missingInputs.join(', ') || 'None flagged'}.</div>{aiEstimate.warnings.map(w => <div key={w} className="text-amber-200">{w}</div>)}<div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end"><Button size="sm" variant="outline" disabled={!canEstimateCapRate} onClick={() => acceptEstimate(aiEstimate.capRateRange.low)}>Accept low</Button><Button size="sm" variant="outline" disabled={!canEstimateCapRate} onClick={() => acceptEstimate(aiEstimate.capRateRange.mid)}>Accept mid</Button><Button size="sm" variant="outline" disabled={!canEstimateCapRate} onClick={() => acceptEstimate(aiEstimate.capRateRange.high)}>Accept high</Button><div><Label>Edit proposed %</Label><Input type="number" step="0.05" value={proposedCap} onChange={e => setProposedCap(e.target.value)} /></div><Button size="sm" disabled={!canEstimateCapRate} onClick={() => acceptEstimate()}>Apply</Button><Button size="sm" variant="secondary" onClick={rejectEstimate}>Reject / keep current</Button></div></div>}
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <InputBlock label="Passing NOI (PA)" state={fields.passingNoi} onChange={v => setManual('passingNoi', v)} onKeepOverride={() => keepOverride('passingNoi')} onUseSource={() => useSourceValue('passingNoi')} placeholder="Pulled from NOI tab or enter manually" />
          <InputBlock label="Market NOI (PA)" state={fields.marketNoi} onChange={v => setManual('marketNoi', v)} onKeepOverride={() => keepOverride('marketNoi')} onUseSource={() => useSourceValue('marketNoi')} placeholder="Pulled from stabilised NOI or enter manually" />
          <InputBlock label="Price / Value" state={fields.price} onChange={v => setManual('price', v)} onKeepOverride={() => keepOverride('price')} onUseSource={() => useSourceValue('price')} placeholder="Pulled from property profile or enter manually" />
          <Separator />
          <InputBlock label="Target Cap Rate %" state={fields.targetCap} onChange={v => setManual('targetCap', v)} onKeepOverride={() => keepOverride('targetCap')} onUseSource={() => useSourceValue('targetCap')} step="0.1" placeholder="Enter target cap rate or estimate benchmark" />
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          {!hasYieldInputs && !hasImpliedValueInputs && <div className="rounded border border-amber-500/20 bg-amber-500/10 p-3 text-sm"><div className="font-medium text-amber-100">Awaiting cap rate inputs</div><p className="mt-1 text-xs text-amber-100/80">Link a property or enter NOI, value and target cap rate to calculate yield and implied value.</p></div>}
          <Row label="Passing Yield" value={displayPct(yields.passingYield, hasPassingNoi && hasPrice)} />
          <Row label="Reversionary Yield" value={displayPct(yields.reversionaryYield, hasMarketNoi && hasPrice)} />
          <Row label="Blended Yield / Simple Average Yield" value={displayPct(yields.blendedYield, hasPassingNoi && hasMarketNoi && hasPrice)} bold />
          <Row label="Reversion Spread" value={displayPct(reversionarySpread, hasPassingNoi && hasMarketNoi && hasPrice)} muted />
          <Separator />
          <Row label={hasTargetCap ? `Implied Value @ ${targetCap}%` : 'Implied Value'} value={displayMoney(capAssessment.impliedValue, hasImpliedValueInputs)} highlight />
          <Row label="Valuation Gap" value={displayMoney(capAssessment.valuationGap, hasValuationGapInputs)} />
          <Separator />
          <div className="text-xs text-muted-foreground space-y-1"><div className="font-medium text-foreground">Value Sensitivity</div>{hasImpliedValueInputs ? capAssessment.valueSensitivity.map(row => <div key={row.capRatePct} className="flex justify-between"><span>{pct(row.capRatePct)}</span><span>{displayMoney(row.impliedValue, true)}</span></div>) : <div className="flex justify-between"><span>Cap-rate sensitivity</span><span>{PENDING}</span></div>}</div>
          {warnings.map(w => <p key={w} className="text-xs text-amber-200">{w}</p>)}
          <p className="text-xs text-amber-200">Benchmark only — valuer confirmation required.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InputBlock({ label, state, onChange, onKeepOverride, onUseSource, step, placeholder }: { label: string; state: FieldState; onChange: (v: string) => void; onKeepOverride: () => void; onUseSource: () => void; step?: string; placeholder?: string }) {
  return <div className="space-y-1"><div className="flex items-center justify-between gap-2"><Label>{label}</Label><Badge variant="outline" className="text-[10px]" title={state.sourceDetail}>{sourceBadge(state.source)}</Badge></div><Input type="number" step={step} value={state.value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />{state.pendingSource && <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-100 space-y-2"><p>New source value available. This field currently uses a saved override.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={onKeepOverride}>Keep override</Button><Button type="button" size="sm" variant="outline" onClick={onUseSource}>Use source value</Button></div></div>}</div>;
}

function Row({ label, value, bold, muted, highlight }: { label: string; value: string; bold?: boolean; muted?: boolean; highlight?: boolean }) {
  return <div className={`flex justify-between items-center ${highlight ? 'text-lg font-bold text-primary' : bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground text-sm' : ''}`}><span>{label}</span><span>{value}</span></div>;
}
