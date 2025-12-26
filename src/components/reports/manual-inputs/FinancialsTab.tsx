import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calculator, Info, Percent, DollarSign, TrendingUp, ChevronDown, ChevronUp, Home } from 'lucide-react';
import { formatNumberWithCommas, removeCommas } from '@/hooks/useFormattedNumber';


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
  const stampDutyContainerRef = useRef<HTMLDivElement>(null);
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

  // Map state codes to calculator-compatible state names
  const getCalculatorState = useCallback((stateCode: string): string => {
    const stateMap: Record<string, string> = {
      'NSW': 'NSW',
      'VIC': 'VIC', 
      'QLD': 'QLD',
      'SA': 'SA',
      'WA': 'WA',
      'TAS': 'TAS',
      'NT': 'NT',
      'ACT': 'ACT',
      'All': 'All'
    };
    return stateMap[stateCode] || 'All';
  }, []);

  // Cleanup function for stamp duty calculator
  const cleanupStampDutyScript = useCallback(() => {
    try {
      const script = document.getElementById('stamp-src');
      if (script) {
        script.remove();
      }
      // Also remove any elements the script may have created
      const calcElements = document.querySelectorAll('[id^="stamp-duty-"]');
      calcElements.forEach(el => {
        if (el.id !== 'stamp-duty-calculator') {
          el.remove();
        }
      });
    } catch (e) {
      console.warn('Error cleaning up stamp duty script:', e);
    }
  }, []);

  // Load stamp duty calculator script when shown or when state/price changes
  useEffect(() => {
    if (!showStampDutyCalc) {
      cleanupStampDutyScript();
      return;
    }

    if (stampDutyContainerRef.current) {
      try {
        // Remove existing script to reload with new parameters
        cleanupStampDutyScript();
        
        // Clear existing calculator content
        const calcContainer = document.getElementById('stamp-duty-calculator');
        if (calcContainer) {
          // Reset the container
          calcContainer.innerHTML = '<div id="stamp-duty-anchors"><p>Stamp Duty Calculator from <a href="https://calculatorsonline.com.au">calculatorsonline.com.au</a></p></div>';
        }
        
        // Create new script with detected state and price
        const script = document.createElement('script');
        script.id = 'stamp-src';
        script.type = 'text/javascript';
        script.src = '//calculatorsonline.com.au/external/!main/stamp_duty.min.js';
        
        // Set the state based on detected property address
        const calculatorState = getCalculatorState(detectedState);
        script.setAttribute('data-state', calculatorState);
        
        // Set purchase price if available
        if (price > 0) {
          script.setAttribute('data-price', price.toString());
        }
        
        // Add error handler for script loading
        script.onerror = () => {
          console.warn('Failed to load stamp duty calculator script');
        };
        
        document.body.appendChild(script);
      } catch (e) {
        console.warn('Error loading stamp duty calculator:', e);
      }
    }
    
    // Cleanup on unmount
    return () => {
      cleanupStampDutyScript();
    };
  }, [showStampDutyCalc, detectedState, price, getCalculatorState, cleanupStampDutyScript]);

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

          {/* Stamp Duty Calculator Embed */}
          {showStampDutyCalc && (
            <div ref={stampDutyContainerRef} className="mb-4 border rounded-lg p-4 bg-muted/20">
              <div 
                id="stamp-duty-calculator" 
                className="orange-theme"
                dangerouslySetInnerHTML={{
                  __html: '<div id="stamp-duty-anchors"><p>Stamp Duty Calculator from <a href="https://calculatorsonline.com.au">calculatorsonline.com.au</a></p></div>'
                }}
              />
              <p className="text-xs text-muted-foreground mt-4">
                * Calculate your stamp duty using the widget above, then enter the result in the Stamp Duty field.
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
