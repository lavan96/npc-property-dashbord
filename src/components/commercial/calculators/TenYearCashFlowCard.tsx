import { useEffect, useMemo, useState } from 'react';
import { Calculator, FileText, GitBranch, Sparkles, TrendingUp } from 'lucide-react';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

function OverrideNumber({ label, field, value, update, suffix, placeholder, pending }: { label: string; field: keyof TenYearCashFlowInputs; value?: number; update: (field: keyof TenYearCashFlowInputs, value: number) => void; suffix?: string; placeholder?: string; pending?: boolean }) {
  return <div><Label className="flex items-center gap-1.5">{label}<GitBranch className="h-3.5 w-3.5 text-sky-300" aria-label="Overridden" /></Label><div className="flex items-center gap-2"><Input type="number" value={pending ? '' : value ?? ''} placeholder={placeholder} onChange={e => update(field, Number(e.target.value))} />{suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}</div></div>;
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
  const gstOutputs = useCommercialDealState(s => s.profile.gstOutputs);
  const dcfInputs = useCommercialDealState(s => s.profile.dcfInputs);
  const dcfOutputs = useCommercialDealState(s => s.profile.dcfOutputs);
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
    gstOutputs,
    dcfInputs,
    dcfOutputs,
    capRateOutputs: undefined,
    gstInputs: {},
    debtInputs: {},
    industrialMetrics: {},
    riskInputs: {},
    riskOutputs: {},
    aiEstimateMetadata: {},
    documentVerificationStatus: {},
    scenarioOverrides: {},
    assumptions: {},
    aiEstimateAuditLog: [],
  }), [dealProfile, purchaserStructure, propertyValuation, leaseIncome, operatingExpenses, lendingAssumptions, acquisitionCosts, fundsToComplete, borrowingOutputs, noiOutputs, gstOutputs, dcfInputs, dcfOutputs]);
  const updateGlobal = useCommercialDealState(s => s.updateGlobal);
  const sourceMode = useCommercialDealState(s => s.sourceModes.tenYearCashFlow);
  const setSourceMode = useCommercialDealState(s => s.setSourceMode);
  const [mode, setMode] = useState<TenYearCashFlowMode>('investor');
  const [overrides, setOverrides] = useState<Partial<TenYearCashFlowInputs>>({});
  const [overriddenFields, setOverriddenFields] = useState<string[]>([]);
  const inputs = useMemo(() => buildTenYearInputsFromGlobal(profile, mode, overrides), [profile, mode, overrides]);
  const result = useMemo(() => calculateTenYearCashFlow(inputs, overriddenFields), [inputs, overriddenFields]);
  const hasManualInputs = overriddenFields.length > 0;
  const hasImportedInputs = Boolean(prefill) || Boolean(borrowingOutputs) || Boolean(noiOutputs) || Boolean(gstOutputs) || Boolean(dcfOutputs);
  const manualRequiredFields: Array<keyof TenYearCashFlowInputs> = ['purchasePrice', 'totalCostBase', 'passingRent', 'rentGrowthPct', 'vacancyAllowancePct', 'outgoingsGrowthPct', 'annualCapexReserve', 'terminalCapRatePct', 'taxRatePct', 'gstEconomicCost'];
  const manualInputsComplete = manualRequiredFields.every(field => overriddenFields.includes(String(field)));
  const hasMinimumInputs = hasPositive(overrides.purchasePrice ?? (prefill ? inputs.purchasePrice : undefined)) && hasPositive(overrides.terminalCapRatePct ?? (prefill ? inputs.terminalCapRatePct : undefined)) && (hasPositive(overrides.passingRent ?? (prefill ? inputs.passingRent : undefined)) || hasPositive(overrides.marketRent ?? (prefill ? inputs.marketRent : undefined)));
  const sourceComplete = hasImportedInputs || (hasManualInputs && manualInputsComplete);
  const modelReady = sourceComplete && hasMinimumInputs && result.warnings.every(w => !/must be greater|must be provided|required to calculate/i.test(w));

  useEffect(() => { if (modelReady) updateGlobal('tenYearCashFlowOutputs', result); }, [modelReady, result, updateGlobal]);
  const updateOverride = (field: keyof TenYearCashFlowInputs, value: number) => { setOverrides(o => ({ ...o, [field]: Number.isFinite(value) ? value : 0 })); setOverriddenFields(f => Array.from(new Set([...f, String(field)]))); if (sourceMode === 'global') setSourceMode('tenYearCashFlow', 'manualOverride'); };
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
    <div className="grid md:grid-cols-4 gap-3"><div><Label>Cash Flow Mode</Label><Select value={mode} onValueChange={v => setMode(v as TenYearCashFlowMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="investor">Investor</SelectItem><SelectItem value="ownerOccupier">Business Owner-Occupier</SelectItem><SelectItem value="relatedPartyLease">Related-Party Lease</SelectItem></SelectContent></Select></div><div><Label>Data source</Label><Select value={sourceMode} onValueChange={v => setSourceMode('tenYearCashFlow', v as CalculatorSourceMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="global">Use Global Deal Inputs</SelectItem><SelectItem value="manualOverride">Manual entry / no property linked</SelectItem><SelectItem value="aiPending">AI Estimate Pending</SelectItem><SelectItem value="savedPropertyLinked">Saved Property Linked</SelectItem></SelectContent></Select></div><OverrideNumber label="Purchase price" field="purchasePrice" value={inputs.purchasePrice} update={updateOverride} placeholder={assumptionPlaceholders.purchasePrice} pending={pending && !overrides.purchasePrice} /><OverrideNumber label="Total cost base" field="totalCostBase" value={inputs.totalCostBase} update={updateOverride} placeholder={assumptionPlaceholders.totalCostBase} pending={pending && !overrides.totalCostBase} /><OverrideNumber label="Passing rent / Year 1 rent" field="passingRent" value={inputs.passingRent} update={updateOverride} placeholder={assumptionPlaceholders.passingRent} pending={pending && !overrides.passingRent} /><OverrideNumber label="Rent growth" field="rentGrowthPct" value={inputs.rentGrowthPct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.rentGrowthPct} pending={pending && !overrides.rentGrowthPct} /><OverrideNumber label="Vacancy allowance" field="vacancyAllowancePct" value={inputs.vacancyAllowancePct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.vacancyAllowancePct} pending={pending && !overrides.vacancyAllowancePct} /><OverrideNumber label="Outgoings growth" field="outgoingsGrowthPct" value={inputs.outgoingsGrowthPct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.outgoingsGrowthPct} pending={pending && !overrides.outgoingsGrowthPct} /><OverrideNumber label="Capex reserve" field="annualCapexReserve" value={inputs.annualCapexReserve} update={updateOverride} placeholder={assumptionPlaceholders.annualCapexReserve} pending={pending && !overrides.annualCapexReserve} /><OverrideNumber label="Terminal cap rate" field="terminalCapRatePct" value={inputs.terminalCapRatePct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.terminalCapRatePct} pending={pending && !overrides.terminalCapRatePct} /><OverrideNumber label="Tax rate" field="taxRatePct" value={inputs.taxRatePct} update={updateOverride} suffix="%" placeholder={assumptionPlaceholders.taxRatePct} pending={pending && !overrides.taxRatePct} /><OverrideNumber label="GST economic cost" field="gstEconomicCost" value={inputs.gstEconomicCost} update={updateOverride} placeholder={assumptionPlaceholders.gstEconomicCost} pending={pending && !overrides.gstEconomicCost} /></div>
    {pending && <Card className="border-primary/30 bg-primary/5"><CardContent className="pt-4"><p className="font-semibold text-primary">Awaiting Cash Flow Inputs</p><p className="mt-1 text-sm text-muted-foreground">Import property, NOI, GST, debt and DCF assumptions or enter values manually to generate the 10-year cash flow report.</p></CardContent></Card>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{summaryCards.map(([label, value]) => <SummaryCard key={String(label)} label={String(label)} value={value as any} pending={pending} />)}<SummaryCard label="Risk status" value={title(s.riskStatus)} pending={pending} /></div>
    <Card className="border-primary/20 bg-primary/5"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /> Assumptions / AI estimate actions</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2">{cashFlowAiEstimateButtons.slice(0, 8).map(b => <Button key={b} size="sm" variant="outline"><Sparkles className="h-3.5 w-3.5 mr-1" />{b}</Button>)}</div><div className="grid md:grid-cols-4 gap-2 text-xs">{Object.values(result.assumptions).map(a => <div key={a.key} className="rounded border bg-muted/20 p-2"><div className="font-medium">{a.label}</div><div className="mt-1 text-muted-foreground">{pending ? assumptionPlaceholders[a.key as keyof TenYearCashFlowInputs] ?? 'Enter manually or import from linked modules' : typeof a.value === 'number' ? String(a.value) : String(a.value ?? PENDING)}</div><Badge variant="outline" className="mt-1 text-[10px]">{pending ? PENDING : a.status}</Badge></div>)}</div><Button disabled={!modelReady} variant="outline" title={!modelReady ? 'Generate the validated 10-year cash flow model before exporting a PDF report.' : 'Generate PDF Report'}><FileText className="h-3.5 w-3.5 mr-1" />Generate PDF Report</Button></CardContent></Card>
    {result.warnings.length > 0 && <Card className="border-amber-500/30 bg-amber-500/10"><CardContent className="pt-4 text-sm text-amber-100"><div className="font-medium mb-2">Grouped warnings</div><ul className="list-disc pl-5 space-y-1">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></CardContent></Card>}
    <MetricRows years={result.years} mode={mode} pending={pending} />
    <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Report Commentary</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground leading-relaxed">{pending ? PENDING : result.commentary}</p></CardContent></Card>
  </CardContent></Card>;
}
