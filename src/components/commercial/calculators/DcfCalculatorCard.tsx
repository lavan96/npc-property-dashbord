import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { runDcfAssessment } from '@/utils/commercial';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { getDefaultCommercialIndustrialDealProfile, useCommercialDealState } from '@/utils/commercial/commercialDealState';

const PENDING = 'Pending';
const EMPTY_STATUS = 'Awaiting DCF Inputs';
const EMPTY_HELPER = 'Import property, NOI, cap rate, GST and lending assumptions or enter values manually to generate the cashflow model.';

type DcfFieldKey = 'price' | 'acqCosts' | 'initialNoi' | 'hold' | 'growth' | 'vacancy' | 'termCap' | 'sellingCosts' | 'discount' | 'loan' | 'interest' | 'term' | 'annualCapex' | 'downtimeMonths';
type DcfSourceState = 'Blank' | 'Property Profile' | 'Scraped' | 'NOI Tab' | 'Cap Rate Tab' | 'GST Tab' | 'ICR / DSCR Tab' | 'Borrowing Capacity' | 'Research Engine' | 'AI Estimate' | 'Manual' | 'User Override' | 'Verified';
type Candidate = { value: number; source: DcfSourceState; detail?: string };
type FieldMeta = { source: DcfSourceState; original?: Candidate; pending?: Candidate; history: string[] };

type FieldState = Record<DcfFieldKey, string>;
type MetaState = Record<DcfFieldKey, FieldMeta>;

const fieldKeys: DcfFieldKey[] = ['price', 'acqCosts', 'initialNoi', 'hold', 'growth', 'vacancy', 'termCap', 'sellingCosts', 'discount', 'loan', 'interest', 'term', 'annualCapex', 'downtimeMonths'];
const blankFields = Object.fromEntries(fieldKeys.map((k) => [k, ''])) as FieldState;
const blankMeta = Object.fromEntries(fieldKeys.map((k) => [k, { source: 'Blank', history: [] }])) as MetaState;
const defaultProfile = getDefaultCommercialIndustrialDealProfile();

const placeholders: Record<DcfFieldKey, string> = {
  price: 'Pulled from property profile or enter manually',
  acqCosts: 'Pulled from purchase costs / GST or enter manually',
  initialNoi: 'Pulled from NOI tab or enter manually',
  hold: 'Enter hold period',
  growth: 'Enter annual rent growth',
  vacancy: 'Enter vacancy allowance',
  termCap: 'Pulled from Cap Rate tab or enter manually',
  sellingCosts: 'Enter selling cost allowance',
  discount: 'Enter discount rate',
  loan: 'Pulled from borrowing capacity or enter manually',
  interest: 'Pulled from ICR / DSCR or enter manually',
  term: 'Enter loan term',
  annualCapex: 'Enter annual capex',
  downtimeMonths: 'Enter downtime months',
};

const sourceLabels: Record<DcfSourceState, string> = {
  Blank: 'Blank',
  'Property Profile': 'From Property',
  Scraped: 'Scraped',
  'NOI Tab': 'From NOI',
  'Cap Rate Tab': 'From Cap Rate',
  'GST Tab': 'From GST',
  'ICR / DSCR Tab': 'From ICR / DSCR',
  'Borrowing Capacity': 'From Borrowing',
  'Research Engine': 'Research',
  'AI Estimate': 'AI Estimate',
  Manual: 'Manual',
  'User Override': 'Override',
  Verified: 'Verified',
};

const fieldLabels: Record<DcfFieldKey, string> = {
  price: 'Purchase Price', acqCosts: 'Acquisition Costs', initialNoi: 'Base NOI', hold: 'Hold Period', growth: 'Rental Growth', vacancy: 'Vacancy Allowance', termCap: 'Terminal Cap', sellingCosts: 'Selling Costs', discount: 'Discount Rate', loan: 'Loan Amount', interest: 'Interest Rate', term: 'Loan Term', annualCapex: 'Annual Capex', downtimeMonths: 'Downtime Months',
};

const fmt0 = (n: number) => Number.isFinite(n) ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n) : PENDING;
const num = (v: string) => (v === '' ? 0 : Number(v));
const valueOrUndefined = (v: string) => (v === '' ? undefined : num(v));
const isPositiveNumber = (v: string) => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) > 0;
const hasNumber = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));
const safePct = (n: number | null | undefined) => (n != null && Number.isFinite(n) ? `${n}%` : PENDING);
const asNum = (...values: unknown[]) => values.map(Number).find((v) => Number.isFinite(v) && v !== 0);
const candidate = (value: unknown, source: DcfSourceState, detail?: string): Candidate | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? { value: n, source, detail } : undefined;
};
const changedFromDefault = (value: unknown, defaultValue: unknown) => Number.isFinite(Number(value)) && Number(value) !== 0 && Number(value) !== Number(defaultValue ?? 0);

export function DcfCalculatorCard() {
  const { prefill, property } = useCalculatorPrefill();
  const profile = useCommercialDealState((s) => s.profile);
  const [fields, setFields] = useState<FieldState>(blankFields);
  const [meta, setMeta] = useState<MetaState>(blankMeta);
  const [generated, setGenerated] = useState(false);

  const linkedLabel = prefill ? `Linked property: ${prefill.address || prefill.propertyId}` : 'Manual entry / no property linked';

  const cascade = useMemo<Record<DcfFieldKey, Candidate | undefined>>(() => {
    const p = (property ?? {}) as Record<string, any>;
    const scrape = p.scraped_data ?? p.scrape ?? p.property_scrape ?? {};
    const research = p.research_engine ?? p.research ?? p.market_research ?? {};
    const ai = profile.aiEstimateMetadata;
    const aiValue = (key: string) => ai[key]?.estimatedValue ?? ai[`dcfInputs.${key}`]?.estimatedValue;
    const acqCostTotal = asNum(profile.fundsToComplete?.totalAcquisitionCosts, (profile.gstOutputs?.gstEconomicCost ?? 0) + (profile.acquisitionCosts?.otherAcquisitionCosts ?? 0), profile.acquisitionCosts?.otherAcquisitionCosts);
    const actualNoi = asNum(profile.noiOutputs?.actualNoi, (profile.noiOutputs as any)?.netOperatingIncome, profile.leaseIncome.grossPassingRent);
    const stabilisedNoi = asNum(profile.noiOutputs?.stabilisedNoi, (profile.noiOutputs as any)?.stabilizedNoi, profile.leaseIncome.marketRent);
    const lenderNoi = asNum(profile.noiOutputs?.lenderAdjustedNoi, (profile.noiOutputs as any)?.lenderNoi);
    const selectedNoi = lenderNoi ?? stabilisedNoi ?? actualNoi;
    const purchaseFromGlobal = changedFromDefault(profile.propertyValuation.purchasePrice, defaultProfile.propertyValuation.purchasePrice) ? profile.propertyValuation.purchasePrice : undefined;
    const gstPurchase = changedFromDefault(profile.gstInputs.purchasePrice, defaultProfile.gstInputs.purchasePrice) ? profile.gstInputs.purchasePrice : undefined;
    const borrowingPurchase = changedFromDefault((profile.borrowingOutputs as any)?.inputs?.purchasePrice ?? profile.propertyValuation.estimatedMarketValue, defaultProfile.propertyValuation.estimatedMarketValue) ? ((profile.borrowingOutputs as any)?.inputs?.purchasePrice ?? profile.propertyValuation.estimatedMarketValue) : undefined;

    return {
      price: candidate(prefill?.purchasePrice ?? prefill?.valuation, 'Property Profile') ?? candidate(gstPurchase, 'GST Tab') ?? candidate(borrowingPurchase ?? purchaseFromGlobal, 'Borrowing Capacity') ?? candidate(scrape.purchasePrice ?? scrape.price, 'Scraped'),
      acqCosts: candidate(profile.fundsToComplete?.totalAcquisitionCosts, 'Borrowing Capacity', 'Funds-to-complete') ?? candidate(profile.gstOutputs?.gstEconomicCost, 'GST Tab', 'Net GST economic cost') ?? candidate(acqCostTotal, 'Borrowing Capacity') ?? candidate(aiValue('acquisitionCosts'), 'AI Estimate'),
      initialNoi: candidate(selectedNoi, 'NOI Tab', lenderNoi ? 'Lender-Adjusted NOI' : stabilisedNoi ? 'Stabilised NOI' : actualNoi ? 'Actual NOI' : undefined) ?? candidate(prefill?.passingNoi ?? prefill?.marketNoi, 'Property Profile'),
      hold: changedFromDefault(profile.dcfInputs.holdPeriodYears, defaultProfile.dcfInputs.holdPeriodYears) ? candidate(profile.dcfInputs.holdPeriodYears, 'Manual') : undefined,
      growth: candidate(research.rentalGrowthPct ?? research.marketGrowthPct ?? research.rent_growth_pct, 'Research Engine') ?? candidate(aiValue('rentalGrowthPct'), 'AI Estimate'),
      vacancy: (changedFromDefault(profile.leaseIncome.vacancyAllowancePct, defaultProfile.leaseIncome.vacancyAllowancePct) ? candidate(profile.leaseIncome.vacancyAllowancePct, 'NOI Tab') : undefined) ?? candidate(research.vacancyAllowancePct ?? research.vacancy_pct, 'Research Engine') ?? candidate(aiValue('vacancyAllowancePct'), 'AI Estimate'),
      termCap: candidate((profile.capRateOutputs as any)?.targetCapRatePct ?? (profile.capRateOutputs as any)?.capRatePct, 'Cap Rate Tab') ?? candidate(research.capRatePct ?? research.terminalCapRatePct, 'Research Engine') ?? candidate(aiValue('terminalCapRatePct'), 'AI Estimate'),
      sellingCosts: candidate(p.selling_costs_pct ?? p.transaction_assumptions?.sellingCostsPct, 'Property Profile') ?? candidate(aiValue('sellingCostsPct'), 'AI Estimate'),
      discount: candidate(research.discountRatePct ?? research.riskAdjustedDiscountRatePct, 'Research Engine') ?? candidate(aiValue('discountRatePct'), 'AI Estimate'),
      loan: candidate(profile.borrowingOutputs?.finalRiskAdjustedLoan ?? profile.debtInputs.proposedLoanAmount, 'Borrowing Capacity') ?? candidate((profile.icrDscrOutputs as any)?.loanAmount, 'ICR / DSCR Tab'),
      interest: candidate((profile.icrDscrOutputs as any)?.interestRatePct, 'ICR / DSCR Tab') ?? (changedFromDefault(profile.lendingAssumptions.contractInterestRatePct, defaultProfile.lendingAssumptions.contractInterestRatePct) ? candidate(profile.lendingAssumptions.contractInterestRatePct, 'Borrowing Capacity') : undefined) ?? candidate(profile.lendingAssumptions.assessmentFloorRatePct, 'Borrowing Capacity'),
      term: candidate((profile.icrDscrOutputs as any)?.loanTermYears, 'ICR / DSCR Tab') ?? (changedFromDefault(profile.lendingAssumptions.loanTermYears, defaultProfile.lendingAssumptions.loanTermYears) ? candidate(profile.lendingAssumptions.loanTermYears, 'Borrowing Capacity') : undefined) ?? (changedFromDefault(profile.lendingAssumptions.amortisationYears, defaultProfile.lendingAssumptions.amortisationYears) ? candidate(profile.lendingAssumptions.amortisationYears, 'Borrowing Capacity') : undefined),
      annualCapex: candidate(p.annual_capex ?? p.capex_reserve_pa, 'Property Profile') ?? candidate(research.annualCapex, 'Research Engine') ?? candidate(aiValue('annualCapex'), 'AI Estimate'),
      downtimeMonths: candidate(p.downtime_months ?? p.lease_risk?.downtimeMonths, 'Property Profile') ?? candidate(aiValue('downtimeMonths'), 'AI Estimate'),
    };
  }, [prefill, property, profile]);

  useEffect(() => {
    setFields((current) => {
      let changed = false;
      const next = { ...current };
      setMeta((m) => {
        const nm = { ...m };
        fieldKeys.forEach((key) => {
          const c = cascade[key];
          if (!c) return;
          const currentMeta = nm[key];
          const currentValue = current[key];
          const sameCurrent = Number(currentValue) === c.value;
          if (currentMeta.source === 'User Override') {
            if (!sameCurrent && (!currentMeta.pending || currentMeta.pending.value !== c.value || currentMeta.pending.source !== c.source)) nm[key] = { ...currentMeta, pending: c };
            return;
          }
          if (currentValue === '' || currentMeta.source !== c.source || !sameCurrent) {
            next[key] = String(c.value);
            changed = true;
            nm[key] = { source: c.source, original: c, history: [...currentMeta.history, `${new Date().toISOString()}: ${fieldLabels[key]} set from ${c.source}${c.detail ? ` (${c.detail})` : ''} = ${c.value}`] };
          }
        });
        return nm;
      });
      return changed ? next : current;
    });
    setGenerated(false);
  }, [cascade]);

  const updateField = (key: DcfFieldKey, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setMeta((current) => {
      const m = current[key];
      const nextSource: DcfSourceState = m.source === 'Blank' || m.source === 'Manual' ? 'Manual' : 'User Override';
      const history = m.source === 'Blank' || m.source === 'Manual'
        ? m.history
        : [...m.history, `${new Date().toISOString()}: User override preserved original ${m.original?.source ?? m.source} value ${m.original?.value ?? 'blank'}.`];
      return { ...current, [key]: { ...m, source: nextSource, history } };
    });
    setGenerated(false);
  };

  const usePendingSource = (key: DcfFieldKey) => {
    const pending = meta[key].pending;
    if (!pending) return;
    setFields((current) => ({ ...current, [key]: String(pending.value) }));
    setMeta((current) => ({ ...current, [key]: { source: pending.source, original: pending, pending: undefined, history: [...current[key].history, `${new Date().toISOString()}: Override replaced with new ${pending.source} value ${pending.value}.`] } }));
    setGenerated(false);
  };

  const keepOverride = (key: DcfFieldKey) => setMeta((current) => ({ ...current, [key]: { ...current[key], pending: undefined, history: [...current[key].history, `${new Date().toISOString()}: Kept saved override instead of new source value.`] } }));

  const canGenerate = isPositiveNumber(fields.price) && isPositiveNumber(fields.initialNoi) && isPositiveNumber(fields.hold) && hasNumber(fields.growth) && isPositiveNumber(fields.termCap) && isPositiveNumber(fields.discount);
  const isComplete = generated && canGenerate;

  const result = useMemo(() => {
    if (!isComplete) return null;
    return runDcfAssessment({
      purchasePrice: num(fields.price), acquisitionCosts: num(fields.acqCosts), initialNoi: num(fields.initialNoi), holdPeriodYears: Math.max(1, num(fields.hold)), rentalGrowthPct: num(fields.growth), vacancyAllowancePct: num(fields.vacancy), terminalCapRatePct: num(fields.termCap), sellingCostsPct: num(fields.sellingCosts), discountRatePct: num(fields.discount), loanAmount: num(fields.loan), interestRatePct: num(fields.interest), loanTermYears: num(fields.term), annualCapex: num(fields.annualCapex), downtimeMonths: num(fields.downtimeMonths), exitCapSensitivityPct: [num(fields.termCap) - 0.5, num(fields.termCap), num(fields.termCap) + 0.5],
    });
  }, [isComplete, fields]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discounted Cash Flow (DCF)</CardTitle>
        <CardDescription>Scenario-ready DCF with capex, downtime, exit sensitivity, levered and unlevered returns.</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2 items-center">
          <Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{linkedLabel}</Badge>
          <span className="text-xs text-muted-foreground">Assumptions tracked in status drawer</span>
          <Button size="sm" variant="outline">Estimate for me</Button>
          <Button size="sm" onClick={() => setGenerated(true)} disabled={!canGenerate}>Generate Cashflow</Button>
          <SaveBackButton build={() => ({ purchase_price: valueOrUndefined(fields.price), valuation: valueOrUndefined(fields.price) })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="text-sm font-semibold text-primary">{isComplete ? 'DCF Outputs Generated' : EMPTY_STATUS}</div>
          {!isComplete && <p className="mt-1 text-xs text-muted-foreground">{EMPTY_HELPER}</p>}
        </div>

        <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-3">
          <Field label="Purchase Price" v={fields.price} source={meta.price.source} pending={meta.price.pending} set={(v) => updateField('price', v)} onKeep={() => keepOverride('price')} onUseSource={() => usePendingSource('price')} placeholder={placeholders.price} />
          <Field label="Acquisition Costs" v={fields.acqCosts} source={meta.acqCosts.source} pending={meta.acqCosts.pending} set={(v) => updateField('acqCosts', v)} onKeep={() => keepOverride('acqCosts')} onUseSource={() => usePendingSource('acqCosts')} placeholder={placeholders.acqCosts} />
          <Field label="Base NOI" v={fields.initialNoi} source={meta.initialNoi.source} pending={meta.initialNoi.pending} set={(v) => updateField('initialNoi', v)} onKeep={() => keepOverride('initialNoi')} onUseSource={() => usePendingSource('initialNoi')} placeholder={placeholders.initialNoi} />
          <Field label="Hold Period (yrs)" v={fields.hold} source={meta.hold.source} pending={meta.hold.pending} set={(v) => updateField('hold', v)} onKeep={() => keepOverride('hold')} onUseSource={() => usePendingSource('hold')} placeholder={placeholders.hold} />
          <Field label="Rental Growth %" v={fields.growth} source={meta.growth.source} pending={meta.growth.pending} set={(v) => updateField('growth', v)} onKeep={() => keepOverride('growth')} onUseSource={() => usePendingSource('growth')} step="0.1" placeholder={placeholders.growth} />
          <Field label="Vacancy Allowance %" v={fields.vacancy} source={meta.vacancy.source} pending={meta.vacancy.pending} set={(v) => updateField('vacancy', v)} onKeep={() => keepOverride('vacancy')} onUseSource={() => usePendingSource('vacancy')} step="0.1" placeholder={placeholders.vacancy} />
          <Field label="Terminal Cap %" v={fields.termCap} source={meta.termCap.source} pending={meta.termCap.pending} set={(v) => updateField('termCap', v)} onKeep={() => keepOverride('termCap')} onUseSource={() => usePendingSource('termCap')} step="0.1" placeholder={placeholders.termCap} />
          <Field label="Selling Costs %" v={fields.sellingCosts} source={meta.sellingCosts.source} pending={meta.sellingCosts.pending} set={(v) => updateField('sellingCosts', v)} onKeep={() => keepOverride('sellingCosts')} onUseSource={() => usePendingSource('sellingCosts')} step="0.1" placeholder={placeholders.sellingCosts} />
          <Field label="Discount Rate %" v={fields.discount} source={meta.discount.source} pending={meta.discount.pending} set={(v) => updateField('discount', v)} onKeep={() => keepOverride('discount')} onUseSource={() => usePendingSource('discount')} step="0.1" placeholder={placeholders.discount} />
          <Field label="Loan Amount" v={fields.loan} source={meta.loan.source} pending={meta.loan.pending} set={(v) => updateField('loan', v)} onKeep={() => keepOverride('loan')} onUseSource={() => usePendingSource('loan')} placeholder={placeholders.loan} />
          <Field label="Interest %" v={fields.interest} source={meta.interest.source} pending={meta.interest.pending} set={(v) => updateField('interest', v)} onKeep={() => keepOverride('interest')} onUseSource={() => usePendingSource('interest')} step="0.05" placeholder={placeholders.interest} />
          <Field label="Loan Term (yrs, 0=IO)" v={fields.term} source={meta.term.source} pending={meta.term.pending} set={(v) => updateField('term', v)} onKeep={() => keepOverride('term')} onUseSource={() => usePendingSource('term')} placeholder={placeholders.term} />
          <Field label="Annual Capex" v={fields.annualCapex} source={meta.annualCapex.source} pending={meta.annualCapex.pending} set={(v) => updateField('annualCapex', v)} onKeep={() => keepOverride('annualCapex')} onUseSource={() => usePendingSource('annualCapex')} placeholder={placeholders.annualCapex} />
          <Field label="Downtime Months" v={fields.downtimeMonths} source={meta.downtimeMonths.source} pending={meta.downtimeMonths.pending} set={(v) => updateField('downtimeMonths', v)} onKeep={() => keepOverride('downtimeMonths')} onUseSource={() => usePendingSource('downtimeMonths')} placeholder={placeholders.downtimeMonths} />
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <Label className="text-xs">DCF Assumption History</Label>
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
            {fieldKeys.flatMap((key) => meta[key].history.slice(-1).map((h) => <div key={`${key}-${h}`}>{h}</div>))}
            {!fieldKeys.some((key) => meta[key].history.length) && <div>No cascaded assumptions applied yet.</div>}
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Unlevered IRR" value={safePct(result?.unleveredIrr)} />
          <Metric label="Levered IRR" value={safePct(result?.leveredIrr)} highlight />
          <Metric label="Unlevered NPV" value={result ? fmt0(result.unleveredNpv) : PENDING} />
          <Metric label="Levered NPV" value={result ? fmt0(result.leveredNpv) : PENDING} highlight />
          <Metric label="Equity Invested" value={result ? fmt0(result.equityInvested) : PENDING} />
          <Metric label="Total Equity Returned" value={result ? fmt0(result.totalEquityReturned) : PENDING} />
          <Metric label="Equity Multiple" value={result ? `${result.equityMultiple}x` : PENDING} />
          <Metric label="Terminal Value" value={result ? fmt0(result.terminalValue) : PENDING} />
          <Metric label="Net Sale Proceeds to Equity" value={result ? fmt0(result.netSaleProceeds) : PENDING} />
        </div>

        <Separator />

        <div>
          <Label className="mb-2 block">Yearly Cash Flow</Label>
          {!result ? <PendingPanel /> : (
            <ScrollArea className="h-[320px] rounded border"><Table><TableHeader className="sticky top-0 bg-background"><TableRow><TableHead>Yr</TableHead><TableHead className="text-right">NOI</TableHead><TableHead className="text-right">Capex</TableHead><TableHead className="text-right">Debt Service</TableHead><TableHead className="text-right">Unlevered CF</TableHead><TableHead className="text-right">Levered CF</TableHead><TableHead className="text-right">Loan Balance</TableHead></TableRow></TableHeader><TableBody>{result.rows.map(r => <TableRow key={r.year}><TableCell>{r.year}</TableCell><TableCell className="text-right">{fmt0(r.noi)}</TableCell><TableCell className="text-right">{fmt0(r.capex)}</TableCell><TableCell className="text-right">{fmt0(r.debtService)}</TableCell><TableCell className="text-right">{fmt0(r.unleveredCf)}</TableCell><TableCell className="text-right font-medium">{fmt0(r.leveredCf)}</TableCell><TableCell className="text-right text-muted-foreground">{fmt0(r.loanBalance)}</TableCell></TableRow>)}</TableBody></Table></ScrollArea>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded border p-3"><Label>Exit Cap Sensitivity</Label>{result ? result.sensitivityTable.map(r => <div key={r.exitCapRatePct} className="flex justify-between text-sm"><span>{r.exitCapRatePct}%</span><span>{fmt0(r.netSaleProceeds)}</span></div>) : <PendingPanel compact />}</div>
          <div className="rounded border p-3"><Label>DCF Scenarios</Label>{result ? result.scenarios.map(s => <div key={s.name} className="flex justify-between text-sm"><span>{s.name}</span><span>{s.result.unleveredIrr != null ? `${s.result.unleveredIrr}%` : PENDING}</span></div>) : <PendingPanel compact />}</div>
        </div>
        {result?.warnings.map(w => <p key={w} className="text-xs text-amber-200">• {w}</p>)}
      </CardContent>
    </Card>
  );
}

function Field({ label, v, set, step, placeholder, source, pending, onKeep, onUseSource }: { label: string; v: string; set: (v: string) => void; step?: string; placeholder: string; source: DcfSourceState; pending?: Candidate; onKeep: () => void; onUseSource: () => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2"><Label className="text-xs">{label}</Label><Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/5 text-[10px] text-primary">{sourceLabels[source]}</Badge></div>
      <Input type="number" step={step} value={v} placeholder={placeholder} onChange={e => set(e.target.value)} />
      {pending && <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-4 text-amber-100"><p>New source value available. This field currently uses a saved override.</p><p className="text-muted-foreground">{sourceLabels[pending.source]}: {pending.value}</p><div className="mt-1 flex gap-1"><Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={onKeep}>Keep override</Button><Button type="button" size="sm" className="h-6 px-2 text-[11px]" onClick={onUseSource}>Use source value</Button></div></div>}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-lg p-3 border ${highlight ? 'bg-primary/10 border-primary/30' : 'bg-muted/40'}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold ${highlight ? 'text-primary' : ''}`}>{value}</div></div>;
}

function PendingPanel({ compact = false }: { compact?: boolean }) {
  return <div className={`rounded border border-dashed bg-muted/20 text-sm text-muted-foreground ${compact ? 'mt-2 p-2' : 'p-4'}`}>{PENDING}</div>;
}
