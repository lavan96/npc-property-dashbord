import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateCommercialGst, calculateCommercialGstEngine, type GstTreatment } from '@/utils/commercial';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApplyPrefill, useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';

const fmt = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
    : 'Pending';

const PENDING = 'Pending';
type GstTreatmentInput = GstTreatment | 'unknown';
type ConfirmationState = 'yes' | 'no' | 'unknown';

const num = (v: string) => (v === '' ? 0 : Number(v));
const optionalNum = (v: string) => (v === '' ? undefined : Number(v));

export function GstCalculatorCard() {
  const { prefill } = useCalculatorPrefill();
  const [price, setPrice] = useState('');
  const [treatment, setTreatment] = useState<GstTreatmentInput>('unknown');
  const [priorCost, setPriorCost] = useState('');
  const [registered, setRegistered] = useState<ConfirmationState>('unknown');
  const [goingConcernConfirmed, setGoingConcernConfirmed] = useState<ConfirmationState>('unknown');

  useApplyPrefill((p) => {
    if (p.purchasePrice != null) setPrice(String(p.purchasePrice));
    if (p.gstTreatment) {
      const t = p.gstTreatment as GstTreatment;
      if (['going_concern','margin_scheme','standard','input_taxed'].includes(t)) setTreatment(t);
    }
  });

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
        <CardDescription>Australian commercial acquisition GST — separates economic cost from settlement cashflow.</CardDescription><div className="flex flex-wrap gap-2 pt-2 items-center"><Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge><Badge variant={verificationStatus === "Verified" ? "default" : "outline"} className={verificationStatus === "Awaiting GST Inputs" ? "border-primary/40 text-primary" : undefined}>{verificationStatus}</Badge><Button size="sm" variant="outline" disabled={!canExtractFromContract} title={canExtractFromContract ? "Estimate GST treatment from linked property or contract context." : "Link a property, paste contract text or upload contract data before estimating GST treatment."}>Estimate / extract from contract</Button><SaveBackButton build={() => ({ purchase_price: optionalNum(price), gst_treatment: treatment === "unknown" ? undefined : treatment })} /></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div><Label>Purchase Price</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Pulled from property profile or enter manually" /></div>
          <div>
            <Label>GST Treatment</Label>
            <Select value={treatment} onValueChange={v => setTreatment(v as GstTreatmentInput)}>
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
          <SelectField label="Purchaser GST-Registered" value={registered} onChange={setRegistered} placeholder="Confirm purchaser GST registration" />
          <SelectField label="Going concern conditions confirmed?" value={goingConcernConfirmed} onChange={setGoingConcernConfirmed} placeholder="Confirm contract conditions" />
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

function SelectField({ label, value, onChange, placeholder }: { label: string; value: ConfirmationState; onChange: (v: ConfirmationState) => void; placeholder: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={v => onChange(v as ConfirmationState)}>
        <SelectTrigger>{value === 'unknown' ? <span className="text-muted-foreground">{placeholder}</span> : <SelectValue />}</SelectTrigger>
        <SelectContent>
          <SelectItem value="unknown">Unknown / Unconfirmed</SelectItem>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
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
