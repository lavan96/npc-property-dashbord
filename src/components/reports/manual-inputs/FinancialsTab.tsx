import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calculator, Info, Percent, DollarSign, TrendingUp, ChevronDown, ChevronUp, Home, RefreshCw } from 'lucide-react';
import { formatNumberWithCommas, removeCommas } from '@/hooks/useFormattedNumber';
import { STATE_MAPPING } from '@/lib/states';

// Stamp duty calculation rates by state (as of 2024)
const STAMP_DUTY_RATES: Record<string, { brackets: { min: number; max: number; rate: number; base: number }[]; firstHomeBuyerThreshold?: number; firstHomeBuyerConcession?: number }> = {
  NSW: {
    brackets: [
      { min: 0, max: 16000, rate: 0.0125, base: 0 },
      { min: 16000, max: 35000, rate: 0.015, base: 200 },
      { min: 35000, max: 93000, rate: 0.0175, base: 485 },
      { min: 93000, max: 351000, rate: 0.035, base: 1500 },
      { min: 351000, max: 1168000, rate: 0.045, base: 10530 },
      { min: 1168000, max: Infinity, rate: 0.055, base: 47295 },
    ],
    firstHomeBuyerThreshold: 800000,
    firstHomeBuyerConcession: 1,
  },
  VIC: {
    brackets: [
      { min: 0, max: 25000, rate: 0.014, base: 0 },
      { min: 25000, max: 130000, rate: 0.024, base: 350 },
      { min: 130000, max: 960000, rate: 0.05, base: 2870 },
      { min: 960000, max: 2000000, rate: 0.055, base: 44370 },
      { min: 2000000, max: Infinity, rate: 0.065, base: 101570 },
    ],
    firstHomeBuyerThreshold: 600000,
    firstHomeBuyerConcession: 1,
  },
  QLD: {
    brackets: [
      { min: 0, max: 5000, rate: 0, base: 0 },
      { min: 5000, max: 75000, rate: 0.015, base: 0 },
      { min: 75000, max: 540000, rate: 0.035, base: 1050 },
      { min: 540000, max: 1000000, rate: 0.045, base: 17325 },
      { min: 1000000, max: Infinity, rate: 0.0575, base: 38025 },
    ],
    firstHomeBuyerThreshold: 700000,
    firstHomeBuyerConcession: 1,
  },
  SA: {
    brackets: [
      { min: 0, max: 12000, rate: 0.01, base: 0 },
      { min: 12000, max: 30000, rate: 0.02, base: 120 },
      { min: 30000, max: 50000, rate: 0.03, base: 480 },
      { min: 50000, max: 100000, rate: 0.035, base: 1080 },
      { min: 100000, max: 200000, rate: 0.04, base: 2830 },
      { min: 200000, max: 250000, rate: 0.0425, base: 6830 },
      { min: 250000, max: 300000, rate: 0.0475, base: 8955 },
      { min: 300000, max: 500000, rate: 0.05, base: 11330 },
      { min: 500000, max: Infinity, rate: 0.055, base: 21330 },
    ],
    firstHomeBuyerThreshold: 650000,
    firstHomeBuyerConcession: 1,
  },
  WA: {
    brackets: [
      { min: 0, max: 120000, rate: 0.019, base: 0 },
      { min: 120000, max: 150000, rate: 0.0285, base: 2280 },
      { min: 150000, max: 360000, rate: 0.038, base: 3135 },
      { min: 360000, max: 725000, rate: 0.0475, base: 11115 },
      { min: 725000, max: Infinity, rate: 0.0515, base: 28453 },
    ],
    firstHomeBuyerThreshold: 530000,
    firstHomeBuyerConcession: 1,
  },
  TAS: {
    brackets: [
      { min: 0, max: 3000, rate: 0.017, base: 50 },
      { min: 3000, max: 25000, rate: 0.0225, base: 50 },
      { min: 25000, max: 75000, rate: 0.03, base: 545 },
      { min: 75000, max: 200000, rate: 0.035, base: 2045 },
      { min: 200000, max: 375000, rate: 0.04, base: 6420 },
      { min: 375000, max: 725000, rate: 0.0425, base: 13420 },
      { min: 725000, max: Infinity, rate: 0.045, base: 28295 },
    ],
    firstHomeBuyerThreshold: 600000,
    firstHomeBuyerConcession: 0.5,
  },
  NT: {
    brackets: [
      { min: 0, max: 525000, rate: 0.04995, base: 0 },
      { min: 525000, max: 3000000, rate: 0.0495, base: 0 },
      { min: 3000000, max: 5000000, rate: 0.0575, base: 0 },
      { min: 5000000, max: Infinity, rate: 0.0595, base: 0 },
    ],
    firstHomeBuyerThreshold: 650000,
    firstHomeBuyerConcession: 1,
  },
  ACT: {
    brackets: [
      { min: 0, max: 260000, rate: 0.006, base: 0 },
      { min: 260000, max: 300000, rate: 0.023, base: 0 },
      { min: 300000, max: 500000, rate: 0.04, base: 0 },
      { min: 500000, max: 750000, rate: 0.055, base: 0 },
      { min: 750000, max: 1000000, rate: 0.0475, base: 0 },
      { min: 1000000, max: 1455000, rate: 0.055, base: 0 },
      { min: 1455000, max: Infinity, rate: 0.045, base: 0 },
    ],
    firstHomeBuyerThreshold: 1000000,
    firstHomeBuyerConcession: 1,
  },
};

// Calculate stamp duty based on state and price
function calculateStampDuty(state: string, purchasePrice: number, isFirstHomeBuyer: boolean): number {
  const rates = STAMP_DUTY_RATES[state];
  if (!rates || purchasePrice <= 0) return 0;

  let duty = 0;
  const brackets = rates.brackets;

  for (const bracket of brackets) {
    if (purchasePrice > bracket.min) {
      if (purchasePrice <= bracket.max) {
        duty = bracket.base + (purchasePrice - bracket.min) * bracket.rate;
        break;
      }
    }
  }

  // Apply first home buyer concession if applicable
  if (isFirstHomeBuyer && rates.firstHomeBuyerThreshold && rates.firstHomeBuyerConcession) {
    if (purchasePrice <= rates.firstHomeBuyerThreshold) {
      duty = duty * (1 - rates.firstHomeBuyerConcession);
    }
  }

  return Math.round(duty);
}

interface FinancialsTabProps {
  buildType: 'new_build' | 'existing_property';
  purchasePrice: string;
  depositValue: string;
  setDepositValue: (value: string) => void;
  loanToValueRatio: string;
  setLoanToValueRatio: (value: string) => void;
  interestRate: string;
  setInterestRate: (value: string) => void;
  loanTermYears: string;
  setLoanTermYears: (value: string) => void;
  loanType: 'interest_only' | 'principal_interest';
  setLoanType: (value: 'interest_only' | 'principal_interest') => void;
  capitalGrowth: string;
  setCapitalGrowth: (value: string) => void;
  stampDuty: string;
  setStampDuty: (value: string) => void;
  solicitorFees: string;
  setSolicitorFees: (value: string) => void;
  agentFee: string;
  setAgentFee: (value: string) => void;
  isFirstHomeBuyer: boolean;
  setIsFirstHomeBuyer: (value: boolean) => void;
  detectedState: string;
  propertyAddress: string;
  disabled?: boolean;
}

export function FinancialsTab({
  buildType,
  purchasePrice,
  depositValue,
  setDepositValue,
  loanToValueRatio,
  setLoanToValueRatio,
  interestRate,
  setInterestRate,
  loanTermYears,
  setLoanTermYears,
  loanType,
  setLoanType,
  capitalGrowth,
  setCapitalGrowth,
  stampDuty,
  setStampDuty,
  solicitorFees,
  setSolicitorFees,
  agentFee,
  setAgentFee,
  isFirstHomeBuyer,
  setIsFirstHomeBuyer,
  detectedState,
  propertyAddress,
  disabled = false
}: FinancialsTabProps) {
  const [showStampDutyCalc, setShowStampDutyCalc] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
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

  // Calculated values
  const price = parseFloat(purchasePrice) || 0;
  const lvr = parseFloat(loanToValueRatio) || 80;
  const loanAmount = Math.round(price * (lvr / 100));
  const rate = parseFloat(interestRate) || 6.5;
  const monthlyInterest = Math.round((loanAmount * (rate / 100)) / 12);

  // Calculate estimated stamp duty
  const estimatedStampDuty = useMemo(() => {
    if (detectedState !== 'All' && price > 0) {
      return calculateStampDuty(detectedState, price, isFirstHomeBuyer);
    }
    return 0;
  }, [detectedState, price, isFirstHomeBuyer]);

  // Auto-calculate stamp duty when calculator is opened
  const handleCalculateStampDuty = useCallback(() => {
    if (estimatedStampDuty > 0) {
      setIsCalculating(true);
      // Simulate calculation delay for UX
      setTimeout(() => {
        setStampDuty(estimatedStampDuty.toString());
        setIsCalculating(false);
      }, 300);
    }
  }, [estimatedStampDuty, setStampDuty]);

  // Total acquisition costs
  const totalAcquisitionCosts = 
    (parseFloat(stampDuty) || 0) +
    (parseFloat(solicitorFees) || 0) +
    (isNewBuild && agentFee ? parseFloat(agentFee) : 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* First Home Buyer Toggle */}
      <Card className="border-2 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Home className="h-5 w-5 text-primary" />
              <div>
                <Label htmlFor="firstHomeBuyer" className="text-base font-semibold cursor-pointer">
                  First Home Buyer
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enable for stamp duty concessions and grants
                </p>
              </div>
            </div>
            <Switch
              id="firstHomeBuyer"
              checked={isFirstHomeBuyer}
              onCheckedChange={setIsFirstHomeBuyer}
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Loan Structure Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              Deposit & Loan
            </h3>
            {/* Summary Badge */}
            {price > 0 && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Loan Amount</p>
                <p className="text-lg font-bold text-primary">${loanAmount.toLocaleString()}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="depositValue" className="text-sm font-medium flex items-center gap-1">
                Deposit
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Auto-calculated from Purchase Price × (100% - LVR)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="depositValue"
                  type="text"
                  inputMode="numeric"
                  value={formatForDisplay(depositValue)}
                  onChange={handleCurrencyChange(setDepositValue)}
                  placeholder="Auto-calculated"
                  disabled={disabled}
                  className="pl-7 bg-muted/30"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanToValueRatio" className="text-sm font-medium">LVR</Label>
              <div className="relative">
                <Input
                  id="loanToValueRatio"
                  type="number"
                  value={loanToValueRatio}
                  onChange={(e) => setLoanToValueRatio(e.target.value)}
                  placeholder="80"
                  disabled={disabled}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="interestRate" className="text-sm font-medium">Interest Rate</Label>
              <div className="relative">
                <Input
                  id="interestRate"
                  type="number"
                  step="0.01"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  placeholder="6.5"
                  disabled={disabled}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanTermYears" className="text-sm font-medium">Loan Term</Label>
              <div className="relative">
                <Input
                  id="loanTermYears"
                  type="number"
                  value={loanTermYears}
                  onChange={(e) => setLoanTermYears(e.target.value)}
                  placeholder="30"
                  disabled={disabled}
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">yrs</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="capitalGrowth" className="text-sm font-medium flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Growth
              </Label>
              <div className="relative">
                <Input
                  id="capitalGrowth"
                  type="number"
                  step="0.1"
                  value={capitalGrowth}
                  onChange={(e) => setCapitalGrowth(e.target.value)}
                  placeholder="5"
                  disabled={disabled}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          {/* Loan Type Toggle */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Loan Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={loanType === 'interest_only' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLoanType('interest_only')}
                disabled={disabled}
                className="flex-1"
              >
                Interest Only
              </Button>
              <Button
                type="button"
                variant={loanType === 'principal_interest' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLoanType('principal_interest')}
                disabled={disabled}
                className="flex-1"
              >
                Principal & Interest
              </Button>
            </div>
          </div>

          {/* Monthly Repayment Summary */}
          {loanAmount > 0 && (
            <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Est. Monthly {loanType === 'interest_only' ? 'Interest' : 'Repayment'}</span>
                <span className="text-xl font-bold text-primary">${monthlyInterest.toLocaleString()}/mo</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acquisition Costs Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Acquisition Costs
            </h3>
            {isFirstHomeBuyer && (
              <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                First Home Buyer
              </Badge>
            )}
          </div>

          {/* Stamp Duty */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="stampDuty" className="text-sm font-medium">Stamp Duty</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowStampDutyCalc(!showStampDutyCalc)}
                disabled={disabled}
              >
                <Calculator className="h-4 w-4 mr-1" />
                {showStampDutyCalc ? 'Hide' : 'Calculator'}
                {showStampDutyCalc ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
              </Button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="stampDuty"
                type="text"
                inputMode="numeric"
                value={formatForDisplay(stampDuty)}
                onChange={handleCurrencyChange(setStampDuty)}
                placeholder="Use calculator or enter manually"
                disabled={disabled}
                className="pl-7"
              />
            </div>
            {isFirstHomeBuyer && (
              <p className="text-xs text-green-600">
                First Home Buyer concessions may apply based on state
              </p>
            )}
          </div>

          {/* Stamp Duty Calculator */}
          {showStampDutyCalc && (
            <div className="mb-4 border rounded-lg p-4 bg-muted/20 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-medium">
                    {detectedState !== 'All' ? STATE_MAPPING[detectedState as keyof typeof STATE_MAPPING] : 'Unknown State'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {propertyAddress ? 'Auto-detected from address' : 'Enter address to detect state'}
                  </span>
                </div>
              </div>
              
              {/* Calculation Summary */}
              <div className="bg-background rounded-lg p-4 border">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Purchase Price:</span>
                    <span className="font-medium">${price.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">State:</span>
                    <span className="font-medium">{detectedState !== 'All' ? STATE_MAPPING[detectedState as keyof typeof STATE_MAPPING] : 'Not detected'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">First Home Buyer:</span>
                    <span className={`font-medium ${isFirstHomeBuyer ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {isFirstHomeBuyer ? 'Yes (concessions applied)' : 'No'}
                    </span>
                  </div>
                  
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Estimated Stamp Duty:</span>
                      <span className="text-xl font-bold text-primary">
                        ${estimatedStampDuty.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                
                <Button
                  type="button"
                  className="w-full mt-4"
                  onClick={handleCalculateStampDuty}
                  disabled={disabled || estimatedStampDuty === 0 || isCalculating}
                >
                  {isCalculating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    <>
                      <Calculator className="h-4 w-4 mr-2" />
                      Apply Stamp Duty Estimate
                    </>
                  )}
                </Button>
                
                {estimatedStampDuty === 0 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {price === 0 ? 'Enter a purchase price to calculate' : 'State not detected - enter a valid Australian address'}
                  </p>
                )}
              </div>
              
              <p className="text-xs text-muted-foreground">
                * Estimates based on standard residential rates. Actual stamp duty may vary based on property type, concessions, and current legislation.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="solicitorFees" className="text-sm font-medium">Solicitor / Conveyancing</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="solicitorFees"
                  type="text"
                  inputMode="numeric"
                  value={formatForDisplay(solicitorFees)}
                  onChange={handleCurrencyChange(setSolicitorFees)}
                  placeholder="1,500"
                  disabled={disabled}
                  className="pl-7"
                />
              </div>
            </div>
            {isNewBuild && (
              <div className="space-y-2">
                <Label htmlFor="agentFee" className="text-sm font-medium">Agent Fee / Commission</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="agentFee"
                    type="text"
                    inputMode="numeric"
                    value={formatForDisplay(agentFee)}
                    onChange={handleCurrencyChange(setAgentFee)}
                    placeholder="15,000"
                    disabled={disabled}
                    className="pl-7"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Total Acquisition Summary */}
          {totalAcquisitionCosts > 0 && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Upfront Costs</span>
                <span className="text-xl font-bold">${totalAcquisitionCosts.toLocaleString()}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
