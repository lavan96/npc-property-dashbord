import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Minus,
  RotateCcw,
  CreditCard,
  ArrowRightLeft,
  Building2,
  Percent,
  ChevronDown,
  Zap,
  CheckCircle2,
  Save,
  FolderOpen,
  Trash2,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  calculateBorrowingCapacity,
  formatCapacity,
  getServiceabilityBandColor,
  type BorrowingCapacityInput,
  type BorrowingCapacityResult,
} from '@/utils/borrowingCapacityCalculations';
import {
  estimateLMI,
  calculateLVR,
} from '@/utils/lmiCalculations';
import {
  AdditionalStrategyLevers,
  DEFAULT_ADDITIONAL_STRATEGY,
  type AdditionalStrategyState,
} from './AdditionalStrategyLevers';

// ── Types ──────────────────────────────────────────────

export interface LiabilityItem {
  id: string;
  type: string;
  label: string;
  balance: number;
  limit?: number;
  monthlyServicing: number;
  calculationNote?: string;
}

export interface PropertyItem {
  id: string;
  address: string;
  property_type: string;
  current_value: number;
  loan_remaining: number;
  monthly_interest_repayment: number;
  loan_repayment_amount?: number;
  net_monthly_cashflow?: number;
}

interface StrategyState {
  consolidatedLiabilities: Set<string>;
  refinancedToIO: Set<string>;
  equityReleaseEnabled: boolean;
  equityReleasePropertyId: string | null;
  equityReleaseTargetLVR: number;
  rateAdjustment: number;
  additional: AdditionalStrategyState;
}

const DEFAULT_STRATEGY: StrategyState = {
  consolidatedLiabilities: new Set(),
  refinancedToIO: new Set(),
  equityReleaseEnabled: false,
  equityReleasePropertyId: null,
  equityReleaseTargetLVR: 0.80,
  rateAdjustment: 0,
  additional: { ...DEFAULT_ADDITIONAL_STRATEGY },
};

// ── Scenario Preset Types ──────────────────────────────

export interface ScenarioPreset {
  id: string;
  name: string;
  isBase: boolean; // true = auto-saved base, cannot be deleted
  createdAt: string;
  adjustedInputs: BorrowingCapacityInput;
  result: BorrowingCapacityResult;
}

interface StrategyScenarioModelingProps {
  baseInputs: BorrowingCapacityInput;
  baseResult: BorrowingCapacityResult;
  liabilities: LiabilityItem[];
  properties: PropertyItem[];
  onApplyScenario?: (inputs: BorrowingCapacityInput) => void;
  savedPresets?: ScenarioPreset[];
  onPresetsChange?: (presets: ScenarioPreset[]) => void;
}

// ── Helpers ────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function calculateIORepayment(loanBalance: number, annualRate: number): number {
  return (loanBalance * (annualRate / 100)) / 12;
}

function calculatePIRepayment(loanBalance: number, annualRate: number, termYears: number): number {
  const monthlyRate = annualRate / 100 / 12;
  const periods = termYears * 12;
  if (monthlyRate === 0) return loanBalance / periods;
  return loanBalance * (monthlyRate * Math.pow(1 + monthlyRate, periods)) /
    (Math.pow(1 + monthlyRate, periods) - 1);
}

// ── Component ──────────────────────────────────────────

export function StrategyScenarioModeling({
  baseInputs,
  baseResult,
  liabilities,
  properties,
  onApplyScenario,
  savedPresets: externalPresets,
  onPresetsChange,
}: StrategyScenarioModelingProps) {
  const [strategy, setStrategy] = useState<StrategyState>(DEFAULT_STRATEGY);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    consolidation: true,
    refinance: true,
    equity: false,
    rates: false,
    incomeGrowth: false,
    expenseReduction: false,
    loanTerm: false,
    dtiCap: false,
    stampDuty: false,
    portfolioPlay: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const consolidatableDebts = useMemo(() =>
    liabilities.filter(l =>
      !l.id.startsWith('prop-') &&
      l.type !== 'home_loan' &&
      l.type !== 'investment_loan' &&
      l.type !== 'rent_expense'
    ), [liabilities]);

  const investmentProperties = useMemo(() =>
    properties.filter(p =>
      p.property_type !== 'rental' &&
      p.property_type !== 'owner_occupied' &&
      p.loan_remaining > 0
    ), [properties]);

  // Fixed: show all non-rental properties with current_value > 0 for equity release
  const equityReleaseProperties = useMemo(() =>
    properties.filter(p => {
      if (p.property_type === 'rental') return false;
      return p.current_value > 0;
    }), [properties]);

  // ── Compute scenario result ──

  const { scenarioResult, impactBreakdown } = useMemo(() => {
    let adjustedCommitments = baseInputs.monthlyCommitments;
    let adjustedGrossIncome = baseInputs.grossAnnualIncome;
    let adjustedShadedIncome = baseInputs.shadedAnnualIncome;
    let adjustedExpenses = baseInputs.monthlyLivingExpenses;
    let adjustedLoanTerm = baseInputs.loanTermYears;
    const impacts: { label: string; monthlySaving: number; type: 'saving' | 'cost' | 'info' }[] = [];

    // 1. Debt Consolidation
    let consolidationSaving = 0;
    strategy.consolidatedLiabilities.forEach(id => {
      const liability = consolidatableDebts.find(l => l.id === id);
      if (liability) consolidationSaving += liability.monthlyServicing;
    });
    if (consolidationSaving > 0) {
      adjustedCommitments -= consolidationSaving;
      impacts.push({
        label: `Consolidate ${strategy.consolidatedLiabilities.size} debt(s)`,
        monthlySaving: consolidationSaving,
        type: 'saving',
      });
    }

    // 2. Refinance P&I → IO
    let refinanceSaving = 0;
    strategy.refinancedToIO.forEach(propId => {
      const prop = investmentProperties.find(p => p.id === propId);
      if (prop) {
        const currentRepayment = prop.monthly_interest_repayment ||
          calculatePIRepayment(prop.loan_remaining, baseInputs.interestRate, baseInputs.loanTermYears);
        const ioRepayment = calculateIORepayment(prop.loan_remaining, baseInputs.interestRate);
        const saving = Math.max(0, currentRepayment - ioRepayment);
        if (saving > 0) refinanceSaving += saving;
      }
    });
    if (refinanceSaving > 0) {
      adjustedCommitments -= refinanceSaving;
      impacts.push({
        label: `Refinance ${strategy.refinancedToIO.size} loan(s) to IO`,
        monthlySaving: refinanceSaving,
        type: 'saving',
      });
    }

    // 3. Portfolio Sell — remove loan servicing for sold property
    if (strategy.additional.portfolioSellPropertyId) {
      const soldProp = properties.find(p => p.id === strategy.additional.portfolioSellPropertyId);
      if (soldProp) {
        const loanServicing = soldProp.loan_repayment_amount || soldProp.monthly_interest_repayment || 0;
        if (loanServicing > 0) {
          adjustedCommitments -= loanServicing;
          impacts.push({
            label: `Sell property (remove loan servicing)`,
            monthlySaving: loanServicing,
            type: 'saving',
          });
        }
        // If property had negative cashflow, removing it helps
        if (soldProp.net_monthly_cashflow && soldProp.net_monthly_cashflow < 0) {
          const negativeCF = Math.abs(soldProp.net_monthly_cashflow);
          // The negative cashflow was already counted as a commitment, removing it above covers this
        }
      }
    }

    // 4. Income Growth
    if (strategy.additional.incomeGrowthPercent !== 0) {
      const growthFactor = 1 + strategy.additional.incomeGrowthPercent / 100;
      const incomeDelta = adjustedGrossIncome * (growthFactor - 1);
      adjustedGrossIncome *= growthFactor;
      adjustedShadedIncome *= growthFactor;
      impacts.push({
        label: `Income ${strategy.additional.incomeGrowthPercent > 0 ? 'growth' : 'reduction'} (${strategy.additional.incomeGrowthPercent > 0 ? '+' : ''}${strategy.additional.incomeGrowthPercent}%)`,
        monthlySaving: Math.abs(incomeDelta / 12),
        type: strategy.additional.incomeGrowthPercent > 0 ? 'saving' : 'cost',
      });
    }

    // 5. Expense Reduction
    if (strategy.additional.expenseReductionPercent > 0) {
      const expenseSaving = adjustedExpenses * (strategy.additional.expenseReductionPercent / 100);
      adjustedExpenses -= expenseSaving;
      impacts.push({
        label: `Reduce expenses by ${strategy.additional.expenseReductionPercent}%`,
        monthlySaving: expenseSaving,
        type: 'saving',
      });
    }

    // 6. Loan Term Adjustment
    if (strategy.additional.loanTermAdjustment !== 0) {
      adjustedLoanTerm = Math.max(5, baseInputs.loanTermYears + strategy.additional.loanTermAdjustment);
      impacts.push({
        label: `Loan term ${strategy.additional.loanTermAdjustment > 0 ? 'extended' : 'shortened'} to ${adjustedLoanTerm}yr`,
        monthlySaving: 0,
        type: 'info',
      });
    }

    // 7. Rate Adjustment
    const adjustedRate = Math.max(0.5, baseInputs.interestRate + strategy.rateAdjustment);

    // Ensure commitments don't go negative
    adjustedCommitments = Math.max(0, adjustedCommitments);
    adjustedExpenses = Math.max(0, adjustedExpenses);

    const scenarioInputs: BorrowingCapacityInput = {
      ...baseInputs,
      grossAnnualIncome: adjustedGrossIncome,
      shadedAnnualIncome: adjustedShadedIncome,
      monthlyLivingExpenses: adjustedExpenses,
      monthlyCommitments: adjustedCommitments,
      interestRate: adjustedRate,
      loanTermYears: adjustedLoanTerm,
    };

    const result = calculateBorrowingCapacity(scenarioInputs);
    return { scenarioResult: result, impactBreakdown: impacts };
  }, [strategy, baseInputs, consolidatableDebts, investmentProperties, properties]);

  // Equity release calculation
  const equityRelease = useMemo(() => {
    if (!strategy.equityReleaseEnabled || !strategy.equityReleasePropertyId) return null;
    const prop = equityReleaseProperties.find(p => p.id === strategy.equityReleasePropertyId);
    if (!prop) return null;
    const maxLoan = prop.current_value * strategy.equityReleaseTargetLVR;
    const grossAccessibleEquity = Math.max(0, maxLoan - prop.loan_remaining);
    const currentLVR = prop.current_value > 0 ? (prop.loan_remaining / prop.current_value) * 100 : 0;
    const currentEquity = prop.current_value - prop.loan_remaining;
    const targetLVRPercent = strategy.equityReleaseTargetLVR * 100;

    // Calculate LMI if target LVR > 80%
    let lmiEstimate = null;
    let lmiAmount = 0;
    if (targetLVRPercent > 80 && grossAccessibleEquity > 0) {
      const newLoanAmount = maxLoan; // total loan after equity release
      lmiEstimate = estimateLMI({
        propertyValue: prop.current_value,
        depositAmount: prop.current_value - newLoanAmount,
        loanAmount: newLoanAmount,
        isFirstHomeBuyer: false,
      });
      lmiAmount = lmiEstimate.lmiAmount;
    }

    const accessibleEquity = Math.max(0, grossAccessibleEquity - lmiAmount);

    return {
      property: prop,
      currentLVR,
      currentEquity,
      targetLVR: targetLVRPercent,
      grossAccessibleEquity,
      accessibleEquity,
      maxLoan,
      lmiEstimate,
      lmiAmount,
    };
  }, [strategy.equityReleaseEnabled, strategy.equityReleasePropertyId, strategy.equityReleaseTargetLVR, equityReleaseProperties]);

  const capacityChange = scenarioResult.borrowingCapacity - baseResult.borrowingCapacity;
  const surplusChange = scenarioResult.monthlySurplus - baseResult.monthlySurplus;
  const totalMonthlySaving = impactBreakdown.reduce((sum, i) =>
    sum + (i.type === 'saving' ? i.monthlySaving : i.type === 'cost' ? -i.monthlySaving : 0), 0);

  const hasAnyStrategy = strategy.consolidatedLiabilities.size > 0 ||
    strategy.refinancedToIO.size > 0 ||
    strategy.equityReleaseEnabled ||
    strategy.rateAdjustment !== 0 ||
    strategy.additional.incomeGrowthPercent !== 0 ||
    strategy.additional.expenseReductionPercent !== 0 ||
    strategy.additional.loanTermAdjustment !== 0 ||
    strategy.additional.dtiCapEnabled ||
    strategy.additional.portfolioSellPropertyId !== null;

  const handleReset = useCallback(() => {
    setStrategy({
      ...DEFAULT_STRATEGY,
      consolidatedLiabilities: new Set(),
      refinancedToIO: new Set(),
      additional: { ...DEFAULT_ADDITIONAL_STRATEGY },
    });
  }, []);

  const toggleConsolidation = (id: string) => {
    setStrategy(prev => {
      const next = new Set(prev.consolidatedLiabilities);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, consolidatedLiabilities: next };
    });
  };

  const toggleRefinance = (id: string) => {
    setStrategy(prev => {
      const next = new Set(prev.refinancedToIO);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, refinancedToIO: next };
    });
  };

  const handleAdditionalChange = useCallback((updates: Partial<AdditionalStrategyState>) => {
    setStrategy(prev => ({
      ...prev,
      additional: { ...prev.additional, ...updates },
    }));
  }, []);

  const baseBand = getServiceabilityBandColor(baseResult.serviceabilityBand);
  const scenarioBand = getServiceabilityBandColor(scenarioResult.serviceabilityBand);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          Strategy Scenario Builder
        </h2>
        <Button variant="ghost" size="sm" onClick={handleReset} disabled={!hasAnyStrategy}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      </div>

      {/* ═══ LEVER 1: Debt Consolidation ═══ */}
      <Card>
        <Collapsible open={openSections.consolidation} onOpenChange={() => toggleSection('consolidation')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Debt Consolidation
                </CardTitle>
                <div className="flex items-center gap-2">
                  {strategy.consolidatedLiabilities.size > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {strategy.consolidatedLiabilities.size} selected
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.consolidation ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <p className="text-xs text-muted-foreground">
                Select debts to consolidate or pay off. Their monthly servicing will be removed from commitments.
              </p>
              {consolidatableDebts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">No consolidatable debts found.</p>
              ) : (
                <div className="space-y-2">
                  {consolidatableDebts.map(debt => (
                    <div
                      key={debt.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        strategy.consolidatedLiabilities.has(debt.id)
                          ? 'bg-primary/10 border-primary/30'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => toggleConsolidation(debt.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={strategy.consolidatedLiabilities.has(debt.id)}
                          onCheckedChange={() => toggleConsolidation(debt.id)}
                        />
                        <div>
                          <p className="text-sm font-medium">{debt.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Balance: {formatCurrency(debt.balance)}
                            {debt.calculationNote && ` · ${debt.calculationNote}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-destructive">
                          -{formatCurrency(debt.monthlyServicing)}/mo
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {consolidatableDebts.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    const allIds = new Set(consolidatableDebts.map(d => d.id));
                    setStrategy(prev => ({ ...prev, consolidatedLiabilities: allIds }));
                  }}
                >
                  Select All ({consolidatableDebts.length})
                </Button>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ LEVER 2: Refinance P&I → IO ═══ */}
      <Card>
        <Collapsible open={openSections.refinance} onOpenChange={() => toggleSection('refinance')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-primary" />
                  Refinance P&I → Interest Only
                </CardTitle>
                <div className="flex items-center gap-2">
                  {strategy.refinancedToIO.size > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {strategy.refinancedToIO.size} loan(s)
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.refinance ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <p className="text-xs text-muted-foreground">
                Switch investment loans from Principal & Interest to Interest Only to free up cash flow.
              </p>
              {investmentProperties.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">No investment property loans found.</p>
              ) : (
                <div className="space-y-2">
                  {investmentProperties.map(prop => {
                    const currentRepayment = prop.monthly_interest_repayment ||
                      calculatePIRepayment(prop.loan_remaining, baseInputs.interestRate, baseInputs.loanTermYears);
                    const ioRepayment = calculateIORepayment(prop.loan_remaining, baseInputs.interestRate);
                    const saving = Math.max(0, currentRepayment - ioRepayment);
                    const isSelected = strategy.refinancedToIO.has(prop.id);

                    return (
                      <div
                        key={prop.id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10 border-primary/30' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => toggleRefinance(prop.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={isSelected}
                            onCheckedChange={() => toggleRefinance(prop.id)}
                          />
                          <div>
                            <p className="text-sm font-medium">{prop.address?.slice(0, 35) || 'Investment Property'}</p>
                            <p className="text-xs text-muted-foreground">
                              Loan: {formatCurrency(prop.loan_remaining)} · P&I: {formatCurrency(currentRepayment)}/mo
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">IO: {formatCurrency(ioRepayment)}/mo</p>
                          <p className="text-sm font-semibold text-emerald-600">
                            Save {formatCurrency(saving)}/mo
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ LEVER 3: Equity Release ═══ */}
      <Card>
        <Collapsible open={openSections.equity} onOpenChange={() => toggleSection('equity')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Equity Release
                </CardTitle>
                <div className="flex items-center gap-2">
                  {equityRelease && (
                    <Badge variant="secondary" className="text-xs">
                      {formatCurrency(equityRelease.accessibleEquity)}
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.equity ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-muted-foreground">
                Explore accessing equity from an existing property to fund a deposit on the next purchase.
              </p>

              <div className="flex items-center justify-between">
                <Label className="text-sm">Enable Equity Release</Label>
                <Switch
                  checked={strategy.equityReleaseEnabled}
                  onCheckedChange={(checked) =>
                    setStrategy(prev => ({
                      ...prev,
                      equityReleaseEnabled: checked,
                      equityReleasePropertyId: checked && equityReleaseProperties.length > 0
                        ? equityReleaseProperties[0].id : null,
                    }))
                  }
                />
              </div>

              {/* Property equity overview */}
              {strategy.equityReleaseEnabled && equityReleaseProperties.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Portfolio Equity Overview</Label>
                  <div className="space-y-1.5">
                    {equityReleaseProperties.map(prop => {
                      const equity = prop.current_value - prop.loan_remaining;
                      const lvr = prop.current_value > 0 ? (prop.loan_remaining / prop.current_value) * 100 : 0;
                      const isSelected = strategy.equityReleasePropertyId === prop.id;
                      return (
                        <div
                          key={prop.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/10 border-primary/30' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => setStrategy(prev => ({ ...prev, equityReleasePropertyId: prop.id }))}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{prop.address?.slice(0, 35) || 'Property'}</p>
                              <p className="text-xs text-muted-foreground">
                                Value: {formatCurrency(prop.current_value)} · Loan: {formatCurrency(prop.loan_remaining)} · LVR: {lvr.toFixed(0)}%
                              </p>
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
                </div>
              )}

              {strategy.equityReleaseEnabled && equityReleaseProperties.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2">
                  No properties with recorded values found in the client's portfolio.
                </p>
              )}

              {strategy.equityReleaseEnabled && strategy.equityReleasePropertyId && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Target LVR</Label>
                    <div className="flex gap-2">
                      {[0.70, 0.80, 0.90].map(lvr => (
                        <button
                          key={lvr}
                          onClick={() => setStrategy(prev => ({ ...prev, equityReleaseTargetLVR: lvr }))}
                          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                            strategy.equityReleaseTargetLVR === lvr
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                          }`}
                        >
                          {(lvr * 100).toFixed(0)}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {equityRelease && (
                    <div className="p-4 rounded-lg border bg-card space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Equity Release Summary
                      </p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Property Value</span>
                          <span>{formatCurrency(equityRelease.property.current_value)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Loan</span>
                          <span>{formatCurrency(equityRelease.property.loan_remaining)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Equity</span>
                          <span className={`font-medium ${equityRelease.currentEquity >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            {formatCurrency(equityRelease.currentEquity)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current LVR</span>
                          <span>{equityRelease.currentLVR.toFixed(1)}%</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max Loan at {equityRelease.targetLVR}% LVR</span>
                          <span>{formatCurrency(equityRelease.maxLoan)}</span>
                        </div>
                        {equityRelease.lmiAmount > 0 && (
                          <>
                            <div className="flex justify-between text-amber-600">
                              <span>Gross Accessible Equity</span>
                              <span>{formatCurrency(equityRelease.grossAccessibleEquity)}</span>
                            </div>
                            <div className="flex justify-between text-destructive">
                              <span>Less: Est. LMI ({equityRelease.lmiEstimate?.estimatedRate.toFixed(2)}%)</span>
                              <span>-{formatCurrency(equityRelease.lmiAmount)}</span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between font-semibold text-emerald-600">
                          <span>Net Accessible Equity</span>
                          <span>{formatCurrency(equityRelease.accessibleEquity)}</span>
                        </div>
                        {equityRelease.lmiAmount > 0 && (
                          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 mt-1">
                            ⚠ LVR of {equityRelease.targetLVR}% triggers LMI of {formatCurrency(equityRelease.lmiAmount)}, reducing usable equity by the same amount.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ LEVER 4: Interest Rate Adjustment ═══ */}
      <Card>
        <Collapsible open={openSections.rates} onOpenChange={() => toggleSection('rates')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Percent className="h-4 w-4 text-primary" />
                  Interest Rate Adjustment
                </CardTitle>
                <div className="flex items-center gap-2">
                  {strategy.rateAdjustment !== 0 && (
                    <Badge variant={strategy.rateAdjustment < 0 ? 'default' : 'destructive'} className="text-xs">
                      {strategy.rateAdjustment >= 0 ? '+' : ''}{strategy.rateAdjustment.toFixed(2)}%
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.rates ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-muted-foreground">
                Model how interest rate changes affect borrowing capacity.
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Base: {baseInputs.interestRate.toFixed(2)}% → Scenario: {(baseInputs.interestRate + strategy.rateAdjustment).toFixed(2)}%
                  </span>
                  <span className={`font-medium ${strategy.rateAdjustment <= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                    {strategy.rateAdjustment >= 0 ? '+' : ''}{strategy.rateAdjustment.toFixed(2)}%
                  </span>
                </div>
                <Slider
                  value={[strategy.rateAdjustment]}
                  onValueChange={([val]) => setStrategy(prev => ({ ...prev, rateAdjustment: val }))}
                  min={-2}
                  max={3}
                  step={0.25}
                  className="py-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>-2%</span>
                  <span>+3%</span>
                </div>
              </div>
              <div className="flex gap-2">
                {[-1, -0.5, 0, 0.5, 1, 2].map(delta => (
                  <button
                    key={delta}
                    onClick={() => setStrategy(prev => ({ ...prev, rateAdjustment: delta }))}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      strategy.rateAdjustment === delta
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                    }`}
                  >
                    {delta >= 0 ? '+' : ''}{delta}%
                  </button>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ LEVERS 5-10: Additional Strategy Levers ═══ */}
      <AdditionalStrategyLevers
        strategy={strategy.additional}
        onStrategyChange={handleAdditionalChange}
        openSections={openSections}
        onToggleSection={toggleSection}
        baseLoanTermYears={baseInputs.loanTermYears}
        properties={properties.map(p => ({
          id: p.id,
          address: p.address,
          current_value: p.current_value,
          loan_remaining: p.loan_remaining,
        }))}
        baseGrossIncome={baseInputs.grossAnnualIncome}
      />

      {/* ═══ Quick Scenario Presets ═══ */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Presets</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const allIds = new Set(consolidatableDebts.map(d => d.id));
              setStrategy(prev => ({ ...prev, consolidatedLiabilities: allIds }));
            }}
          >
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Pay Off All Debt
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const allIds = new Set(investmentProperties.map(p => p.id));
              setStrategy(prev => ({ ...prev, refinancedToIO: allIds }));
            }}
          >
            <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
            All Loans to IO
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStrategy(prev => ({ ...prev, rateAdjustment: 2 }))}
          >
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            Rates +2%
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStrategy(prev => ({
              ...prev,
              additional: { ...prev.additional, incomeGrowthPercent: 10 },
            }))}
          >
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            10% Raise
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const allDebts = new Set(consolidatableDebts.map(d => d.id));
              const allIO = new Set(investmentProperties.map(p => p.id));
              setStrategy(prev => ({
                ...prev,
                consolidatedLiabilities: allDebts,
                refinancedToIO: allIO,
                additional: { ...prev.additional, expenseReductionPercent: 15 },
              }));
            }}
          >
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Maximum Strategy
          </Button>
        </div>
      </div>

      <Separator />

      {/* ═══ IMPACT SUMMARY ═══ */}
      <Card className={`border-2 ${
        capacityChange > 0 ? 'border-emerald-500/30 bg-emerald-500/5' :
        capacityChange < 0 ? 'border-destructive/30 bg-destructive/5' :
        'border-border'
      }`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Compound Impact Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {impactBreakdown.length > 0 && (
            <div className="space-y-2">
              {impactBreakdown.map((impact, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className={`h-3.5 w-3.5 ${
                      impact.type === 'saving' ? 'text-emerald-600' :
                      impact.type === 'cost' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`} />
                    {impact.label}
                  </span>
                  {impact.type !== 'info' && (
                    <span className={`font-medium ${impact.type === 'saving' ? 'text-emerald-600' : 'text-destructive'}`}>
                      {impact.type === 'saving' ? '+' : '-'}{formatCurrency(impact.monthlySaving)}/mo
                    </span>
                  )}
                </div>
              ))}
              {totalMonthlySaving !== 0 && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Total Monthly Cash Flow Impact</span>
                    <span className={totalMonthlySaving >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                      {totalMonthlySaving >= 0 ? '+' : ''}{formatCurrency(totalMonthlySaving)}/mo
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {equityRelease && (
            <div className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
              <span className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                Equity Accessible ({equityRelease.property.address?.slice(0, 20)}...)
              </span>
              <span className="font-semibold text-primary">{formatCurrency(equityRelease.accessibleEquity)}</span>
            </div>
          )}

          {/* Before → After comparison */}
          <div className="grid grid-cols-3 gap-3 items-center pt-2">
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">CURRENT</p>
              <p className="text-lg font-bold">{formatCapacity(baseResult.borrowingCapacity)}</p>
              <Badge className="mt-1.5 text-xs" style={{ backgroundColor: baseBand.bg === 'bg-emerald-500/10' ? '#10b981' : baseBand.bg === 'bg-amber-500/10' ? '#f59e0b' : '#ef4444', color: 'white' }}>
                {baseBand.label}
              </Badge>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                {capacityChange > 0 && <TrendingUp className="h-5 w-5 text-emerald-600" />}
                {capacityChange < 0 && <TrendingDown className="h-5 w-5 text-destructive" />}
                {capacityChange === 0 && <Minus className="h-5 w-5 text-muted-foreground" />}
              </div>
              <p className={`text-lg font-bold ${
                capacityChange > 0 ? 'text-emerald-600' : capacityChange < 0 ? 'text-destructive' : 'text-muted-foreground'
              }`}>
                {capacityChange !== 0 ? (
                  <>{capacityChange > 0 ? '+' : ''}{formatCapacity(capacityChange)}</>
                ) : 'No Change'}
              </p>
              {capacityChange !== 0 && baseResult.borrowingCapacity > 0 && (
                <p className="text-xs text-muted-foreground">
                  ({((capacityChange / baseResult.borrowingCapacity) * 100).toFixed(1)}%)
                </p>
              )}
            </div>

            <div className={`text-center p-3 rounded-lg border-2 ${
              capacityChange > 0 ? 'bg-emerald-500/10 border-emerald-500/30' :
              capacityChange < 0 ? 'bg-destructive/10 border-destructive/30' :
              'bg-secondary/30 border-secondary'
            }`}>
              <p className="text-xs text-muted-foreground mb-1">SCENARIO</p>
              <p className="text-lg font-bold">{formatCapacity(scenarioResult.borrowingCapacity)}</p>
              <Badge className="mt-1.5 text-xs" style={{ backgroundColor: scenarioBand.bg === 'bg-emerald-500/10' ? '#10b981' : scenarioBand.bg === 'bg-amber-500/10' ? '#f59e0b' : '#ef4444', color: 'white' }}>
                {scenarioBand.label}
              </Badge>
            </div>
          </div>

          {/* Monthly Surplus */}
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Monthly Surplus</span>
              <span className={`font-medium ${surplusChange >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {formatCurrency(baseResult.monthlySurplus)} → {formatCurrency(scenarioResult.monthlySurplus)}
                <span className="ml-1 text-xs">
                  ({surplusChange >= 0 ? '+' : ''}{formatCurrency(surplusChange)})
                </span>
              </span>
            </div>
          </div>

          {!hasAnyStrategy && (
            <p className="text-xs text-muted-foreground text-center py-2 italic">
              Toggle strategies above to see their compound impact on borrowing capacity.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
