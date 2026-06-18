import { useMemo } from 'react';
import { Info, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { calcSiteMetrics } from '@/utils/industrial';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { IndustrialMetricAiWorkflow, type IndustrialMetricAiAction } from './IndustrialMetricAiWorkflow';
import { formatCurrency, formatPercent, parseMetricNumber, prefillValue, SourceActions, SourceBadge, useCascadedIndustrialField, type IndustrialMetricSource } from './industrialMetricCascade';

type Tone = 'preliminary' | 'verified' | 'critical';

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

  const parsed = useMemo(() => ({
    gla: parseMetricNumber(gla.value),
    site: parseMetricNumber(site.value),
    hardstand: parseMetricNumber(hardstand.value),
    officePct: parseMetricNumber(office.value),
    officeArea: parseMetricNumber(String(prefillValue(prefill, 'officeAreaSqm') ?? '')),
    price: parseMetricNumber(price.value),
  }), [gla.value, site.value, hardstand.value, office.value, price.value, prefill]);

  const hasGlaZero = parsed.gla !== null && parsed.gla <= 0;
  const hasSiteZero = parsed.site !== null && parsed.site <= 0;
  const hasCriticalIssue = hasGlaZero || hasSiteZero;
  const allVerified = [gla.source, site.source, hardstand.source, office.source, price.source].every((source) => source === 'Verified');
  const benchmarkTone: Tone = hasCriticalIssue ? 'critical' : allVerified ? 'verified' : 'preliminary';

  const siteCover = parsed.gla !== null && parsed.site !== null && parsed.site > 0 ? (parsed.gla / parsed.site) * 100 : null;
  const hardstandRatio = parsed.hardstand !== null && parsed.site !== null && parsed.site > 0 ? (parsed.hardstand / parsed.site) * 100 : null;
  const officeRatio = parsed.officeArea !== null && parsed.gla !== null && parsed.gla > 0
    ? (parsed.officeArea / parsed.gla) * 100
    : parsed.officePct;
  const pricePerGla = parsed.price !== null && parsed.gla !== null && parsed.gla > 0 ? parsed.price / parsed.gla : null;
  const pricePerSite = parsed.price !== null && parsed.site !== null && parsed.site > 0 ? parsed.price / parsed.site : null;
  const canCalculateAll = siteCover !== null && hardstandRatio !== null && officeRatio !== null && pricePerGla !== null && pricePerSite !== null;

  const result = useMemo(() => canCalculateAll ? calcSiteMetrics({
    glaSqm: parsed.gla ?? 0,
    siteAreaSqm: parsed.site ?? 0,
    hardstandSqm: parsed.hardstand ?? 0,
    officePct: officeRatio ?? 0,
    price: parsed.price ?? 0,
  }) : null, [canCalculateAll, officeRatio, parsed.gla, parsed.hardstand, parsed.price, parsed.site]);

  const coverageBand = siteCover === null ? 'Pending' : result?.coverageBand ?? 'Pending';
  const benchmarkStatus = hasCriticalIssue ? 'Critical physical-data issue' : canCalculateAll ? (allVerified ? 'Verified benchmark' : 'Preliminary benchmark') : 'Pending';

  const aiActions: IndustrialMetricAiAction[] = [
    {
      id: 'estimate-site-area',
      label: 'Estimate site area from scrape / title',
      buildPreview: () => {
        const candidate = parsed.site ?? prefillValue(prefill, 'titleSiteAreaSqm') ?? prefillValue(prefill, 'scrapedSiteAreaSqm');
        if (!candidate || !prefill) return null;
        return buildPreview('estimate-site-area', 'Estimate site area from scrape / title', String(candidate), `${Math.round(candidate * 0.98).toLocaleString()}–${Math.round(candidate * 1.02).toLocaleString()} m²`, 'AI Estimate', 'Uses linked title, property profile or scraped site-area references where available.', [`Address ${prefill.address}`, `Site area ${candidate} m²`], ['Current title plan confirmation'], ['Confirm against title, survey or contract before relying on site-based benchmarks.'], site);
      },
    },
    {
      id: 'estimate-hardstand',
      label: 'Estimate hardstand area',
      buildPreview: () => {
        const candidate = parsed.hardstand ?? prefillValue(prefill, 'aiEstimatedHardstandSqm') ?? (parsed.site !== null && parsed.gla !== null ? Number(Math.max(parsed.site - parsed.gla, 0).toFixed(2)) : null);
        if (candidate === null || !prefill) return null;
        return buildPreview('estimate-hardstand', 'Estimate hardstand area', String(candidate), `${Math.round(candidate * 0.8).toLocaleString()}–${Math.round(candidate * 1.2).toLocaleString()} m²`, 'AI Estimate', 'Uses hardstand profile data, listing/site description or residual site area after building footprint as a preliminary yard proxy.', [`Site area ${parsed.site ?? 'unknown'} m²`, `GLA ${parsed.gla ?? 'unknown'} m²`], ['Measured hardstand plan', 'Hardstand quality and surface condition'], ['Confirm sealed usable yard area and exclude landscaping, easements and unusable circulation.'], hardstand);
      },
    },
    {
      id: 'estimate-office',
      label: 'Estimate office component',
      buildPreview: () => {
        const candidate = parsed.officePct ?? prefillValue(prefill, 'aiEstimatedOfficePct') ?? (parsed.officeArea !== null && parsed.gla !== null && parsed.gla > 0 ? Number(((parsed.officeArea / parsed.gla) * 100).toFixed(2)) : null);
        if (candidate === null || !prefill) return null;
        return buildPreview('estimate-office', 'Estimate office component', String(candidate), `${Math.max(candidate - 2, 0).toFixed(1)}%–${(candidate + 2).toFixed(1)}%`, 'AI Estimate', 'Uses profile office percentage, floor-plan office area or listing/floor-plan context where available.', [`GLA ${parsed.gla ?? 'unknown'} m²`, `Office area ${parsed.officeArea ?? 'unknown'} m²`], ['Measured office area', 'Floor plan split by warehouse and office'], ['Confirm mezzanine and amenities treatment before relying on office ratio.'], office);
      },
    },
    {
      id: 'estimate-price-benchmark',
      label: 'Estimate price per m² benchmark',
      buildPreview: () => {
        if (!prefill || pricePerGla === null || pricePerSite === null) return null;
        return buildPreview('estimate-price-benchmark', 'Estimate price per m² benchmark', `${formatCurrency(pricePerGla, 0)} / m² GLA`, `${formatCurrency(pricePerGla * 0.9, 0)}–${formatCurrency(pricePerGla * 1.1, 0)} / m² GLA`, 'Research Engine', 'Uses purchase price, parsed GLA and site area as a benchmark proxy pending industrial comparable sales evidence.', [`Price ${formatCurrency(parsed.price, 0)}`, `GLA ${parsed.gla} m²`, `Site ${parsed.site} m²`], ['Verified comparable sale set', 'Adjustment for zoning, clearance, access and lease profile'], ['Benchmark should be compared against recent industrial sales evidence before use.']);
      },
    },
    {
      id: 'estimate-site-cover-benchmark',
      label: 'Estimate site cover benchmark',
      buildPreview: () => {
        if (!prefill || siteCover === null) return null;
        return buildPreview('estimate-site-cover-benchmark', 'Estimate site cover benchmark', `${siteCover.toFixed(2)}%`, `${Math.max(siteCover - 5, 0).toFixed(2)}%–${(siteCover + 5).toFixed(2)}%`, 'Research Engine', 'Uses parsed GLA and site area to benchmark site cover against industrial usability expectations.', [`GLA ${parsed.gla} m²`, `Site ${parsed.site} m²`], ['Comparable site cover evidence', 'Truck access and hardstand quality'], ['Review against access, loading, hardstand and zoning before relying on density benchmarks.']);
      },
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Cover & $/m²</CardTitle>
        <CardDescription>Industrial site density, hardstand ratio and price-per-area benchmarks.</CardDescription>
        <div className="pt-2"><SaveBackButton label="Save Back to Property" build={() => ({ gla_sqm: parsed.gla && parsed.gla > 0 ? parsed.gla : undefined, site_area_sqm: parsed.site && parsed.site > 0 ? parsed.site : undefined, hardstand_sqm: parsed.hardstand ?? undefined, office_pct: parsed.officePct ?? undefined, site_cover_pct: siteCover !== null ? Number(siteCover.toFixed(2)) : undefined, purchase_price: parsed.price ?? undefined })} /></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <IndustrialMetricAiWorkflow actions={aiActions} />
          <div className="grid grid-cols-2 gap-3">
            <div><CascadedInput label="GLA (m²)" value={gla.value} placeholder="Pulled from property profile or enter manually" source={gla.source} onChange={gla.setValue} onVerify={gla.markVerified} /><SourceActions field={gla} /></div>
            <div><CascadedInput label="Site Area (m²)" value={site.value} placeholder="Pulled from property profile or enter manually" source={site.source} onChange={site.setValue} onVerify={site.markVerified} /><SourceActions field={site} /></div>
            <div><CascadedInput label="Hardstand (m²)" value={hardstand.value} placeholder="Pulled from property profile or enter manually" source={hardstand.source} onChange={hardstand.setValue} onVerify={hardstand.markVerified} /><SourceActions field={hardstand} /></div>
            <div><CascadedInput label="Office (%)" value={office.value} placeholder="Enter office component percentage" source={office.source} onChange={office.setValue} onVerify={office.markVerified} step="0.1" /><SourceActions field={office} /></div>
            <div className="col-span-2"><CascadedInput label="Price ($)" value={price.value} placeholder="Pulled from property profile or enter manually" source={price.source} onChange={price.setValue} onVerify={price.markVerified} /><SourceActions field={price} /></div>
          </div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          {!canCalculateAll && <EmptyState critical={hasCriticalIssue} />}
          <OutputRow label="Site Cover" tooltip="GLA m² ÷ site area m²." value={formatPercent(siteCover)} tone={benchmarkTone} bold />
          <div className="flex justify-between items-center gap-4">
            <span className="flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" />Coverage Band<Badge variant="outline" className="ml-1 text-[10px]">Calculated</Badge></span>
            {coverageBand === 'Pending' ? <span className="text-muted-foreground text-sm">Pending</span> : <Badge variant={result?.coverageBand === 'over-developed' ? 'destructive' : 'secondary'} className="capitalize">{coverageBand}</Badge>}
          </div>
          <OutputRow label="Hardstand Ratio" tooltip="Hardstand m² ÷ site area m²." value={formatPercent(hardstandRatio)} tone={benchmarkTone} muted />
          <OutputRow label="Office Ratio" tooltip="Office area m² ÷ GLA m², or office % where office area is unavailable." value={formatPercent(officeRatio)} tone={benchmarkTone} muted />
          <Separator />
          <OutputRow label="$/m² GLA" tooltip="Purchase price ÷ GLA m²." value={formatCurrency(pricePerGla, 0)} tone={benchmarkTone} />
          <OutputRow label="$/m² Site" tooltip="Purchase price ÷ site area m²." value={formatCurrency(pricePerSite, 0)} tone={benchmarkTone} />
          <OutputRow label="Benchmark status" value={benchmarkStatus} tone={benchmarkTone} muted />
          <OutputRow label="Report summary" value={canCalculateAll ? (allVerified ? 'Verified for report output.' : 'Preliminary — verify inputs before relying on report output.') : 'Pending'} tone={benchmarkTone} muted />
        </div>
      </CardContent>
    </Card>
  );
}


function buildPreview(actionId: string, label: string, suggestedValue: string, suggestedBenchmarkRange: string, source: 'AI Estimate' | 'Research Engine', sourceBasis: string, dataPointsUsed: string[], missingData: string[], riskNotes: string[], targetField?: ReturnType<typeof useCascadedIndustrialField>) {
  return {
    actionId,
    label,
    suggestedValue,
    suggestedBenchmarkRange,
    confidence: dataPointsUsed.length >= 3 ? 'High' as const : 'Medium' as const,
    source,
    sourceBasis,
    dataPointsUsed: dataPointsUsed.filter(Boolean),
    missingData: missingData.filter(Boolean),
    riskNotes,
    verificationRequirements: ['Verify against property profile, scrape, title/floor plan and relevant industrial comparable evidence before marking as verified.'],
    targetField,
  };
}

function CascadedInput({ label, value, placeholder, source, onChange, onVerify, step }: { label: string; value: string; placeholder: string; source: IndustrialMetricSource; onChange: (value: string) => void; onVerify: () => void; step?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-1"><SourceBadge source={source} /><button type="button" className="text-[10px] text-primary hover:underline" onClick={onVerify}>Verify</button></div>
      </div>
      <Input type="text" inputMode="decimal" step={step} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function EmptyState({ critical }: { critical: boolean }) {
  return (
    <div className={`rounded-lg border p-3 text-sm ${critical ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
      <p className={`font-semibold ${critical ? 'text-red-200' : 'text-amber-200'}`}>{critical ? 'Check Industrial Inputs' : 'Awaiting Industrial Inputs'}</p>
      <p className="text-muted-foreground">{critical ? 'GLA and site area must be greater than zero before site benchmarks can be calculated.' : 'Import property size, rent, outgoings and price data to calculate industrial benchmarks.'}</p>
    </div>
  );
}

function OutputRow({ label, value, tooltip, tone, bold, muted }: { label: string; value: string; tooltip?: string; tone: Tone; bold?: boolean; muted?: boolean }) {
  const toneClass = tone === 'critical' ? 'text-red-300' : tone === 'verified' ? 'text-green-300' : 'text-amber-300';
  return (
    <div className={`flex justify-between items-center gap-4 ${bold ? 'font-semibold' : ''} ${muted ? 'text-sm' : ''}`}>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Lock className="h-3 w-3" />
        {label}
        {tooltip && <FormulaTooltip text={tooltip} />}
        <Badge variant="outline" className="ml-1 text-[10px]">Calculated</Badge>
      </span>
      <span className={`text-right ${value === 'Pending' ? 'text-muted-foreground' : toneClass}`}>{value}</span>
    </div>
  );
}

function FormulaTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger type="button" className="text-muted-foreground hover:text-foreground"><Info className="h-3 w-3" /></TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
