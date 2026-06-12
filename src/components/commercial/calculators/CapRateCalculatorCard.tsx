import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { calculateYields, valueFromCap, calculateCapRateEngine } from '@/utils/commercial';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));

export function CapRateCalculatorCard() {
  const [passingNoi, setPassingNoi] = useState('180000');
  const [marketNoi, setMarketNoi] = useState('210000');
  const [price, setPrice] = useState('3000000');
  const [targetCap, setTargetCap] = useState('6.5');

  const yields = useMemo(() => calculateYields({
    passingNoi: num(passingNoi), marketNoi: num(marketNoi), price: num(price),
  }), [passingNoi, marketNoi, price]);

  const valuation = useMemo(() => valueFromCap(num(marketNoi), num(targetCap)), [marketNoi, targetCap]);
  const capAssessment = useMemo(() => calculateCapRateEngine({ passingNoi: num(passingNoi), marketNoi: num(marketNoi), selectedNoi: num(marketNoi), price: num(price), targetCapRatePct: num(targetCap), sensitivityCapRatesPct: [5.5, 6, 6.5, 7, 7.5], aiBenchmark: true }), [passingNoi, marketNoi, price, targetCap]);
  const reversionarySpread = (yields.reversionaryYield - yields.passingYield).toFixed(2);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cap Rate & Yield</CardTitle>
        <CardDescription>Passing, reversionary and Blended Yield / Simple Average Yield. Benchmark only — valuer confirmation required.</CardDescription><div className="flex flex-wrap gap-2 pt-2"><Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge><Badge variant="secondary">AI Estimate benchmark only</Badge><Button size="sm" variant="outline">Estimate cap rate range</Button></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div><Label>Passing NOI (PA)</Label><Input type="number" value={passingNoi} onChange={e => setPassingNoi(e.target.value)} /></div>
          <div><Label>Market NOI (PA)</Label><Input type="number" value={marketNoi} onChange={e => setMarketNoi(e.target.value)} /></div>
          <div><Label>Price / Value</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
          <Separator />
          <div><Label>Target Cap Rate %</Label><Input type="number" step="0.1" value={targetCap} onChange={e => setTargetCap(e.target.value)} /></div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Passing Yield" value={`${yields.passingYield}%`} />
          <Row label="Reversionary Yield" value={`${yields.reversionaryYield}%`} />
          <Row label="Blended Yield / Simple Average Yield" value={`${yields.blendedYield}%`} bold />
          <Row label="Reversion Spread" value={`${reversionarySpread}%`} muted />
          <Separator />
          <Row label={`Implied Value @ ${targetCap || 0}%`} value={fmt(valuation)} highlight />
          <Row label="Valuation Gap" value={fmt(capAssessment.valuationGap)} />
          <Separator />
          <div className="text-xs text-muted-foreground space-y-1"><div className="font-medium text-foreground">Value Sensitivity</div>{capAssessment.valueSensitivity.map(row => <div key={row.capRatePct} className="flex justify-between"><span>{row.capRatePct}%</span><span>{fmt(row.impliedValue)}</span></div>)}</div>
          <p className="text-xs text-amber-200">Benchmark only — valuer confirmation required.</p>
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
