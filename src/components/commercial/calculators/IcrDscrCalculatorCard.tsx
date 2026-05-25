import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { calculateCoverage, maxLoanByIcr } from '@/utils/commercial';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));

export function IcrDscrCalculatorCard() {
  const [noi, setNoi] = useState('200000');
  const [loan, setLoan] = useState('2000000');
  const [rate, setRate] = useState('7.25');
  const [term, setTerm] = useState('25');
  const [targetIcr, setTargetIcr] = useState('1.5');

  const result = useMemo(() => calculateCoverage({
    noi: num(noi), loanAmount: num(loan), interestRatePct: num(rate), loanTermYears: num(term),
  }), [noi, loan, rate, term]);

  const maxLoan = useMemo(() => maxLoanByIcr(num(noi), num(rate), num(targetIcr)), [noi, rate, targetIcr]);

  const icrStatus = result.icr >= 1.5 ? 'pass' : result.icr >= 1.25 ? 'warn' : 'fail';
  const dscrStatus = result.dscr >= 1.35 ? 'pass' : result.dscr >= 1.2 ? 'warn' : 'fail';

  const badgeVariant = (s: string) => s === 'pass' ? 'default' : s === 'warn' ? 'secondary' : 'destructive';

  return (
    <Card>
      <CardHeader>
        <CardTitle>ICR / DSCR</CardTitle>
        <CardDescription>Commercial lender serviceability — Interest & Debt Service Coverage.</CardDescription>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div><Label>NOI (PA)</Label><Input type="number" value={noi} onChange={e => setNoi(e.target.value)} /></div>
          <div><Label>Loan Amount</Label><Input type="number" value={loan} onChange={e => setLoan(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Interest Rate %</Label><Input type="number" step="0.05" value={rate} onChange={e => setRate(e.target.value)} /></div>
            <div><Label>Term (yrs, 0=IO)</Label><Input type="number" value={term} onChange={e => setTerm(e.target.value)} /></div>
          </div>
          <Separator />
          <div><Label>Target ICR (max loan)</Label><Input type="number" step="0.05" value={targetIcr} onChange={e => setTargetIcr(e.target.value)} /></div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Annual Interest" value={fmt(result.annualInterest)} />
          <Row label="Annual Debt Service" value={fmt(result.annualDebtService)} />
          <Separator />
          <div className="flex justify-between items-center">
            <span>ICR</span>
            <Badge variant={badgeVariant(icrStatus) as any}>{result.icr}x</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span>DSCR</span>
            <Badge variant={badgeVariant(dscrStatus) as any}>{result.dscr}x</Badge>
          </div>
          <Separator />
          <Row label={`Max Loan @ ICR ${targetIcr}x`} value={fmt(maxLoan)} highlight />
          <p className="text-xs text-muted-foreground pt-2">
            Lender benchmarks: ICR ≥ 1.50x typical. DSCR ≥ 1.25-1.35x for P&I.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${highlight ? 'text-lg font-bold text-primary' : ''}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
