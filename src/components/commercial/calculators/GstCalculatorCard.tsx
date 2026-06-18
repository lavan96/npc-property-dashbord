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

const fmt = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
    : 'Pending';

const PENDING = 'Pending';
type GstTreatmentInput = GstTreatment | 'unknown';
type ConfirmationState = 'yes' | 'no' | 'unknown';
type GstFieldKey = 'price' | 'treatment' | 'registered' | 'goingConcernConfirmed';
type SourceState = 'Blank' | 'Property Profile' | 'Scraped' | 'Contract Extracted' | 'AI Estimate' | 'Manual' | 'User Override' | 'Solicitor Confirmed' | 'Accountant Confirmed' | 'Verified';
interface SourceCandidate<T> { value: T; source: SourceState; detail: string }
interface AssumptionHistoryEntry { field: GstFieldKey; previousValue: string; nextValue: string; previousSource: SourceState; nextSource: SourceState; note: string }

const num = (v: string) => (v === '' ? 0 : Number(v));
const optionalNum = (v: string) => (v === '' ? undefined : Number(v));
const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '';
const firstNumber = (...xs: unknown[]) => xs.map(Number).find(Number.isFinite);
const firstString = (...xs: unknown[]) => xs.find(x => typeof x === 'string' && x.trim() !== '') as string | undefined;
const normalizeTreatment = (v: unknown): GstTreatmentInput | undefined => {
  const s = String(v ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (['going_concern', 'gst_free_going_concern'].includes(s)) return 'going_concern';
  if (['margin_scheme', 'margin'].includes(s)) return 'margin_scheme';
  if (['standard', 'gst_inclusive', 'plus_gst', 'taxable_supply'].includes(s)) return 'standard';
  if (['input_taxed', 'out_of_scope', 'no_gst'].includes(s)) return 'input_taxed';
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
  const [sources, setSources] = useState<Record<GstFieldKey, SourceState>>({ price: 'Blank', treatment: 'Blank', registered: 'Blank', goingConcernConfirmed: 'Blank' });
  const [history, setHistory] = useState<AssumptionHistoryEntry[]>([]);
  const [sourceConflicts, setSourceConflicts] = useState<Partial<Record<GstFieldKey, SourceCandidate<string>>>>({});

  const currentValues: Record<GstFieldKey, string> = { price, treatment, registered, goingConcernConfirmed };
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
    };
  }, [prefill, property]);

  useEffect(() => {
    applyCascadedValue('price', sourceCandidates.price);
    applyCascadedValue('treatment', sourceCandidates.treatment);
    applyCascadedValue('registered', sourceCandidates.registered);
    applyCascadedValue('goingConcernConfirmed', sourceCandidates.goingConcernConfirmed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCandidates]);

  const hasRequiredInputs = num(price) > 0 && treatment !== 'unknown' && registered !== 'unknown' && (treatment !== 'going_concern' || goingConcernConfirmed !== 'unknown');
  const result = useMemo(() => hasRequiredInputs ? calculateCommercialGst({
    purchasePrice: num(price), treatment, priorCost: num(priorCost), purchaserRegistered: registered === 'yes',
  }) : null, [hasRequiredInputs, price, treatment, priorCost, registered]);
  const assessment = useMemo(() => hasRequiredInputs ? calculateCommercialGstEngine({ purchasePrice: num(price), treatment: treatment === 'going_concern' ? 'goingConcern' : treatment === 'standard' ? 'gstInclusive' : treatment === 'margin_scheme' ? 'marginScheme' : 'unknown', vendorGstRegistered: 'unknown', purchaserGstRegistered: registered, goingConcernAgreedInWriting: goingConcernConfirmed, enterpriseCarriedOnUntilSettlement: goingConcernConfirmed, supplierProvidesAllThingsNecessary: goingConcernConfirmed, propertyLeasedOrOperatingEnterprise: goingConcernConfirmed, gstClaimableAsInputTaxCredit: registered, estimatedRefundTiming: 'oneToThreeMonths' }) : null, [hasRequiredInputs, price, treatment, registered, goingConcernConfirmed]);
  const verificationStatus = hasRequiredInputs ? assessment?.gstVerificationStatus ?? 'Unknown' : 'Awaiting GST Inputs';
  const canExtractFromContract = Boolean(prefill);

  return (
    <Card>
      <CardHeader>
        <CardTitle>GST Treatment</CardTitle>
        <CardDescription>Australian commercial acquisition GST — separates economic cost from settlement cashflow.</CardDescription><div className="flex flex-wrap gap-2 pt-2 items-center"><Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge><Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Editable data cascade</Badge><Badge variant={verificationStatus === "Verified" ? "default" : "outline"} className={verificationStatus === "Awaiting GST Inputs" ? "border-primary/40 text-primary" : undefined}>{verificationStatus}</Badge><Button size="sm" variant="outline" disabled={!canExtractFromContract} title={canExtractFromContract ? "Estimate GST treatment from linked property or contract context." : "Link a property, paste contract text or upload contract data before estimating GST treatment."}>Estimate / extract from contract</Button><SaveBackButton build={() => ({ purchase_price: optionalNum(price), gst_treatment: treatment === "unknown" ? undefined : treatment })} /></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
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
                <SelectItem value="going_concern">Going Concern</SelectItem>
                <SelectItem value="margin_scheme">Margin Scheme</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="input_taxed">Input Taxed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {treatment === 'margin_scheme' && (
            <div><Label>Prior Acquisition Cost</Label><Input type="number" value={priorCost} onChange={e => setPriorCost(e.target.value)} placeholder="Enter prior acquisition cost if known" /></div>
          )}
          <FieldConflict conflict={sourceConflicts.treatment} onKeep={() => setSourceConflicts(prev => { const next = { ...prev }; delete next.treatment; return next; })} onUse={() => useSourceValue('treatment', sourceConflicts.treatment)} />
          <SelectField label="Purchaser GST-Registered" value={registered} source={sources.registered} onChange={v => markOverride('registered', v, setRegistered)} placeholder="Confirm purchaser GST registration" conflict={sourceConflicts.registered} onKeep={() => setSourceConflicts(prev => { const next = { ...prev }; delete next.registered; return next; })} onUse={() => useSourceValue('registered', sourceConflicts.registered)} />
          <SelectField label="Going concern conditions confirmed?" value={goingConcernConfirmed} source={sources.goingConcernConfirmed} onChange={v => markOverride('goingConcernConfirmed', v, setGoingConcernConfirmed)} placeholder="Confirm contract conditions" conflict={sourceConflicts.goingConcernConfirmed} onKeep={() => setSourceConflicts(prev => { const next = { ...prev }; delete next.goingConcernConfirmed; return next; })} onUse={() => useSourceValue('goingConcernConfirmed', sourceConflicts.goingConcernConfirmed)} />
          {history.length > 0 && (
            <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">Assumption history</div>
              {history.slice(0, 3).map((h, i) => <div key={`${h.field}-${i}`}>{h.field}: {h.previousValue} ({sourceLabel(h.previousSource)}) → {h.nextValue} ({sourceLabel(h.nextSource)})</div>)}
            </div>
          )}
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          {!hasRequiredInputs && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-semibold text-primary">Awaiting GST Inputs</p>
              <p className="mt-1 text-xs text-muted-foreground">Link a property, extract contract terms or enter purchase price and GST treatment to estimate settlement cashflow and economic cost.</p>
            </div>
          )}
          <Row label="GST Amount" value={hasRequiredInputs && assessment && result ? fmt(assessment.gstAmount || result.gstAmount) : PENDING} />
          <Row label="GST Claimable (ITC)" value={hasRequiredInputs && assessment && result ? fmt(assessment.gstClaimableAmount || result.gstClaimable) : PENDING} /><Row label="GST Settlement Cashflow" value={hasRequiredInputs && assessment ? fmt(assessment.gstSettlementCashflowRequirement) : PENDING} /><Row label="GST Economic Cost" value={hasRequiredInputs && assessment ? fmt(assessment.gstEconomicCost) : PENDING} /><Row label="GST Timing Risk" value={hasRequiredInputs && assessment ? assessment.gstTimingRisk : PENDING} />
          <Separator />
          <Row label="Net Acquisition Cost" value={hasRequiredInputs && assessment && result ? fmt(assessment.netAcquisitionCost || result.netAcquisitionCost) : PENDING} highlight />
          {hasRequiredInputs && result && <p className="text-xs text-muted-foreground pt-2">{result.notes}</p>}{hasRequiredInputs && assessment?.warnings.map(w => <p key={w} className="text-xs text-amber-200">• {w}</p>)}
        </div>
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

function FieldShell({ label, source, conflict, onKeep, onUse, children }: { label: string; source: SourceState; conflict?: SourceCandidate<string>; onKeep: () => void; onUse: () => void; children: React.ReactNode }) {
  return <div><FieldLabel label={label} source={source} />{children}<FieldConflict conflict={conflict} onKeep={onKeep} onUse={onUse} /></div>;
}

function FieldLabel({ label, source }: { label: string; source: SourceState }) {
  return <Label className="flex items-center gap-2"><span>{label}</span><SourceBadge source={source} /></Label>;
}

function SourceBadge({ source }: { source: SourceState }) {
  return <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[10px] text-primary">{sourceLabel(source)}</Badge>;
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
