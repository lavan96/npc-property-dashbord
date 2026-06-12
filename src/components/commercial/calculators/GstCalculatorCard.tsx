import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateCommercialGst, calculateCommercialGstEngine, type GstTreatment } from '@/utils/commercial';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));

export function GstCalculatorCard() {
  const [price, setPrice] = useState('3000000');
  const [treatment, setTreatment] = useState<GstTreatment>('going_concern');
  const [priorCost, setPriorCost] = useState('1800000');
  const [registered, setRegistered] = useState(true);
  const [goingConcernConfirmed, setGoingConcernConfirmed] = useState(false);

  const result = useMemo(() => calculateCommercialGst({
    purchasePrice: num(price), treatment, priorCost: num(priorCost), purchaserRegistered: registered,
  }), [price, treatment, priorCost, registered]);
  const assessment = useMemo(() => calculateCommercialGstEngine({ purchasePrice: num(price), treatment: treatment === 'going_concern' ? 'goingConcern' : treatment === 'standard' ? 'gstInclusive' : treatment === 'margin_scheme' ? 'marginScheme' : 'unknown', vendorGstRegistered: 'unknown', purchaserGstRegistered: registered ? 'yes' : 'no', goingConcernAgreedInWriting: goingConcernConfirmed ? 'yes' : 'unknown', enterpriseCarriedOnUntilSettlement: goingConcernConfirmed ? 'yes' : 'unknown', supplierProvidesAllThingsNecessary: goingConcernConfirmed ? 'yes' : 'unknown', propertyLeasedOrOperatingEnterprise: goingConcernConfirmed ? 'yes' : 'unknown', gstClaimableAsInputTaxCredit: registered ? 'yes' : 'no', estimatedRefundTiming: 'oneToThreeMonths' }), [price, treatment, registered, goingConcernConfirmed]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>GST Treatment</CardTitle>
        <CardDescription>Australian commercial acquisition GST — separates economic cost from settlement cashflow.</CardDescription><div className="flex flex-wrap gap-2 pt-2"><Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge><Badge variant={assessment.gstVerificationStatus === "Verified" ? "default" : "destructive"}>{assessment.gstVerificationStatus}</Badge><Button size="sm" variant="outline">Estimate / extract from contract</Button></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div><Label>Purchase Price</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
          <div>
            <Label>Treatment</Label>
            <Select value={treatment} onValueChange={v => setTreatment(v as GstTreatment)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="going_concern">Going Concern</SelectItem>
                <SelectItem value="margin_scheme">Margin Scheme</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="input_taxed">Input Taxed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {treatment === 'margin_scheme' && (
            <div><Label>Prior Acquisition Cost</Label><Input type="number" value={priorCost} onChange={e => setPriorCost(e.target.value)} /></div>
          )}
          <div className="flex items-center justify-between pt-2"><Label>Purchaser GST-Registered</Label><Switch checked={registered} onCheckedChange={setRegistered} /></div><div className="flex items-center justify-between pt-2"><Label>Going concern conditions confirmed?</Label><Switch checked={goingConcernConfirmed} onCheckedChange={setGoingConcernConfirmed} /></div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="GST Amount" value={fmt(assessment.gstAmount || result.gstAmount)} />
          <Row label="GST Claimable (ITC)" value={fmt(assessment.gstClaimableAmount || result.gstClaimable)} /><Row label="GST settlement cashflow" value={fmt(assessment.gstSettlementCashflowRequirement)} /><Row label="GST economic cost" value={fmt(assessment.gstEconomicCost)} /><Row label="GST timing risk" value={assessment.gstTimingRisk} />
          <Separator />
          <Row label="Net Acquisition Cost" value={fmt(assessment.netAcquisitionCost || result.netAcquisitionCost)} highlight />
          <p className="text-xs text-muted-foreground pt-2">{result.notes}</p>{assessment.warnings.map(w => <p key={w} className="text-xs text-amber-200">• {w}</p>)}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${highlight ? 'text-lg font-bold text-primary' : ''}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
