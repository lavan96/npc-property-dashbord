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
import { TenYearCashFlowCard } from '@/components/commercial/calculators/TenYearCashFlowCard';
import { CommercialBorrowingCapacityCard } from '@/components/commercial/calculators/CommercialBorrowingCapacityCard';
import { CommercialIndustrialOverviewCard } from '@/components/commercial/calculators/CommercialIndustrialOverviewCard';
import { RentPerSqmCard } from '@/components/industrial/calculators/RentPerSqmCard';
import { SiteCoverCard } from '@/components/industrial/calculators/SiteCoverCard';
import {
  CalculatorPrefillProvider,
  type CalculatorDomain,
} from '@/contexts/CalculatorPrefillContext';
import { CalculatorPropertyBar } from '@/components/commercial/CalculatorPropertyBar';
import { CalculatorGuidancePanel, CalculatorTabShell } from '@/components/commercial/calculators/CalculatorLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

        <div className="space-y-3">
          <CalculatorPropertyBar />
          <div className="rounded-lg border border-primary/20 bg-card/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className="border-primary/30 text-primary">Global Input Sync available in calculators</Badge>
                <Badge variant="secondary">Assumptions, warnings and save-back actions stay tab-specific</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled title="Open a calculator tab to review that tab's assumption status.">Assumption Status</Button>
                <Button size="sm" variant="outline" disabled title="Save-back is available inside tabs once a property is linked.">Save Back to Property</Button>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/70 p-1">
          <TabsList className="h-auto min-w-max w-full justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="overview" className="h-10 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Overview</TabsTrigger>
            <TabsTrigger value="borrowing" className="h-10 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <span className="whitespace-nowrap">Borrowing Capacity</span>
            </TabsTrigger>
            <TabsTrigger value="noi" className="h-10 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <span className="whitespace-nowrap">NOI</span>
            </TabsTrigger>
            <TabsTrigger value="cap" className="h-10 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <span className="whitespace-nowrap">Cap Rate</span>
            </TabsTrigger>
            <TabsTrigger value="icr" className="h-10 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <span className="whitespace-nowrap">ICR / DSCR</span>
            </TabsTrigger>
            <TabsTrigger value="gst" className="h-10 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <span className="whitespace-nowrap">GST</span>
            </TabsTrigger>
            <TabsTrigger value="dcf" className="h-10 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <span className="whitespace-nowrap">DCF</span>
            </TabsTrigger>
            <TabsTrigger value="ten-year" className="h-10 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <span className="whitespace-nowrap">10-Year Cash Flow</span>
            </TabsTrigger>
            {domain === 'industrial' && <TabsTrigger value="rent" className="h-10 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <span className="whitespace-nowrap">Industrial Metrics</span>
            </TabsTrigger>}
          </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4"><CalculatorTabShell title="Overview Report" subtitle="Review linked-property completeness, AI estimate readiness and report actions before moving into detailed calculators. Report actions are kept at the top of the overview card to avoid duplicated action sections." chips={[domain === 'industrial' ? 'Industrial domain' : 'Commercial domain', 'Report actions first']}><CommercialIndustrialOverviewCard /></CalculatorTabShell></TabsContent>
          <TabsContent value="borrowing" className="mt-4"><CalculatorTabShell title="Borrowing Capacity Unified" subtitle="Client profile integration, scenario modelling and risk-adjusted lending outputs are grouped into a guided assessment flow." chips={["Mode + data source", "Scenario modelling", "Required documents"]}><CommercialBorrowingCapacityCard initialAssetCategory={domain} /></CalculatorTabShell></TabsContent>
          <TabsContent value="noi" className="mt-4"><CalculatorTabShell title="Net Operating Income (NOI)" subtitle="Income, vacancy, recoveries and operating expenses feed a clear NOI bridge and warning panel." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><NoiCalculatorCard /></CalculatorTabShell></TabsContent>
          <TabsContent value="cap" className="mt-4"><CalculatorTabShell title="Capitalisation Rate" subtitle="Supporting data, NOI/value inputs, target yield and sensitivity outputs remain separated." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><CapRateCalculatorCard /></CalculatorTabShell></TabsContent>
          <TabsContent value="icr" className="mt-4"><CalculatorTabShell title="ICR / DSCR" subtitle="Loan assumptions, interest/debt service and lender threshold comparisons are presented in one flow." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><IcrDscrCalculatorCard /></CalculatorTabShell></TabsContent>
          <TabsContent value="gst" className="mt-4"><CalculatorTabShell title="Goods & Services Tax" subtitle="Transaction treatment and GST assumptions sit before payable, claimable and specialist review warnings." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><GstCalculatorCard /></CalculatorTabShell></TabsContent>
          <TabsContent value="dcf" className="mt-4"><CalculatorTabShell title="Discounted Cash Flow" subtitle="Forecast assumptions are separated from cash-flow summary, NPV, IRR and terminal value outputs." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><DcfCalculatorCard /></CalculatorTabShell></TabsContent>
          <TabsContent value="ten-year" className="mt-4"><CalculatorTabShell title="10-Year Cash Flow Report" subtitle="Projection assumptions, annual rows and export-ready report outputs are grouped for readability." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><TenYearCashFlowCard /></CalculatorTabShell></TabsContent>
          {domain === 'industrial' && <TabsContent value="rent" className="mt-4"><CalculatorTabShell title="Industrial Metrics $/m² + Site Cover" subtitle="Physical property inputs and valuation/rent metrics are reviewed together for industrial assets only." chips={["Physical inputs", "$/m² metrics", "Site cover"]}><CalculatorGuidancePanel items={[{ title: 'Missing physical data', body: 'Blank GLA, site area or hardstand fields remain empty until imported or entered; placeholder text is not used in calculations.' }, { title: 'Benchmark notes', body: 'Use the outputs as a guide and confirm specialist industrial assumptions before client-facing reliance.' }, { title: 'Save-back', body: 'Each metric card keeps its own save-back action so property linkage remains explicit.' }]} /><div className="grid xl:grid-cols-2 gap-4"><RentPerSqmCard /><SiteCoverCard /></div></CalculatorTabShell></TabsContent>}
        </Tabs>
      </div>
    </CalculatorPrefillProvider>
  );
}
