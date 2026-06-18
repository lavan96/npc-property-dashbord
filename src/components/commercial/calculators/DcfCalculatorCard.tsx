import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { runDcfAssessment } from '@/utils/commercial';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApplyPrefill, useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';

const PENDING = 'Pending';
const EMPTY_STATUS = 'Awaiting DCF Inputs';
const EMPTY_HELPER = 'Import property, NOI, cap rate, GST and lending assumptions or enter values manually to generate the cashflow model.';

const placeholders = {
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

const fmt0 = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
    : PENDING;

const num = (v: string) => (v === '' ? 0 : Number(v));
const isPositiveNumber = (v: string) => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) > 0;
const hasNumber = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));
const safePct = (n: number | null | undefined) => (n != null && Number.isFinite(n) ? `${n}%` : PENDING);

export function DcfCalculatorCard() {
  const { prefill } = useCalculatorPrefill();
  const [price, setPrice] = useState('');
  const [acqCosts, setAcqCosts] = useState('');
  const [initialNoi, setInitialNoi] = useState('');
  const [hold, setHold] = useState('');
  const [growth, setGrowth] = useState('');
  const [vacancy, setVacancy] = useState('');
  const [termCap, setTermCap] = useState('');
  const [sellingCosts, setSellingCosts] = useState('');
  const [discount, setDiscount] = useState('');
  const [loan, setLoan] = useState('');
  const [interest, setInterest] = useState('');
  const [term, setTerm] = useState('');
  const [annualCapex, setAnnualCapex] = useState('');
  const [downtimeMonths, setDowntimeMonths] = useState('');
  const [generated, setGenerated] = useState(false);

  useApplyPrefill((p) => {
    const px = p.purchasePrice ?? p.valuation;
    if (px != null) setPrice(String(px));
    if (p.passingNoi != null) setInitialNoi(String(p.passingNoi));
    setGenerated(false);
  });

  const canGenerate = isPositiveNumber(price) && isPositiveNumber(initialNoi) && isPositiveNumber(hold)
    && hasNumber(growth) && isPositiveNumber(termCap) && isPositiveNumber(discount);
  const isComplete = generated && canGenerate;

  const result = useMemo(() => {
    if (!isComplete) return null;
    return runDcfAssessment({
      purchasePrice: num(price),
      acquisitionCosts: num(acqCosts),
      initialNoi: num(initialNoi),
      holdPeriodYears: Math.max(1, num(hold)),
      rentalGrowthPct: num(growth),
      vacancyAllowancePct: num(vacancy),
      terminalCapRatePct: num(termCap),
      sellingCostsPct: num(sellingCosts),
      discountRatePct: num(discount),
      loanAmount: num(loan),
      interestRatePct: num(interest),
      loanTermYears: num(term),
      annualCapex: num(annualCapex),
      downtimeMonths: num(downtimeMonths),
      exitCapSensitivityPct: [num(termCap) - 0.5, num(termCap), num(termCap) + 0.5],
    });
  }, [isComplete, price, acqCosts, initialNoi, hold, growth, vacancy, termCap, sellingCosts, discount, loan, interest, term, annualCapex, downtimeMonths]);

  const linkedLabel = prefill ? `Linked property: ${prefill.address || prefill.propertyId}` : 'Manual entry / no property linked';

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
          <SaveBackButton build={() => ({ purchase_price: price === '' ? undefined : num(price), valuation: price === '' ? undefined : num(price) })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="text-sm font-semibold text-primary">{isComplete ? 'DCF Outputs Generated' : EMPTY_STATUS}</div>
          {!isComplete && <p className="mt-1 text-xs text-muted-foreground">{EMPTY_HELPER}</p>}
        </div>

        <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-3">
          <Field label="Purchase Price" v={price} set={setPrice} placeholder={placeholders.price} />
          <Field label="Acquisition Costs" v={acqCosts} set={setAcqCosts} placeholder={placeholders.acqCosts} />
          <Field label="Base NOI" v={initialNoi} set={setInitialNoi} placeholder={placeholders.initialNoi} />
          <Field label="Hold Period (yrs)" v={hold} set={setHold} placeholder={placeholders.hold} />
          <Field label="Rental Growth %" v={growth} set={setGrowth} step="0.1" placeholder={placeholders.growth} />
          <Field label="Vacancy Allowance %" v={vacancy} set={setVacancy} step="0.1" placeholder={placeholders.vacancy} />
          <Field label="Terminal Cap %" v={termCap} set={setTermCap} step="0.1" placeholder={placeholders.termCap} />
          <Field label="Selling Costs %" v={sellingCosts} set={setSellingCosts} step="0.1" placeholder={placeholders.sellingCosts} />
          <Field label="Discount Rate %" v={discount} set={setDiscount} step="0.1" placeholder={placeholders.discount} />
          <Field label="Loan Amount" v={loan} set={setLoan} placeholder={placeholders.loan} />
          <Field label="Interest %" v={interest} set={setInterest} step="0.05" placeholder={placeholders.interest} />
          <Field label="Loan Term (yrs, 0=IO)" v={term} set={setTerm} placeholder={placeholders.term} />
          <Field label="Annual Capex" v={annualCapex} set={setAnnualCapex} placeholder={placeholders.annualCapex} />
          <Field label="Downtime Months" v={downtimeMonths} set={setDowntimeMonths} placeholder={placeholders.downtimeMonths} />
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
            <ScrollArea className="h-[320px] rounded border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Yr</TableHead>
                    <TableHead className="text-right">NOI</TableHead>
                    <TableHead className="text-right">Capex</TableHead>
                    <TableHead className="text-right">Debt Service</TableHead>
                    <TableHead className="text-right">Unlevered CF</TableHead>
                    <TableHead className="text-right">Levered CF</TableHead>
                    <TableHead className="text-right">Loan Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map(r => (
                    <TableRow key={r.year}>
                      <TableCell>{r.year}</TableCell>
                      <TableCell className="text-right">{fmt0(r.noi)}</TableCell>
                      <TableCell className="text-right">{fmt0(r.capex)}</TableCell>
                      <TableCell className="text-right">{fmt0(r.debtService)}</TableCell>
                      <TableCell className="text-right">{fmt0(r.unleveredCf)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt0(r.leveredCf)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt0(r.loanBalance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
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

function Field({ label, v, set, step, placeholder }: { label: string; v: string; set: (v: string) => void; step?: string; placeholder: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} value={v} placeholder={placeholder} onChange={e => set(e.target.value)} />
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'bg-primary/10 border-primary/30' : 'bg-muted/40'}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${highlight ? 'text-primary' : ''}`}>{value}</div>
    </div>
  );
}

function PendingPanel({ compact = false }: { compact?: boolean }) {
  return <div className={`rounded border border-dashed bg-muted/20 text-sm text-muted-foreground ${compact ? 'mt-2 p-2' : 'p-4'}`}>{PENDING}</div>;
}
