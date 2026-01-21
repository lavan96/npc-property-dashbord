import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { ChevronDown, Target, DollarSign, Percent, Calendar, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

interface ProposedLoanSectionProps {
  proposedLoanAmount: number;
  interestRate: number;
  bufferRate: number;
  bufferEnabled: boolean;
  onBufferEnabledChange: (enabled: boolean) => void;
  loanTermYears: number;
  onProposedLoanChange?: (value: number) => void;
  onInterestRateChange?: (value: number) => void;
  onLoanTermChange?: (value: number) => void;
}

export function ProposedLoanSection({
  proposedLoanAmount,
  interestRate,
  bufferRate,
  bufferEnabled,
  onBufferEnabledChange,
  loanTermYears,
  onProposedLoanChange,
  onInterestRateChange,
  onLoanTermChange,
}: ProposedLoanSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const assessmentRate = interestRate + bufferRate;

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Proposed Loan
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="text-sm font-semibold text-primary">{formatCurrency(proposedLoanAmount)}</p>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-5">
            {/* Proposed Loan Amount */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Proposed Loan Amount
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={proposedLoanAmount || ''}
                  onChange={(e) => onProposedLoanChange?.(Number(e.target.value))}
                  className="pl-9"
                  placeholder="500000"
                />
              </div>
              <Slider
                value={[proposedLoanAmount]}
                onValueChange={([value]) => onProposedLoanChange?.(value)}
                min={0}
                max={2000000}
                step={10000}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$0</span>
                <span>$2M</span>
              </div>
            </div>

            {/* Interest Rate */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Interest Rate
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  value={interestRate || ''}
                  onChange={(e) => onInterestRateChange?.(Number(e.target.value))}
                  className="pr-8"
                  placeholder="6.50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
              <Slider
                value={[interestRate]}
                onValueChange={([value]) => onInterestRateChange?.(value)}
                min={4}
                max={10}
                step={0.05}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>4%</span>
                <span>10%</span>
              </div>
            </div>

            {/* Loan Term */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Loan Term
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  value={loanTermYears || ''}
                  onChange={(e) => onLoanTermChange?.(Number(e.target.value))}
                  className="pr-12"
                  placeholder="30"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">years</span>
              </div>
              <Slider
                value={[loanTermYears]}
                onValueChange={([value]) => onLoanTermChange?.(value)}
                min={5}
                max={30}
                step={1}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5 years</span>
                <span>30 years</span>
              </div>
            </div>

            {/* APRA Buffer Toggle */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="buffer-toggle" className="text-sm font-medium flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    APRA +3% Buffer
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Stress-test at loan rate + 3%
                  </p>
                </div>
                <Switch
                  id="buffer-toggle"
                  checked={bufferEnabled}
                  onCheckedChange={onBufferEnabledChange}
                />
              </div>
            </div>

            {/* Assessment Rate Display */}
            <div className={`p-4 rounded-lg border ${bufferEnabled ? 'bg-primary/10 border-primary/20' : 'bg-muted/50 border-muted'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Assessment Rate</p>
                  <p className="text-xs text-muted-foreground">
                    {bufferEnabled ? `Interest + ${bufferRate}% buffer` : 'Interest rate only (no buffer)'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${bufferEnabled ? 'text-primary' : 'text-muted-foreground'}`}>
                    {assessmentRate.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Buffer Explanation */}
            <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <p>
                <strong>APRA Serviceability Buffer:</strong> {bufferEnabled 
                  ? 'Lenders must assess borrowers at the loan rate + 3% buffer to ensure repayment capacity if rates rise.'
                  : 'Buffer disabled — calculating at the nominal interest rate only. This shows theoretical maximum capacity.'}
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
