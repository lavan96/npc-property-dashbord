import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, Info, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { calculateIcrDscrEngine } from '@/utils/commercial';
import { useCalculatorPrefill, type CalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { commercialApi } from '@/hooks/useCommercialProperties';
import { industrialApi } from '@/hooks/useIndustrialProperties';
import { useCommercialDealState } from '@/utils/commercial/commercialDealState';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const PENDING = 'Pending';

const parseNumeric = (value: string): number | null => {
  if (value.trim() === '') return null;
  const normalised = value.replace(/[$,%\s]/g, '').replace(/,/g, '');
  if (normalised === '' || normalised === '-' || normalised === '.') return null;
  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
};

const finiteValue = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value : null;

type FieldSource = 'Blank' | 'NOI Tab' | 'Borrowing Capacity' | 'Property Profile' | 'Lender Policy' | 'Scraped' | 'Manual' | 'User Override' | 'Verified';
type IcrField = 'noi' | 'loan' | 'proposedLoan' | 'rate' | 'term' | 'buffer' | 'floorRate' | 'targetIcr' | 'targetDscr' | 'minDebtYield';
interface SourceCandidate { value: number; source: FieldSource; sourceDetail: string }
interface PendingSource extends SourceCandidate { noticedAt: string }
interface FieldState { value: string; source: FieldSource; dirty: boolean; originalValue?: string; originalSource?: FieldSource; sourceDetail?: string; pendingSource?: PendingSource }

const field = (value = '', source: FieldSource = value ? 'Manual' : 'Blank', sourceDetail?: string): FieldState => ({ value, source, sourceDetail, dirty: false });
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
  const { profile, updateGlobal, appendAiAudit } = useCommercialDealState();
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

  const saveBackToProperty = async () => {
    if (!prefill) return;
    setSaving(true);
    try {
      const parsedLoan = parseNumeric(loan);
      const parsedRate = parseNumeric(rate);
      const parsedTerm = parseNumeric(term);
      const data = { property_id: prefill.propertyId, loan_amount: parsedLoan, loan_balance: parsedLoan, interest_rate: parsedRate, loan_term_years: parsedTerm, repayment_type: 'pi' as const };
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

  const parsedInputs = useMemo(() => ({
    noi: parseNumeric(noi),
    loan: parseNumeric(loan),
    proposedLoan: parseNumeric(proposedLoan),
    rate: parseNumeric(rate),
    term: parseNumeric(term),
    buffer: parseNumeric(buffer),
    floorRate: parseNumeric(floorRate),
    targetIcr: parseNumeric(targetIcr),
    targetDscr: parseNumeric(targetDscr),
    minDebtYieldPct: parseNumeric(minDebtYield),
  }), [noi, loan, proposedLoan, rate, term, buffer, floorRate, targetIcr, targetDscr, minDebtYield]);

  const assessmentRateInput = parsedInputs.rate != null && parsedInputs.buffer != null && parsedInputs.floorRate != null
    ? Math.max(parsedInputs.rate + parsedInputs.buffer, parsedInputs.floorRate)
    : null;
  const hasRequiredInputs = parsedInputs.noi != null && parsedInputs.noi > 0
    && parsedInputs.loan != null && parsedInputs.loan > 0
    && parsedInputs.rate != null
    && parsedInputs.term != null && parsedInputs.term >= 0
    && parsedInputs.buffer != null
    && parsedInputs.floorRate != null
    && parsedInputs.targetIcr != null && parsedInputs.targetIcr > 0
    && parsedInputs.targetDscr != null && parsedInputs.targetDscr > 0
    && parsedInputs.minDebtYieldPct != null && parsedInputs.minDebtYieldPct > 0
    && assessmentRateInput != null && assessmentRateInput > 0;

  const coverage = useMemo(() => hasRequiredInputs ? calculateIcrDscrEngine({
    noi: parsedInputs.noi!,
    loanAmount: parsedInputs.loan!,
    proposedLoanAmount: parsedInputs.proposedLoan == null ? undefined : parsedInputs.proposedLoan,
    contractInterestRatePct: parsedInputs.rate!,
    assessmentBufferPct: parsedInputs.buffer!,
    assessmentFloorRatePct: parsedInputs.floorRate!,
    repaymentType: 'principalAndInterest',
    amortisationYears: parsedInputs.term!,
    minimumIcr: parsedInputs.targetIcr!,
    minimumDscr: parsedInputs.targetDscr!,
    minimumDebtYield: parsedInputs.minDebtYieldPct! / 100,
  }) : null, [hasRequiredInputs, parsedInputs]);

  const icrStatus = coverage && parsedInputs.targetIcr != null ? coverage.icr >= parsedInputs.targetIcr ? 'pass' : 'fail' : 'pending';
  const dscrStatus = coverage && parsedInputs.targetDscr != null ? coverage.dscr >= parsedInputs.targetDscr ? 'pass' : 'fail' : 'pending';
  const supportableCaps = coverage ? [coverage.maxLoanByIcr, coverage.maxLoanByDscr, coverage.maxLoanByDebtYield].filter(value => Number.isFinite(value)) : [];
  const lowestSupportableLoan = supportableCaps.length ? Math.min(...supportableCaps) : null;
  const bindingConstraint = coverage ? [{ label: 'ICR', value: coverage.maxLoanByIcr }, { label: 'DSCR', value: coverage.maxLoanByDscr }, { label: 'Debt Yield', value: coverage.maxLoanByDebtYield }].filter(candidate => Number.isFinite(candidate.value)).reduce((lowest, candidate) => candidate.value < lowest.value ? candidate : lowest).label : PENDING;
  const debtYieldPass = coverage && parsedInputs.minDebtYieldPct != null ? coverage.debtYield >= parsedInputs.minDebtYieldPct / 100 : false;
  const coverageStatus = !coverage ? 'Awaiting Coverage Inputs' : icrStatus === 'pass' && dscrStatus === 'pass' && debtYieldPass ? 'Supportable' : 'Coverage Pressure';
  const recommendedAction = !coverage
    ? 'Inputs are incomplete. Import NOI and confirm lender policy assumptions.'
    : bindingConstraint === 'ICR'
      ? 'ICR is the binding constraint. Increase NOI, reduce loan amount or review interest rate assumptions.'
      : bindingConstraint === 'DSCR'
        ? 'DSCR is the binding constraint. Review amortisation term, rate assumptions or proposed loan amount.'
        : bindingConstraint === 'Debt Yield'
          ? 'Debt yield is the binding constraint. Reduce debt or increase verified NOI.'
          : 'Coverage is supportable under current assumptions.';
  const dataSourceLabel = prefill ? `Linked property: ${prefill.address || prefill.propertyId}` : 'Manual entry / no property linked';
  const assumptionStatus = coverage ? coverageStatus : 'Awaiting Coverage Inputs';
  const auditHistory = profile.aiEstimateAuditLog.filter(event => event.fieldKey?.startsWith('icrDscr.')).slice(-8);
  const stressRows = coverage ? [0.5, 1].map(rateShock => {
    const shocked = calculateIcrDscrEngine({
      noi: parsedInputs.noi!,
      loanAmount: parsedInputs.loan!,
      proposedLoanAmount: parsedInputs.proposedLoan == null ? undefined : parsedInputs.proposedLoan,
      contractInterestRatePct: parsedInputs.rate! + rateShock,
      assessmentBufferPct: parsedInputs.buffer!,
      assessmentFloorRatePct: parsedInputs.floorRate!,
      repaymentType: 'principalAndInterest',
      amortisationYears: parsedInputs.term!,
      minimumIcr: parsedInputs.targetIcr!,
      minimumDscr: parsedInputs.targetDscr!,
      minimumDebtYield: parsedInputs.minDebtYieldPct! / 100,
    });
    return { label: `+${rateShock.toFixed(2)}% rate shock`, icr: shocked.icr, dscr: shocked.dscr, annualDebtService: shocked.annualDebtService };
  }) : [];

  const getNoiByBasis = (basis: string) => {
    const outputs = (profile.noiOutputs ?? {}) as Record<string, any>;
    if (basis === 'actual') return firstNumber(outputs.actualNoi, outputs.actualNOI);
    if (basis === 'stabilised') return firstNumber(outputs.stabilisedNoi, outputs.stabilisedNOI);
    if (basis === 'lenderAdjusted') return firstNumber(outputs.lenderAdjustedNoi, outputs.lenderAdjustedNOI);
    return firstNumber(outputs.manualNoi, outputs.manualNOI);
  };

  const setNoiSourceBasis = (basis: string) => {
    const nextNoi = getNoiByBasis(basis);
    if (nextNoi == null) return;
    setFields(prev => ({ ...prev, noi: { ...prev.noi, value: String(nextNoi), source: basis === 'manual' ? 'Manual' : 'NOI Tab', sourceDetail: basis === 'manual' ? 'Manual NOI selected' : `NOI tab ${basis} NOI selected`, dirty: false } }));
  };

  useEffect(() => {
    if (!coverage || lowestSupportableLoan == null) return;
    updateGlobal('icrDscrOutputs', {
      ...coverage,
      lowestSupportableLoan,
      bindingConstraint,
      sourceStates: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.source])),
      inputValues: parsedInputs,
      savedAt: new Date().toISOString(),
    });
  }, [coverage, lowestSupportableLoan, bindingConstraint, fields, parsedInputs, updateGlobal]);

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>ICR / DSCR</CardTitle>
            <CardDescription>Focused lender coverage and debt-serviceability testing for ICR, DSCR and debt yield.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-muted/30 p-3 text-xs">
            <Badge variant="outline" className="border-primary/40 text-primary">{dataSourceLabel}</Badge>
            <Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge>
            <Badge variant={coverage ? coverageStatus === 'Supportable' ? 'default' : 'destructive' : 'outline'}>{assumptionStatus}</Badge>
            <Button size="sm" variant="outline" onClick={saveBackToProperty} disabled={!prefill || saving} title={!prefill ? 'Select a property to save calculator values back.' : undefined}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save Back to Property</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="mb-4">
              <h3 className="text-base font-semibold">Coverage Test Inputs</h3>
              <p className="text-sm text-muted-foreground">Review NOI, debt amount and lender policy assumptions used to test ICR, DSCR and debt yield.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <InputBlock label="NOI p.a." state={fields.noi} onChange={v => setManual('noi', v)} onKeepOverride={() => keepOverride('noi')} onUseSource={() => useSourceValue('noi')} placeholder="Pulled from NOI tab or enter manually" />
                <div>
                  <Label>NOI source selector</Label>
                  <Select onValueChange={setNoiSourceBasis} defaultValue="selected">
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Use selected NOI basis" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="selected">NOI tab selected basis</SelectItem>
                      <SelectItem value="actual">Actual NOI</SelectItem>
                      <SelectItem value="stabilised">Stabilised NOI</SelectItem>
                      <SelectItem value="lenderAdjusted">Lender-adjusted NOI</SelectItem>
                      <SelectItem value="manual">Manual NOI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <InputBlock label="Loan Amount" state={fields.loan} onChange={v => setManual('loan', v)} onKeepOverride={() => keepOverride('loan')} onUseSource={() => useSourceValue('loan')} placeholder="Pulled from borrowing profile or enter manually" />
                <InputBlock label="Proposed Loan Amount (optional)" state={fields.proposedLoan} onChange={v => setManual('proposedLoan', v)} onKeepOverride={() => keepOverride('proposedLoan')} onUseSource={() => useSourceValue('proposedLoan')} placeholder="Optional target loan amount" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <InputBlock label="Contract Rate %" state={fields.rate} onChange={v => setManual('rate', v)} onKeepOverride={() => keepOverride('rate')} onUseSource={() => useSourceValue('rate')} placeholder="Enter contract rate" step="0.05" />
                <InputBlock label="Term" state={fields.term} onChange={v => setManual('term', v)} onKeepOverride={() => keepOverride('term')} onUseSource={() => useSourceValue('term')} placeholder="Enter loan term" />
                <InputBlock label="Assessment Buffer %" state={fields.buffer} onChange={v => setManual('buffer', v)} onKeepOverride={() => keepOverride('buffer')} onUseSource={() => useSourceValue('buffer')} placeholder="Enter assessment buffer" step="0.05" />
                <InputBlock label="Floor Rate %" state={fields.floorRate} onChange={v => setManual('floorRate', v)} onKeepOverride={() => keepOverride('floorRate')} onUseSource={() => useSourceValue('floorRate')} placeholder="Enter floor rate" step="0.05" />
                <InputBlock label="Minimum ICR" state={fields.targetIcr} onChange={v => setManual('targetIcr', v)} onKeepOverride={() => keepOverride('targetIcr')} onUseSource={() => useSourceValue('targetIcr')} placeholder="Enter lender ICR threshold" step="0.05" />
                <InputBlock label="Minimum DSCR" state={fields.targetDscr} onChange={v => setManual('targetDscr', v)} onKeepOverride={() => keepOverride('targetDscr')} onUseSource={() => useSourceValue('targetDscr')} placeholder="Enter lender DSCR threshold" step="0.05" />
                <InputBlock label="Minimum Debt Yield %" state={fields.minDebtYield} onChange={v => setManual('minDebtYield', v)} onKeepOverride={() => keepOverride('minDebtYield')} onUseSource={() => useSourceValue('minDebtYield')} placeholder="Enter minimum debt yield" step="0.1" />
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-base font-semibold">Coverage Output Summary</h3><Badge variant={coverage ? coverageStatus === 'Supportable' ? 'default' : 'destructive' : 'outline'}>{coverageStatus}</Badge></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="ICR" value={coverage && finiteValue(coverage.icr) != null ? `${coverage.icr}x` : PENDING} prominent />
                <MetricCard label="DSCR" value={coverage && finiteValue(coverage.dscr) != null ? `${coverage.dscr}x` : PENDING} prominent />
                <MetricCard label="Debt Yield" value={coverage && finiteValue(coverage.debtYield) != null ? `${(coverage.debtYield * 100).toFixed(2)}%` : PENDING} prominent />
              </div>
              <div className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Assessment Rate Used" value={coverage && finiteValue(coverage.assessmentRateUsedPct) != null ? `${coverage.assessmentRateUsedPct.toFixed(2)}%` : PENDING} />
                <Row label="Annual Interest" value={coverage && finiteValue(coverage.annualInterest) != null ? fmt(coverage.annualInterest) : PENDING} />
                <Row label="Annual Debt Service" value={coverage && finiteValue(coverage.annualDebtService) != null ? fmt(coverage.annualDebtService) : PENDING} />
                <Row label="ICR Headroom" value={coverage && finiteValue(coverage.icrHeadroom) != null ? `${coverage.icrHeadroom.toFixed(2)}x` : PENDING} />
                <Row label="DSCR Headroom" value={coverage && finiteValue(coverage.dscrHeadroom) != null ? `${coverage.dscrHeadroom.toFixed(2)}x` : PENDING} />
                <Row label="Coverage Status" value={coverageStatus} />
              </div>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <h3 className="text-base font-semibold">Maximum Loan Summary</h3>
              <div className="mt-3 space-y-2 text-sm">
                <Row label="Max Loan @ ICR" value={coverage && finiteValue(coverage.maxLoanByIcr) != null ? fmt(coverage.maxLoanByIcr) : PENDING} />
                <Row label="Max Loan @ DSCR" value={coverage && finiteValue(coverage.maxLoanByDscr) != null ? fmt(coverage.maxLoanByDscr) : PENDING} />
                <Row label="Max Loan @ Debt Yield" value={coverage && finiteValue(coverage.maxLoanByDebtYield) != null ? fmt(coverage.maxLoanByDebtYield) : PENDING} />
                <Separator />
                <Row label="Lowest Supportable Loan" value={lowestSupportableLoan != null ? fmt(lowestSupportableLoan) : PENDING} highlight />
                <div className="rounded-md border border-primary/30 bg-background/60 p-3"><div className="text-xs text-muted-foreground">Binding Constraint</div><div className="text-xl font-bold text-primary">{bindingConstraint}</div></div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border/60 bg-background/50 p-4">
            <h3 className="text-base font-semibold">Recommended Next Action</h3>
            <p className="mt-1 text-sm text-muted-foreground">{recommendedAction}</p>
          </section>

          <Collapsible>
            <div className="rounded-lg border border-border/60 bg-muted/20">
              <CollapsibleTrigger asChild><Button variant="ghost" className="flex w-full justify-between p-4 text-left"><span>View formula and policy breakdown</span><ChevronDown className="h-4 w-4" /></Button></CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 border-t border-border/60 p-4 text-sm">
                <div><h4 className="font-semibold">Formula breakdown</h4><p className="text-muted-foreground">Assessment Rate = max(Contract Rate + Buffer, Floor Rate). Annual Interest = Loan Amount × Assessment Rate. ICR = NOI / Annual Interest. DSCR = NOI / Annual Debt Service. Debt Yield = NOI / Loan Amount.</p></div>
                <div><h4 className="font-semibold">Lender benchmark notes</h4><p className="text-muted-foreground">Typical commercial lender guideposts are ICR ≥ 1.50x, DSCR ≥ 1.25x–1.35x and debt yield per lender policy.</p></div>
                <div><h4 className="font-semibold">Full assumption list</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(fields).map(([key, state]) => <Row key={key} label={key} value={`${state.value || PENDING} · ${sourceBadge(state.source)}`} />)}</div></div>
                <div><h4 className="font-semibold">Full warning log</h4>{coverage?.warnings?.length ? <ul className="list-disc pl-5 text-muted-foreground">{coverage.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul> : <p className="text-muted-foreground">No formula warnings while inputs are valid.</p>}</div>
                <div><h4 className="font-semibold">Audit history</h4>{auditHistory.length ? <ul className="space-y-1 text-muted-foreground">{auditHistory.map((event, index) => <li key={`${event.timestamp}-${index}`}>{event.timestamp}: {event.action} ({event.fieldKey})</li>)}</ul> : <p className="text-muted-foreground">No ICR / DSCR audit entries this session.</p>}</div>
                <div><h4 className="font-semibold">Coverage stress tests</h4>{stressRows.length ? <div className="mt-2 space-y-2">{stressRows.map(row => <Row key={row.label} label={row.label} value={`ICR ${row.icr}x · DSCR ${row.dscr}x · ADS ${fmt(row.annualDebtService)}`} />)}</div> : <p className="text-muted-foreground">Stress tests appear once coverage inputs are complete.</p>}</div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function InputBlock({ label, state, onChange, onKeepOverride, onUseSource, placeholder, step }: { label: string; state: FieldState; onChange: (value: string) => void; onKeepOverride: () => void; onUseSource: () => void; placeholder: string; step?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2"><Label>{label}</Label><Tooltip><TooltipTrigger asChild><Badge variant="outline" className="cursor-help gap-1 text-[10px]"><Info className="h-3 w-3" />{sourceBadge(state.source)}</Badge></TooltipTrigger><TooltipContent><p>{state.sourceDetail || `Source: ${state.source}`}</p></TooltipContent></Tooltip></div>
      <Input type="text" inputMode="decimal" step={step} value={state.value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {state.sourceDetail && <p className="mt-1 text-[11px] text-muted-foreground">{state.sourceDetail}</p>}
      {state.pendingSource && <div className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200"><div>New source value available. This field currently uses a saved override.</div><div className="mt-1 flex gap-2"><Button size="sm" variant="outline" onClick={onKeepOverride}>Keep override</Button><Button size="sm" variant="outline" onClick={onUseSource}>Use source value</Button></div></div>}
    </div>
  );
}

function MetricCard({ label, value, prominent }: { label: string; value: string; prominent?: boolean }) {
  return <div className={`rounded-lg border border-primary/20 bg-background/60 p-3 ${prominent ? 'shadow-sm' : ''}`}><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold text-primary">{value}</div></div>;
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`flex justify-between items-center ${highlight ? 'text-lg font-bold text-primary' : ''}`}><span>{label}</span><span>{value}</span></div>;
}
