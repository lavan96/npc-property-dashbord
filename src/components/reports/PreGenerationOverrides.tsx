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
  ArrowRight
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
  stampDuty?: number;
  bodyCorporateFees?: number;
  landTax?: number;
  councilRates?: number;
  waterRates?: number;
  solicitorFees?: number;
  buildingLandlordInsurance?: number;
  propertyManagementFees?: number;
  repairsMaintenance?: number;
  lettingFees?: number;
  agentFee?: number;
}

interface PreGenerationOverridesProps {
  propertyAddress?: string;
  onDataChange: (data: PreGenerationData) => void;
  disabled?: boolean;
}

export function PreGenerationOverrides({ 
  propertyAddress = '', 
  onDataChange, 
  disabled = false 
}: PreGenerationOverridesProps) {
  const { toast } = useToast();
  
  // Build type selection
  const [buildType, setBuildType] = useState<'new_build' | 'existing_property'>('existing_property');
  
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
  const [landTax, setLandTax] = useState<string>('');
  const [councilRates, setCouncilRates] = useState<string>('');
  const [waterRates, setWaterRates] = useState<string>('');
  const [solicitorFees, setSolicitorFees] = useState<string>('');
  const [buildingLandlordInsurance, setBuildingLandlordInsurance] = useState<string>('');
  const [propertyManagementFees, setPropertyManagementFees] = useState<string>('8');
  const [repairsMaintenance, setRepairsMaintenance] = useState<string>('');
  const [lettingFees, setLettingFees] = useState<string>('');
  const [agentFee, setAgentFee] = useState<string>('');
  
  // Calculators visibility
  const [showStampDutyCalculator, setShowStampDutyCalculator] = useState(false);
  const [detectedState, setDetectedState] = useState<string>('All');
  
  // Collapsible sections
  const [showLoanSettings, setShowLoanSettings] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);

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

  // Load stamp duty calculator script
  useEffect(() => {
    if (showStampDutyCalculator) {
      const existingScript = document.getElementById('stamp-src-pregen');
      if (existingScript) {
        existingScript.remove();
      }
      
      const script = document.createElement('script');
      script.id = 'stamp-src-pregen';
      script.type = 'text/javascript';
      script.src = '//calculatorsonline.com.au/external/!main/stamp_duty.min.js';
      script.setAttribute('data-state', detectedState);
      document.body.appendChild(script);
    }
  }, [showStampDutyCalculator, detectedState]);

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
      landTax: landTax ? parseFloat(landTax) : undefined,
      councilRates: councilRates ? parseFloat(councilRates) : undefined,
      waterRates: waterRates ? parseFloat(waterRates) : undefined,
      solicitorFees: solicitorFees ? parseFloat(solicitorFees) : undefined,
      buildingLandlordInsurance: buildingLandlordInsurance ? parseFloat(buildingLandlordInsurance) : undefined,
      propertyManagementFees: propertyManagementFees ? parseFloat(propertyManagementFees) : undefined,
      repairsMaintenance: repairsMaintenance ? parseFloat(repairsMaintenance) : undefined,
      lettingFees: lettingFees ? parseFloat(lettingFees) : undefined,
      agentFee: buildType === 'new_build' && agentFee ? parseFloat(agentFee) : undefined,
    };
    
    onDataChange(data);
  }, [
    buildType, purchasePrice, landPrice, buildPrice, depositValue, 
    loanToValueRatio, interestRate, capitalGrowth, weeklyRent,
    stampDuty, bodyCorporateFees, landTax, councilRates, waterRates,
    solicitorFees, buildingLandlordInsurance, propertyManagementFees,
    repairsMaintenance, lettingFees, agentFee, onDataChange
  ]);

  // Capture stamp duty from calculator
  const captureStampDuty = useCallback(() => {
    const calcContainer = document.getElementById('stamp-duty-calculator-pregen');
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
                onValueChange={(value) => setBuildType(value as 'new_build' | 'existing_property')}
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
                    <div id="stamp-duty-calculator-pregen" className="min-h-[200px]">
                      <noscript>Enable JavaScript to use the stamp duty calculator</noscript>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bodyCorporateFees">Body Corporate / Strata ($)</Label>
                    <Input
                      id="bodyCorporateFees"
                      type="number"
                      value={bodyCorporateFees}
                      onChange={(e) => setBodyCorporateFees(e.target.value)}
                      placeholder="e.g., 3000"
                      disabled={disabled}
                    />
                  </div>
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
                    <Label htmlFor="solicitorFees">Solicitor Fees ($)</Label>
                    <Input
                      id="solicitorFees"
                      type="number"
                      value={solicitorFees}
                      onChange={(e) => setSolicitorFees(e.target.value)}
                      placeholder="e.g., 1500"
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
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
