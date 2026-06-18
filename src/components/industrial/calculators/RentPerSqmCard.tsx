import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { calcRentPerSqm } from '@/utils/industrial';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { prefillValue, SourceActions, SourceBadge, useCascadedIndustrialField } from './industrialMetricCascade';

const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n);
const num = (v: string) => v === '' ? 0 : Number(v);
const hasValue = (v: string) => v.trim() !== '';

export function RentPerSqmCard() {
  const { prefill } = useCalculatorPrefill();

  const baseRent = useCascadedIndustrialField(prefill, [
    { value: prefill?.grossPassingRentPa, source: 'NOI Tab' },
    { value: prefill?.marketRentPa, source: 'NOI Tab' },
    { value: prefillValue(prefill, 'scrapedRentalPa'), source: 'Scraped' },
    { value: prefillValue(prefill, 'leaseExtractedBaseRentPa'), source: 'Lease Extracted' },
  ]);

  const gla = useCascadedIndustrialField(prefill, [
    { value: prefill?.glaSqm, source: 'Property Profile' },
    { value: prefillValue(prefill, 'scrapedGlaSqm'), source: 'Scraped' },
    { value: prefill?.gfaSqm ?? prefill?.nlaSqm, source: 'Property Profile' },
    { value: prefillValue(prefill, 'buildingAreaSqm'), source: 'Scraped' },
  ]);

  const outgoings = useCascadedIndustrialField(prefill, [
    { value: prefill?.recoveredOutgoingsPa, source: 'NOI Tab' },
    { value: prefillValue(prefill, 'leaseScrapedOutgoingsPa'), source: 'Scraped' },
    { value: prefillValue(prefill, 'outgoingsStatementPa'), source: 'Lease Extracted' },
  ]);

  const hasRequiredInputs = hasValue(baseRent.value) && hasValue(gla.value) && hasValue(outgoings.value);

  const result = useMemo(() => calcRentPerSqm({
    baseRentPa: num(baseRent.value),
    glaSqm: num(gla.value),
    outgoingsPa: num(outgoings.value),
  }), [baseRent.value, gla.value, outgoings.value]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rent per m² (GLA)</CardTitle>
        <CardDescription>Convert annual rent and outgoings into industrial $/m² benchmarks.</CardDescription>
        <div className="pt-2"><SaveBackButton label="Save Back to Property" build={() => ({ gla_sqm: num(gla.value) || undefined })} /></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <CascadedInput label="Base Rent (PA $)" value={baseRent.value} placeholder="Pulled from NOI tab or enter manually" source={baseRent.source} onChange={baseRent.setValue} onVerify={baseRent.markVerified} />
          <SourceActions field={baseRent} />
          <CascadedInput label="GLA (m²)" value={gla.value} placeholder="Pulled from property profile or enter manually" source={gla.source} onChange={gla.setValue} onVerify={gla.markVerified} />
          <SourceActions field={gla} />
          <CascadedInput label="Outgoings (PA $)" value={outgoings.value} placeholder="Pulled from NOI / lease data or enter manually" source={outgoings.source} onChange={outgoings.setValue} onVerify={outgoings.markVerified} />
          <SourceActions field={outgoings} />
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

function CascadedInput({ label, value, placeholder, source, onChange, onVerify }: { label: string; value: string; placeholder: string; source: Parameters<typeof SourceBadge>[0]['source']; onChange: (value: string) => void; onVerify: () => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-1"><SourceBadge source={source} /><button type="button" className="text-[10px] text-primary hover:underline" onClick={onVerify}>Verify</button></div>
      </div>
      <Input type="number" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
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

function Row({ label, value, bold, muted, highlight }: { label: string; value: string; bold?: boolean; muted?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center gap-4 ${highlight ? 'text-lg font-bold text-primary' : bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground text-sm' : ''}`}>
      <span>{label}</span><span className="text-right">{value}</span>
    </div>
  );
}
