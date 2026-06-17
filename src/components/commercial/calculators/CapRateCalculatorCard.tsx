import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { calculateYields, calculateCapRateEngine, parseCapRateNumber } from '@/utils/commercial';
import { useCalculatorPrefill, type CalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useCommercialDealState } from '@/utils/commercial/commercialDealState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const PENDING = 'Pending';
const num = (v: string) => parseCapRateNumber(v);
const positiveNum = (v: string) => { const n = parseCapRateNumber(v); return n !== null && n > 0 ? n : null; };
const hasPositiveNumber = (v: string) => positiveNum(v) !== null;
const pct = (n: number | null) => n !== null && Number.isFinite(n) ? `${n.toFixed(2).replace(/\.00$/, '')}%` : PENDING;
const pctRatio = (n: number | null) => n !== null && Number.isFinite(n) ? `${(n * 100).toFixed(2).replace(/\.00$/, '')}%` : PENDING;
const displayPct = (n: number | null, ready: boolean) => ready && n !== null && Number.isFinite(n) ? pct(n) : PENDING;
const displayMoney = (n: number | null, ready: boolean) => ready && n !== null && Number.isFinite(n) ? fmt(n) : PENDING;

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
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showSensitivity, setShowSensitivity] = useState(false);

  const audit = (action: string, fieldName: string, previousValue: unknown, newValue: unknown, source: string) => appendAiAudit({ action, fieldKey: fieldName, previousValue, newValue, source, timestamp: new Date().toISOString(), user: 'current-user', propertyId: prefill?.propertyId, dealId: prefill?.propertyId } as any);

  const resolveCascade = (p: CalculatorPrefill): Record<CapField, SourceCandidate | undefined> => {
    const rawProperty = (property ?? {}) as Record<string, any>;
    const actualNoi = firstNumber((profile.noiOutputs as any)?.actualNoi, (profile.noiOutputs as any)?.actualNOI, (profile.noiOutputs as any)?.noi);
    const stabilisedNoi = firstNumber((profile.noiOutputs as any)?.stabilisedNoi, (profile.noiOutputs as any)?.stabilisedNOI);
    const lenderAdjustedNoi = firstNumber((profile.noiOutputs as any)?.lenderAdjustedNoi, (profile.noiOutputs as any)?.lenderAdjustedNOI);
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
    const target = positiveNum(targetCap);
    return target > 0 ? [target - 1, target - 0.5, target, target + 0.5, target + 1].filter(r => r > 0).map(r => Number(r.toFixed(2))) : [5.5, 6, 6.5, 7, 7.5];
  }, [targetCap]);
  const yields = useMemo(() => calculateYields({ passingNoi, marketNoi, price }), [passingNoi, marketNoi, price]);
  const capAssessment = useMemo(() => calculateCapRateEngine({ passingNoi, marketNoi, selectedNoi: marketNoi || passingNoi, stabilisedNoi: (profile.noiOutputs as any)?.stabilisedNoi ?? (profile.noiOutputs as any)?.stabilisedNOI, lenderAdjustedNoi: (profile.noiOutputs as any)?.lenderAdjustedNoi ?? (profile.noiOutputs as any)?.lenderAdjustedNOI, price, targetCapRatePct: targetCap, valuationBasis: 'market', sensitivityCapRatesPct: sensitivityRates, aiBenchmark: fields.targetCap.source === 'AI Benchmark' }), [passingNoi, marketNoi, profile.noiOutputs, price, targetCap, sensitivityRates, fields.targetCap.source]);
  const reversionarySpread = yields.reversionaryYield !== null && yields.passingYield !== null ? Number((yields.reversionaryYield - yields.passingYield).toFixed(2)) : null;

  const warnings = useMemo(() => {
    const list = [...capAssessment.warnings];
    if (!prefill) list.push('Property record not linked.');
    if (prefill && (!prefill.address || !prefill.assetSubtype || !prefill.state)) list.push('Selected property missing key details.');
    if (num(passingNoi) === null) list.push('Passing NOI is missing.');
    if (num(marketNoi) === null) list.push('Market NOI is missing.');
    if (num(price) === null) list.push('Price/value is missing.');
    if (num(targetCap) === null) list.push('Target cap rate is missing.');
    if (num(marketNoi) !== null && num(passingNoi) !== null && num(marketNoi)! < num(passingNoi)!) list.push('Market NOI is lower than passing NOI.');
    if (reversionarySpread !== null && Math.abs(reversionarySpread) > 2) list.push('Reversion spread is unusually high.');
    if (num(price) !== null && capAssessment.impliedValue !== null && capAssessment.impliedValue > num(price)! * 1.15) list.push('Implied value materially exceeds purchase price/value.');
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
    const accepted = value ?? positiveNum(proposedCap);
    if (!accepted) { toast.error('Enter a cap rate to apply.'); return; }
    setFields(prev => ({ ...prev, targetCap: { value: String(accepted), source: 'AI Benchmark', sourceDetail: 'Accepted AI benchmark cap rate', dirty: true, originalValue: prev.targetCap.originalValue ?? prev.targetCap.value, originalSource: prev.targetCap.originalSource ?? prev.targetCap.source } }));
    updateGlobal('capRateOutputs', { ...capAssessment, impliedValue: ((positiveNum(marketNoi) ?? positiveNum(passingNoi)) ?? 0) / (accepted / 100), benchmarkLabel: 'Benchmark only — valuer confirmation required.' } as any);
    updateGlobal('assumptions', { 'capRate.targetCapRatePct': { fieldKey: 'capRate.targetCapRatePct', label: 'Target Cap Rate %', confidenceTag: 'AI Estimate', source: 'ai', sourceDetail: aiEstimate?.reasoningSummary, verificationRequired: true, requiredDocuments: aiEstimate?.requiredDocuments, updatedAt: new Date().toISOString() } } as any);
    audit('AI cap rate estimate accepted', 'targetCapRatePct', targetCap, accepted, 'AI Estimate');
    toast.success('AI benchmark cap rate applied. Valuer confirmation still required.');
  };
  const rejectEstimate = () => { audit('AI cap rate estimate rejected', 'targetCapRatePct', aiEstimate?.recommendedTargetCapRate, targetCap, 'AI Estimate'); setAiEstimate(null); toast.info('AI cap-rate estimate rejected; current value kept.'); };

  const benchmarkStatus = fields.targetCap.source === 'AI Benchmark'
    ? 'AI benchmark applied'
    : fields.targetCap.source === 'Verified'
      ? 'Market benchmark verified'
      : hasTargetCap
        ? fields.targetCap.source === 'Manual' || fields.targetCap.source === 'User Override'
          ? 'Manual benchmark'
          : 'Valuer confirmation required'
        : 'Benchmark pending';
  const sourceSummary = prefill ? `Linked property: ${prefill.address || prefill.propertyId || 'property record'}` : 'Manual entry / no property linked';
  const syncStatus = prefill ? 'Global input sync on' : 'Manual entry only';
  const assumptionStatus = fields.targetCap.source === 'Verified' ? 'Verified' : fields.targetCap.source === 'AI Benchmark' ? 'Valuer confirmation required' : hasTargetCap ? 'Manual / review' : 'Pending';
  const priorityWarnings = warnings.slice(0, 3);
  const hasSensitivity = capAssessment.selectedNoi !== null && capAssessment.valueSensitivity.length > 0;

  return (
    <Card className="border-primary/10 bg-background/95 shadow-xl">
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>Capitalisation Rate</CardTitle>
          <CardDescription>Yield, cap rate, implied value, valuation gap and benchmark sensitivity.</CardDescription>
        </div>

        <div className="rounded-lg border border-primary/15 bg-muted/30 p-3">
          <div className="grid gap-2 text-xs md:grid-cols-4">
            <StatusPill label="Calculator data source" value={sourceSummary} />
            <StatusPill label="Global input sync status" value={syncStatus} />
            <StatusPill label="Assumption status" value={assumptionStatus} />
            <div className="flex items-end md:justify-end">
              <SaveBackButton build={() => { audit('cap rate outputs saved back to property', 'capRate', null, capAssessment, 'Save back to property'); updateGlobal('capRateOutputs', { ...capAssessment, reversionSpread: reversionarySpread, targetCapRatePct: num(targetCap), assumptionStatuses: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.source])) } as any); const capRateNote = `Cap rate outputs saved ${new Date().toISOString()}: ${JSON.stringify({ passingNoi: num(passingNoi), marketNoi: num(marketNoi), price: num(price), targetCapRatePct: num(targetCap), passingYield: yields.passingYield, reversionaryYield: yields.reversionaryYield, blendedYield: yields.blendedYield, reversionSpread: reversionarySpread, impliedValue: capAssessment.impliedValue, valuationGap: capAssessment.valuationGap, valuationGapPct: capAssessment.valuationGapPct, valueSensitivity: capAssessment.valueSensitivity, assumptionStatuses: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.source])) })}`;
                return prefill?.domain === 'industrial' ? { purchase_price: hasPrice ? num(price) : undefined, current_valuation: capAssessment.impliedValue || undefined, notes: capRateNote } : { purchase_price: hasPrice ? num(price) : undefined, valuation: capAssessment.impliedValue || undefined, notes: capRateNote }; }} />
            </div>
          </div>
        </div>

        {aiEstimate && <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-2"><div><span className="font-medium text-primary">AI cap-rate range ({aiEstimate.confidence}):</span> {pct(aiEstimate.capRateRange.low ?? 0)} – {pct(aiEstimate.capRateRange.high ?? 0)} · recommended <span className="font-semibold text-primary">{pct(aiEstimate.recommendedTargetCapRate ?? 0)}</span></div><div>{aiEstimate.reasoningSummary}</div><div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end"><Button size="sm" variant="outline" disabled={!canEstimateCapRate} onClick={() => acceptEstimate(aiEstimate.capRateRange.low)}>Accept low</Button><Button size="sm" variant="outline" disabled={!canEstimateCapRate} onClick={() => acceptEstimate(aiEstimate.capRateRange.mid)}>Accept mid</Button><Button size="sm" variant="outline" disabled={!canEstimateCapRate} onClick={() => acceptEstimate(aiEstimate.capRateRange.high)}>Accept high</Button><div><Label>Edit proposed %</Label><Input type="number" step="0.05" value={proposedCap} onChange={e => setProposedCap(e.target.value)} /></div><Button size="sm" disabled={!canEstimateCapRate} onClick={() => acceptEstimate()}>Apply</Button><Button size="sm" variant="secondary" onClick={rejectEstimate}>Reject / keep current</Button></div></div>}
      </CardHeader>

      <CardContent className="space-y-5">
        <section className="rounded-xl border border-primary/10 bg-muted/20 p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Cap Rate Inputs</h3>
              <p className="text-xs text-muted-foreground">Review NOI, value and target yield assumptions used to calculate capitalisation rate and implied value.</p>
            </div>
            <Button size="sm" variant="outline" className="border-primary/40 text-primary" onClick={() => prefill && applyCascade(prefill, true)} disabled={!prefill}>Global Input Sync: On</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InputBlock label="Passing NOI" state={fields.passingNoi} onChange={v => setManual('passingNoi', v)} onKeepOverride={() => keepOverride('passingNoi')} onUseSource={() => useSourceValue('passingNoi')} placeholder="Pulled from NOI tab or enter manually" />
            <InputBlock label="Market / Stabilised NOI" state={fields.marketNoi} onChange={v => setManual('marketNoi', v)} onKeepOverride={() => keepOverride('marketNoi')} onUseSource={() => useSourceValue('marketNoi')} placeholder="Pulled from stabilised NOI or enter manually" />
            <InputBlock label="Price / Value" state={fields.price} onChange={v => setManual('price', v)} onKeepOverride={() => keepOverride('price')} onUseSource={() => useSourceValue('price')} placeholder="Pulled from property profile or enter manually" />
            <InputBlock label="Target Cap Rate %" state={fields.targetCap} onChange={v => setManual('targetCap', v)} onKeepOverride={() => keepOverride('targetCap')} onUseSource={() => useSourceValue('targetCap')} step="0.1" placeholder="Enter target cap rate" />
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-primary/10 bg-muted/20 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Yield Summary</h3>
            <div className="space-y-3">
              <MetricRow label="Passing Yield" value={displayPct(yields.passingYield, hasPassingNoi && hasPrice)} />
              <MetricRow label="Reversionary Yield" value={displayPct(yields.reversionaryYield, hasMarketNoi && hasPrice)} />
              <MetricRow label="Blended Yield / Simple Average Yield" value={displayPct(yields.blendedYield, hasPassingNoi && hasMarketNoi && hasPrice)} emphasis />
            </div>
          </section>

          <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Valuation Summary</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <HighlightMetric label="Implied Value" value={displayMoney(capAssessment.impliedValue, hasImpliedValueInputs)} />
              <MetricTile label="Current Price / Value" value={displayMoney(num(price), hasPrice)} />
              <HighlightMetric label="Valuation Gap" value={displayMoney(capAssessment.valuationGap, hasValuationGapInputs)} tone={capAssessment.valuationGap !== null && capAssessment.valuationGap < 0 ? 'negative' : 'primary'} />
              <MetricTile label="Valuation Gap %" value={hasValuationGapInputs ? pctRatio(capAssessment.valuationGapPct) : PENDING} />
            </div>
          </section>
        </div>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-primary/10 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Benchmark Status</h3>
                <p className="text-xs text-muted-foreground">{benchmarkStatus}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-primary/30 text-primary">{benchmarkStatus}</Badge>
                <Button size="sm" variant="outline" onClick={requestEstimate} disabled={estimating || !canEstimateCapRate}>{estimating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}Estimate cap rate range</Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Assumptions & Warnings</h3>
                <p className="text-xs text-muted-foreground">Showing top {priorityWarnings.length || 0} priority warnings.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setShowAssumptions(v => !v)}>Assumption Status</Button>
            </div>
            <div className="mt-3 space-y-1">
              {priorityWarnings.length ? priorityWarnings.map(w => <p key={w} className="text-xs text-amber-200">• {w}</p>) : <p className="text-xs text-muted-foreground">No priority warnings.</p>}
            </div>
            {showAssumptions && <div className="mt-3 rounded border border-amber-500/20 bg-background/40 p-3 text-xs text-muted-foreground"><div className="mb-2 font-medium text-foreground">Detailed warning status</div>{warnings.length ? warnings.map(w => <div key={w}>• {w}</div>) : <div>No detailed warnings.</div>}</div>}
          </div>
        </section>

        <Collapsible open={showSensitivity} onOpenChange={setShowSensitivity} className="rounded-xl border border-primary/10 bg-muted/20 p-4">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between">View value sensitivity <span>{showSensitivity ? '−' : '+'}</span></Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            {hasSensitivity ? <div className="overflow-hidden rounded-lg border border-primary/10"><div className="grid grid-cols-2 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground"><span>Sensitivity Cap Rate</span><span className="text-right">Sensitivity Value</span></div>{capAssessment.valueSensitivity.map(row => <div key={row.capRatePct} className="grid grid-cols-2 px-3 py-2 text-sm odd:bg-background/30"><span>{pct(row.capRatePct)}</span><span className="text-right font-medium">{displayMoney(row.impliedValue, true)}</span></div>)}</div> : <p className="text-xs text-muted-foreground">Sensitivity analysis appears once selected NOI and cap-rate sensitivity values are available.</p>}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );

}

function InputBlock({ label, state, onChange, onKeepOverride, onUseSource, step, placeholder }: { label: string; state: FieldState; onChange: (v: string) => void; onKeepOverride: () => void; onUseSource: () => void; step?: string; placeholder?: string }) {
  return <div className="space-y-1"><div className="flex items-center justify-between gap-2"><Label>{label}</Label><Badge variant="outline" className="text-[10px]" title={state.sourceDetail}>{sourceBadge(state.source)}</Badge></div><Input type="text" inputMode="decimal" step={step} value={state.value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />{state.pendingSource && <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-100 space-y-2"><p>New source value available. This field currently uses a saved override.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={onKeepOverride}>Keep override</Button><Button type="button" size="sm" variant="outline" onClick={onUseSource}>Use source value</Button></div></div>}</div>;
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-primary/10 bg-background/40 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 truncate font-medium text-foreground" title={value}>{value}</div></div>;
}

function MetricRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`flex items-center justify-between rounded-md border border-primary/10 bg-background/40 px-3 py-2 ${emphasis ? 'font-semibold' : ''}`}><span className="text-sm text-muted-foreground">{label}</span><span className="text-sm font-medium text-foreground">{value}</span></div>;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-primary/10 bg-background/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold text-foreground">{value}</div></div>;
}

function HighlightMetric({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'negative' }) {
  const toneClass = tone === 'negative' ? 'text-red-300' : 'text-primary';
  return <div className="rounded-lg border border-primary/20 bg-background/60 p-3 shadow-sm"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div></div>;
}
