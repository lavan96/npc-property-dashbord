import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Calculator, ChevronDown, FileText, Info, Sparkles, TrendingUp } from 'lucide-react';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCommercialDealState, type CalculatorSourceMode } from '@/utils/commercial/commercialDealState';
import { buildGlobalSyncLabel } from '@/utils/commercial/calculatorDataSync';
import { cashFlowAiEstimateButtons } from '@/utils/commercial/cashFlowAiEstimateEngine';
import { buildTenYearInputsFromGlobal, calculateTenYearCashFlow } from '@/utils/commercial/tenYearCashFlowEngine';
import type { TenYearCashFlowInputs, TenYearCashFlowMode, TenYearCashFlowYear } from '@/utils/commercial/tenYearCashFlowTypes';

const PENDING = 'Pending';
const fmt = (n?: number | null) => n == null || !Number.isFinite(n) ? PENDING : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
const pct = (n?: number | null) => n == null || !Number.isFinite(n) ? PENDING : `${(n * 100).toFixed(1)}%`;
const numPct = (n?: number | null) => n == null || !Number.isFinite(n) ? PENDING : `${n.toFixed(2)}x`;
const hasPositive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const title = (v: string) => v.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
const badgeVariant = (r?: string) => (r === 'green' ? 'default' : r === 'amber' ? 'secondary' : 'destructive');

function SummaryCard({ label, value, pending }: { label: string; value: string | number | null | undefined; pending?: boolean }) {
  const display = pending ? PENDING : typeof value === 'number' ? fmt(value) : value ?? PENDING;
  return <Card className="bg-card/95"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold text-primary">{display}</p></CardContent></Card>;
}

type SourceState = 'Blank' | 'Property Profile' | 'Scraped' | 'NOI Tab' | 'Cap Rate Tab' | 'GST Tab' | 'ICR / DSCR Tab' | 'Borrowing Capacity' | 'DCF Tab' | 'Research Engine' | 'AI Estimate' | 'Manual' | 'User Override' | 'Verified';
type CascadeValue = { value: number; source: SourceState };
type CascadeMap = Partial<Record<keyof TenYearCashFlowInputs, CascadeValue>>;
type AssumptionHistory = Partial<Record<keyof TenYearCashFlowInputs, { originalValue: number; originalSource: SourceState }>>;

function AssumptionField({ label, source, tooltip, overridden, children }: { label: string; source: SourceState; tooltip: string; overridden?: boolean; children: ReactNode }) {
  return <div className="rounded-lg border border-border/60 bg-card/70 p-3 space-y-2"><div className="flex items-start justify-between gap-2"><Label className="flex items-center gap-1.5 text-xs font-medium">{label}<Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" /></TooltipTrigger><TooltipContent className="max-w-xs">{tooltip}</TooltipContent></Tooltip></Label><div className="flex flex-wrap justify-end gap-1"><Badge variant="outline" className="text-[10px]">{source}</Badge>{overridden && <Badge variant="secondary" className="text-[10px]">Manual override</Badge>}</div></div>{children}</div>;
}

function OverrideNumber({ label, field, value, update, suffix, placeholder, pending, source, tooltip, overridden, sourceConflict, onKeepOverride, onUseSource }: { label: string; field: keyof TenYearCashFlowInputs; value?: number; update: (field: keyof TenYearCashFlowInputs, value: number) => void; suffix?: string; placeholder?: string; pending?: boolean; source: SourceState; tooltip: string; overridden?: boolean; sourceConflict?: boolean; onKeepOverride?: () => void; onUseSource?: () => void }) {
  return <AssumptionField label={label} source={source} tooltip={tooltip} overridden={overridden}><div className="flex items-center gap-2"><Input type="number" value={pending ? '' : value ?? ''} placeholder={placeholder} onChange={e => update(field, Number(e.target.value))} />{suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}</div>{sourceConflict && <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100"><p>New source value available. This field currently uses a saved override.</p><div className="mt-2 flex gap-2"><Button type="button" size="sm" variant="outline" onClick={onKeepOverride}>Keep override</Button><Button type="button" size="sm" onClick={onUseSource}>Use source value</Button></div></div>}</AssumptionField>;
}

function MetricRows({ years, mode, pending }: { years: TenYearCashFlowYear[]; mode: TenYearCashFlowMode; pending?: boolean }) {
  const rows: Array<{ group: string; label: string; formula: string; values: (y: TenYearCashFlowYear) => string }> = [
    { group: 'Valuation', label: 'Property value', formula: 'Prior year value × (1 + capital growth)', values: y => fmt(y.propertyValue) },
    { group: 'Valuation', label: 'Terminal value', formula: 'Forward NOI / terminal cap rate', values: y => y.terminalValue == null ? PENDING : fmt(y.terminalValue) },
    { group: 'Debt', label: 'Opening loan balance', formula: 'Prior year closing loan balance', values: y => fmt(y.openingLoanBalance) },
    { group: 'Debt', label: 'Interest payment', formula: 'Opening loan × interest rate', values: y => fmt(y.interestPayment) },
    { group: 'Debt', label: 'Principal payment', formula: 'Debt service - interest', values: y => fmt(y.principalPayment) },
    { group: 'Debt', label: 'Closing loan balance', formula: 'Opening loan - principal', values: y => fmt(y.closingLoanBalance) },
    { group: 'Debt', label: 'LVR', formula: 'Closing loan / property value', values: y => pct(y.lvr) },
    { group: 'Debt', label: 'ICR', formula: 'NOI / interest', values: y => numPct(y.icr) },
    { group: 'Debt', label: 'DSCR', formula: 'NOI / annual debt service', values: y => numPct(y.dscr) },
    { group: 'Debt', label: 'Debt yield', formula: 'NOI / opening loan', values: y => pct(y.debtYield) },
    { group: 'Income', label: 'Passing rent', formula: 'Prior year rent × rent growth', values: y => fmt(y.passingRent) },
    { group: 'Income', label: 'Vacancy loss', formula: 'Potential gross income × vacancy %', values: y => fmt(y.vacancyLoss) },
    { group: 'Income', label: 'Recovered outgoings', formula: 'Recovered outgoings × outgoings growth', values: y => fmt(y.recoveredOutgoings) },
    { group: 'Expenses', label: 'Owner-borne expenses', formula: 'Sum of non-recoverable expenses', values: y => fmt(y.totalOwnerBorneExpenses) },
    { group: 'NOI', label: 'Actual NOI', formula: 'Effective gross income - owner-borne expenses', values: y => fmt(y.actualNoi) },
    { group: 'NOI', label: 'Lender-adjusted NOI', formula: 'Actual NOI - risk haircuts', values: y => fmt(y.lenderAdjustedNoi) },
    { group: 'Leasing / Vacancy', label: 'Total leasing / vacancy cost', formula: 'Downtime + incentives + leasing fee + reletting', values: y => fmt(y.totalLeasingVacancyCost) },
    { group: 'Capex', label: 'Total capex', formula: 'Annual reserve + major capex + specialist reserves', values: y => fmt(y.totalCapex) },
    { group: 'Cash Flow', label: 'Pre-tax cashflow', formula: 'NOI - leasing costs - capex - debt service', values: y => fmt(y.preTaxCashflow) },
    { group: 'Tax', label: 'Tax payable / benefit', formula: 'Taxable income × tax rate; loss benefit only if allowed', values: y => fmt(y.taxPayableBenefit) },
    { group: 'Cash Flow', label: 'After-tax cashflow', formula: 'Pre-tax cashflow - tax payable / + allowed tax benefit', values: y => fmt(y.afterTaxCashflow) },
    { group: 'Equity', label: 'Equity position', formula: 'Property value - loan balance', values: y => fmt(y.equityPosition) },
  ];
  if (mode === 'ownerOccupier') rows.push({ group: 'Business Impact', label: 'Net saving / cost vs leasing', formula: 'Leasing cost avoided - ownership cash cost', values: y => fmt(y.netSavingCostVsLeasing) }, { group: 'Business Impact', label: 'Business DSCR', formula: 'Available business cashflow / total debt service', values: y => numPct(y.businessDscr) }, { group: 'Business Impact', label: 'Occupancy cost ratio', formula: 'Ownership cash cost / business revenue', values: y => pct(y.occupancyCostRatio) });
  if (mode === 'relatedPartyLease') rows.push({ group: 'Group View', label: 'Property entity cashflow', formula: 'Rent received + recoveries - expenses - debt - capex', values: y => fmt(y.propertyEntityCashflow) }, { group: 'Group View', label: 'Operating occupancy cost', formula: 'Related-party rent paid + outgoings paid', values: y => fmt(y.operatingBusinessOccupancyCost) }, { group: 'Group View', label: 'Group cashflow', formula: 'Internal rent neutralised before tax/entity effects', values: y => fmt(y.groupCashflow) });
  let current = '';
  const tableYears = pending ? Array.from({ length: 10 }, (_, i) => ({ year: i + 1 }) as TenYearCashFlowYear) : years;
  return <Table><TableHeader><TableRow><TableHead className="sticky left-0 bg-card min-w-[220px]">Row / formula</TableHead>{tableYears.map(y => <TableHead key={y.year} className="text-right">Year {y.year}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((r, i) => { const showGroup = current !== r.group; current = r.group; return [showGroup ? <TableRow key={`${r.group}-g`} className="bg-primary/10"><TableCell colSpan={11} className="font-semibold text-primary">{r.group}</TableCell></TableRow> : null, <TableRow key={`${r.group}-${r.label}-${i}`}><TableCell className="sticky left-0 bg-card"><div className="font-medium">{r.label}</div><div className="text-[11px] text-muted-foreground">{r.formula}</div></TableCell>{tableYears.map(y => <TableCell key={y.year} className="text-right tabular-nums">{pending ? PENDING : r.values(y)}</TableCell>)}</TableRow>]; })}</TableBody></Table>;
}

export function TenYearCashFlowCard() {
  const { prefill } = useCalculatorPrefill();
  const dealProfile = useCommercialDealState(s => s.profile.dealProfile);
  const purchaserStructure = useCommercialDealState(s => s.profile.purchaserStructure);
  const propertyValuation = useCommercialDealState(s => s.profile.propertyValuation);
  const leaseIncome = useCommercialDealState(s => s.profile.leaseIncome);
  const operatingExpenses = useCommercialDealState(s => s.profile.operatingExpenses);
  const lendingAssumptions = useCommercialDealState(s => s.profile.lendingAssumptions);
  const acquisitionCosts = useCommercialDealState(s => s.profile.acquisitionCosts);
  const fundsToComplete = useCommercialDealState(s => s.profile.fundsToComplete);
  const borrowingOutputs = useCommercialDealState(s => s.profile.borrowingOutputs);
  const noiOutputs = useCommercialDealState(s => s.profile.noiOutputs);
  const capRateOutputs = useCommercialDealState(s => s.profile.capRateOutputs);
  const icrDscrOutputs = useCommercialDealState(s => s.profile.icrDscrOutputs);
  const gstInputs = useCommercialDealState(s => s.profile.gstInputs);
  const gstOutputs = useCommercialDealState(s => s.profile.gstOutputs);
  const dcfInputs = useCommercialDealState(s => s.profile.dcfInputs);
  const dcfOutputs = useCommercialDealState(s => s.profile.dcfOutputs);
  const aiEstimateMetadata = useCommercialDealState(s => s.profile.aiEstimateMetadata);
  const profile = useMemo(() => ({
    dealProfile,
    purchaserStructure,
    propertyValuation,
    leaseIncome,
    operatingExpenses,
    lendingAssumptions,
    acquisitionCosts,
    fundsToComplete,
    borrowingOutputs,
    noiOutputs,
    capRateOutputs,
    icrDscrOutputs,
    gstInputs,
    gstOutputs,
    dcfInputs,
    dcfOutputs,
    debtInputs: {},
    industrialMetrics: {},
    riskInputs: {},
    riskOutputs: {},
    aiEstimateMetadata,
    documentVerificationStatus: {},
    scenarioOverrides: {},
    assumptions: {},
    aiEstimateAuditLog: [],
  }), [dealProfile, purchaserStructure, propertyValuation, leaseIncome, operatingExpenses, lendingAssumptions, acquisitionCosts, fundsToComplete, borrowingOutputs, noiOutputs, capRateOutputs, icrDscrOutputs, gstInputs, gstOutputs, dcfInputs, dcfOutputs, aiEstimateMetadata]);
  const updateGlobal = useCommercialDealState(s => s.updateGlobal);
  const sourceMode = useCommercialDealState(s => s.sourceModes.tenYearCashFlow);
  const setSourceMode = useCommercialDealState(s => s.setSourceMode);
  const [mode, setMode] = useState<TenYearCashFlowMode>('investor');
  const [overviewOpen, setOverviewOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('ten-year-cash-flow-overview-viewed') !== 'true';
  });
  const [scenarioName, setScenarioName] = useState('');
  const [projectionPeriod, setProjectionPeriod] = useState('10');
  const [includeInReport, setIncludeInReport] = useState(true);
  const [leaseExpiryYear, setLeaseExpiryYear] = useState('');
  const [waleYears, setWaleYears] = useState('');
  const [interestDeductible, setInterestDeductible] = useState(true);
  const [exitValueMethod, setExitValueMethod] = useState('Terminal cap rate');
  const [overrideHistory, setOverrideHistory] = useState<AssumptionHistory>({});
  const [overrides, setOverrides] = useState<Partial<TenYearCashFlowInputs>>({});
  const [overriddenFields, setOverriddenFields] = useState<string[]>([]);
  const cascade = useMemo<CascadeMap>(() => {
    const pick = (...candidates: Array<{ value: unknown; source: SourceState }>): CascadeValue | undefined => {
      for (const c of candidates) if (typeof c.value === 'number' && Number.isFinite(c.value)) return { value: c.value, source: c.source };
      return undefined;
    };
    const pv = propertyValuation as any;
    const noi = noiOutputs as any;
    const cap = capRateOutputs as any;
    const icr = icrDscrOutputs as any;
    const gst = gstOutputs as any;
    const dcfIn = dcfInputs as any;
    const dcfOut = dcfOutputs as any;
    const borrow = borrowingOutputs as any;
    const funds = (borrowingOutputs?.fundsToComplete ?? fundsToComplete) as any;
    const scrape = prefill as any;
    const purchasePrice = pick(
      { value: pv.purchasePrice, source: 'Property Profile' },
      { value: (gstInputs as any)?.purchasePrice, source: 'GST Tab' },
      { value: borrow?.propertyValueUsedForLvr ?? borrow?.purchasePrice ?? borrow?.propertyValue, source: 'Borrowing Capacity' },
      { value: dcfIn.purchasePrice, source: 'DCF Tab' },
    );
    const acquisition = pick(
      { value: funds?.totalAcquisitionCosts, source: 'Borrowing Capacity' },
      { value: dcfOut?.totalAcquisitionCosts ?? dcfIn.totalAcquisitionCosts, source: 'DCF Tab' },
    );
    const gstEconomic = pick({ value: gst?.gstEconomicCost ?? gst?.economicCost, source: 'GST Tab' });
    const totalCostBaseCalculated = purchasePrice && acquisition && gstEconomic ? purchasePrice.value + acquisition.value + gstEconomic.value : undefined;
    return {
      purchasePrice,
      totalAcquisitionCosts: acquisition,
      gstEconomicCost: gstEconomic,
      totalCostBase: pick(
        { value: totalCostBaseCalculated, source: 'Verified' },
        { value: dcfOut?.totalCostBase ?? dcfIn.totalCostBase, source: 'DCF Tab' },
        { value: funds?.totalCostBase, source: 'Borrowing Capacity' },
      ),
      requiredEquity: pick({ value: funds?.requiredEquity, source: 'Borrowing Capacity' }),
      availableEquity: pick({ value: (purchaserStructure as any).availableCashEquity, source: 'Property Profile' }),
      passingRent: pick(
        { value: noi?.selectedBorrowingNoi ?? noi?.borrowingNoi ?? noi?.netOperatingIncome, source: 'NOI Tab' },
        { value: dcfIn.initialNoi ?? dcfOut?.initialNoi, source: 'DCF Tab' },
        { value: (leaseIncome as any).grossPassingRent, source: 'Property Profile' },
      ),
      rentGrowthPct: pick(
        { value: (aiEstimateMetadata as any)?.rentGrowthPct?.estimatedValue, source: 'Research Engine' },
        { value: dcfIn.rentalGrowthPct ?? dcfIn.rentGrowthPct, source: 'DCF Tab' },
      ),
      vacancyAllowancePct: pick(
        { value: (leaseIncome as any).vacancyAllowancePct ?? noi?.vacancyAllowancePct, source: 'NOI Tab' },
        { value: (aiEstimateMetadata as any)?.vacancyAllowancePct?.estimatedValue, source: 'Research Engine' },
        { value: dcfIn.vacancyAllowancePct, source: 'DCF Tab' },
      ),
      recoveredOutgoings: pick(
        { value: (leaseIncome as any).recoveredOutgoings ?? noi?.recoveredOutgoings, source: 'NOI Tab' },
        { value: scrape?.recoveredOutgoings, source: 'Scraped' },
      ),
      terminalCapRatePct: pick(
        { value: cap?.targetCapRate ?? cap?.capitalisationRate, source: 'Cap Rate Tab' },
        { value: dcfIn.terminalCapRatePct, source: 'DCF Tab' },
        { value: (aiEstimateMetadata as any)?.terminalCapRatePct?.estimatedValue, source: 'Research Engine' },
      ),
      loanAmount: pick(
        { value: borrow?.proposedLoan ?? borrow?.finalRiskAdjustedLoan, source: 'Borrowing Capacity' },
        { value: icr?.loanAmount, source: 'ICR / DSCR Tab' },
        { value: dcfIn.loanAmount, source: 'DCF Tab' },
      ),
      interestRatePct: pick(
        { value: icr?.interestRatePct ?? icr?.contractInterestRatePct, source: 'ICR / DSCR Tab' },
        { value: (lendingAssumptions as any).contractInterestRatePct, source: 'Borrowing Capacity' },
        { value: dcfIn.interestRatePct, source: 'DCF Tab' },
      ),
      annualDebtService: pick(
        { value: icr?.annualDebtService, source: 'ICR / DSCR Tab' },
        { value: borrow?.annualDebtService, source: 'Borrowing Capacity' },
        { value: dcfIn.annualDebtService, source: 'DCF Tab' },
      ),
      annualCapexReserve: pick(
        { value: dcfIn.annualCapex ?? dcfIn.annualCapexReserve, source: 'DCF Tab' },
        { value: (aiEstimateMetadata as any)?.annualCapexReserve?.estimatedValue, source: 'Research Engine' },
      ),
      taxRatePct: pick({ value: (purchaserStructure as any).taxRatePct, source: 'Property Profile' }),
      capitalGrowthPct: pick(
        { value: (aiEstimateMetadata as any)?.capitalGrowthPct?.estimatedValue, source: 'Research Engine' },
        { value: dcfIn.capitalGrowthPct, source: 'DCF Tab' },
      ),
    };
  }, [propertyValuation, gstInputs, borrowingOutputs, fundsToComplete, dcfInputs, dcfOutputs, gstOutputs, purchaserStructure, noiOutputs, capRateOutputs, icrDscrOutputs, prefill, leaseIncome, lendingAssumptions, aiEstimateMetadata]);
  const cascadeOverrides = useMemo(() => Object.fromEntries(Object.entries(cascade).filter((entry): entry is [string, CascadeValue] => Boolean(entry[1])).map(([key, item]) => [key, item.value])) as Partial<TenYearCashFlowInputs>, [cascade]);
  const inputs = useMemo(() => buildTenYearInputsFromGlobal(profile, mode, { ...cascadeOverrides, ...overrides }), [profile, mode, cascadeOverrides, overrides]);
  const result = useMemo(() => calculateTenYearCashFlow(inputs, overriddenFields), [inputs, overriddenFields]);
  const hasManualInputs = overriddenFields.length > 0;
  const hasImportedInputs = Boolean(prefill) || Boolean(borrowingOutputs) || Boolean(noiOutputs) || Boolean(capRateOutputs) || Boolean(icrDscrOutputs) || Boolean(gstOutputs) || Boolean(dcfOutputs);
  const manualRequiredFields: Array<keyof TenYearCashFlowInputs> = ['purchasePrice', 'totalCostBase', 'passingRent', 'rentGrowthPct', 'vacancyAllowancePct', 'outgoingsGrowthPct', 'annualCapexReserve', 'terminalCapRatePct', 'taxRatePct', 'gstEconomicCost'];
  const manualInputsComplete = manualRequiredFields.every(field => overriddenFields.includes(String(field)));
  const hasMinimumInputs = hasPositive(inputs.purchasePrice) && hasPositive(inputs.terminalCapRatePct) && (hasPositive(inputs.passingRent) || hasPositive(inputs.marketRent));
  const sourceComplete = hasImportedInputs || (hasManualInputs && manualInputsComplete);
  const modelReady = sourceComplete && hasMinimumInputs && result.warnings.every(w => !/must be greater|must be provided|required to calculate/i.test(w));

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('ten-year-cash-flow-overview-viewed', 'true');
  }, []);

  useEffect(() => { if (modelReady) updateGlobal('tenYearCashFlowOutputs', result); }, [modelReady, result, updateGlobal]);
  const markOverridden = (field: keyof TenYearCashFlowInputs) => {
    const currentSource = cascade[field];
    if (currentSource && !overrideHistory[field]) setOverrideHistory(h => ({ ...h, [field]: { originalValue: currentSource.value, originalSource: currentSource.source } }));
    setOverriddenFields(f => Array.from(new Set([...f, String(field)])));
    if (sourceMode === 'global') setSourceMode('tenYearCashFlow', 'manualOverride');
  };
  const updateOverride = (field: keyof TenYearCashFlowInputs, value: number) => { setOverrides(o => ({ ...o, [field]: Number.isFinite(value) ? value : 0 })); markOverridden(field); };
  const updateTextOverride = <K extends keyof TenYearCashFlowInputs>(field: K, value: TenYearCashFlowInputs[K]) => { setOverrides(o => ({ ...o, [field]: value })); markOverridden(field); };
  const isOverridden = (field: keyof TenYearCashFlowInputs) => overriddenFields.includes(String(field));
  const sourceFor = (field: keyof TenYearCashFlowInputs, fallback: SourceState = prefill ? 'Property Profile' : 'Blank'): SourceState => isOverridden(field) ? 'User Override' : cascade[field]?.source ?? fallback;
  const hasSourceConflict = (field: keyof TenYearCashFlowInputs) => {
    const history = overrideHistory[field]; const latest = cascade[field];
    return Boolean(isOverridden(field) && history && latest && (history.originalSource !== latest.source || Math.abs(history.originalValue - latest.value) > 0.0001));
  };
  const clearSourceConflict = (field: keyof TenYearCashFlowInputs) => setOverrideHistory(h => ({ ...h, [field]: cascade[field] ? { originalValue: cascade[field]!.value, originalSource: cascade[field]!.source } : h[field] }));
  const useSourceValue = (field: keyof TenYearCashFlowInputs) => { setOverrides(o => { const next = { ...o }; delete next[field]; return next; }); setOverriddenFields(f => f.filter(k => k !== String(field))); setOverrideHistory(h => { const next = { ...h }; delete next[field]; return next; }); };
  const s = result.summary;
  const pending = !modelReady;
  const statusLabel = pending ? 'Awaiting Cash Flow Inputs' : title(s.riskStatus);
  const assumptionPlaceholders: Partial<Record<keyof TenYearCashFlowInputs, string>> = { purchasePrice: 'Pulled from property profile or enter manually', totalCostBase: 'Calculated from purchase price, costs and GST', passingRent: 'Pulled from NOI or enter manually', rentGrowthPct: 'Pulled from research engine or enter manually', vacancyAllowancePct: 'Pulled from NOI / research or enter manually', outgoingsGrowthPct: 'Enter outgoings growth', annualCapexReserve: 'Enter capex reserve', terminalCapRatePct: 'Pulled from Cap Rate / DCF or enter manually', taxRatePct: 'Enter tax rate or confirm accountant review', gstEconomicCost: 'Pulled from GST tab or enter manually' };
  const summaryCards = mode === 'investor'
    ? [['Purchase price', s.purchasePrice], ['Total cost base', s.totalCostBase], ['Required equity', s.requiredEquity], ['Year 1 NOI', s.year1Noi], ['Year 1 after-tax cashflow', s.year1AfterTaxCashflow], ['Year 10 property value', s.year10PropertyValue], ['Year 10 equity', s.year10Equity], ['Cumulative after-tax cashflow', s.cumulativeAfterTaxCashflow], ['Levered IRR', s.leveredIrr == null ? 'N/A' : `${(s.leveredIrr * 100).toFixed(1)}%`], ['Equity multiple', s.equityMultiple == null ? 'N/A' : `${s.equityMultiple.toFixed(2)}x`], ['Terminal value', s.terminalValue]]
    : mode === 'ownerOccupier'
      ? [['Purchase price', s.purchasePrice], ['Required equity', s.requiredEquity], ['Current rent avoided', inputs.currentRentPaid], ['Year 1 ownership cash cost', result.years[0]?.ownershipCashCost], ['Year 1 net saving/cost vs leasing', s.ownerOccupierNetSavingCost], ['10-year cumulative rent avoided', result.years[9]?.cumulativeLeasingCostAvoided], ['Year 10 equity created', result.years[9]?.equityCreated], ['Business DSCR', s.businessDscr == null ? 'N/A — EBITDA not provided.' : `${s.businessDscr.toFixed(2)}x`], ['Occupancy cost ratio', s.occupancyCostRatio == null ? 'N/A' : `${(s.occupancyCostRatio * 100).toFixed(1)}%`], ['Cumulative ownership benefit', s.cumulativeOwnershipBenefit]]
      : [['Property entity cashflow', s.propertyEntityCashflow], ['Operating business occupancy cost', result.years[0]?.operatingBusinessOccupancyCost], ['Group cashflow', s.groupCashflow], ['Group DSCR', s.groupDscr == null ? 'N/A' : `${s.groupDscr.toFixed(2)}x`], ['Equity created', result.years[9]?.equityCreated], ['Internal rent neutralisation', 'Shown in group view'], ['Required equity', s.requiredEquity], ['Year 10 property value', s.year10PropertyValue], ['Cumulative group benefit', s.cumulativeGroupBenefit]];

  return <Card className="bg-card/95"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> 10-Year Cash Flow</CardTitle><CardDescription>Commercial / industrial projection for investor, owner-occupier and related-party lease scenarios. AI supports assumptions; deterministic formulas produce the table.</CardDescription></div><div className="flex gap-2"><Badge variant="outline">{buildGlobalSyncLabel(sourceMode as CalculatorSourceMode)}</Badge><Badge variant={(pending ? 'outline' : badgeVariant(s.riskStatus)) as any}>{statusLabel}</Badge></div></div></CardHeader><CardContent className="space-y-5">
    <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
      <Card className="border-primary/30 bg-primary/5">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-primary/10 transition-colors">
            <div>
              <h3 className="font-semibold text-primary">10-Year Cash Flow Report Overview</h3>
              <p className="mt-1 text-xs text-muted-foreground">Purpose, DCF differences, assumptions, validation and PDF-ready report outputs.</p>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-primary transition-transform ${overviewOpen ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0 text-sm text-muted-foreground leading-relaxed">
            <p>This section converts the property, income, debt, GST, capex and exit assumptions into a 10-year projection that can be reviewed internally and included in a client-ready report.</p>
            <p>The 10-year cash flow report is designed to show how the asset may perform over time, including rental growth, vacancy, recovered outgoings, owner-borne expenses, debt position, ICR, DSCR, debt yield, capex, leasing costs, after-tax cashflow, equity position and exit value.</p>
            <p>Unlike the DCF tab, which focuses on IRR, NPV and terminal value analysis, this report focuses on a readable year-by-year client projection and PDF-ready output.</p>
            <div>
              <p className="font-medium text-foreground">This report separates:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Editable assumptions</li>
                <li>AI / research-supported estimates</li>
                <li>Global property-linked inputs</li>
                <li>Manual overrides</li>
                <li>Protected calculated outputs</li>
                <li>Warnings and validation checks</li>
                <li>Final report commentary</li>
                <li>PDF-ready cashflow tables</li>
              </ol>
            </div>
            <p>All outputs are estimates and should be reviewed against property data, lease assumptions, lender terms, tax advice and market evidence before being issued to clients.</p>
            <details className="rounded border border-primary/20 bg-card/70 p-3">
              <summary className="cursor-pointer font-medium text-primary">Why this matters</summary>
              <p className="mt-2">This report helps explain the projected investment journey over 10 years. It allows clients to see income growth, vacancy impact, capex, debt reduction, equity growth, cashflow and exit value in a single readable format.</p>
            </details>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
    <TooltipProvider delayDuration={200}>
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /> Assumption Workspace</CardTitle>
          <CardDescription>Editable and cascaded assumptions are grouped separately from protected calculated outputs. Source badges show where each value came from and manual overrides are flagged.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-card/60 p-3">
            <h3 className="mb-3 text-sm font-semibold text-primary">1. Model Setup</h3>
            <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
              <AssumptionField label="Cash Flow Mode" source="Manual" tooltip="Selects the investor, owner-occupier or related-party lease model view. Formula logic is unchanged."><Select value={mode} onValueChange={v => setMode(v as TenYearCashFlowMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="investor">Investor</SelectItem><SelectItem value="ownerOccupier">Business Owner-Occupier</SelectItem><SelectItem value="relatedPartyLease">Related-Party Lease</SelectItem></SelectContent></Select></AssumptionField>
              <AssumptionField label="Data Source" source={sourceMode === 'savedPropertyLinked' ? 'Property Profile' : sourceMode === 'manualOverride' ? 'Manual' : sourceMode === 'aiPending' ? 'AI Estimate' : 'Blank'} tooltip="Controls whether values are treated as global synced inputs, manual/no property linked, AI pending or saved property linked."><Select value={sourceMode} onValueChange={v => setSourceMode('tenYearCashFlow', v as CalculatorSourceMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="global">Use Global Deal Inputs</SelectItem><SelectItem value="manualOverride">Manual entry / no property linked</SelectItem><SelectItem value="aiPending">AI Estimate Pending</SelectItem><SelectItem value="savedPropertyLinked">Saved Property Linked</SelectItem></SelectContent></Select></AssumptionField>
              <AssumptionField label="Projection Period" source="Verified" tooltip="This report is currently a protected 10-year output; changing this label does not alter formulas in this phase."><Input type="number" value={projectionPeriod} onChange={e => setProjectionPeriod(e.target.value)} /></AssumptionField>
              <AssumptionField label="Property Domain" source={prefill ? 'Property Profile' : 'Manual'} tooltip="Commercial or industrial domain used to label the scenario; calculation formulas are preserved."><Select value={inputs.assetDomain} onValueChange={v => updateTextOverride('assetDomain', v as TenYearCashFlowInputs['assetDomain'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="commercial">Commercial</SelectItem><SelectItem value="industrial">Industrial</SelectItem></SelectContent></Select></AssumptionField>
              <AssumptionField label="Scenario Name" source={scenarioName ? 'Manual' : 'Blank'} tooltip="Optional report scenario label for internal review and client-ready reporting."><Input value={scenarioName} onChange={e => setScenarioName(e.target.value)} placeholder="Enter scenario name" /></AssumptionField>
              <AssumptionField label="Include in Report" source="Manual" tooltip="Controls whether this scenario is intended for report inclusion; it does not change formulas."><Button type="button" variant={includeInReport ? 'default' : 'outline'} onClick={() => setIncludeInReport(v => !v)}>{includeInReport ? 'Included' : 'Excluded'}</Button></AssumptionField>
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-card/60 p-3">
            <h3 className="mb-3 text-sm font-semibold text-primary">2. Property & Cost Inputs</h3>
            <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
              <OverrideNumber label="Purchase Price" field="purchasePrice" value={inputs.purchasePrice} update={updateOverride} placeholder={assumptionPlaceholders.purchasePrice} pending={pending && !overrides.purchasePrice} source={sourceFor('purchasePrice', prefill ? 'Property Profile' : 'Blank')} tooltip="Pulled from the linked property profile or entered manually." overridden={isOverridden('purchasePrice')} sourceConflict={hasSourceConflict('purchasePrice' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('purchasePrice' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('purchasePrice' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Acquisition Costs" field="totalAcquisitionCosts" value={inputs.totalAcquisitionCosts} update={updateOverride} pending={pending && !overrides.totalAcquisitionCosts} source={sourceFor('totalAcquisitionCosts', fundsToComplete ? 'Borrowing Capacity' : 'Blank')} tooltip="Acquisition cost input cascaded from borrowing/funds-to-complete where available." overridden={isOverridden('totalAcquisitionCosts')} sourceConflict={hasSourceConflict('totalAcquisitionCosts' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('totalAcquisitionCosts' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('totalAcquisitionCosts' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="GST Economic Cost" field="gstEconomicCost" value={inputs.gstEconomicCost} update={updateOverride} placeholder={assumptionPlaceholders.gstEconomicCost} pending={pending && !overrides.gstEconomicCost} source={sourceFor('gstEconomicCost', gstOutputs ? 'GST Tab' : 'Blank')} tooltip="Pulled from GST tab or entered manually." overridden={isOverridden('gstEconomicCost')} sourceConflict={hasSourceConflict('gstEconomicCost' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('gstEconomicCost' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('gstEconomicCost' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Total Cost Base" field="totalCostBase" value={inputs.totalCostBase} update={updateOverride} placeholder={assumptionPlaceholders.totalCostBase} pending={pending && !overrides.totalCostBase} source={sourceFor('totalCostBase', fundsToComplete ? 'Borrowing Capacity' : 'Blank')} tooltip="Calculated from purchase price, costs and GST in upstream modules or entered manually." overridden={isOverridden('totalCostBase')} sourceConflict={hasSourceConflict('totalCostBase' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('totalCostBase' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('totalCostBase' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Required Equity" field="requiredEquity" value={inputs.requiredEquity} update={updateOverride} pending={pending && !overrides.requiredEquity} source={sourceFor('requiredEquity', borrowingOutputs ? 'Borrowing Capacity' : 'Blank')} tooltip="Required equity cascaded from borrowing capacity/funds-to-complete or manually overridden." overridden={isOverridden('requiredEquity')} sourceConflict={hasSourceConflict('requiredEquity' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('requiredEquity' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('requiredEquity' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Available Equity" field="availableEquity" value={inputs.availableEquity} update={updateOverride} pending={pending && !overrides.availableEquity} source={sourceFor('availableEquity', prefill ? 'Property Profile' : 'Blank')} tooltip="Available equity from the purchaser profile or manual scenario input." overridden={isOverridden('availableEquity')} sourceConflict={hasSourceConflict('availableEquity' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('availableEquity' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('availableEquity' as keyof TenYearCashFlowInputs)} />
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-card/60 p-3">
            <h3 className="mb-3 text-sm font-semibold text-primary">3. Income Assumptions</h3>
            <div className="grid md:grid-cols-3 xl:grid-cols-7 gap-3">
              <OverrideNumber label="Passing Rent" field="passingRent" value={inputs.passingRent} update={updateOverride} placeholder={assumptionPlaceholders.passingRent} pending={pending && !overrides.passingRent} source={sourceFor('passingRent', noiOutputs ? 'NOI Tab' : prefill ? 'Property Profile' : 'Blank')} tooltip="Passing rent pulled from NOI/property data or entered manually." overridden={isOverridden('passingRent')} sourceConflict={hasSourceConflict('passingRent' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('passingRent' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('passingRent' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Rent Growth %" field="rentGrowthPct" value={inputs.rentGrowthPct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.rentGrowthPct} pending={pending && !overrides.rentGrowthPct} source={sourceFor('rentGrowthPct', 'Research Engine')} tooltip="Rent growth assumption from research engine or manual override." overridden={isOverridden('rentGrowthPct')} sourceConflict={hasSourceConflict('rentGrowthPct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('rentGrowthPct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('rentGrowthPct' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Vacancy Allowance %" field="vacancyAllowancePct" value={inputs.vacancyAllowancePct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.vacancyAllowancePct} pending={pending && !overrides.vacancyAllowancePct} source={sourceFor('vacancyAllowancePct', noiOutputs ? 'NOI Tab' : 'Research Engine')} tooltip="Vacancy allowance from NOI/research or manual override." overridden={isOverridden('vacancyAllowancePct')} sourceConflict={hasSourceConflict('vacancyAllowancePct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('vacancyAllowancePct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('vacancyAllowancePct' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Recovered Outgoings" field="recoveredOutgoings" value={inputs.recoveredOutgoings} update={updateOverride} pending={pending && !overrides.recoveredOutgoings} source={sourceFor('recoveredOutgoings', noiOutputs ? 'NOI Tab' : 'Blank')} tooltip="Recovered outgoings from NOI tab or manually entered." overridden={isOverridden('recoveredOutgoings')} sourceConflict={hasSourceConflict('recoveredOutgoings' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('recoveredOutgoings' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('recoveredOutgoings' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Outgoings Growth %" field="outgoingsGrowthPct" value={inputs.outgoingsGrowthPct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.outgoingsGrowthPct} pending={pending && !overrides.outgoingsGrowthPct} source={sourceFor('outgoingsGrowthPct', 'Research Engine')} tooltip="Outgoings growth assumption used by the year-by-year projection." overridden={isOverridden('outgoingsGrowthPct')} sourceConflict={hasSourceConflict('outgoingsGrowthPct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('outgoingsGrowthPct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('outgoingsGrowthPct' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Owner-Borne Expenses" field="otherOwnerExpenses" value={inputs.otherOwnerExpenses} update={updateOverride} pending={pending && !overrides.otherOwnerExpenses} source={sourceFor('otherOwnerExpenses', noiOutputs ? 'NOI Tab' : 'Blank')} tooltip="Owner-borne expenses from NOI tab or manual entry." overridden={isOverridden('otherOwnerExpenses')} sourceConflict={hasSourceConflict('otherOwnerExpenses' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('otherOwnerExpenses' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('otherOwnerExpenses' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Expense Growth %" field="expenseGrowthPct" value={inputs.expenseGrowthPct} update={updateOverride} suffix="%" pending={pending && !overrides.expenseGrowthPct} source={sourceFor('expenseGrowthPct', 'Research Engine')} tooltip="Expense growth assumption for owner-borne expense escalation." overridden={isOverridden('expenseGrowthPct')} sourceConflict={hasSourceConflict('expenseGrowthPct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('expenseGrowthPct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('expenseGrowthPct' as keyof TenYearCashFlowInputs)} />
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-card/60 p-3">
            <h3 className="mb-3 text-sm font-semibold text-primary">4. Debt Assumptions</h3>
            <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
              <OverrideNumber label="Loan Amount" field="loanAmount" value={inputs.loanAmount} update={updateOverride} pending={pending && !overrides.loanAmount} source={sourceFor('loanAmount', borrowingOutputs ? 'Borrowing Capacity' : 'Blank')} tooltip="Loan amount from borrowing capacity or manual override." overridden={isOverridden('loanAmount')} sourceConflict={hasSourceConflict('loanAmount' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('loanAmount' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('loanAmount' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Interest Rate" field="interestRatePct" value={inputs.interestRatePct} update={updateOverride} suffix="%" pending={pending && !overrides.interestRatePct} source={sourceFor('interestRatePct', borrowingOutputs ? 'Borrowing Capacity' : 'ICR / DSCR Tab')} tooltip="Interest rate used for debt service and cashflow calculations." overridden={isOverridden('interestRatePct')} sourceConflict={hasSourceConflict('interestRatePct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('interestRatePct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('interestRatePct' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Loan Term" field="amortisationYears" value={inputs.amortisationYears} update={updateOverride} pending={pending && !overrides.amortisationYears} source={sourceFor('amortisationYears', borrowingOutputs ? 'Borrowing Capacity' : 'Blank')} tooltip="Loan amortisation term used by existing debt formulas." overridden={isOverridden('amortisationYears')} sourceConflict={hasSourceConflict('amortisationYears' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('amortisationYears' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('amortisationYears' as keyof TenYearCashFlowInputs)} />
              <AssumptionField label="Repayment Type" source={sourceFor('repaymentType', borrowingOutputs ? 'Borrowing Capacity' : 'Blank')} tooltip="Repayment type applied to existing debt-service formulas." overridden={isOverridden('repaymentType')}><Select value={inputs.repaymentType} onValueChange={v => updateTextOverride('repaymentType', v as TenYearCashFlowInputs['repaymentType'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="principalAndInterest">Principal & Interest</SelectItem><SelectItem value="interestOnly">Interest Only</SelectItem></SelectContent></Select></AssumptionField>
              <OverrideNumber label="Annual Debt Service" field="annualDebtService" value={inputs.annualDebtService} update={updateOverride} pending={pending && !overrides.annualDebtService} source={sourceFor('annualDebtService', borrowingOutputs ? 'Borrowing Capacity' : 'ICR / DSCR Tab')} tooltip="Annual debt service from borrowing or ICR/DSCR workflows." overridden={isOverridden('annualDebtService')} sourceConflict={hasSourceConflict('annualDebtService' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('annualDebtService' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('annualDebtService' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Opening Loan Balance" field="loanAmount" value={inputs.loanAmount} update={updateOverride} pending={pending && !overrides.loanAmount} source={sourceFor('loanAmount', borrowingOutputs ? 'Borrowing Capacity' : 'Blank')} tooltip="Opening balance is the same protected loan amount input used by the projection." overridden={isOverridden('loanAmount')} sourceConflict={hasSourceConflict('loanAmount' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('loanAmount' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('loanAmount' as keyof TenYearCashFlowInputs)} />
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-card/60 p-3">
            <h3 className="mb-3 text-sm font-semibold text-primary">5. Leasing / Vacancy Assumptions</h3>
            <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
              <OverrideNumber label="Lease Downtime Months" field="downtimeMonths" value={inputs.downtimeMonths} update={updateOverride} pending={pending && !overrides.downtimeMonths} source={sourceFor('downtimeMonths', 'Manual')} tooltip="Assumed vacancy downtime at lease event or rollover." overridden={isOverridden('downtimeMonths')} sourceConflict={hasSourceConflict('downtimeMonths' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('downtimeMonths' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('downtimeMonths' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Tenant Incentives" field="incentiveMonths" value={inputs.incentiveMonths} update={updateOverride} pending={pending && !overrides.incentiveMonths} source={sourceFor('incentiveMonths', 'Manual')} tooltip="Incentive months used in leasing cost calculations." overridden={isOverridden('incentiveMonths')} sourceConflict={hasSourceConflict('incentiveMonths' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('incentiveMonths' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('incentiveMonths' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Leasing Fees" field="leasingFeePct" value={inputs.leasingFeePct} update={updateOverride} suffix="%" pending={pending && !overrides.leasingFeePct} source={sourceFor('leasingFeePct', 'Manual')} tooltip="Leasing fee percentage for reletting costs." overridden={isOverridden('leasingFeePct')} sourceConflict={hasSourceConflict('leasingFeePct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('leasingFeePct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('leasingFeePct' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Reletting Costs" field="relettingCostAllowance" value={inputs.relettingCostAllowance} update={updateOverride} pending={pending && !overrides.relettingCostAllowance} source={sourceFor('relettingCostAllowance', 'Manual')} tooltip="Additional reletting allowance included in leasing/vacancy costs." overridden={isOverridden('relettingCostAllowance')} sourceConflict={hasSourceConflict('relettingCostAllowance' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('relettingCostAllowance' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('relettingCostAllowance' as keyof TenYearCashFlowInputs)} />
              <AssumptionField label="Lease Expiry Year" source={leaseExpiryYear ? 'Manual' : 'Blank'} tooltip="Optional lease-expiry reference for workspace review; formulas are unchanged in this phase."><Input type="number" value={leaseExpiryYear} onChange={e => setLeaseExpiryYear(e.target.value)} placeholder="Enter year" /></AssumptionField>
              <AssumptionField label="WALE if Available" source={waleYears ? 'Manual' : prefill ? 'Property Profile' : 'Blank'} tooltip="Optional WALE reference for review and report context; formulas are unchanged in this phase."><Input type="number" value={waleYears} onChange={e => setWaleYears(e.target.value)} placeholder="Years" /></AssumptionField>
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-card/60 p-3">
            <h3 className="mb-3 text-sm font-semibold text-primary">6. Capex Assumptions</h3>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <OverrideNumber label="Annual Capex Reserve" field="annualCapexReserve" value={inputs.annualCapexReserve} update={updateOverride} placeholder={assumptionPlaceholders.annualCapexReserve} pending={pending && !overrides.annualCapexReserve} source={sourceFor('annualCapexReserve', dcfOutputs ? 'DCF Tab' : 'Manual')} tooltip="Annual capex reserve used by the protected projection formulas." overridden={isOverridden('annualCapexReserve')} sourceConflict={hasSourceConflict('annualCapexReserve' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('annualCapexReserve' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('annualCapexReserve' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Major Capex Allowance" field="majorCapexAmount" value={inputs.majorCapexAmount} update={updateOverride} pending={pending && !overrides.majorCapexAmount} source={sourceFor('majorCapexAmount', 'Manual')} tooltip="Major one-off capex allowance included in the capex schedule." overridden={isOverridden('majorCapexAmount')} sourceConflict={hasSourceConflict('majorCapexAmount' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('majorCapexAmount' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('majorCapexAmount' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Major Capex Timing" field="majorCapexYear" value={inputs.majorCapexYear} update={updateOverride} pending={pending && !overrides.majorCapexYear} source={sourceFor('majorCapexYear', 'Manual')} tooltip="Projection year for major capex allowance." overridden={isOverridden('majorCapexYear')} sourceConflict={hasSourceConflict('majorCapexYear' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('majorCapexYear' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('majorCapexYear' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Specialist Reserves" field="specialistReserve" value={inputs.specialistReserve} update={updateOverride} pending={pending && !overrides.specialistReserve} source={sourceFor('specialistReserve', inputs.assetDomain === 'industrial' ? 'Research Engine' : 'Manual')} tooltip="Specialist reserve for commercial/industrial risk items." overridden={isOverridden('specialistReserve')} sourceConflict={hasSourceConflict('specialistReserve' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('specialistReserve' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('specialistReserve' as keyof TenYearCashFlowInputs)} />
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-card/60 p-3">
            <h3 className="mb-3 text-sm font-semibold text-primary">7. Tax / After-Tax Assumptions</h3>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <OverrideNumber label="Tax Rate" field="taxRatePct" value={inputs.taxRatePct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.taxRatePct} pending={pending && !overrides.taxRatePct} source={sourceFor('taxRatePct', 'Manual')} tooltip="Tax rate used by existing after-tax cashflow formulas; confirm with accountant review." overridden={isOverridden('taxRatePct')} sourceConflict={hasSourceConflict('taxRatePct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('taxRatePct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('taxRatePct' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Depreciation Allowance" field="depreciationPa" value={inputs.depreciationPa} update={updateOverride} pending={pending && !overrides.depreciationPa} source={sourceFor('depreciationPa', 'Blank')} tooltip="Depreciation allowance if supported by a depreciation schedule." overridden={isOverridden('depreciationPa')} sourceConflict={hasSourceConflict('depreciationPa' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('depreciationPa' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('depreciationPa' as keyof TenYearCashFlowInputs)} />
              <AssumptionField label="Interest Deductibility" source={interestDeductible ? 'Manual' : 'Blank'} tooltip="Workspace toggle for tax review status; formulas are unchanged in this phase."><Button type="button" variant={interestDeductible ? 'default' : 'outline'} onClick={() => setInterestDeductible(v => !v)}>{interestDeductible ? 'Supported' : 'Review required'}</Button></AssumptionField>
              <AssumptionField label="GST Economic Cost Source" source={sourceFor('gstEconomicCost', gstOutputs ? 'GST Tab' : 'Blank')} tooltip="Shows whether GST economic cost is linked from GST tab or manually overridden." overridden={isOverridden('gstEconomicCost')}><div className="text-sm text-muted-foreground">{sourceFor('gstEconomicCost', gstOutputs ? 'GST Tab' : 'Blank')}</div></AssumptionField>
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-card/60 p-3">
            <h3 className="mb-3 text-sm font-semibold text-primary">8. Exit Assumptions</h3>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <OverrideNumber label="Capital Growth %" field="capitalGrowthPct" value={inputs.capitalGrowthPct} update={updateOverride} suffix="%" pending={pending && !overrides.capitalGrowthPct} source={sourceFor('capitalGrowthPct', 'Research Engine')} tooltip="Capital growth assumption used by the protected property value projection." overridden={isOverridden('capitalGrowthPct')} sourceConflict={hasSourceConflict('capitalGrowthPct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('capitalGrowthPct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('capitalGrowthPct' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Terminal Cap Rate %" field="terminalCapRatePct" value={inputs.terminalCapRatePct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.terminalCapRatePct} pending={pending && !overrides.terminalCapRatePct} source={sourceFor('terminalCapRatePct', dcfOutputs ? 'DCF Tab' : 'Cap Rate Tab')} tooltip="Terminal cap rate from Cap Rate/DCF or manual override." overridden={isOverridden('terminalCapRatePct')} sourceConflict={hasSourceConflict('terminalCapRatePct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('terminalCapRatePct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('terminalCapRatePct' as keyof TenYearCashFlowInputs)} />
              <OverrideNumber label="Selling Costs %" field="sellingCostPct" value={inputs.sellingCostPct} update={updateOverride} suffix="%" pending={pending && !overrides.sellingCostPct} source={sourceFor('sellingCostPct', 'Manual')} tooltip="Selling cost percentage deducted from exit proceeds." overridden={isOverridden('sellingCostPct')} sourceConflict={hasSourceConflict('sellingCostPct' as keyof TenYearCashFlowInputs)} onKeepOverride={() => clearSourceConflict('sellingCostPct' as keyof TenYearCashFlowInputs)} onUseSource={() => useSourceValue('sellingCostPct' as keyof TenYearCashFlowInputs)} />
              <AssumptionField label="Exit Value Method" source="Manual" tooltip="Workspace method label for exit value review; formulas are unchanged in this phase."><Select value={exitValueMethod} onValueChange={setExitValueMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Terminal cap rate">Terminal cap rate</SelectItem><SelectItem value="Capital growth">Capital growth</SelectItem><SelectItem value="Manual valuation review">Manual valuation review</SelectItem></SelectContent></Select></AssumptionField>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">{cashFlowAiEstimateButtons.slice(0, 8).map(b => <Button key={b} size="sm" variant="outline"><Sparkles className="h-3.5 w-3.5 mr-1" />{b}</Button>)}</div>
            <Button disabled={!modelReady} variant="outline" title={!modelReady ? 'Generate the validated 10-year cash flow model before exporting a PDF report.' : 'Generate PDF Report'}><FileText className="h-3.5 w-3.5 mr-1" />Generate PDF Report</Button>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
    {pending && <Card className="border-primary/30 bg-primary/5"><CardContent className="pt-4"><p className="font-semibold text-primary">Awaiting Cash Flow Inputs</p><p className="mt-1 text-sm text-muted-foreground">Import property, NOI, GST, debt and DCF assumptions or enter values manually to generate the 10-year cash flow report.</p></CardContent></Card>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{summaryCards.map(([label, value]) => <SummaryCard key={String(label)} label={String(label)} value={value as any} pending={pending} />)}<SummaryCard label="Risk status" value={title(s.riskStatus)} pending={pending} /></div>
    {result.warnings.length > 0 && <Card className="border-amber-500/30 bg-amber-500/10"><CardContent className="pt-4 text-sm text-amber-100"><div className="font-medium mb-2">Grouped warnings</div><ul className="list-disc pl-5 space-y-1">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></CardContent></Card>}
    <MetricRows years={result.years} mode={mode} pending={pending} />
    <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Report Commentary</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground leading-relaxed">{pending ? PENDING : result.commentary}</p></CardContent></Card>
  </CardContent></Card>;
}
