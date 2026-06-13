import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { calcSiteMetrics } from '@/utils/industrial';
import { useApplyPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';

const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
const pct = (n: number) => `${(n || 0).toFixed(2)}%`;
const num = (v: string) => v === '' ? 0 : Number(v);

export function SiteCoverCard() {
  const [gla, setGla] = useState('5000');
  const [site, setSite] = useState('12000');
  const [hardstand, setHardstand] = useState('3000');
  const [office, setOffice] = useState('8');
  const [price, setPrice] = useState('9500000');

  useApplyPrefill((p) => {
    if (p.glaSqm != null) setGla(String(p.glaSqm));
    if (p.siteAreaSqm != null) setSite(String(p.siteAreaSqm));
    if (p.hardstandSqm != null) setHardstand(String(p.hardstandSqm));
    if (p.officePct != null) setOffice(String(p.officePct));
    const px = p.purchasePrice ?? p.valuation;
    if (px != null) setPrice(String(px));
  });

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
        <div className="pt-2"><SaveBackButton build={() => ({ gla_sqm: num(gla) || undefined, site_area_sqm: num(site) || undefined, hardstand_sqm: num(hardstand) || undefined, office_pct: num(office) || undefined, site_cover_pct: Number(result.siteCoverPct.toFixed(2)) || undefined, purchase_price: num(price) || undefined })} /></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>GLA (m²)</Label><Input type="number" value={gla} onChange={e => setGla(e.target.value)} /></div>
            <div><Label>Site Area (m²)</Label><Input type="number" value={site} onChange={e => setSite(e.target.value)} /></div>
            <div><Label>Hardstand (m²)</Label><Input type="number" value={hardstand} onChange={e => setHardstand(e.target.value)} /></div>
            <div><Label>Office (%)</Label><Input type="number" step="0.1" value={office} onChange={e => setOffice(e.target.value)} /></div>
            <div className="col-span-2"><Label>Price ($)</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
          </div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Site Cover" value={pct(result.siteCoverPct)} bold />
          <div className="flex justify-between items-center">
            <span>Coverage Band</span>
            <Badge variant={band as any} className="capitalize">{result.coverageBand}</Badge>
          </div>
          <Row label="Hardstand Ratio" value={pct(result.hardstandRatioPct)} muted />
          <Row label="Office %" value={pct(result.officePct)} muted />
          <Separator />
          <Row label="$/m² GLA" value={fmt(result.pricePerSqmGla)} />
          <Row label="$/m² Site" value={fmt(result.pricePerSqmSite)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground text-sm' : ''}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
