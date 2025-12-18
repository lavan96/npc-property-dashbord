import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Calculator, Download, TrendingUp, DollarSign, Percent, Home, Save, RotateCcw, BarChart3, Image, GitCompare, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  cpiGrowthRate: number;
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

// Per-year override fields
interface YearOverrides {
  capitalGrowthRate?: number | null;
  cpiGrowthRate?: number | null;
  propertyMarketValue?: number | null;
  rentalIncome?: number | null;
  propertyExpenses?: number | null;
  interestRate?: number | null;
  interestPayment?: number | null;
  principalPayment?: number | null;
  depreciation?: number | null;
  landTax?: number | null;
}

// All year overrides (years 2-10)
type YearlyOverrides = {
  [year: number]: YearOverrides;
};

// Editable field configuration
const EDITABLE_FIELDS = [
  { key: 'capitalGrowthRate', label: 'Capital Growth %', type: 'percent', step: 0.1 },
  { key: 'cpiGrowthRate', label: 'CPI Growth %', type: 'percent', step: 0.1 },
  { key: 'propertyMarketValue', label: 'Property Value $', type: 'currency', step: 1000 },
  { key: 'rentalIncome', label: 'Rental Income $', type: 'currency', step: 100 },
  { key: 'propertyExpenses', label: 'Property Expenses $', type: 'currency', step: 100 },
  { key: 'interestRate', label: 'Interest Rate %', type: 'percent', step: 0.1 },
  { key: 'interestPayment', label: 'Interest Payments $', type: 'currency', step: 100 },
  { key: 'principalPayment', label: 'Principal Payments $', type: 'currency', step: 100 },
  { key: 'depreciation', label: 'Depreciation $', type: 'currency', step: 100 },
  { key: 'landTax', label: 'Land Tax $', type: 'currency', step: 100 },
] as const;

type EditableFieldKey = typeof EDITABLE_FIELDS[number]['key'];

export function CashFlowAnalysisModal({ report, isOpen, onClose, onReportUpdated }: CashFlowAnalysisModalProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [editingCell, setEditingCell] = useState<{ year: number; field: EditableFieldKey } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Chart metric visibility toggles
  const [chartMetrics, setChartMetrics] = useState({
    propertyValue: true,
    equity: true,
    rentalIncome: true,
    cashFlow: true,
  });
  
  // Per-year overrides state (years 2-10)
  const [yearlyOverrides, setYearlyOverrides] = useState<YearlyOverrides>({});

  // Chart refs for PNG export
  const cashFlowChartRef = useRef<HTMLDivElement>(null);
  const yieldChartRef = useRef<HTMLDivElement>(null);
  const comparisonChartRef = useRef<HTMLDivElement>(null);

  // Comparison mode state
  const [comparisonMode, setComparisonMode] = useState(false);
  const [availableReports, setAvailableReports] = useState<InvestmentReport[]>([]);
  const [selectedComparisonReportId, setSelectedComparisonReportId] = useState<string | null>(null);
  const [comparisonReport, setComparisonReport] = useState<InvestmentReport | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);

  // Initialize overrides from report when modal opens
  useEffect(() => {
    if (report && isOpen) {
      const cfOverrides = report.manual_overrides?.cashFlowYearlyOverrides || {};
      setYearlyOverrides(cfOverrides);
      setHasChanges(false);
      setEditingCell(null);
      setComparisonMode(false);
      setSelectedComparisonReportId(null);
      setComparisonReport(null);
    }
  }, [report, isOpen]);

  // Fetch available reports for comparison when comparison mode is enabled
  useEffect(() => {
    if (comparisonMode && isOpen && report) {
      const fetchReports = async () => {
        setLoadingReports(true);
        try {
          const { data, error } = await supabase
            .from('investment_reports')
            .select('id, property_address, financial_calculations, manual_overrides')
            .eq('status', 'completed')
            .neq('id', report.id)
            .order('created_at', { ascending: false })
            .limit(50);

          if (error) throw error;
          setAvailableReports(data || []);
        } catch (error) {
          console.error('Error fetching reports:', error);
        } finally {
          setLoadingReports(false);
        }
      };
      fetchReports();
    }
  }, [comparisonMode, isOpen, report]);

  // Fetch selected comparison report details
  useEffect(() => {
    if (selectedComparisonReportId) {
      const selectedReport = availableReports.find(r => r.id === selectedComparisonReportId);
      setComparisonReport(selectedReport || null);
    } else {
      setComparisonReport(null);
    }
  }, [selectedComparisonReportId, availableReports]);

  // PNG export function
  const exportChartAsPNG = useCallback(async (chartRef: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!chartRef.current) return;
    
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast({
        title: "Chart Exported",
        description: `${filename}.png has been downloaded.`,
      });
    } catch (error) {
      console.error('Error exporting chart:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export chart as PNG.",
        variant: "destructive"
      });
    }
  }, [toast]);

  // Calculate projections for comparison report
  const comparisonProjections = useMemo(() => {
    if (!comparisonReport) return [];

    const fc = comparisonReport.financial_calculations || {};
    const mo = comparisonReport.manual_overrides || {};
    const cashFlow = fc.cashFlow || {};
    const cfOverrides = mo.cashFlowYearlyOverrides || {};
    const includeDepreciation = mo.includeDepreciationInCashFlow !== false;

    const purchasePrice = mo.purchasePrice || fc.purchasePrice || fc.propertyValue || 0;
    const loanAmount = mo.loanAmount || cashFlow.loanAmount || (purchasePrice * ((mo.loanToValueRatio || fc.loanToValueRatio || 80) / 100));
    const weeklyRent = mo.weeklyRent || fc.weeklyRent || 0;
    const occupancyRate = mo.occupancyRate || cashFlow.occupancyRate || 52;
    const baseCapitalGrowthRate = (mo.capitalGrowth || fc.capitalGrowth || 5) / 100;
    const baseInterestRate = (mo.interestRate || fc.interestRate || 5.5) / 100;
    const baseCpiRate = (mo.cpiGrowthRate || cashFlow.cpiGrowthRate || 3) / 100;
    const taxRate = (mo.taxRate || cashFlow.taxRate || 30) / 100;
    const isInterestOnly = (mo.loanType || cashFlow.loanType || 'interest_only') === 'interest_only';
    const baseDepreciation = includeDepreciation ? (mo.depreciation || cashFlow.depreciation || 6000) : 0;
    const baseLandTax = mo.landTax || fc.landTax || 0;
    const marketValueNow = mo.marketValueNow || cashFlow.marketValueNow || purchasePrice;

    const baseExpenses = 
      (mo.councilRates || fc.councilRates || 0) +
      (mo.waterRates || fc.waterRates || 0) +
      (mo.bodyCorporateFees || fc.bodyCorporateFees || 0) +
      (mo.buildingLandlordInsurance || fc.buildingLandlordInsurance || 0) +
      (mo.repairsMaintenance || fc.repairsMaintenance || 0);
    const propertyManagementPercent = (mo.propertyManagementFees || fc.propertyManagementFees || 7) / 100;
    const baseAnnualRent = weeklyRent * occupancyRate;
    const basePropertyExpenses = baseExpenses + (baseAnnualRent * propertyManagementPercent);

    const results: YearlyProjection[] = [];
    let previousPropertyValue = marketValueNow;

    for (let year = 0; year <= 10; year++) {
      const yearOverrides = cfOverrides[year] || {};
      
      const yearCapitalGrowthRate = year >= 2 && yearOverrides.capitalGrowthRate != null
        ? yearOverrides.capitalGrowthRate / 100 : baseCapitalGrowthRate;
      const yearCpiRate = year >= 2 && yearOverrides.cpiGrowthRate != null
        ? yearOverrides.cpiGrowthRate / 100 : baseCpiRate;
      const yearInterestRate = year >= 2 && yearOverrides.interestRate != null
        ? yearOverrides.interestRate / 100 : baseInterestRate;

      let propertyValue: number;
      if (year === 0) propertyValue = marketValueNow;
      else if (year === 1) propertyValue = purchasePrice * (1 + baseCapitalGrowthRate);
      else if (yearOverrides.propertyMarketValue != null) propertyValue = yearOverrides.propertyMarketValue;
      else propertyValue = previousPropertyValue * (1 + yearCapitalGrowthRate);
      previousPropertyValue = propertyValue;

      const currentLoanAmount = loanAmount;
      const equity = propertyValue - currentLoanAmount;
      const lvr = (currentLoanAmount / propertyValue) * 100;

      let annualRent: number;
      if (year === 0) annualRent = baseAnnualRent;
      else if (year === 1) annualRent = baseAnnualRent * (1 + baseCpiRate);
      else if (yearOverrides.rentalIncome != null) annualRent = yearOverrides.rentalIncome;
      else annualRent = baseAnnualRent * Math.pow(1 + yearCpiRate, year);

      let totalExpenses: number;
      if (year === 0) totalExpenses = basePropertyExpenses;
      else if (year === 1) totalExpenses = baseExpenses * (1 + baseCpiRate) + annualRent * propertyManagementPercent;
      else if (yearOverrides.propertyExpenses != null) totalExpenses = yearOverrides.propertyExpenses;
      else totalExpenses = baseExpenses * Math.pow(1 + yearCpiRate, year) + annualRent * propertyManagementPercent;

      let interestPayments = year === 0 ? 0 : year === 1 ? currentLoanAmount * baseInterestRate :
        yearOverrides.interestPayment != null ? yearOverrides.interestPayment : currentLoanAmount * yearInterestRate;
      let principalPayments = year === 0 ? 0 : yearOverrides.principalPayment ?? 0;
      let depreciation = year === 0 ? 0 : yearOverrides.depreciation ?? baseDepreciation;
      let landTax = year === 0 ? 0 : yearOverrides.landTax ?? baseLandTax;

      const grossYield = year === 0 ? 0 : (annualRent / propertyValue) * 100;
      const netYield = year === 0 ? 0 : ((annualRent - totalExpenses) / propertyValue) * 100;
      const preTaxCashFlow = year === 0 ? 0 : annualRent - totalExpenses - interestPayments - principalPayments;
      const totalDeductions = totalExpenses + interestPayments + depreciation;
      const netProfitLoss = year === 0 ? 0 : annualRent - totalDeductions;
      const taxRefund = year === 0 ? 0 : (netProfitLoss < 0 ? Math.abs(netProfitLoss) * taxRate : 0);
      const afterTaxCashFlow = year === 0 ? 0 : preTaxCashFlow + taxRefund;

      results.push({
        year,
        capitalGrowthRate: year === 0 ? 0 : yearCapitalGrowthRate * 100,
        cpiGrowthRate: year === 0 ? 0 : yearCpiRate * 100,
        propertyMarketValue: Math.round(propertyValue),
        loanAmount: Math.round(currentLoanAmount),
        equityInProperty: Math.round(equity),
        loanToValueRatio: Math.round(lvr * 100) / 100,
        rentalIncome: Math.round(annualRent),
        grossYield: Math.round(grossYield * 100) / 100,
        netYield: Math.round(netYield * 100) / 100,
        propertyExpenses: Math.round(totalExpenses),
        interestRate: year === 0 ? 0 : yearInterestRate * 100,
        interestPayments: Math.round(interestPayments),
        principalPayments: Math.round(principalPayments),
        preTaxCashFlowPA: Math.round(preTaxCashFlow),
        preTaxCashFlowPW: Math.round(preTaxCashFlow / 52),
        depreciation: Math.round(depreciation),
        totalDeductions: Math.round(totalDeductions),
        netProfitLoss: Math.round(netProfitLoss),
        taxRefund: Math.round(taxRefund),
        landTax: Math.round(landTax),
        afterTaxCashFlowPA: Math.round(afterTaxCashFlow),
        afterTaxCashFlowPW: Math.round(afterTaxCashFlow / 52),
      });
    }
    return results;
  }, [comparisonReport]);

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

  // Get override value for a specific year and field
  const getOverrideValue = useCallback((year: number, field: EditableFieldKey): number | null => {
    return yearlyOverrides[year]?.[field] ?? null;
  }, [yearlyOverrides]);

  // Set override value for a specific year and field
  const setOverrideValue = useCallback((year: number, field: EditableFieldKey, value: number | null) => {
    setYearlyOverrides(prev => {
      const newOverrides = { ...prev };
      if (!newOverrides[year]) {
        newOverrides[year] = {};
      }
      newOverrides[year] = { ...newOverrides[year], [field]: value };
      return newOverrides;
    });
    setHasChanges(true);
  }, []);

  // Handle cell edit start
  const handleCellEditStart = useCallback((year: number, field: EditableFieldKey, currentValue: number) => {
    const overrideValue = getOverrideValue(year, field);
    setEditingCell({ year, field });
    setEditValue(overrideValue !== null ? String(overrideValue) : String(currentValue));
  }, [getOverrideValue]);

  // Handle cell edit commit
  const handleCellEditCommit = useCallback(() => {
    if (!editingCell) return;
    
    const numValue = editValue === '' ? null : parseFloat(editValue);
    if (numValue !== null && isNaN(numValue)) {
      setEditingCell(null);
      return;
    }
    
    setOverrideValue(editingCell.year, editingCell.field, numValue);
    setEditingCell(null);
  }, [editingCell, editValue, setOverrideValue]);

  // Handle key press in edit mode
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellEditCommit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }, [handleCellEditCommit]);

  // Save overrides to database
  const handleSaveOverrides = async () => {
    if (!report) return;

    setIsSaving(true);
    try {
      const existingOverrides = report.manual_overrides || {};
      const updatedOverrides = {
        ...existingOverrides,
        cashFlowYearlyOverrides: yearlyOverrides
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

  // Reset all overrides
  const handleResetOverrides = useCallback(() => {
    setYearlyOverrides({});
    setHasChanges(true);
    setShowResetConfirm(false);
  }, []);

  // Calculate 10-year projections with per-year overrides
  const projections = useMemo(() => {
    if (!baseFinancialData) return [];

    const results: YearlyProjection[] = [];
    
    // Calculate initial values
    const purchasePrice = baseFinancialData.purchasePrice;
    const loanAmount = baseFinancialData.loanAmount || (purchasePrice * (baseFinancialData.loanToValueRatio / 100));
    const weeklyRent = baseFinancialData.weeklyRent;
    const occupancyRate = baseFinancialData.occupancyRate;
    const baseCapitalGrowthRate = baseFinancialData.capitalGrowth / 100;
    const baseInterestRate = baseFinancialData.interestRate / 100;
    const baseCpiRate = baseFinancialData.cpiGrowthRate / 100;
    const taxRate = baseFinancialData.taxRate / 100;
    const isInterestOnly = baseFinancialData.loanType === 'interest_only';

    // Calculate initial annual expenses
    const baseExpenses = 
      baseFinancialData.councilRates +
      baseFinancialData.waterRates +
      baseFinancialData.bodyCorporateFees +
      baseFinancialData.buildingLandlordInsurance +
      baseFinancialData.repairsMaintenance;

    // Calculate property management as percentage of rent
    const propertyManagementPercent = baseFinancialData.propertyManagementFees / 100;

    // Base calculated values for Year 1
    const baseAnnualRent = weeklyRent * occupancyRate;
    const basePropertyExpenses = baseExpenses + (baseAnnualRent * propertyManagementPercent);
    const baseInterestPayment = loanAmount * baseInterestRate;
    const basePrincipalPayment = isInterestOnly ? 0 : 0;

    // Track cumulative values that can be affected by overrides
    let previousPropertyValue = baseFinancialData.marketValueNow || purchasePrice;

    for (let year = 0; year <= 10; year++) {
      const yearOverrides = yearlyOverrides[year] || {};
      
      // Get rates for this year (use override or base)
      const yearCapitalGrowthRate = year >= 2 && yearOverrides.capitalGrowthRate !== undefined && yearOverrides.capitalGrowthRate !== null
        ? yearOverrides.capitalGrowthRate / 100
        : baseCapitalGrowthRate;
      
      const yearCpiRate = year >= 2 && yearOverrides.cpiGrowthRate !== undefined && yearOverrides.cpiGrowthRate !== null
        ? yearOverrides.cpiGrowthRate / 100
        : baseCpiRate;
      
      const yearInterestRate = year >= 2 && yearOverrides.interestRate !== undefined && yearOverrides.interestRate !== null
        ? yearOverrides.interestRate / 100
        : baseInterestRate;

      // Property value
      let propertyValue: number;
      if (year === 0) {
        propertyValue = baseFinancialData.marketValueNow || purchasePrice;
      } else if (year === 1) {
        propertyValue = purchasePrice * (1 + baseCapitalGrowthRate);
      } else if (yearOverrides.propertyMarketValue !== undefined && yearOverrides.propertyMarketValue !== null) {
        propertyValue = yearOverrides.propertyMarketValue;
      } else {
        // Calculate based on previous year's value and this year's growth rate
        propertyValue = previousPropertyValue * (1 + yearCapitalGrowthRate);
      }
      previousPropertyValue = propertyValue;

      // Loan balance
      const currentLoanAmount = isInterestOnly ? loanAmount : loanAmount;

      // Equity
      const equity = propertyValue - currentLoanAmount;

      // LVR
      const lvr = (currentLoanAmount / propertyValue) * 100;

      // Rental income
      let annualRent: number;
      if (year === 0) {
        annualRent = baseAnnualRent;
      } else if (year === 1) {
        annualRent = baseAnnualRent * (1 + baseCpiRate);
      } else if (yearOverrides.rentalIncome !== undefined && yearOverrides.rentalIncome !== null) {
        annualRent = yearOverrides.rentalIncome;
      } else {
        annualRent = baseAnnualRent * Math.pow(1 + yearCpiRate, year);
      }

      // Property expenses
      let totalExpenses: number;
      if (year === 0) {
        totalExpenses = basePropertyExpenses;
      } else if (year === 1) {
        const expenses = baseExpenses * (1 + baseCpiRate);
        const propertyManagement = annualRent * propertyManagementPercent;
        totalExpenses = expenses + propertyManagement;
      } else if (yearOverrides.propertyExpenses !== undefined && yearOverrides.propertyExpenses !== null) {
        totalExpenses = yearOverrides.propertyExpenses;
      } else {
        const expenses = baseExpenses * Math.pow(1 + yearCpiRate, year);
        const propertyManagement = annualRent * propertyManagementPercent;
        totalExpenses = expenses + propertyManagement;
      }

      // Interest payments
      let interestPayments: number;
      if (year === 0) {
        interestPayments = 0;
      } else if (year === 1) {
        interestPayments = currentLoanAmount * baseInterestRate;
      } else if (yearOverrides.interestPayment !== undefined && yearOverrides.interestPayment !== null) {
        interestPayments = yearOverrides.interestPayment;
      } else {
        interestPayments = currentLoanAmount * yearInterestRate;
      }

      // Principal payments
      let principalPayments: number;
      if (year === 0) {
        principalPayments = 0;
      } else if (year === 1) {
        principalPayments = basePrincipalPayment;
      } else if (yearOverrides.principalPayment !== undefined && yearOverrides.principalPayment !== null) {
        principalPayments = yearOverrides.principalPayment;
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
      let depreciation: number;
      if (year === 0) {
        depreciation = 0;
      } else if (year === 1) {
        depreciation = baseFinancialData.depreciation;
      } else if (yearOverrides.depreciation !== undefined && yearOverrides.depreciation !== null) {
        depreciation = yearOverrides.depreciation;
      } else {
        depreciation = baseFinancialData.depreciation;
      }

      // Land tax
      let landTax: number;
      if (year === 0) {
        landTax = 0;
      } else if (year === 1) {
        landTax = baseFinancialData.landTax;
      } else if (yearOverrides.landTax !== undefined && yearOverrides.landTax !== null) {
        landTax = yearOverrides.landTax;
      } else {
        landTax = baseFinancialData.landTax;
      }

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
        capitalGrowthRate: year === 0 ? 0 : (yearCapitalGrowthRate * 100),
        cpiGrowthRate: year === 0 ? 0 : (yearCpiRate * 100),
        propertyMarketValue: Math.round(propertyValue),
        loanAmount: Math.round(currentLoanAmount),
        equityInProperty: Math.round(equity),
        loanToValueRatio: Math.round(lvr * 100) / 100,
        rentalIncome: Math.round(annualRent),
        grossYield: Math.round(grossYield * 100) / 100,
        netYield: Math.round(netYield * 100) / 100,
        propertyExpenses: Math.round(totalExpenses),
        interestRate: year === 0 ? 0 : (yearInterestRate * 100),
        interestPayments: Math.round(interestPayments),
        principalPayments: Math.round(principalPayments),
        preTaxCashFlowPA: Math.round(preTaxCashFlow),
        preTaxCashFlowPW: Math.round(preTaxCashFlow / 52),
        depreciation: Math.round(depreciation),
        totalDeductions: Math.round(totalDeductions),
        netProfitLoss: Math.round(netProfitLoss),
        taxRefund: Math.round(taxRefund),
        landTax: landTax,
        afterTaxCashFlowPA: Math.round(afterTaxCashFlow),
        afterTaxCashFlowPW: Math.round(afterTaxCashFlow / 52),
      });
    }

    return results;
  }, [baseFinancialData, yearlyOverrides]);

  const formatCurrency = (value: number) => {
    if (value === 0) return '-';
    const formatted = Math.abs(value).toLocaleString('en-AU', { maximumFractionDigits: 0 });
    return value < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Check if a cell has an override
  const hasOverride = useCallback((year: number, field: EditableFieldKey): boolean => {
    const value = yearlyOverrides[year]?.[field];
    return value !== undefined && value !== null;
  }, [yearlyOverrides]);

  // Render editable cell
  const renderEditableCell = useCallback((
    year: number, 
    field: EditableFieldKey, 
    displayValue: number,
    formatFn: (val: number) => string
  ) => {
    const isEditing = editingCell?.year === year && editingCell?.field === field;
    const isEditable = year >= 2; // Only years 2-10 are editable
    const hasOverrideValue = hasOverride(year, field);
    const fieldConfig = EDITABLE_FIELDS.find(f => f.key === field);
    
    if (isEditing) {
      return (
        <Input
          type="number"
          step={fieldConfig?.step || 1}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellEditCommit}
          onKeyDown={handleEditKeyDown}
          autoFocus
          className="h-7 w-full min-w-[80px] text-center text-xs p-1"
        />
      );
    }

    if (isEditable) {
      return (
        <button
          onClick={() => handleCellEditStart(year, field, displayValue)}
          className={`w-full text-center cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5 transition-colors ${
            hasOverrideValue ? 'bg-primary/10 font-semibold text-primary' : ''
          }`}
          title={hasOverrideValue ? 'Click to edit (overridden)' : 'Click to edit'}
        >
          {formatFn(displayValue)}
        </button>
      );
    }

    return <span>{formatFn(displayValue)}</span>;
  }, [editingCell, editValue, hasOverride, handleCellEditStart, handleCellEditCommit, handleEditKeyDown]);

  const handleExportExcel = () => {
    if (!baseFinancialData || !report) return;

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
    analysisData.push(['Purchase Price', baseFinancialData.purchasePrice]);
    analysisData.push(['Land Price', baseFinancialData.landPrice]);
    analysisData.push(['Build Price', baseFinancialData.buildPrice]);
    analysisData.push(['Market Value Now', baseFinancialData.marketValueNow]);
    analysisData.push(['Deposit', baseFinancialData.depositValue]);
    analysisData.push(['Loan Amount', baseFinancialData.loanAmount || (baseFinancialData.purchasePrice * (baseFinancialData.loanToValueRatio / 100))]);
    analysisData.push(['LVR %', baseFinancialData.loanToValueRatio]);
    analysisData.push(['Interest Rate %', baseFinancialData.interestRate]);
    analysisData.push(['Loan Type', baseFinancialData.loanType === 'interest_only' ? 'Interest Only' : 'Principal & Interest']);
    analysisData.push(['Loan Term (Years)', baseFinancialData.loanTermYears]);
    analysisData.push([]);
    
    // Rental Income
    analysisData.push(['RENTAL INCOME']);
    analysisData.push(['Weekly Rent', baseFinancialData.weeklyRent]);
    analysisData.push(['Annual Rent', baseFinancialData.weeklyRent * baseFinancialData.occupancyRate]);
    analysisData.push(['Occupancy (Weeks/Year)', baseFinancialData.occupancyRate]);
    analysisData.push([]);
    
    // Expenses
    analysisData.push(['ANNUAL EXPENSES']);
    analysisData.push(['Stamp Duty (One-off)', baseFinancialData.stampDuty]);
    analysisData.push(['Council Rates', baseFinancialData.councilRates]);
    analysisData.push(['Water Rates', baseFinancialData.waterRates]);
    analysisData.push(['Body Corporate/Strata', baseFinancialData.bodyCorporateFees]);
    analysisData.push(['Building & Landlord Insurance', baseFinancialData.buildingLandlordInsurance]);
    analysisData.push(['Property Management %', baseFinancialData.propertyManagementFees]);
    analysisData.push(['Repairs & Maintenance', baseFinancialData.repairsMaintenance]);
    analysisData.push(['Letting Fees', baseFinancialData.lettingFees]);
    analysisData.push(['Land Tax', baseFinancialData.landTax]);
    analysisData.push([]);
    
    // Tax & Growth
    analysisData.push(['TAX & GROWTH']);
    analysisData.push(['Capital Growth Rate %', baseFinancialData.capitalGrowth]);
    analysisData.push(['CPI Growth Rate %', baseFinancialData.cpiGrowthRate]);
    analysisData.push(['Depreciation p.a.', baseFinancialData.depreciation]);
    analysisData.push(['Tax Rate %', baseFinancialData.taxRate]);
    analysisData.push([]);

    // Create first worksheet
    const ws1 = XLSX.utils.aoa_to_sheet(analysisData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Input Parameters');

    // ==================== SHEET 2: 10 Year Projections ====================
    const projectionData: (string | number | null)[][] = [];
    
    // Header row
    projectionData.push(['10 YEAR CASH FLOW PROJECTIONS']);
    projectionData.push([report.property_address]);
    projectionData.push([]);
    
    // Column headers
    const headers = ['Metric', 'Today', ...Array.from({ length: 10 }, (_, i) => `Year ${i + 1}`)];
    projectionData.push(headers);
    
    // Data rows with per-year overridden values
    projectionData.push(['Capital Growth %', ...projections.map(p => p.year === 0 ? '' : p.capitalGrowthRate)]);
    projectionData.push(['CPI Growth %', ...projections.map(p => p.year === 0 ? '' : p.cpiGrowthRate)]);
    projectionData.push(['Property Value $', ...projections.map(p => p.propertyMarketValue)]);
    projectionData.push(['Loan Amount $', ...projections.map(p => p.loanAmount)]);
    projectionData.push([]);
    projectionData.push(['STATISTICS']);
    projectionData.push(['Equity $', ...projections.map(p => p.equityInProperty)]);
    projectionData.push(['LVR %', ...projections.map(p => p.loanToValueRatio)]);
    projectionData.push(['Rental Income $', ...projections.map(p => p.year === 0 ? `${baseFinancialData.weeklyRent}pw` : p.rentalIncome)]);
    projectionData.push(['Gross Yield %', ...projections.map(p => p.year === 0 ? '' : p.grossYield)]);
    projectionData.push(['Net Yield %', ...projections.map(p => p.year === 0 ? '' : p.netYield)]);
    projectionData.push([]);
    projectionData.push(['CASH DEDUCTIONS']);
    projectionData.push(['Property Expenses $', ...projections.map(p => p.year === 0 ? 0 : p.propertyExpenses)]);
    projectionData.push(['Interest Rate %', ...projections.map(p => p.year === 0 ? '' : p.interestRate)]);
    projectionData.push(['Interest Payments $', ...projections.map(p => p.year === 0 ? 0 : p.interestPayments)]);
    projectionData.push(['Principal Payments $', ...projections.map(p => p.principalPayments)]);
    projectionData.push(['Pre-Tax Cash Flow p/a $', ...projections.map(p => p.year === 0 ? '' : p.preTaxCashFlowPA)]);
    projectionData.push(['Pre-Tax Cash Flow p/w $', ...projections.map(p => p.year === 0 ? '' : p.preTaxCashFlowPW)]);
    projectionData.push([]);
    projectionData.push(['NON-CASH DEDUCTIONS']);
    projectionData.push(['Depreciation $', ...projections.map(p => p.year === 0 ? '' : p.depreciation)]);
    projectionData.push([]);
    projectionData.push(['SUMMARY']);
    projectionData.push(['Total Deductions $', ...projections.map(p => p.year === 0 ? '' : p.totalDeductions)]);
    projectionData.push(['Net Profit/Loss $', ...projections.map(p => p.year === 0 ? '' : p.netProfitLoss)]);
    projectionData.push(['Tax Refund $', ...projections.map(p => p.year === 0 ? '' : p.taxRefund)]);
    projectionData.push(['Land Tax $', ...projections.map(p => p.year === 0 ? '' : p.landTax)]);
    projectionData.push(['After-Tax Cash Flow p/a $', ...projections.map(p => p.year === 0 ? '' : p.afterTaxCashFlowPA)]);
    projectionData.push(['After-Tax Cash Flow p/w $', ...projections.map(p => p.year === 0 ? '' : p.afterTaxCashFlowPW)]);

    // Create second worksheet
    const ws2 = XLSX.utils.aoa_to_sheet(projectionData);
    
    // Set column widths
    ws2['!cols'] = [
      { wch: 25 }, // Metric column
      ...Array(11).fill({ wch: 15 }) // Year columns
    ];
    
    XLSX.utils.book_append_sheet(wb, ws2, '10 Year Projections');

    // Download
    const fileName = `Cash_Flow_Analysis_${report.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Export Successful",
      description: "Cash flow analysis has been exported to Excel.",
    });
  };

  if (!report || !baseFinancialData) return null;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col gap-0 p-0">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  10-Year Cash Flow Analysis
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {report.property_address}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                    Unsaved Changes
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={Object.keys(yearlyOverrides).length === 0}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset All
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveOverrides}
                  disabled={isSaving || !hasChanges}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
              </div>
            </div>
          </DialogHeader>
        </div>

        <Separator />

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">
            {/* Key Metrics Summary */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Home className="h-4 w-4" />
                    <span className="text-xs font-medium">Property Value</span>
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(baseFinancialData.marketValueNow)}</p>
                  <p className="text-xs text-muted-foreground">Current market value</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs font-medium">10-Year Value</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {projections.length > 0 ? formatCurrency(projections[10]?.propertyMarketValue || 0) : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">Projected property value</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs font-medium">Year 10 Cash Flow</span>
                  </div>
                  <p className={`text-2xl font-bold ${(projections[10]?.afterTaxCashFlowPA || 0) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {projections.length > 0 ? formatCurrency(projections[10]?.afterTaxCashFlowPA || 0) : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">After-tax annual cash flow</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Percent className="h-4 w-4" />
                    <span className="text-xs font-medium">Year 10 Equity</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {projections.length > 0 ? formatCurrency(projections[10]?.equityInProperty || 0) : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">Equity in property</p>
                </CardContent>
              </Card>
            </div>

            {/* Comparison Mode Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant={comparisonMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setComparisonMode(!comparisonMode)}
                  className="gap-2"
                >
                  <GitCompare className="h-4 w-4" />
                  {comparisonMode ? "Exit Comparison" : "Compare Reports"}
                </Button>
                {comparisonMode && (
                  <Select
                    value={selectedComparisonReportId || ""}
                    onValueChange={(value) => setSelectedComparisonReportId(value || null)}
                  >
                    <SelectTrigger className="w-[280px]">
                      <SelectValue placeholder={loadingReports ? "Loading reports..." : "Select report to compare"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableReports.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.property_address.length > 40 
                            ? r.property_address.substring(0, 40) + '...' 
                            : r.property_address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Cash Flow Trends Chart */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    10-Year Cash Flow Trends
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={chartMetrics.propertyValue}
                          onChange={(e) => setChartMetrics(prev => ({ ...prev, propertyValue: e.target.checked }))}
                          className="rounded border-border"
                        />
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                          Property Value
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={chartMetrics.equity}
                          onChange={(e) => setChartMetrics(prev => ({ ...prev, equity: e.target.checked }))}
                          className="rounded border-border"
                        />
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Equity
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={chartMetrics.rentalIncome}
                          onChange={(e) => setChartMetrics(prev => ({ ...prev, rentalIncome: e.target.checked }))}
                          className="rounded border-border"
                        />
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Rental Income
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={chartMetrics.cashFlow}
                          onChange={(e) => setChartMetrics(prev => ({ ...prev, cashFlow: e.target.checked }))}
                          className="rounded border-border"
                        />
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-violet-500" />
                          Cash Flow
                        </span>
                      </label>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => exportChartAsPNG(cashFlowChartRef, 'cash-flow-trends')}
                      className="h-7 px-2"
                    >
                      <Image className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div ref={cashFlowChartRef} className="h-[280px] w-full bg-background p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={projections.filter(p => p.year >= 1).map(p => ({
                        year: `Year ${p.year}`,
                        'Property Value': p.propertyMarketValue,
                        'Rental Income': p.rentalIncome,
                        'Cash Flow (After Tax)': p.afterTaxCashFlowPA,
                        'Equity': p.equityInProperty,
                      }))}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="year" className="text-xs" tick={{ fontSize: 11 }} />
                      <YAxis 
                        className="text-xs" 
                        tick={{ fontSize: 11 }} 
                        tickFormatter={(value) => {
                          if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                          if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                          return `$${value}`;
                        }}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`$${value.toLocaleString()}`, undefined]}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      {chartMetrics.propertyValue && (
                        <Line 
                          type="monotone" 
                          dataKey="Property Value" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      )}
                      {chartMetrics.equity && (
                        <Line 
                          type="monotone" 
                          dataKey="Equity" 
                          stroke="#22c55e" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      )}
                      {chartMetrics.rentalIncome && (
                        <Line 
                          type="monotone" 
                          dataKey="Rental Income" 
                          stroke="#f59e0b" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      )}
                      {chartMetrics.cashFlow && (
                        <Line 
                          type="monotone" 
                          dataKey="Cash Flow (After Tax)" 
                          stroke="#8b5cf6" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Yield Percentages Chart */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Yield Percentages Over 10 Years
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportChartAsPNG(yieldChartRef, 'yield-percentages')}
                    className="h-7 px-2"
                  >
                    <Image className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div ref={yieldChartRef} className="h-[220px] w-full bg-background p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={projections.filter(p => p.year >= 1).map(p => ({
                        year: `Year ${p.year}`,
                        'Gross Yield %': p.grossYield,
                        'Net Yield %': p.netYield,
                      }))}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="year" className="text-xs" tick={{ fontSize: 11 }} />
                      <YAxis 
                        className="text-xs" 
                        tick={{ fontSize: 11 }} 
                        tickFormatter={(value) => `${value}%`}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`${value.toFixed(2)}%`, undefined]}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Line 
                        type="monotone" 
                        dataKey="Gross Yield %" 
                        stroke="#06b6d4" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Net Yield %" 
                        stroke="#ec4899" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Comparison Chart - Side by Side */}
            {comparisonMode && comparisonReport && comparisonProjections.length > 0 && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <GitCompare className="h-4 w-4" />
                      Property Comparison: Cash Flow
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {report?.property_address.split(',')[0]} vs {comparisonReport.property_address.split(',')[0]}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => exportChartAsPNG(comparisonChartRef, 'property-comparison')}
                        className="h-7 px-2"
                      >
                        <Image className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div ref={comparisonChartRef} className="h-[320px] w-full bg-background p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={projections.filter(p => p.year >= 1).map((p, i) => ({
                          year: `Year ${p.year}`,
                          [`${report?.property_address.split(',')[0]} - Value`]: p.propertyMarketValue,
                          [`${report?.property_address.split(',')[0]} - Cash Flow`]: p.afterTaxCashFlowPA,
                          [`${comparisonReport.property_address.split(',')[0]} - Value`]: comparisonProjections[i + 1]?.propertyMarketValue || 0,
                          [`${comparisonReport.property_address.split(',')[0]} - Cash Flow`]: comparisonProjections[i + 1]?.afterTaxCashFlowPA || 0,
                        }))}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="year" className="text-xs" tick={{ fontSize: 11 }} />
                        <YAxis 
                          className="text-xs" 
                          tick={{ fontSize: 11 }} 
                          tickFormatter={(value) => {
                            if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                            if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                            return `$${value}`;
                          }}
                        />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, undefined]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px',
                            fontSize: '11px'
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Line 
                          type="monotone" 
                          dataKey={`${report?.property_address.split(',')[0]} - Value`}
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey={`${report?.property_address.split(',')[0]} - Cash Flow`}
                          stroke="#8b5cf6" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey={`${comparisonReport.property_address.split(',')[0]} - Value`}
                          stroke="#f97316" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey={`${comparisonReport.property_address.split(',')[0]} - Cash Flow`}
                          stroke="#14b8a6" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Side-by-side summary */}
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <Card className="border-primary/20">
                      <CardContent className="pt-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2 truncate">{report?.property_address}</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Year 10 Value:</span>
                            <span className="font-medium text-green-600">${(projections[10]?.propertyMarketValue || 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Year 10 Cash Flow:</span>
                            <span className={`font-medium ${(projections[10]?.afterTaxCashFlowPA || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              ${(projections[10]?.afterTaxCashFlowPA || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Year 10 Equity:</span>
                            <span className="font-medium">${(projections[10]?.equityInProperty || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-orange-500/20">
                      <CardContent className="pt-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2 truncate">{comparisonReport.property_address}</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Year 10 Value:</span>
                            <span className="font-medium text-green-600">${(comparisonProjections[10]?.propertyMarketValue || 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Year 10 Cash Flow:</span>
                            <span className={`font-medium ${(comparisonProjections[10]?.afterTaxCashFlowPA || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              ${(comparisonProjections[10]?.afterTaxCashFlowPA || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Year 10 Equity:</span>
                            <span className="font-medium">${(comparisonProjections[10]?.equityInProperty || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Edit Instructions */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-3">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> Click on any cell in Years 2-10 to edit values directly. Year 1 is the reference point and cannot be edited. 
                  Cells with <span className="text-primary font-semibold">blue highlighting</span> have been overridden.
                </p>
              </CardContent>
            </Card>

            {/* 10-Year Projection Table with Inline Editing */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">10-Year Projection Overview</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Overview</TableHead>
                        {projections.map(p => (
                          <TableHead key={p.year} className="text-center min-w-[100px]">
                            {p.year === 0 ? 'Today' : `Year ${p.year}`}
                            {p.year >= 2 && <span className="block text-[10px] font-normal text-muted-foreground">editable</span>}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Capital Growth Rate - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Capital Growth %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {p.year === 0 ? '' : renderEditableCell(
                              p.year,
                              'capitalGrowthRate',
                              p.capitalGrowthRate,
                              (v) => formatPercent(v)
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      
                      {/* CPI Growth Rate - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">CPI Growth %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {p.year === 0 ? '' : renderEditableCell(
                              p.year,
                              'cpiGrowthRate',
                              p.cpiGrowthRate,
                              (v) => formatPercent(v)
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      
                      {/* Property Value - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Property Value $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {renderEditableCell(
                              p.year,
                              'propertyMarketValue',
                              p.propertyMarketValue,
                              (v) => v.toLocaleString()
                            )}
                          </TableCell>
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
                      
                      {/* Rental Income - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Rental Income $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {p.year === 0 ? `${baseFinancialData.weeklyRent}pw` : renderEditableCell(
                              p.year,
                              'rentalIncome',
                              p.rentalIncome,
                              (v) => v.toLocaleString()
                            )}
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
                      
                      {/* Property Expenses - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Property Expenses $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {p.year === 0 ? '0' : renderEditableCell(
                              p.year,
                              'propertyExpenses',
                              p.propertyExpenses,
                              (v) => v.toLocaleString()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      
                      {/* Interest Rate - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Interest Rate %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {p.year === 0 ? '' : renderEditableCell(
                              p.year,
                              'interestRate',
                              p.interestRate,
                              (v) => formatPercent(v)
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      
                      {/* Interest Payments - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Interest Payments $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {p.year === 0 ? '0' : renderEditableCell(
                              p.year,
                              'interestPayment',
                              p.interestPayments,
                              (v) => v.toLocaleString()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      
                      {/* Principal Payments - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Principal Payments $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {p.year === 0 ? '0' : renderEditableCell(
                              p.year,
                              'principalPayment',
                              p.principalPayments,
                              (v) => v.toLocaleString()
                            )}
                          </TableCell>
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
                      
                      {/* Depreciation - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Depreciation $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {p.year === 0 ? '' : renderEditableCell(
                              p.year,
                              'depreciation',
                              p.depreciation,
                              (v) => v.toLocaleString()
                            )}
                          </TableCell>
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
                      
                      {/* Land Tax - Editable */}
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Land Tax $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center p-1">
                            {p.year === 0 ? '' : renderEditableCell(
                              p.year,
                              'landTax',
                              p.landTax,
                              (v) => v.toLocaleString()
                            )}
                          </TableCell>
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

        <div className="px-6 py-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Reset Confirmation Dialog */}
    <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset All Overrides?</AlertDialogTitle>
          <AlertDialogDescription>
            This will clear all custom override values across all years and revert to calculated defaults. 
            You'll still need to click "Save Changes" to persist the reset.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleResetOverrides}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Reset All
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
