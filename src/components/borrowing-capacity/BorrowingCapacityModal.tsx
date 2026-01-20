import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Calculator, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBorrowingCapacity } from '@/hooks/useBorrowingCapacity';
import { getHemBenchmark } from '@/utils/borrowingCapacityCalculations';
import type { FullAssessmentResult } from '@/utils/borrowingCapacityCalculations';

import { IncomeSection } from './sections/IncomeSection';
import { ExpensesSection } from './sections/ExpensesSection';
import { LiabilitiesSection } from './sections/LiabilitiesSection';
import { ProposedLoanSection } from './sections/ProposedLoanSection';
import { ResultsPanel } from './ResultsPanel';

interface BorrowingCapacityModalProps {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface IncomeBreakdownItem {
  id: string;
  label: string;
  grossAmount: number;
  shadingRate: number;
  shadedAmount: number;
  editable?: boolean;
}

interface LiabilityBreakdownItem {
  id: string;
  type: string;
  label: string;
  balance: number;
  limit?: number;
  monthlyServicing: number;
  calculationNote?: string;
}

export function BorrowingCapacityModal({ 
  clientId, 
  open, 
  onOpenChange 
}: BorrowingCapacityModalProps) {
  const { quickCalculate, isCalculating } = useBorrowingCapacity({ clientId, autoFetch: false });
  
  // Local state for inputs
  const [expenseMethod, setExpenseMethod] = useState<'hem' | 'declared' | 'hybrid'>('hybrid');
  const [declaredExpenses, setDeclaredExpenses] = useState(0);
  const [proposedLoanAmount, setProposedLoanAmount] = useState(500000);
  const [interestRate, setInterestRate] = useState(6.5);
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [result, setResult] = useState<FullAssessmentResult | null>(null);
  const [isLocalCalculating, setIsLocalCalculating] = useState(false);

  // Fetch client data
  const { data: clientData } = useQuery({
    queryKey: ['borrowing-capacity-client-data', clientId],
    queryFn: async () => {
      const [clientRes, incomeRes, liabilitiesRes, propertiesRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase.from('client_income').select('*').eq('client_id', clientId),
        supabase.from('client_liabilities').select('*').eq('client_id', clientId),
        supabase.from('client_properties').select('*').eq('client_id', clientId),
      ]);

      return {
        client: clientRes.data,
        income: incomeRes.data || [],
        liabilities: liabilitiesRes.data || [],
        properties: propertiesRes.data || [],
      };
    },
    enabled: open,
  });

  // Process income breakdown
  const incomeBreakdown: IncomeBreakdownItem[] = clientData?.income.flatMap(inc => {
    const items: IncomeBreakdownItem[] = [];
    const contactLabel = inc.contact_type === 'primary' ? 'Primary' : 'Secondary';

    if (inc.gross_salary) {
      items.push({
        id: `${inc.id}-salary`,
        label: `${contactLabel} Base Salary`,
        grossAmount: Number(inc.gross_salary),
        shadingRate: 1.0,
        shadedAmount: Number(inc.gross_salary),
      });
    }
    if (inc.bonus) {
      items.push({
        id: `${inc.id}-bonus`,
        label: `${contactLabel} Bonus`,
        grossAmount: Number(inc.bonus),
        shadingRate: 0.8,
        shadedAmount: Number(inc.bonus) * 0.8,
      });
    }
    if (inc.commission) {
      items.push({
        id: `${inc.id}-commission`,
        label: `${contactLabel} Commission`,
        grossAmount: Number(inc.commission),
        shadingRate: 0.8,
        shadedAmount: Number(inc.commission) * 0.8,
      });
    }
    if (inc.overtime_essential) {
      items.push({
        id: `${inc.id}-ot-essential`,
        label: `${contactLabel} Essential Overtime`,
        grossAmount: Number(inc.overtime_essential),
        shadingRate: 1.0,
        shadedAmount: Number(inc.overtime_essential),
      });
    }
    if (inc.overtime_non_essential) {
      items.push({
        id: `${inc.id}-ot-non-essential`,
        label: `${contactLabel} Non-Essential Overtime`,
        grossAmount: Number(inc.overtime_non_essential),
        shadingRate: 0.5,
        shadedAmount: Number(inc.overtime_non_essential) * 0.5,
      });
    }
    if (inc.allowance) {
      items.push({
        id: `${inc.id}-allowance`,
        label: `${contactLabel} Allowances`,
        grossAmount: Number(inc.allowance),
        shadingRate: 0.8,
        shadedAmount: Number(inc.allowance) * 0.8,
      });
    }
    return items;
  }) || [];

  // Add rental income from properties
  clientData?.properties.forEach(prop => {
    if (prop.monthly_rental_income) {
      incomeBreakdown.push({
        id: `prop-${prop.id}-rental`,
        label: `Rental: ${(prop.address || 'Property').slice(0, 30)}...`,
        grossAmount: Number(prop.monthly_rental_income) * 12,
        shadingRate: 0.8,
        shadedAmount: Number(prop.monthly_rental_income) * 12 * 0.8,
      });
    }
  });

  const totalGrossIncome = incomeBreakdown.reduce((sum, item) => sum + item.grossAmount, 0);
  const totalShadedIncome = incomeBreakdown.reduce((sum, item) => sum + item.shadedAmount, 0);

  // Process liabilities breakdown
  const liabilitiesBreakdown: LiabilityBreakdownItem[] = clientData?.liabilities.map(lib => {
    let monthlyServicing = Number(lib.monthly_repayment) || 0;
    let calculationNote = '';

    if (lib.liability_type === 'credit_card') {
      monthlyServicing = (Number(lib.credit_limit) || 0) * 0.03;
      calculationNote = '3% of credit limit';
    } else if (lib.liability_type === 'hecs') {
      // Simplified HECS calculation
      const annualIncome = totalGrossIncome;
      if (annualIncome > 51550) {
        const rate = annualIncome > 151200 ? 0.10 : annualIncome > 100000 ? 0.08 : 0.05;
        monthlyServicing = (annualIncome * rate) / 12;
        calculationNote = `${(rate * 100).toFixed(0)}% of income threshold`;
      } else {
        monthlyServicing = 0;
        calculationNote = 'Below repayment threshold';
      }
    }

    return {
      id: lib.id,
      type: lib.liability_type,
      label: lib.provider_name || lib.liability_type,
      balance: Number(lib.current_balance) || 0,
      limit: lib.liability_type === 'credit_card' ? Number(lib.credit_limit) : undefined,
      monthlyServicing,
      calculationNote,
    };
  }) || [];

  // Add existing property loans
  clientData?.properties.forEach(prop => {
    if (prop.loan_remaining && prop.monthly_interest_repayment) {
      liabilitiesBreakdown.push({
        id: `prop-${prop.id}-loan`,
        type: prop.property_type === 'owner_occupied' ? 'home_loan' : 'investment_loan',
        label: `Loan: ${prop.address?.slice(0, 25)}...`,
        balance: Number(prop.loan_remaining),
        monthlyServicing: Number(prop.monthly_interest_repayment),
      });
    }
  });

  const totalMonthlyCommitments = liabilitiesBreakdown.reduce(
    (sum, item) => sum + item.monthlyServicing, 
    0
  );

  // Calculate HEM benchmark
  const isCouple = clientData?.client?.marital_status === 'married' || 
                   clientData?.client?.marital_status === 'de_facto' ||
                   !!clientData?.client?.secondary_first_name;
  const dependents = Math.min(3, clientData?.client?.dependents_count || 0);
  const hemBenchmark = getHemBenchmark(isCouple ? 'couple' : 'single', dependents);

  // Effective expenses
  const effectiveExpenses = expenseMethod === 'hem' 
    ? hemBenchmark 
    : expenseMethod === 'declared' 
      ? declaredExpenses 
      : Math.max(hemBenchmark, declaredExpenses);

  // Calculate borrowing capacity
  const handleCalculate = useCallback(async () => {
    setIsLocalCalculating(true);
    try {
      const calcResult = await quickCalculate({
        grossAnnualIncome: totalGrossIncome,
        livingExpenses: effectiveExpenses,
        interestRate,
        loanTermYears,
        proposedLoanAmount,
      });
      setResult(calcResult);
    } catch (error) {
      console.error('Calculation failed:', error);
    } finally {
      setIsLocalCalculating(false);
    }
  }, [quickCalculate, totalGrossIncome, effectiveExpenses, interestRate, loanTermYears, proposedLoanAmount]);

  // Auto-calculate on mount and when key inputs change
  useEffect(() => {
    if (open && clientData) {
      handleCalculate();
    }
  }, [open, clientData, effectiveExpenses, interestRate, loanTermYears]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Borrowing Capacity Calculator
            </DialogTitle>
            <Button 
              onClick={handleCalculate}
              disabled={isLocalCalculating || isCalculating}
              size="sm"
            >
              {isLocalCalculating || isCalculating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Recalculate
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Inputs */}
          <div className="w-1/2 border-r">
            <ScrollArea className="h-[calc(90vh-80px)]">
              <div className="p-6 space-y-4">
                <IncomeSection
                  incomeBreakdown={incomeBreakdown}
                  totalGross={totalGrossIncome}
                  totalShaded={totalShadedIncome}
                />

                <ExpensesSection
                  expenseMethod={expenseMethod}
                  hemBenchmark={hemBenchmark}
                  declaredExpenses={declaredExpenses}
                  effectiveExpenses={effectiveExpenses}
                  onMethodChange={setExpenseMethod}
                  onDeclaredExpensesChange={setDeclaredExpenses}
                />

                <LiabilitiesSection
                  liabilities={liabilitiesBreakdown}
                  totalMonthlyCommitments={totalMonthlyCommitments}
                />

                <ProposedLoanSection
                  proposedLoanAmount={proposedLoanAmount}
                  interestRate={interestRate}
                  bufferRate={3.0}
                  loanTermYears={loanTermYears}
                  onProposedLoanChange={setProposedLoanAmount}
                  onInterestRateChange={setInterestRate}
                  onLoanTermChange={setLoanTermYears}
                />
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Results */}
          <div className="w-1/2">
            <ScrollArea className="h-[calc(90vh-80px)]">
              <div className="p-6">
                <ResultsPanel 
                  result={result} 
                  isCalculating={isLocalCalculating || isCalculating} 
                />
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
