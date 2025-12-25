import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Calculator, 
  ChevronDown, 
  ChevronRight, 
  Building2, 
  Home, 
  Info,
  DollarSign,
  Percent,
  TrendingUp,
  ArrowRight,
  Loader2,
  Sparkles,
  Building
} from 'lucide-react';
import { STATE_MAPPING } from '@/lib/states';

export interface PreGenerationData {
  buildType: 'new_build' | 'existing_property';
  purchasePrice?: number;
  landPrice?: number;
  buildPrice?: number;
  depositValue?: number;
  loanToValueRatio?: number;
  interestRate?: number;
  capitalGrowth?: number;
  weeklyRent?: number;
  
  // Annual Expenses
  stampDuty?: number;
  bodyCorporateFees?: number;
  strataAdminFund?: number;
  strataSinkingFund?: number;
  strataSpecialLevies?: number;
  landTax?: number;
  councilRates?: number;
  waterRates?: number;
  solicitorFees?: number;
  buildingLandlordInsurance?: number;
  propertyManagementFees?: number;
  repairsMaintenance?: number;
  lettingFees?: number;
  agentFee?: number;
  propertyType?: string;
  
  // Cash Flow Analysis Optional Overrides
  cpiGrowthRate?: number;
  depreciation?: number;
  taxRate?: number;
  occupancyRate?: number;
  loanType?: 'interest_only' | 'principal_interest';
  loanTermYears?: number;
  marketValueNow?: number;
  
  // Additional Cash Flow Fields (from ManualDataOverrideModal)
  loanAmount?: number;
  interestOnlyPeriodYears?: number;
  repaymentFrequency?: 'weekly' | 'fortnightly' | 'monthly';
  extraRepaymentPerMonth?: number;
  offsetBalance?: number;
  constructionDurationMonths?: number;
  constructionYear?: number;
  landSizeSqm?: number;
  buildSizeSqm?: number;
  
  // First Home Buyer flag for stamp duty concessions
  isFirstHomeBuyer?: boolean;
  
  // Construction Stage Percentages (new build only)
  stageDepositPercent?: number;
  stageSlabPercent?: number;
  stageFramePercent?: number;
  stageLockupPercent?: number;
  stageFixingPercent?: number;
  stageCompletionPercent?: number;
}

interface PreGenerationOverridesProps {
  propertyAddress?: string;
  onDataChange: (data: PreGenerationData) => void;
  disabled?: boolean;
  buildType?: 'new_build' | 'existing_property';
  onBuildTypeChange?: (buildType: 'new_build' | 'existing_property') => void;
}

export function PreGenerationOverrides({ 
  propertyAddress = '', 
  onDataChange, 
  disabled = false,
  buildType: externalBuildType,
  onBuildTypeChange
}: PreGenerationOverridesProps) {
  const { toast } = useToast();
  
  // Build type selection - sync with external prop if provided
  const [internalBuildType, setInternalBuildType] = useState<'new_build' | 'existing_property'>(externalBuildType || 'existing_property');
  
  // Use external build type if provided, otherwise use internal state
  const buildType = externalBuildType !== undefined ? externalBuildType : internalBuildType;
  
  // Handle build type change - notify parent if callback provided
  const handleBuildTypeChange = (value: 'new_build' | 'existing_property') => {
    setInternalBuildType(value);
    if (onBuildTypeChange) {
      onBuildTypeChange(value);
    }
  };
  
  // Property type for expense estimation
  const [propertyType, setPropertyType] = useState<string>('house');
  
  // Core property values
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [landPrice, setLandPrice] = useState<string>('');
  const [buildPrice, setBuildPrice] = useState<string>('');
  const [depositValue, setDepositValue] = useState<string>('');
  const [loanToValueRatio, setLoanToValueRatio] = useState<string>('80');
  const [interestRate, setInterestRate] = useState<string>('6.5');
  const [capitalGrowth, setCapitalGrowth] = useState<string>('5');
  
  // Rental income
  const [weeklyRent, setWeeklyRent] = useState<string>('');
  
  // Annual expenses
  const [stampDuty, setStampDuty] = useState<string>('');
  const [bodyCorporateFees, setBodyCorporateFees] = useState<string>('');
  const [strataAdminFund, setStrataAdminFund] = useState<string>('');
  const [strataSinkingFund, setStrataSinkingFund] = useState<string>('');
  const [strataSpecialLevies, setStrataSpecialLevies] = useState<string>('');
  const [landTax, setLandTax] = useState<string>('');
  const [councilRates, setCouncilRates] = useState<string>('');
  const [waterRates, setWaterRates] = useState<string>('');
  const [solicitorFees, setSolicitorFees] = useState<string>('');
  const [buildingLandlordInsurance, setBuildingLandlordInsurance] = useState<string>('');
  const [propertyManagementFees, setPropertyManagementFees] = useState<string>('8');
  const [repairsMaintenance, setRepairsMaintenance] = useState<string>('');
  const [lettingFees, setLettingFees] = useState<string>('');
  const [agentFee, setAgentFee] = useState<string>('');
  
  // Cash Flow Analysis Optional Overrides
  const [cpiGrowthRate, setCpiGrowthRate] = useState<string>('');
  const [depreciation, setDepreciation] = useState<string>('');
  const [taxRate, setTaxRate] = useState<string>('');
  const [occupancyRate, setOccupancyRate] = useState<string>('52');
  const [loanType, setLoanType] = useState<'interest_only' | 'principal_interest'>('interest_only');
  const [loanTermYears, setLoanTermYears] = useState<string>('30');
  const [marketValueNow, setMarketValueNow] = useState<string>('');
  
  // Additional Cash Flow Fields (from ManualDataOverrideModal)
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [interestOnlyPeriodYears, setInterestOnlyPeriodYears] = useState<string>('');
  const [repaymentFrequency, setRepaymentFrequency] = useState<'weekly' | 'fortnightly' | 'monthly'>('monthly');
  const [extraRepaymentPerMonth, setExtraRepaymentPerMonth] = useState<string>('');
  const [offsetBalance, setOffsetBalance] = useState<string>('');
  const [constructionDurationMonths, setConstructionDurationMonths] = useState<string>('');
  const [constructionYear, setConstructionYear] = useState<string>('');
  const [landSizeSqm, setLandSizeSqm] = useState<string>('');
  const [buildSizeSqm, setBuildSizeSqm] = useState<string>('');
  
  // First Home Buyer flag
  const [isFirstHomeBuyer, setIsFirstHomeBuyer] = useState<boolean>(false);
  
  // Construction Stage Percentages (new build only)
  const [stageDepositPercent, setStageDepositPercent] = useState<string>('5');
  const [stageSlabPercent, setStageSlabPercent] = useState<string>('15');
  const [stageFramePercent, setStageFramePercent] = useState<string>('20');
  const [stageLockupPercent, setStageLockupPercent] = useState<string>('25');
  const [stageFixingPercent, setStageFixingPercent] = useState<string>('20');
  const [stageCompletionPercent, setStageCompletionPercent] = useState<string>('15');
  
  // Calculators visibility
  const [showStampDutyCalculator, setShowStampDutyCalculator] = useState(false);
  const [showStrataBreakdown, setShowStrataBreakdown] = useState(false);
  const [showCashFlowOverrides, setShowCashFlowOverrides] = useState(false);
  const [detectedState, setDetectedState] = useState<string>('All');
  
  // Collapsible sections
  const [showLoanSettings, setShowLoanSettings] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [showAcquisitionCosts, setShowAcquisitionCosts] = useState(true);
  
  // Loading state for expense estimation
  const [isEstimatingExpenses, setIsEstimatingExpenses] = useState(false);

  // Detect state from property address
  const detectStateFromAddress = useCallback((address: string): string => {
    if (!address) return 'All';
    const upperAddress = address.toUpperCase();
    
    for (const abbr of Object.keys(STATE_MAPPING)) {
      const patterns = [
        new RegExp(`\\b${abbr}\\b`),
        new RegExp(`\\s${abbr}\\s*\\d{4}`),
        new RegExp(`,\\s*${abbr}\\s`),
      ];
      if (patterns.some(p => p.test(upperAddress))) {
        return abbr;
      }
    }
    
    for (const [abbr, fullName] of Object.entries(STATE_MAPPING)) {
      if (upperAddress.includes(fullName.toUpperCase())) {
        return abbr;
      }
    }
    
    return 'All';
  }, []);

  // Detect state when address changes
  useEffect(() => {
    if (propertyAddress) {
      const state = detectStateFromAddress(propertyAddress);
      setDetectedState(state);
    }
  }, [propertyAddress, detectStateFromAddress]);

  // Dynamic calculations - Purchase Price from Land + Build
  useEffect(() => {
    if (buildType === 'new_build' && landPrice && buildPrice) {
      const land = parseFloat(landPrice) || 0;
      const build = parseFloat(buildPrice) || 0;
      if (land > 0 || build > 0) {
        setPurchasePrice((land + build).toString());
      }
    }
  }, [buildType, landPrice, buildPrice]);

  // Dynamic calculation - Deposit from Purchase Price and LVR
  useEffect(() => {
    if (buildType === 'existing_property' && purchasePrice && loanToValueRatio) {
      const price = parseFloat(purchasePrice) || 0;
      const lvr = parseFloat(loanToValueRatio) || 80;
      if (price > 0) {
        const deposit = price * ((100 - lvr) / 100);
        setDepositValue(Math.round(deposit).toString());
      }
    }
  }, [buildType, purchasePrice, loanToValueRatio]);

  // Dynamic calculation - Letting Fees = Weekly Rent (1 week)
  useEffect(() => {
    if (weeklyRent) {
      setLettingFees(weeklyRent);
    }
  }, [weeklyRent]);

  // Dynamic calculation - Body Corporate = Admin + Sinking + Special Levies
  useEffect(() => {
    const admin = parseFloat(strataAdminFund) || 0;
    const sinking = parseFloat(strataSinkingFund) || 0;
    const special = parseFloat(strataSpecialLevies) || 0;
    const total = admin + sinking + special;
    if (total > 0) {
      setBodyCorporateFees(total.toString());
    }
  }, [strataAdminFund, strataSinkingFund, strataSpecialLevies]);

  // Load stamp duty calculator script
  useEffect(() => {
    if (showStampDutyCalculator) {
      // Remove any existing stamp duty scripts and reset container
      const existingScript = document.getElementById('stamp-src');
      if (existingScript) {
        existingScript.remove();
      }
      
      // Create fresh script element
      const script = document.createElement('script');
      script.id = 'stamp-src';
      script.type = 'text/javascript';
      script.src = '//calculatorsonline.com.au/external/!main/stamp_duty.min.js';
      script.setAttribute('data-state', detectedState);
      document.body.appendChild(script);
      
      return () => {
        // Cleanup on unmount or when hiding
        const scriptToRemove = document.getElementById('stamp-src');
        if (scriptToRemove) {
          scriptToRemove.remove();
        }
      };
    }
  }, [showStampDutyCalculator, detectedState]);

  // Estimate expenses using edge function
  const estimateExpenses = useCallback(async () => {
    if (!propertyAddress) {
      toast({
        title: "Address Required",
        description: "Please enter a property address first.",
        variant: "destructive"
      });
      return;
    }

    const price = buildType === 'new_build' 
      ? (parseFloat(landPrice) || 0) + (parseFloat(buildPrice) || 0)
      : parseFloat(purchasePrice) || 0;

    if (price <= 0) {
      toast({
        title: "Price Required",
        description: "Please enter a purchase price first.",
        variant: "destructive"
      });
      return;
    }

    setIsEstimatingExpenses(true);
    try {
      const { data, error } = await supabase.functions.invoke('estimate-property-expenses', {
        body: {
          propertyAddress,
          purchasePrice: price,
          weeklyRent: parseFloat(weeklyRent) || 0,
          propertyType
        }
      });

      if (error) throw error;

      if (data?.success && data?.estimates) {
        const estimates = data.estimates;
        
        // Apply estimated values
        if (estimates.bodyCorporateFees > 0) {
          setBodyCorporateFees(estimates.bodyCorporateFees.toString());
          // Estimate strata breakdown (typical split: 60% admin, 30% sinking, 10% special)
          setStrataAdminFund(Math.round(estimates.bodyCorporateFees * 0.6).toString());
          setStrataSinkingFund(Math.round(estimates.bodyCorporateFees * 0.3).toString());
          setStrataSpecialLevies(Math.round(estimates.bodyCorporateFees * 0.1).toString());
        }
        if (estimates.landTax > 0) setLandTax(estimates.landTax.toString());
        if (estimates.councilRates > 0) setCouncilRates(estimates.councilRates.toString());
        if (estimates.waterRates > 0) setWaterRates(estimates.waterRates.toString());
        if (estimates.solicitorFees > 0) setSolicitorFees(estimates.solicitorFees.toString());
        if (estimates.buildingLandlordInsurance > 0) setBuildingLandlordInsurance(estimates.buildingLandlordInsurance.toString());
        if (estimates.propertyManagementFees > 0) setPropertyManagementFees(estimates.propertyManagementFees.toString());
        if (estimates.repairsMaintenance > 0) setRepairsMaintenance(estimates.repairsMaintenance.toString());

        toast({
          title: "Expenses Estimated",
          description: "AI-powered expense estimates have been applied. Review and adjust as needed.",
        });
      } else {
        throw new Error(data?.error || 'Failed to estimate expenses');
      }
    } catch (error) {
      console.error('Error estimating expenses:', error);
      toast({
        title: "Estimation Failed",
        description: error instanceof Error ? error.message : "Failed to estimate expenses",
        variant: "destructive"
      });
    } finally {
      setIsEstimatingExpenses(false);
    }
  }, [propertyAddress, buildType, landPrice, buildPrice, purchasePrice, weeklyRent, propertyType, toast]);

  // Notify parent of data changes
  useEffect(() => {
    const data: PreGenerationData = {
      buildType,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
      landPrice: buildType === 'new_build' && landPrice ? parseFloat(landPrice) : undefined,
      buildPrice: buildType === 'new_build' && buildPrice ? parseFloat(buildPrice) : undefined,
      depositValue: buildType === 'existing_property' && depositValue ? parseFloat(depositValue) : undefined,
      loanToValueRatio: loanToValueRatio ? parseFloat(loanToValueRatio) : undefined,
      interestRate: interestRate ? parseFloat(interestRate) : undefined,
      capitalGrowth: capitalGrowth ? parseFloat(capitalGrowth) : undefined,
      weeklyRent: weeklyRent ? parseFloat(weeklyRent) : undefined,
      stampDuty: stampDuty ? parseFloat(stampDuty) : undefined,
      bodyCorporateFees: bodyCorporateFees ? parseFloat(bodyCorporateFees) : undefined,
      strataAdminFund: strataAdminFund ? parseFloat(strataAdminFund) : undefined,
      strataSinkingFund: strataSinkingFund ? parseFloat(strataSinkingFund) : undefined,
      strataSpecialLevies: strataSpecialLevies ? parseFloat(strataSpecialLevies) : undefined,
      landTax: landTax ? parseFloat(landTax) : undefined,
      councilRates: councilRates ? parseFloat(councilRates) : undefined,
      waterRates: waterRates ? parseFloat(waterRates) : undefined,
      solicitorFees: solicitorFees ? parseFloat(solicitorFees) : undefined,
      buildingLandlordInsurance: buildingLandlordInsurance ? parseFloat(buildingLandlordInsurance) : undefined,
      propertyManagementFees: propertyManagementFees ? parseFloat(propertyManagementFees) : undefined,
      repairsMaintenance: repairsMaintenance ? parseFloat(repairsMaintenance) : undefined,
      lettingFees: lettingFees ? parseFloat(lettingFees) : undefined,
      agentFee: buildType === 'new_build' && agentFee ? parseFloat(agentFee) : undefined,
      propertyType,
      // Cash Flow Analysis Overrides
      cpiGrowthRate: cpiGrowthRate ? parseFloat(cpiGrowthRate) : undefined,
      depreciation: depreciation ? parseFloat(depreciation) : undefined,
      taxRate: taxRate ? parseFloat(taxRate) : undefined,
      occupancyRate: occupancyRate ? parseFloat(occupancyRate) : undefined,
      loanType: loanType || undefined,
      loanTermYears: loanTermYears ? parseFloat(loanTermYears) : undefined,
      marketValueNow: marketValueNow ? parseFloat(marketValueNow) : undefined,
      // Additional Cash Flow Fields
      loanAmount: loanAmount ? parseFloat(loanAmount) : undefined,
      interestOnlyPeriodYears: interestOnlyPeriodYears ? parseFloat(interestOnlyPeriodYears) : undefined,
      repaymentFrequency: repaymentFrequency || undefined,
      extraRepaymentPerMonth: extraRepaymentPerMonth ? parseFloat(extraRepaymentPerMonth) : undefined,
      offsetBalance: offsetBalance ? parseFloat(offsetBalance) : undefined,
      constructionDurationMonths: buildType === 'new_build' && constructionDurationMonths ? parseFloat(constructionDurationMonths) : undefined,
      constructionYear: constructionYear ? parseFloat(constructionYear) : undefined,
      landSizeSqm: landSizeSqm ? parseFloat(landSizeSqm) : undefined,
      buildSizeSqm: buildSizeSqm ? parseFloat(buildSizeSqm) : undefined,
      // First Home Buyer flag
      isFirstHomeBuyer: isFirstHomeBuyer || undefined,
      // Construction Stage Percentages (new build only)
      stageDepositPercent: buildType === 'new_build' && stageDepositPercent ? parseFloat(stageDepositPercent) : undefined,
      stageSlabPercent: buildType === 'new_build' && stageSlabPercent ? parseFloat(stageSlabPercent) : undefined,
      stageFramePercent: buildType === 'new_build' && stageFramePercent ? parseFloat(stageFramePercent) : undefined,
      stageLockupPercent: buildType === 'new_build' && stageLockupPercent ? parseFloat(stageLockupPercent) : undefined,
      stageFixingPercent: buildType === 'new_build' && stageFixingPercent ? parseFloat(stageFixingPercent) : undefined,
      stageCompletionPercent: buildType === 'new_build' && stageCompletionPercent ? parseFloat(stageCompletionPercent) : undefined,
    };
    
    onDataChange(data);
  }, [
    buildType, purchasePrice, landPrice, buildPrice, depositValue, 
    loanToValueRatio, interestRate, capitalGrowth, weeklyRent,
    stampDuty, bodyCorporateFees, strataAdminFund, strataSinkingFund, strataSpecialLevies,
    landTax, councilRates, waterRates, solicitorFees, buildingLandlordInsurance, 
    propertyManagementFees, repairsMaintenance, lettingFees, agentFee, propertyType,
    cpiGrowthRate, depreciation, taxRate, occupancyRate, loanType, loanTermYears, marketValueNow,
    loanAmount, interestOnlyPeriodYears, repaymentFrequency, extraRepaymentPerMonth, offsetBalance,
    constructionDurationMonths, constructionYear, landSizeSqm, buildSizeSqm,
    isFirstHomeBuyer, stageDepositPercent, stageSlabPercent, stageFramePercent, 
    stageLockupPercent, stageFixingPercent, stageCompletionPercent,
    onDataChange
  ]);

  // Capture stamp duty from calculator
  const captureStampDuty = useCallback(() => {
    const calcContainer = document.getElementById('stamp-duty-calculator');
    if (!calcContainer) {
      toast({
        title: "Calculator not loaded",
        description: "Please wait for the calculator to load and calculate a value first.",
        variant: "destructive"
      });
      return;
    }

    const resultSelectors = ['.stamp-duty-result', '.result-value', '#stamp-duty-result', '[data-result]', '.calc-result', 'strong', '.total', '#total'];
    let stampDutyValue: number | null = null;

    for (const selector of resultSelectors) {
      const elements = calcContainer.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent || '';
        const match = text.match(/\$[\d,]+(?:\.\d{2})?/);
        if (match) {
          const value = parseFloat(match[0].replace(/[$,]/g, ''));
          if (value > 0 && value < 10000000) {
            stampDutyValue = value;
            break;
          }
        }
      }
      if (stampDutyValue) break;
    }

    if (!stampDutyValue) {
      const allText = calcContainer.textContent || '';
      const matches = allText.match(/\$[\d,]+(?:\.\d{2})?/g);
      if (matches && matches.length > 0) {
        const values = matches
          .map(m => parseFloat(m.replace(/[$,]/g, '')))
          .filter(v => v > 100 && v < 10000000);
        if (values.length > 0) {
          stampDutyValue = values[values.length - 1];
        }
      }
    }

    if (stampDutyValue) {
      setStampDuty(stampDutyValue.toString());
      toast({
        title: "Stamp Duty Applied",
        description: `$${stampDutyValue.toLocaleString()} has been applied.`,
      });
    } else {
      toast({
        title: "Could not capture value",
        description: "Please calculate stamp duty first, then try again.",
        variant: "destructive"
      });
    }
  }, [toast]);

  const isNewBuild = buildType === 'new_build';

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Pre-Generation Overrides
        </CardTitle>
        <CardDescription>
          Set manual values to inject into the report generation. These will override AI-fetched data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {/* Build Type Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Property Build Type
              </Label>
              <RadioGroup
                value={buildType}
                onValueChange={(value) => handleBuildTypeChange(value as 'new_build' | 'existing_property')}
                className="grid grid-cols-2 gap-4"
                disabled={disabled}
              >
                <Label
                  htmlFor="existing_property"
                  className={`flex flex-col items-center justify-center p-4 border rounded-lg cursor-pointer transition-all ${
                    !isNewBuild 
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <RadioGroupItem value="existing_property" id="existing_property" className="sr-only" />
                  <Home className={`h-8 w-8 mb-2 ${!isNewBuild ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`font-medium ${!isNewBuild ? 'text-primary' : 'text-foreground'}`}>
                    Existing Property
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">Established home or apartment</span>
                </Label>
                <Label
                  htmlFor="new_build"
                  className={`flex flex-col items-center justify-center p-4 border rounded-lg cursor-pointer transition-all ${
                    isNewBuild 
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <RadioGroupItem value="new_build" id="new_build" className="sr-only" />
                  <Building2 className={`h-8 w-8 mb-2 ${isNewBuild ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`font-medium ${isNewBuild ? 'text-primary' : 'text-foreground'}`}>
                    New Build
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">House & land package</span>
                </Label>
              </RadioGroup>
              
              {isNewBuild && (
                <Badge variant="secondary" className="mt-2">
                  New Build: Land + Build prices will calculate total purchase price
                </Badge>
              )}
            </div>

            <Separator />

            {/* Property Value Section */}
            <div className="space-y-4">
              <Label className="text-base font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Property Value
              </Label>

              {isNewBuild ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="landPrice">Land Price ($)</Label>
                      <Input
                        id="landPrice"
                        type="number"
                        value={landPrice}
                        onChange={(e) => setLandPrice(e.target.value)}
                        placeholder="e.g., 350000"
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="buildPrice">Build Price ($)</Label>
                      <Input
                        id="buildPrice"
                        type="number"
                        value={buildPrice}
                        onChange={(e) => setBuildPrice(e.target.value)}
                        placeholder="e.g., 400000"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  
                  {/* Calculated Total */}
                  {(landPrice || buildPrice) && (
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Total Purchase Price:</span>
                      <span className="font-semibold text-foreground">
                        ${((parseFloat(landPrice) || 0) + (parseFloat(buildPrice) || 0)).toLocaleString()}
                      </span>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="agentFee">Agent Fee / Commission ($)</Label>
                    <Input
                      id="agentFee"
                      type="number"
                      value={agentFee}
                      onChange={(e) => setAgentFee(e.target.value)}
                      placeholder="e.g., 15000"
                      disabled={disabled}
                    />
                  </div>
                  
                  {/* Construction Duration for New Builds */}
                  <div className="space-y-2">
                    <Label htmlFor="constructionDurationMonths">Construction Duration (months)</Label>
                    <Input
                      id="constructionDurationMonths"
                      type="number"
                      value={constructionDurationMonths}
                      onChange={(e) => setConstructionDurationMonths(e.target.value)}
                      placeholder="e.g., 12"
                      disabled={disabled}
                    />
                  </div>
                  
                  {/* Construction Stage Percentages */}
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center justify-between w-full">
                      <Label className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                        <Building className="h-4 w-4" />
                        Construction Stage Payments
                      </Label>
                      <ChevronRight className="h-4 w-4" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Define payment percentages at each construction stage (should total 100%)
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="stageDepositPercent" className="text-xs">Deposit Stage (%)</Label>
                          <Input
                            id="stageDepositPercent"
                            type="number"
                            value={stageDepositPercent}
                            onChange={(e) => setStageDepositPercent(e.target.value)}
                            placeholder="5"
                            disabled={disabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="stageSlabPercent" className="text-xs">Slab/Base Stage (%)</Label>
                          <Input
                            id="stageSlabPercent"
                            type="number"
                            value={stageSlabPercent}
                            onChange={(e) => setStageSlabPercent(e.target.value)}
                            placeholder="15"
                            disabled={disabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="stageFramePercent" className="text-xs">Frame Stage (%)</Label>
                          <Input
                            id="stageFramePercent"
                            type="number"
                            value={stageFramePercent}
                            onChange={(e) => setStageFramePercent(e.target.value)}
                            placeholder="20"
                            disabled={disabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="stageLockupPercent" className="text-xs">Lock-up Stage (%)</Label>
                          <Input
                            id="stageLockupPercent"
                            type="number"
                            value={stageLockupPercent}
                            onChange={(e) => setStageLockupPercent(e.target.value)}
                            placeholder="25"
                            disabled={disabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="stageFixingPercent" className="text-xs">Fixing Stage (%)</Label>
                          <Input
                            id="stageFixingPercent"
                            type="number"
                            value={stageFixingPercent}
                            onChange={(e) => setStageFixingPercent(e.target.value)}
                            placeholder="20"
                            disabled={disabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="stageCompletionPercent" className="text-xs">Practical Completion (%)</Label>
                          <Input
                            id="stageCompletionPercent"
                            type="number"
                            value={stageCompletionPercent}
                            onChange={(e) => setStageCompletionPercent(e.target.value)}
                            placeholder="15"
                            disabled={disabled}
                          />
                        </div>
                      </div>
                      {(() => {
                        const total = 
                          (parseFloat(stageDepositPercent) || 0) +
                          (parseFloat(stageSlabPercent) || 0) +
                          (parseFloat(stageFramePercent) || 0) +
                          (parseFloat(stageLockupPercent) || 0) +
                          (parseFloat(stageFixingPercent) || 0) +
                          (parseFloat(stageCompletionPercent) || 0);
                        return (
                          <div className={`text-xs p-2 rounded ${total === 100 ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                            Total: {total}% {total !== 100 && '(should be 100%)'}
                          </div>
                        );
                      })()}
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="purchasePrice">Purchase Price ($)</Label>
                    <Input
                      id="purchasePrice"
                      type="number"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="e.g., 750000"
                      disabled={disabled}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="loanToValueRatio">Loan to Value Ratio (%)</Label>
                      <Input
                        id="loanToValueRatio"
                        type="number"
                        value={loanToValueRatio}
                        onChange={(e) => setLoanToValueRatio(e.target.value)}
                        placeholder="80"
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="depositValue" className="flex items-center gap-1">
                        Deposit Value ($)
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
                      <Input
                        id="depositValue"
                        type="number"
                        value={depositValue}
                        onChange={(e) => setDepositValue(e.target.value)}
                        placeholder="Auto-calculated"
                        className="bg-muted/30"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <Separator />

            {/* Loan Settings */}
            <Collapsible open={showLoanSettings} onOpenChange={setShowLoanSettings}>
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <Label className="text-base font-semibold flex items-center gap-2 cursor-pointer">
                  <Percent className="h-4 w-4" />
                  Loan & Growth Settings
                </Label>
                {showLoanSettings ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="interestRate">Interest Rate (%)</Label>
                    <Input
                      id="interestRate"
                      type="number"
                      step="0.01"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      placeholder="6.5"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capitalGrowth">Capital Growth (%)</Label>
                    <Input
                      id="capitalGrowth"
                      type="number"
                      step="0.1"
                      value={capitalGrowth}
                      onChange={(e) => setCapitalGrowth(e.target.value)}
                      placeholder="5"
                      disabled={disabled}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weeklyRent">Weekly Rent ($)</Label>
                  <Input
                    id="weeklyRent"
                    type="number"
                    value={weeklyRent}
                    onChange={(e) => setWeeklyRent(e.target.value)}
                    placeholder="e.g., 550"
                    disabled={disabled}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Acquisition Costs Section */}
            <Collapsible open={showAcquisitionCosts} onOpenChange={setShowAcquisitionCosts}>
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <Label className="text-base font-semibold flex items-center gap-2 cursor-pointer">
                  <DollarSign className="h-4 w-4" />
                  Acquisition Costs
                </Label>
                {showAcquisitionCosts ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                {/* First Home Buyer Toggle */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="isFirstHomeBuyer" className="text-sm font-medium cursor-pointer">
                      First Home Buyer
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      May qualify for stamp duty concessions or exemptions
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="isFirstHomeBuyer"
                    checked={isFirstHomeBuyer}
                    onChange={(e) => setIsFirstHomeBuyer(e.target.checked)}
                    disabled={disabled}
                    className="h-4 w-4 rounded border-input"
                  />
                </div>

                {/* Stamp Duty with Calculator */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="stampDuty">Stamp Duty ($)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowStampDutyCalculator(!showStampDutyCalculator)}
                      disabled={disabled}
                    >
                      <Calculator className="h-3 w-3 mr-1" />
                      {showStampDutyCalculator ? 'Hide' : 'Calculator'}
                    </Button>
                  </div>
                  <Input
                    id="stampDuty"
                    type="number"
                    value={stampDuty}
                    onChange={(e) => setStampDuty(e.target.value)}
                    placeholder="Use calculator or enter manually"
                    disabled={disabled}
                  />
                  {isFirstHomeBuyer && (
                    <p className="text-xs text-primary">
                      First Home Buyer concessions will be applied based on state
                    </p>
                  )}
                </div>

                {showStampDutyCalculator && (
                  <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{detectedState !== 'All' ? STATE_MAPPING[detectedState as keyof typeof STATE_MAPPING] : 'Select State'}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {propertyAddress ? 'Auto-detected from address' : 'Enter property address to auto-detect'}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={captureStampDuty}
                        disabled={disabled}
                      >
                        Apply Value
                      </Button>
                    </div>
                    <div id="stamp-duty-calculator" className="orange-theme min-h-[200px] bg-white rounded-lg p-4">
                      <div id="stamp-duty-anchors">
                        <p className="text-sm text-muted-foreground">
                          Stamp Duty Calculator from{' '}
                          <a 
                            href="https://calculatorsonline.com.au" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            calculatorsonline.com.au
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="solicitorFees">Solicitor / Conveyancing Fees ($)</Label>
                    <Input
                      id="solicitorFees"
                      type="number"
                      value={solicitorFees}
                      onChange={(e) => setSolicitorFees(e.target.value)}
                      placeholder="e.g., 1500"
                      disabled={disabled}
                    />
                  </div>
                  {isNewBuild && (
                    <div className="space-y-2">
                      <Label htmlFor="agentFee">Agent Fee / Commission ($)</Label>
                      <Input
                        id="agentFee"
                        type="number"
                        value={agentFee}
                        onChange={(e) => setAgentFee(e.target.value)}
                        placeholder="e.g., 15000"
                        disabled={disabled}
                      />
                    </div>
                  )}
                </div>

                {/* Acquisition Costs Summary */}
                {(() => {
                  const totalAcquisitionCosts = 
                    (parseFloat(stampDuty) || 0) +
                    (parseFloat(solicitorFees) || 0) +
                    (isNewBuild && agentFee ? parseFloat(agentFee) : 0);
                  
                  if (totalAcquisitionCosts <= 0) return null;
                  
                  return (
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Total Acquisition Costs:</span>
                      <span className="font-semibold text-foreground">
                        ${totalAcquisitionCosts.toLocaleString()}
                      </span>
                    </div>
                  );
                })()}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Annual Expenses */}
            <Collapsible open={showExpenses} onOpenChange={setShowExpenses}>
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <Label className="text-base font-semibold flex items-center gap-2 cursor-pointer">
                  <TrendingUp className="h-4 w-4" />
                  Annual Expenses
                </Label>
                {showExpenses ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                {/* Property Type Selection for Expense Estimation */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Property Type
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    {['house', 'apartment', 'townhouse', 'unit', 'villa'].map((type) => (
                      <Button
                        key={type}
                        type="button"
                        variant={propertyType === type ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPropertyType(type)}
                        disabled={disabled}
                        className="capitalize"
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* AI Expense Estimation Button */}
                <div className="border rounded-lg p-4 bg-primary/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">AI-Powered Expense Estimation</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={estimateExpenses}
                      disabled={disabled || isEstimatingExpenses}
                    >
                      {isEstimatingExpenses ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Estimating...
                        </>
                      ) : (
                        <>
                          <Calculator className="h-3 w-3 mr-1" />
                          Calculate Expenses
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Automatically estimates council rates, strata fees, insurance, and other expenses based on the property location and type.
                  </p>
                </div>

                {/* Body Corporate with Strata Breakdown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bodyCorporateFees" className="flex items-center gap-1">
                      Body Corporate / Strata ($)
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Total of Admin Fund + Sinking Fund + Special Levies</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowStrataBreakdown(!showStrataBreakdown)}
                      disabled={disabled}
                    >
                      <Building2 className="h-3 w-3 mr-1" />
                      {showStrataBreakdown ? 'Hide Breakdown' : 'Breakdown'}
                    </Button>
                  </div>
                  <Input
                    id="bodyCorporateFees"
                    type="number"
                    value={bodyCorporateFees}
                    onChange={(e) => setBodyCorporateFees(e.target.value)}
                    placeholder="e.g., 3000"
                    className={showStrataBreakdown ? 'bg-muted/30' : ''}
                    disabled={disabled || showStrataBreakdown}
                  />
                </div>

                {showStrataBreakdown && (
                  <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Strata Fee Breakdown</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="strataAdminFund" className="text-xs">Admin Fund ($)</Label>
                        <Input
                          id="strataAdminFund"
                          type="number"
                          value={strataAdminFund}
                          onChange={(e) => setStrataAdminFund(e.target.value)}
                          placeholder="e.g., 1800"
                          disabled={disabled}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="strataSinkingFund" className="text-xs">Sinking Fund ($)</Label>
                        <Input
                          id="strataSinkingFund"
                          type="number"
                          value={strataSinkingFund}
                          onChange={(e) => setStrataSinkingFund(e.target.value)}
                          placeholder="e.g., 900"
                          disabled={disabled}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="strataSpecialLevies" className="text-xs">Special Levies ($)</Label>
                        <Input
                          id="strataSpecialLevies"
                          type="number"
                          value={strataSpecialLevies}
                          onChange={(e) => setStrataSpecialLevies(e.target.value)}
                          placeholder="e.g., 300"
                          disabled={disabled}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    {(strataAdminFund || strataSinkingFund || strataSpecialLevies) && (
                      <div className="flex items-center gap-2 p-2 bg-background rounded border">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Total:</span>
                        <span className="text-sm font-semibold">
                          ${((parseFloat(strataAdminFund) || 0) + (parseFloat(strataSinkingFund) || 0) + (parseFloat(strataSpecialLevies) || 0)).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="landTax">Land Tax ($)</Label>
                    <Input
                      id="landTax"
                      type="number"
                      value={landTax}
                      onChange={(e) => setLandTax(e.target.value)}
                      placeholder="e.g., 2500"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="councilRates">Council Rates ($)</Label>
                    <Input
                      id="councilRates"
                      type="number"
                      value={councilRates}
                      onChange={(e) => setCouncilRates(e.target.value)}
                      placeholder="e.g., 2000"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="waterRates">Water Rates ($)</Label>
                    <Input
                      id="waterRates"
                      type="number"
                      value={waterRates}
                      onChange={(e) => setWaterRates(e.target.value)}
                      placeholder="e.g., 1200"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buildingLandlordInsurance">Building & Landlord Insurance ($)</Label>
                    <Input
                      id="buildingLandlordInsurance"
                      type="number"
                      value={buildingLandlordInsurance}
                      onChange={(e) => setBuildingLandlordInsurance(e.target.value)}
                      placeholder="e.g., 1800"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="propertyManagementFees">Property Management (%)</Label>
                    <Input
                      id="propertyManagementFees"
                      type="number"
                      step="0.1"
                      value={propertyManagementFees}
                      onChange={(e) => setPropertyManagementFees(e.target.value)}
                      placeholder="8"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="repairsMaintenance">Repairs & Maintenance ($)</Label>
                    <Input
                      id="repairsMaintenance"
                      type="number"
                      value={repairsMaintenance}
                      onChange={(e) => setRepairsMaintenance(e.target.value)}
                      placeholder="e.g., 2000"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lettingFees" className="flex items-center gap-1">
                      Letting Fees ($)
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Auto-set to weekly rent (1 week's rent)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="lettingFees"
                      type="number"
                      value={lettingFees}
                      onChange={(e) => setLettingFees(e.target.value)}
                      placeholder="= Weekly Rent"
                      className="bg-muted/30"
                      disabled={disabled}
                    />
                  </div>
                </div>

                {/* Annual Expenses Summary */}
                {(() => {
                  const annualRent = (parseFloat(weeklyRent) || 0) * 52;
                  const pmPercent = parseFloat(propertyManagementFees) || 8;
                  const pmDollar = Math.round(annualRent * (pmPercent / 100));
                  
                  const totalAnnualExpenses = 
                    (parseFloat(councilRates) || 0) +
                    (parseFloat(waterRates) || 0) +
                    (parseFloat(bodyCorporateFees) || 0) +
                    (parseFloat(buildingLandlordInsurance) || 0) +
                    pmDollar +
                    (parseFloat(repairsMaintenance) || 0) +
                    (parseFloat(landTax) || 0);
                  
                  if (totalAnnualExpenses <= 0) return null;
                  
                  return (
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Total Annual Expenses:</span>
                      <span className="font-semibold text-foreground">
                        ${totalAnnualExpenses.toLocaleString()}/year
                      </span>
                    </div>
                  );
                })()}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Cash Flow Analysis Overrides (Optional) */}
            <Collapsible open={showCashFlowOverrides} onOpenChange={setShowCashFlowOverrides}>
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold flex items-center gap-2 cursor-pointer">
                    <Calculator className="h-4 w-4" />
                    Cash Flow Analysis Overrides
                  </Label>
                  <Badge variant="outline" className="text-xs">Optional</Badge>
                </div>
                {showCashFlowOverrides ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground mb-4">
                  These optional values will cascade into the 10-year cash flow analysis if provided. Leave empty to use default calculations.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cpiGrowthRate" className="flex items-center gap-1">
                      CPI Growth Rate (%)
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Annual rate for rent and expense increases. Default: 3%</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="cpiGrowthRate"
                      type="number"
                      step="0.1"
                      value={cpiGrowthRate}
                      onChange={(e) => setCpiGrowthRate(e.target.value)}
                      placeholder="Default: 3%"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depreciation" className="flex items-center gap-1">
                      Annual Depreciation ($)
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Year 1 depreciation deduction for tax purposes</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="depreciation"
                      type="number"
                      value={depreciation}
                      onChange={(e) => setDepreciation(e.target.value)}
                      placeholder="e.g., 6000"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxRate" className="flex items-center gap-1">
                      Marginal Tax Rate (%)
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Your marginal tax rate for calculating tax refunds. Default: 30%</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="taxRate"
                      type="number"
                      step="0.5"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      placeholder="Default: 30%"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="occupancyRate" className="flex items-center gap-1">
                      Occupancy Rate (weeks/year)
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Expected weeks of tenancy per year. Default: 52 weeks</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="occupancyRate"
                      type="number"
                      max="52"
                      value={occupancyRate}
                      onChange={(e) => setOccupancyRate(e.target.value)}
                      placeholder="Default: 52"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loanType">Loan Type</Label>
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
                        P&I
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loanTermYears">Loan Term (years)</Label>
                    <Input
                      id="loanTermYears"
                      type="number"
                      value={loanTermYears}
                      onChange={(e) => setLoanTermYears(e.target.value)}
                      placeholder="Default: 30"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="marketValueNow" className="flex items-center gap-1">
                      Current Market Value ($)
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Year 0 value if different from purchase price (for existing properties)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="marketValueNow"
                      type="number"
                      value={marketValueNow}
                      onChange={(e) => setMarketValueNow(e.target.value)}
                      placeholder="Leave empty to use purchase price"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loanAmount" className="flex items-center gap-1">
                      Loan Amount ($)
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Override the calculated loan amount (Price × LVR)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="loanAmount"
                      type="number"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      placeholder="Auto-calculated from LVR"
                      disabled={disabled}
                    />
                  </div>
                </div>

                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground">Advanced Loan Settings</p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="interestOnlyPeriodYears">Interest Only Period (years)</Label>
                    <Input
                      id="interestOnlyPeriodYears"
                      type="number"
                      value={interestOnlyPeriodYears}
                      onChange={(e) => setInterestOnlyPeriodYears(e.target.value)}
                      placeholder="e.g., 5"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="repaymentFrequency">Repayment Frequency</Label>
                    <div className="flex gap-1">
                      {(['weekly', 'fortnightly', 'monthly'] as const).map((freq) => (
                        <Button
                          key={freq}
                          type="button"
                          variant={repaymentFrequency === freq ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setRepaymentFrequency(freq)}
                          disabled={disabled}
                          className="flex-1 capitalize text-xs"
                        >
                          {freq}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extraRepaymentPerMonth">Extra Repayment ($/month)</Label>
                    <Input
                      id="extraRepaymentPerMonth"
                      type="number"
                      value={extraRepaymentPerMonth}
                      onChange={(e) => setExtraRepaymentPerMonth(e.target.value)}
                      placeholder="e.g., 500"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="offsetBalance">Offset Account Balance ($)</Label>
                    <Input
                      id="offsetBalance"
                      type="number"
                      value={offsetBalance}
                      onChange={(e) => setOffsetBalance(e.target.value)}
                      placeholder="e.g., 20000"
                      disabled={disabled}
                    />
                  </div>
                </div>

                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground">Property Specifications</p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="landSizeSqm">Land Size (m²)</Label>
                    <Input
                      id="landSizeSqm"
                      type="number"
                      value={landSizeSqm}
                      onChange={(e) => setLandSizeSqm(e.target.value)}
                      placeholder="e.g., 450"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buildSizeSqm">Build Size (m²)</Label>
                    <Input
                      id="buildSizeSqm"
                      type="number"
                      value={buildSizeSqm}
                      onChange={(e) => setBuildSizeSqm(e.target.value)}
                      placeholder="e.g., 180"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="constructionYear">Construction Year</Label>
                    <Input
                      id="constructionYear"
                      type="number"
                      value={constructionYear}
                      onChange={(e) => setConstructionYear(e.target.value)}
                      placeholder="e.g., 2015"
                      disabled={disabled}
                    />
                  </div>
                  {isNewBuild && (
                    <div className="space-y-2">
                      <Label htmlFor="constructionDurationMonths">Construction Duration (months)</Label>
                      <Input
                        id="constructionDurationMonths"
                        type="number"
                        value={constructionDurationMonths}
                        onChange={(e) => setConstructionDurationMonths(e.target.value)}
                        placeholder="e.g., 12"
                        disabled={disabled}
                      />
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Final Calculated Summary */}
            {(() => {
              const annualRent = (parseFloat(weeklyRent) || 0) * (parseFloat(occupancyRate) || 52);
              const pmPercent = parseFloat(propertyManagementFees) || 8;
              const pmDollar = Math.round(annualRent * (pmPercent / 100));
              
              const totalAnnualExpenses = 
                (parseFloat(councilRates) || 0) +
                (parseFloat(waterRates) || 0) +
                (parseFloat(bodyCorporateFees) || 0) +
                (parseFloat(buildingLandlordInsurance) || 0) +
                pmDollar +
                (parseFloat(repairsMaintenance) || 0) +
                (parseFloat(landTax) || 0);
              
              const totalAcquisitionCosts = 
                (parseFloat(stampDuty) || 0) +
                (parseFloat(solicitorFees) || 0) +
                (isNewBuild && agentFee ? parseFloat(agentFee) : 0);

              const netOperatingIncome = annualRent - totalAnnualExpenses - (parseFloat(lettingFees) || 0);
              
              const hasAnyValue = annualRent > 0 || totalAnnualExpenses > 0 || totalAcquisitionCosts > 0;
              
              if (!hasAnyValue) return null;
              
              return (
                <>
                  <Separator />
                  <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Calculator className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Investment Summary</span>
                      <Badge variant="secondary" className="text-xs">Auto-calculated</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {annualRent > 0 && (
                        <div className="flex justify-between p-2 bg-background rounded border">
                          <span className="text-muted-foreground">Annual Rental Income:</span>
                          <span className="font-medium text-green-600 dark:text-green-400">${annualRent.toLocaleString()}</span>
                        </div>
                      )}
                      {pmDollar > 0 && (
                        <div className="flex justify-between p-2 bg-background rounded border">
                          <span className="text-muted-foreground">Property Mgmt ({pmPercent}%):</span>
                          <span className="font-medium">${pmDollar.toLocaleString()}</span>
                        </div>
                      )}
                      {totalAnnualExpenses > 0 && (
                        <div className="flex justify-between p-2 bg-background rounded border">
                          <span className="text-muted-foreground">Total Annual Expenses:</span>
                          <span className="font-semibold text-red-600 dark:text-red-400">${totalAnnualExpenses.toLocaleString()}</span>
                        </div>
                      )}
                      {totalAcquisitionCosts > 0 && (
                        <div className="flex justify-between p-2 bg-background rounded border">
                          <span className="text-muted-foreground">Total Acquisition Costs:</span>
                          <span className="font-semibold">${totalAcquisitionCosts.toLocaleString()}</span>
                        </div>
                      )}
                      {annualRent > 0 && totalAnnualExpenses > 0 && (
                        <div className={`col-span-2 flex justify-between p-3 rounded border ${netOperatingIncome >= 0 ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
                          <span className="font-medium">Net Operating Income:</span>
                          <span className={`font-bold text-lg ${netOperatingIncome >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                            ${netOperatingIncome.toLocaleString()}/year
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
