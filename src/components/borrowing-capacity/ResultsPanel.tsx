import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import {
  DollarSign,
  TrendingUp,
  Shield,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Lightbulb,
  Info,
  Receipt,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import type { FullAssessmentResult, ServiceabilityBand, CalculationMode, TaxBreakdown } from '@/utils/borrowingCapacityCalculations';
import { getTaxBreakdown } from '@/utils/borrowingCapacityCalculations';

interface ResultsPanelProps {
  result: FullAssessmentResult | null;
  isCalculating?: boolean;
  calculationMode?: CalculationMode;
  dtiCapEnabled?: boolean;
  dtiCapLimit?: number;
}

export function ResultsPanel({ result, isCalculating, calculationMode = 'bank', dtiCapEnabled, dtiCapLimit }: ResultsPanelProps) {
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);

  // Calculate tax breakdown based on gross income
  const taxBreakdown: TaxBreakdown | null = useMemo(() => {
    if (!result?.grossAnnualIncome) return null;
    return getTaxBreakdown(result.grossAnnualIncome);
  }, [result?.grossAnnualIncome]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getBandConfig = (band: ServiceabilityBand) => {
    switch (band) {
      case 'green':
        return {
          bgColor: 'bg-success',
          textColor: 'text-success',
          bgLight: 'bg-success/10',
          borderColor: 'border-success/30',
          icon: CheckCircle,
          label: 'GREEN',
          message: 'Strong borrowing position',
        };
      case 'amber':
        return {
          bgColor: 'bg-warning',
          textColor: 'text-warning',
          bgLight: 'bg-warning/10',
          borderColor: 'border-warning/30',
          icon: AlertTriangle,
          label: 'AMBER',
          message: 'Moderate capacity - proceed with caution',
        };
      case 'red':
      default:
        return {
          bgColor: 'bg-destructive',
          textColor: 'text-destructive',
          bgLight: 'bg-destructive/10',
          borderColor: 'border-destructive/30',
          icon: AlertTriangle,
          label: 'RED',
          message: 'Limited capacity - focus on debt reduction',
        };
    }
  };

  if (!result) {
    return (
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
          <DollarSign className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">No Calculation Yet</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs">
            Click "Calculate" to assess borrowing capacity based on client data.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bandConfig = getBandConfig(result.serviceabilityBand);
  const BandIcon = bandConfig.icon;
  const capacityProgress = Math.min(100, (result.borrowingCapacity / 1500000) * 100);

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Borrowing Capacity */}
        <div className={`p-4 rounded-lg border-2 ${bandConfig.borderColor} ${bandConfig.bgLight}`}>
          <p className="text-sm font-medium text-muted-foreground mb-1">BORROWING CAPACITY</p>
          <div className="text-4xl font-bold text-foreground">
            {formatCurrency(result.borrowingCapacity)}
          </div>
          <div className="mt-3">
            <Progress 
              value={capacityProgress} 
              className="h-3"
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
            <span>Stress-tested: {formatCurrency(result.stressTestedCapacity)}</span>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-xs text-muted-foreground mb-1">Surplus</p>
            <p className={`text-lg font-bold ${result.monthlySurplus >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(result.monthlySurplus)}
            </p>
            <p className="text-xs text-muted-foreground">/month</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-xs text-muted-foreground mb-1">DTI</p>
            <p className={`text-lg font-bold ${result.dtiRatio < 6 ? 'text-success' : result.dtiRatio < 8 ? 'text-warning' : 'text-destructive'}`}>
              {result.dtiRatio.toFixed(1)}x
            </p>
            <p className="text-xs text-muted-foreground">ratio</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-xs text-muted-foreground mb-1">Assessment</p>
            <p className="text-lg font-bold text-foreground">
              {result.assessmentRate.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground">rate</p>
          </div>
        </div>

        {/* Tax Breakdown Section */}
        {taxBreakdown && (
          <Collapsible open={showTaxBreakdown} onOpenChange={setShowTaxBreakdown}>
            <CollapsibleTrigger className="flex items-center justify-between w-full text-left p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Tax Breakdown (2025-26)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-success">
                  {formatCurrency(taxBreakdown.monthlyTakeHome)}/mo take-home
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showTaxBreakdown ? 'rotate-180' : ''}`} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 p-4 rounded-lg border bg-card">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Income:</span>
                    <span className="font-medium">{formatCurrency(taxBreakdown.grossIncome)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Income Tax:</span>
                    <span className="font-medium text-destructive">-{formatCurrency(taxBreakdown.taxPayable)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Medicare Levy (2%):</span>
                    <span className="font-medium text-destructive">-{formatCurrency(taxBreakdown.medicareLevy)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Tax:</span>
                    <span className="font-medium text-destructive">-{formatCurrency(taxBreakdown.totalTax)}</span>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex justify-between text-sm">
                  <span className="font-medium">After-Tax Income:</span>
                  <span className="font-bold text-success">{formatCurrency(taxBreakdown.afterTaxIncome)}/yr</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Effective Rate:</span>
                    <span className="font-medium">{(taxBreakdown.effectiveTaxRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Marginal Rate:</span>
                    <span className="font-medium">{(taxBreakdown.marginalTaxRate * 100).toFixed(0)}%</span>
                  </div>
                </div>
                
                <div className="p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                  <strong>Tax Bracket:</strong> {taxBreakdown.marginalBracket}
                </div>
                
                <div className="p-2 rounded bg-primary/10 border border-primary/20 text-xs">
                  <div className="flex items-center gap-1 text-primary font-medium">
                    <Info className="h-3 w-3" />
                    <span>After-tax income is used for serviceability assessment</span>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Serviceability Band */}
        <div className={`p-4 rounded-lg ${bandConfig.bgLight} border ${bandConfig.borderColor}`}>
          <p className="text-xs font-medium text-muted-foreground mb-2">SERVICEABILITY BAND</p>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${bandConfig.bgColor}`}>
              <BandIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <Badge className={`${bandConfig.bgColor} text-white px-3 py-1`}>
                {bandConfig.label}
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">{bandConfig.message}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Recommendations */}
        {result.recommendations.length > 0 && (
          <Collapsible open={showRecommendations} onOpenChange={setShowRecommendations}>
            <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Recommendations</span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${showRecommendations ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              {result.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <span>{rec}</span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium">Warnings</span>
            </div>
            {result.warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}

        {/* Assumptions */}
        <Collapsible open={showAssumptions} onOpenChange={setShowAssumptions}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Assumptions Used</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${showAssumptions ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buffer Rate:</span>
                <span className="font-medium">3.00%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan Term:</span>
                <span className="font-medium">30 years</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interest Rate:</span>
                <span className="font-medium">{(result.assessmentRate - 3).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assessment Rate:</span>
                <span className="font-medium">{result.assessmentRate.toFixed(2)}%</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Disclaimer */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <Shield className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              This calculator is for indicative purposes only. We recommend a formal broker 
              assessment for lending advice.
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
