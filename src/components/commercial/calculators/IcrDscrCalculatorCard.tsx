import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { calculateCoverage, maxLoanByIcr, calculateIcrDscrEngine } from '@/utils/commercial';
import { useApplyPrefill } from '@/contexts/CalculatorPrefillContext';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));

export function IcrDscrCalculatorCard() {
  const [noi, setNoi] = useState('200000');
  const [loan, setLoan] = useState('2000000');
  const [rate, setRate] = useState('7.25');
  const [term, setTerm] = useState('25');
  const [targetIcr, setTargetIcr] = useState('1.5');
  const [targetDscr, setTargetDscr] = useState('1.25');
  const [minDebtYield, setMinDebtYield] = useState('9');
  const [buffer, setBuffer] = useState('1.00');
  const [floorRate, setFloorRate] = useState('0');
  const [proposedLoan, setProposedLoan] = useState('');

  useApplyPrefill((p) => {
    if (p.passingNoi != null) setNoi(String(p.passingNoi));
  });

  const result = useMemo(() => calculateCoverage({
    noi: num(noi), loanAmount: num(loan), interestRatePct: num(rate), loanTermYears: num(term),
  }), [noi, loan, rate, term]);

  const maxLoan = useMemo(() => maxLoanByIcr(num(noi), num(rate), num(targetIcr)), [noi, rate, targetIcr]);
  const coverage = useMemo(() => calculateIcrDscrEngine({ noi: num(noi), loanAmount: num(loan), proposedLoanAmount: proposedLoan === '' ? undefined : num(proposedLoan), contractInterestRatePct: num(rate), assessmentBufferPct: num(buffer), assessmentFloorRatePct: num(floorRate), repaymentType: 'principalAndInterest', amortisationYears: num(term), minimumIcr: num(targetIcr), minimumDscr: num(targetDscr), minimumDebtYield: num(minDebtYield) / 100 }), [noi, loan, proposedLoan, rate, buffer, floorRate, term, targetIcr, targetDscr, minDebtYield]);

  const icrStatus = result.icr >= 1.5 ? 'pass' : result.icr >= 1.25 ? 'warn' : 'fail';
  const dscrStatus = result.dscr >= 1.35 ? 'pass' : result.dscr >= 1.2 ? 'warn' : 'fail';

  const badgeVariant = (s: string) => s === 'pass' ? 'default' : s === 'warn' ? 'secondary' : 'destructive';

  return (
    <Card>
      <CardHeader>
        <CardTitle>ICR / DSCR</CardTitle>
        <CardDescription>Commercial lender serviceability — deterministic ICR, DSCR and debt-yield testing.</CardDescription><div className="flex flex-wrap gap-2 pt-2"><Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge><Badge variant="secondary">Calculated — AI explains only</Badge></div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div><Label>NOI (PA)</Label><Input type="number" value={noi} onChange={e => setNoi(e.target.value)} /></div>
          <div><Label>Loan Amount</Label><Input type="number" value={loan} onChange={e => setLoan(e.target.value)} /></div><div><Label>Proposed Loan Amount (optional)</Label><Input type="number" value={proposedLoan} onChange={e => setProposedLoan(e.target.value)} placeholder="No proposed loan entered" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contract Rate %</Label><Input type="number" step="0.05" value={rate} onChange={e => setRate(e.target.value)} /></div>
            <div><Label>Term (yrs, 0=IO)</Label><Input type="number" value={term} onChange={e => setTerm(e.target.value)} /></div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3"><div><Label>Assessment Buffer %</Label><Input type="number" step="0.05" value={buffer} onChange={e => setBuffer(e.target.value)} /></div><div><Label>Floor Rate %</Label><Input type="number" step="0.05" value={floorRate} onChange={e => setFloorRate(e.target.value)} /></div><div><Label>Minimum ICR</Label><Input type="number" step="0.05" value={targetIcr} onChange={e => setTargetIcr(e.target.value)} /></div><div><Label>Minimum DSCR</Label><Input type="number" step="0.05" value={targetDscr} onChange={e => setTargetDscr(e.target.value)} /></div><div><Label>Minimum Debt Yield %</Label><Input type="number" step="0.1" value={minDebtYield} onChange={e => setMinDebtYield(e.target.value)} /></div></div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Assessment Rate Used" value={`${coverage.assessmentRateUsedPct.toFixed(2)}%`} /><Row label="Annual Interest" value={fmt(coverage.annualInterest)} />
          <Row label="Annual Debt Service" value={fmt(coverage.annualDebtService)} />
          <Separator />
          <div className="flex justify-between items-center">
            <span>ICR</span>
            <Badge variant={badgeVariant(icrStatus) as any}>{coverage.icr}x</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span>DSCR</span>
            <Badge variant={badgeVariant(dscrStatus) as any}>{coverage.dscr}x</Badge>
          </div>
          <Separator />
          <Row label={`Max Loan @ ICR ${targetIcr}x`} value={fmt(coverage.maxLoanByIcr || maxLoan)} highlight /><Row label="Max Loan @ DSCR" value={fmt(coverage.maxLoanByDscr)} /><Row label="Max Loan @ Debt Yield" value={fmt(coverage.maxLoanByDebtYield)} /><Row label="Debt Yield" value={`${(coverage.debtYield * 100).toFixed(2)}%`} /><Row label="ICR Headroom" value={`${coverage.icrHeadroom.toFixed(2)}x`} /><Row label="DSCR Headroom" value={`${coverage.dscrHeadroom.toFixed(2)}x`} />{coverage.proposedLoanSupportability && <Row label="Proposed loan test" value={coverage.proposedLoanSupportability} />}
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
