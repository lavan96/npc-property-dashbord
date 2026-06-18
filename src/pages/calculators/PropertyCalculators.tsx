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
import { AlertCircle, Calculator, ChevronDown, FileText, Link2, RefreshCw, Save, Sparkles } from 'lucide-react';
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
import { IndustrialMetricsReadinessProvider } from '@/components/industrial/calculators/IndustrialMetricsReadinessContext';
import {
  CalculatorPrefillProvider,
  type CalculatorDomain,
  useCalculatorPrefill,
} from '@/contexts/CalculatorPrefillContext';
import { CalculatorPropertyBar } from '@/components/commercial/CalculatorPropertyBar';
import { CalculatorGuidancePanel, CalculatorTabShell } from '@/components/commercial/calculators/CalculatorLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

function GstTreatmentOverviewPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/80 p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">GST Treatment Overview</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            A compact check of GST treatment, settlement cashflow, ITC claimability and net acquisition cost for commercial and industrial acquisitions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Cashflow</Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Claimability</Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Verification</Badge>
        </div>
      </div>

      <Collapsible open={open} onOpenChange={setOpen} className="mt-3 border-t border-border/60 pt-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-0 text-primary hover:bg-transparent hover:text-primary/80">
            Why this matters
            <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pb-1 text-xs leading-5 text-muted-foreground">
          <p>
            GST may increase settlement cashflow even where it is later claimable. Going concern treatment may remove GST from settlement if conditions are met, but it must be verified. Unknown GST treatment should be treated as a specialist review item.
          </p>
          <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
            <p>
              This output is an estimate only and must be confirmed against the contract of sale, tax invoice, GST clauses, purchaser GST registration status and solicitor/accountant advice before being relied upon.
            </p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>GST payable at settlement</li>
              <li>GST potentially claimable as an input tax credit</li>
              <li>GST settlement cashflow impact</li>
              <li>GST economic cost after claimability</li>
              <li>Net acquisition cost used for reporting and scenario modelling</li>
            </ol>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function DcfOverviewPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/80 p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Discounted Cash Flow Overview</h2>
          <div className="max-w-4xl space-y-2 text-sm leading-6 text-muted-foreground">
            <p>
              This section forecasts the expected cashflow and exit value of a commercial or industrial property over the selected hold period. It uses rental income, vacancy, capex, acquisition costs, debt assumptions and exit cap rate assumptions to estimate the investment’s return profile.
            </p>
            <p>
              The DCF model helps assess whether the asset produces sufficient cashflow and capital return over time, rather than only looking at the purchase price, yield or borrowing capacity at acquisition.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs md:justify-end">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Cashflow forecast</Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Exit value</Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Return profile</Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 lg:grid-cols-[1fr_1.1fr]">
        <div className="text-sm leading-6 text-muted-foreground">
          <p className="font-medium text-foreground">This calculator separates:</p>
          <ol className="mt-1 grid list-decimal gap-1 pl-5 text-xs leading-5 sm:grid-cols-2">
            <li>Year-by-year operating cashflow</li>
            <li>Capex and downtime impacts</li>
            <li>Unlevered return before debt</li>
            <li>Levered return after debt</li>
            <li>Terminal value at exit</li>
            <li>Net sale proceeds to equity</li>
            <li>NPV, IRR and equity multiple</li>
            <li>Sensitivity to exit cap rate and key assumptions</li>
          </ol>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          The output is a forecast only and should be reviewed against lease assumptions, market rent growth, vacancy expectations, capex requirements, funding costs and exit yield evidence before being relied upon in a client report.
        </p>
      </div>

      <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-0 text-primary hover:bg-transparent hover:text-primary/80">
            Why this matters
            <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-1 text-xs leading-5 text-muted-foreground">
          DCF is important because a commercial or industrial asset may appear attractive on yield alone, but returns can change materially once downtime, capex, debt service, exit cap rate and sale costs are included. This model helps compare base, conservative and upside scenarios before presenting the asset to a client.
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function IndustrialMetricsOverviewPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/80 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-5xl space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Industrial Metrics Overview</h2>
          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>
              This section reviews the physical efficiency and industrial usability of the asset. It converts rent, building area, site area, hardstand, office component and purchase price into practical industrial benchmarks.
            </p>
            <p>
              These metrics help assess whether the asset is appropriately priced, efficiently improved, suitable for the intended industrial use and comparable against market evidence.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs lg:justify-end">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Physical efficiency</Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Market benchmarks</Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Industrial usability</Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 lg:grid-cols-[1fr_1.1fr]">
        <div className="text-sm leading-6 text-muted-foreground">
          <p className="font-medium text-foreground">This tab separates:</p>
          <ol className="mt-1 grid list-decimal gap-1 pl-5 text-xs leading-5 sm:grid-cols-2">
            <li>Rent per m² of lettable industrial area</li>
            <li>Gross rent per m² including outgoings</li>
            <li>Site cover and hardstand ratio</li>
            <li>Office component ratio</li>
            <li>Price per m² of building area</li>
            <li>Price per m² of land / site</li>
            <li>Benchmark status and report-ready commentary</li>
          </ol>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          These outputs are physical and market benchmarks only. They should be reviewed against zoning, access, loading, clearance height, power, hardstand quality, lease structure and comparable industrial evidence before being relied upon.
        </p>
      </div>

      <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-0 text-primary hover:bg-transparent hover:text-primary/80">
            Why this matters
            <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-1 text-xs leading-5 text-muted-foreground">
          Industrial assets can look attractive on income alone but may be inefficient if the site cover, hardstand, office ratio or price per m² is outside normal market expectations. These metrics help users quickly understand whether the asset is physically and commercially practical.
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

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
      <CalculatorSuiteContent domain={domain} setDomain={setDomain} />
    </CalculatorPrefillProvider>
  );
}

function CalculatorSuiteContent({ domain, setDomain }: { domain: CalculatorDomain; setDomain: (domain: CalculatorDomain) => void }) {
  const { prefill } = useCalculatorPrefill();

  const blockedTab = (title: string) => (
    <CalculatorTabShell title={title} subtitle="Link a saved commercial or industrial property before reviewing calculated tab outputs." chips={[domain === 'industrial' ? 'Industrial domain' : 'Commercial domain', 'Property required']}>
      <NoLinkedPropertyPanel domain={domain} />
    </CalculatorTabShell>
  );

  return (
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

        <div className="space-y-3">
          <ActivePropertyHeader />
          <CalculatorPropertyBar />
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

          <TabsContent value="overview" className="mt-4">{prefill ? <CalculatorTabShell title="Overview Report" subtitle="Review linked-property completeness, AI estimate readiness and report actions before moving into detailed calculators. Report actions are kept at the top of the overview card to avoid duplicated action sections." chips={[domain === 'industrial' ? 'Industrial domain' : 'Commercial domain', 'Report actions first']}><CommercialIndustrialOverviewCard /></CalculatorTabShell> : blockedTab('Overview Report')}</TabsContent>
          <TabsContent value="borrowing" className="mt-4">{prefill ? <CalculatorTabShell title="Borrowing Capacity Unified" subtitle="Client profile integration, scenario modelling and risk-adjusted lending outputs are grouped into a guided assessment flow." chips={["Mode + data source", "Scenario modelling", "Required documents"]}><CommercialBorrowingCapacityCard initialAssetCategory={domain} /></CalculatorTabShell> : blockedTab('Borrowing Capacity Unified')}</TabsContent>
          <TabsContent value="noi" className="mt-4">{prefill ? <CalculatorTabShell title="Net Operating Income (NOI)" subtitle="Income, vacancy, recoveries and operating expenses feed a clear NOI bridge and warning panel." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><NoiCalculatorCard /></CalculatorTabShell> : blockedTab('Net Operating Income (NOI)')}</TabsContent>
          <TabsContent value="cap" className="mt-4">{prefill ? <CalculatorTabShell title="Capitalisation Rate" subtitle="Supporting data, NOI/value inputs, target yield and sensitivity outputs remain separated." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><CapRateCalculatorCard /></CalculatorTabShell> : blockedTab('Capitalisation Rate')}</TabsContent>
          <TabsContent value="icr" className="mt-4">{prefill ? <CalculatorTabShell title="ICR / DSCR" subtitle="Loan assumptions, interest/debt service and lender threshold comparisons are presented in one flow." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><IcrDscrCalculatorCard /></CalculatorTabShell> : blockedTab('ICR / DSCR')}</TabsContent>
          <TabsContent value="gst" className="mt-4">{prefill ? <CalculatorTabShell title="Goods & Services Tax" subtitle="Transaction treatment and GST assumptions sit before payable, claimable and specialist review warnings." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><GstTreatmentOverviewPanel /><GstCalculatorCard /></CalculatorTabShell> : blockedTab('Goods & Services Tax')}</TabsContent>
          <TabsContent value="dcf" className="mt-4">{prefill ? <CalculatorTabShell title="Discounted Cash Flow" subtitle="Forecast assumptions are separated from cash-flow summary, NPV, IRR and terminal value outputs." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><DcfOverviewPanel /><DcfCalculatorCard /></CalculatorTabShell> : blockedTab('Discounted Cash Flow')}</TabsContent>
          <TabsContent value="ten-year" className="mt-4">{prefill ? <CalculatorTabShell title="10-Year Cash Flow Report" subtitle="Projection assumptions, annual rows and export-ready report outputs are grouped for readability." chips={["Inputs", "Outputs", "Warnings / assumptions"]}><TenYearCashFlowCard /></CalculatorTabShell> : blockedTab('10-Year Cash Flow Report')}</TabsContent>
          <TabsContent value="rent" className="mt-4">{prefill ? <CalculatorTabShell title="Industrial Metrics $/m² + Site Cover" subtitle="Review the overview, import or enter physical inputs, validate rent and site outputs, then save report-ready metrics." chips={["Physical inputs", "$/m² metrics", "Site cover"]}><IndustrialMetricsOverviewPanel /><IndustrialMetricsReadinessProvider><CalculatorGuidancePanel items={[{ title: 'Missing physical data', body: 'Import property areas, rent, outgoings and price first; missing values remain Pending until a source or manual entry is added.' }, { title: 'Benchmark notes', body: 'Benchmark notes are collapsed by default. Expand them only when you need the plain-English interpretation and verification context.' }, { title: 'Save-back', body: 'Use the bottom save action after warnings are validated so downstream report sync remains explicit.' }]} /><div className="grid gap-4 xl:grid-cols-2"><RentPerSqmCard /><SiteCoverCard /></div></IndustrialMetricsReadinessProvider></CalculatorTabShell> : blockedTab('Industrial Metrics $/m² + Site Cover')}</TabsContent>
        </Tabs>
        </div>
      </div>
  );
}

function ActivePropertyHeader() {
  const { domain, prefill, property, loading } = useCalculatorPrefill();
  const metrics = buildActivePropertyMetrics(domain, prefill, property);
  const noPropertyMessage = 'No property linked. Add or select a commercial / industrial property to prefill the calculator suite.';

  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-card via-card/95 to-primary/5 p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-200">Active Property Header</Badge>
            <Badge variant="outline" className="bg-background/60">Domain: {domain === 'industrial' ? 'Industrial' : 'Commercial'}</Badge>
            <Badge variant="outline" className="bg-background/60">Data source: {metrics.dataSource}</Badge>
          </div>
          <div>
            <h2 className="truncate text-xl font-semibold text-foreground md:text-2xl">{prefill?.address || noPropertyMessage}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {prefill ? 'Linked property context controls calculator prefill, accepted assumptions, save-back and report generation.' : noPropertyMessage}
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <HeaderMetric label="Asset type" value={metrics.assetType} />
            <HeaderMetric label="Completeness" value={`${metrics.completeness}%`} accent={metrics.completeness >= 80 ? 'good' : metrics.completeness >= 50 ? 'warn' : 'pending'} />
            <HeaderMetric label="Assumption status" value={metrics.assumptionStatus} accent={metrics.assumptionStatus === 'Report ready' ? 'good' : 'warn'} />
            <HeaderMetric label="Last updated" value={metrics.lastUpdated} />
            <HeaderMetric label="Profile status" value={prefill ? 'Linked' : 'Not linked'} accent={prefill ? 'good' : 'pending'} />
            <HeaderMetric label="Source mix" value={metrics.dataSource} />
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:max-w-md">
          <Button size="sm" variant="default" title="Use the selector below to add or link an active property." onClick={() => document.getElementById('calculator-property-selector')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Link2 className="mr-1 h-4 w-4" />Add / link property</Button>
          <span title={!prefill ? 'Link a property before re-running extraction.' : 'Re-run extraction for the linked property.'}><Button size="sm" variant="outline" disabled={!prefill || loading} className="w-full disabled:pointer-events-none"><RefreshCw className="mr-1 h-4 w-4" />Re-run extraction</Button></span>
          <span title={!prefill ? 'Link a property before running AI estimates.' : 'Run AI estimates using the linked property context.'}><Button size="sm" variant="outline" disabled={!prefill || loading} className="w-full disabled:pointer-events-none"><Sparkles className="mr-1 h-4 w-4" />Run AI estimates</Button></span>
          <span title={!prefill ? 'Link a property before reviewing assumption status.' : metrics.assumptionStatus}><Button size="sm" variant="outline" disabled={!prefill} className="w-full disabled:pointer-events-none"><AlertCircle className="mr-1 h-4 w-4" />Assumption status</Button></span>
          <span title={!prefill ? 'Link a property before saving accepted assumptions.' : 'Save all accepted assumptions to the linked property profile.'}><Button size="sm" variant="outline" disabled={!prefill} className="w-full disabled:pointer-events-none"><Save className="mr-1 h-4 w-4" />Save all accepted</Button></span>
          <span title={!prefill ? 'Link a property before generating a report.' : 'Generate the report from linked property assumptions.'}><Button size="sm" variant="outline" disabled={!prefill} className="w-full disabled:pointer-events-none"><FileText className="mr-1 h-4 w-4" />Generate report</Button></span>
        </div>
      </div>
    </div>
  );
}

function HeaderMetric({ label, value, accent = 'neutral' }: { label: string; value: string; accent?: 'neutral' | 'good' | 'warn' | 'pending' }) {
  const accentClass = accent === 'good' ? 'text-green-200' : accent === 'warn' ? 'text-amber-200' : accent === 'pending' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border/60 bg-background/35 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold ${accentClass}`}>{value}</div>
    </div>
  );
}

function NoLinkedPropertyPanel({ domain }: { domain: CalculatorDomain }) {
  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm text-muted-foreground shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-amber-100">No property linked</h3>
          <p className="mt-1 max-w-3xl">No property linked. Add or select a commercial / industrial property to prefill the calculator suite.</p>
          <p className="mt-2 text-xs">Calculated outputs are hidden until a {domain} property profile is linked, preventing hardcoded or demo values from appearing in calculator tabs.</p>
        </div>
        <Badge variant="outline" className="border-amber-500/30 bg-background/50 text-amber-100">Property required</Badge>
      </div>
    </div>
  );
}

function buildActivePropertyMetrics(domain: CalculatorDomain, prefill: ReturnType<typeof useCalculatorPrefill>['prefill'], property: ReturnType<typeof useCalculatorPrefill>['property']) {
  if (!prefill) {
    return {
      assetType: domain === 'industrial' ? 'Industrial property' : 'Commercial property',
      dataSource: 'Manual',
      completeness: 0,
      assumptionStatus: 'Property required',
      lastUpdated: 'Pending',
    };
  }

  const dataPoints = [
    prefill.address,
    prefill.assetSubtype,
    prefill.purchasePrice ?? prefill.valuation,
    prefill.glaSqm ?? prefill.nlaSqm ?? prefill.gfaSqm,
    prefill.siteAreaSqm,
    prefill.grossPassingRentPa ?? prefill.marketRentPa ?? prefill.passingNoi ?? prefill.marketNoi,
    prefill.gstTreatment,
    prefill.zoning,
    prefill.yearBuilt,
    prefill.conditionRating,
  ];
  const completeness = Math.round((dataPoints.filter((value) => value !== null && value !== undefined && value !== '').length / dataPoints.length) * 100);
  const notes = String((property as any)?.notes ?? '').toLowerCase();
  const specs = JSON.stringify((property as any)?.industrial_specs ?? {}).toLowerCase();
  const sourceHints = [
    'Property Profile',
    notes.includes('scrape') || specs.includes('scrape') ? 'Scrape' : '',
    notes.includes('contract') || specs.includes('contract') ? 'Contract' : '',
    notes.includes('ai') || specs.includes('ai') ? 'AI' : '',
  ].filter(Boolean);
  const dataSource = sourceHints.length > 1 ? 'Mixed' : sourceHints[0] || 'Property Profile';
  const assumptionStatus = completeness >= 85 ? 'Report ready' : completeness >= 55 ? 'Review gaps' : 'Incomplete';
  const lastUpdatedRaw = (property as any)?.updated_at || (property as any)?.created_at;

  return {
    assetType: String(prefill.assetSubtype || prefill.assetCategory || domain).replace(/_/g, ' '),
    dataSource,
    completeness,
    assumptionStatus,
    lastUpdated: lastUpdatedRaw ? new Date(lastUpdatedRaw).toLocaleDateString('en-AU') : 'Pending',
  };
}
