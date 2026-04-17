import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calculator, DollarSign, Info } from 'lucide-react';

export type RepaymentType = 'principal_and_interest' | 'interest_only';

const DEFAULT_LOAN_TERM_YEARS = 30;

/**
 * Compute the monthly repayment from loan balance + rate + repayment type.
 * IO formula preserved from legacy: loan × rate ÷ 12.
 * P&I uses standard amortization over the remaining loan term.
 */
export function computeMonthlyRepayment(
  loanBalance: number,
  annualRatePct: number,
  repaymentType: RepaymentType,
  loanTermYears: number = DEFAULT_LOAN_TERM_YEARS,
): number {
  if (!loanBalance || loanBalance <= 0 || !annualRatePct || annualRatePct <= 0) return 0;
  const monthlyRate = annualRatePct / 100 / 12;
  if (repaymentType === 'interest_only') {
    return Math.round(loanBalance * monthlyRate * 100) / 100;
  }
  const n = loanTermYears * 12;
  const m = loanBalance * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  return Math.round(m * 100) / 100;
}

interface Props {
  monthlyAmount: number;
  repaymentType: RepaymentType;
  interestOnlyYears: number;
  autoCalculate: boolean;
  loanBalance: number;
  interestRate: number;
  loanTermYears?: number;
  onChange: (next: {
    monthlyAmount: number;
    repaymentType: RepaymentType;
    interestOnlyYears: number;
    autoCalculate: boolean;
  }) => void;
  /** Compact = portal styling (smaller inputs). Default = dashboard. */
  compact?: boolean;
}

export function MonthlyRepaymentField({
  monthlyAmount,
  repaymentType,
  interestOnlyYears,
  autoCalculate,
  loanBalance,
  interestRate,
  loanTermYears = DEFAULT_LOAN_TERM_YEARS,
  onChange,
  compact = false,
}: Props) {
  const inputClass = compact ? 'pl-7 h-9 text-sm' : 'pl-9';
  const iconClass = compact
    ? 'absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground'
    : 'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground';

  const set = (patch: Partial<Parameters<typeof onChange>[0]>) =>
    onChange({ monthlyAmount, repaymentType, interestOnlyYears, autoCalculate, ...patch });

  const handleTypeChange = (value: string) => {
    const newType = value as RepaymentType;
    if (autoCalculate) {
      set({
        repaymentType: newType,
        monthlyAmount: computeMonthlyRepayment(loanBalance, interestRate, newType, loanTermYears),
      });
    } else {
      set({ repaymentType: newType });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className={compact ? 'text-xs flex items-center gap-1.5' : 'flex items-center gap-2'}>
          Monthly Loan Repayment
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger type="button">
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">
                  <strong>Interest Only:</strong> Loan × Rate ÷ 12.<br />
                  <strong>P&amp;I:</strong> Standard amortization over {loanTermYears}-year term.<br />
                  Switch to Manual to override.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => set({ autoCalculate: !autoCalculate })}
        >
          <Calculator className="h-3 w-3 mr-1" />
          {autoCalculate ? 'Manual' : 'Auto'}
        </Button>
      </div>

      {/* Repayment Type Toggle */}
      <RadioGroup
        value={repaymentType}
        onValueChange={handleTypeChange}
        className="grid grid-cols-2 gap-2"
      >
        <label
          htmlFor="rt-pi"
          className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-xs transition-colors ${
            repaymentType === 'principal_and_interest'
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-border bg-background text-muted-foreground hover:border-primary/50'
          }`}
        >
          <RadioGroupItem value="principal_and_interest" id="rt-pi" />
          <span className="font-medium">P &amp; I</span>
        </label>
        <label
          htmlFor="rt-io"
          className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-xs transition-colors ${
            repaymentType === 'interest_only'
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-border bg-background text-muted-foreground hover:border-primary/50'
          }`}
        >
          <RadioGroupItem value="interest_only" id="rt-io" />
          <span className="font-medium">Interest Only</span>
        </label>
      </RadioGroup>

      {/* Amount input */}
      <div className="relative">
        <DollarSign className={iconClass} />
        <Input
          type="number"
          value={monthlyAmount || ''}
          onChange={(e) => set({ monthlyAmount: parseFloat(e.target.value) || 0, autoCalculate: false })}
          className={inputClass}
          placeholder="0"
          disabled={autoCalculate}
        />
      </div>

      {/* IO period — only when Interest Only */}
      {repaymentType === 'interest_only' && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">IO period (years)</Label>
          <Input
            type="number"
            min={0}
            max={10}
            value={interestOnlyYears || ''}
            onChange={(e) => set({ interestOnlyYears: parseInt(e.target.value, 10) || 0 })}
            className="h-8 w-20 text-sm"
            placeholder="5"
          />
        </div>
      )}

      {autoCalculate && loanBalance > 0 && interestRate > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Auto:{' '}
          {repaymentType === 'interest_only'
            ? `${loanBalance.toLocaleString()} × ${interestRate}% ÷ 12`
            : `${loanBalance.toLocaleString()} amortized @ ${interestRate}% over ${loanTermYears}y`}
        </p>
      )}
    </div>
  );
}
