import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ChevronDown,
  TrendingUp,
  Wallet,
  Clock,
  ShieldCheck,
  Receipt,
  Building,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────

export interface AdditionalStrategyState {
  incomeGrowthPercent: number;
  expenseReductionPercent: number;
  loanTermAdjustment: number; // years delta from base
  dtiCapEnabled: boolean;
  dtiCapValue: number;
  stampDutyPurchasePrice: number;
  portfolioSellPropertyIds: Set<string>;
  portfolioSellReinvest: boolean;
}

export const DEFAULT_ADDITIONAL_STRATEGY: AdditionalStrategyState = {
  incomeGrowthPercent: 0,
  expenseReductionPercent: 0,
  loanTermAdjustment: 0,
  dtiCapEnabled: false,
  dtiCapValue: 6,
  stampDutyPurchasePrice: 0,
  portfolioSellPropertyIds: new Set(),
  portfolioSellReinvest: false,
};

interface PropertyForSale {
  id: string;
  address: string;
  current_value: number;
  loan_remaining: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Simple Australian stamp duty estimate (NSW-based as default)
function estimateStampDuty(purchasePrice: number): number {
  if (purchasePrice <= 0) return 0;
  if (purchasePrice <= 14000) return purchasePrice * 0.0125;
  if (purchasePrice <= 32000) return 175 + (purchasePrice - 14000) * 0.015;
  if (purchasePrice <= 85000) return 445 + (purchasePrice - 32000) * 0.0175;
  if (purchasePrice <= 319000) return 1372.5 + (purchasePrice - 85000) * 0.035;
  if (purchasePrice <= 1064000) return 9562.5 + (purchasePrice - 319000) * 0.045;
  if (purchasePrice <= 3194000) return 43007.5 + (purchasePrice - 1064000) * 0.055;
  return 160187.5 + (purchasePrice - 3194000) * 0.07;
}

function estimateTransferFee(purchasePrice: number): number {
  if (purchasePrice <= 500000) return 500;
  if (purchasePrice <= 1000000) return 1000;
  return 1500;
}

// ── Component ──────────────────────────────────────────

interface AdditionalStrategyLeversProps {
  strategy: AdditionalStrategyState;
  onStrategyChange: (updates: Partial<AdditionalStrategyState>) => void;
  openSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
  baseLoanTermYears: number;
  properties: PropertyForSale[];
  baseGrossIncome: number;
}

export function AdditionalStrategyLevers({
  strategy,
  onStrategyChange,
  openSections,
  onToggleSection,
  baseLoanTermYears,
  properties,
  baseGrossIncome,
}: AdditionalStrategyLeversProps) {
  const stampDuty = estimateStampDuty(strategy.stampDutyPurchasePrice);
  const transferFee = estimateTransferFee(strategy.stampDutyPurchasePrice);
  const legalFees = strategy.stampDutyPurchasePrice > 0 ? 2500 : 0;
  const totalPurchaseCosts = stampDuty + transferFee + legalFees;

  const sellProperties = properties.filter(p => strategy.portfolioSellPropertyIds.has(p.id));
  const totalSellEquityFreed = sellProperties.reduce((sum, p) => 
    sum + Math.max(0, p.current_value - p.loan_remaining), 0);
  const totalSellValue = sellProperties.reduce((sum, p) => sum + p.current_value, 0);

  return (
    <>
      {/* ═══ LEVER 5: Income Growth Modeling ═══ */}
      <Card>
        <Collapsible open={openSections.incomeGrowth} onOpenChange={() => onToggleSection('incomeGrowth')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Income Growth Modeling
                </CardTitle>
                <div className="flex items-center gap-2">
                  {strategy.incomeGrowthPercent !== 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {strategy.incomeGrowthPercent >= 0 ? '+' : ''}{strategy.incomeGrowthPercent}%
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.incomeGrowth ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-muted-foreground">
                Model expected income changes — a raise, second income, or new rental stream.
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Income Adjustment</span>
                  <span className={`font-medium ${strategy.incomeGrowthPercent >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                    {strategy.incomeGrowthPercent >= 0 ? '+' : ''}{strategy.incomeGrowthPercent}%
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({formatCurrency(baseGrossIncome * (1 + strategy.incomeGrowthPercent / 100))}/yr)
                    </span>
                  </span>
                </div>
                <Slider
                  value={[strategy.incomeGrowthPercent]}
                  onValueChange={([val]) => onStrategyChange({ incomeGrowthPercent: val })}
                  min={-30}
                  max={50}
                  step={5}
                  className="py-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>-30%</span>
                  <span>+50%</span>
                </div>
              </div>
              <div className="flex gap-2">
                {[5, 10, 15, 20, 30].map(val => (
                  <button
                    key={val}
                    onClick={() => onStrategyChange({ incomeGrowthPercent: val })}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      strategy.incomeGrowthPercent === val
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                    }`}
                  >
                    +{val}%
                  </button>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ LEVER 6: Expense Reduction ═══ */}
      <Card>
        <Collapsible open={openSections.expenseReduction} onOpenChange={() => onToggleSection('expenseReduction')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  Expense Reduction
                </CardTitle>
                <div className="flex items-center gap-2">
                  {strategy.expenseReductionPercent !== 0 && (
                    <Badge variant="secondary" className="text-xs">
                      -{strategy.expenseReductionPercent}%
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.expenseReduction ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-muted-foreground">
                Model lifestyle changes or reduced spending to improve surplus income.
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Living Expense Reduction</span>
                  <span className={`font-medium ${strategy.expenseReductionPercent > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {strategy.expenseReductionPercent > 0 ? `-${strategy.expenseReductionPercent}%` : 'No change'}
                  </span>
                </div>
                <Slider
                  value={[strategy.expenseReductionPercent]}
                  onValueChange={([val]) => onStrategyChange({ expenseReductionPercent: val })}
                  min={0}
                  max={40}
                  step={5}
                  className="py-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span>-40%</span>
                </div>
              </div>
              <div className="flex gap-2">
                {[5, 10, 15, 20, 30].map(val => (
                  <button
                    key={val}
                    onClick={() => onStrategyChange({ expenseReductionPercent: val })}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      strategy.expenseReductionPercent === val
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                    }`}
                  >
                    -{val}%
                  </button>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ LEVER 7: Loan Term Extension/Reduction ═══ */}
      <Card>
        <Collapsible open={openSections.loanTerm} onOpenChange={() => onToggleSection('loanTerm')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Loan Term Adjustment
                </CardTitle>
                <div className="flex items-center gap-2">
                  {strategy.loanTermAdjustment !== 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {strategy.loanTermAdjustment > 0 ? '+' : ''}{strategy.loanTermAdjustment} yrs
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.loanTerm ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-muted-foreground">
                See how extending or shortening the loan term affects capacity. Longer terms reduce monthly repayments but increase total interest.
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Base: {baseLoanTermYears}yr → Scenario: {baseLoanTermYears + strategy.loanTermAdjustment}yr
                  </span>
                  <span className={`font-medium ${strategy.loanTermAdjustment > 0 ? 'text-emerald-600' : strategy.loanTermAdjustment < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {strategy.loanTermAdjustment > 0 ? '+' : ''}{strategy.loanTermAdjustment} years
                  </span>
                </div>
                <Slider
                  value={[strategy.loanTermAdjustment]}
                  onValueChange={([val]) => onStrategyChange({ loanTermAdjustment: val })}
                  min={-10}
                  max={10}
                  step={1}
                  className="py-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{baseLoanTermYears - 10}yr</span>
                  <span>{baseLoanTermYears + 10}yr</span>
                </div>
              </div>
              <div className="flex gap-2">
                {[-5, -2, 0, 2, 5].map(delta => (
                  <button
                    key={delta}
                    onClick={() => onStrategyChange({ loanTermAdjustment: delta })}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      strategy.loanTermAdjustment === delta
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                    }`}
                  >
                    {delta > 0 ? '+' : ''}{delta}yr
                  </button>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ LEVER 8: DTI Cap Toggle ═══ */}
      <Card>
        <Collapsible open={openSections.dtiCap} onOpenChange={() => onToggleSection('dtiCap')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  DTI Cap Override
                </CardTitle>
                <div className="flex items-center gap-2">
                  {strategy.dtiCapEnabled && (
                    <Badge variant="secondary" className="text-xs">
                      {strategy.dtiCapValue}x cap
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.dtiCap ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-muted-foreground">
                Toggle Debt-to-Income ratio caps to see how regulatory limits affect your maximum borrowing.
              </p>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Apply DTI Cap</Label>
                <Switch
                  checked={strategy.dtiCapEnabled}
                  onCheckedChange={(checked) => onStrategyChange({ dtiCapEnabled: checked })}
                />
              </div>
              {strategy.dtiCapEnabled && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">DTI Ratio Limit</span>
                    <span className="font-medium">{strategy.dtiCapValue}x</span>
                  </div>
                  <Slider
                    value={[strategy.dtiCapValue]}
                    onValueChange={([val]) => onStrategyChange({ dtiCapValue: val })}
                    min={4}
                    max={9}
                    step={0.5}
                    className="py-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>4x (strict)</span>
                    <span>9x (relaxed)</span>
                  </div>
                  <div className="flex gap-2">
                    {[5, 6, 7, 8].map(val => (
                      <button
                        key={val}
                        onClick={() => onStrategyChange({ dtiCapValue: val })}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                          strategy.dtiCapValue === val
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                        }`}
                      >
                        {val}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ LEVER 9: Stamp Duty & Purchase Cost Estimator ═══ */}
      <Card>
        <Collapsible open={openSections.stampDuty} onOpenChange={() => onToggleSection('stampDuty')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  Stamp Duty & Purchase Costs
                </CardTitle>
                <div className="flex items-center gap-2">
                  {totalPurchaseCosts > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {formatCurrency(totalPurchaseCosts)}
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.stampDuty ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-muted-foreground">
                Estimate the total out-of-pocket costs for a proposed purchase (NSW rates as default estimate).
              </p>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Purchase Price</Label>
                <Input
                  type="number"
                  placeholder="e.g. 650000"
                  value={strategy.stampDutyPurchasePrice || ''}
                  onChange={(e) => onStrategyChange({ stampDutyPurchasePrice: Number(e.target.value) || 0 })}
                  className="text-sm"
                />
              </div>
              {strategy.stampDutyPurchasePrice > 0 && (
                <div className="p-4 rounded-lg border bg-card space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Estimated Purchase Costs
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stamp Duty (est.)</span>
                      <span>{formatCurrency(stampDuty)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Transfer Fee (est.)</span>
                      <span>{formatCurrency(transferFee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Legal/Conveyancing (est.)</span>
                      <span>{formatCurrency(legalFees)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total Upfront Costs</span>
                      <span className="text-destructive">{formatCurrency(totalPurchaseCosts)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>As % of Purchase Price</span>
                      <span>{((totalPurchaseCosts / strategy.stampDutyPurchasePrice) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ LEVER 10: Multi-Property Portfolio Play ═══ */}
      <Card>
        <Collapsible open={openSections.portfolioPlay} onOpenChange={() => onToggleSection('portfolioPlay')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" />
                  Portfolio Restructure (Sell to Buy)
                </CardTitle>
                <div className="flex items-center gap-2">
                  {sellProperty && (
                    <Badge variant="secondary" className="text-xs">
                      {formatCurrency(sellEquityFreed)} freed
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.portfolioPlay ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-muted-foreground">
                Model selling one property to fund the purchase of another. Removes loan servicing and frees equity.
              </p>
              {properties.filter(p => p.current_value > 0).length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">No properties available.</p>
              ) : (
                <div className="space-y-2">
                  {properties.filter(p => p.current_value > 0).map(prop => {
                    const equity = prop.current_value - prop.loan_remaining;
                    const isSelected = strategy.portfolioSellPropertyId === prop.id;
                    return (
                      <div
                        key={prop.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10 border-primary/30' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => onStrategyChange({
                          portfolioSellPropertyId: isSelected ? null : prop.id,
                        })}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={isSelected}
                              onCheckedChange={() => onStrategyChange({
                                portfolioSellPropertyId: isSelected ? null : prop.id,
                              })}
                            />
                            <div>
                              <p className="text-sm font-medium">{prop.address?.slice(0, 35) || 'Property'}</p>
                              <p className="text-xs text-muted-foreground">
                                Value: {formatCurrency(prop.current_value)} · Loan: {formatCurrency(prop.loan_remaining)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-semibold ${equity >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                              {formatCurrency(equity)}
                            </p>
                            <p className="text-xs text-muted-foreground">equity</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {sellProperty && (
                <div className="p-4 rounded-lg border bg-card space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Sale Impact Summary
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sale Price (est.)</span>
                      <span>{formatCurrency(sellProperty.current_value)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Loan Discharged</span>
                      <span className="text-emerald-600">-{formatCurrency(sellProperty.loan_remaining)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agent Fees (est. 2%)</span>
                      <span>-{formatCurrency(sellProperty.current_value * 0.02)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold text-emerald-600">
                      <span>Net Proceeds (est.)</span>
                      <span>{formatCurrency(Math.max(0, sellEquityFreed - sellProperty.current_value * 0.02))}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </>
  );
}
