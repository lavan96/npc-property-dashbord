import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { calculateNoi, type OutgoingsBreakdown } from '@/utils/commercial';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));

const OUTGOING_KEYS: Array<keyof OutgoingsBreakdown> = [
  'council', 'water', 'land_tax', 'insurance', 'management',
  'repairs_maintenance', 'utilities', 'cleaning', 'security', 'other',
];

const labelMap: Record<keyof OutgoingsBreakdown, string> = {
  council: 'Council Rates', water: 'Water', land_tax: 'Land Tax',
  insurance: 'Insurance', management: 'Management', repairs_maintenance: 'Repairs & Maint.',
  utilities: 'Utilities', cleaning: 'Cleaning', security: 'Security', other: 'Other',
};

export function NoiCalculatorCard() {
  const [grossRent, setGrossRent] = useState('250000');
  const [recovered, setRecovered] = useState('40000');
  const [other, setOther] = useState('5000');
  const [vacancy, setVacancy] = useState('5');
  const [outgoings, setOutgoings] = useState<Record<string, string>>({
    council: '12000', water: '4000', land_tax: '18000', insurance: '6000',
    management: '10000', repairs_maintenance: '8000', utilities: '0', cleaning: '3000',
    security: '0', other: '0',
  });

  const result = useMemo(() => {
    const o: OutgoingsBreakdown = {};
    OUTGOING_KEYS.forEach(k => { (o as any)[k] = num(outgoings[k] ?? '0'); });
    return calculateNoi({
      grossRentalIncome: num(grossRent),
      recoveredOutgoings: num(recovered),
      otherIncome: num(other),
      vacancyAllowancePct: num(vacancy),
      outgoings: o,
    });
  }, [grossRent, recovered, other, vacancy, outgoings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>NOI Calculator</CardTitle>
        <CardDescription>Effective Gross Income minus operating expenses.</CardDescription>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Gross Rental Income (PA)</Label><Input type="number" value={grossRent} onChange={e => setGrossRent(e.target.value)} /></div>
            <div><Label>Recovered Outgoings</Label><Input type="number" value={recovered} onChange={e => setRecovered(e.target.value)} /></div>
            <div><Label>Other Income</Label><Input type="number" value={other} onChange={e => setOther(e.target.value)} /></div>
            <div><Label>Vacancy Allowance %</Label><Input type="number" value={vacancy} onChange={e => setVacancy(e.target.value)} /></div>
          </div>
          <Separator />
          <div>
            <Label className="mb-2 block">Operating Expenses (PA)</Label>
            <div className="grid grid-cols-2 gap-2">
              {OUTGOING_KEYS.map(k => (
                <div key={k}>
                  <Label className="text-xs text-muted-foreground">{labelMap[k]}</Label>
                  <Input type="number" value={outgoings[k] ?? ''} onChange={e => setOutgoings(prev => ({ ...prev, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Potential Gross Income" value={fmt(result.potentialGrossIncome)} />
          <Row label="Vacancy Loss" value={`- ${fmt(result.vacancyLoss)}`} />
          <Row label="Recovered Outgoings" value={`+ ${fmt(result.recoveredOutgoings)}`} />
          <Row label="Effective Gross Income" value={fmt(result.effectiveGrossIncome)} bold />
          <Separator />
          <Row label="Total Outgoings" value={`- ${fmt(result.totalOutgoings)}`} />
          <Row label="Owner-Borne Outgoings" value={fmt(result.netOutgoings)} muted />
          <Separator />
          <Row label="Net Operating Income (NOI)" value={fmt(result.noi)} highlight />
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
