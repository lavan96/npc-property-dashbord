import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Loader2, RefreshCw, FlaskConical, Clock, Save, Building2, Shield, ShieldAlert, Upload, ShieldCheck, RotateCcw } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useBorrowingCapacity } from '@/hooks/useBorrowingCapacity';
import { getHemBenchmark, getHemBreakdown, getHecsRepayment, DEFAULT_DTI_CAP } from '@/utils/borrowingCapacityCalculations';
import type { FullAssessmentResult, BorrowingCapacityInput, CalculationMode, HemBreakdown } from '@/utils/borrowingCapacityCalculations';
import type { LmiMode, LmiEstimate } from '@/utils/lmiCalculations';
import { calculateLmiImpact } from '@/utils/lmiCalculations';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import { IncomeSection } from './sections/IncomeSection';
import { ExpensesSection } from './sections/ExpensesSection';
import { LiabilitiesSection } from './sections/LiabilitiesSection';
import { ProposedLoanSection, type ProposedRentalIncomeData } from './sections/ProposedLoanSection';
import { ResultsPanel } from './ResultsPanel';
import { StrategyScenarioModeling } from './scenarios/StrategyScenarioModeling';
import type { LiabilityItem as ScenarioLiabilityItem, PropertyItem as ScenarioPropertyItem, ScenarioPreset } from './scenarios/StrategyScenarioModeling';
import { CapacityHistoryChart } from './CapacityHistoryChart';
import { BankRateSelector } from './BankRateSelector';
import { BankRateComparisonModal } from './BankRateComparisonModal';
import { LmiSection } from './sections/LmiSection';

// Secure data fetching via HttpOnly cookies
async function fetchBorrowingCapacityData(clientId: string) {
  const { data, error } = await invokeSecureFunction('get-client-data', {
    clientId,
    include: {
      client: true,
      properties: true,
      income: true,
      incomeSources: true,
      liabilities: true,
      expenses: true,
      borrowingCapacity: true,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to fetch borrowing capacity data');
  }

  const totalDeclaredFromDB = (data.expenses || []).reduce(
    (sum: number, exp: any) => sum + (Number(exp.monthly_amount) || 0), 
    0
  );

  // Get the latest assessment (sorted by created_at desc from the edge function)
  const assessments = data.borrowingCapacity || [];
  const latestAssessment = assessments.length > 0 ? assessments[0] : null;

  return {
    client: data.client,
    income: data.income || [],
    incomeSources: data.incomeSources || [],
    liabilities: data.liabilities || [],
    properties: data.properties || [],
    expenses: data.expenses || [],
    totalDeclaredExpenses: totalDeclaredFromDB,
    latestAssessment,
  };
}

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
  // Track source for sync-back
  sourceId?: string;
  sourceField?: string;
  sourceTable?: 'client_income_sources' | 'client_income';
}

interface LiabilityBreakdownItem {
  id: string;
  type: string;
  label: string;
  balance: number;
  limit?: number;
  monthlyServicing: number;
  calculationNote?: string;
  // Track source for sync-back
  sourceId?: string;
  sourceTable?: 'client_liabilities' | 'client_properties';
}

// Track which fields have been modified
interface PendingChanges {
  incomeSources: Map<string, { field: string; value: number; sourceId: string; sourceTable: string }>;
  liabilities: Map<string, { field: string; value: number; sourceId: string; sourceTable: string }>;
  expenses: { declaredTotal?: number; items: Map<string, { value: number; sourceId: string }> };
}

export function BorrowingCapacityModal({ 
  clientId, 
  open, 
  onOpenChange 
}: BorrowingCapacityModalProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
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
  const [bufferEnabled, setBufferEnabled] = useState(true);
  
  // === LMI STATE ===
  const [lmiMode, setLmiMode] = useState<LmiMode>('none');
  const [lmiPropertyValue, setLmiPropertyValue] = useState(0);
  const [lmiDepositAmount, setLmiDepositAmount] = useState(0);
  const [lmiManualOverride, setLmiManualOverride] = useState<number | null>(null);
  const [isFirstHomeBuyer, setIsFirstHomeBuyer] = useState(false);
  const [lmiEstimate, setLmiEstimate] = useState<LmiEstimate | null>(null);
  
  // === PROPOSED RENTAL INCOME STATE ===
  const [proposedRentalIncome, setProposedRentalIncome] = useState<ProposedRentalIncomeData>({
    weeklyRent: 0,
    frequency: 'weekly',
    inputAmount: 0,
    shadingRate: 0.8,
    vacancyRate: 0,
    interestOnlyOffset: 0,
  });
  // === TWO-WAY SYNC STATE ===
  // Local overrides for income items (keyed by breakdown item id)
  const [incomeOverrides, setIncomeOverrides] = useState<Map<string, number>>(new Map());
  // Local overrides for liability items
  const [liabilityOverrides, setLiabilityOverrides] = useState<Map<string, { balance?: number; limit?: number }>>(new Map());
  // Track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavingToProfile, setIsSavingToProfile] = useState(false);
  // Pending changes tracker for sync-back
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>({
    incomeSources: new Map(),
    liabilities: new Map(),
    expenses: { items: new Map() },
  });
  
  // Scenario presets state
  const [scenarioPresets, setScenarioPresets] = useState<ScenarioPreset[]>([]);
  // Active scenario overlay — when set, overrides calculator inputs (front-end only)
  const [activeScenario, setActiveScenario] = useState<ScenarioPreset | null>(null);

  // Computed buffer rate based on toggle
  const effectiveBufferRate = bufferEnabled ? 3.0 : 0;

  // Fetch client data using secure function with fallback
  const { data: clientData, refetch: refetchClientData } = useQuery({
    queryKey: ['borrowing-capacity-client-data', clientId],
    queryFn: () => fetchBorrowingCapacityData(clientId),
    enabled: open,
  });

  // Reset overrides when client data refreshes
  useEffect(() => {
    if (clientData) {
      setIncomeOverrides(new Map());
      setLiabilityOverrides(new Map());
      setHasUnsavedChanges(false);
      setPendingChanges({
        incomeSources: new Map(),
        liabilities: new Map(),
        expenses: { items: new Map() },
      });
    }
  }, [clientData]);

  // Process income breakdown - prefer new income sources, fall back to legacy
  const hasIncomeSources = (clientData?.incomeSources || []).length > 0;
  
  const incomeBreakdown: IncomeBreakdownItem[] = useMemo(() => {
    const items: IncomeBreakdownItem[] = hasIncomeSources
      ? (clientData?.incomeSources || []).flatMap((src: any) => {
          const result: IncomeBreakdownItem[] = [];
          const contactLabel = src.contact_type === 'primary' ? 'Primary' : 'Secondary';
          const effectiveShading = src.custom_shading_rate ?? src.default_shading_rate ?? 1.0;
          const sourceName = src.source_name || src.source_type || 'Income';

          const grossAnnual = incomeOverrides.has(`${src.id}-base`) 
            ? incomeOverrides.get(`${src.id}-base`)! 
            : (Number(src.gross_annual_amount) || 0);
          if (grossAnnual > 0 || incomeOverrides.has(`${src.id}-base`)) {
            result.push({
              id: `${src.id}-base`,
              label: `${contactLabel} ${sourceName}`,
              grossAmount: grossAnnual,
              shadingRate: effectiveShading,
              shadedAmount: grossAnnual * effectiveShading,
              editable: true,
              sourceId: src.id,
              sourceField: 'gross_annual_amount',
              sourceTable: 'client_income_sources',
            });
          }
          const subFields = [
            { key: 'bonus', label: 'Bonus', shading: 0.8, dbField: 'bonus' },
            { key: 'commission', label: 'Commission', shading: 0.8, dbField: 'commission' },
            { key: 'overtime_essential', label: 'Essential OT', shading: 1.0, dbField: 'overtime_essential' },
            { key: 'overtime_non_essential', label: 'Non-Essential OT', shading: 0.5, dbField: 'overtime_non_essential' },
            { key: 'allowance', label: 'Allowance', shading: 0.8, dbField: 'allowance' },
          ];
          for (const { key, label, shading, dbField } of subFields) {
            const overrideKey = `${src.id}-${key}`;
            const val = incomeOverrides.has(overrideKey)
              ? incomeOverrides.get(overrideKey)!
              : (Number(src[key]) || 0);
            if (val > 0 || incomeOverrides.has(overrideKey)) {
              result.push({
                id: overrideKey,
                label: `${contactLabel} ${label}`,
                grossAmount: val,
                shadingRate: shading,
                shadedAmount: val * shading,
                editable: true,
                sourceId: src.id,
                sourceField: dbField,
                sourceTable: 'client_income_sources',
              });
            }
          }
          return result;
        })
      : (clientData?.income || []).flatMap((inc: any) => {
          const result: IncomeBreakdownItem[] = [];
          const contactLabel = inc.contact_type === 'primary' ? 'Primary' : 'Secondary';
          const fields = [
            { key: 'salary', dbField: 'gross_salary', label: 'Base Salary', shading: 1.0, val: inc.gross_salary },
            { key: 'bonus', dbField: 'bonus', label: 'Bonus', shading: 0.8, val: inc.bonus },
            { key: 'commission', dbField: 'commission', label: 'Commission', shading: 0.8, val: inc.commission },
            { key: 'ot-essential', dbField: 'overtime_essential', label: 'Essential Overtime', shading: 1.0, val: inc.overtime_essential },
            { key: 'ot-non-essential', dbField: 'overtime_non_essential', label: 'Non-Essential Overtime', shading: 0.5, val: inc.overtime_non_essential },
            { key: 'allowance', dbField: 'allowance', label: 'Allowances', shading: 0.8, val: inc.allowance },
          ];
          for (const { key, dbField, label, shading, val } of fields) {
            const overrideKey = `${inc.id}-${key}`;
            const amount = incomeOverrides.has(overrideKey) ? incomeOverrides.get(overrideKey)! : (Number(val) || 0);
            if (amount > 0 || incomeOverrides.has(overrideKey)) {
              result.push({
                id: overrideKey,
                label: `${contactLabel} ${label}`,
                grossAmount: amount,
                shadingRate: shading,
                shadedAmount: amount * shading,
                editable: true,
                sourceId: inc.id,
                sourceField: dbField,
                sourceTable: 'client_income',
              });
            }
          }
          return result;
        });

    // Add POSITIVE property cash flows as income
    clientData?.properties.forEach(prop => {
      const propertyType = prop.property_type?.toLowerCase() || '';
      if (propertyType === 'rental') return;
      const netMonthlyCashflow = Number(prop.net_monthly_cashflow) || 0;
      if (netMonthlyCashflow > 0) {
        const annualPositiveCashflow = netMonthlyCashflow * 12;
        items.push({
          id: `prop-${prop.id}-cashflow`,
          label: `Positive Cash Flow: ${(prop.address || 'Property').slice(0, 25)}...`,
          grossAmount: annualPositiveCashflow,
          shadingRate: 0.8,
          shadedAmount: annualPositiveCashflow * 0.8,
          editable: false,
        });
      }
    });

    return items;
  }, [clientData, incomeOverrides, hasIncomeSources]);
  
  // Calculate NEGATIVE property cash flows
  const { negativePropertyCashFlows, totalNegativeCashFlows } = useMemo(() => {
    const flows: { address: string; monthlyCashflow: number }[] = [];
    let total = 0;
    clientData?.properties.forEach(prop => {
      const propertyType = prop.property_type?.toLowerCase() || '';
      if (propertyType === 'rental') return;
      const netMonthlyCashflow = Number(prop.net_monthly_cashflow) || 0;
      if (netMonthlyCashflow < 0) {
        const abs = Math.abs(netMonthlyCashflow);
        total += abs;
        flows.push({ address: (prop.address || 'Investment Property').slice(0, 40), monthlyCashflow: abs });
      }
    });
    return { negativePropertyCashFlows: flows, totalNegativeCashFlows: total };
  }, [clientData]);

  const totalGrossIncomeBase = incomeBreakdown.reduce((sum, item) => sum + item.grossAmount, 0);
  const totalShadedIncomeBase = incomeBreakdown.reduce((sum, item) => sum + item.shadedAmount, 0);

  // Compute proposed rental income net assessable amount
  const proposedRentalNetAssessable = useMemo(() => {
    const ri = proposedRentalIncome;
    if (!ri.inputAmount || ri.inputAmount <= 0) return 0;
    const freqMultiplier = ri.frequency === 'weekly' ? 52 : ri.frequency === 'monthly' ? 12 : 1;
    const grossAnnual = ri.inputAmount * freqMultiplier;
    const afterVacancy = grossAnnual * (1 - ri.vacancyRate / 100);
    const afterShading = afterVacancy * ri.shadingRate;
    const ioOffsetAnnual = ri.interestOnlyOffset * 12;
    return Math.max(0, afterShading - ioOffsetAnnual);
  }, [proposedRentalIncome]);

  // Include proposed rental income in totals sent to the engine
  const totalGrossIncome = totalGrossIncomeBase + (proposedRentalIncome.inputAmount > 0
    ? (proposedRentalIncome.inputAmount * (proposedRentalIncome.frequency === 'weekly' ? 52 : proposedRentalIncome.frequency === 'monthly' ? 12 : 1))
    : 0);
  const totalShadedIncome = totalShadedIncomeBase + proposedRentalNetAssessable;

  // Process liabilities breakdown with overrides
  const liabilitiesBreakdown: LiabilityBreakdownItem[] = useMemo(() => {
    // Default assumed terms for estimating repayments when monthly_repayment is missing
    const ASSUMED_TERMS: Record<string, { rate: number; years: number; label: string }> = {
      car_loan: { rate: 0.08, years: 5, label: 'Est. P&I @ 8% / 5yr' },
      personal_loan: { rate: 0.10, years: 7, label: 'Est. P&I @ 10% / 7yr' },
      afterpay_bnpl: { rate: 0, years: 0, label: '5% of limit' },
      other: { rate: 0.09, years: 5, label: 'Est. P&I @ 9% / 5yr' },
    };

    const estimatePIRepayment = (balance: number, annualRate: number, years: number): number => {
      if (balance <= 0 || years <= 0) return 0;
      const monthlyRate = annualRate / 12;
      const periods = years * 12;
      if (monthlyRate === 0) return balance / periods;
      return balance * (monthlyRate * Math.pow(1 + monthlyRate, periods)) 
             / (Math.pow(1 + monthlyRate, periods) - 1);
    };

    const items: LiabilityBreakdownItem[] = (clientData?.liabilities || []).map(lib => {
      const override = liabilityOverrides.get(lib.id);
      const balance = override?.balance ?? (Number(lib.current_balance) || 0);
      const creditLimit = override?.limit ?? (Number(lib.credit_limit) || 0);
      
      let monthlyServicing = Number(lib.monthly_repayment) || 0;
      let calculationNote = '';

      if (lib.liability_type === 'credit_card') {
        // Industry standard: 3% of credit limit
        monthlyServicing = creditLimit * 0.03;
        calculationNote = '3% of credit limit';
      } else if (lib.liability_type === 'afterpay_bnpl') {
        // BNPL: 5% of limit/balance (whichever is higher), similar to credit card treatment
        const bnplBase = Math.max(creditLimit, balance);
        monthlyServicing = bnplBase * 0.05;
        calculationNote = '5% of limit/balance';
      } else if (lib.liability_type === 'hecs') {
        // Use proper ATO brackets via getHecsRepayment()
        monthlyServicing = getHecsRepayment(totalGrossIncome);
        if (monthlyServicing > 0) {
          const effectiveRate = ((monthlyServicing * 12) / totalGrossIncome * 100).toFixed(1);
          calculationNote = `${effectiveRate}% of income (ATO brackets)`;
        } else {
          calculationNote = 'Below repayment threshold';
        }
      } else if (monthlyServicing === 0 && balance > 0) {
        // FIX: Estimate repayment for car/personal/other loans when monthly_repayment is missing
        const assumed = ASSUMED_TERMS[lib.liability_type] || ASSUMED_TERMS.other;
        monthlyServicing = estimatePIRepayment(balance, assumed.rate, assumed.years);
        calculationNote = assumed.label;
      }

      return {
        id: lib.id,
        type: lib.liability_type,
        label: lib.provider_name || lib.liability_type,
        balance,
        limit: (lib.liability_type === 'credit_card' || lib.liability_type === 'afterpay_bnpl') ? creditLimit : undefined,
        monthlyServicing: Math.round(monthlyServicing * 100) / 100,
        calculationNote,
        sourceId: lib.id,
        sourceTable: 'client_liabilities' as const,
      };
    });

    // Add existing property loans
    const LOAN_ASSESSMENT_RATE = 0.095;
    const LOAN_TERM_MONTHS = 30 * 12;
    
    clientData?.properties.forEach(prop => {
      const propertyType = prop.property_type?.toLowerCase() || '';
      if (propertyType === 'rental') {
        const monthlyRentPaid = Number(prop.monthly_rental_income) || 0;
        if (monthlyRentPaid > 0) {
          items.push({
            id: `prop-${prop.id}-rent-expense`,
            type: 'rent_expense',
            label: `Rent Expense: ${prop.address?.slice(0, 20)}...`,
            balance: 0,
            monthlyServicing: monthlyRentPaid,
            calculationNote: 'Rent paid as tenant',
          });
        }
      } else if (prop.loan_remaining && prop.loan_remaining > 0) {
        const loanBalance = Number(prop.loan_remaining);
        const monthlyRate = LOAN_ASSESSMENT_RATE / 12;
        const piRepayment = loanBalance * (monthlyRate * Math.pow(1 + monthlyRate, LOAN_TERM_MONTHS)) 
                            / (Math.pow(1 + monthlyRate, LOAN_TERM_MONTHS) - 1);
        const actualRepayment = Number(prop.monthly_interest_repayment) || 0;
        const monthlyServicing = Math.max(piRepayment, actualRepayment);
        
        items.push({
          id: `prop-${prop.id}-loan`,
          type: prop.property_type === 'owner_occupied' ? 'home_loan' : 'investment_loan',
          label: `Loan: ${prop.address?.slice(0, 25)}...`,
          balance: loanBalance,
          monthlyServicing: Math.round(monthlyServicing * 100) / 100,
          calculationNote: piRepayment > actualRepayment ? 'Stress-tested P&I @ 9.5%' : 'Actual repayment',
        });
      }
    });

    return items;
  }, [clientData, liabilityOverrides, totalGrossIncome]);

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

  // Pre-populate calculator fields from the latest saved assessment
  useEffect(() => {
    const assessment = clientData?.latestAssessment;
    if (!assessment) return;

    // Restore loan parameters
    if (assessment.proposed_loan_amount != null && assessment.proposed_loan_amount > 0) {
      setProposedLoanAmount(assessment.proposed_loan_amount);
    }
    if (assessment.interest_rate_used != null && assessment.interest_rate_used > 0) {
      setInterestRate(assessment.interest_rate_used);
    }
    if (assessment.loan_term_years != null && assessment.loan_term_years > 0) {
      setLoanTermYears(assessment.loan_term_years);
    }
    if (assessment.buffer_rate != null) {
      setBufferEnabled(assessment.buffer_rate > 0);
    }
    if (assessment.expense_method) {
      const method = assessment.expense_method as 'hem' | 'declared' | 'hybrid';
      if (['hem', 'declared', 'hybrid'].includes(method)) {
        setExpenseMethod(method);
      }
    }

    // Restore advanced settings from assumptions JSON
    const assumptions = assessment.assumptions as Record<string, any> | null;
    if (assumptions) {
      if (assumptions.calculationMode) {
        setCalculationMode(assumptions.calculationMode as CalculationMode);
      }
      if (assumptions.dtiCapEnabled != null) {
        setDtiCapEnabled(!!assumptions.dtiCapEnabled);
      }
      if (assumptions.dtiCapLimit != null && assumptions.dtiCapLimit > 0) {
        setDtiCapLimit(assumptions.dtiCapLimit);
      }
      if (assumptions.selectedLenderName) {
        setSelectedLenderName(assumptions.selectedLenderName);
      }
      // Restore LMI settings
      if (assumptions.lmiMode) {
        setLmiMode(assumptions.lmiMode as LmiMode);
      }
      if (assumptions.lmiPropertyValue != null) {
        setLmiPropertyValue(assumptions.lmiPropertyValue);
      }
      if (assumptions.lmiDepositAmount != null) {
        setLmiDepositAmount(assumptions.lmiDepositAmount);
      }
      if (assumptions.isFirstHomeBuyer != null) {
        setIsFirstHomeBuyer(!!assumptions.isFirstHomeBuyer);
      }
      // Restore proposed rental income
      if (assumptions.proposedRentalIncome) {
        setProposedRentalIncome(assumptions.proposedRentalIncome);
      }
    }

    // Restore LMI amount from assessment columns
    if (assessment.lmi_amount != null && assessment.lmi_amount > 0) {
      setLmiManualOverride(assessment.lmi_amount);
    }
    if (assessment.property_value_estimate != null) {
      setLmiPropertyValue(assessment.property_value_estimate);
    }
    if (assessment.deposit_amount != null) {
      setLmiDepositAmount(assessment.deposit_amount);
    }
    if (assessment.lmi_mode && assessment.lmi_mode !== 'none') {
      setLmiMode(assessment.lmi_mode as LmiMode);
    }
  }, [clientData?.latestAssessment]);

  // Effective expenses
  const baseExpenses = expenseMethod === 'hem' 
    ? hemBenchmark 
    : expenseMethod === 'declared' 
      ? declaredExpenses 
      : Math.max(hemBenchmark, declaredExpenses);
  
  const effectiveExpenses = baseExpenses + totalNegativeCashFlows;

  // === TWO-WAY SYNC HANDLERS ===
  const handleIncomeChange = useCallback((id: string, value: number) => {
    setIncomeOverrides(prev => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
    setHasUnsavedChanges(true);
    
    // Track the change for sync-back
    // Find the source info from the breakdown
    const item = incomeBreakdown.find(i => i.id === id);
    if (item?.sourceId && item.sourceField && item.sourceTable) {
      setPendingChanges(prev => {
        const next = { ...prev, incomeSources: new Map(prev.incomeSources) };
        next.incomeSources.set(id, {
          field: item.sourceField!,
          value,
          sourceId: item.sourceId!,
          sourceTable: item.sourceTable!,
        });
        return next;
      });
    }
  }, [incomeBreakdown]);

  const handleLiabilityChange = useCallback((id: string, field: 'balance' | 'limit', value: number) => {
    setLiabilityOverrides(prev => {
      const next = new Map(prev);
      const existing = next.get(id) || {};
      next.set(id, { ...existing, [field]: value });
      return next;
    });
    setHasUnsavedChanges(true);
    
    // Track for sync-back (only for direct liabilities, not property loans)
    if (!id.startsWith('prop-')) {
      setPendingChanges(prev => {
        const next = { ...prev, liabilities: new Map(prev.liabilities) };
        const dbField = field === 'balance' ? 'current_balance' : 'credit_limit';
        next.liabilities.set(`${id}-${field}`, {
          field: dbField,
          value,
          sourceId: id,
          sourceTable: 'client_liabilities',
        });
        return next;
      });
    }
  }, []);

  // Save changes back to the client profile
  const handleSaveToProfile = useCallback(async () => {
    setIsSavingToProfile(true);
    try {
      const promises: Promise<any>[] = [];

      // Group income changes by sourceId to batch updates
      const incomeUpdates = new Map<string, Record<string, any>>();
      pendingChanges.incomeSources.forEach(({ field, value, sourceId, sourceTable }) => {
        if (!incomeUpdates.has(sourceId)) {
          incomeUpdates.set(sourceId, { table: sourceTable, fields: {} });
        }
        incomeUpdates.get(sourceId)!.fields[field] = value;
      });

      incomeUpdates.forEach((update, sourceId) => {
        promises.push(
          invokeSecureFunction('manage-client-data', {
            operation: 'update',
            table: update.table,
            clientId,
            recordId: sourceId,
            data: update.fields,
          })
        );
      });

      // Group liability changes by sourceId
      const liabilityUpdates = new Map<string, Record<string, any>>();
      pendingChanges.liabilities.forEach(({ field, value, sourceId }) => {
        if (!liabilityUpdates.has(sourceId)) {
          liabilityUpdates.set(sourceId, {});
        }
        liabilityUpdates.get(sourceId)![field] = value;
      });

      liabilityUpdates.forEach((fields, sourceId) => {
        promises.push(
          invokeSecureFunction('manage-client-data', {
            operation: 'update',
            table: 'client_liabilities',
            clientId,
            recordId: sourceId,
            data: fields,
          })
        );
      });

      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);
      
      if (errors.length > 0) {
        toast.error(`Some updates failed: ${errors[0].error.message}`);
      } else {
        toast.success('Changes saved to client profile');
        setHasUnsavedChanges(false);
        setPendingChanges({
          incomeSources: new Map(),
          liabilities: new Map(),
          expenses: { items: new Map() },
        });
        
        // Invalidate all related queries to sync other views
        queryClient.invalidateQueries({ queryKey: ['borrowing-capacity-client-data', clientId] });
        queryClient.invalidateQueries({ queryKey: ['client-data', clientId] });
        queryClient.invalidateQueries({ queryKey: ['get-client-data'] });
        // Refetch local data
        refetchClientData();
      }
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSavingToProfile(false);
    }
  }, [pendingChanges, clientId, queryClient, refetchClientData]);

  // When an active scenario is set, overlay its adjusted inputs
  const effectiveGrossIncomeForCalc = activeScenario ? activeScenario.adjustedInputs.grossAnnualIncome : totalGrossIncome;
  const effectiveShadedIncomeForCalc = activeScenario ? activeScenario.adjustedInputs.shadedAnnualIncome : totalShadedIncome;
  const effectiveExpensesForCalc = activeScenario ? activeScenario.adjustedInputs.monthlyLivingExpenses : effectiveExpenses;
  const effectiveCommitmentsForCalc = activeScenario ? activeScenario.adjustedInputs.monthlyCommitments : totalMonthlyCommitments;

  // Calculate borrowing capacity
  const handleCalculate = useCallback(async () => {
    setIsLocalCalculating(true);
    try {
      const lmiOverrides = lmiMode !== 'none' && lmiEstimate ? {
        lmiAmount: lmiEstimate.lmiAmount,
        lmiMode,
        lmiPropertyValue,
        lmiDepositAmount,
        isFirstHomeBuyer,
      } : {};

      const calcResult = await quickCalculate({
        grossAnnualIncome: effectiveGrossIncomeForCalc,
        shadedAnnualIncome: effectiveShadedIncomeForCalc,
        livingExpenses: effectiveExpensesForCalc,
        existingCommitments: effectiveCommitmentsForCalc,
        interestRate,
        bufferRate: effectiveBufferRate,
        loanTermYears,
        proposedLoanAmount,
        calculationMode,
        dtiCapEnabled,
        dtiCapLimit,
        ...lmiOverrides,
      });
      setResult(calcResult);
    } catch (error) {
      console.error('Calculation failed:', error);
    } finally {
      setIsLocalCalculating(false);
    }
  }, [quickCalculate, effectiveGrossIncomeForCalc, effectiveShadedIncomeForCalc, effectiveCommitmentsForCalc, effectiveExpensesForCalc, interestRate, loanTermYears, proposedLoanAmount, calculationMode, dtiCapEnabled, dtiCapLimit, effectiveBufferRate, lmiMode, lmiEstimate, lmiPropertyValue, lmiDepositAmount, isFirstHomeBuyer]);

  // Auto-calculate on mount and when key inputs change
  useEffect(() => {
    if (open && clientData) {
      handleCalculate();
    }
  }, [open, clientData, effectiveExpensesForCalc, interestRate, loanTermYears, calculationMode, dtiCapEnabled, dtiCapLimit, effectiveBufferRate, incomeOverrides, liabilityOverrides, lmiMode, lmiEstimate, proposedRentalNetAssessable, activeScenario]);

  const headerContent = (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Calculator className="h-5 w-5 text-primary" />
        <span className="text-base sm:text-xl">Borrowing Capacity</span>
      </div>
      <div className="flex gap-2">
        {hasUnsavedChanges && (
          <Button 
            variant="outline"
            onClick={handleSaveToProfile}
            disabled={isSavingToProfile}
            size="sm"
            className="border-warning text-warning hover:bg-warning/10"
          >
            {isSavingToProfile ? (
              <Loader2 className="h-4 w-4 mr-1 sm:mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1 sm:mr-2" />
            )}
            Sync to Profile
          </Button>
        )}
        <Button 
          variant="outline"
          onClick={() => {
            calculate({
              grossAnnualIncome: totalGrossIncome,
              shadedAnnualIncome: totalShadedIncome,
              livingExpenses: effectiveExpenses,
              existingCommitments: totalMonthlyCommitments,
              interestRate,
              bufferRate: effectiveBufferRate,
              loanTermYears,
              proposedLoanAmount,
              calculationMode,
              dtiCapEnabled,
              dtiCapLimit,
              selectedLenderName: selectedLenderName || undefined,
              ...(lmiMode !== 'none' && lmiEstimate ? {
                lmiAmount: lmiEstimate.lmiAmount,
                lmiMode,
                lmiPropertyValue,
                lmiDepositAmount,
                isFirstHomeBuyer,
              } : {}),
              ...(proposedRentalIncome.inputAmount > 0 ? { proposedRentalIncome } : {}),
            });
            toast.success('Assessment saved');
          }}
          disabled={isLocalCalculating || isCalculating || !result}
          size="sm"
        >
          <Save className="h-4 w-4 mr-1 sm:mr-2" />
          Save
        </Button>
        <Button 
          onClick={handleCalculate}
          disabled={isLocalCalculating || isCalculating}
          size="sm"
        >
          {isLocalCalculating || isCalculating ? (
            <Loader2 className="h-4 w-4 mr-1 sm:mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1 sm:mr-2" />
          )}
          Recalculate
        </Button>
      </div>
    </div>
  );

  // Active scenario banner
  const scenarioBanner = activeScenario ? (
    <div className="mx-4 sm:mx-6 mt-2 p-2.5 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between text-xs">
      <span className="text-primary font-medium flex items-center gap-1.5">
        <FlaskConical className="h-3.5 w-3.5" />
        Scenario Active: <strong>{activeScenario.name}</strong>
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-xs px-2"
        onClick={() => {
          setActiveScenario(null);
          // Revert to base preset values if available
          const basePreset = scenarioPresets.find(p => p.isBase);
          if (basePreset) {
            setInterestRate(basePreset.adjustedInputs.interestRate);
            setLoanTermYears(basePreset.adjustedInputs.loanTermYears);
          }
          toast.info('Reverted to base case');
        }}
      >
        <RotateCcw className="h-3 w-3 mr-1" />
        Revert to Base
      </Button>
    </div>
  ) : null;

  // Unsaved changes banner
  const unsavedBanner = hasUnsavedChanges ? (
    <div className="mx-4 sm:mx-6 mt-2 p-2 rounded-lg bg-warning/10 border border-warning/30 flex items-center justify-between text-xs">
      <span className="text-warning font-medium">
        ⚡ You have unsaved changes. Click "Sync to Profile" to update client data.
      </span>
    </div>
  ) : null;

  // Shared input sections (to avoid duplication)
  const inputSections = (
    <>
      <IncomeSection
        incomeBreakdown={incomeBreakdown}
        totalGross={totalGrossIncome}
        totalShaded={totalShadedIncome}
        onIncomeChange={handleIncomeChange}
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
        onLiabilityChange={handleLiabilityChange}
      />
      <ProposedLoanSection
        proposedLoanAmount={proposedLoanAmount}
        interestRate={interestRate}
        bufferRate={effectiveBufferRate}
        bufferEnabled={bufferEnabled}
        onBufferEnabledChange={setBufferEnabled}
        loanTermYears={loanTermYears}
        onProposedLoanChange={setProposedLoanAmount}
        onInterestRateChange={setInterestRate}
        onLoanTermChange={setLoanTermYears}
        proposedRentalIncome={proposedRentalIncome}
        onProposedRentalIncomeChange={setProposedRentalIncome}
      />

      {/* LMI Section */}
      <LmiSection
        propertyValue={lmiPropertyValue}
        depositAmount={lmiDepositAmount}
        loanAmount={result?.borrowingCapacity || proposedLoanAmount}
        lmiMode={lmiMode}
        lmiManualOverride={lmiManualOverride}
        isFirstHomeBuyer={isFirstHomeBuyer}
        onPropertyValueChange={setLmiPropertyValue}
        onDepositAmountChange={setLmiDepositAmount}
        onLmiModeChange={setLmiMode}
        onLmiManualOverrideChange={setLmiManualOverride}
        onFirstHomeBuyerChange={setIsFirstHomeBuyer}
        onLmiEstimateChange={setLmiEstimate}
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
            <Label htmlFor={`conservative-mode-${isMobile ? 'm' : 'd'}`} className="text-sm font-medium">
              Conservative Mode
            </Label>
            <p className="text-xs text-muted-foreground">
              Stricter assessment with surplus floors & DTI cap
            </p>
          </div>
          <Switch
            id={`conservative-mode-${isMobile ? 'm' : 'd'}`}
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
              <Label htmlFor={`dti-cap-${isMobile ? 'm' : 'd'}`} className="text-sm font-medium">
                Enforce DTI Cap
              </Label>
              <p className="text-xs text-muted-foreground">
                Limit capacity based on debt-to-income ratio
              </p>
            </div>
            <Switch
              id={`dti-cap-${isMobile ? 'm' : 'd'}`}
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
                    className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors min-h-[44px] touch-manipulation ${
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
              Results align with stricter consumer-focused serviceability models.
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
    </>
  );

  const tabsContent = (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 sm:px-6 border-b">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="calculator" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Calculator className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Calculator
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <FlaskConical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            What-If
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            History
          </TabsTrigger>
        </TabsList>
      </div>

      {scenarioBanner}
      {unsavedBanner}

      <TabsContent value="calculator" className="flex-1 overflow-hidden m-0">
        {isMobile ? (
          <ScrollArea className="h-[calc(95vh-160px)]">
            <div className="p-4 space-y-4">
              {inputSections}
              <ResultsPanel 
                result={result} 
                isCalculating={isLocalCalculating || isCalculating}
                calculationMode={calculationMode}
                dtiCapEnabled={dtiCapEnabled}
                dtiCapLimit={dtiCapLimit}
                clientId={clientId}
                clientName={clientData?.client ? `${clientData.client.primary_first_name || ''} ${clientData.client.primary_surname || ''}`.trim() : undefined}
                proposedLoanAmount={proposedLoanAmount}
                interestRate={interestRate}
                bufferRate={effectiveBufferRate}
                loanTermYears={loanTermYears}
                lmiMode={lmiMode}
                lmiEstimate={lmiEstimate}
                scenarioPresets={scenarioPresets}
                activeScenarioName={activeScenario?.name}
                accessibleEquity={activeScenario?.accessibleEquity ?? 0}
              />
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-row flex-1 h-full overflow-hidden">
            <div className="w-1/2 border-r">
              <ScrollArea className="h-[calc(90vh-140px)]">
                <div className="p-6 space-y-4">
                  {inputSections}
                </div>
              </ScrollArea>
            </div>
            <div className="w-1/2">
              <ScrollArea className="h-[calc(90vh-140px)]">
                <div className="p-6">
                  <ResultsPanel 
                    result={result} 
                    isCalculating={isLocalCalculating || isCalculating}
                    calculationMode={calculationMode}
                    dtiCapEnabled={dtiCapEnabled}
                    dtiCapLimit={dtiCapLimit}
                    clientId={clientId}
                    clientName={clientData?.client ? `${clientData.client.primary_first_name || ''} ${clientData.client.primary_surname || ''}`.trim() : undefined}
                    proposedLoanAmount={proposedLoanAmount}
                    interestRate={interestRate}
                    bufferRate={effectiveBufferRate}
                    loanTermYears={loanTermYears}
                    lmiMode={lmiMode}
                    lmiEstimate={lmiEstimate}
                    scenarioPresets={scenarioPresets}
                    activeScenarioName={activeScenario?.name}
                    accessibleEquity={activeScenario?.accessibleEquity ?? 0}
                  />
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="scenarios" className="flex-1 overflow-hidden m-0">
        <ScrollArea className={isMobile ? "h-[calc(100vh-180px)]" : "h-[calc(90vh-140px)]"}>
          <div className="p-4 sm:p-6">
            {result ? (
              <StrategyScenarioModeling
                baseInputs={{
                  grossAnnualIncome: totalGrossIncome,
                  shadedAnnualIncome: totalShadedIncome,
                  monthlyLivingExpenses: effectiveExpenses,
                  monthlyCommitments: totalMonthlyCommitments,
                  interestRate,
                  bufferRate: effectiveBufferRate,
                  loanTermYears,
                }}
                baseResult={result}
                liabilities={liabilitiesBreakdown.map(l => ({
                  id: l.id,
                  type: l.type,
                  label: l.label,
                  balance: l.balance,
                  limit: l.limit,
                  monthlyServicing: l.monthlyServicing,
                  calculationNote: l.calculationNote,
                }))}
                properties={(clientData?.properties || []).map((p: any) => ({
                  id: p.id,
                  address: p.address || '',
                  property_type: p.property_type || '',
                  current_value: Number(p.value) || Number(p.current_value) || 0,
                  loan_remaining: Number(p.loan_remaining) || 0,
                  monthly_interest_repayment: Number(p.monthly_interest_repayment) || 0,
                  loan_repayment_amount: Number(p.loan_repayment_amount) || 0,
                  net_monthly_cashflow: Number(p.net_monthly_cashflow) || 0,
                }))}
                savedPresets={scenarioPresets}
                onPresetsChange={setScenarioPresets}
                onApplyScenario={(inputs) => {
                  // Find matching preset or create an ad-hoc one
                  const matchingPreset = scenarioPresets.find(
                    p => !p.isBase && p.adjustedInputs === inputs
                  );
                  const scenarioPreset: ScenarioPreset = matchingPreset || {
                    id: `applied-${Date.now()}`,
                    name: 'Applied Scenario',
                    isBase: false,
                    createdAt: new Date().toISOString(),
                    adjustedInputs: { ...inputs },
                    result: result!,
                  };
                  setActiveScenario(scenarioPreset);
                  // Apply the scenario values to calculator state
                  setInterestRate(inputs.interestRate);
                  setLoanTermYears(inputs.loanTermYears);
                  // Switch to calculator tab to show the result
                  setActiveTab('calculator');
                  toast.success(`Scenario "${scenarioPreset.name}" applied to calculator`);
                }}
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
        <ScrollArea className={isMobile ? "h-[calc(100vh-180px)]" : "h-[calc(90vh-140px)]"}>
          <div className="p-4 sm:p-6">
            <CapacityHistoryChart 
              history={assessmentHistory || []} 
              isLoading={isLoadingHistory} 
            />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );

  const bankRateModal = (
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
  );

  // Mobile: full-screen Sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[95vh] p-0 flex flex-col rounded-t-xl">
          <SheetHeader className="p-4 pb-3 border-b flex-shrink-0">
            <SheetTitle className="sr-only">Borrowing Capacity Calculator</SheetTitle>
            {headerContent}
          </SheetHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            {tabsContent}
          </div>
          {bankRateModal}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: standard dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="sr-only">Borrowing Capacity Calculator</DialogTitle>
          {headerContent}
        </DialogHeader>
        {tabsContent}
        {bankRateModal}
      </DialogContent>
    </Dialog>
  );
}
