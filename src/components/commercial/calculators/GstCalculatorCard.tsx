import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateCommercialGst, calculateCommercialGstEngine, type GstTreatment } from '@/utils/commercial';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

const fmt = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
    : 'Pending';

const PENDING = 'Pending';
type GstTreatmentInput = GstTreatment | 'unknown' | 'out_of_scope' | 'no_gst' | 'custom_review';
type ConfirmationState = 'yes' | 'no' | 'unknown';
type RefundTiming = 'atSettlement' | 'oneToThreeMonths' | 'threePlusMonths' | 'unknown';
type GstFieldKey = 'price' | 'treatment' | 'registered' | 'goingConcernConfirmed' | 'itcClaimability' | 'settlementTiming';
type SourceState = 'Blank' | 'Property Profile' | 'Scraped' | 'Contract Extracted' | 'AI Estimate' | 'Manual' | 'User Override' | 'Solicitor Confirmed' | 'Accountant Confirmed' | 'Verified';
interface SourceCandidate<T> { value: T; source: SourceState; detail: string }
interface AssumptionHistoryEntry { field: GstFieldKey; previousValue: string; nextValue: string; previousSource: SourceState; nextSource: SourceState; note: string }

const parseNumeric = (v: unknown): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};
const optionalNum = (v: string) => parseNumeric(v) ?? undefined;
const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '';
const firstNumber = (...xs: unknown[]) => {
  for (const x of xs) {
    const parsed = parseNumeric(x);
    if (parsed !== null) return parsed;
  }
  return undefined;
};
const firstString = (...xs: unknown[]) => xs.find(x => typeof x === 'string' && x.trim() !== '') as string | undefined;
const normalizeTreatment = (v: unknown): GstTreatmentInput | undefined => {
  const s = String(v ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (['going_concern', 'gst_free_going_concern'].includes(s)) return 'going_concern';
  if (['margin_scheme', 'margin'].includes(s)) return 'margin_scheme';
  if (['standard', 'gst_inclusive', 'plus_gst', 'taxable_supply', 'taxable'].includes(s)) return 'standard';
  if (['input_taxed'].includes(s)) return 'no_gst';
  if (['out_of_scope'].includes(s)) return 'out_of_scope';
  if (['no_gst', 'no_gst_applicable'].includes(s)) return 'no_gst';
  if (['custom', 'specialist_review', 'custom_specialist_review'].includes(s)) return 'custom_review';
  return undefined;
};
const normalizeConfirmation = (v: unknown): ConfirmationState | undefined => {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  const s = String(v ?? '').toLowerCase();
  if (['yes', 'true', 'confirmed', 'registered', 'verified'].includes(s)) return 'yes';
  if (['no', 'false', 'not_registered', 'unconfirmed'].includes(s)) return 'no';
  return undefined;
};
const persistedTreatment = (v: GstTreatmentInput): GstTreatment | undefined => {
  if (v === 'unknown' || v === 'custom_review') return undefined;
  if (v === 'out_of_scope' || v === 'no_gst') return 'input_taxed';
  return v;
};
const sourceLabel = (source: SourceState) => ({
  Blank: 'Blank',
  'Property Profile': 'From Property',
  Scraped: 'Scraped',
  'Contract Extracted': 'From Contract',
  'AI Estimate': 'AI Estimate',
  Manual: 'Manual',
  'User Override': 'Override',
  'Solicitor Confirmed': 'Solicitor Confirmed',
  'Accountant Confirmed': 'Accountant Confirmed',
  Verified: 'Verified',
}[source]);

export function GstCalculatorCard() {
  const { prefill, property } = useCalculatorPrefill();
  const rawProperty = (property ?? {}) as Record<string, unknown>;
  const [price, setPrice] = useState('');
  const [treatment, setTreatment] = useState<GstTreatmentInput>('unknown');
  const [priorCost, setPriorCost] = useState('');
  const [registered, setRegistered] = useState<ConfirmationState>('unknown');
  const [goingConcernConfirmed, setGoingConcernConfirmed] = useState<ConfirmationState>('unknown');
  const [itcClaimability, setItcClaimability] = useState<ConfirmationState>('unknown');
  const [settlementTiming, setSettlementTiming] = useState<RefundTiming>('unknown');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sources, setSources] = useState<Record<GstFieldKey, SourceState>>({ price: 'Blank', treatment: 'Blank', registered: 'Blank', goingConcernConfirmed: 'Blank', itcClaimability: 'Blank', settlementTiming: 'Blank' });
  const [history, setHistory] = useState<AssumptionHistoryEntry[]>([]);
  const [sourceConflicts, setSourceConflicts] = useState<Partial<Record<GstFieldKey, SourceCandidate<string>>>>({});

  const currentValues: Record<GstFieldKey, string> = { price, treatment, registered, goingConcernConfirmed, itcClaimability, settlementTiming };
  const pushHistory = (field: GstFieldKey, previousValue: string, nextValue: string, previousSource: SourceState, nextSource: SourceState, note: string) => {
    if (previousValue === nextValue && previousSource === nextSource) return;
    setHistory(prev => [{ field, previousValue, nextValue, previousSource, nextSource, note }, ...prev].slice(0, 8));
  };
  const applyCascadedValue = (field: GstFieldKey, candidate?: SourceCandidate<string>) => {
    if (!candidate || !hasValue(candidate.value)) return;
    const current = currentValues[field];
    const source = sources[field];
    if (source === 'User Override') {
      if (String(candidate.value) !== current) setSourceConflicts(prev => ({ ...prev, [field]: candidate }));
      return;
    }
    if (current === '' || current === 'unknown' || source === 'Blank' || source !== candidate.source || current !== String(candidate.value)) {
      pushHistory(field, current || 'Blank', String(candidate.value), source, candidate.source, candidate.detail);
      if (field === 'price') setPrice(String(candidate.value));
      if (field === 'treatment') setTreatment(candidate.value as GstTreatmentInput);
      if (field === 'registered') setRegistered(candidate.value as ConfirmationState);
      if (field === 'goingConcernConfirmed') setGoingConcernConfirmed(candidate.value as ConfirmationState);
      if (field === 'itcClaimability') setItcClaimability(candidate.value as ConfirmationState);
    if (field === 'settlementTiming') setSettlementTiming(candidate.value as RefundTiming);
      if (field === 'settlementTiming') setSettlementTiming(candidate.value as RefundTiming);
      setSources(prev => ({ ...prev, [field]: candidate.source }));
      setSourceConflicts(prev => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  const useSourceValue = (field: GstFieldKey, candidate?: SourceCandidate<string>) => {
    if (!candidate) return;
    const current = currentValues[field];
    pushHistory(field, current || 'Blank', String(candidate.value), sources[field], candidate.source, 'User accepted newer cascaded source value.');
    if (field === 'price') setPrice(String(candidate.value));
    if (field === 'treatment') setTreatment(candidate.value as GstTreatmentInput);
    if (field === 'registered') setRegistered(candidate.value as ConfirmationState);
    if (field === 'goingConcernConfirmed') setGoingConcernConfirmed(candidate.value as ConfirmationState);
    if (field === 'itcClaimability') setItcClaimability(candidate.value as ConfirmationState);
    setSources(prev => ({ ...prev, [field]: candidate.source }));
    setSourceConflicts(prev => { const next = { ...prev }; delete next[field]; return next; });
  };

  const markOverride = (field: GstFieldKey, nextValue: string, setter: (v: any) => void) => {
    const previousValue = currentValues[field] || 'Blank';
    const previousSource = sources[field];
    setter(nextValue);
    setSources(prev => ({ ...prev, [field]: 'User Override' }));
    pushHistory(field, previousValue, nextValue || 'Blank', previousSource, 'User Override', 'User edited cascaded GST value; original source preserved.');
  };

  const sourceCandidates = useMemo(() => {
    const scrapedPrice = firstNumber(rawProperty.scraped_asking_price, rawProperty.asking_price, rawProperty.guide_price, rawProperty.price_guide, rawProperty.extractedAskingPrice);
    const contractPrice = firstNumber(rawProperty.contract_price, rawProperty.extracted_contract_price, rawProperty.contractPurchasePrice, rawProperty.contract_purchase_price);
    const borrowingPrice = firstNumber(rawProperty.borrowing_capacity_purchase_price, rawProperty.borrowingCapacityPurchasePrice);
    const contractTreatment = normalizeTreatment(firstString(rawProperty.contract_gst_treatment, rawProperty.extracted_gst_treatment, rawProperty.extractedGstTreatment, rawProperty.gst_clause_treatment));
    const profileTreatment = normalizeTreatment(prefill?.gstTreatment);
    const aiTreatment = normalizeTreatment(firstString(rawProperty.ai_gst_treatment, rawProperty.aiGstTreatment, rawProperty.estimated_gst_treatment));
    const clientRegistered = normalizeConfirmation(rawProperty.client_gst_registered ?? rawProperty.entity_gst_registered ?? rawProperty.purchaser_entity_gst_registered);
    const savedRegistered = normalizeConfirmation(rawProperty.purchaser_gst_registered ?? rawProperty.gst_registered ?? rawProperty.saved_purchaser_gst_registered);
    const contractGoingConcern = normalizeConfirmation(rawProperty.contract_going_concern_confirmed ?? rawProperty.going_concern_conditions_confirmed ?? rawProperty.extracted_going_concern_confirmed);
    const solicitorGoingConcern = normalizeConfirmation(rawProperty.solicitor_going_concern_confirmed ?? rawProperty.solicitorConfirmedGoingConcern);
    const accountantGoingConcern = normalizeConfirmation(rawProperty.accountant_going_concern_confirmed ?? rawProperty.accountantConfirmedGoingConcern);
    const savedItcClaimability = normalizeConfirmation(rawProperty.gst_claimable_as_itc ?? rawProperty.gstClaimableAsInputTaxCredit ?? rawProperty.itc_claimability_confirmed);
    const savedSettlementTiming = firstString(rawProperty.settlement_gst_timing, rawProperty.estimated_refund_timing, rawProperty.gst_refund_timing) as RefundTiming | undefined;
    return {
      price: [
        prefill?.purchasePrice != null ? { value: String(prefill.purchasePrice), source: 'Property Profile' as SourceState, detail: 'Commercial / Industrial property profile purchase price' } : undefined,
        scrapedPrice != null ? { value: String(scrapedPrice), source: 'Scraped' as SourceState, detail: 'Scraped asking price / guide price' } : undefined,
        contractPrice != null ? { value: String(contractPrice), source: 'Contract Extracted' as SourceState, detail: 'Contract extraction purchase price' } : undefined,
        borrowingPrice != null ? { value: String(borrowingPrice), source: 'Manual' as SourceState, detail: 'Borrowing Capacity purchase price fallback' } : undefined,
      ].find(Boolean) as SourceCandidate<string> | undefined,
      treatment: [
        contractTreatment ? { value: contractTreatment, source: 'Contract Extracted' as SourceState, detail: 'Contract GST clauses' } : undefined,
        profileTreatment ? { value: profileTreatment, source: 'Property Profile' as SourceState, detail: 'Saved property profile GST treatment' } : undefined,
        aiTreatment ? { value: aiTreatment, source: 'AI Estimate' as SourceState, detail: 'AI estimate from property and contract context' } : undefined,
      ].find(Boolean) as SourceCandidate<string> | undefined,
      registered: [
        clientRegistered ? { value: clientRegistered, source: 'Verified' as SourceState, detail: 'Client / entity profile GST registration' } : undefined,
        savedRegistered ? { value: savedRegistered, source: 'Property Profile' as SourceState, detail: 'Saved purchaser structure GST registration' } : undefined,
      ].find(Boolean) as SourceCandidate<string> | undefined,
      goingConcernConfirmed: [
        contractGoingConcern ? { value: contractGoingConcern, source: 'Contract Extracted' as SourceState, detail: 'Contract extracted going concern conditions' } : undefined,
        solicitorGoingConcern ? { value: solicitorGoingConcern, source: 'Solicitor Confirmed' as SourceState, detail: 'Solicitor confirmation flag' } : undefined,
        accountantGoingConcern ? { value: accountantGoingConcern, source: 'Accountant Confirmed' as SourceState, detail: 'Accountant confirmation flag' } : undefined,
      ].find(Boolean) as SourceCandidate<string> | undefined,
      itcClaimability: savedItcClaimability ? { value: savedItcClaimability, source: 'Verified' as SourceState, detail: 'Saved ITC claimability confirmation flag' } : undefined,
      settlementTiming: savedSettlementTiming && ['atSettlement', 'oneToThreeMonths', 'threePlusMonths', 'unknown'].includes(savedSettlementTiming) ? { value: savedSettlementTiming, source: 'Property Profile' as SourceState, detail: 'Saved settlement GST timing' } : undefined,
    };
  }, [prefill, property]);

  useEffect(() => {
    applyCascadedValue('price', sourceCandidates.price);
    applyCascadedValue('treatment', sourceCandidates.treatment);
    applyCascadedValue('registered', sourceCandidates.registered);
    applyCascadedValue('goingConcernConfirmed', sourceCandidates.goingConcernConfirmed);
    applyCascadedValue('itcClaimability', sourceCandidates.itcClaimability);
    applyCascadedValue('settlementTiming', sourceCandidates.settlementTiming);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCandidates]);

  const purchasePriceValue = parseNumeric(price);
  const priorCostValue = parseNumeric(priorCost);
  const isZeroGstTreatment = treatment === 'input_taxed' || treatment === 'out_of_scope' || treatment === 'no_gst';
  const isSpecialistTreatment = treatment === 'unknown' || treatment === 'custom_review';
  const dataEntryStarted = purchasePriceValue !== null || treatment !== 'unknown' || registered !== 'unknown' || goingConcernConfirmed !== 'unknown' || itcClaimability !== 'unknown' || settlementTiming !== 'unknown';
  const hasRequiredInputs = purchasePriceValue !== null && purchasePriceValue > 0 && treatment !== 'unknown' && treatment !== 'custom_review' && (treatment !== 'standard' || (registered !== 'unknown' && itcClaimability !== 'unknown' && settlementTiming !== 'unknown')) && (treatment !== 'going_concern' || goingConcernConfirmed === 'yes') && (treatment !== 'margin_scheme' || priorCostValue !== null);
  const formulaTreatment: GstTreatment = isZeroGstTreatment ? 'input_taxed' : treatment as GstTreatment;
  const purchaserCanClaimItc = registered === 'yes' && itcClaimability === 'yes';
  const result = useMemo(() => hasRequiredInputs ? calculateCommercialGst({
    purchasePrice: purchasePriceValue, treatment: formulaTreatment, priorCost: priorCostValue ?? 0, purchaserRegistered: purchaserCanClaimItc,
  }) : null, [hasRequiredInputs, purchasePriceValue, formulaTreatment, priorCostValue, purchaserCanClaimItc, settlementTiming]);
  const assessment = useMemo(() => hasRequiredInputs ? calculateCommercialGstEngine({ purchasePrice: purchasePriceValue, treatment: treatment === 'going_concern' ? 'goingConcern' : treatment === 'standard' ? 'gstInclusive' : treatment === 'margin_scheme' ? 'marginScheme' : isZeroGstTreatment ? 'unknown' : 'unknown', vendorGstRegistered: 'unknown', purchaserGstRegistered: registered, goingConcernAgreedInWriting: goingConcernConfirmed, enterpriseCarriedOnUntilSettlement: goingConcernConfirmed, supplierProvidesAllThingsNecessary: goingConcernConfirmed, propertyLeasedOrOperatingEnterprise: goingConcernConfirmed, gstClaimableAsInputTaxCredit: purchaserCanClaimItc ? 'yes' : 'no', estimatedRefundTiming: settlementTiming === 'unknown' ? 'unknown' : settlementTiming }) : null, [hasRequiredInputs, purchasePriceValue, treatment, isZeroGstTreatment, registered, goingConcernConfirmed, purchaserCanClaimItc, settlementTiming]);
  const verificationStatus = isSpecialistTreatment && dataEntryStarted ? 'Specialist Review Required' : isZeroGstTreatment && hasRequiredInputs ? 'Verified' : hasRequiredInputs ? assessment?.gstVerificationStatus ?? 'Unknown' : 'Awaiting GST Inputs';
  const canExtractFromContract = Boolean(prefill);
  const gstAmountValue = hasRequiredInputs && assessment && result ? (assessment.gstAmount || result.gstAmount) : null;
  const gstClaimableValue = hasRequiredInputs && assessment && result ? (assessment.gstClaimableAmount || result.gstClaimable) : null;
  const settlementCashflowValue = hasRequiredInputs && assessment ? (isZeroGstTreatment ? 0 : assessment.gstSettlementCashflowRequirement) : null;
  const economicCostValue = hasRequiredInputs && assessment ? (isZeroGstTreatment ? 0 : assessment.gstEconomicCost) : null;
  const netAcquisitionCostValue = hasRequiredInputs && result && purchasePriceValue !== null ? (isZeroGstTreatment ? result.netAcquisitionCost : (assessment?.netAcquisitionCost || result.netAcquisitionCost)) : null;
  const timingRiskValue = hasRequiredInputs && assessment ? (isZeroGstTreatment ? 'low' : assessment.gstTimingRisk) : null;
  const checklist = [
    { label: 'Contract GST clause reviewed', complete: treatment !== 'unknown' },
    { label: 'Purchaser GST registration confirmed', complete: registered !== 'unknown' },
    { label: 'Going concern conditions confirmed, if applicable', complete: treatment !== 'going_concern' || goingConcernConfirmed === 'yes' },
    { label: 'Tax invoice / settlement statement reviewed', complete: settlementTiming !== 'unknown' || isZeroGstTreatment },
    { label: 'Solicitor/accountant confirmation received', complete: ['Solicitor Confirmed', 'Accountant Confirmed', 'Verified'].includes(sources.goingConcernConfirmed) || verificationStatus === 'Verified' },
  ];
  const nextAction = !purchasePriceValue || treatment === 'unknown'
    ? 'Inputs are incomplete. Confirm purchase price and GST treatment.'
    : treatment === 'going_concern' && goingConcernConfirmed !== 'yes'
      ? 'Going concern selected but not verified. Confirm contract clauses and purchaser GST registration.'
      : treatment === 'standard'
        ? 'Taxable supply selected. Confirm whether GST is payable at settlement and whether ITC is claimable.'
        : isSpecialistTreatment
          ? 'GST treatment is unknown. Obtain solicitor/accountant confirmation before relying on the result.'
          : verificationStatus === 'Verified'
            ? 'GST treatment is verified. Net acquisition cost can be used in reporting.'
            : 'Review GST assumptions and resolve any remaining confirmation items before relying on the result.';

  return (
    <Card className="border-primary/20 bg-card/80 shadow-sm">
      <CardHeader className="space-y-3">
        <div>
          <CardTitle>GST Treatment</CardTitle>
          <CardDescription>Australian commercial acquisition GST — separates economic cost from settlement cashflow.</CardDescription>
        </div>
        <div className="rounded-xl border border-primary/20 bg-background/35 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{prefill ? 'Linked property source' : 'Manual entry / no property linked'}</Badge>
              <Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge>
              <Badge variant={verificationStatus === "Verified" ? "default" : verificationStatus === "Specialist Review Required" ? "destructive" : "outline"} className={verificationStatus === "Awaiting GST Inputs" ? "border-primary/40 text-primary" : undefined}>{verificationStatus}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled title="Assumption status is shown in field badges and the advanced GST breakdown.">Assumption Status</Button>
              <Button size="sm" variant="outline" disabled={!canExtractFromContract} title={canExtractFromContract ? "Estimate GST treatment from linked property or contract context." : "Link a property, paste contract text or upload contract data before estimating GST treatment."}>Estimate / extract from contract</Button>
              <SaveBackButton build={() => ({ purchase_price: optionalNum(price), gst_treatment: persistedTreatment(treatment) })} />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-foreground">GST Inputs</h3>
              <p className="mt-1 text-xs text-muted-foreground">Confirm the GST treatment and purchaser registration status used to estimate GST cashflow and economic cost.</p>
            </div>
            <div className="space-y-3">
              <FieldShell label="Purchase Price" source={sources.price} conflict={sourceConflicts.price} onKeep={() => setSourceConflicts(prev => { const next = { ...prev }; delete next.price; return next; })} onUse={() => useSourceValue('price', sourceConflicts.price)}>
                <Input type="number" value={price} onChange={e => markOverride('price', e.target.value, setPrice)} placeholder="Pulled from property profile or enter manually" />
              </FieldShell>
              <div>
                <FieldLabel label="GST Treatment" source={sources.treatment} />
                <Select value={treatment} onValueChange={v => markOverride('treatment', v, setTreatment)}>
                  <SelectTrigger>{treatment === 'unknown' ? <span className="text-muted-foreground">Select GST treatment</span> : <SelectValue />}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="standard">Taxable Supply</SelectItem>
                    <SelectItem value="going_concern">GST-Free Going Concern</SelectItem>
                    <SelectItem value="margin_scheme">Margin Scheme</SelectItem>
                    <SelectItem value="out_of_scope">Out of Scope</SelectItem>
                    <SelectItem value="no_gst">No GST Applicable</SelectItem>
                    <SelectItem value="custom_review">Custom / Specialist Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {treatment === 'margin_scheme' && (
                <div><Label>Prior Acquisition Cost</Label><Input type="number" value={priorCost} onChange={e => setPriorCost(e.target.value)} placeholder="Enter prior acquisition cost if known" /></div>
              )}
              <FieldConflict conflict={sourceConflicts.treatment} onKeep={() => setSourceConflicts(prev => { const next = { ...prev }; delete next.treatment; return next; })} onUse={() => useSourceValue('treatment', sourceConflicts.treatment)} />
              <SelectField label="Purchaser GST-Registered" value={registered} source={sources.registered} onChange={v => markOverride('registered', v, setRegistered)} placeholder="Confirm purchaser GST registration" conflict={sourceConflicts.registered} onKeep={() => setSourceConflicts(prev => { const next = { ...prev }; delete next.registered; return next; })} onUse={() => useSourceValue('registered', sourceConflicts.registered)} />
              <SelectField label="Going Concern Conditions Confirmed" value={goingConcernConfirmed} source={sources.goingConcernConfirmed} onChange={v => markOverride('goingConcernConfirmed', v, setGoingConcernConfirmed)} placeholder="Confirm contract conditions" conflict={sourceConflicts.goingConcernConfirmed} onKeep={() => setSourceConflicts(prev => { const next = { ...prev }; delete next.goingConcernConfirmed; return next; })} onUse={() => useSourceValue('goingConcernConfirmed', sourceConflicts.goingConcernConfirmed)} />
              <SelectField label="GST Claimability Confirmed" value={itcClaimability} source={sources.itcClaimability} onChange={v => markOverride('itcClaimability', v, setItcClaimability)} placeholder="Confirm ITC claimability" conflict={sourceConflicts.itcClaimability} onKeep={() => setSourceConflicts(prev => { const next = { ...prev }; delete next.itcClaimability; return next; })} onUse={() => useSourceValue('itcClaimability', sourceConflicts.itcClaimability)} />
              <TimingField value={settlementTiming} source={sources.settlementTiming} onChange={v => markOverride('settlementTiming', v, setSettlementTiming)} />
            </div>
          </section>

          <section className="rounded-xl border border-primary/20 bg-background/35 p-4">
            <h3 className="text-base font-semibold text-foreground">GST Output Summary</h3>
            {!hasRequiredInputs && (
              <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm font-semibold text-primary">Awaiting GST Inputs</p>
                <p className="mt-1 text-xs text-muted-foreground">Link a property, extract contract terms or enter purchase price and GST treatment to estimate settlement cashflow and economic cost.</p>
              </div>
            )}
            <div className="mt-3 space-y-2">
              <Row label="GST Amount" value={gstAmountValue === null ? PENDING : fmt(gstAmountValue)} />
              <Row label="GST Claimable (ITC)" value={gstClaimableValue === null ? PENDING : fmt(gstClaimableValue)} />
              <Row label="GST Settlement Cashflow" value={settlementCashflowValue === null ? PENDING : fmt(settlementCashflowValue)} highlight />
              <Row label="GST Economic Cost" value={economicCostValue === null ? PENDING : fmt(economicCostValue)} highlight />
              <Row label="GST Timing Risk" value={timingRiskValue ?? PENDING} />
              <Separator />
              <Row label="Net Acquisition Cost" value={netAcquisitionCostValue === null ? PENDING : fmt(netAcquisitionCostValue)} highlight />
            </div>
            {hasRequiredInputs && result && <p className="text-xs text-muted-foreground pt-3">{result.notes}</p>}
            {hasRequiredInputs && !isZeroGstTreatment && assessment?.warnings.map(w => <p key={w} className="text-xs text-amber-200">• {w}</p>)}
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <h3 className="text-base font-semibold text-foreground">Required Confirmation</h3>
            <div className="mt-3 space-y-2 text-sm">
              {checklist.map(item => <div key={item.label} className="flex items-center justify-between gap-3"><span>{item.label}</span><Badge variant={item.complete ? 'default' : 'outline'}>{item.complete ? 'Done' : 'Pending'}</Badge></div>)}
            </div>
          </section>
          <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h3 className="text-base font-semibold text-primary">Recommended Next Action</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{nextAction}</p>
          </section>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="h-auto w-full justify-between p-0 text-left text-primary hover:bg-transparent">
              View GST treatment breakdown
              <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
            <AdvancedBlock title="Formula breakdown" lines={[`Purchase price: ${purchasePriceValue === null ? PENDING : fmt(purchasePriceValue)}`, `Treatment: ${treatment}`, `GST amount: ${gstAmountValue === null ? PENDING : fmt(gstAmountValue)}`, `Claimable: ${gstClaimableValue === null ? PENDING : fmt(gstClaimableValue)}`, `Net acquisition cost: ${netAcquisitionCostValue === null ? PENDING : fmt(netAcquisitionCostValue)}`]} />
            <AdvancedBlock title="Treatment explanation" lines={[result?.notes ?? 'Pending treatment selection and confirmation.', isSpecialistTreatment ? 'Specialist review is required before relying on this GST treatment.' : 'Confirm against contract and tax documentation before relying on this estimate.']} />
            <AdvancedBlock title="Contract extraction detail" lines={[sourceCandidates.treatment?.source === 'Contract Extracted' ? sourceCandidates.treatment.detail : 'No contract-extracted GST treatment currently applied.', sourceCandidates.price?.source === 'Contract Extracted' ? sourceCandidates.price.detail : 'No contract-extracted price currently applied.']} />
            <AdvancedBlock title="AI estimate reasoning" lines={[sourceCandidates.treatment?.source === 'AI Estimate' ? sourceCandidates.treatment.detail : 'No AI GST estimate currently applied.']} />
            <AdvancedBlock title="Full assumption list" lines={Object.entries(sources).map(([field, source]) => `${field}: ${sourceLabel(source)}`)} />
            <AdvancedBlock title="Full warning log" lines={assessment?.warnings?.length ? assessment.warnings : ['No GST warning log available yet.']} />
            <AdvancedBlock title="Audit history" lines={history.length ? history.map(h => `${h.field}: ${h.previousValue} (${sourceLabel(h.previousSource)}) → ${h.nextValue} (${sourceLabel(h.nextSource)})`) : ['No GST assumption changes recorded yet.']} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function SelectField({ label, value, source, onChange, placeholder, conflict, onKeep, onUse }: { label: string; value: ConfirmationState; source: SourceState; onChange: (v: ConfirmationState) => void; placeholder: string; conflict?: SourceCandidate<string>; onKeep: () => void; onUse: () => void }) {
  return (
    <div>
      <FieldLabel label={label} source={source} />
      <Select value={value} onValueChange={v => onChange(v as ConfirmationState)}>
        <SelectTrigger>{value === 'unknown' ? <span className="text-muted-foreground">{placeholder}</span> : <SelectValue />}</SelectTrigger>
        <SelectContent>
          <SelectItem value="unknown">Unknown / Unconfirmed</SelectItem>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
      <FieldConflict conflict={conflict} onKeep={onKeep} onUse={onUse} />
    </div>
  );
}

function TimingField({ value, source, onChange }: { value: RefundTiming; source: SourceState; onChange: (v: RefundTiming) => void }) {
  return (
    <div>
      <FieldLabel label="Settlement GST Timing" source={source} />
      <Select value={value} onValueChange={v => onChange(v as RefundTiming)}>
        <SelectTrigger>{value === 'unknown' ? <span className="text-muted-foreground">Confirm GST settlement timing</span> : <SelectValue />}</SelectTrigger>
        <SelectContent>
          <SelectItem value="unknown">Unknown / Unconfirmed</SelectItem>
          <SelectItem value="atSettlement">At settlement</SelectItem>
          <SelectItem value="oneToThreeMonths">Refund expected in 1–3 months</SelectItem>
          <SelectItem value="threePlusMonths">Refund expected after 3+ months</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function AdvancedBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/35 p-3">
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-2 space-y-1">
        {lines.map((line, index) => <p key={`${title}-${index}`}>{line}</p>)}
      </div>
    </div>
  );
}

function FieldShell({ label, source, conflict, onKeep, onUse, children }: { label: string; source: SourceState; conflict?: SourceCandidate<string>; onKeep: () => void; onUse: () => void; children: React.ReactNode }) {
  return <div><FieldLabel label={label} source={source} />{children}<FieldConflict conflict={conflict} onKeep={onKeep} onUse={onUse} /></div>;
}

function FieldLabel({ label, source }: { label: string; source: SourceState }) {
  return <Label className="flex items-center gap-2"><span>{label}</span><SourceBadge source={source} /></Label>;
}

function SourceBadge({ source }: { source: SourceState }) {
  return <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[10px] text-primary" title={`Source: ${sourceLabel(source)}`}>{sourceLabel(source)}</Badge>;
}

function FieldConflict({ conflict, onKeep, onUse }: { conflict?: SourceCandidate<string>; onKeep: () => void; onUse: () => void }) {
  if (!conflict) return null;
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
      <div>New source value available. This field currently uses a saved override.</div>
      <div className="mt-1 text-muted-foreground">{sourceLabel(conflict.source)}: {conflict.value}</div>
      <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" className="h-7" onClick={onKeep}>Keep override</Button><Button size="sm" className="h-7" onClick={onUse}>Use source value</Button></div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${highlight ? 'text-lg font-bold text-primary' : ''}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
