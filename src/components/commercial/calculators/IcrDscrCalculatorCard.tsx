import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { calculateCoverage, maxLoanByIcr, calculateIcrDscrEngine } from '@/utils/commercial';
import { useApplyPrefill, useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { commercialApi } from '@/hooks/useCommercialProperties';
import { industrialApi } from '@/hooks/useIndustrialProperties';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));
const PENDING = 'Pending';

const isPresentNumber = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));

export function IcrDscrCalculatorCard() {
  const [noi, setNoi] = useState('');
  const [loan, setLoan] = useState('');
  const [rate, setRate] = useState('');
  const [term, setTerm] = useState('');
  const [targetIcr, setTargetIcr] = useState('');
  const [targetDscr, setTargetDscr] = useState('');
  const [minDebtYield, setMinDebtYield] = useState('');
  const [buffer, setBuffer] = useState('');
  const [floorRate, setFloorRate] = useState('');
  const [proposedLoan, setProposedLoan] = useState('');
  const [saving, setSaving] = useState(false);
  const { prefill } = useCalculatorPrefill();

  useApplyPrefill((p) => {
    if (p.passingNoi != null) setNoi(String(p.passingNoi));
  });

  const hasRequiredInputs = [noi, loan, rate, term, buffer, floorRate, targetIcr, targetDscr, minDebtYield].every(isPresentNumber);

  const saveBackToProperty = async () => {
    if (!prefill) return;
    setSaving(true);
    try {
      const data = {
        property_id: prefill.propertyId,
        loan_amount: num(loan) || null,
        loan_balance: num(loan) || null,
        interest_rate: num(rate) || null,
        loan_term_years: num(term) || null,
        repayment_type: 'pi' as const,
      };
      const api = prefill.domain === 'industrial' ? industrialApi : commercialApi;
      const existing = await api.listFinancing(prefill.propertyId);
      if (existing.error) throw new Error(existing.error.message);
      const current = existing.data?.[0];
      const saved = current
        ? await api.updateFinancing(current.id, data as any)
        : await api.createFinancing(data as any);
      if (saved.error) throw new Error(saved.error.message);
      toast.success('ICR / DSCR loan assumptions saved back to property financing.');
    } catch (error) {
      toast.error(`Save back failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };


  const result = useMemo(() => calculateCoverage({
    noi: num(noi), loanAmount: num(loan), interestRatePct: num(rate), loanTermYears: num(term),
  }), [noi, loan, rate, term]);

  const maxLoan = useMemo(() => maxLoanByIcr(num(noi), num(rate), num(targetIcr)), [noi, rate, targetIcr]);
  const coverage = useMemo(() => hasRequiredInputs ? calculateIcrDscrEngine({ noi: num(noi), loanAmount: num(loan), proposedLoanAmount: proposedLoan === '' ? undefined : num(proposedLoan), contractInterestRatePct: num(rate), assessmentBufferPct: num(buffer), assessmentFloorRatePct: num(floorRate), repaymentType: 'principalAndInterest', amortisationYears: num(term), minimumIcr: num(targetIcr), minimumDscr: num(targetDscr), minimumDebtYield: num(minDebtYield) / 100 }) : null, [hasRequiredInputs, noi, loan, proposedLoan, rate, buffer, floorRate, term, targetIcr, targetDscr, minDebtYield]);

  const icrStatus = result.icr >= 1.5 ? 'pass' : result.icr >= 1.25 ? 'warn' : 'fail';
  const dscrStatus = result.dscr >= 1.35 ? 'pass' : result.dscr >= 1.2 ? 'warn' : 'fail';

  const badgeVariant = (s: string) => s === 'pass' ? 'default' : s === 'warn' ? 'secondary' : 'destructive';
  const lowestSupportableLoan = coverage ? Math.min(coverage.maxLoanByIcr, coverage.maxLoanByDscr, coverage.maxLoanByDebtYield) : 0;
  const bindingConstraint = coverage
    ? [
        { label: 'ICR', value: coverage.maxLoanByIcr },
        { label: 'DSCR', value: coverage.maxLoanByDscr },
        { label: 'Debt Yield', value: coverage.maxLoanByDebtYield },
      ].reduce((lowest, candidate) => candidate.value < lowest.value ? candidate : lowest).label
    : PENDING;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ICR / DSCR</CardTitle>
        <CardDescription>Commercial lender serviceability — deterministic ICR, DSCR and debt-yield testing.</CardDescription><div className="flex flex-wrap gap-2 pt-2"><Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge><Badge variant="secondary">Calculated — AI explains only</Badge><Badge variant={hasRequiredInputs ? 'secondary' : 'outline'}>{hasRequiredInputs ? 'Coverage Inputs Ready' : 'Awaiting Coverage Inputs'}</Badge><Button size="sm" variant="outline" onClick={saveBackToProperty} disabled={!prefill || saving} title={!prefill ? 'Select a property to save calculator values back.' : undefined}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save Back to Property</Button></div>
        {!hasRequiredInputs && <p className="text-xs text-muted-foreground pt-2">Import NOI, confirm loan amount and apply lender assumptions to test ICR, DSCR and debt yield.</p>}
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div><Label>NOI (PA)</Label><Input type="number" value={noi} onChange={e => setNoi(e.target.value)} placeholder="Pulled from NOI tab or enter manually" /></div>
          <div><Label>Loan Amount</Label><Input type="number" value={loan} onChange={e => setLoan(e.target.value)} placeholder="Pulled from borrowing profile or enter manually" /></div><div><Label>Proposed Loan Amount (optional)</Label><Input type="number" value={proposedLoan} onChange={e => setProposedLoan(e.target.value)} placeholder="Optional target loan amount" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contract Rate %</Label><Input type="number" step="0.05" value={rate} onChange={e => setRate(e.target.value)} placeholder="Enter contract rate" /></div>
            <div><Label>Term (yrs, 0=IO)</Label><Input type="number" value={term} onChange={e => setTerm(e.target.value)} placeholder="Enter loan term" /></div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3"><div><Label>Assessment Buffer %</Label><Input type="number" step="0.05" value={buffer} onChange={e => setBuffer(e.target.value)} placeholder="Enter assessment buffer" /></div><div><Label>Floor Rate %</Label><Input type="number" step="0.05" value={floorRate} onChange={e => setFloorRate(e.target.value)} placeholder="Enter floor rate" /></div><div><Label>Minimum ICR</Label><Input type="number" step="0.05" value={targetIcr} onChange={e => setTargetIcr(e.target.value)} placeholder="Enter lender ICR threshold" /></div><div><Label>Minimum DSCR</Label><Input type="number" step="0.05" value={targetDscr} onChange={e => setTargetDscr(e.target.value)} placeholder="Enter lender DSCR threshold" /></div><div><Label>Minimum Debt Yield %</Label><Input type="number" step="0.1" value={minDebtYield} onChange={e => setMinDebtYield(e.target.value)} placeholder="Enter minimum debt yield" /></div></div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Status" value={hasRequiredInputs ? 'Coverage Inputs Ready' : 'Awaiting Coverage Inputs'} />
          <Row label="Assessment Rate Used" value={coverage ? `${coverage.assessmentRateUsedPct.toFixed(2)}%` : PENDING} /><Row label="Annual Interest" value={coverage ? fmt(coverage.annualInterest) : PENDING} />
          <Row label="Annual Debt Service" value={coverage ? fmt(coverage.annualDebtService) : PENDING} />
          <Separator />
          <div className="flex justify-between items-center">
            <span>ICR</span>
            {coverage ? <Badge variant={badgeVariant(icrStatus) as any}>{coverage.icr}x</Badge> : <span>{PENDING}</span>}
          </div>
          <div className="flex justify-between items-center">
            <span>DSCR</span>
            {coverage ? <Badge variant={badgeVariant(dscrStatus) as any}>{coverage.dscr}x</Badge> : <span>{PENDING}</span>}
          </div>
          <Separator />
          <Row label={`Max Loan @ ICR ${targetIcr || ''}x`.trim()} value={coverage ? fmt(coverage.maxLoanByIcr || maxLoan) : PENDING} highlight /><Row label="Max Loan @ DSCR" value={coverage ? fmt(coverage.maxLoanByDscr) : PENDING} /><Row label="Max Loan @ Debt Yield" value={coverage ? fmt(coverage.maxLoanByDebtYield) : PENDING} /><Row label="Debt Yield" value={coverage ? `${(coverage.debtYield * 100).toFixed(2)}%` : PENDING} /><Row label="ICR Headroom" value={coverage ? `${coverage.icrHeadroom.toFixed(2)}x` : PENDING} /><Row label="DSCR Headroom" value={coverage ? `${coverage.dscrHeadroom.toFixed(2)}x` : PENDING} /><Row label="Lowest Supportable Loan" value={coverage ? fmt(lowestSupportableLoan) : PENDING} /><Row label="Binding Constraint" value={bindingConstraint} />{coverage?.proposedLoanSupportability && <Row label="Proposed loan test" value={coverage.proposedLoanSupportability} />}
          <p className="text-xs text-muted-foreground pt-2">
            {hasRequiredInputs ? 'Lender benchmarks: ICR ≥ 1.50x typical. DSCR ≥ 1.25-1.35x for P&I.' : 'Import NOI, confirm loan amount and apply lender assumptions to test ICR, DSCR and debt yield.'}
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
