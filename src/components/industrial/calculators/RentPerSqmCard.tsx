import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { calcRentPerSqm } from '@/utils/industrial';
import { useApplyPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';

const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n || 0);
const num = (v: string) => v === '' ? 0 : Number(v);

export function RentPerSqmCard() {
  const [baseRent, setBaseRent] = useState('220000');
  const [gla, setGla] = useState('1800');
  const [outgoings, setOutgoings] = useState('25000');

  useApplyPrefill((p) => {
    if (p.glaSqm != null) setGla(String(p.glaSqm));
    if (p.grossPassingRentPa != null) setBaseRent(String(p.grossPassingRentPa));
    if (p.recoveredOutgoingsPa != null) setOutgoings(String(p.recoveredOutgoingsPa));
  });

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
        <div className="pt-2"><SaveBackButton build={() => ({ gla_sqm: num(gla) || undefined })} /></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div><Label>Base Rent (PA $)</Label><Input type="number" value={baseRent} onChange={e => setBaseRent(e.target.value)} /></div>
          <div><Label>GLA (m²)</Label><Input type="number" value={gla} onChange={e => setGla(e.target.value)} /></div>
          <div><Label>Outgoings (PA $)</Label><Input type="number" value={outgoings} onChange={e => setOutgoings(e.target.value)} /></div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Net rent / m² / PA" value={fmt(result.netRentPerSqmPa)} bold />
          <Row label="Outgoings / m² / PA" value={fmt(result.outgoingsPerSqmPa)} muted />
          <Separator />
          <Row label="Gross rent / m² / PA" value={fmt(result.grossRentPerSqmPa)} highlight />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold, muted, highlight }: { label: string; value: string; bold?: boolean; muted?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${highlight ? 'text-lg font-bold text-primary' : bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground text-sm' : ''}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
