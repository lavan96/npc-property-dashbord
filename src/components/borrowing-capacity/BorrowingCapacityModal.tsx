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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Loader2, RefreshCw, FlaskConical, Clock, Save, Building2, Shield, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBorrowingCapacity } from '@/hooks/useBorrowingCapacity';
import { getHemBenchmark, getHemBreakdown, DEFAULT_DTI_CAP } from '@/utils/borrowingCapacityCalculations';
import type { FullAssessmentResult, BorrowingCapacityInput, CalculationMode, HemBreakdown } from '@/utils/borrowingCapacityCalculations';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import { IncomeSection } from './sections/IncomeSection';
import { ExpensesSection } from './sections/ExpensesSection';
import { LiabilitiesSection } from './sections/LiabilitiesSection';
import { ProposedLoanSection } from './sections/ProposedLoanSection';
import { ResultsPanel } from './ResultsPanel';
import { ScenarioModeling } from './ScenarioModeling';
import { CapacityHistoryChart } from './CapacityHistoryChart';
import { BankRateSelector } from './BankRateSelector';
import { BankRateComparisonModal } from './BankRateComparisonModal';

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
  const { 
    quickCalculate, 
    isCalculating, 
    calculate, 
    assessmentHistory,
    isLoadingHistory,
  } = useBorrowingCapacity({ clientId, autoFetch: true });
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'calculator' | 'scenarios' | 'history'>('calculator');
  // Local state for inputs
  const [expenseMethod, setExpenseMethod] = useState<'hem' | 'declared' | 'hybrid'>('hybrid');
  const [declaredExpenses, setDeclaredExpenses] = useState(0);
  const [proposedLoanAmount, setProposedLoanAmount] = useState(500000);
  const [interestRate, setInterestRate] = useState(6.5);
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [selectedLenderName, setSelectedLenderName] = useState<string | null>(null);
  const [result, setResult] = useState<FullAssessmentResult | null>(null);
  const [isLocalCalculating, setIsLocalCalculating] = useState(false);
  const [showRateComparison, setShowRateComparison] = useState(false);
  // New mode states
  const [calculationMode, setCalculationMode] = useState<CalculationMode>('bank');
  const [dtiCapEnabled, setDtiCapEnabled] = useState(false);
  const [dtiCapLimit, setDtiCapLimit] = useState(DEFAULT_DTI_CAP);

  // Fetch client data INCLUDING expenses
  const { data: clientData } = useQuery({
    queryKey: ['borrowing-capacity-client-data', clientId],
    queryFn: async () => {
      const [clientRes, incomeRes, liabilitiesRes, propertiesRes, expensesRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase.from('client_income').select('*').eq('client_id', clientId),
        supabase.from('client_liabilities').select('*').eq('client_id', clientId),
        supabase.from('client_properties').select('*').eq('client_id', clientId),
        supabase.from('client_expenses').select('*').eq('client_id', clientId),
      ]);

      // Calculate total declared expenses from database
      const totalDeclaredFromDB = (expensesRes.data || []).reduce(
        (sum, exp) => sum + (Number(exp.monthly_amount) || 0), 
        0
      );

      return {
        client: clientRes.data,
        income: incomeRes.data || [],
        liabilities: liabilitiesRes.data || [],
        properties: propertiesRes.data || [],
        expenses: expensesRes.data || [],
        totalDeclaredExpenses: totalDeclaredFromDB,
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

  // Add POSITIVE property cash flows as income (NOT rental income - only net cash flow)
  // Properties with negative cash flow are handled in expenses
  clientData?.properties.forEach(prop => {
    const propertyType = prop.property_type?.toLowerCase() || '';
    
    // Skip rental properties where client is tenant (this is an expense, not income)
    if (propertyType === 'rental') return;
    
    const netMonthlyCashflow = Number(prop.net_monthly_cashflow) || 0;
    
    // Only add property cash flow if it's POSITIVE
    if (netMonthlyCashflow > 0) {
      const annualPositiveCashflow = netMonthlyCashflow * 12;
      // Apply 80% shading to positive property cash flow (conservative bank approach)
      const shadedAmount = annualPositiveCashflow * 0.8;
      
      incomeBreakdown.push({
        id: `prop-${prop.id}-cashflow`,
        label: `Positive Cash Flow: ${(prop.address || 'Property').slice(0, 25)}...`,
        grossAmount: annualPositiveCashflow,
        shadingRate: 0.8,
        shadedAmount: shadedAmount,
      });
    }
  });
  
  // Calculate NEGATIVE property cash flows (to be added as expense layer)
  const negativePropertyCashFlows: { address: string; monthlyCashflow: number }[] = [];
  let totalNegativeCashFlows = 0;
  
  clientData?.properties.forEach(prop => {
    const propertyType = prop.property_type?.toLowerCase() || '';
    if (propertyType === 'rental') return; // Skip rental properties (tenant)
    
    const netMonthlyCashflow = Number(prop.net_monthly_cashflow) || 0;
    
    if (netMonthlyCashflow < 0) {
      const absoluteCashflow = Math.abs(netMonthlyCashflow);
      totalNegativeCashFlows += absoluteCashflow;
      negativePropertyCashFlows.push({
        address: (prop.address || 'Investment Property').slice(0, 40),
        monthlyCashflow: absoluteCashflow,
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

  // Add existing property loans - STRESS-TESTED at P&I assessment rate
  // Banks assess existing loans at P&I even if currently interest-only
  const LOAN_ASSESSMENT_RATE = 0.095; // 9.5% (approx 6.5% + 3% buffer)
  const LOAN_TERM_MONTHS = 30 * 12; // 30 year term for calculation
  
  clientData?.properties.forEach(prop => {
    const propertyType = prop.property_type?.toLowerCase() || '';
    
    // Handle rental properties (where client is tenant paying rent)
    if (propertyType === 'rental') {
      const monthlyRentPaid = Number(prop.monthly_rental_income) || 0;
      if (monthlyRentPaid > 0) {
        liabilitiesBreakdown.push({
          id: `prop-${prop.id}-rent-expense`,
          type: 'rent_expense',
          label: `Rent Expense: ${prop.address?.slice(0, 20)}...`,
          balance: 0,
          monthlyServicing: monthlyRentPaid,
          calculationNote: 'Rent paid as tenant',
        });
      }
    } else if (prop.loan_remaining && prop.loan_remaining > 0) {
      // Calculate P&I servicing at assessment rate (stress-tested)
      const loanBalance = Number(prop.loan_remaining);
      const monthlyRate = LOAN_ASSESSMENT_RATE / 12;
      
      // P&I repayment formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
      const piRepayment = loanBalance * (monthlyRate * Math.pow(1 + monthlyRate, LOAN_TERM_MONTHS)) 
                          / (Math.pow(1 + monthlyRate, LOAN_TERM_MONTHS) - 1);
      
      // Use the HIGHER of: P&I calculated OR actual recorded repayment
      const actualRepayment = Number(prop.monthly_interest_repayment) || 0;
      const monthlyServicing = Math.max(piRepayment, actualRepayment);
      
      liabilitiesBreakdown.push({
        id: `prop-${prop.id}-loan`,
        type: prop.property_type === 'owner_occupied' ? 'home_loan' : 'investment_loan',
        label: `Loan: ${prop.address?.slice(0, 25)}...`,
        balance: loanBalance,
        monthlyServicing: Math.round(monthlyServicing * 100) / 100,
        calculationNote: piRepayment > actualRepayment ? 'Stress-tested P&I @ 9.5%' : 'Actual repayment',
      });
    }
  });

  const totalMonthlyCommitments = liabilitiesBreakdown.reduce(
    (sum, item) => sum + item.monthlyServicing, 
    0
  );

  // Calculate HEM benchmark with breakdown
  const isCouple = clientData?.client?.marital_status === 'married' || 
                   clientData?.client?.marital_status === 'de_facto' ||
                   !!clientData?.client?.secondary_first_name;
  const dependents = Math.min(3, clientData?.client?.dependents_count || 0);
  const hemBreakdown: HemBreakdown = getHemBreakdown(isCouple ? 'couple' : 'single', dependents, totalGrossIncome);
  const hemBenchmark = hemBreakdown.finalHem;

  // Sync declared expenses from database when data loads
  useEffect(() => {
    if (clientData?.totalDeclaredExpenses !== undefined && clientData.totalDeclaredExpenses > 0) {
      setDeclaredExpenses(clientData.totalDeclaredExpenses);
    }
  }, [clientData?.totalDeclaredExpenses]);

  // Effective expenses - use the appropriate method
  // CRITICAL: This is the "hybrid" logic that banks use
  const baseExpenses = expenseMethod === 'hem' 
    ? hemBenchmark 
    : expenseMethod === 'declared' 
      ? declaredExpenses 
      : Math.max(hemBenchmark, declaredExpenses);
  
  // Total living expenses = base expenses + negative property cash flows
  const effectiveExpenses = baseExpenses + totalNegativeCashFlows;

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
        // Pass mode settings
        calculationMode,
        dtiCapEnabled,
        dtiCapLimit,
      });
      setResult(calcResult);
    } catch (error) {
      console.error('Calculation failed:', error);
    } finally {
      setIsLocalCalculating(false);
    }
  }, [quickCalculate, totalGrossIncome, effectiveExpenses, interestRate, loanTermYears, proposedLoanAmount, calculationMode, dtiCapEnabled, dtiCapLimit]);

  // Auto-calculate on mount and when key inputs change
  useEffect(() => {
    if (open && clientData) {
      handleCalculate();
    }
  }, [open, clientData, effectiveExpenses, interestRate, loanTermYears, calculationMode, dtiCapEnabled, dtiCapLimit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Borrowing Capacity Calculator
            </DialogTitle>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => {
                  calculate({
                    grossAnnualIncome: totalGrossIncome,
                    livingExpenses: effectiveExpenses,
                    interestRate,
                    loanTermYears,
                    proposedLoanAmount,
                  });
                  toast.success('Assessment saved');
                }}
                disabled={isLocalCalculating || isCalculating || !result}
                size="sm"
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
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
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 border-b">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="calculator" className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Calculator
              </TabsTrigger>
              <TabsTrigger value="scenarios" className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                What-If
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                History
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="calculator" className="flex-1 overflow-hidden m-0">
            <div className="flex flex-1 h-full overflow-hidden">
              {/* Left Panel - Inputs */}
              <div className="w-1/2 border-r">
                <ScrollArea className="h-[calc(90vh-140px)]">
                  <div className="p-6 space-y-4">
                    <IncomeSection
                      incomeBreakdown={incomeBreakdown}
                      totalGross={totalGrossIncome}
                      totalShaded={totalShadedIncome}
                    />
                    <ExpensesSection
                      expenseMethod={expenseMethod}
                      hemBenchmark={hemBenchmark}
                      hemBreakdown={hemBreakdown}
                      declaredExpenses={declaredExpenses}
                      baseExpenses={baseExpenses}
                      negativePropertyCashFlows={negativePropertyCashFlows}
                      totalNegativeCashFlows={totalNegativeCashFlows}
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

                    {/* Bank Rate Selector - CDR Integration */}
                    <div className="rounded-lg border p-4 bg-card">
                      <h3 className="font-medium mb-3 flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        Live Bank Rates (CDR)
                      </h3>
                      <BankRateSelector
                        value={interestRate}
                        onChange={(rate, lenderName) => {
                          setInterestRate(rate);
                          if (lenderName) setSelectedLenderName(lenderName);
                        }}
                        loanPurpose="INVESTMENT"
                        repaymentType="PRINCIPAL_AND_INTEREST"
                        onOpenComparison={() => setShowRateComparison(true)}
                      />
                      {selectedLenderName && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Using rate from: {selectedLenderName}
                        </p>
                      )}
                    </div>

                    {/* Calculation Mode Controls */}
                    <div className="rounded-lg border p-4 bg-card space-y-4">
                      <h3 className="font-medium flex items-center gap-2">
                        {calculationMode === 'conservative' ? (
                          <ShieldAlert className="h-4 w-4 text-warning" />
                        ) : (
                          <Shield className="h-4 w-4 text-primary" />
                        )}
                        Calculation Mode
                      </h3>
                      
                      {/* Conservative Mode Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="conservative-mode" className="text-sm font-medium">
                            Conservative Mode
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Quickli-style with surplus floors & DTI cap
                          </p>
                        </div>
                        <Switch
                          id="conservative-mode"
                          checked={calculationMode === 'conservative'}
                          onCheckedChange={(checked) => {
                            setCalculationMode(checked ? 'conservative' : 'bank');
                            if (checked) {
                              setDtiCapEnabled(true);
                              setDtiCapLimit(6);
                            }
                          }}
                        />
                      </div>

                      <Separator />

                      {/* DTI Cap Controls */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="dti-cap" className="text-sm font-medium">
                              Enforce DTI Cap
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Limit capacity based on debt-to-income ratio
                            </p>
                          </div>
                          <Switch
                            id="dti-cap"
                            checked={dtiCapEnabled || calculationMode === 'conservative'}
                            onCheckedChange={setDtiCapEnabled}
                            disabled={calculationMode === 'conservative'}
                          />
                        </div>
                        
                        {(dtiCapEnabled || calculationMode === 'conservative') && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">DTI Limit</Label>
                              <span className="text-sm font-medium">{dtiCapLimit}x</span>
                            </div>
                            <div className="flex gap-2">
                              {[5, 6, 7, 8].map((cap) => (
                                <button
                                  key={cap}
                                  onClick={() => setDtiCapLimit(cap)}
                                  disabled={calculationMode === 'conservative'}
                                  className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                                    dtiCapLimit === cap
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-secondary hover:bg-secondary/80'
                                  } ${calculationMode === 'conservative' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  {cap}x
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {calculationMode === 'conservative' 
                                ? 'Conservative mode enforces 6x DTI cap'
                                : `Capacity will be capped to maintain DTI ≤ ${dtiCapLimit}x`
                              }
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Mode Description */}
                      <div className={`p-3 rounded-lg text-xs ${
                        calculationMode === 'conservative' 
                          ? 'bg-warning/10 border border-warning/30 text-warning'
                          : 'bg-primary/10 border border-primary/30 text-primary'
                      }`}>
                        {calculationMode === 'conservative' ? (
                          <p>
                            <strong>Conservative Mode:</strong> Uses minimum surplus floors ($1,000/mo), 
                            residual income requirements, 85% surplus utilization, and hard 6x DTI cap. 
                            Results align with consumer-focused tools like Quickli.
                          </p>
                        ) : (
                          <p>
                            <strong>Bank Mode:</strong> Full serviceability calculation without artificial 
                            constraints. Shows maximum theoretical lending capacity similar to major lender 
                            assessments.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
              {/* Right Panel - Results */}
              <div className="w-1/2">
                <ScrollArea className="h-[calc(90vh-140px)]">
                  <div className="p-6">
                    <ResultsPanel 
                      result={result} 
                      isCalculating={isLocalCalculating || isCalculating}
                      calculationMode={calculationMode}
                      dtiCapEnabled={dtiCapEnabled}
                      dtiCapLimit={dtiCapLimit}
                    />
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scenarios" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-[calc(90vh-140px)]">
              <div className="p-6">
                {result ? (
                  <ScenarioModeling
                    baseInputs={{
                      grossAnnualIncome: totalGrossIncome,
                      shadedAnnualIncome: totalShadedIncome,
                      monthlyLivingExpenses: effectiveExpenses,
                      monthlyCommitments: totalMonthlyCommitments,
                      interestRate,
                      bufferRate: 3.0,
                      loanTermYears,
                    }}
                    baseResult={result}
                  />
                ) : (
                  <div className="text-center text-muted-foreground py-12">
                    Calculate borrowing capacity first to model scenarios.
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-[calc(90vh-140px)]">
              <div className="p-6">
                <CapacityHistoryChart 
                  history={assessmentHistory || []} 
                  isLoading={isLoadingHistory} 
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Bank Rate Comparison Modal */}
        <BankRateComparisonModal
          open={showRateComparison}
          onOpenChange={setShowRateComparison}
          onSelectRate={(rate, lenderName, productName) => {
            setInterestRate(rate);
            setSelectedLenderName(lenderName);
            toast.success(`Selected ${lenderName} rate: ${rate.toFixed(2)}%`);
          }}
          defaultLoanPurpose="INVESTMENT"
          defaultRepaymentType="PRINCIPAL_AND_INTEREST"
        />
      </DialogContent>
    </Dialog>
  );
}
