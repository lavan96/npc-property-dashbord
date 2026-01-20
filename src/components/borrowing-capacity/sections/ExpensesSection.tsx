import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { ChevronDown, Home, DollarSign, Info } from 'lucide-react';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ExpensesSectionProps {
  expenseMethod: 'hem' | 'declared' | 'hybrid';
  hemBenchmark: number;
  declaredExpenses: number;
  effectiveExpenses: number;
  onMethodChange?: (method: 'hem' | 'declared' | 'hybrid') => void;
  onDeclaredExpensesChange?: (value: number) => void;
}

export function ExpensesSection({
  expenseMethod,
  hemBenchmark,
  declaredExpenses,
  effectiveExpenses,
  onMethodChange,
  onDeclaredExpensesChange,
}: ExpensesSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Home className="h-4 w-4 text-warning" />
                Living Expenses
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Monthly</p>
                  <p className="text-sm font-semibold text-warning">{formatCurrency(effectiveExpenses)}</p>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Method Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                Expense Calculation Method
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>HEM (Household Expenditure Measure) is the industry benchmark. 
                      Lenders typically use the higher of HEM or declared expenses.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <RadioGroup 
                value={expenseMethod} 
                onValueChange={(v) => onMethodChange?.(v as 'hem' | 'declared' | 'hybrid')}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="hem" id="hem" />
                  <Label htmlFor="hem" className="font-normal cursor-pointer flex items-center gap-2">
                    HEM Benchmark
                    <Badge variant="outline" className="text-xs">
                      {formatCurrency(hemBenchmark)}/mo
                    </Badge>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="declared" id="declared" />
                  <Label htmlFor="declared" className="font-normal cursor-pointer">
                    Declared Expenses
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="hybrid" id="hybrid" />
                  <Label htmlFor="hybrid" className="font-normal cursor-pointer flex items-center gap-2">
                    Higher of Both
                    <Badge variant="secondary" className="text-xs">Recommended</Badge>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* HEM Benchmark Display */}
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">HEM Benchmark</p>
                  <p className="text-sm font-medium">{formatCurrency(hemBenchmark)}/month</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Based on household profile
                </Badge>
              </div>
            </div>

            {/* Declared Expenses Input */}
            {(expenseMethod === 'declared' || expenseMethod === 'hybrid') && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Declared Monthly Expenses</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    value={declaredExpenses || ''}
                    onChange={(e) => onDeclaredExpensesChange?.(Number(e.target.value))}
                    className="pl-9"
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {/* Effective Expenses */}
            <div className="pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Effective Living Expenses</p>
                  <p className="text-xs text-muted-foreground">
                    {expenseMethod === 'hybrid' ? 'Higher of HEM or Declared' : 
                     expenseMethod === 'hem' ? 'HEM Benchmark' : 'Declared'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-warning">{formatCurrency(effectiveExpenses)}</p>
                  <p className="text-xs text-muted-foreground">/month</p>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
