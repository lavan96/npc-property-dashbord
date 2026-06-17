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

const calculatorTabs = [
  { value: 'overview', label: 'Overview', subLabel: '(Report)' },
  { value: 'borrowing', label: 'Borrowing Capacity', subLabel: '(Unified)' },
  { value: 'noi', label: 'Net Operating Income', subLabel: '(NOI)' },
  { value: 'cap', label: 'Capitalisation Rate', subLabel: '(Cap Rate)' },
  { value: 'icr', label: 'Interest / Debt Service Coverage', subLabel: '(ICR / DSCR)' },
  { value: 'gst', label: 'Goods & Services Tax', subLabel: '(GST)' },
  { value: 'dcf', label: 'Discounted Cash Flow', subLabel: '(DCF)' },
  { value: 'ten-year', label: '10-Year Cash Flow', subLabel: '(Report)' },
  { value: 'rent', label: 'Industrial Metrics', subLabel: '($/m² + Site Cover)' },
] as const;

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
        <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="rounded-2xl border border-primary/15 bg-card/60 p-5 md:p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
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
          <div className="shrink-0 rounded-xl border border-border/70 bg-background/35 p-3">
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
        </div>

        <div className="space-y-4">
          <CalculatorPropertyBar />
          <div className="rounded-xl border border-primary/20 bg-card/75 p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Global calculator status</div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Global Input Sync available in calculators</Badge>
                  <Badge variant="secondary">Assumptions, warnings and save-back stay tab-specific</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Open a calculator tab to review its assumptions, missing data, AI estimates and property save-back controls.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button size="sm" variant="outline" disabled title="Open a calculator tab to review that tab's assumption status.">Assumption Status</Button>
                <Button size="sm" variant="outline" disabled title="Save-back is available inside tabs once a property is linked.">Save Back to Property</Button>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/75 p-2 shadow-sm">
          <TabsList className="h-auto min-w-max w-full justify-start gap-2 bg-transparent p-0">
            {calculatorTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="group/tab h-16 min-w-[150px] shrink-0 rounded-lg px-4 py-2 text-center data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <span className="flex w-full flex-col items-center justify-center gap-0.5 leading-tight">
                  <span className="whitespace-nowrap text-sm font-semibold">{tab.label}</span>
                  <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground group-data-[state=active]/tab:text-primary-foreground/80">
                    {tab.subLabel}
                  </span>
                </span>
              </TabsTrigger>
            ))}
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
          <TabsContent value="rent" className="mt-4"><CalculatorTabShell title="Industrial Metrics $/m² + Site Cover" subtitle="Physical property inputs and valuation/rent metrics are reviewed together. Blank or unlinked industrial fields remain empty until imported or entered." chips={["Physical inputs", "$/m² metrics", "Site cover"]}><CalculatorGuidancePanel items={[{ title: 'Missing physical data', body: 'Property-level information is incomplete. Add or import property details before relying on this calculation.' }, { title: 'Benchmark notes', body: 'Use the outputs as a guide and confirm specialist industrial assumptions before client-facing reliance.' }, { title: 'Save-back', body: 'Each metric card keeps its own save-back action so property linkage remains explicit.' }]} /><div className="grid gap-4 xl:grid-cols-2"><RentPerSqmCard /><SiteCoverCard /></div></CalculatorTabShell></TabsContent>
        </Tabs>
        </div>
      </div>
    </CalculatorPrefillProvider>
  );
}
