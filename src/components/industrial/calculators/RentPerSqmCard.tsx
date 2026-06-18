import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { calcRentPerSqm } from '@/utils/industrial';
import { useApplyPrefill, useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';

const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n);
const num = (v: string) => v === '' ? 0 : Number(v);
const hasValue = (v: string) => v.trim() !== '';

export function RentPerSqmCard() {
  const { prefill } = useCalculatorPrefill();
  const [baseRent, setBaseRent] = useState('');
  const [gla, setGla] = useState('');
  const [outgoings, setOutgoings] = useState('');

  useApplyPrefill((p) => {
    if (p.glaSqm != null) setGla(String(p.glaSqm));
    if (p.grossPassingRentPa != null) setBaseRent(String(p.grossPassingRentPa));
    if (p.recoveredOutgoingsPa != null) setOutgoings(String(p.recoveredOutgoingsPa));
  });

  useEffect(() => {
    if (!prefill) {
      setBaseRent('');
      setGla('');
      setOutgoings('');
    }
  }, [prefill]);

  const hasRequiredInputs = hasValue(baseRent) && hasValue(gla) && hasValue(outgoings);

  const result = useMemo(() => calcRentPerSqm({
    baseRentPa: num(baseRent),
    glaSqm: num(gla),
    outgoingsPa: num(outgoings),
  }), [baseRent, gla, outgoings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rent per m² (GLA)</CardTitle>
        <CardDescription>Convert annual rent and outgoings into industrial $/m² benchmarks.</CardDescription>
        <div className="pt-2"><SaveBackButton label="Save Back to Property" build={() => ({ gla_sqm: num(gla) || undefined })} /></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div><Label>Base Rent (PA $)</Label><Input type="number" value={baseRent} placeholder="Pulled from NOI tab or enter manually" onChange={e => setBaseRent(e.target.value)} /></div>
          <div><Label>GLA (m²)</Label><Input type="number" value={gla} placeholder="Pulled from property profile or enter manually" onChange={e => setGla(e.target.value)} /></div>
          <div><Label>Outgoings (PA $)</Label><Input type="number" value={outgoings} placeholder="Pulled from NOI / lease data or enter manually" onChange={e => setOutgoings(e.target.value)} /></div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          {!hasRequiredInputs && <EmptyState />}
          <Row label="Net rent / m² / PA" value={hasRequiredInputs ? fmt(result.netRentPerSqmPa) : 'Pending'} bold />
          <Row label="Outgoings / m² / PA" value={hasRequiredInputs ? fmt(result.outgoingsPerSqmPa) : 'Pending'} muted />
          <Separator />
          <Row label="Gross rent / m² / PA" value={hasRequiredInputs ? fmt(result.grossRentPerSqmPa) : 'Pending'} highlight />
          <Row label="Benchmark notes" value={hasRequiredInputs ? 'Review against comparable industrial evidence.' : 'Pending'} muted />
          <Row label="Report summary" value={hasRequiredInputs ? 'Ready for report output.' : 'Pending'} muted />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <p className="font-semibold text-amber-200">Awaiting Industrial Inputs</p>
      <p className="text-muted-foreground">Import property size, rent, outgoings and price data to calculate industrial benchmarks.</p>
    </div>
  );
}

function Row({ label, value, bold, muted, highlight }: { label: string; value: string; bold?: boolean; muted?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center gap-4 ${highlight ? 'text-lg font-bold text-primary' : bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground text-sm' : ''}`}>
      <span>{label}</span><span className="text-right">{value}</span>
    </div>
  );
}
