import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { runDcf } from '@/utils/commercial';

const fmt0 = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));

export function DcfCalculatorCard() {
  const [price, setPrice] = useState('3000000');
  const [acqCosts, setAcqCosts] = useState('180000');
  const [initialNoi, setInitialNoi] = useState('200000');
  const [hold, setHold] = useState('10');
  const [growth, setGrowth] = useState('3.0');
  const [vacancy, setVacancy] = useState('5');
  const [termCap, setTermCap] = useState('6.5');
  const [sellingCosts, setSellingCosts] = useState('1.5');
  const [discount, setDiscount] = useState('8.0');
  const [loan, setLoan] = useState('1950000');
  const [interest, setInterest] = useState('7.25');
  const [term, setTerm] = useState('25');

  const result = useMemo(() => runDcf({
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
  }), [price, acqCosts, initialNoi, hold, growth, vacancy, termCap, sellingCosts, discount, loan, interest, term]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discounted Cash Flow (DCF)</CardTitle>
        <CardDescription>10-year levered & unlevered IRR, NPV and equity multiple.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-3">
          <Field label="Purchase Price" v={price} set={setPrice} />
          <Field label="Acquisition Costs" v={acqCosts} set={setAcqCosts} />
          <Field label="Initial NOI" v={initialNoi} set={setInitialNoi} />
          <Field label="Hold Period (yrs)" v={hold} set={setHold} />
          <Field label="Rental Growth %" v={growth} set={setGrowth} step="0.1" />
          <Field label="Vacancy Allowance %" v={vacancy} set={setVacancy} step="0.1" />
          <Field label="Terminal Cap %" v={termCap} set={setTermCap} step="0.1" />
          <Field label="Selling Costs %" v={sellingCosts} set={setSellingCosts} step="0.1" />
          <Field label="Discount Rate %" v={discount} set={setDiscount} step="0.1" />
          <Field label="Loan Amount" v={loan} set={setLoan} />
          <Field label="Interest %" v={interest} set={setInterest} step="0.05" />
          <Field label="Loan Term (yrs, 0=IO)" v={term} set={setTerm} />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Unlevered IRR" value={result.unleveredIrr != null ? `${result.unleveredIrr}%` : '—'} />
          <Metric label="Levered IRR" value={result.leveredIrr != null ? `${result.leveredIrr}%` : '—'} highlight />
          <Metric label="Unlevered NPV" value={fmt0(result.unleveredNpv)} />
          <Metric label="Levered NPV" value={fmt0(result.leveredNpv)} highlight />
          <Metric label="Equity Invested" value={fmt0(result.equityInvested)} />
          <Metric label="Total Equity Returned" value={fmt0(result.totalEquityReturned)} />
          <Metric label="Equity Multiple" value={`${result.equityMultiple}x`} />
          <Metric label="Terminal Value" value={fmt0(result.terminalValue)} />
        </div>

        <Separator />

        <div>
          <Label className="mb-2 block">Yearly Cash Flow</Label>
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
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, v, set, step }: { label: string; v: string; set: (v: string) => void; step?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} value={v} onChange={e => set(e.target.value)} />
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
