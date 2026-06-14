/**
 * PropertyCalculators
 * -------------------
 * Unified Commercial + Industrial calculator suite. Replaces the split
 * /commercial/calculators and /industrial/calculators pages with a single
 * page that exposes every calculator and lets the user pick the asset
 * domain (commercial or industrial) for property prefill.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NoiCalculatorCard } from '@/components/commercial/calculators/NoiCalculatorCard';
import { CapRateCalculatorCard } from '@/components/commercial/calculators/CapRateCalculatorCard';
import { IcrDscrCalculatorCard } from '@/components/commercial/calculators/IcrDscrCalculatorCard';
import { GstCalculatorCard } from '@/components/commercial/calculators/GstCalculatorCard';
import { DcfCalculatorCard } from '@/components/commercial/calculators/DcfCalculatorCard';
import { CommercialBorrowingCapacityCard } from '@/components/commercial/calculators/CommercialBorrowingCapacityCard';
import { CommercialIndustrialOverviewCard } from '@/components/commercial/calculators/CommercialIndustrialOverviewCard';
import { RentPerSqmCard } from '@/components/industrial/calculators/RentPerSqmCard';
import { SiteCoverCard } from '@/components/industrial/calculators/SiteCoverCard';
import {
  CalculatorPrefillProvider,
  type CalculatorDomain,
} from '@/contexts/CalculatorPrefillContext';
import { CalculatorPropertyBar } from '@/components/commercial/CalculatorPropertyBar';

export default function PropertyCalculators() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Domain is sticky via ?domain= so links from detail pages land on the right context.
  const initialDomain: CalculatorDomain = useMemo(() => {
    const q = searchParams.get('domain');
    return q === 'industrial' ? 'industrial' : 'commercial';
  }, []);
  const [domain, setDomain] = useState<CalculatorDomain>(initialDomain);

  useEffect(() => {
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('domain', domain);
        return n;
      },
      { replace: true },
    );
  }, [domain, setSearchParams]);

  return (
    // Re-mount the provider when domain changes so prefill/property reload cleanly.
    <CalculatorPrefillProvider key={domain} domain={domain}>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Calculator className="h-7 w-7 text-primary" />
              Commercial &amp; Industrial Calculators
            </h1>
            <p className="text-muted-foreground mt-1 max-w-3xl">
              Borrowing capacity, NOI, cap rate, ICR/DSCR, GST, DCF, $/m² rent
              and site cover — one suite for both asset classes. Pick a domain,
              link a saved property to prefill every tab, then push results
              back when you&apos;re happy.
            </p>
          </div>
          <div className="shrink-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
              Property domain
            </div>
            <ToggleGroup
              type="single"
              value={domain}
              onValueChange={(v) => v && setDomain(v as CalculatorDomain)}
              className="border rounded-md"
            >
              <ToggleGroupItem value="commercial" className="px-4">
                Commercial
              </ToggleGroupItem>
              <ToggleGroupItem value="industrial" className="px-4">
                Industrial
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <CalculatorPropertyBar />

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start gap-1 overflow-x-auto">
            <TabsTrigger value="overview" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
              <span className="whitespace-nowrap">Overview</span>
              <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">Report</span>
            </TabsTrigger>
            <TabsTrigger value="borrowing" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
              <span className="whitespace-nowrap">Borrowing Capacity</span>
              <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">Unified</span>
            </TabsTrigger>
            <TabsTrigger value="noi" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
              <span className="whitespace-nowrap">Net Operating Income</span>
              <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(NOI)</span>
            </TabsTrigger>
            <TabsTrigger value="cap" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
              <span className="whitespace-nowrap">Capitalisation Rate</span>
              <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(Cap Rate)</span>
            </TabsTrigger>
            <TabsTrigger value="icr" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
              <span className="whitespace-nowrap">Interest / Debt Service Coverage</span>
              <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(ICR / DSCR)</span>
            </TabsTrigger>
            <TabsTrigger value="gst" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
              <span className="whitespace-nowrap">Goods &amp; Services Tax</span>
              <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(GST)</span>
            </TabsTrigger>
            <TabsTrigger value="dcf" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
              <span className="whitespace-nowrap">Discounted Cash Flow</span>
              <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(DCF)</span>
            </TabsTrigger>
            {domain === 'industrial' && <TabsTrigger value="rent" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
              <span className="whitespace-nowrap">Industrial Metrics</span>
              <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">$/m² + Site Cover</span>
            </TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="mt-4"><CommercialIndustrialOverviewCard /></TabsContent>
          <TabsContent value="borrowing" className="mt-4"><CommercialBorrowingCapacityCard initialAssetCategory={domain} /></TabsContent>
          <TabsContent value="noi" className="mt-4"><NoiCalculatorCard /></TabsContent>
          <TabsContent value="cap" className="mt-4"><CapRateCalculatorCard /></TabsContent>
          <TabsContent value="icr" className="mt-4"><IcrDscrCalculatorCard /></TabsContent>
          <TabsContent value="gst" className="mt-4"><GstCalculatorCard /></TabsContent>
          <TabsContent value="dcf" className="mt-4"><DcfCalculatorCard /></TabsContent>
          {domain === 'industrial' && <TabsContent value="rent" className="mt-4"><div className="grid xl:grid-cols-2 gap-4"><RentPerSqmCard /><SiteCoverCard /></div></TabsContent>}
        </Tabs>
      </div>
    </CalculatorPrefillProvider>
  );
}
