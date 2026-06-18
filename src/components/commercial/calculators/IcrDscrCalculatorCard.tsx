import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { calculateCoverage, maxLoanByIcr, calculateIcrDscrEngine } from '@/utils/commercial';
import { useCalculatorPrefill, type CalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { commercialApi } from '@/hooks/useCommercialProperties';
import { industrialApi } from '@/hooks/useIndustrialProperties';
import { useCommercialDealState } from '@/utils/commercial/commercialDealState';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));
const PENDING = 'Pending';

type FieldSource = 'Blank' | 'NOI Tab' | 'Borrowing Capacity' | 'Property Profile' | 'Lender Policy' | 'Scraped' | 'Manual' | 'User Override' | 'Verified';
type IcrField = 'noi' | 'loan' | 'proposedLoan' | 'rate' | 'term' | 'buffer' | 'floorRate' | 'targetIcr' | 'targetDscr' | 'minDebtYield';
interface SourceCandidate { value: number; source: FieldSource; sourceDetail: string }
interface PendingSource extends SourceCandidate { noticedAt: string }
interface FieldState { value: string; source: FieldSource; dirty: boolean; originalValue?: string; originalSource?: FieldSource; sourceDetail?: string; pendingSource?: PendingSource }

const field = (value = '', source: FieldSource = value ? 'Manual' : 'Blank', sourceDetail?: string): FieldState => ({ value, source, sourceDetail, dirty: false });
const isPresentNumber = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));
const sourceBadge = (source: FieldSource) => ({ Blank: 'Blank', 'NOI Tab': 'From NOI', 'Borrowing Capacity': 'From Borrowing', 'Property Profile': 'From Property', 'Lender Policy': 'Lender Policy', Scraped: 'Scraped', Manual: 'Manual', 'User Override': 'Override', Verified: 'Verified' }[source]);

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === '' || value == null) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

const debtYieldPct = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n <= 1 ? n * 100 : n;
};

export function IcrDscrCalculatorCard() {
  const { prefill, property } = useCalculatorPrefill();
  const { profile, appendAiAudit } = useCommercialDealState();
  const [fields, setFields] = useState<Record<IcrField, FieldState>>({ noi: field(), loan: field(), proposedLoan: field(), rate: field(), term: field(), buffer: field(), floorRate: field(), targetIcr: field(), targetDscr: field(), minDebtYield: field() });
  const [saving, setSaving] = useState(false);

  const audit = (action: string, fieldName: string, previousValue: unknown, newValue: unknown, source: string) => appendAiAudit({ action, fieldKey: `icrDscr.${fieldName}`, previousValue, newValue, source, timestamp: new Date().toISOString(), user: 'current-user', propertyId: prefill?.propertyId, dealId: prefill?.propertyId } as any);

  const resolveCascade = (p: CalculatorPrefill): Record<IcrField, SourceCandidate | undefined> => {
    const rawProperty = (property ?? {}) as Record<string, any>;
    const noiOutputs = (profile.noiOutputs ?? {}) as Record<string, any>;
    const lending = (profile.lendingAssumptions ?? {}) as Record<string, any>;
    const borrowingOutputs = (profile.borrowingOutputs ?? {}) as Record<string, any>;
    const dealProfile = (profile.dealProfile ?? {}) as Record<string, any>;
    const debtInputs = (profile.debtInputs ?? {}) as Record<string, any>;
    const selectedBasis = noiOutputs.selectedBasis ?? noiOutputs.noiBasis ?? (profile.leaseIncome as any)?.noiBasis;
    const selectedNoi = selectedBasis === 'actual'
      ? firstNumber(noiOutputs.actualNoi, noiOutputs.actualNOI)
      : selectedBasis === 'stabilised'
        ? firstNumber(noiOutputs.stabilisedNoi, noiOutputs.stabilisedNOI)
        : selectedBasis === 'lenderAdjusted'
          ? firstNumber(noiOutputs.lenderAdjustedNoi, noiOutputs.lenderAdjustedNOI)
          : firstNumber(noiOutputs.selectedNoi, noiOutputs.actualNoi, noiOutputs.stabilisedNoi, noiOutputs.lenderAdjustedNoi);
    const manualNoi = firstNumber(noiOutputs.manualNoi, noiOutputs.manualNOI, debtInputs.manualNoi);
    const scrapedNoi = firstNumber(rawProperty.scraped_passing_noi, rawProperty.extracted_passing_noi_pa, rawProperty.passing_noi_pa, p.passingNoi, p.grossPassingRentPa);

    const proposedFromBorrowing = firstNumber(debtInputs.proposedLoanAmount, borrowingOutputs.proposedLoanAmount, borrowingOutputs.requestedLoanAmount, borrowingOutputs.maxLoan);
    const proposedFromDeal = firstNumber(dealProfile.proposedLoan, dealProfile.proposedLoanAmount, rawProperty.proposed_loan_amount, rawProperty.proposedLoanAmount);
    const savedLoan = firstNumber(rawProperty.loan_amount, rawProperty.loanAmount, rawProperty.saved_loan_amount, rawProperty.current_loan_amount);
    const hasBorrowingSource = Boolean(profile.borrowingOutputs || debtInputs.proposedLoanAmount || dealProfile.proposedLoan || dealProfile.proposedLoanAmount);
    const lenderProfile = lending.profile ? 'Lender policy profile' : 'Lender policy assumptions';

    const pick = (...items: Array<SourceCandidate | undefined>) => items.find(item => item && item.value > 0);
    const pickFinite = (...items: Array<SourceCandidate | undefined>) => items.find(item => item && item.value >= 0);
    return {
      noi: pick(selectedNoi ? { value: selectedNoi, source: 'NOI Tab', sourceDetail: `NOI tab ${selectedBasis ?? 'selected'} borrowing NOI` } : undefined, manualNoi ? { value: manualNoi, source: 'NOI Tab', sourceDetail: 'NOI tab Manual NOI' } : undefined, scrapedNoi ? { value: scrapedNoi, source: 'Scraped', sourceDetail: 'Scraped or property income NOI' } : undefined),
      loan: pick(proposedFromBorrowing ? { value: proposedFromBorrowing, source: 'Borrowing Capacity', sourceDetail: 'Borrowing Capacity Unified proposed / supportable loan' } : undefined, proposedFromDeal ? { value: proposedFromDeal, source: 'Property Profile', sourceDetail: 'Deal profile proposed loan amount' } : undefined, savedLoan ? { value: savedLoan, source: 'Property Profile', sourceDetail: 'Property profile saved loan amount' } : undefined),
      proposedLoan: pick(proposedFromDeal ? { value: proposedFromDeal, source: 'Property Profile', sourceDetail: 'Deal profile proposed loan amount' } : undefined, proposedFromBorrowing ? { value: proposedFromBorrowing, source: 'Borrowing Capacity', sourceDetail: 'Borrowing Capacity target loan' } : undefined),
      rate: pick(hasBorrowingSource && firstNumber(lending.contractInterestRatePct) ? { value: firstNumber(lending.contractInterestRatePct)!, source: 'Borrowing Capacity', sourceDetail: 'Borrowing Capacity lending assumptions' } : undefined, firstNumber(rawProperty.contract_rate_pct, rawProperty.interest_rate, rawProperty.interestRate) ? { value: firstNumber(rawProperty.contract_rate_pct, rawProperty.interest_rate, rawProperty.interestRate)!, source: 'Lender Policy', sourceDetail: 'Lender policy profile rate' } : undefined),
      term: pickFinite(hasBorrowingSource && firstFiniteNumber(lending.loanTermYears, lending.amortisationYears) != null ? { value: firstFiniteNumber(lending.loanTermYears, lending.amortisationYears)!, source: 'Borrowing Capacity', sourceDetail: 'Borrowing Capacity lending assumptions' } : undefined, firstFiniteNumber(rawProperty.loan_term_years, rawProperty.loanTermYears) != null ? { value: firstFiniteNumber(rawProperty.loan_term_years, rawProperty.loanTermYears)!, source: 'Property Profile', sourceDetail: 'Property profile loan assumptions' } : undefined),
      buffer: pickFinite(hasBorrowingSource && firstFiniteNumber(lending.assessmentBufferPct) != null ? { value: firstFiniteNumber(lending.assessmentBufferPct)!, source: 'Borrowing Capacity', sourceDetail: 'Borrowing Capacity lending assumptions' } : undefined, firstFiniteNumber(rawProperty.assessment_buffer_pct, rawProperty.assessmentBufferPct) != null ? { value: firstFiniteNumber(rawProperty.assessment_buffer_pct, rawProperty.assessmentBufferPct)!, source: 'Lender Policy', sourceDetail: lenderProfile } : undefined),
      floorRate: pickFinite(firstFiniteNumber(rawProperty.assessment_floor_rate_pct, rawProperty.assessmentFloorRatePct) != null ? { value: firstFiniteNumber(rawProperty.assessment_floor_rate_pct, rawProperty.assessmentFloorRatePct)!, source: 'Lender Policy', sourceDetail: lenderProfile } : undefined, hasBorrowingSource && firstFiniteNumber(lending.assessmentFloorRatePct) != null ? { value: firstFiniteNumber(lending.assessmentFloorRatePct)!, source: 'Borrowing Capacity', sourceDetail: 'Borrowing Capacity lending assumptions' } : undefined),
      targetIcr: pick(firstNumber(rawProperty.minimum_icr, rawProperty.minIcr) ? { value: firstNumber(rawProperty.minimum_icr, rawProperty.minIcr)!, source: 'Lender Policy', sourceDetail: lenderProfile } : undefined, hasBorrowingSource && firstNumber(lending.minIcr) ? { value: firstNumber(lending.minIcr)!, source: 'Borrowing Capacity', sourceDetail: 'Borrowing Capacity lending assumptions' } : undefined),
      targetDscr: pick(firstNumber(rawProperty.minimum_dscr, rawProperty.minDscr) ? { value: firstNumber(rawProperty.minimum_dscr, rawProperty.minDscr)!, source: 'Lender Policy', sourceDetail: lenderProfile } : undefined, hasBorrowingSource && firstNumber(lending.minDscr) ? { value: firstNumber(lending.minDscr)!, source: 'Borrowing Capacity', sourceDetail: 'Borrowing Capacity lending assumptions' } : undefined),
      minDebtYield: pick(debtYieldPct(rawProperty.minimum_debt_yield ?? rawProperty.minDebtYield) ? { value: debtYieldPct(rawProperty.minimum_debt_yield ?? rawProperty.minDebtYield)!, source: 'Lender Policy', sourceDetail: lenderProfile } : undefined, hasBorrowingSource && debtYieldPct(lending.minDebtYield) ? { value: debtYieldPct(lending.minDebtYield)!, source: 'Borrowing Capacity', sourceDetail: 'Borrowing Capacity lending assumptions' } : undefined),
    };
  };

  const applyCascade = (p: CalculatorPrefill) => {
    const candidates = resolveCascade(p);
    setFields(current => {
      const next = { ...current };
      (Object.keys(candidates) as IcrField[]).forEach(key => {
        const candidate = candidates[key];
        if (!candidate) return;
        const candidateValue = String(candidate.value);
        const existing = current[key];
        if (existing.source === 'User Override') {
          if (existing.value !== candidateValue) next[key] = { ...existing, pendingSource: { ...candidate, noticedAt: new Date().toISOString() } };
          return;
        }
        if (!existing.dirty || existing.source === 'Blank') next[key] = { value: candidateValue, source: candidate.source, sourceDetail: candidate.sourceDetail, dirty: false, originalValue: existing.originalValue, originalSource: existing.originalSource };
      });
      return next;
    });
    audit('ICR / DSCR editable data cascade applied', 'all', null, candidates, 'Global Input Sync');
  };

  useEffect(() => {
    if (prefill) applyCascade(prefill);
    else setFields(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value.source === 'User Override' ? value : field()])) as Record<IcrField, FieldState>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.propertyId, property, profile.noiOutputs, profile.borrowingOutputs, profile.dealProfile, profile.debtInputs, profile.lendingAssumptions]);

  const setManual = (key: IcrField, value: string) => setFields(prev => {
    const previous = prev[key];
    const nextSource: FieldSource = previous.source === 'Blank' || previous.source === 'Manual' ? 'Manual' : 'User Override';
    audit('manual ICR / DSCR field edit', key, { value: previous.value, source: previous.source }, { value, source: nextSource, originalValue: previous.originalValue ?? previous.value, originalSource: previous.originalSource ?? previous.source }, nextSource);
    return { ...prev, [key]: { ...previous, value, source: nextSource, dirty: true, originalValue: previous.originalValue ?? previous.value, originalSource: previous.originalSource ?? previous.source, pendingSource: undefined } };
  });

  const useSourceValue = (key: IcrField) => setFields(prev => {
    const pending = prev[key].pendingSource;
    if (!pending) return prev;
    audit('ICR / DSCR source value accepted over override', key, { value: prev[key].value, source: prev[key].source }, pending, pending.source);
    return { ...prev, [key]: { value: String(pending.value), source: pending.source, sourceDetail: pending.sourceDetail, dirty: false, originalValue: prev[key].originalValue, originalSource: prev[key].originalSource } };
  });

  const keepOverride = (key: IcrField) => setFields(prev => {
    const pending = prev[key].pendingSource;
    if (pending) audit('ICR / DSCR source value declined; override kept', key, pending, { value: prev[key].value, source: prev[key].source }, 'User Override');
    return { ...prev, [key]: { ...prev[key], pendingSource: undefined } };
  });

  const { noi, loan, proposedLoan, rate, term, buffer, floorRate, targetIcr, targetDscr, minDebtYield } = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.value])) as Record<IcrField, string>;
  const hasRequiredInputs = [noi, loan, rate, term, buffer, floorRate, targetIcr, targetDscr, minDebtYield].every(isPresentNumber);

  const saveBackToProperty = async () => {
    if (!prefill) return;
    setSaving(true);
    try {
      const data = { property_id: prefill.propertyId, loan_amount: num(loan) || null, loan_balance: num(loan) || null, interest_rate: num(rate) || null, loan_term_years: num(term) || null, repayment_type: 'pi' as const };
      const api = prefill.domain === 'industrial' ? industrialApi : commercialApi;
      const existing = await api.listFinancing(prefill.propertyId);
      if (existing.error) throw new Error(existing.error.message);
      const current = existing.data?.[0];
      const saved = current ? await api.updateFinancing(current.id, data as any) : await api.createFinancing(data as any);
      if (saved.error) throw new Error(saved.error.message);
      toast.success('ICR / DSCR loan assumptions saved back to property financing.');
    } catch (error) {
      toast.error(`Save back failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const result = useMemo(() => calculateCoverage({ noi: num(noi), loanAmount: num(loan), interestRatePct: num(rate), loanTermYears: num(term) }), [noi, loan, rate, term]);
  const maxLoan = useMemo(() => maxLoanByIcr(num(noi), num(rate), num(targetIcr)), [noi, rate, targetIcr]);
  const coverage = useMemo(() => hasRequiredInputs ? calculateIcrDscrEngine({ noi: num(noi), loanAmount: num(loan), proposedLoanAmount: proposedLoan === '' ? undefined : num(proposedLoan), contractInterestRatePct: num(rate), assessmentBufferPct: num(buffer), assessmentFloorRatePct: num(floorRate), repaymentType: 'principalAndInterest', amortisationYears: num(term), minimumIcr: num(targetIcr), minimumDscr: num(targetDscr), minimumDebtYield: num(minDebtYield) / 100 }) : null, [hasRequiredInputs, noi, loan, proposedLoan, rate, buffer, floorRate, term, targetIcr, targetDscr, minDebtYield]);

  const icrStatus = result.icr >= 1.5 ? 'pass' : result.icr >= 1.25 ? 'warn' : 'fail';
  const dscrStatus = result.dscr >= 1.35 ? 'pass' : result.dscr >= 1.2 ? 'warn' : 'fail';
  const badgeVariant = (s: string) => s === 'pass' ? 'default' : s === 'warn' ? 'secondary' : 'destructive';
  const lowestSupportableLoan = coverage ? Math.min(coverage.maxLoanByIcr, coverage.maxLoanByDscr, coverage.maxLoanByDebtYield) : 0;
  const bindingConstraint = coverage ? [{ label: 'ICR', value: coverage.maxLoanByIcr }, { label: 'DSCR', value: coverage.maxLoanByDscr }, { label: 'Debt Yield', value: coverage.maxLoanByDebtYield }].reduce((lowest, candidate) => candidate.value < lowest.value ? candidate : lowest).label : PENDING;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ICR / DSCR</CardTitle>
        <CardDescription>Commercial lender serviceability — deterministic ICR, DSCR and debt-yield testing.</CardDescription><div className="flex flex-wrap gap-2 pt-2"><Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge><Badge variant="secondary">Calculated — AI explains only</Badge><Badge variant={hasRequiredInputs ? 'secondary' : 'outline'}>{hasRequiredInputs ? 'Coverage Inputs Ready' : 'Awaiting Coverage Inputs'}</Badge><Button size="sm" variant="outline" onClick={saveBackToProperty} disabled={!prefill || saving} title={!prefill ? 'Select a property to save calculator values back.' : undefined}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save Back to Property</Button></div>
        {!hasRequiredInputs && <p className="text-xs text-muted-foreground pt-2">Import NOI, confirm loan amount and apply lender assumptions to test ICR, DSCR and debt yield.</p>}
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <InputBlock label="NOI (PA)" state={fields.noi} onChange={v => setManual('noi', v)} onKeepOverride={() => keepOverride('noi')} onUseSource={() => useSourceValue('noi')} placeholder="Pulled from NOI tab or enter manually" />
          <InputBlock label="Loan Amount" state={fields.loan} onChange={v => setManual('loan', v)} onKeepOverride={() => keepOverride('loan')} onUseSource={() => useSourceValue('loan')} placeholder="Pulled from borrowing profile or enter manually" />
          <InputBlock label="Proposed Loan Amount (optional)" state={fields.proposedLoan} onChange={v => setManual('proposedLoan', v)} onKeepOverride={() => keepOverride('proposedLoan')} onUseSource={() => useSourceValue('proposedLoan')} placeholder="Optional target loan amount" />
          <div className="grid grid-cols-2 gap-3">
            <InputBlock label="Contract Rate %" state={fields.rate} onChange={v => setManual('rate', v)} onKeepOverride={() => keepOverride('rate')} onUseSource={() => useSourceValue('rate')} placeholder="Enter contract rate" step="0.05" />
            <InputBlock label="Term (yrs, 0=IO)" state={fields.term} onChange={v => setManual('term', v)} onKeepOverride={() => keepOverride('term')} onUseSource={() => useSourceValue('term')} placeholder="Enter loan term" />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3"><InputBlock label="Assessment Buffer %" state={fields.buffer} onChange={v => setManual('buffer', v)} onKeepOverride={() => keepOverride('buffer')} onUseSource={() => useSourceValue('buffer')} placeholder="Enter assessment buffer" step="0.05" /><InputBlock label="Floor Rate %" state={fields.floorRate} onChange={v => setManual('floorRate', v)} onKeepOverride={() => keepOverride('floorRate')} onUseSource={() => useSourceValue('floorRate')} placeholder="Enter floor rate" step="0.05" /><InputBlock label="Minimum ICR" state={fields.targetIcr} onChange={v => setManual('targetIcr', v)} onKeepOverride={() => keepOverride('targetIcr')} onUseSource={() => useSourceValue('targetIcr')} placeholder="Enter lender ICR threshold" step="0.05" /><InputBlock label="Minimum DSCR" state={fields.targetDscr} onChange={v => setManual('targetDscr', v)} onKeepOverride={() => keepOverride('targetDscr')} onUseSource={() => useSourceValue('targetDscr')} placeholder="Enter lender DSCR threshold" step="0.05" /><InputBlock label="Minimum Debt Yield %" state={fields.minDebtYield} onChange={v => setManual('minDebtYield', v)} onKeepOverride={() => keepOverride('minDebtYield')} onUseSource={() => useSourceValue('minDebtYield')} placeholder="Enter minimum debt yield" step="0.1" /></div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Status" value={hasRequiredInputs ? 'Coverage Inputs Ready' : 'Awaiting Coverage Inputs'} />
          <Row label="Assessment Rate Used" value={coverage ? `${coverage.assessmentRateUsedPct.toFixed(2)}%` : PENDING} /><Row label="Annual Interest" value={coverage ? fmt(coverage.annualInterest) : PENDING} />
          <Row label="Annual Debt Service" value={coverage ? fmt(coverage.annualDebtService) : PENDING} />
          <Separator />
          <div className="flex justify-between items-center"><span>ICR</span>{coverage ? <Badge variant={badgeVariant(icrStatus) as any}>{coverage.icr}x</Badge> : <span>{PENDING}</span>}</div>
          <div className="flex justify-between items-center"><span>DSCR</span>{coverage ? <Badge variant={badgeVariant(dscrStatus) as any}>{coverage.dscr}x</Badge> : <span>{PENDING}</span>}</div>
          <Separator />
          <Row label={`Max Loan @ ICR ${targetIcr || ''}x`.trim()} value={coverage ? fmt(coverage.maxLoanByIcr || maxLoan) : PENDING} highlight /><Row label="Max Loan @ DSCR" value={coverage ? fmt(coverage.maxLoanByDscr) : PENDING} /><Row label="Max Loan @ Debt Yield" value={coverage ? fmt(coverage.maxLoanByDebtYield) : PENDING} /><Row label="Debt Yield" value={coverage ? `${(coverage.debtYield * 100).toFixed(2)}%` : PENDING} /><Row label="ICR Headroom" value={coverage ? `${coverage.icrHeadroom.toFixed(2)}x` : PENDING} /><Row label="DSCR Headroom" value={coverage ? `${coverage.dscrHeadroom.toFixed(2)}x` : PENDING} /><Row label="Lowest Supportable Loan" value={coverage ? fmt(lowestSupportableLoan) : PENDING} /><Row label="Binding Constraint" value={bindingConstraint} />{coverage?.proposedLoanSupportability && <Row label="Proposed loan test" value={coverage.proposedLoanSupportability} />}
          <p className="text-xs text-muted-foreground pt-2">{hasRequiredInputs ? 'Lender benchmarks: ICR ≥ 1.50x typical. DSCR ≥ 1.25-1.35x for P&I.' : 'Import NOI, confirm loan amount and apply lender assumptions to test ICR, DSCR and debt yield.'}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InputBlock({ label, state, onChange, onKeepOverride, onUseSource, placeholder, step }: { label: string; state: FieldState; onChange: (value: string) => void; onKeepOverride: () => void; onUseSource: () => void; placeholder: string; step?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2"><Label>{label}</Label><Badge variant="outline" className="text-[10px]">{sourceBadge(state.source)}</Badge></div>
      <Input type="number" step={step} value={state.value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {state.sourceDetail && <p className="mt-1 text-[11px] text-muted-foreground">{state.sourceDetail}</p>}
      {state.pendingSource && <div className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200"><div>New source value available. This field currently uses a saved override.</div><div className="mt-1 flex gap-2"><Button size="sm" variant="outline" onClick={onKeepOverride}>Keep override</Button><Button size="sm" variant="outline" onClick={onUseSource}>Use source value</Button></div></div>}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`flex justify-between items-center ${highlight ? 'text-lg font-bold text-primary' : ''}`}><span>{label}</span><span>{value}</span></div>;
}
