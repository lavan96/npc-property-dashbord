import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Calculator, Download, TrendingUp, DollarSign, Percent, Home, Save, Edit2 } from 'lucide-react';

interface InvestmentReport {
  id: string;
  property_address: string;
  financial_calculations?: any;
  manual_overrides?: any;
}

interface CashFlowAnalysisModalProps {
  report: InvestmentReport | null;
  isOpen: boolean;
  onClose: () => void;
  onReportUpdated?: () => void;
}

interface YearlyProjection {
  year: number;
  capitalGrowthRate: number;
  propertyMarketValue: number;
  loanAmount: number;
  equityInProperty: number;
  loanToValueRatio: number;
  rentalIncome: number;
  grossYield: number;
  netYield: number;
  propertyExpenses: number;
  interestRate: number;
  interestPayments: number;
  principalPayments: number;
  preTaxCashFlowPA: number;
  preTaxCashFlowPW: number;
  depreciation: number;
  totalDeductions: number;
  netProfitLoss: number;
  taxRefund: number;
  landTax: number;
  afterTaxCashFlowPA: number;
  afterTaxCashFlowPW: number;
}

// Cash flow specific overrides
interface CashFlowOverrides {
  capitalGrowthRate: number | null;
  cpiGrowthRate: number | null;
  propertyMarketValue: number | null;
  rentalIncome: number | null;
  propertyExpenses: number | null;
  interestRate: number | null;
  interestPayment: number | null;
  principalPayment: number | null;
  depreciation: number | null;
  landTax: number | null;
}

export function CashFlowAnalysisModal({ report, isOpen, onClose, onReportUpdated }: CashFlowAnalysisModalProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Local cash flow overrides state
  const [cashFlowOverrides, setCashFlowOverrides] = useState<CashFlowOverrides>({
    capitalGrowthRate: null,
    cpiGrowthRate: null,
    propertyMarketValue: null,
    rentalIncome: null,
    propertyExpenses: null,
    interestRate: null,
    interestPayment: null,
    principalPayment: null,
    depreciation: null,
    landTax: null,
  });

  // Initialize overrides from report when modal opens
  useEffect(() => {
    if (report && isOpen) {
      const cfOverrides = report.manual_overrides?.cashFlowAnalysisOverrides || {};
      setCashFlowOverrides({
        capitalGrowthRate: cfOverrides.capitalGrowthRate ?? null,
        cpiGrowthRate: cfOverrides.cpiGrowthRate ?? null,
        propertyMarketValue: cfOverrides.propertyMarketValue ?? null,
        rentalIncome: cfOverrides.rentalIncome ?? null,
        propertyExpenses: cfOverrides.propertyExpenses ?? null,
        interestRate: cfOverrides.interestRate ?? null,
        interestPayment: cfOverrides.interestPayment ?? null,
        principalPayment: cfOverrides.principalPayment ?? null,
        depreciation: cfOverrides.depreciation ?? null,
        landTax: cfOverrides.landTax ?? null,
      });
      setHasChanges(false);
      setIsEditing(false);
    }
  }, [report, isOpen]);

  // Extract base financial data from report
  const baseFinancialData = useMemo(() => {
    if (!report) return null;

    const fc = report.financial_calculations || {};
    const mo = report.manual_overrides || {};
    const cashFlow = fc.cashFlow || {};

    // Check if depreciation should be included in cash flow analysis
    const includeDepreciation = mo.includeDepreciationInCashFlow !== false;

    return {
      // Purchase & Loan
      purchasePrice: mo.purchasePrice || fc.purchasePrice || fc.propertyValue || 0,
      landPrice: mo.landPrice || fc.landPrice || 0,
      buildPrice: mo.buildPrice || fc.buildPrice || 0,
      marketValueNow: mo.marketValueNow || cashFlow.marketValueNow || mo.purchasePrice || fc.purchasePrice || 0,
      depositValue: mo.depositValue || fc.depositValue || 0,
      loanAmount: mo.loanAmount || cashFlow.loanAmount || 0,
      loanToValueRatio: mo.loanToValueRatio || fc.loanToValueRatio || 80,
      loanType: mo.loanType || cashFlow.loanType || 'interest_only',
      loanTermYears: mo.loanTermYears || cashFlow.loanTermYears || 30,
      interestRate: mo.interestRate || fc.interestRate || 5.5,
      capitalGrowth: mo.capitalGrowth || fc.capitalGrowth || 5,

      // Rental Income
      weeklyRent: mo.weeklyRent || fc.weeklyRent || 0,
      occupancyRate: mo.occupancyRate || cashFlow.occupancyRate || 52,

      // Expenses
      stampDuty: mo.stampDuty || fc.stampDuty || 0,
      bodyCorporateFees: mo.bodyCorporateFees || fc.bodyCorporateFees || 0,
      landTax: mo.landTax || fc.landTax || 0,
      councilRates: mo.councilRates || fc.councilRates || 0,
      waterRates: mo.waterRates || fc.waterRates || 0,
      solicitorFees: mo.solicitorFees || fc.solicitorFees || 0,
      buildingLandlordInsurance: mo.buildingLandlordInsurance || fc.buildingLandlordInsurance || 0,
      propertyManagementFees: mo.propertyManagementFees || fc.propertyManagementFees || 7,
      repairsMaintenance: mo.repairsMaintenance || fc.repairsMaintenance || 0,
      lettingFees: mo.lettingFees || fc.lettingFees || 0,

      // Tax & Growth
      cpiGrowthRate: mo.cpiGrowthRate || cashFlow.cpiGrowthRate || 3,
      depreciation: includeDepreciation ? (mo.depreciation || cashFlow.depreciation || 6000) : 0,
      taxRate: mo.taxRate || cashFlow.taxRate || 30,
      constructionYear: mo.constructionYear || cashFlow.constructionYear || new Date().getFullYear(),
      
      // Toggle state
      includeDepreciationInCashFlow: includeDepreciation,
    };
  }, [report]);

  // Merged financial data with cash flow overrides taking precedence
  const financialData = useMemo(() => {
    if (!baseFinancialData) return null;

    return {
      ...baseFinancialData,
      // Apply cash flow specific overrides
      capitalGrowth: cashFlowOverrides.capitalGrowthRate ?? baseFinancialData.capitalGrowth,
      cpiGrowthRate: cashFlowOverrides.cpiGrowthRate ?? baseFinancialData.cpiGrowthRate,
      marketValueNow: cashFlowOverrides.propertyMarketValue ?? baseFinancialData.marketValueNow,
      interestRate: cashFlowOverrides.interestRate ?? baseFinancialData.interestRate,
      depreciation: cashFlowOverrides.depreciation ?? baseFinancialData.depreciation,
      landTax: cashFlowOverrides.landTax ?? baseFinancialData.landTax,
      // These are calculated values that can be overridden
      _rentalIncomeOverride: cashFlowOverrides.rentalIncome,
      _propertyExpensesOverride: cashFlowOverrides.propertyExpenses,
      _interestPaymentOverride: cashFlowOverrides.interestPayment,
      _principalPaymentOverride: cashFlowOverrides.principalPayment,
    };
  }, [baseFinancialData, cashFlowOverrides]);

  // Handle override field change
  const handleOverrideChange = useCallback((field: keyof CashFlowOverrides, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    setCashFlowOverrides(prev => ({
      ...prev,
      [field]: numValue
    }));
    setHasChanges(true);
  }, []);

  // Save overrides to database
  const handleSaveOverrides = async () => {
    if (!report) return;

    setIsSaving(true);
    try {
      const existingOverrides = report.manual_overrides || {};
      const updatedOverrides = {
        ...existingOverrides,
        cashFlowAnalysisOverrides: cashFlowOverrides
      };

      const { error } = await supabase
        .from('investment_reports')
        .update({
          manual_overrides: updatedOverrides,
          updated_at: new Date().toISOString()
        })
        .eq('id', report.id);

      if (error) throw error;

      toast({
        title: "Overrides Saved",
        description: "Cash flow analysis overrides have been saved successfully.",
      });

      setHasChanges(false);
      setIsEditing(false);
      onReportUpdated?.();
    } catch (error) {
      console.error('Error saving overrides:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save cash flow analysis overrides.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate 10-year projections
  const projections = useMemo(() => {
    if (!financialData) return [];

    const results: YearlyProjection[] = [];
    
    // Calculate initial values
    const purchasePrice = financialData.purchasePrice;
    const loanAmount = financialData.loanAmount || (purchasePrice * (financialData.loanToValueRatio / 100));
    const weeklyRent = financialData.weeklyRent;
    const occupancyRate = financialData.occupancyRate;
    const capitalGrowthRate = financialData.capitalGrowth / 100;
    const interestRate = financialData.interestRate / 100;
    const cpiRate = financialData.cpiGrowthRate / 100;
    const taxRate = financialData.taxRate / 100;
    const isInterestOnly = financialData.loanType === 'interest_only';

    // Calculate initial annual expenses
    const baseExpenses = 
      financialData.councilRates +
      financialData.waterRates +
      financialData.bodyCorporateFees +
      financialData.buildingLandlordInsurance +
      financialData.repairsMaintenance;

    // Calculate property management as percentage of rent
    const propertyManagementPercent = financialData.propertyManagementFees / 100;

    // Base calculated values for Year 1
    const baseAnnualRent = weeklyRent * occupancyRate;
    const basePropertyExpenses = baseExpenses + (baseAnnualRent * propertyManagementPercent);
    const baseInterestPayment = loanAmount * interestRate;
    const basePrincipalPayment = isInterestOnly ? 0 : 0;

    for (let year = 0; year <= 10; year++) {
      // Property value - use override for Year 1, otherwise calculate
      let propertyValue: number;
      if (year === 0) {
        propertyValue = financialData.marketValueNow || purchasePrice;
      } else if (year === 1 && financialData._rentalIncomeOverride !== null && cashFlowOverrides.propertyMarketValue !== null) {
        propertyValue = cashFlowOverrides.propertyMarketValue;
      } else {
        propertyValue = purchasePrice * Math.pow(1 + capitalGrowthRate, year);
      }

      // Loan balance
      const currentLoanAmount = isInterestOnly ? loanAmount : loanAmount;

      // Equity
      const equity = propertyValue - currentLoanAmount;

      // LVR
      const lvr = (currentLoanAmount / propertyValue) * 100;

      // Rental income - use override for Year 1
      let annualRent: number;
      if (year === 0) {
        annualRent = baseAnnualRent;
      } else if (year === 1 && financialData._rentalIncomeOverride !== null) {
        annualRent = financialData._rentalIncomeOverride;
      } else {
        annualRent = baseAnnualRent * Math.pow(1 + cpiRate, year);
      }

      // Property expenses - use override for Year 1
      let totalExpenses: number;
      if (year === 0) {
        totalExpenses = basePropertyExpenses;
      } else if (year === 1 && financialData._propertyExpensesOverride !== null) {
        totalExpenses = financialData._propertyExpensesOverride;
      } else {
        const expenses = baseExpenses * Math.pow(1 + cpiRate, year);
        const propertyManagement = annualRent * propertyManagementPercent;
        totalExpenses = expenses + propertyManagement;
      }

      // Interest payments - use override for Year 1
      let interestPayments: number;
      if (year === 0) {
        interestPayments = 0;
      } else if (year === 1 && financialData._interestPaymentOverride !== null) {
        interestPayments = financialData._interestPaymentOverride;
      } else {
        interestPayments = currentLoanAmount * interestRate;
      }

      // Principal payments - use override for Year 1
      let principalPayments: number;
      if (year === 0) {
        principalPayments = 0;
      } else if (year === 1 && financialData._principalPaymentOverride !== null) {
        principalPayments = financialData._principalPaymentOverride;
      } else {
        principalPayments = basePrincipalPayment;
      }

      // Gross yield
      const grossYield = year === 0 ? 0 : (annualRent / propertyValue) * 100;

      // Net yield
      const netYield = year === 0 ? 0 : ((annualRent - totalExpenses) / propertyValue) * 100;

      // Pre-tax cash flow
      const preTaxCashFlow = year === 0 ? 0 : annualRent - totalExpenses - interestPayments - principalPayments;

      // Depreciation
      const depreciation = year === 0 ? 0 : financialData.depreciation;

      // Land tax
      const landTax = financialData.landTax;

      // Total deductions
      const totalDeductions = totalExpenses + interestPayments + depreciation;

      // Net profit/loss
      const netProfitLoss = year === 0 ? 0 : annualRent - totalDeductions;

      // Tax refund
      const taxRefund = year === 0 ? 0 : (netProfitLoss < 0 ? Math.abs(netProfitLoss) * taxRate : 0);

      // After-tax cash flow
      const afterTaxCashFlow = year === 0 ? 0 : preTaxCashFlow + taxRefund;

      results.push({
        year,
        capitalGrowthRate: financialData.capitalGrowth,
        propertyMarketValue: Math.round(propertyValue),
        loanAmount: Math.round(currentLoanAmount),
        equityInProperty: Math.round(equity),
        loanToValueRatio: Math.round(lvr * 100) / 100,
        rentalIncome: Math.round(annualRent),
        grossYield: Math.round(grossYield * 100) / 100,
        netYield: Math.round(netYield * 100) / 100,
        propertyExpenses: Math.round(totalExpenses),
        interestRate: financialData.interestRate,
        interestPayments: Math.round(interestPayments),
        principalPayments: Math.round(principalPayments),
        preTaxCashFlowPA: Math.round(preTaxCashFlow),
        preTaxCashFlowPW: Math.round(preTaxCashFlow / 52),
        depreciation: Math.round(depreciation),
        totalDeductions: Math.round(totalDeductions),
        netProfitLoss: Math.round(netProfitLoss),
        taxRefund: Math.round(taxRefund),
        landTax: financialData.landTax,
        afterTaxCashFlowPA: Math.round(afterTaxCashFlow),
        afterTaxCashFlowPW: Math.round(afterTaxCashFlow / 52),
      });
    }

    return results;
  }, [financialData]);

  const formatCurrency = (value: number) => {
    if (value === 0) return '-';
    const formatted = Math.abs(value).toLocaleString('en-AU', { maximumFractionDigits: 0 });
    return value < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const handleExportExcel = () => {
    if (!financialData || !report) return;

    // Create workbook
    const wb = XLSX.utils.book_new();

    // ==================== SHEET 1: Cash Flow Analysis ====================
    const analysisData: (string | number | null)[][] = [];
    
    // Title
    analysisData.push(['10 Year Cash Flow Analysis']);
    analysisData.push([report.property_address]);
    analysisData.push([]);
    
    // ---- INPUT PARAMETERS SECTION ----
    analysisData.push(['INPUT PARAMETERS']);
    analysisData.push([]);
    
    // Purchase & Loan Details
    analysisData.push(['PURCHASE & LOAN DETAILS']);
    analysisData.push(['Purchase Price', financialData.purchasePrice]);
    analysisData.push(['Land Price', financialData.landPrice]);
    analysisData.push(['Build Price', financialData.buildPrice]);
    analysisData.push(['Market Value Now', financialData.marketValueNow]);
    analysisData.push(['Deposit', financialData.depositValue]);
    analysisData.push(['Loan Amount', financialData.loanAmount || (financialData.purchasePrice * (financialData.loanToValueRatio / 100))]);
    analysisData.push(['LVR %', financialData.loanToValueRatio]);
    analysisData.push(['Interest Rate %', financialData.interestRate]);
    analysisData.push(['Loan Type', financialData.loanType === 'interest_only' ? 'Interest Only' : 'Principal & Interest']);
    analysisData.push(['Loan Term (Years)', financialData.loanTermYears]);
    analysisData.push([]);
    
    // Rental Income
    analysisData.push(['RENTAL INCOME']);
    analysisData.push(['Weekly Rent', financialData.weeklyRent]);
    analysisData.push(['Annual Rent', financialData.weeklyRent * financialData.occupancyRate]);
    analysisData.push(['Occupancy (Weeks/Year)', financialData.occupancyRate]);
    analysisData.push([]);
    
    // Expenses
    analysisData.push(['ANNUAL EXPENSES']);
    analysisData.push(['Stamp Duty (One-off)', financialData.stampDuty]);
    analysisData.push(['Council Rates', financialData.councilRates]);
    analysisData.push(['Water Rates', financialData.waterRates]);
    analysisData.push(['Body Corporate/Strata', financialData.bodyCorporateFees]);
    analysisData.push(['Building & Landlord Insurance', financialData.buildingLandlordInsurance]);
    analysisData.push(['Property Management %', financialData.propertyManagementFees]);
    analysisData.push(['Repairs & Maintenance', financialData.repairsMaintenance]);
    analysisData.push(['Letting Fees', financialData.lettingFees]);
    analysisData.push(['Land Tax', financialData.landTax]);
    analysisData.push(['Solicitor Fees (One-off)', financialData.solicitorFees]);
    analysisData.push([]);
    
    // Growth & Tax
    analysisData.push(['GROWTH & TAX']);
    analysisData.push(['Capital Growth Rate %', financialData.capitalGrowth]);
    analysisData.push(['CPI/Expense Growth %', financialData.cpiGrowthRate]);
    analysisData.push(['Depreciation p.a.', financialData.depreciation]);
    analysisData.push(['Marginal Tax Rate %', financialData.taxRate]);
    analysisData.push(['Construction Year', financialData.constructionYear]);
    analysisData.push([]);
    analysisData.push([]);
    
    // ---- 10-YEAR PROJECTION TABLE ----
    analysisData.push(['10-YEAR PROJECTION']);
    analysisData.push([]);
    
    // Headers
    const projectionHeaders = ['Overview', 'Today', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10'];
    analysisData.push(projectionHeaders);
    
    // Data rows for projection
    const addProjectionRow = (label: string, getter: (p: YearlyProjection) => number | string) => {
      const row: (string | number)[] = [label];
      projections.forEach(p => row.push(getter(p)));
      analysisData.push(row);
    };
    
    addProjectionRow('Capital Growth %', p => p.capitalGrowthRate);
    addProjectionRow('Property Market Value $', p => p.propertyMarketValue);
    addProjectionRow('Loan Amount $', p => p.loanAmount);
    addProjectionRow('Equity in Property $', p => p.equityInProperty);
    addProjectionRow('Loan to Value Ratio %', p => p.loanToValueRatio);
    analysisData.push([]);
    addProjectionRow('Rental Income p.a. $', p => p.rentalIncome);
    addProjectionRow('Gross Yield %', p => p.grossYield);
    addProjectionRow('Net Yield %', p => p.netYield);
    analysisData.push([]);
    addProjectionRow('Property Expenses p.a. $', p => p.propertyExpenses);
    addProjectionRow('Interest Rate %', p => p.interestRate);
    addProjectionRow('Interest Payments $', p => p.interestPayments);
    addProjectionRow('Principal Payments $', p => p.principalPayments);
    analysisData.push([]);
    addProjectionRow('Pre-Tax Cash Flow p.a. $', p => p.preTaxCashFlowPA);
    addProjectionRow('Pre-Tax Cash Flow p.w. $', p => p.preTaxCashFlowPW);
    analysisData.push([]);
    addProjectionRow('Depreciation $', p => p.depreciation);
    addProjectionRow('Total Deductions $', p => p.totalDeductions);
    addProjectionRow('Net Profit/Loss $', p => p.netProfitLoss);
    addProjectionRow('Tax Refund $', p => p.taxRefund);
    addProjectionRow('Land Tax $', p => p.landTax);
    analysisData.push([]);
    addProjectionRow('After-Tax Cash Flow p.a. $', p => p.afterTaxCashFlowPA);
    addProjectionRow('After-Tax Cash Flow p.w. $', p => p.afterTaxCashFlowPW);
    
    // Create worksheet
    const ws1 = XLSX.utils.aoa_to_sheet(analysisData);
    
    // Set column widths
    ws1['!cols'] = [
      { wch: 30 }, // Label column
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws1, 'Cash Flow Analysis');
    
    // ==================== SHEET 2: Construction Staging ====================
    const constructionData: (string | number | null)[][] = [];
    
    constructionData.push(['CONSTRUCTION STAGING BREAKDOWN']);
    constructionData.push([report.property_address]);
    constructionData.push([]);
    
    // Calculate construction staging (typical breakdown)
    const landPrice = financialData.landPrice || financialData.purchasePrice * 0.35;
    const buildPrice = financialData.buildPrice || financialData.purchasePrice * 0.65;
    
    // Typical construction stages
    const stages = [
      { stage: 'Land Purchase', percent: 100, description: 'Full land payment at settlement' },
      { stage: 'Deposit (Build)', percent: 5, description: 'Initial deposit to builder' },
      { stage: 'Base Stage', percent: 15, description: 'Foundation and slab complete' },
      { stage: 'Frame Stage', percent: 20, description: 'Wall frames and roof trusses erected' },
      { stage: 'Lock-up Stage', percent: 20, description: 'External walls, windows, doors installed' },
      { stage: 'Fixing Stage', percent: 25, description: 'Internal fit-out, plumbing, electrical' },
      { stage: 'Completion Stage', percent: 15, description: 'Final finishes and handover' },
    ];
    
    constructionData.push(['LAND PAYMENT']);
    constructionData.push(['Stage', 'Percentage', 'Amount', 'Description']);
    constructionData.push(['Land Settlement', '100%', landPrice, 'Full land payment at settlement']);
    constructionData.push([]);
    
    constructionData.push(['BUILD PAYMENT STAGES']);
    constructionData.push(['Stage', 'Percentage', 'Amount', 'Cumulative', 'Description']);
    
    let cumulativeAmount = 0;
    stages.slice(1).forEach(stage => {
      const amount = Math.round(buildPrice * (stage.percent / 100));
      cumulativeAmount += amount;
      constructionData.push([stage.stage, `${stage.percent}%`, amount, cumulativeAmount, stage.description]);
    });
    
    constructionData.push([]);
    constructionData.push(['TOTAL BUILD COST', '', buildPrice]);
    constructionData.push(['TOTAL PROJECT COST', '', financialData.purchasePrice]);
    constructionData.push([]);
    
    // Loan Draw Schedule
    constructionData.push(['LOAN DRAW SCHEDULE']);
    constructionData.push(['Stage', 'Draw Amount', 'Total Drawn', 'Interest (Monthly)', 'Notes']);
    
    const loanAmount = financialData.loanAmount || (financialData.purchasePrice * (financialData.loanToValueRatio / 100));
    const monthlyInterestRate = (financialData.interestRate / 100) / 12;
    
    // Land loan draw
    const landLoanDraw = Math.min(landPrice, loanAmount);
    let totalDrawn = landLoanDraw;
    constructionData.push(['Land Settlement', landLoanDraw, totalDrawn, Math.round(totalDrawn * monthlyInterestRate), 'Interest starts on land draw']);
    
    // Construction draws
    const remainingLoan = loanAmount - landLoanDraw;
    let constructionDrawn = 0;
    stages.slice(1).forEach(stage => {
      const buildAmount = Math.round(buildPrice * (stage.percent / 100));
      const drawAmount = Math.min(buildAmount, remainingLoan - constructionDrawn);
      constructionDrawn += drawAmount;
      totalDrawn = landLoanDraw + constructionDrawn;
      const monthlyInterest = Math.round(totalDrawn * monthlyInterestRate);
      constructionData.push([stage.stage, drawAmount, totalDrawn, monthlyInterest, stage.description]);
    });
    
    constructionData.push([]);
    constructionData.push(['FINAL LOAN AMOUNT', '', loanAmount]);
    constructionData.push(['ESTIMATED MONTHLY INTEREST (FULL DRAW)', '', Math.round(loanAmount * monthlyInterestRate)]);
    
    // Create construction worksheet
    const ws2 = XLSX.utils.aoa_to_sheet(constructionData);
    ws2['!cols'] = [
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 40 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws2, 'Construction Staging');
    
    // ==================== SHEET 3: Summary ====================
    const summaryData: (string | number | null)[][] = [];
    
    summaryData.push(['INVESTMENT SUMMARY']);
    summaryData.push([report.property_address]);
    summaryData.push([]);
    
    const year10 = projections[10];
    const year1 = projections[1];
    
    summaryData.push(['KEY METRICS']);
    summaryData.push(['Metric', 'Value']);
    summaryData.push(['Total Investment', financialData.purchasePrice + financialData.stampDuty + financialData.solicitorFees]);
    summaryData.push(['Deposit Required', financialData.depositValue]);
    summaryData.push(['Loan Amount', loanAmount]);
    summaryData.push([]);
    summaryData.push(['YEAR 1 PERFORMANCE']);
    summaryData.push(['Annual Rental Income', year1?.rentalIncome || 0]);
    summaryData.push(['Annual Expenses', year1?.propertyExpenses || 0]);
    summaryData.push(['Pre-Tax Cash Flow', year1?.preTaxCashFlowPA || 0]);
    summaryData.push(['After-Tax Cash Flow', year1?.afterTaxCashFlowPA || 0]);
    summaryData.push(['Gross Yield', `${year1?.grossYield || 0}%`]);
    summaryData.push(['Net Yield', `${year1?.netYield || 0}%`]);
    summaryData.push([]);
    summaryData.push(['YEAR 10 PROJECTION']);
    summaryData.push(['Property Value', year10?.propertyMarketValue || 0]);
    summaryData.push(['Equity Position', year10?.equityInProperty || 0]);
    summaryData.push(['Annual Rental Income', year10?.rentalIncome || 0]);
    summaryData.push(['After-Tax Cash Flow', year10?.afterTaxCashFlowPA || 0]);
    summaryData.push(['Capital Growth (Total)', year10 ? year10.propertyMarketValue - financialData.purchasePrice : 0]);
    
    const ws3 = XLSX.utils.aoa_to_sheet(summaryData);
    ws3['!cols'] = [{ wch: 30 }, { wch: 20 }];
    
    XLSX.utils.book_append_sheet(wb, ws3, 'Summary');
    
    // Export workbook
    const fileName = `Cash-Flow-Analysis-${report.property_address?.replace(/[^a-z0-9]/gi, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Export Complete",
      description: "Cash flow analysis exported to Excel file with construction staging.",
    });
  };

  if (!report || !financialData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col gap-0 p-0">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              10-Year Cash Flow Analysis
            </DialogTitle>
            <DialogDescription>
              {report.property_address}
            </DialogDescription>
          </DialogHeader>
        </div>

        <Separator />

        <ScrollArea className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 py-4">
            {/* Input Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    Purchase Price
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(financialData.purchasePrice)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Weekly Rent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(financialData.weeklyRent)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Interest Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatPercent(financialData.interestRate)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Capital Growth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatPercent(financialData.capitalGrowth)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Input Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Input Parameters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Land Price</p>
                    <p className="font-medium">{formatCurrency(financialData.landPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Build Price</p>
                    <p className="font-medium">{formatCurrency(financialData.buildPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Deposit</p>
                    <p className="font-medium">{formatCurrency(financialData.depositValue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">LVR</p>
                    <p className="font-medium">{formatPercent(financialData.loanToValueRatio)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stamp Duty</p>
                    <p className="font-medium">{formatCurrency(financialData.stampDuty)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Council Rates</p>
                    <p className="font-medium">{formatCurrency(financialData.councilRates)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Water Rates</p>
                    <p className="font-medium">{formatCurrency(financialData.waterRates)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Insurance</p>
                    <p className="font-medium">{formatCurrency(financialData.buildingLandlordInsurance)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Property Management</p>
                    <p className="font-medium">{formatPercent(financialData.propertyManagementFees)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Loan Type</p>
                    <p className="font-medium">{financialData.loanType === 'interest_only' ? 'Interest Only' : 'P&I'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">CPI Growth</p>
                    <p className="font-medium">{formatPercent(financialData.cpiGrowthRate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tax Rate</p>
                    <p className="font-medium">{formatPercent(financialData.taxRate)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cash Flow Overrides Section */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Edit2 className="h-4 w-4" />
                  Cash Flow Analysis Overrides
                  {hasChanges && <Badge variant="secondary" className="ml-2">Unsaved</Badge>}
                </CardTitle>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Reset to original values
                          const cfOverrides = report.manual_overrides?.cashFlowAnalysisOverrides || {};
                          setCashFlowOverrides({
                            capitalGrowthRate: cfOverrides.capitalGrowthRate ?? null,
                            cpiGrowthRate: cfOverrides.cpiGrowthRate ?? null,
                            propertyMarketValue: cfOverrides.propertyMarketValue ?? null,
                            rentalIncome: cfOverrides.rentalIncome ?? null,
                            propertyExpenses: cfOverrides.propertyExpenses ?? null,
                            interestRate: cfOverrides.interestRate ?? null,
                            interestPayment: cfOverrides.interestPayment ?? null,
                            principalPayment: cfOverrides.principalPayment ?? null,
                            depreciation: cfOverrides.depreciation ?? null,
                            landTax: cfOverrides.landTax ?? null,
                          });
                          setHasChanges(false);
                          setIsEditing(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveOverrides}
                        disabled={isSaving || !hasChanges}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Overrides
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Override specific values to customize the cash flow projections. Changes apply to Year 1 calculations and cascade through subsequent years.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {/* Capital Growth Rate */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Capital Growth Rate (%)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.1"
                        placeholder={String(baseFinancialData?.capitalGrowth || 5)}
                        value={cashFlowOverrides.capitalGrowthRate ?? ''}
                        onChange={(e) => handleOverrideChange('capitalGrowthRate', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.capitalGrowthRate !== null 
                          ? `${cashFlowOverrides.capitalGrowthRate}%` 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>

                  {/* CPI Growth Rate */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Consumer Price Index (%)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.1"
                        placeholder={String(baseFinancialData?.cpiGrowthRate || 3)}
                        value={cashFlowOverrides.cpiGrowthRate ?? ''}
                        onChange={(e) => handleOverrideChange('cpiGrowthRate', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.cpiGrowthRate !== null 
                          ? `${cashFlowOverrides.cpiGrowthRate}%` 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>

                  {/* Property Market Value */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Property Market Value ($)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="1000"
                        placeholder={String(baseFinancialData?.marketValueNow || 0)}
                        value={cashFlowOverrides.propertyMarketValue ?? ''}
                        onChange={(e) => handleOverrideChange('propertyMarketValue', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.propertyMarketValue !== null 
                          ? formatCurrency(cashFlowOverrides.propertyMarketValue) 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>

                  {/* Rental Income */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Rental Income p.a. ($)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="100"
                        placeholder={String((baseFinancialData?.weeklyRent || 0) * 52)}
                        value={cashFlowOverrides.rentalIncome ?? ''}
                        onChange={(e) => handleOverrideChange('rentalIncome', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.rentalIncome !== null 
                          ? formatCurrency(cashFlowOverrides.rentalIncome) 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>

                  {/* Property Expenses */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Property Expenses p.a. ($)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="100"
                        placeholder="Enter amount"
                        value={cashFlowOverrides.propertyExpenses ?? ''}
                        onChange={(e) => handleOverrideChange('propertyExpenses', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.propertyExpenses !== null 
                          ? formatCurrency(cashFlowOverrides.propertyExpenses) 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>

                  {/* Interest Rate */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Interest Rate (%)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.1"
                        placeholder={String(baseFinancialData?.interestRate || 5.5)}
                        value={cashFlowOverrides.interestRate ?? ''}
                        onChange={(e) => handleOverrideChange('interestRate', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.interestRate !== null 
                          ? `${cashFlowOverrides.interestRate}%` 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>

                  {/* Interest Payment */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Interest Payment p.a. ($)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="100"
                        placeholder="Enter amount"
                        value={cashFlowOverrides.interestPayment ?? ''}
                        onChange={(e) => handleOverrideChange('interestPayment', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.interestPayment !== null 
                          ? formatCurrency(cashFlowOverrides.interestPayment) 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>

                  {/* Principal Payment */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Principal Payment p.a. ($)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="100"
                        placeholder="Enter amount"
                        value={cashFlowOverrides.principalPayment ?? ''}
                        onChange={(e) => handleOverrideChange('principalPayment', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.principalPayment !== null 
                          ? formatCurrency(cashFlowOverrides.principalPayment) 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>

                  {/* Depreciation */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Depreciation p.a. ($)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="100"
                        placeholder={String(baseFinancialData?.depreciation || 6000)}
                        value={cashFlowOverrides.depreciation ?? ''}
                        onChange={(e) => handleOverrideChange('depreciation', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.depreciation !== null 
                          ? formatCurrency(cashFlowOverrides.depreciation) 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>

                  {/* Land Tax */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Land Tax p.a. ($)</Label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="100"
                        placeholder={String(baseFinancialData?.landTax || 0)}
                        value={cashFlowOverrides.landTax ?? ''}
                        onChange={(e) => handleOverrideChange('landTax', e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <p className="font-medium text-lg">
                        {cashFlowOverrides.landTax !== null 
                          ? formatCurrency(cashFlowOverrides.landTax) 
                          : <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 10-Year Projection Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">10-Year Projection Overview</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10">Overview</TableHead>
                        {projections.map(p => (
                          <TableHead key={p.year} className="text-center min-w-[100px]">
                            {p.year === 0 ? 'Today' : `Year ${p.year}`}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Capital Growth %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.capitalGrowthRate}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Property Value $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.propertyMarketValue.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Loan Amount $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.loanAmount.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="sticky left-0 bg-muted/30 font-medium" colSpan={12}>Statistics</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Equity $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center text-green-600">{p.equityInProperty.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">LVR %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.loanToValueRatio}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Rental Income $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">
                            {p.year === 0 ? `${financialData.weeklyRent}pw` : p.rentalIncome.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Gross Yield %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.grossYield}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Net Yield %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.netYield}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="sticky left-0 bg-muted/30 font-medium" colSpan={12}>Cash Deductions</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Property Expenses $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? 0 : p.propertyExpenses.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Interest Rate %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.interestRate}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Interest Payments $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? 0 : p.interestPayments.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Principal Payments $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.principalPayments}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Pre-Tax Cash Flow p/a $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center ${p.preTaxCashFlowPA < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.preTaxCashFlowPA.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Pre-Tax Cash Flow p/w $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center ${p.preTaxCashFlowPW < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.preTaxCashFlowPW.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="sticky left-0 bg-muted/30 font-medium" colSpan={12}>Non-Cash Deductions</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Depreciation $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.depreciation.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="sticky left-0 bg-muted/30 font-medium" colSpan={12}>Summary</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Total Deductions $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.totalDeductions.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Net Profit/Loss $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center ${p.netProfitLoss < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.netProfitLoss.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Tax Refund $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center text-green-600">{p.year === 0 ? '' : p.taxRefund.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Land Tax $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.landTax}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-primary/10">
                        <TableCell className="sticky left-0 bg-primary/10 font-bold">After-Tax Cash Flow p/a $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center font-bold ${p.afterTaxCashFlowPA < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.afterTaxCashFlowPA.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-primary/10">
                        <TableCell className="sticky left-0 bg-primary/10 font-bold">After-Tax Cash Flow p/w $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center font-bold ${p.afterTaxCashFlowPW < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.afterTaxCashFlowPW.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex items-center justify-between px-6 py-4">
          <div className="text-sm text-muted-foreground">
            Data sourced from investment report manual overrides
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Export to CSV
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
