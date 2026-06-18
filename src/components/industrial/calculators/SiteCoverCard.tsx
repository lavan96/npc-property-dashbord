import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { calcSiteMetrics } from '@/utils/industrial';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { prefillValue, SourceActions, SourceBadge, useCascadedIndustrialField, type IndustrialMetricSource } from './industrialMetricCascade';

const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n.toFixed(2)}%`;
const num = (v: string) => v === '' ? 0 : Number(v);
const hasValue = (v: string) => v.trim() !== '';

export function SiteCoverCard() {
  const { prefill } = useCalculatorPrefill();

  const gla = useCascadedIndustrialField(prefill, [
    { value: prefill?.glaSqm, source: 'Property Profile' },
    { value: prefillValue(prefill, 'scrapedGlaSqm'), source: 'Scraped' },
    { value: prefillValue(prefill, 'buildingAreaSqm') ?? prefill?.gfaSqm ?? prefill?.nlaSqm, source: 'Property Profile' },
  ]);

  const site = useCascadedIndustrialField(prefill, [
    { value: prefill?.siteAreaSqm, source: 'Property Profile' },
    { value: prefillValue(prefill, 'titleSiteAreaSqm'), source: 'Scraped' },
    { value: prefillValue(prefill, 'scrapedSiteAreaSqm'), source: 'Scraped' },
  ]);

  const hardstand = useCascadedIndustrialField(prefill, [
    { value: prefill?.hardstandSqm, source: 'Property Profile' },
    { value: prefillValue(prefill, 'aiEstimatedHardstandSqm'), source: 'AI Estimate' },
  ]);

  const office = useCascadedIndustrialField(prefill, [
    { value: prefill?.officePct, source: 'Property Profile' },
    { value: prefillValue(prefill, 'aiEstimatedOfficePct'), source: 'AI Estimate' },
  ]);

  const price = useCascadedIndustrialField(prefill, [
    { value: prefill?.purchasePrice, source: 'Property Profile' },
    { value: prefillValue(prefill, 'capRateTabPrice') ?? prefill?.valuation, source: 'Cap Rate Tab' },
    { value: prefillValue(prefill, 'gstTabPurchasePrice'), source: 'GST Tab' },
    { value: prefillValue(prefill, 'borrowingCapacityPurchasePrice'), source: 'Borrowing Capacity' },
    { value: prefillValue(prefill, 'dcfPurchasePrice'), source: 'DCF Tab' },
  ]);

  const hasRequiredInputs = [gla.value, site.value, hardstand.value, office.value, price.value].every(hasValue);

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
    glaSqm: num(gla.value),
    siteAreaSqm: num(site.value),
    hardstandSqm: num(hardstand.value),
    officePct: num(office.value),
    price: num(price.value),
  }), [gla.value, site.value, hardstand.value, office.value, price.value]);

  const band = result.coverageBand === 'balanced' ? 'default' :
    result.coverageBand === 'over-developed' ? 'destructive' : 'secondary';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Cover & $/m²</CardTitle>
        <CardDescription>Industrial site density, hardstand ratio and price-per-area benchmarks.</CardDescription>
        <div className="pt-2"><SaveBackButton label="Save Back to Property" build={() => ({ gla_sqm: num(gla.value) || undefined, site_area_sqm: num(site.value) || undefined, hardstand_sqm: num(hardstand.value) || undefined, office_pct: num(office.value) || undefined, site_cover_pct: Number(result.siteCoverPct.toFixed(2)) || undefined, purchase_price: num(price.value) || undefined })} /></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><CascadedInput label="GLA (m²)" value={gla.value} placeholder="Pulled from property profile or enter manually" source={gla.source} onChange={gla.setValue} onVerify={gla.markVerified} /><SourceActions field={gla} /></div>
            <div><CascadedInput label="Site Area (m²)" value={site.value} placeholder="Pulled from property profile or enter manually" source={site.source} onChange={site.setValue} onVerify={site.markVerified} /><SourceActions field={site} /></div>
            <div><CascadedInput label="Hardstand (m²)" value={hardstand.value} placeholder="Pulled from property profile or enter manually" source={hardstand.source} onChange={hardstand.setValue} onVerify={hardstand.markVerified} /><SourceActions field={hardstand} /></div>
            <div><CascadedInput label="Office (%)" value={office.value} placeholder="Enter office component percentage" source={office.source} onChange={office.setValue} onVerify={office.markVerified} step="0.1" /><SourceActions field={office} /></div>
            <div className="col-span-2"><CascadedInput label="Price ($)" value={price.value} placeholder="Pulled from property profile or enter manually" source={price.source} onChange={price.setValue} onVerify={price.markVerified} /><SourceActions field={price} /></div>
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

function CascadedInput({ label, value, placeholder, source, onChange, onVerify, step }: { label: string; value: string; placeholder: string; source: IndustrialMetricSource; onChange: (value: string) => void; onVerify: () => void; step?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-1"><SourceBadge source={source} /><button type="button" className="text-[10px] text-primary hover:underline" onClick={onVerify}>Verify</button></div>
      </div>
      <Input type="number" step={step} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
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
