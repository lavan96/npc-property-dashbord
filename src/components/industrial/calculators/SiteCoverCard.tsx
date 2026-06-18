import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { calcSiteMetrics } from '@/utils/industrial';
import { useApplyPrefill, useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';

const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n.toFixed(2)}%`;
const num = (v: string) => v === '' ? 0 : Number(v);
const hasValue = (v: string) => v.trim() !== '';

export function SiteCoverCard() {
  const { prefill } = useCalculatorPrefill();
  const [gla, setGla] = useState('');
  const [site, setSite] = useState('');
  const [hardstand, setHardstand] = useState('');
  const [office, setOffice] = useState('');
  const [price, setPrice] = useState('');

  useApplyPrefill((p) => {
    if (p.glaSqm != null) setGla(String(p.glaSqm));
    if (p.siteAreaSqm != null) setSite(String(p.siteAreaSqm));
    if (p.hardstandSqm != null) setHardstand(String(p.hardstandSqm));
    if (p.officePct != null) setOffice(String(p.officePct));
    const px = p.purchasePrice ?? p.valuation;
    if (px != null) setPrice(String(px));
  });

  useEffect(() => {
    if (!prefill) {
      setGla('');
      setSite('');
      setHardstand('');
      setOffice('');
      setPrice('');
    }
  }, [prefill]);

  const hasRequiredInputs = [gla, site, hardstand, office, price].every(hasValue);

  const result = useMemo(() => calcSiteMetrics({
    glaSqm: num(gla),
    siteAreaSqm: num(site),
    hardstandSqm: num(hardstand),
    officePct: num(office),
    price: num(price),
  }), [gla, site, hardstand, office, price]);

  const band = result.coverageBand === 'balanced' ? 'default' :
    result.coverageBand === 'over-developed' ? 'destructive' : 'secondary';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Cover & $/m²</CardTitle>
        <CardDescription>Industrial site density, hardstand ratio and price-per-area benchmarks.</CardDescription>
        <div className="pt-2"><SaveBackButton label="Save Back to Property" build={() => ({ gla_sqm: num(gla) || undefined, site_area_sqm: num(site) || undefined, hardstand_sqm: num(hardstand) || undefined, office_pct: num(office) || undefined, site_cover_pct: Number(result.siteCoverPct.toFixed(2)) || undefined, purchase_price: num(price) || undefined })} /></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>GLA (m²)</Label><Input type="number" value={gla} placeholder="Pulled from property profile or enter manually" onChange={e => setGla(e.target.value)} /></div>
            <div><Label>Site Area (m²)</Label><Input type="number" value={site} placeholder="Pulled from property profile or enter manually" onChange={e => setSite(e.target.value)} /></div>
            <div><Label>Hardstand (m²)</Label><Input type="number" value={hardstand} placeholder="Pulled from property profile or enter manually" onChange={e => setHardstand(e.target.value)} /></div>
            <div><Label>Office (%)</Label><Input type="number" step="0.1" value={office} placeholder="Enter office component percentage" onChange={e => setOffice(e.target.value)} /></div>
            <div className="col-span-2"><Label>Price ($)</Label><Input type="number" value={price} placeholder="Pulled from property profile or enter manually" onChange={e => setPrice(e.target.value)} /></div>
          </div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          {!hasRequiredInputs && <EmptyState />}
          <Row label="Site Cover" value={hasRequiredInputs ? pct(result.siteCoverPct) : 'Pending'} bold />
          <div className="flex justify-between items-center">
            <span>Coverage Band</span>
            {hasRequiredInputs ? <Badge variant={band as any} className="capitalize">{result.coverageBand}</Badge> : <span className="text-muted-foreground text-sm">Pending</span>}
          </div>
          <Row label="Hardstand Ratio" value={hasRequiredInputs ? pct(result.hardstandRatioPct) : 'Pending'} muted />
          <Row label="Office %" value={hasRequiredInputs ? pct(result.officePct) : 'Pending'} muted />
          <Separator />
          <Row label="$/m² GLA" value={hasRequiredInputs ? fmt(result.pricePerSqmGla) : 'Pending'} />
          <Row label="$/m² Site" value={hasRequiredInputs ? fmt(result.pricePerSqmSite) : 'Pending'} />
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

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between items-center gap-4 ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground text-sm' : ''}`}>
      <span>{label}</span><span className="text-right">{value}</span>
    </div>
  );
}
