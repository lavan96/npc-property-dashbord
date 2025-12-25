import { useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calculator, 
  Info, 
  TrendingUp, 
  Wallet, 
  Building2,
  AlertTriangle
} from 'lucide-react';
import { formatNumberWithCommas, removeCommas } from '@/hooks/useFormattedNumber';

interface AdvancedTabProps {
  buildType: 'new_build' | 'existing_property';
  cpiGrowthRate: string;
  setCpiGrowthRate: (value: string) => void;
  depreciation: string;
  setDepreciation: (value: string) => void;
  taxRate: string;
  setTaxRate: (value: string) => void;
  marketValueNow: string;
  setMarketValueNow: (value: string) => void;
  loanAmount: string;
  setLoanAmount: (value: string) => void;
  interestOnlyPeriodYears: string;
  setInterestOnlyPeriodYears: (value: string) => void;
  repaymentFrequency: 'weekly' | 'fortnightly' | 'monthly';
  setRepaymentFrequency: (value: 'weekly' | 'fortnightly' | 'monthly') => void;
  extraRepaymentPerMonth: string;
  setExtraRepaymentPerMonth: (value: string) => void;
  offsetBalance: string;
  setOffsetBalance: (value: string) => void;
  constructionDurationMonths: string;
  setConstructionDurationMonths: (value: string) => void;
  constructionYear: string;
  setConstructionYear: (value: string) => void;
  stageDepositPercent: string;
  setStageDepositPercent: (value: string) => void;
  stageSlabPercent: string;
  setStageSlabPercent: (value: string) => void;
  stageFramePercent: string;
  setStageFramePercent: (value: string) => void;
  stageLockupPercent: string;
  setStageLockupPercent: (value: string) => void;
  stageFixingPercent: string;
  setStageFixingPercent: (value: string) => void;
  stageCompletionPercent: string;
  setStageCompletionPercent: (value: string) => void;
  disabled?: boolean;
}

export function AdvancedTab({
  buildType,
  cpiGrowthRate,
  setCpiGrowthRate,
  depreciation,
  setDepreciation,
  taxRate,
  setTaxRate,
  marketValueNow,
  setMarketValueNow,
  loanAmount,
  setLoanAmount,
  interestOnlyPeriodYears,
  setInterestOnlyPeriodYears,
  repaymentFrequency,
  setRepaymentFrequency,
  extraRepaymentPerMonth,
  setExtraRepaymentPerMonth,
  offsetBalance,
  setOffsetBalance,
  constructionDurationMonths,
  setConstructionDurationMonths,
  constructionYear,
  setConstructionYear,
  stageDepositPercent,
  setStageDepositPercent,
  stageSlabPercent,
  setStageSlabPercent,
  stageFramePercent,
  setStageFramePercent,
  stageLockupPercent,
  setStageLockupPercent,
  stageFixingPercent,
  setStageFixingPercent,
  stageCompletionPercent,
  setStageCompletionPercent,
  disabled = false
}: AdvancedTabProps) {
  const isNewBuild = buildType === 'new_build';

  const handleCurrencyChange = useCallback((setter: (value: string) => void) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = removeCommas(e.target.value);
      if (rawValue === '' || rawValue === '-' || /^-?\d*\.?\d*$/.test(rawValue)) {
        setter(rawValue);
      }
    };
  }, []);

  const formatForDisplay = useCallback((value: string) => {
    return formatNumberWithCommas(value);
  }, []);

  // Calculate construction stage total
  const stageTotal = 
    (parseFloat(stageDepositPercent) || 0) +
    (parseFloat(stageSlabPercent) || 0) +
    (parseFloat(stageFramePercent) || 0) +
    (parseFloat(stageLockupPercent) || 0) +
    (parseFloat(stageFixingPercent) || 0) +
    (parseFloat(stageCompletionPercent) || 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Warning Banner */}
      <Alert variant="default" className="border-amber-500/50 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-700">
          These are optional advanced overrides. Leave empty to use default calculations.
        </AlertDescription>
      </Alert>

      {/* Cash Flow Projections */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            Cash Flow Projections
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpiGrowthRate" className="text-sm font-medium flex items-center gap-1">
                CPI Growth
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Annual rate for rent/expense increases. Default: 3%</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="relative">
                <Input
                  id="cpiGrowthRate"
                  type="number"
                  step="0.1"
                  value={cpiGrowthRate}
                  onChange={(e) => setCpiGrowthRate(e.target.value)}
                  placeholder="3"
                  disabled={disabled}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="depreciation" className="text-sm font-medium flex items-center gap-1">
                Depreciation
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Year 1 depreciation deduction for tax</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="depreciation"
                  type="text"
                  inputMode="numeric"
                  value={formatForDisplay(depreciation)}
                  onChange={handleCurrencyChange(setDepreciation)}
                  placeholder="6,000"
                  disabled={disabled}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxRate" className="text-sm font-medium flex items-center gap-1">
                Tax Rate
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Marginal tax rate for refund calculations. Default: 30%</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="relative">
                <Input
                  id="taxRate"
                  type="number"
                  step="0.5"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder="30"
                  disabled={disabled}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="marketValueNow" className="text-sm font-medium flex items-center gap-1">
                Market Value (Y0)
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Current value if different from purchase price</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="marketValueNow"
                  type="text"
                  inputMode="numeric"
                  value={formatForDisplay(marketValueNow)}
                  onChange={handleCurrencyChange(setMarketValueNow)}
                  placeholder="= Purchase Price"
                  disabled={disabled}
                  className="pl-7"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loan Adjustments */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Wallet className="h-5 w-5 text-primary" />
            Loan Adjustments
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="loanAmount" className="text-sm font-medium flex items-center gap-1">
                Loan Amount Override
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Override calculated loan (Price × LVR)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="loanAmount"
                  type="text"
                  inputMode="numeric"
                  value={formatForDisplay(loanAmount)}
                  onChange={handleCurrencyChange(setLoanAmount)}
                  placeholder="Auto-calculated"
                  disabled={disabled}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interestOnlyPeriodYears" className="text-sm font-medium">IO Period</Label>
              <div className="relative">
                <Input
                  id="interestOnlyPeriodYears"
                  type="number"
                  value={interestOnlyPeriodYears}
                  onChange={(e) => setInterestOnlyPeriodYears(e.target.value)}
                  placeholder="5"
                  disabled={disabled}
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">yrs</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="repaymentFrequency" className="text-sm font-medium">Repayment Frequency</Label>
              <Select 
                value={repaymentFrequency} 
                onValueChange={(v) => setRepaymentFrequency(v as 'weekly' | 'fortnightly' | 'monthly')} 
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Monthly" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="extraRepaymentPerMonth" className="text-sm font-medium">Extra Repayment /mo</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="extraRepaymentPerMonth"
                  type="text"
                  inputMode="numeric"
                  value={formatForDisplay(extraRepaymentPerMonth)}
                  onChange={handleCurrencyChange(setExtraRepaymentPerMonth)}
                  placeholder="0"
                  disabled={disabled}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="offsetBalance" className="text-sm font-medium">Offset Balance</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="offsetBalance"
                  type="text"
                  inputMode="numeric"
                  value={formatForDisplay(offsetBalance)}
                  onChange={handleCurrencyChange(setOffsetBalance)}
                  placeholder="0"
                  disabled={disabled}
                  className="pl-7"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Construction Schedule - Only for New Build */}
      {isNewBuild && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Construction Schedule
              </h3>
              <Badge variant={stageTotal === 100 ? 'default' : 'destructive'} className={stageTotal === 100 ? 'bg-green-500' : ''}>
                Total: {stageTotal}%
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <Label htmlFor="constructionDurationMonths" className="text-sm font-medium">Duration</Label>
                <div className="relative">
                  <Input
                    id="constructionDurationMonths"
                    type="number"
                    value={constructionDurationMonths}
                    onChange={(e) => setConstructionDurationMonths(e.target.value)}
                    placeholder="12"
                    disabled={disabled}
                    className="pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">months</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="constructionYear" className="text-sm font-medium">Year</Label>
                <Input
                  id="constructionYear"
                  type="number"
                  value={constructionYear}
                  onChange={(e) => setConstructionYear(e.target.value)}
                  placeholder={new Date().getFullYear().toString()}
                  disabled={disabled}
                />
              </div>
            </div>

            {/* Progress Bar Visualization */}
            <div className="mb-4 p-4 bg-muted/30 rounded-lg">
              <p className="text-sm font-medium mb-3">Stage Payment Breakdown</p>
              <div className="flex h-8 rounded-lg overflow-hidden">
                {parseFloat(stageDepositPercent) > 0 && (
                  <div 
                    className="bg-blue-500 flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${stageDepositPercent}%` }}
                  >
                    {stageDepositPercent}%
                  </div>
                )}
                {parseFloat(stageSlabPercent) > 0 && (
                  <div 
                    className="bg-cyan-500 flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${stageSlabPercent}%` }}
                  >
                    {stageSlabPercent}%
                  </div>
                )}
                {parseFloat(stageFramePercent) > 0 && (
                  <div 
                    className="bg-teal-500 flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${stageFramePercent}%` }}
                  >
                    {stageFramePercent}%
                  </div>
                )}
                {parseFloat(stageLockupPercent) > 0 && (
                  <div 
                    className="bg-green-500 flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${stageLockupPercent}%` }}
                  >
                    {stageLockupPercent}%
                  </div>
                )}
                {parseFloat(stageFixingPercent) > 0 && (
                  <div 
                    className="bg-lime-500 flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${stageFixingPercent}%` }}
                  >
                    {stageFixingPercent}%
                  </div>
                )}
                {parseFloat(stageCompletionPercent) > 0 && (
                  <div 
                    className="bg-emerald-500 flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${stageCompletionPercent}%` }}
                  >
                    {stageCompletionPercent}%
                  </div>
                )}
              </div>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>Deposit</span>
                <span>Slab</span>
                <span>Frame</span>
                <span>Lockup</span>
                <span>Fixing</span>
                <span>Complete</span>
              </div>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              <div className="space-y-1">
                <Label htmlFor="stageDepositPercent" className="text-xs">Deposit</Label>
                <div className="relative">
                  <Input
                    id="stageDepositPercent"
                    type="number"
                    value={stageDepositPercent}
                    onChange={(e) => setStageDepositPercent(e.target.value)}
                    placeholder="5"
                    disabled={disabled}
                    className="pr-6 h-8 text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="stageSlabPercent" className="text-xs">Slab</Label>
                <div className="relative">
                  <Input
                    id="stageSlabPercent"
                    type="number"
                    value={stageSlabPercent}
                    onChange={(e) => setStageSlabPercent(e.target.value)}
                    placeholder="15"
                    disabled={disabled}
                    className="pr-6 h-8 text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="stageFramePercent" className="text-xs">Frame</Label>
                <div className="relative">
                  <Input
                    id="stageFramePercent"
                    type="number"
                    value={stageFramePercent}
                    onChange={(e) => setStageFramePercent(e.target.value)}
                    placeholder="20"
                    disabled={disabled}
                    className="pr-6 h-8 text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="stageLockupPercent" className="text-xs">Lockup</Label>
                <div className="relative">
                  <Input
                    id="stageLockupPercent"
                    type="number"
                    value={stageLockupPercent}
                    onChange={(e) => setStageLockupPercent(e.target.value)}
                    placeholder="25"
                    disabled={disabled}
                    className="pr-6 h-8 text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="stageFixingPercent" className="text-xs">Fixing</Label>
                <div className="relative">
                  <Input
                    id="stageFixingPercent"
                    type="number"
                    value={stageFixingPercent}
                    onChange={(e) => setStageFixingPercent(e.target.value)}
                    placeholder="20"
                    disabled={disabled}
                    className="pr-6 h-8 text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="stageCompletionPercent" className="text-xs">Complete</Label>
                <div className="relative">
                  <Input
                    id="stageCompletionPercent"
                    type="number"
                    value={stageCompletionPercent}
                    onChange={(e) => setStageCompletionPercent(e.target.value)}
                    placeholder="15"
                    disabled={disabled}
                    className="pr-6 h-8 text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                </div>
              </div>
            </div>

            {stageTotal !== 100 && stageTotal > 0 && (
              <p className="text-sm text-destructive mt-2">
                Stage percentages should total 100% (currently {stageTotal}%)
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
