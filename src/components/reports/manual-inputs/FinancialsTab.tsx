import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Calculator, Info, Percent, DollarSign, TrendingUp, ChevronDown, ChevronUp, ChevronRight, Home, Banknote, Building, MapPin, Check, Copy, X } from 'lucide-react';
import { formatNumberWithCommas, removeCommas } from '@/hooks/useFormattedNumber';
import { MortgageRepaymentCalculator } from '../MortgageRepaymentCalculator';
import { useToast } from '@/hooks/use-toast';
import { LoanType, RepaymentFrequency, get10YearLoanProjection } from '@/utils/mortgageCalculations';

export type StampDutyPropertyType = 'primary_residence' | 'investment';
export type StampDutyPurchaseType = 'established_home' | 'new_home' | 'vacant_land';

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
  // Stamp duty calculator props
  stampDutyPropertyType?: StampDutyPropertyType;
  setStampDutyPropertyType?: (value: StampDutyPropertyType) => void;
  stampDutyPurchaseType?: StampDutyPurchaseType;
  setStampDutyPurchaseType?: (value: StampDutyPurchaseType) => void;
  // Mortgage calculator props
  loanAmount?: string;
  setLoanAmount?: (value: string) => void;
  interestOnlyPeriodYears?: string;
  setInterestOnlyPeriodYears?: (value: string) => void;
  repaymentFrequency?: 'weekly' | 'fortnightly' | 'monthly';
  setRepaymentFrequency?: (value: 'weekly' | 'fortnightly' | 'monthly') => void;
  extraRepaymentPerMonth?: string;
  setExtraRepaymentPerMonth?: (value: string) => void;
  offsetBalance?: string;
  setOffsetBalance?: (value: string) => void;
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
  disabled = false,
  stampDutyPropertyType: propStampDutyPropertyType,
  setStampDutyPropertyType: propSetStampDutyPropertyType,
  stampDutyPurchaseType: propStampDutyPurchaseType,
  setStampDutyPurchaseType: propSetStampDutyPurchaseType,
  loanAmount: propLoanAmount,
  setLoanAmount: propSetLoanAmount,
  interestOnlyPeriodYears: propInterestOnlyPeriodYears,
  setInterestOnlyPeriodYears: propSetInterestOnlyPeriodYears,
  repaymentFrequency: propRepaymentFrequency,
  setRepaymentFrequency: propSetRepaymentFrequency,
  extraRepaymentPerMonth: propExtraRepaymentPerMonth,
  setExtraRepaymentPerMonth: propSetExtraRepaymentPerMonth,
  offsetBalance: propOffsetBalance,
  setOffsetBalance: propSetOffsetBalance
}: FinancialsTabProps) {
  const [showStampDutyModal, setShowStampDutyModal] = useState(false);
  const [showMortgageCalculator, setShowMortgageCalculator] = useState(false);
  const [localStampDutyPropertyType, setLocalStampDutyPropertyType] = useState<StampDutyPropertyType>('investment');
  const [localStampDutyPurchaseType, setLocalStampDutyPurchaseType] = useState<StampDutyPurchaseType>('established_home');
  const [calculatedStampDuty, setCalculatedStampDuty] = useState<string>('');
  const stampDutyIframeRef = useRef<HTMLIFrameElement | null>(null);
  const isNewBuild = buildType === 'new_build';
  const { toast } = useToast();

  // Use props or local state for stamp duty selections
  const stampDutyPropertyType = propStampDutyPropertyType ?? localStampDutyPropertyType;
  const setStampDutyPropertyType = propSetStampDutyPropertyType ?? setLocalStampDutyPropertyType;
  const stampDutyPurchaseType = propStampDutyPurchaseType ?? localStampDutyPurchaseType;
  const setStampDutyPurchaseType = propSetStampDutyPurchaseType ?? setLocalStampDutyPurchaseType;

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


  // Load stamp duty calculator in a sandboxed iframe when modal is open
  useEffect(() => {
    if (!showStampDutyModal) return;

    const iframe = stampDutyIframeRef.current;
    if (!iframe) return;

    const iframeContent = `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <style>
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .calculator-wrapper { padding: 12px; }
          </style>
        </head>
        <body>
          <div class="calculator-wrapper">
            <div id="stamp-duty-calculator" class="orange-theme">
              <div id="stamp-duty-anchors"></div>
            </div>
          </div>
          <script id="stamp-src" type="text/javascript" src="https://calculatorsonline.com.au/external/!main/stamp_duty.min.js" data-state="${detectedState}"></script>
        </body>
      </html>`;

    iframe.srcdoc = iframeContent;
  }, [showStampDutyModal, detectedState]);

  // Function to capture stamp duty from calculator (iframe sandboxed)
  const captureStampDutyFromCalculator = useCallback(() => {
    const iframeDoc = stampDutyIframeRef.current?.contentDocument;
    const calcContainer = iframeDoc?.getElementById('stamp-duty-calculator');
    if (!calcContainer) {
      toast({
        title: "Calculator not loaded",
        description: "Please wait for the calculator to load and calculate a value first.",
        variant: "destructive"
      });
      return;
    }

    frameWindow.postMessage({ type: 'REQUEST_STAMP_DUTY_VALUE' }, '*');

    if (stampDutyTimeoutRef.current) clearTimeout(stampDutyTimeoutRef.current);
    stampDutyTimeoutRef.current = setTimeout(() => {
      toast({
        title: "Could not capture value",
        description: "Please calculate stamp duty in the calculator first, then try again.",
        variant: "destructive"
      });
      stampDutyTimeoutRef.current = null;
    }, 1500);
  }, [toast]);


  // Apply calculated stamp duty to the form
  const handleApplyStampDuty = useCallback(() => {
    if (calculatedStampDuty) {
      setStampDuty(calculatedStampDuty);
      toast({
        title: "Stamp Duty Applied",
        description: `$${formatNumberWithCommas(calculatedStampDuty)} has been applied to the form.`,
      });
    }
  }, [calculatedStampDuty, setStampDuty, toast]);

  // Total acquisition costs
  const totalAcquisitionCosts = 
    (parseFloat(stampDuty) || 0) +
    (parseFloat(solicitorFees) || 0) +
    (!isNewBuild && agentFee ? parseFloat(agentFee) : 0);

  return (
    <div className="space-y-6 animate-fade-in">

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

      {/* Mortgage Repayment Calculator */}
      <Collapsible open={showMortgageCalculator} onOpenChange={setShowMortgageCalculator}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between p-4 h-auto border-2 border-dashed border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/5 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Banknote className="h-5 w-5 text-amber-600" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-foreground">Mortgage Repayment Calculator</p>
                <p className="text-sm text-muted-foreground">
                  Calculate repayments, view amortisation schedule, and apply to cash flow
                </p>
              </div>
            </div>
            {showMortgageCalculator ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            <Separator />
            <MortgageRepaymentCalculator
              initialLoanAmount={loanAmount}
              initialInterestRate={parseFloat(interestRate) || 6.5}
              initialLoanTermYears={parseFloat(loanTermYears) || 30}
              initialLoanType={(loanType || 'principal_interest') as LoanType}
              initialInterestOnlyPeriodYears={parseFloat(propInterestOnlyPeriodYears || '0') || 0}
              initialRepaymentFrequency={(propRepaymentFrequency || 'monthly') as RepaymentFrequency}
              initialExtraRepayment={parseFloat(propExtraRepaymentPerMonth || '0') || 0}
              initialOffsetBalance={parseFloat(propOffsetBalance || '0') || 0}
              onApplyToOverrides={(values) => {
                if (values.loanAmount !== undefined && propSetLoanAmount) {
                  propSetLoanAmount(values.loanAmount.toString());
                }
                if (values.interestRate !== undefined) {
                  setInterestRate(values.interestRate.toString());
                }
                if (values.loanTermYears !== undefined) {
                  setLoanTermYears(values.loanTermYears.toString());
                }
                if (values.loanType !== undefined) {
                  setLoanType(values.loanType as 'interest_only' | 'principal_interest');
                }
                if (values.interestOnlyPeriodYears !== undefined && propSetInterestOnlyPeriodYears) {
                  propSetInterestOnlyPeriodYears(values.interestOnlyPeriodYears.toString());
                }
                if (values.repaymentFrequency !== undefined && propSetRepaymentFrequency) {
                  propSetRepaymentFrequency(values.repaymentFrequency);
                }
                if (values.extraRepaymentPerMonth !== undefined && propSetExtraRepaymentPerMonth) {
                  propSetExtraRepaymentPerMonth(values.extraRepaymentPerMonth.toString());
                }
                if (values.offsetBalance !== undefined && propSetOffsetBalance) {
                  propSetOffsetBalance(values.offsetBalance.toString());
                }
              }}
              onApplyLoanProjection={(projection) => {
                // The projection is available for parent components if needed
                console.log('Loan projection applied:', projection);
              }}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

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
          <div className="space-y-4 mb-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="stampDuty" className="text-sm font-medium">Stamp Duty</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowStampDutyModal(true);
                  setCalculatedStampDuty('');
                }}
                disabled={disabled}
              >
                <Calculator className="h-4 w-4 mr-1" />
                Calculator
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

          {/* Stamp Duty Calculator Modal */}
          <Dialog open={showStampDutyModal} onOpenChange={setShowStampDutyModal}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary" />
                  Stamp Duty Calculator
                </DialogTitle>
                <DialogDescription>
                  Calculate stamp duty for {propertyAddress || 'your property'} ({detectedState})
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* First Home Buyer Toggle */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Home className="h-5 w-5 text-primary" />
                    <div>
                      <Label htmlFor="firstHomeBuyerCalcModal" className="text-sm font-semibold cursor-pointer">
                        First Home Buyer
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Enable for stamp duty concessions
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="firstHomeBuyerCalcModal"
                    checked={isFirstHomeBuyer}
                    onCheckedChange={setIsFirstHomeBuyer}
                    disabled={disabled}
                  />
                </div>

                {/* Property Type Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    Property Type
                  </Label>
                  <Select
                    value={stampDutyPropertyType}
                    onValueChange={(value) => setStampDutyPropertyType(value as StampDutyPropertyType)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue placeholder="Select property type" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="primary_residence">Primary Residence</SelectItem>
                      <SelectItem value="investment">Investment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Purchase Type Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Are you purchasing
                  </Label>
                  <Select
                    value={stampDutyPurchaseType}
                    onValueChange={(value) => setStampDutyPurchaseType(value as StampDutyPurchaseType)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue placeholder="Select purchase type" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="established_home">An established home</SelectItem>
                      <SelectItem value="new_home">A new home</SelectItem>
                      <SelectItem value="vacant_land">Vacant Land</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Property Value (Dynamic from Purchase Price) */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    Property Value
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="text"
                      value={formatForDisplay(purchasePrice)}
                      disabled
                      className="pl-7 bg-muted/50"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Property value is pulled from the Purchase Price field
                  </p>
                </div>

                <Separator />

                {/* External Calculator Embed - sandboxed to avoid layout side effects */}
                <div className="relative rounded-lg overflow-hidden border bg-white shadow-inner">
                  <iframe
                    ref={stampDutyIframeRef}
                    title="Stamp Duty Calculator"
                    className="w-full"
                    style={{ minHeight: '620px' }}
                    sandbox="allow-scripts allow-forms"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                  />
                  <div className="p-3 border-t bg-muted/50 text-xs text-muted-foreground flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <span>Stamp Duty Calculator from</span>
                      <a
                        href="https://calculatorsonline.com.au"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        calculatorsonline.com.au
                      </a>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {detectedState === 'All' ? 'State selectable' : `Pre-selected: ${detectedState}`}
                    </Badge>
                  </div>
                </div>

                {/* Capture Button */}
                <Button 
                  onClick={captureStampDutyFromCalculator}
                  className="w-full gap-2"
                  variant="outline"
                >
                  <Copy className="h-4 w-4" />
                  Capture Calculated Stamp Duty Value
                </Button>

                {/* Apply Calculated Stamp Duty Button */}
                {calculatedStampDuty && (
                  <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                    <div className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-semibold text-green-700">
                          Calculated Stamp Duty: ${formatNumberWithCommas(calculatedStampDuty)}
                        </p>
                        <p className="text-xs text-green-600">
                          Click to apply this amount to your report
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => {
                        handleApplyStampDuty();
                        setShowStampDutyModal(false);
                      }}
                      disabled={disabled}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Apply & Close
                    </Button>
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">
                  * Calculate your stamp duty using the widget above, then click "Capture" to use the value.
                </p>
              </div>
            </DialogContent>
          </Dialog>

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
            {!isNewBuild && (
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
