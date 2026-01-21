import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Minus,
  RotateCcw,
  Save,
  ArrowRight,
} from 'lucide-react';
import {
  calculateBorrowingCapacity,
  calculateCapacityChange,
  formatCapacity,
  getServiceabilityBandColor,
  type BorrowingCapacityInput,
  type BorrowingCapacityResult,
} from '@/utils/borrowingCapacityCalculations';

interface ScenarioModelingProps {
  baseInputs: BorrowingCapacityInput;
  baseResult: BorrowingCapacityResult;
  onSaveScenario?: (name: string, result: BorrowingCapacityResult) => void;
}

interface ScenarioAdjustment {
  incomeChange: number;      // percentage
  expenseChange: number;     // percentage
  debtChange: number;        // percentage
  rateChange: number;        // percentage points
}

const DEFAULT_ADJUSTMENTS: ScenarioAdjustment = {
  incomeChange: 0,
  expenseChange: 0,
  debtChange: 0,
  rateChange: 0,
};

export function ScenarioModeling({
  baseInputs,
  baseResult,
  onSaveScenario,
}: ScenarioModelingProps) {
  const [adjustments, setAdjustments] = useState<ScenarioAdjustment>(DEFAULT_ADJUSTMENTS);
  const [scenarioResult, setScenarioResult] = useState<BorrowingCapacityResult>(baseResult);
  
  // Calculate scenario whenever adjustments change
  useEffect(() => {
    const adjustedGrossIncome = baseInputs.grossAnnualIncome * (1 + adjustments.incomeChange / 100);
    const scenarioInputs: BorrowingCapacityInput = {
      ...baseInputs,
      grossAnnualIncome: adjustedGrossIncome,
      shadedAnnualIncome: baseInputs.shadedAnnualIncome * (1 + adjustments.incomeChange / 100),
      monthlyLivingExpenses: baseInputs.monthlyLivingExpenses * (1 + adjustments.expenseChange / 100),
      monthlyCommitments: baseInputs.monthlyCommitments * (1 + adjustments.debtChange / 100),
      interestRate: baseInputs.interestRate + adjustments.rateChange,
    };
    
    const result = calculateBorrowingCapacity(scenarioInputs);
    setScenarioResult(result);
  }, [adjustments, baseInputs]);

  const handleReset = useCallback(() => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
  }, []);

  const change = calculateCapacityChange(baseResult, scenarioResult);
  const baseBandStyle = getServiceabilityBandColor(baseResult.serviceabilityBand);
  const scenarioBandStyle = getServiceabilityBandColor(scenarioResult.serviceabilityBand);

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value}%`;
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            What-If Scenario Analysis
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Adjustment Sliders */}
        <div className="space-y-4">
          {/* Income Adjustment */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Income Change</span>
              <span className={`font-medium ${adjustments.incomeChange >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatPercentage(adjustments.incomeChange)}
              </span>
            </div>
            <Slider
              value={[adjustments.incomeChange]}
              onValueChange={([val]) => setAdjustments(prev => ({ ...prev, incomeChange: val }))}
              min={-50}
              max={50}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-50%</span>
              <span className="text-xs">e.g., pay cut or raise</span>
              <span>+50%</span>
            </div>
          </div>

          {/* Expense Adjustment */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Living Expenses Change</span>
              <span className={`font-medium ${adjustments.expenseChange <= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatPercentage(adjustments.expenseChange)}
              </span>
            </div>
            <Slider
              value={[adjustments.expenseChange]}
              onValueChange={([val]) => setAdjustments(prev => ({ ...prev, expenseChange: val }))}
              min={-30}
              max={30}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-30%</span>
              <span className="text-xs">e.g., lifestyle change</span>
              <span>+30%</span>
            </div>
          </div>

          {/* Debt Adjustment */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Existing Debt Change</span>
              <span className={`font-medium ${adjustments.debtChange <= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatPercentage(adjustments.debtChange)}
              </span>
            </div>
            <Slider
              value={[adjustments.debtChange]}
              onValueChange={([val]) => setAdjustments(prev => ({ ...prev, debtChange: val }))}
              min={-100}
              max={50}
              step={10}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-100%</span>
              <span className="text-xs">e.g., pay off cards</span>
              <span>+50%</span>
            </div>
          </div>

          {/* Interest Rate Adjustment */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Interest Rate Change</span>
              <span className={`font-medium ${adjustments.rateChange <= 0 ? 'text-success' : 'text-destructive'}`}>
                {adjustments.rateChange >= 0 ? '+' : ''}{adjustments.rateChange.toFixed(1)}%
              </span>
            </div>
            <Slider
              value={[adjustments.rateChange]}
              onValueChange={([val]) => setAdjustments(prev => ({ ...prev, rateChange: val }))}
              min={-2}
              max={3}
              step={0.25}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-2%</span>
              <span className="text-xs">e.g., rate environment</span>
              <span>+3%</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Comparison View */}
        <div className="grid grid-cols-3 gap-4 items-center">
          {/* Base Result */}
          <div className="text-center p-4 rounded-lg bg-secondary/30">
            <p className="text-xs text-muted-foreground mb-1">CURRENT</p>
            <p className="text-xl font-bold text-foreground">
              {formatCapacity(baseResult.borrowingCapacity)}
            </p>
            <Badge 
              className="mt-2"
              style={{ backgroundColor: baseBandStyle.bg, color: 'white' }}
            >
              {baseBandStyle.label}
            </Badge>
          </div>

          {/* Arrow & Change */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              {change.direction === 'increase' && (
                <TrendingUp className="h-5 w-5 text-success" />
              )}
              {change.direction === 'decrease' && (
                <TrendingDown className="h-5 w-5 text-destructive" />
              )}
              {change.direction === 'unchanged' && (
                <Minus className="h-5 w-5 text-muted-foreground" />
              )}
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className={`text-lg font-bold ${
              change.direction === 'increase' 
                ? 'text-success' 
                : change.direction === 'decrease' 
                  ? 'text-destructive' 
                  : 'text-muted-foreground'
            }`}>
              {change.direction !== 'unchanged' && (
                <>
                  {change.direction === 'increase' ? '+' : ''}
                  {formatCapacity(change.absoluteChange)}
                </>
              )}
              {change.direction === 'unchanged' && 'No Change'}
            </p>
            <p className="text-xs text-muted-foreground">
              ({change.percentChange >= 0 ? '+' : ''}{change.percentChange.toFixed(1)}%)
            </p>
          </div>

          {/* Scenario Result */}
          <div className={`text-center p-4 rounded-lg border-2 ${
            change.direction === 'increase' 
              ? 'bg-success/10 border-success/30' 
              : change.direction === 'decrease' 
                ? 'bg-destructive/10 border-destructive/30' 
                : 'bg-secondary/30 border-secondary'
          }`}>
            <p className="text-xs text-muted-foreground mb-1">SCENARIO</p>
            <p className="text-xl font-bold text-foreground">
              {formatCapacity(scenarioResult.borrowingCapacity)}
            </p>
            <Badge 
              className="mt-2"
              style={{ backgroundColor: scenarioBandStyle.bg, color: 'white' }}
            >
              {scenarioBandStyle.label}
            </Badge>
          </div>
        </div>

        {/* Monthly Surplus Comparison */}
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Monthly Surplus Change:</span>
            <span className={`font-medium ${
              scenarioResult.monthlySurplus >= baseResult.monthlySurplus 
                ? 'text-success' 
                : 'text-destructive'
            }`}>
              ${(baseResult.monthlySurplus).toLocaleString()} → ${(scenarioResult.monthlySurplus).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Quick Scenario Buttons */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">QUICK SCENARIOS</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdjustments({ incomeChange: 10, expenseChange: 0, debtChange: 0, rateChange: 0 })}
            >
              10% Raise
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdjustments({ incomeChange: 0, expenseChange: 0, debtChange: -100, rateChange: 0 })}
            >
              Pay Off All Debt
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdjustments({ incomeChange: 0, expenseChange: -20, debtChange: 0, rateChange: 0 })}
            >
              Budget Tightly
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdjustments({ incomeChange: 0, expenseChange: 0, debtChange: 0, rateChange: 2 })}
            >
              Rates +2%
            </Button>
          </div>
        </div>

        {onSaveScenario && (
          <Button 
            variant="secondary" 
            className="w-full"
            onClick={() => onSaveScenario('Custom Scenario', scenarioResult)}
          >
            <Save className="h-4 w-4 mr-2" />
            Save This Scenario
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
