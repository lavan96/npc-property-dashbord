import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateCommercialGst, type LegacyGstTreatment as GstTreatment } from '@/utils/commercial';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));

export function GstCalculatorCard() {
  const [price, setPrice] = useState('3000000');
  const [treatment, setTreatment] = useState<GstTreatment>('going_concern');
  const [priorCost, setPriorCost] = useState('1800000');
  const [registered, setRegistered] = useState(true);

  const result = useMemo(() => calculateCommercialGst({
    purchasePrice: num(price), treatment, priorCost: num(priorCost), purchaserRegistered: registered,
  }), [price, treatment, priorCost, registered]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>GST Treatment</CardTitle>
        <CardDescription>Australian commercial acquisition GST — Going Concern, Margin Scheme, Standard.</CardDescription>
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
          <div className="flex items-center justify-between pt-2">
            <Label>Purchaser GST-Registered</Label>
            <Switch checked={registered} onCheckedChange={setRegistered} />
          </div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="GST Amount" value={fmt(result.gstAmount)} />
          <Row label="GST Claimable (ITC)" value={fmt(result.gstClaimable)} />
          <Separator />
          <Row label="Net Acquisition Cost" value={fmt(result.netAcquisitionCost)} highlight />
          <p className="text-xs text-muted-foreground pt-2">{result.notes}</p>
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
