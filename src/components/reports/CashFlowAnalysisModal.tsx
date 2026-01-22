import { useState, useEffect, useMemo, useCallback, useRef } from 'react'; // Enhanced PDF export
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
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
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Calculator, Download, TrendingUp, DollarSign, Percent, Home, Save, RotateCcw, BarChart3, Image, GitCompare, X, FileText, Target, Zap, Building, Award, Printer, ChevronDown, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  get10YearLoanProjection, 
  type MortgageInput, 
  type RateChange,
  type RepaymentFrequency,
  type LoanType 
} from '@/utils/mortgageCalculations';

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

// All year overrides (years 1-10)
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

// Template configuration interface for Cash Flow PDF export
interface CashFlowTemplateConfig {
  id: string;
  name: string;
  companyName: string;
  companyNameLine2: string;
  tagline: string;
  contactPhone: string;
  contactEmail: string;
  website: string;
  disclaimer: string;
}

// Default NPC Brand configuration for Cash Flow exports
const defaultCashFlowConfig: CashFlowTemplateConfig = {
  id: 'default',
  name: 'Default NPC Template',
  companyName: 'NAIDU PROPERTY',
  companyNameLine2: 'CONSULTING SERVICES',
  tagline: 'YOUR DEDICATED PROPERTY PARTNER',
  contactPhone: '0433 005 110',
  contactEmail: 'admin@npcservices.com.au',
  website: 'npcservices.com.au',
  disclaimer: 'This analysis is for informational purposes only and does not constitute financial advice. Projections are estimates based on assumed growth rates.',
};

// Function to load active Cash Flow export template
const loadActiveCashFlowTemplate = async (): Promise<CashFlowTemplateConfig> => {
  try {
    // Fetch active cashflow_export template
    const { data: template, error } = await supabase
      .from('report_structure_templates')
      .select('*')
      .eq('template_type', 'cashflow_export' as any)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching Cash Flow template:', error);
      return defaultCashFlowConfig;
    }

    if (!template) {
      console.log('No active Cash Flow template found, using default');
      return defaultCashFlowConfig;
    }

    // Parse metadata for custom configuration if available
    const metadata = template.metadata as Record<string, any> | null;
    
    if (metadata?.branding) {
      const branding = metadata.branding;
      return {
        id: template.id,
        name: template.name,
        companyName: branding.companyName || defaultCashFlowConfig.companyName,
        companyNameLine2: branding.companyNameLine2 || defaultCashFlowConfig.companyNameLine2,
        tagline: branding.tagline || defaultCashFlowConfig.tagline,
        contactPhone: branding.contactPhone || defaultCashFlowConfig.contactPhone,
        contactEmail: branding.contactEmail || defaultCashFlowConfig.contactEmail,
        website: branding.website || defaultCashFlowConfig.website,
        disclaimer: branding.disclaimer || defaultCashFlowConfig.disclaimer,
      };
    }

    // Template exists but no custom branding - use default with template name
    console.log(`Using template "${template.name}" with default styling`);
    return {
      ...defaultCashFlowConfig,
      id: template.id,
      name: template.name,
    };
  } catch (err) {
    console.error('Failed to load Cash Flow template:', err);
    return defaultCashFlowConfig;
  }
};

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

  // Comparison mode state - support up to 5 properties (1 primary + 4 comparison)
  const [comparisonMode, setComparisonMode] = useState(false);
  const [availableReports, setAvailableReports] = useState<InvestmentReport[]>([]);
  const [selectedComparisonReportIds, setSelectedComparisonReportIds] = useState<string[]>([]);
  const [comparisonReports, setComparisonReports] = useState<InvestmentReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [investorProfile, setInvestorProfile] = useState<'growth' | 'income' | 'balanced'>('balanced');
  
  // AI-powered comparison analysis state
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isGeneratingAiAnalysis, setIsGeneratingAiAnalysis] = useState(false);
  const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null);
  const [isSavingAnalysis, setIsSavingAnalysis] = useState(false);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);

  // Inputs Summary state
  const [inputsSummaryOpen, setInputsSummaryOpen] = useState(true);
  const [includeInputsSummaryInExport, setIncludeInputsSummaryInExport] = useState(true);
  
  // Land tax exclusion toggle
  const [excludeLandTaxFromCashFlow, setExcludeLandTaxFromCashFlow] = useState(false);

  // Construction Progress Schedule state
  const [constructionScheduleOpen, setConstructionScheduleOpen] = useState(false);
  const [includeConstructionScheduleInExport, setIncludeConstructionScheduleInExport] = useState(true);
  
  // Chart export toggles - individual and global
  const [includeAllChartsInExport, setIncludeAllChartsInExport] = useState(true);
  const [chartExportToggles, setChartExportToggles] = useState({
    cashFlowTrends: true,
    yieldChart: true,
    comparisonChart: true,
  });
  
  // Handler for global charts toggle
  const handleGlobalChartsToggle = (checked: boolean) => {
    setIncludeAllChartsInExport(checked);
    setChartExportToggles({
      cashFlowTrends: checked,
      yieldChart: checked,
      comparisonChart: checked,
    });
  };
  
  // Handler for individual chart toggle
  const handleChartToggle = (chartKey: keyof typeof chartExportToggles, checked: boolean) => {
    const newToggles = { ...chartExportToggles, [chartKey]: checked };
    setChartExportToggles(newToggles);
    // Update global toggle based on individual states
    const allChecked = Object.values(newToggles).every(v => v);
    const noneChecked = Object.values(newToggles).every(v => !v);
    if (allChecked) {
      setIncludeAllChartsInExport(true);
    } else if (noneChecked) {
      setIncludeAllChartsInExport(false);
    }
  };
  
  // Construction Schedule Preset Mode: 'rapid' | 'even' | 'custom'
  type SchedulePreset = 'rapid' | 'even' | 'custom';
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>('rapid');
  
  // Custom stage month positions (for 'custom' mode) - stage index (0-5) to month number
  // Default: month 2-7 for stages 1-6
  const [customStageMonths, setCustomStageMonths] = useState<{ [stageIndex: number]: number }>({
    0: 2, // Deposit
    1: 3, // Slab/Base
    2: 4, // Frame
    3: 5, // Lock-up
    4: 6, // Fixing
    5: 7, // Practical Completion
  });

  // Get build type from report (defaults to 'existing_property')
  const buildType = report?.manual_overrides?.buildType || 'existing_property';
  const isNewBuild = buildType === 'new_build';

  // Comparison chart colors for up to 5 properties
  const COMPARISON_COLORS = [
    { value: 'hsl(var(--primary))', cashFlow: '#8b5cf6' }, // Primary
    { value: '#f97316', cashFlow: '#14b8a6' }, // Comparison 1
    { value: '#ef4444', cashFlow: '#06b6d4' }, // Comparison 2
    { value: '#eab308', cashFlow: '#84cc16' }, // Comparison 3
    { value: '#a855f7', cashFlow: '#f43f5e' }, // Comparison 4
  ];

  // Initialize overrides from report when modal opens
  useEffect(() => {
    if (report && isOpen) {
      const cfOverrides = report.manual_overrides?.cashFlowYearlyOverrides || {};
      setYearlyOverrides(cfOverrides);
      setHasChanges(false);
      setEditingCell(null);
      setComparisonMode(false);
      setSelectedComparisonReportIds([]);
      setComparisonReports([]);
      setAiAnalysis(null);
      setSavedAnalysisId(null);
      
      // Load construction stage timing preset from manual_overrides
      setSchedulePreset(report.manual_overrides?.schedulePreset || 'rapid');
      setCustomStageMonths(report.manual_overrides?.customStageMonths || {
        0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7
      });
      
      // Load land tax exclusion setting
      setExcludeLandTaxFromCashFlow(report.manual_overrides?.excludeLandTaxFromCashFlow || false);
    }
  }, [report, isOpen]);

  // Load saved AI analysis when comparison reports are selected
  useEffect(() => {
    if (comparisonMode && report && selectedComparisonReportIds.length > 0) {
      const loadSavedAnalysis = async () => {
        setIsLoadingAnalysis(true);
        try {
          const sortedComparisonIds = [...selectedComparisonReportIds].sort();
          
          const { data, error } = await supabase
            .from('cash_flow_analyses')
            .select('*')
            .eq('primary_report_id', report.id)
            .contains('comparison_report_ids', sortedComparisonIds)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) throw error;
          
          if (data && data.comparison_report_ids.length === sortedComparisonIds.length) {
            setAiAnalysis(data.analysis_data);
            setSavedAnalysisId(data.id);
            setInvestorProfile((data.investor_profile as 'growth' | 'income' | 'balanced') || 'balanced');
            toast({
              title: "Analysis Loaded",
              description: "Previously saved analysis has been loaded.",
            });
          } else {
            setAiAnalysis(null);
            setSavedAnalysisId(null);
          }
        } catch (error) {
          console.error('Error loading saved analysis:', error);
        } finally {
          setIsLoadingAnalysis(false);
        }
      };
      loadSavedAnalysis();
    }
  }, [comparisonMode, report, selectedComparisonReportIds, toast]);

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

  // Fetch selected comparison reports details
  useEffect(() => {
    const selectedReports = availableReports.filter(r => selectedComparisonReportIds.includes(r.id));
    setComparisonReports(selectedReports);
  }, [selectedComparisonReportIds, availableReports]);

  // Handle adding/removing comparison reports
  const handleToggleComparisonReport = useCallback((reportId: string) => {
    setSelectedComparisonReportIds(prev => {
      if (prev.includes(reportId)) {
        return prev.filter(id => id !== reportId);
      }
      if (prev.length >= 4) {
        toast({
          title: "Maximum reached",
          description: "You can compare up to 5 properties total (including the primary).",
          variant: "destructive"
        });
        return prev;
      }
      return [...prev, reportId];
    });
  }, [toast]);

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

  // Calculate projections for all comparison reports (using same chained cascade logic)
  const allComparisonProjections = useMemo(() => {
    return comparisonReports.map(compReport => {
      const fc = compReport.financial_calculations || {};
      const mo = compReport.manual_overrides || {};
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
      const baseDepreciation = includeDepreciation ? (mo.depreciation || cashFlow.depreciation || 6000) : 0;
      const depreciationSchedule = mo.depreciationSchedule as Record<number, number> | undefined;
      const baseLandTax = mo.landTax || fc.landTax || 0;
      const marketValueNow = mo.marketValueNow || cashFlow.marketValueNow || purchasePrice;

      // Fixed expenses (excluding management fee)
      const baseFixedExpenses = 
        (mo.councilRates || fc.councilRates || 0) +
        (mo.waterRates || fc.waterRates || 0) +
        (mo.bodyCorporateFees || fc.bodyCorporateFees || 0) +
        (mo.buildingLandlordInsurance || fc.buildingLandlordInsurance || 0) +
        (mo.repairsMaintenance || fc.repairsMaintenance || 0);
      const propertyManagementPercent = (mo.propertyManagementFees || fc.propertyManagementFees || 7) / 100;
      const baseAnnualRent = weeklyRent * occupancyRate;

      const results: YearlyProjection[] = [];
      
      // Track previous year values for CHAINED cascade
      let previousPropertyValue = marketValueNow;
      let previousRentalIncome = baseAnnualRent;
      let previousFixedExpenses = baseFixedExpenses;

      for (let year = 0; year <= 10; year++) {
        const yearOverrides = cfOverrides[year] || {};
        
        const yearCapitalGrowthRate = year >= 1 && yearOverrides.capitalGrowthRate != null
          ? yearOverrides.capitalGrowthRate / 100 : baseCapitalGrowthRate;
        const yearCpiRate = year >= 1 && yearOverrides.cpiGrowthRate != null
          ? yearOverrides.cpiGrowthRate / 100 : baseCpiRate;
        const yearInterestRate = year >= 1 && yearOverrides.interestRate != null
          ? yearOverrides.interestRate / 100 : baseInterestRate;

        // Property value - CHAINED cascade
        let propertyValue: number;
        if (year === 0) {
          propertyValue = marketValueNow;
        } else if (yearOverrides.propertyMarketValue != null) {
          propertyValue = yearOverrides.propertyMarketValue;
        } else {
          // CHAINED: Grow from previous year's actual value
          propertyValue = previousPropertyValue * (1 + yearCapitalGrowthRate);
        }
        previousPropertyValue = propertyValue;

        const currentLoanAmount = loanAmount;
        const equity = propertyValue - currentLoanAmount;
        const lvr = propertyValue > 0 ? (currentLoanAmount / propertyValue) * 100 : 0;

        // Rental income - CHAINED cascade
        let annualRent: number;
        if (year === 0) {
          annualRent = baseAnnualRent;
        } else if (yearOverrides.rentalIncome != null) {
          annualRent = yearOverrides.rentalIncome;
        } else {
          // CHAINED: Grow from previous year's actual rent using current year's CPI
          annualRent = previousRentalIncome * (1 + yearCpiRate);
        }
        previousRentalIncome = annualRent;

        // Property expenses - HYBRID: Fixed portion chains, mgmt fee is dynamic
        let totalExpenses: number;
        let currentFixedExpenses: number;
        if (year === 0) {
          currentFixedExpenses = baseFixedExpenses;
          totalExpenses = currentFixedExpenses + (annualRent * propertyManagementPercent);
        } else if (yearOverrides.propertyExpenses != null) {
          totalExpenses = yearOverrides.propertyExpenses;
          currentFixedExpenses = totalExpenses - (annualRent * propertyManagementPercent);
        } else {
          // CHAINED: Fixed expenses grow from previous year using current year's CPI
          currentFixedExpenses = previousFixedExpenses * (1 + yearCpiRate);
          totalExpenses = currentFixedExpenses + (annualRent * propertyManagementPercent);
        }
        previousFixedExpenses = currentFixedExpenses;

        // Interest & Principal (simplified for comparison - no amortization engine)
        let interestPayments = year === 0 ? 0 : 
          yearOverrides.interestPayment != null ? yearOverrides.interestPayment : 
          currentLoanAmount * yearInterestRate;
        let principalPayments = year === 0 ? 0 : yearOverrides.principalPayment ?? 0;
        
        // Depreciation - LOCKED (schedule-based or direct)
        let depreciation: number;
        if (year === 0) {
          depreciation = 0;
        } else if (yearOverrides.depreciation != null) {
          depreciation = yearOverrides.depreciation;
        } else if (depreciationSchedule && depreciationSchedule[year]) {
          depreciation = depreciationSchedule[year];
        } else {
          depreciation = baseDepreciation;
        }
        
        // Land tax - LOCKED
        let landTax = year === 0 ? 0 : yearOverrides.landTax ?? baseLandTax;

        const grossYield = year === 0 ? 0 : (annualRent / propertyValue) * 100;
        const netYield = year === 0 ? 0 : ((annualRent - totalExpenses) / propertyValue) * 100;
        const preTaxCashFlow = year === 0 ? 0 : annualRent - totalExpenses - interestPayments - principalPayments - landTax;
        const totalDeductions = totalExpenses + interestPayments + depreciation + landTax;
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
      return { report: compReport, projections: results };
    });
  }, [comparisonReports]);

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
      // Loan amount: use override, or cash flow value, or dynamically calculate from purchase price × LVR
      loanAmount: mo.loanAmount || cashFlow.loanAmount || 
        ((mo.purchasePrice || fc.purchasePrice || fc.propertyValue || 0) * ((mo.loanToValueRatio || fc.loanToValueRatio || 80) / 100)),
      loanToValueRatio: mo.loanToValueRatio || fc.loanToValueRatio || 80,
      loanType: (mo.loanType || cashFlow.loanType || 'interest_only') as LoanType,
      loanTermYears: mo.loanTermYears || cashFlow.loanTermYears || 30,
      interestRate: mo.interestRate || fc.interestRate || 5.5,
      capitalGrowth: mo.capitalGrowth || fc.capitalGrowth || 5,
      
      // New mortgage calculator fields
      interestOnlyPeriodYears: mo.interestOnlyPeriodYears || 0,
      repaymentFrequency: (mo.repaymentFrequency || 'monthly') as RepaymentFrequency,
      extraRepaymentPerMonth: mo.extraRepaymentPerMonth || 0,
      offsetBalance: mo.offsetBalance || 0,

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
      agentFee: mo.agentFee || fc.agentFee || 0,

      // Tax & Growth
      cpiGrowthRate: mo.cpiGrowthRate || cashFlow.cpiGrowthRate || 3,
      depreciation: includeDepreciation ? (mo.depreciation || cashFlow.depreciation || 6000) : 0,
      taxRate: mo.taxRate || cashFlow.taxRate || 30,
      constructionYear: mo.constructionYear || cashFlow.constructionYear || new Date().getFullYear(),
      
      // 10-Year Depreciation Schedule (from calculator)
      depreciationSchedule: mo.depreciationSchedule as Record<number, number> | undefined,
      depreciationMethod: mo.depreciationMethod as 'dv' | 'pc' | undefined,
      
      // Construction Settings
      constructionDurationMonths: mo.constructionDurationMonths || 7,
      
      // Toggle state
      includeDepreciationInCashFlow: includeDepreciation,
    };
  }, [report]);

  // Generate 10-year loan projection using amortisation engine
  const loanProjections = useMemo(() => {
    if (!baseFinancialData) return null;
    
    const loanAmount = baseFinancialData.loanAmount || 
      (baseFinancialData.purchasePrice * (baseFinancialData.loanToValueRatio / 100));
    
    if (loanAmount <= 0) return null;
    
    // Convert monthly extra repayment to the appropriate frequency
    const periodsPerYear = baseFinancialData.repaymentFrequency === 'weekly' ? 52 : 
                           baseFinancialData.repaymentFrequency === 'fortnightly' ? 26 : 12;
    const extraPerPeriod = baseFinancialData.extraRepaymentPerMonth * 12 / periodsPerYear;
    
    const mortgageInput: MortgageInput = {
      loanAmount,
      annualInterestRate: baseFinancialData.interestRate,
      loanTermYears: baseFinancialData.loanTermYears,
      repaymentFrequency: baseFinancialData.repaymentFrequency,
      loanType: baseFinancialData.loanType === 'interest_only' ? 'interest_only' : 'principal_interest',
      interestOnlyPeriodYears: baseFinancialData.interestOnlyPeriodYears,
      extraRepaymentPerPeriod: extraPerPeriod,
      offsetBalance: baseFinancialData.offsetBalance,
    };
    
    // Build rate changes from yearly overrides (including Year 1)
    const rateChanges: RateChange[] = [];
    Object.entries(yearlyOverrides).forEach(([yearStr, overrides]) => {
      const year = parseInt(yearStr);
      if (overrides.interestRate !== undefined && overrides.interestRate !== null && year >= 1) {
        rateChanges.push({
          effectiveFromPeriod: (year - 1) * periodsPerYear + 1,
          newAnnualRate: overrides.interestRate,
        });
      }
    });
    // Sort rate changes by period to ensure proper application
    rateChanges.sort((a, b) => a.effectiveFromPeriod - b.effectiveFromPeriod);
    
    return get10YearLoanProjection(mortgageInput, rateChanges);
  }, [baseFinancialData, yearlyOverrides]);

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
        cashFlowYearlyOverrides: yearlyOverrides,
        excludeLandTaxFromCashFlow: excludeLandTaxFromCashFlow,
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

  // Calculate 10-year projections with per-year overrides and amortisation engine
  const projections = useMemo(() => {
    if (!baseFinancialData) return [];

    const results: YearlyProjection[] = [];
    
    // Calculate initial values
    const purchasePrice = baseFinancialData.purchasePrice;
    const initialLoanAmount = baseFinancialData.loanAmount || (purchasePrice * (baseFinancialData.loanToValueRatio / 100));
    const weeklyRent = baseFinancialData.weeklyRent;
    const occupancyRate = baseFinancialData.occupancyRate;
    const baseCapitalGrowthRate = baseFinancialData.capitalGrowth / 100;
    const baseInterestRate = baseFinancialData.interestRate / 100;
    const baseCpiRate = baseFinancialData.cpiGrowthRate / 100;
    const taxRate = baseFinancialData.taxRate / 100;

    // Calculate initial fixed expenses (excluding property management which is rent-based)
    const baseFixedExpenses = 
      baseFinancialData.councilRates +
      baseFinancialData.waterRates +
      baseFinancialData.bodyCorporateFees +
      baseFinancialData.buildingLandlordInsurance +
      baseFinancialData.repairsMaintenance;

    // Calculate property management as percentage of rent
    const propertyManagementPercent = baseFinancialData.propertyManagementFees / 100;

    // Base calculated values for Year 0
    const baseAnnualRent = weeklyRent * occupancyRate;

    // Track previous year values for CHAINED cascade (not compound from base)
    let previousPropertyValue = baseFinancialData.marketValueNow || purchasePrice;
    let previousRentalIncome = baseAnnualRent;
    let previousFixedExpenses = baseFixedExpenses;

    for (let year = 0; year <= 10; year++) {
      const yearOverrides = yearlyOverrides[year] || {};
      
      // Get rates for this year (use override or base)
      // FIX: Year 1 can now use override if provided
      const yearCapitalGrowthRate = year >= 1 && yearOverrides.capitalGrowthRate !== undefined && yearOverrides.capitalGrowthRate !== null
        ? yearOverrides.capitalGrowthRate / 100
        : baseCapitalGrowthRate;
      
      const yearCpiRate = year >= 1 && yearOverrides.cpiGrowthRate !== undefined && yearOverrides.cpiGrowthRate !== null
        ? yearOverrides.cpiGrowthRate / 100
        : baseCpiRate;
      
      const yearInterestRate = year >= 1 && yearOverrides.interestRate !== undefined && yearOverrides.interestRate !== null
        ? yearOverrides.interestRate / 100
        : baseInterestRate;

      // =====================================================
      // PROPERTY VALUE - Chained cascade from previous year
      // =====================================================
      let propertyValue: number;
      if (year === 0) {
        propertyValue = baseFinancialData.marketValueNow || purchasePrice;
      } else if (yearOverrides.propertyMarketValue !== undefined && yearOverrides.propertyMarketValue !== null) {
        // Direct override - use it, but still chain from here for subsequent years
        propertyValue = yearOverrides.propertyMarketValue;
      } else {
        // CHAINED: Grow from PREVIOUS year's actual value (including any overrides)
        // This applies the CURRENT year's growth rate to the previous year's value
        propertyValue = previousPropertyValue * (1 + yearCapitalGrowthRate);
      }
      // Update tracker for next iteration
      previousPropertyValue = propertyValue;

      // =====================================================
      // LOAN CALCULATIONS - Amortization engine with rate changes
      // =====================================================
      let currentLoanAmount: number;
      let interestPayments: number;
      let principalPayments: number;
      
      if (year === 0) {
        currentLoanAmount = initialLoanAmount;
        interestPayments = 0;
        principalPayments = 0;
      } else if (loanProjections && loanProjections[year - 1]) {
        const yearProjection = loanProjections[year - 1];
        
        // Use override values if provided (locked), otherwise use amortization engine values
        if (yearOverrides.interestPayment !== undefined && yearOverrides.interestPayment !== null) {
          interestPayments = yearOverrides.interestPayment;
        } else {
          interestPayments = yearProjection.interestPayment;
        }
        
        if (yearOverrides.principalPayment !== undefined && yearOverrides.principalPayment !== null) {
          principalPayments = yearOverrides.principalPayment;
        } else {
          principalPayments = yearProjection.principalPayment;
        }
        
        // Loan balance comes from amortization engine (reflects rate changes)
        currentLoanAmount = yearProjection.closingBalance;
      } else {
        // Fallback to simple calculation if amortization engine not available
        currentLoanAmount = initialLoanAmount;
        interestPayments = initialLoanAmount * yearInterestRate;
        principalPayments = 0;
      }

      // Equity - derived from property value and loan balance
      const equity = propertyValue - currentLoanAmount;

      // LVR - derived from loan balance and property value
      const lvr = propertyValue > 0 ? (currentLoanAmount / propertyValue) * 100 : 0;

      // =====================================================
      // RENTAL INCOME - Chained cascade from previous year
      // =====================================================
      let annualRent: number;
      if (year === 0) {
        annualRent = baseAnnualRent;
      } else if (yearOverrides.rentalIncome !== undefined && yearOverrides.rentalIncome !== null) {
        // Direct override - use it, subsequent years chain from here
        annualRent = yearOverrides.rentalIncome;
      } else {
        // CHAINED: Grow from PREVIOUS year's actual rent using CURRENT year's CPI
        annualRent = previousRentalIncome * (1 + yearCpiRate);
      }
      // Update tracker for next iteration
      previousRentalIncome = annualRent;

      // =====================================================
      // PROPERTY EXPENSES - Hybrid: Fixed portion chains, Mgmt fee is dynamic
      // =====================================================
      let totalExpenses: number;
      let currentFixedExpenses: number;
      
      if (year === 0) {
        currentFixedExpenses = baseFixedExpenses;
        const propertyManagement = annualRent * propertyManagementPercent;
        totalExpenses = currentFixedExpenses + propertyManagement;
      } else if (yearOverrides.propertyExpenses !== undefined && yearOverrides.propertyExpenses !== null) {
        // Direct override - LOCKED value, doesn't cascade
        totalExpenses = yearOverrides.propertyExpenses;
        // Estimate fixed expenses for tracking (approximate)
        currentFixedExpenses = totalExpenses - (annualRent * propertyManagementPercent);
      } else {
        // CHAINED: Fixed expenses grow from PREVIOUS year's fixed expenses using CURRENT year's CPI
        currentFixedExpenses = previousFixedExpenses * (1 + yearCpiRate);
        // Property management is ALWAYS recalculated from current year's rent
        const propertyManagement = annualRent * propertyManagementPercent;
        totalExpenses = currentFixedExpenses + propertyManagement;
      }
      // Update tracker for next iteration
      previousFixedExpenses = currentFixedExpenses;

      // Gross yield - derived from rent and property value
      const grossYield = year === 0 ? 0 : (annualRent / propertyValue) * 100;

      // Net yield - derived from rent, expenses, and property value
      const netYield = year === 0 ? 0 : ((annualRent - totalExpenses) / propertyValue) * 100;

      // =====================================================
      // DEPRECIATION - LOCKED (schedule-based or direct override)
      // =====================================================
      let depreciation: number;
      if (year === 0) {
        depreciation = 0;
      } else if (yearOverrides.depreciation !== undefined && yearOverrides.depreciation !== null) {
        // Manual per-year override takes precedence (LOCKED)
        depreciation = yearOverrides.depreciation;
      } else if (baseFinancialData.depreciationSchedule && baseFinancialData.depreciationSchedule[year]) {
        // Use year-specific value from 10-year schedule
        depreciation = baseFinancialData.depreciationSchedule[year];
      } else {
        // Fallback to single depreciation value
        depreciation = baseFinancialData.depreciation;
      }

      // =====================================================
      // LAND TAX - LOCKED (direct override or base value)
      // =====================================================
      let landTax: number;
      if (excludeLandTaxFromCashFlow) {
        landTax = 0;
      } else if (year === 0) {
        landTax = 0;
      } else if (yearOverrides.landTax !== undefined && yearOverrides.landTax !== null) {
        landTax = yearOverrides.landTax;
      } else {
        landTax = baseFinancialData.landTax;
      }

      // =====================================================
      // CASH FLOW CALCULATIONS - All derived from above values
      // =====================================================
      
      // Pre-tax cash flow (includes land tax as a cash expense)
      const preTaxCashFlow = year === 0 ? 0 : annualRent - totalExpenses - interestPayments - principalPayments - landTax;

      // Total deductions (includes land tax for tax calculation)
      const totalDeductions = totalExpenses + interestPayments + depreciation + landTax;

      // Net profit/loss (taxable income/loss)
      const netProfitLoss = year === 0 ? 0 : annualRent - totalDeductions;

      // Tax refund (negative gearing benefit when in loss position)
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
  }, [baseFinancialData, yearlyOverrides, loanProjections, excludeLandTaxFromCashFlow]);

  // Construction Progress Payment Schedule calculation
  interface ConstructionStage {
    stage: string;
    description: string;
    percentage: number;
    buildAmount: number;
    cumulativeDrawn: number;
    landInterest: number;
    buildInterest: number;
    totalMonthlyInterest: number;
    month: number;
  }

  const constructionProgressSchedule = useMemo(() => {
    if (!baseFinancialData) return null;

    const landPrice = baseFinancialData.landPrice || 0;
    const buildPrice = baseFinancialData.buildPrice || (baseFinancialData.purchasePrice - landPrice);
    const interestRate = baseFinancialData.interestRate / 100; // Annual rate
    const durationMonths = Math.min(baseFinancialData.constructionDurationMonths || 7, 24);

    // Land interest calculation: Land Cost × Interest Rate / 12
    // This calculates monthly interest on the full land value
    const monthlyLandInterest = landPrice * interestRate / 12;

    // Get custom stage percentages from manual overrides or use defaults
    const stagePercentages = {
      deposit: (report?.manual_overrides?.stageDepositPercent as number) ?? 5,
      slab: (report?.manual_overrides?.stageSlabPercent as number) ?? 15,
      frame: (report?.manual_overrides?.stageFramePercent as number) ?? 20,
      lockup: (report?.manual_overrides?.stageLockupPercent as number) ?? 25,
      fixing: (report?.manual_overrides?.stageFixingPercent as number) ?? 20,
      completion: (report?.manual_overrides?.stageCompletionPercent as number) ?? 15,
    };

    // Build stages - use custom percentages or defaults
    const baseStages = [
      { stage: 'Deposit', description: 'Paid from your funds (not from lender)', percentage: stagePercentages.deposit },
      { stage: 'Slab/Base Stage', description: 'Foundation, slab, ground works', percentage: stagePercentages.slab },
      { stage: 'Frame Stage', description: 'Wall frames, roof trusses, structural frame', percentage: stagePercentages.frame },
      { stage: 'Lock-up Stage', description: 'External walls, windows, doors (can "lock up")', percentage: stagePercentages.lockup },
      { stage: 'Fixing Stage', description: 'Internal linings, plaster, cabinets, fittings', percentage: stagePercentages.fixing },
      { stage: 'Practical Completion', description: 'Final works, painting, finishes', percentage: stagePercentages.completion },
    ];

    // Determine stage months based on preset
    const getStageMonths = (): number[] => {
      if (schedulePreset === 'rapid') {
        // Rapid: stages at months 2-7 (fixed)
        return [2, 3, 4, 5, 6, 7];
      } else if (schedulePreset === 'even') {
        // Even distribution: spread 6 stages across (durationMonths - 1) months
        // Month 1 is always land interest, so stages start at month 2
        const availableMonths = durationMonths - 1; // Exclude month 1
        const numStages = baseStages.length;
        const months: number[] = [];
        
        for (let i = 0; i < numStages; i++) {
          // Distribute evenly: first stage at month 2, last stage at durationMonths
          const month = Math.round(2 + (i * (availableMonths - 1)) / Math.max(1, numStages - 1));
          months.push(Math.min(month, durationMonths));
        }
        return months;
      } else {
        // Custom: use customStageMonths state
        return baseStages.map((_, index) => customStageMonths[index] || (index + 2));
      }
    };

    const stageMonths = getStageMonths();

    // Create a map of month -> array of stage data for that month (supports multiple stages per month)
    const monthToStages: { [month: number]: Array<{ stage: typeof baseStages[0]; index: number }> } = {};
    stageMonths.forEach((month, index) => {
      if (!monthToStages[month]) {
        monthToStages[month] = [];
      }
      monthToStages[month].push({ stage: baseStages[index], index });
    });

    let cumulativeDrawn = 0;
    let totalBuildInterest = 0;
    let totalCombinedRepayment = monthlyLandInterest; // Start with first month land interest

    // Land Interest Charge row (month 1)
    const landInterestRow: ConstructionStage = {
      stage: 'Land Interest Charge',
      description: '',
      percentage: 0,
      buildAmount: landPrice,
      cumulativeDrawn: 0,
      landInterest: Math.round(monthlyLandInterest * 100) / 100,
      buildInterest: 0,
      totalMonthlyInterest: Math.round(monthlyLandInterest * 100) / 100,
      month: 1,
    };

    const stageResults: ConstructionStage[] = [landInterestRow];

    // Build rows for months 2 through durationMonths
    for (let month = 2; month <= durationMonths; month++) {
      const stagesThisMonth = monthToStages[month] || [];
      
      if (stagesThisMonth.length > 0) {
        // This month has one or more stage payments - add a row for each stage
        stagesThisMonth.forEach((stageData) => {
          const s = stageData.stage;
          const buildAmount = (buildPrice * s.percentage) / 100;
          
          // For Deposit stage, no build interest is charged
          // For other stages: Build Interest = (Cumulative Stage Pricing up to and including this stage) × Interest Rate ÷ 12
          const isDeposit = s.stage === 'Deposit';
          
          // Add this stage to cumulative drawn
          cumulativeDrawn += buildAmount;
          
          // Calculate build interest based on the formula:
          // - Deposit: No interest (0)
          // - Slab/Base: (Slab pricing) × Interest Rate ÷ 12
          // - Frame: (Slab + Frame pricing) × Interest Rate ÷ 12
          // - Lock-up: (Slab + Frame + Lock-up pricing) × Interest Rate ÷ 12
          // - Fixing: (Slab + Frame + Lock-up + Fixing pricing) × Interest Rate ÷ 12
          // - Practical Completion: (All stage pricings) × Interest Rate ÷ 12
          // Note: "cumulativeDrawn" at this point includes all stages up to and including current
          // But for interest calc, we exclude the deposit amount
          const depositAmount = (buildPrice * stagePercentages.deposit) / 100;
          const cumulativeForInterest = isDeposit ? 0 : (cumulativeDrawn - depositAmount);
          const buildInterest = isDeposit ? 0 : (cumulativeForInterest * interestRate / 12);
          
          const combinedRepayment = monthlyLandInterest + buildInterest;
          
          totalBuildInterest += buildInterest;
          totalCombinedRepayment += combinedRepayment;

          stageResults.push({
            stage: s.stage,
            description: s.description,
            percentage: s.percentage,
            buildAmount: Math.round(buildAmount * 100) / 100,
            cumulativeDrawn: Math.round(cumulativeDrawn * 100) / 100,
            landInterest: Math.round(monthlyLandInterest * 100) / 100,
            buildInterest: Math.round(buildInterest * 100) / 100,
            totalMonthlyInterest: Math.round(combinedRepayment * 100) / 100,
            month: month,
          });
        });
      } else {
        // No stage this month - interest-only row
        // Use cumulative drawn excluding deposit for interest calculation
        const depositAmount = (buildPrice * stagePercentages.deposit) / 100;
        const cumulativeForInterest = Math.max(0, cumulativeDrawn - depositAmount);
        const buildInterest = cumulativeForInterest * interestRate / 12;
        const combinedRepayment = monthlyLandInterest + buildInterest;
        
        totalBuildInterest += buildInterest;
        totalCombinedRepayment += combinedRepayment;

        stageResults.push({
          stage: '',
          description: '',
          percentage: 0,
          buildAmount: 0,
          cumulativeDrawn: Math.round(cumulativeDrawn * 100) / 100,
          landInterest: Math.round(monthlyLandInterest * 100) / 100,
          buildInterest: Math.round(buildInterest * 100) / 100,
          totalMonthlyInterest: Math.round(combinedRepayment * 100) / 100,
          month: month,
        });
      }
    }

    // Upfront costs
    const tenPercentLand = landPrice * 0.10;
    const fivePercentBuild = buildPrice * 0.05;
    const stampDuty = baseFinancialData.stampDuty || 0;
    const solicitorFees = baseFinancialData.solicitorFees || 0;
    const agentFee = baseFinancialData.agentFee || 0;
    const totalUpfrontCost = tenPercentLand + fivePercentBuild + stampDuty + solicitorFees + agentFee;

    // Total interest during construction
    const totalLandInterest = monthlyLandInterest * durationMonths;
    const stagedProgressInterest = Math.round((totalLandInterest + totalBuildInterest) * 100) / 100;

    return {
      landPrice,
      buildPrice,
      totalProject: landPrice + buildPrice,
      interestRate: baseFinancialData.interestRate,
      durationMonths,
      stages: stageResults,
      monthlyLandInterest: Math.round(monthlyLandInterest * 100) / 100,
      totals: {
        landInterest: Math.round(totalLandInterest * 100) / 100,
        buildInterest: Math.round(totalBuildInterest * 100) / 100,
        totalInterest: stagedProgressInterest,
        totalCombinedRepayment: Math.round(totalCombinedRepayment * 100) / 100,
      },
      upfrontCosts: {
        tenPercentLand,
        fivePercentBuild,
        stampDuty,
        solicitorFees,
        agentFee,
        totalUpfrontCost,
      },
      grandTotal: Math.round((totalUpfrontCost + stagedProgressInterest) * 100) / 100,
    };
  }, [baseFinancialData, report?.manual_overrides, schedulePreset, customStageMonths]);


  // Calculate advanced comparison metrics
  const calculateAdvancedMetrics = useCallback((
    projs: YearlyProjection[],
    baseData: any
  ) => {
    if (!baseData || projs.length < 11) return null;

    const purchasePrice = baseData.purchasePrice;
    const depositValue = baseData.depositValue || (purchasePrice * (1 - baseData.loanToValueRatio / 100));
    const stampDuty = baseData.stampDuty;
    const totalInitialInvestment = depositValue + stampDuty + (baseData.solicitorFees || 2000);

    // Total cash flow over 10 years
    const totalCashFlow = projs.slice(1).reduce((sum, p) => sum + p.afterTaxCashFlowPA, 0);

    // Capital gain
    const capitalGain = projs[10].propertyMarketValue - purchasePrice;

    // Total return (capital gain + cash flow)
    const totalReturn = capitalGain + totalCashFlow;

    // ROI = Total Return / Initial Investment * 100
    const roi = totalInitialInvestment > 0 ? (totalReturn / totalInitialInvestment) * 100 : 0;

    // Annualized ROI
    const annualizedRoi = Math.pow(1 + roi / 100, 1 / 10) * 100 - 100;

    // Break-even year (when cumulative cash flow becomes positive)
    let cumulativeCashFlow = 0;
    let breakEvenYear: number | null = null;
    for (let i = 1; i <= 10; i++) {
      cumulativeCashFlow += projs[i].afterTaxCashFlowPA;
      if (cumulativeCashFlow >= 0 && breakEvenYear === null) {
        breakEvenYear = i;
      }
    }

    // Cash-on-cash return (Year 1)
    const cashOnCash = totalInitialInvestment > 0 
      ? (projs[1].afterTaxCashFlowPA / totalInitialInvestment) * 100 
      : 0;

    // Equity multiple
    const equityMultiple = totalInitialInvestment > 0 
      ? (projs[10].equityInProperty + totalCashFlow) / totalInitialInvestment 
      : 0;

    return {
      totalInitialInvestment,
      totalCashFlow,
      capitalGain,
      totalReturn,
      roi,
      annualizedRoi,
      breakEvenYear,
      cashOnCash,
      equityMultiple
    };
  }, []);

  // Memoized metrics for primary property
  const primaryMetrics = useMemo(() => 
    calculateAdvancedMetrics(projections, baseFinancialData),
    [projections, baseFinancialData, calculateAdvancedMetrics]
  );

  // Memoized metrics for all comparison properties
  const allComparisonMetrics = useMemo(() => {
    return allComparisonProjections.map(({ report: compReport, projections: compProjs }) => {
      if (compProjs.length < 11) return { report: compReport, metrics: null };
      
      const fc = compReport.financial_calculations || {};
      const mo = compReport.manual_overrides || {};
      
      const compBaseData = {
        purchasePrice: mo.purchasePrice || fc.purchasePrice || fc.propertyValue || 0,
        depositValue: mo.depositValue || fc.depositValue || 0,
        stampDuty: mo.stampDuty || fc.stampDuty || 0,
        solicitorFees: mo.solicitorFees || fc.solicitorFees || 2000,
        loanToValueRatio: mo.loanToValueRatio || fc.loanToValueRatio || 80,
      };
      
      return { report: compReport, metrics: calculateAdvancedMetrics(compProjs, compBaseData), projections: compProjs };
    });
  }, [allComparisonProjections, calculateAdvancedMetrics]);

  // Generate AI-powered comparison analysis
  const generateAiAnalysis = useCallback(async () => {
    if (!report || comparisonReports.length === 0) return;
    
    setIsGeneratingAiAnalysis(true);
    setAiAnalysis(null);
    
    try {
      const allReportIds = [report.id, ...comparisonReports.map(r => r.id)];
      
      // Prepare projection data for each report
      const projectionData: Record<string, any> = {};
      
      // Add primary report projection summary
      if (projections.length > 0) {
        projectionData[report.id] = {
          year1: projections[1] || {},
          year5: projections[5] || {},
          year10: projections[10] || {},
          metrics: primaryMetrics,
        };
      }
      
      // Add comparison reports projection summaries
      allComparisonProjections.forEach(({ report: compReport, projections: compProjs }) => {
        const compMetrics = allComparisonMetrics.find(m => m.report.id === compReport.id);
        projectionData[compReport.id] = {
          year1: compProjs[1] || {},
          year5: compProjs[5] || {},
          year10: compProjs[10] || {},
          metrics: compMetrics?.metrics || {},
        };
      });
      
      const { data, error } = await invokeSecureFunction('compare-cash-flow-reports', {
        reportIds: allReportIds,
        projectionData,
        investorProfile,
        timeHorizon: '10 years',
      });
      
      if (error) throw error;
      
      if (data?.success && data?.analysis) {
        setAiAnalysis(data.analysis);
        toast({
          title: "AI Analysis Complete",
          description: "Cash flow comparison analysis has been generated.",
        });
      } else {
        throw new Error(data?.error || 'Failed to generate analysis');
      }
    } catch (error: any) {
      console.error('Error generating AI analysis:', error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to generate AI comparison analysis.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingAiAnalysis(false);
    }
  }, [report, comparisonReports, projections, primaryMetrics, allComparisonProjections, allComparisonMetrics, investorProfile, toast]);

  // Save AI analysis to database
  const saveAiAnalysis = useCallback(async () => {
    if (!report || !aiAnalysis || comparisonReports.length === 0) return;
    
    setIsSavingAnalysis(true);
    try {
      const sortedComparisonIds = comparisonReports.map(r => r.id).sort();
      
      if (savedAnalysisId) {
        // Update existing
        const { error } = await supabase
          .from('cash_flow_analyses')
          .update({
            analysis_data: aiAnalysis,
            investor_profile: investorProfile,
            updated_at: new Date().toISOString(),
          })
          .eq('id', savedAnalysisId);
        
        if (error) throw error;
        
        toast({
          title: "Analysis Updated",
          description: "Your cash flow analysis has been updated.",
        });
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('cash_flow_analyses')
          .insert({
            primary_report_id: report.id,
            comparison_report_ids: sortedComparisonIds,
            analysis_data: aiAnalysis,
            investor_profile: investorProfile,
          })
          .select('id')
          .single();
        
        if (error) throw error;
        
        setSavedAnalysisId(data.id);
        toast({
          title: "Analysis Saved",
          description: "Your cash flow analysis has been saved and can be viewed later.",
        });
      }
    } catch (error: any) {
      console.error('Error saving AI analysis:', error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save the analysis.",
        variant: "destructive"
      });
    } finally {
      setIsSavingAnalysis(false);
    }
  }, [report, aiAnalysis, comparisonReports, savedAnalysisId, investorProfile, toast]);

  const propertyRecommendation = useMemo(() => {
    if (!primaryMetrics || comparisonReports.length === 0 || !report) return null;

    // Calculate profile-specific scores
    const getProfileScore = (metrics: typeof primaryMetrics, profile: 'growth' | 'income' | 'balanced') => {
      if (!metrics) return 0;
      
      switch (profile) {
        case 'growth':
          return (
            (metrics.capitalGain / 100000) * 30 +
            (metrics.roi) * 25 +
            (metrics.annualizedRoi) * 20 +
            (metrics.equityMultiple) * 25
          );
        case 'income':
          return (
            (metrics.totalCashFlow > 0 ? metrics.totalCashFlow / 1000 : metrics.totalCashFlow / 500) * 35 +
            (metrics.cashOnCash * 10) * 30 +
            ((10 - (metrics.breakEvenYear || 10)) * 10) * 20 +
            (projections[1]?.grossYield || 0) * 15
          );
        case 'balanced':
          return (
            (metrics.capitalGain / 100000) * 20 +
            (metrics.roi) * 15 +
            (metrics.totalCashFlow > 0 ? metrics.totalCashFlow / 1000 : metrics.totalCashFlow / 500) * 25 +
            (metrics.cashOnCash * 10) * 15 +
            (metrics.equityMultiple) * 15 +
            ((10 - (metrics.breakEvenYear || 10)) * 5) * 10
          );
      }
    };

    // Build all property scores
    const allScores = [
      { 
        name: report.property_address.split(',')[0], 
        score: getProfileScore(primaryMetrics, investorProfile),
        isPrimary: true,
        metrics: primaryMetrics
      },
      ...allComparisonMetrics.map(({ report: compReport, metrics }) => ({
        name: compReport.property_address.split(',')[0],
        score: getProfileScore(metrics, investorProfile),
        isPrimary: false,
        metrics
      }))
    ].sort((a, b) => b.score - a.score);

    const winner = allScores[0];
    const scoreDiff = allScores.length > 1 ? allScores[0].score - allScores[1].score : 0;
    const confidence = scoreDiff > 50 ? 'high' : scoreDiff > 20 ? 'moderate' : 'marginal';

    return {
      winner: winner.name,
      rankings: allScores.map((s, i) => ({ rank: i + 1, name: s.name, score: Math.round(s.score) })),
      confidence,
      insights: [
        `${winner.name} scores highest for ${investorProfile}-focused investors`,
        winner.metrics?.roi ? `10-Year ROI: ${winner.metrics.roi.toFixed(1)}%` : '',
        winner.metrics?.totalCashFlow ? `Total Cash Flow: $${winner.metrics.totalCashFlow.toLocaleString()}` : ''
      ].filter(Boolean).slice(0, 3)
    };
  }, [primaryMetrics, allComparisonMetrics, report, comparisonReports, investorProfile, projections]);

  // PDF Export function for comparison (supports multiple properties)
  const exportComparisonPDF = useCallback(async () => {
    if (!report || comparisonReports.length === 0) return;

    try {
      toast({
        title: "Generating PDF",
        description: "Please wait while charts are being captured...",
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      // Title
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Cash Flow Analysis Comparison', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      // Properties being compared
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Property 1 (Primary): ${report.property_address}`, margin, yPos);
      yPos += 5;
      comparisonReports.forEach((compReport, idx) => {
        pdf.text(`Property ${idx + 2}: ${compReport.property_address}`, margin, yPos);
        yPos += 5;
      });
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPos);
      yPos += 10;

      // Capture and add charts
      const chartRefs = [
        { ref: cashFlowChartRef, title: 'Cash Flow Trends' },
        { ref: yieldChartRef, title: 'Yield Percentages' },
        { ref: comparisonChartRef, title: 'Property Comparison' }
      ];

      for (const chart of chartRefs) {
        if (chart.ref.current) {
          const canvas = await html2canvas(chart.ref.current, {
            backgroundColor: '#ffffff',
            scale: 2,
          });
          
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - (margin * 2);
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          if (yPos + imgHeight > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
          }

          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text(chart.title, margin, yPos);
          yPos += 5;
          
          pdf.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        }
      }

      // Add comparison metrics table
      pdf.addPage();
      yPos = margin;

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Investment Comparison Metrics', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      const formatValue = (value: number | null | undefined, format: string) => {
        if (value === null || value === undefined) return 'N/A';
        switch (format) {
          case 'currency': return `$${Math.round(value).toLocaleString()}`;
          case 'percent': return `${value.toFixed(2)}%`;
          case 'year': return value === null ? 'N/A' : `Year ${value}`;
          case 'multiple': return `${value.toFixed(2)}x`;
          default: return String(value);
        }
      };

      // Table header
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Metric', margin, yPos);
      pdf.text('Primary', margin + 55, yPos);
      allComparisonMetrics.slice(0, 4).forEach((_, idx) => {
        pdf.text(`Prop ${idx + 2}`, margin + 85 + (idx * 25), yPos);
      });
      yPos += 2;
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 5;

      const metrics = [
        { label: '10-Year ROI', key: 'roi', format: 'percent' },
        { label: 'Annualized ROI', key: 'annualizedRoi', format: 'percent' },
        { label: 'Total Return', key: 'totalReturn', format: 'currency' },
        { label: 'Break-Even Year', key: 'breakEvenYear', format: 'year' },
        { label: 'Cash-on-Cash (Y1)', key: 'cashOnCash', format: 'percent' },
        { label: 'Equity Multiple', key: 'equityMultiple', format: 'multiple' },
        { label: 'Total Cash Flow', key: 'totalCashFlow', format: 'currency' },
        { label: 'Capital Gain', key: 'capitalGain', format: 'currency' },
      ];

      // Table rows
      pdf.setFont('helvetica', 'normal');
      for (const metric of metrics) {
        pdf.text(metric.label, margin, yPos);
        pdf.text(formatValue((primaryMetrics as any)?.[metric.key], metric.format), margin + 55, yPos);
        allComparisonMetrics.slice(0, 4).forEach(({ metrics: compMetrics }, idx) => {
          pdf.text(formatValue((compMetrics as any)?.[metric.key], metric.format), margin + 85 + (idx * 25), yPos);
        });
        yPos += 6;
      }

      // Add AI Analysis section if available
      if (aiAnalysis) {
        pdf.addPage();
        yPos = margin;

        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('AI-Powered Cash Flow Analysis', pageWidth / 2, yPos, { align: 'center' });
        yPos += 12;

        // Helper function to add wrapped text
        const addWrappedText = (text: string, fontSize: number, maxWidth: number, lineHeight: number = 5) => {
          pdf.setFontSize(fontSize);
          const lines = pdf.splitTextToSize(text, maxWidth);
          for (const line of lines) {
            if (yPos + lineHeight > pageHeight - margin) {
              pdf.addPage();
              yPos = margin;
            }
            pdf.text(line, margin, yPos);
            yPos += lineHeight;
          }
        };

        // Executive Summary
        if (aiAnalysis.executiveSummary) {
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Executive Summary', margin, yPos);
          yPos += 7;
          pdf.setFont('helvetica', 'normal');
          addWrappedText(aiAnalysis.executiveSummary, 9, pageWidth - (margin * 2), 4.5);
          yPos += 8;
        }

        // Final Rankings
        if (aiAnalysis.finalRankings && aiAnalysis.finalRankings.length > 0) {
          if (yPos > pageHeight - 60) {
            pdf.addPage();
            yPos = margin;
          }
          
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Final Rankings', margin, yPos);
          yPos += 7;

          pdf.setFontSize(9);
          for (const ranking of aiAnalysis.finalRankings) {
            if (yPos + 20 > pageHeight - margin) {
              pdf.addPage();
              yPos = margin;
            }
            
            pdf.setFont('helvetica', 'bold');
            pdf.text(`#${ranking.rank} - ${ranking.propertyAddress}`, margin, yPos);
            yPos += 5;
            
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Score: ${ranking.overallScore}/100`, margin + 5, yPos);
            yPos += 4;
            
            if (ranking.strengths && ranking.strengths.length > 0) {
              pdf.text(`Strengths: ${ranking.strengths.join(', ')}`, margin + 5, yPos);
              yPos += 4;
            }
            if (ranking.weaknesses && ranking.weaknesses.length > 0) {
              pdf.text(`Weaknesses: ${ranking.weaknesses.join(', ')}`, margin + 5, yPos);
              yPos += 4;
            }
            yPos += 3;
          }
          yPos += 5;
        }

        // Investor Recommendations
        if (aiAnalysis.investorRecommendations) {
          if (yPos > pageHeight - 80) {
            pdf.addPage();
            yPos = margin;
          }
          
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Investor Profile Recommendations', margin, yPos);
          yPos += 7;

          pdf.setFontSize(9);
          const recommendations = [
            { key: 'growthFocused', label: 'Growth Focused' },
            { key: 'incomeFocused', label: 'Income Focused' },
            { key: 'balancedApproach', label: 'Balanced Approach' },
            { key: 'riskAverse', label: 'Risk Averse' },
          ];

          for (const rec of recommendations) {
            const recData = aiAnalysis.investorRecommendations[rec.key];
            if (recData) {
              if (yPos + 15 > pageHeight - margin) {
                pdf.addPage();
                yPos = margin;
              }
              
              pdf.setFont('helvetica', 'bold');
              pdf.text(`${rec.label}: ${recData.recommendation || 'N/A'}`, margin, yPos);
              yPos += 4.5;
              
              if (recData.reason) {
                pdf.setFont('helvetica', 'normal');
                addWrappedText(recData.reason, 8, pageWidth - (margin * 2) - 5, 4);
              }
              yPos += 3;
            }
          }
          yPos += 5;
        }

        // Overall Recommendation
        if (aiAnalysis.overallRecommendation) {
          if (yPos > pageHeight - 40) {
            pdf.addPage();
            yPos = margin;
          }
          
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Overall Recommendation', margin, yPos);
          yPos += 7;
          
          pdf.setFont('helvetica', 'normal');
          addWrappedText(aiAnalysis.overallRecommendation, 9, pageWidth - (margin * 2), 4.5);
        }
      }

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      yPos += 10;
      if (yPos > pageHeight - 20) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.text('This comparison is for informational purposes only.', margin, yPos);

      pdf.save(`cash-flow-comparison-${comparisonReports.length + 1}-properties-${new Date().toISOString().split('T')[0]}.pdf`);

      toast({
        title: "PDF Exported",
        description: aiAnalysis ? "Comparison PDF with AI analysis has been downloaded." : "Comparison PDF has been downloaded successfully.",
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: "Export Failed",
        description: "Failed to generate comparison PDF.",
        variant: "destructive"
      });
    }
  }, [report, comparisonReports, allComparisonMetrics, primaryMetrics, aiAnalysis, toast]);

  // Export AI Analysis Only as PDF
  const exportAiAnalysisPDF = useCallback(async () => {
    if (!report || !aiAnalysis) return;

    try {
      toast({
        title: "Generating PDF",
        description: "Exporting AI analysis...",
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      // Helper function to add wrapped text
      const addWrappedText = (text: string, fontSize: number, maxWidth: number, lineHeight: number = 5) => {
        pdf.setFontSize(fontSize);
        const lines = pdf.splitTextToSize(text, maxWidth);
        for (const line of lines) {
          if (yPos + lineHeight > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
          }
          pdf.text(line, margin, yPos);
          yPos += lineHeight;
        }
      };

      // Title
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('AI Cash Flow Comparison Analysis', pageWidth / 2, yPos, { align: 'center' });
      yPos += 12;

      // Properties analyzed
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Properties Analyzed:', margin, yPos);
      yPos += 5;
      pdf.text(`1. ${report.property_address} (Primary)`, margin + 5, yPos);
      yPos += 5;
      comparisonReports.forEach((compReport, idx) => {
        pdf.text(`${idx + 2}. ${compReport.property_address}`, margin + 5, yPos);
        yPos += 5;
      });
      yPos += 3;
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPos);
      yPos += 12;

      // Executive Summary
      if (aiAnalysis.executiveSummary) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Executive Summary', margin, yPos);
        yPos += 8;
        pdf.setFont('helvetica', 'normal');
        addWrappedText(aiAnalysis.executiveSummary, 10, pageWidth - (margin * 2), 5);
        yPos += 10;
      }

      // Final Rankings
      if (aiAnalysis.finalRankings && aiAnalysis.finalRankings.length > 0) {
        if (yPos > pageHeight - 60) {
          pdf.addPage();
          yPos = margin;
        }
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Final Rankings', margin, yPos);
        yPos += 8;

        for (const ranking of aiAnalysis.finalRankings) {
          if (yPos + 25 > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
          }
          
          // Rank header with background
          pdf.setFillColor(ranking.rank === 1 ? 220 : 240, ranking.rank === 1 ? 252 : 240, ranking.rank === 1 ? 231 : 240);
          pdf.rect(margin, yPos - 4, pageWidth - (margin * 2), 20, 'F');
          
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`#${ranking.rank} - ${ranking.propertyAddress || ranking.address}`, margin + 3, yPos);
          yPos += 6;
          
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          if (ranking.overallScore || ranking.score) {
            pdf.text(`Overall Score: ${ranking.overallScore || ranking.score}/100`, margin + 5, yPos);
            yPos += 4;
          }
          
          if (ranking.strengths && ranking.strengths.length > 0) {
            pdf.setTextColor(34, 139, 34);
            pdf.text(`Strengths: ${ranking.strengths.join(', ')}`, margin + 5, yPos);
            pdf.setTextColor(0, 0, 0);
            yPos += 4;
          }
          if (ranking.weaknesses && ranking.weaknesses.length > 0) {
            pdf.setTextColor(178, 34, 34);
            pdf.text(`Weaknesses: ${ranking.weaknesses.join(', ')}`, margin + 5, yPos);
            pdf.setTextColor(0, 0, 0);
            yPos += 4;
          }
          yPos += 6;
        }
        yPos += 5;
      }

      // Investor Recommendations
      if (aiAnalysis.investorRecommendations) {
        if (yPos > pageHeight - 80) {
          pdf.addPage();
          yPos = margin;
        }
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Investor Profile Recommendations', margin, yPos);
        yPos += 8;

        const recommendations = [
          { key: 'growthFocused', label: 'Growth Focused', color: [59, 130, 246] },
          { key: 'incomeFocused', label: 'Income Focused', color: [34, 197, 94] },
          { key: 'balancedApproach', label: 'Balanced Approach', color: [168, 85, 247] },
          { key: 'riskAverse', label: 'Risk Averse', color: [249, 115, 22] },
        ];

        for (const rec of recommendations) {
          const recData = aiAnalysis.investorRecommendations[rec.key];
          if (recData) {
            if (yPos + 20 > pageHeight - margin) {
              pdf.addPage();
              yPos = margin;
            }
            
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(rec.color[0], rec.color[1], rec.color[2]);
            pdf.text(`${rec.label}:`, margin, yPos);
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'normal');
            pdf.text(` ${recData.recommendation || 'N/A'}`, margin + pdf.getTextWidth(`${rec.label}: `), yPos);
            yPos += 5;
            
            if (recData.reason) {
              addWrappedText(recData.reason, 9, pageWidth - (margin * 2) - 5, 4.5);
            }
            yPos += 5;
          }
        }
        yPos += 5;
      }

      // Overall Recommendation
      if (aiAnalysis.overallRecommendation) {
        if (yPos > pageHeight - 50) {
          pdf.addPage();
          yPos = margin;
        }
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Overall Recommendation', margin, yPos);
        yPos += 8;
        
        pdf.setFont('helvetica', 'normal');
        addWrappedText(aiAnalysis.overallRecommendation, 10, pageWidth - (margin * 2), 5);
      }

      // Disclaimer
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      yPos += 15;
      if (yPos > pageHeight - 20) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.text('This AI-powered analysis is for informational purposes only and should not be considered financial advice.', margin, yPos);

      pdf.save(`ai-cash-flow-analysis-${new Date().toISOString().split('T')[0]}.pdf`);

      toast({
        title: "PDF Exported",
        description: "AI analysis PDF has been downloaded successfully.",
      });
    } catch (error) {
      console.error('Error exporting AI analysis PDF:', error);
      toast({
        title: "Export Failed",
        description: "Failed to generate AI analysis PDF.",
        variant: "destructive"
      });
    }
  }, [report, comparisonReports, aiAnalysis, toast]);

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
    const isEditable = year >= 1; // Years 1-10 are editable
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
    projectionData.push(['Land Tax $', ...projections.map(p => p.year === 0 ? '' : p.landTax)]);
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

  // Export single report 10-year cash flow as PDF with charts
  const exportSingleReportPDF = useCallback(async () => {
    if (!report || !baseFinancialData) return;

    try {
      // Load active template configuration
      const templateConfig = await loadActiveCashFlowTemplate();
      console.log(`📋 Using Cash Flow template: ${templateConfig.name}`);

      const pdf = new jsPDF('p', 'mm', 'a4'); // Portrait orientation for better fit
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const footerHeight = 32; // Reserved space for footer - increased to prevent overlap
      const contentMaxY = pageHeight - footerHeight; // Maximum Y position for content
      let yPos = 0;

      // ========== COVER PAGE ==========
      // Use the NPC template cover image as background
      const goldColor = { r: 201, g: 165, b: 90 }; // #c9a55a
      
      try {
        // Add cover template image as full page background
        const coverImageUrl = '/templates/npc-cashflow-cover.jpg';
        pdf.addImage(coverImageUrl, 'JPEG', 0, 0, pageWidth, pageHeight);
      } catch (e) {
        // Fallback: draw simple dark background if image fails
        pdf.setFillColor(26, 26, 26);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        
        // Gold accent bar at top
        pdf.setFillColor(goldColor.r, goldColor.g, goldColor.b);
        pdf.rect(0, 0, pageWidth, 8, 'F');
        
        // Company name fallback
        pdf.setFontSize(28);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(goldColor.r, goldColor.g, goldColor.b);
        pdf.text('NAIDU PROPERTY', pageWidth / 2, 100, { align: 'center' });
        pdf.text('CONSULTING SERVICES', pageWidth / 2, 115, { align: 'center' });
        
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text('YOUR DEDICATED PROPERTY PARTNER', pageWidth / 2, 135, { align: 'center' });
        
        // Bottom gold bar
        pdf.setFillColor(goldColor.r, goldColor.g, goldColor.b);
        pdf.rect(0, pageHeight - 8, pageWidth, 8, 'F');
      }

      // Add new page for content
      pdf.addPage();

      // Brand colors (gold primary)
      const primaryColor = { r: 202, g: 138, b: 4 }; // Gold #ca8a04
      const darkText = { r: 30, g: 30, b: 30 };
      const grayText = { r: 100, g: 100, b: 100 };
      const lightGray = { r: 248, g: 248, b: 248 };
      const mediumGray = { r: 220, g: 220, b: 220 }; // Slightly darker for better contrast
      const tableHeaderBg = { r: 45, g: 55, b: 72 }; // Slate gray
      const sectionBg = { r: 254, g: 249, b: 235 }; // Warmer cream #fef9eb
      const negativeRed = { r: 185, g: 28, b: 28 }; // Darker red for negatives #B91C1C

      // Capture charts first (only if toggles are enabled)
      let cashFlowChartImage: string | null = null;
      let yieldChartImage: string | null = null;
      let comparisonChartImage: string | null = null;
      
      if (chartExportToggles.cashFlowTrends && cashFlowChartRef.current) {
        try {
          const canvas = await html2canvas(cashFlowChartRef.current, {
            backgroundColor: '#ffffff',
            scale: 2,
          });
          cashFlowChartImage = canvas.toDataURL('image/png');
        } catch (e) {
          console.warn('Failed to capture cash flow chart:', e);
        }
      }
      
      if (chartExportToggles.yieldChart && yieldChartRef.current) {
        try {
          const canvas = await html2canvas(yieldChartRef.current, {
            backgroundColor: '#ffffff',
            scale: 2,
          });
          yieldChartImage = canvas.toDataURL('image/png');
        } catch (e) {
          console.warn('Failed to capture yield chart:', e);
        }
      }
      
      if (chartExportToggles.comparisonChart && comparisonChartRef.current) {
        try {
          const canvas = await html2canvas(comparisonChartRef.current, {
            backgroundColor: '#ffffff',
            scale: 2,
          });
          comparisonChartImage = canvas.toDataURL('image/png');
        } catch (e) {
          console.warn('Failed to capture comparison chart:', e);
        }
      }

      // ========== HEADER SECTION ==========
      // Start content directly without the top banner
      yPos = margin;

      // Document title section
      pdf.setTextColor(darkText.r, darkText.g, darkText.b);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('10-Year Cash Flow Analysis', margin, yPos);
      yPos += 8;

      // Property address with subtle underline
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(grayText.r, grayText.g, grayText.b);
      // Clean the address - remove "Copy" suffix and trailing underscores/numbers
      const cleanedAddress = report.property_address.replace(/[_\s]?Copy[_\s]?\d*$/i, '').trim();
      pdf.text(cleanedAddress, margin, yPos);
      yPos += 5;

      // Decorative line under address
      pdf.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPos, margin + 120, yPos);
      yPos += 6;

      // Generation date
      pdf.setFontSize(8);
      pdf.setTextColor(grayText.r, grayText.g, grayText.b);
      pdf.text(`Generated: ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, yPos);
      pdf.setTextColor(darkText.r, darkText.g, darkText.b);
      yPos += 10;

      // ========== KEY METRICS CARDS ==========
      const cardWidth = (pageWidth - margin * 2 - 15) / 4;
      const cardHeight = 14;
      const cardY = yPos;

      const keyMetricsData = [
        { label: 'Purchase Price', value: formatCurrency(baseFinancialData.purchasePrice) },
        { label: 'Weekly Rent', value: formatCurrency(baseFinancialData.weeklyRent) },
        { label: 'Interest Rate', value: `${baseFinancialData.interestRate}%` },
        { label: 'Capital Growth', value: `${baseFinancialData.capitalGrowth}%` },
      ];

      keyMetricsData.forEach((metric, idx) => {
        const cardX = margin + idx * (cardWidth + 5);
        
        // Card background
        pdf.setFillColor(lightGray.r, lightGray.g, lightGray.b);
        pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2, 'F');
        
        // Card border
        pdf.setDrawColor(mediumGray.r, mediumGray.g, mediumGray.b);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2, 'S');
        
        // Metric label
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(grayText.r, grayText.g, grayText.b);
        pdf.text(metric.label, cardX + 4, cardY + 5);
        
        // Metric value
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(darkText.r, darkText.g, darkText.b);
        pdf.text(metric.value, cardX + 4, cardY + 11);
      });

      yPos = cardY + cardHeight + 8;

      // ========== INPUTS SUMMARY SECTION ==========
      if (includeInputsSummaryInExport) {
        // Section header with accent line
        pdf.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
        pdf.rect(margin, yPos, 3, 5, 'F');
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(darkText.r, darkText.g, darkText.b);
        pdf.text('Input Summary', margin + 6, yPos + 4);
        yPos += 8;

        // Summary table with two columns
        const inputsColWidth = (pageWidth - margin * 2) / 2 - 5;
        const inputRowHeight = 4.2;
        let rowCount = 0;

        const drawInputRow = (label: string, value: string, label2?: string, value2?: string) => {
          if (yPos > pageHeight - 25) {
            pdf.addPage();
            yPos = margin;
          }
          
          // Alternating row background
          if (rowCount % 2 === 0) {
            pdf.setFillColor(lightGray.r, lightGray.g, lightGray.b);
            pdf.rect(margin, yPos - 3, pageWidth - margin * 2, inputRowHeight, 'F');
          }

          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(grayText.r, grayText.g, grayText.b);
          pdf.text(label, margin + 2, yPos);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(darkText.r, darkText.g, darkText.b);
          pdf.text(value, margin + 52, yPos);
          
          if (label2 && value2) {
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(grayText.r, grayText.g, grayText.b);
            pdf.text(label2, margin + inputsColWidth + 10, yPos);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(darkText.r, darkText.g, darkText.b);
            pdf.text(value2, margin + inputsColWidth + 62, yPos);
          }
          yPos += inputRowHeight;
          rowCount++;
        };

        // Draw inputs in two columns
        drawInputRow('Purchase Price:', formatCurrency(baseFinancialData.purchasePrice), 'Weekly Rent:', formatCurrency(baseFinancialData.weeklyRent));
        drawInputRow('Land Price:', formatCurrency(baseFinancialData.landPrice), 'Gross Rental Yield:', projections.length > 1 ? `${projections[1].grossYield.toFixed(2)}%` : '-');
        drawInputRow('Build Price:', formatCurrency(baseFinancialData.buildPrice || (baseFinancialData.purchasePrice - baseFinancialData.landPrice)), 'Council Rates (p.a.):', formatCurrency(baseFinancialData.councilRates));
        drawInputRow('Deposit Amount:', formatCurrency(baseFinancialData.depositValue), 'Water Rates (p.a.):', formatCurrency(baseFinancialData.waterRates));
        drawInputRow('Loan Amount:', formatCurrency(baseFinancialData.loanAmount || (baseFinancialData.purchasePrice * (baseFinancialData.loanToValueRatio / 100))), 'Property Management:', `${baseFinancialData.propertyManagementFees}%`);
        drawInputRow('Interest Rate:', `${baseFinancialData.interestRate.toFixed(2)}%`, 'Landlord Insurance:', formatCurrency(baseFinancialData.buildingLandlordInsurance));
        drawInputRow('Capital Growth Rate:', `${baseFinancialData.capitalGrowth}%`, 'Letting Fees:', formatCurrency(baseFinancialData.lettingFees));
        drawInputRow('CPI Growth Rate:', `${baseFinancialData.cpiGrowthRate}%`, 'Repairs & Maintenance:', formatCurrency(baseFinancialData.repairsMaintenance));
        drawInputRow('Tax Rate (MTR):', `${baseFinancialData.taxRate}%`, 'Body Corporate:', formatCurrency(baseFinancialData.bodyCorporateFees));
        drawInputRow('Depreciation (Yr 1):', formatCurrency(baseFinancialData.depreciation), 'Stamp Duty:', formatCurrency(baseFinancialData.stampDuty));
        drawInputRow('', '', 'Conveyancing:', formatCurrency(baseFinancialData.solicitorFees));

        // Total Expenditure highlight box
        yPos += 2;
        pdf.setFillColor(sectionBg.r, sectionBg.g, sectionBg.b);
        pdf.roundedRect(margin, yPos - 3, pageWidth - margin * 2, 7, 1, 1, 'F');
        pdf.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
        pdf.setLineWidth(0.4);
        pdf.roundedRect(margin, yPos - 3, pageWidth - margin * 2, 7, 1, 1, 'S');
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(darkText.r, darkText.g, darkText.b);
        const totalExpenditure = baseFinancialData.purchasePrice + baseFinancialData.stampDuty + baseFinancialData.solicitorFees;
        pdf.text('Total Overall Expenditure to Completion:', margin + 4, yPos + 1);
        pdf.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
        pdf.text(formatCurrency(totalExpenditure), margin + 80, yPos + 1);
        yPos += 10;
      }

      // ========== CONSTRUCTION PROGRESS SCHEDULE ==========
      if (isNewBuild && includeConstructionScheduleInExport && constructionProgressSchedule && constructionProgressSchedule.buildPrice > 0) {
        if (yPos > pageHeight - 85) {
          pdf.addPage();
          yPos = margin + 10;
        }

        // Section header with accent line
        pdf.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
        pdf.rect(margin, yPos, 3, 5, 'F');
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(darkText.r, darkText.g, darkText.b);
        pdf.text('Construction Progress Payment Schedule', margin + 6, yPos + 4);
        yPos += 8;

        // Project Summary cards
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(grayText.r, grayText.g, grayText.b);
        pdf.text(`Land Cost: ${formatCurrency(constructionProgressSchedule.landPrice)}   •   Build Contract: ${formatCurrency(constructionProgressSchedule.buildPrice)}   •   Total Project: ${formatCurrency(constructionProgressSchedule.totalProject)}`, margin, yPos);
        yPos += 6;

        // Table header
        pdf.setFontSize(6);
        pdf.setFillColor(tableHeaderBg.r, tableHeaderBg.g, tableHeaderBg.b);
        pdf.rect(margin, yPos - 3, pageWidth - margin * 2, 5, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        const scheduleHeaders = ['Stage', 'Description', '%', 'Stage Pricing', 'Land Int.', 'Build Int.', 'Combined', 'Mo'];
        const scheduleColWidths = [28, 55, 12, 22, 18, 18, 22, 10];
        let xPos = margin;
        scheduleHeaders.forEach((header, idx) => {
          pdf.text(header, xPos + 1, yPos);
          xPos += scheduleColWidths[idx];
        });
        yPos += 5;

        // Build stages rows with zebra striping
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(darkText.r, darkText.g, darkText.b);
        constructionProgressSchedule.stages.forEach((stage, idx) => {
          if (yPos > pageHeight - 20) {
            pdf.addPage();
            yPos = margin;
          }
          
          // Zebra striping
          if (idx % 2 === 0) {
            pdf.setFillColor(lightGray.r, lightGray.g, lightGray.b);
            pdf.rect(margin, yPos - 3, pageWidth - margin * 2, 4, 'F');
          }
          
          xPos = margin;
          const rowData = [
            stage.stage,
            stage.description.substring(0, 35) + (stage.description.length > 35 ? '...' : ''),
            stage.percentage > 0 ? `${stage.percentage}%` : '',
            formatCurrency(stage.buildAmount),
            formatCurrency(stage.landInterest),
            stage.buildInterest > 0 ? formatCurrency(stage.buildInterest) : '',
            formatCurrency(stage.totalMonthlyInterest),
            String(stage.month)
          ];
          rowData.forEach((cell, idx) => {
            pdf.text(cell, xPos + 1, yPos);
            xPos += scheduleColWidths[idx];
          });
          yPos += 4;
        });

        // Totals row
        pdf.setFillColor(sectionBg.r, sectionBg.g, sectionBg.b);
        pdf.rect(margin, yPos - 3, pageWidth - margin * 2, 5, 'F');
        pdf.setFont('helvetica', 'bold');
        xPos = margin;
        const totalsRow = [
          '',
          '',
          '100%',
          formatCurrency(constructionProgressSchedule.landPrice + constructionProgressSchedule.buildPrice),
          'Total',
          '',
          formatCurrency(constructionProgressSchedule.totals.totalCombinedRepayment),
          ''
        ];
        totalsRow.forEach((cell, idx) => {
          pdf.text(cell, xPos + 1, yPos);
          xPos += scheduleColWidths[idx];
        });
        yPos += 10;
      }

      // ========== 10-YEAR PROJECTIONS TABLE ==========
      // Section header with accent line
      pdf.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
      pdf.rect(margin, yPos, 3, 5, 'F');
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(darkText.r, darkText.g, darkText.b);
      pdf.text('10-Year Projections', margin + 6, yPos + 4);
      yPos += 8;

      // Table configuration - compact for portrait orientation
      const colWidths = [34, ...Array(11).fill((pageWidth - margin * 2 - 34) / 11)]; // Slightly wider first column
      const rowHeight = 5; // Increased from 4.5 for better readability
      const sectionRowHeight = 6; // Taller section headers
      let tableRowCount = 0;
      
      // Helper to draw a row with enhanced styling and page boundary checking
      const drawRow = (cells: string[], isHeader = false, isSection = false, highlightValue = false) => {
        const currentRowHeight = isSection ? sectionRowHeight : rowHeight;
        
        // Check if this row would overflow into footer area - if so, add page break
        const neededSpace = isSection ? currentRowHeight + 1 : currentRowHeight; // Section has extra padding
        if (yPos + neededSpace > contentMaxY) {
          pdf.addPage();
          yPos = margin + 5;
          tableRowCount = 0; // Reset zebra striping for new page
        }
        
        if (isSection) {
          // Section header row - remove slash from section names
          const sectionName = cells[0].replace(/[\/\\|]/g, '').trim();
          yPos += 1; // Extra padding before section
          pdf.setFillColor(sectionBg.r, sectionBg.g, sectionBg.b);
          pdf.rect(margin, yPos - 3.5, pageWidth - margin * 2, sectionRowHeight, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6.5);
          pdf.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
          pdf.text(sectionName, margin + 3, yPos + 0.5);
          tableRowCount = 0;
          yPos += sectionRowHeight;
          return; // Don't add more to yPos
        } else if (isHeader) {
          // Table header row - Remove "Metric" from first column
          pdf.setFillColor(tableHeaderBg.r, tableHeaderBg.g, tableHeaderBg.b);
          pdf.rect(margin, yPos - 3, pageWidth - margin * 2, rowHeight, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6);
          
          let xPos = margin;
          cells.forEach((cell, idx) => {
            const cellWidth = colWidths[idx];
            // Skip "Metric" in first column header
            const displayCell = idx === 0 ? '' : cell;
            if (idx === 0) {
              pdf.text(displayCell, xPos + 2, yPos);
            } else {
              pdf.text(displayCell, xPos + cellWidth - 1, yPos, { align: 'right' });
            }
            xPos += cellWidth;
          });
          pdf.setTextColor(darkText.r, darkText.g, darkText.b);
        } else {
          // Data row with zebra striping
          if (tableRowCount % 2 === 1) {
            pdf.setFillColor(lightGray.r, lightGray.g, lightGray.b);
            pdf.rect(margin, yPos - 3, pageWidth - margin * 2, rowHeight, 'F');
          }
          pdf.setTextColor(darkText.r, darkText.g, darkText.b);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(6);
          
          let xPos = margin;
          cells.forEach((cell, idx) => {
            const cellWidth = colWidths[idx];
            if (idx === 0) {
              pdf.text(cell, xPos + 2, yPos);
            } else {
              // Highlight negative values in bold red
              if (highlightValue && cell.startsWith('-')) {
                pdf.setTextColor(negativeRed.r, negativeRed.g, negativeRed.b);
                pdf.setFont('helvetica', 'bold');
              }
              pdf.text(cell, xPos + cellWidth - 1, yPos, { align: 'right' });
              pdf.setTextColor(darkText.r, darkText.g, darkText.b);
              pdf.setFont('helvetica', 'normal');
            }
            xPos += cellWidth;
          });
          tableRowCount++;
        }

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6);
        yPos += rowHeight;
      };

      // ========== SMART PAGE BREAK LOGIC ==========
      // Pre-calculate total height needed for projections table + summary box
      // This helps us decide if we need to start the table on a new page
      const summaryBoxHeight = 16;
      const summarySpacing = 4;
      
      // Calculate approximate table height:
      // - 1 header row + 5 data rows + 4 section rows + remaining data rows
      // Total rows: header(1) + data(5) + section(STATISTICS) + data(5) + section(CASH) + data(7) + section(NON-CASH) + data(1) + section(SUMMARY) + data(5) = ~24 rows + 4 sections
      const totalDataRows = 23; // Regular data rows
      const totalSectionRows = 4; // Section header rows
      const headerRowHeight = rowHeight;
      const estimatedTableHeight = headerRowHeight + (totalDataRows * rowHeight) + (totalSectionRows * (sectionRowHeight + 1));
      const estimatedTotalHeight = estimatedTableHeight + summarySpacing + summaryBoxHeight;
      
      // Calculate year 10 values early for summary
      const year10 = projections[10];
      const totalCashFlow = projections.slice(1).reduce((sum, p) => sum + p.afterTaxCashFlowPA, 0);
      const capitalGain = year10.propertyMarketValue - baseFinancialData.purchasePrice;
      
      // If everything won't fit on remaining space of page 1, check if it fits at all on a fresh page
      const remainingSpaceOnPage = contentMaxY - yPos;
      const freshPageSpace = contentMaxY - margin - 5;
      
      // If table + summary won't fit in remaining space but will fit on a fresh page, continue
      // The drawRow function will handle individual row page breaks
      // Key: We just need to ensure summary box can stay with at least some of the table
      
      // Draw table - headers without "Metric"
      const headers = ['', 'Today', 'Yr 1', 'Yr 2', 'Yr 3', 'Yr 4', 'Yr 5', 'Yr 6', 'Yr 7', 'Yr 8', 'Yr 9', 'Yr 10'];
      drawRow(headers, true);

      // Helper to safely get projection data - ensures all 10 years have values
      const getYearData = (yearIndex: number) => projections[yearIndex] || projections[projections.length - 1];
      const years1to10 = Array.from({ length: 10 }, (_, i) => getYearData(i + 1));

      drawRow(['Capital Growth %', '', ...years1to10.map(p => p.capitalGrowthRate.toFixed(1))]);
      drawRow(['CPI Growth %', '', ...years1to10.map(p => p.cpiGrowthRate.toFixed(1))]);
      drawRow(['Property Value $', formatCurrency(projections[0].propertyMarketValue), ...years1to10.map(p => formatCurrency(p.propertyMarketValue))]);
      drawRow(['Purchase Price $', formatCurrency(baseFinancialData.purchasePrice), ...Array(10).fill('')]);
      drawRow(['Loan Amount $', formatCurrency(projections[0].loanAmount), ...years1to10.map(p => formatCurrency(p.loanAmount))]);
      
      drawRow(['STATISTICS'], false, true);
      drawRow(['Equity $', formatCurrency(projections[0].equityInProperty), ...years1to10.map(p => formatCurrency(p.equityInProperty))]);
      drawRow(['LVR %', projections[0].loanToValueRatio.toFixed(1), ...years1to10.map(p => p.loanToValueRatio.toFixed(1))]);
      drawRow(['Rental Income $', `${formatCurrency(baseFinancialData.weeklyRent)}pw`, ...years1to10.map(p => formatCurrency(p.rentalIncome))]);
      drawRow(['Gross Yield %', '', ...years1to10.map(p => p.grossYield.toFixed(2))]);
      drawRow(['Net Yield %', '', ...years1to10.map(p => p.netYield.toFixed(2))]);
      
      drawRow(['CASH DEDUCTIONS'], false, true);
      drawRow(['Property Expenses $', '$0', ...years1to10.map(p => formatCurrency(p.propertyExpenses))]);
      drawRow(['Land Tax $', '', ...years1to10.map(p => formatCurrency(p.landTax))]);
      drawRow(['Interest Rate %', '', ...years1to10.map(p => p.interestRate.toFixed(2))]);
      drawRow(['Interest Payments $', '$0', ...years1to10.map(p => formatCurrency(p.interestPayments))]);
      drawRow(['Principal Payments $', formatCurrency(projections[0].principalPayments), ...years1to10.map(p => formatCurrency(p.principalPayments))]);
      drawRow(['Pre-Tax Cash Flow p/a $', '', ...years1to10.map(p => formatCurrency(p.preTaxCashFlowPA))], false, false, true);
      drawRow(['Pre-Tax Cash Flow p/w $', '', ...years1to10.map(p => formatCurrency(p.preTaxCashFlowPW))], false, false, true);
      
      drawRow(['NON-CASH DEDUCTIONS'], false, true);
      drawRow(['Depreciation $', '', ...years1to10.map(p => formatCurrency(p.depreciation))]);
      
      // ========== CHECK IF SUMMARY WILL FIT BEFORE DRAWING LAST SECTION ==========
      // Calculate space needed for remaining rows + summary box
      const remainingRows = 6; // SUMMARY section + 5 data rows
      const remainingSectionRows = 1;
      const spaceNeededForSummarySection = (remainingRows * rowHeight) + (remainingSectionRows * (sectionRowHeight + 1)) + summarySpacing + summaryBoxHeight;
      
      // If summary section + summary box won't fit, force page break now
      if (yPos + spaceNeededForSummarySection > contentMaxY) {
        pdf.addPage();
        yPos = margin + 5;
        tableRowCount = 0;
      }
      
      drawRow(['SUMMARY'], false, true);
      drawRow(['Total Deductions $', '', ...years1to10.map(p => formatCurrency(p.totalDeductions))]);
      drawRow(['Net Profit/Loss $', '', ...years1to10.map(p => formatCurrency(p.netProfitLoss))], false, false, true);
      drawRow(['Tax Refund $', '', ...years1to10.map(p => formatCurrency(p.taxRefund))]);
      drawRow(['After-Tax Cash Flow p/a $', '', ...years1to10.map(p => formatCurrency(p.afterTaxCashFlowPA))], false, false, true);
      drawRow(['After-Tax Cash Flow p/w $', '', ...years1to10.map(p => formatCurrency(p.afterTaxCashFlowPW))], false, false, true);

      // ========== 10-YEAR SUMMARY CARDS ==========
      yPos += summarySpacing + 4;
      
      // Increased height for card layout with label + value
      const summaryCardHeight = 22;
      
      // Final check - if summary cards would overflow, add page
      if (yPos + summaryCardHeight + 8 > contentMaxY) {
        pdf.addPage();
        yPos = margin + 10;
      }

      // Section title
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(45, 55, 72); // Dark slate text
      pdf.text('10-Year Investment Summary', margin, yPos);
      yPos += 6;

      // Card styling - dark blue background with white text
      const darkBlue = { r: 45, g: 55, b: 72 }; // #2d3748 - dark slate blue
      const summaryContentWidth = pageWidth - margin * 2;
      const summaryCardGap = 3;
      const summaryCardWidth = (summaryContentWidth - (summaryCardGap * 3)) / 4;

      // Summary data for 4 cards
      const summaryCards = [
        { label: 'Property Value', value: formatCurrency(year10.propertyMarketValue) },
        { label: 'Total Equity', value: formatCurrency(year10.equityInProperty) },
        { label: 'Capital Gain', value: formatCurrency(capitalGain) },
        { label: 'Total After-Tax Cash Flow', value: formatCurrency(totalCashFlow) }
      ];

      // Draw each card
      summaryCards.forEach((card, index) => {
        const cardX = margin + (index * (summaryCardWidth + summaryCardGap));
        
        // Card background - dark blue with rounded corners
        pdf.setFillColor(darkBlue.r, darkBlue.g, darkBlue.b);
        pdf.roundedRect(cardX, yPos, summaryCardWidth, summaryCardHeight, 2, 2, 'F');
        
        // Label - small white text at top
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(200, 200, 210); // Light gray for label
        pdf.text(card.label, cardX + 4, yPos + 7);
        
        // Value - larger white bold text below
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(255, 255, 255); // White for value
        pdf.text(card.value, cardX + 4, yPos + 16);
      });
      
      yPos += summaryCardHeight;

      // ========== CHARTS PAGE ==========
      const hasAnyChart = cashFlowChartImage || yieldChartImage || comparisonChartImage;
      
      if (hasAnyChart) {
        pdf.addPage();
        yPos = 0;
        
        // Header bar on chart page
        pdf.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
        pdf.rect(0, 0, pageWidth, 12, 'F');
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(255, 255, 255);
        pdf.text('Charts & Visual Analysis', margin, 8);
        
        yPos = 18;
        const chartWidth = pageWidth - margin * 2;
        
        // Cash Flow Trends Chart
        if (cashFlowChartImage) {
          const chartHeight = 70;
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(darkText.r, darkText.g, darkText.b);
          pdf.text('10-Year Cash Flow Trends', margin, yPos);
          yPos += 4;
          
          pdf.setDrawColor(mediumGray.r, mediumGray.g, mediumGray.b);
          pdf.setLineWidth(0.5);
          pdf.roundedRect(margin, yPos, chartWidth, chartHeight, 2, 2, 'S');
          pdf.addImage(cashFlowChartImage, 'PNG', margin + 2, yPos + 2, chartWidth - 4, chartHeight - 4);
          yPos += chartHeight + 8;
        }
        
        // Yield Chart
        if (yieldChartImage) {
          const chartHeight = 60;
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(darkText.r, darkText.g, darkText.b);
          pdf.text('Yield Percentages', margin, yPos);
          yPos += 4;
          
          pdf.setDrawColor(mediumGray.r, mediumGray.g, mediumGray.b);
          pdf.setLineWidth(0.5);
          pdf.roundedRect(margin, yPos, chartWidth, chartHeight, 2, 2, 'S');
          pdf.addImage(yieldChartImage, 'PNG', margin + 2, yPos + 2, chartWidth - 4, chartHeight - 4);
          yPos += chartHeight + 8;
        }
        
        // Comparison Chart
        if (comparisonChartImage) {
          // Check if we need a new page
          if (yPos > pageHeight - 80) {
            pdf.addPage();
            yPos = 18;
          }
          
          const chartHeight = 60;
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(darkText.r, darkText.g, darkText.b);
          pdf.text('Property Comparison', margin, yPos);
          yPos += 4;
          
          pdf.setDrawColor(mediumGray.r, mediumGray.g, mediumGray.b);
          pdf.setLineWidth(0.5);
          pdf.roundedRect(margin, yPos, chartWidth, chartHeight, 2, 2, 'S');
          pdf.addImage(comparisonChartImage, 'PNG', margin + 2, yPos + 2, chartWidth - 4, chartHeight - 4);
          yPos += chartHeight + 8;
        }
      }

      // ========== CONTACT / DISCLAIMER PAGE (Last Page) ==========
      pdf.addPage();
      
      // Dark background
      pdf.setFillColor(26, 26, 26);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      // Gold color for text
      const contactGoldColor = { r: 201, g: 165, b: 90 }; // #c9a55a
      const contactGrayColor = { r: 150, g: 150, b: 150 };
      
      let contactYPos = 60;
      
      // Company Name / Header
      pdf.setFontSize(28);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(contactGoldColor.r, contactGoldColor.g, contactGoldColor.b);
      pdf.text(templateConfig.companyName.toUpperCase(), margin + 10, contactYPos);
      
      if (templateConfig.companyNameLine2) {
        contactYPos += 12;
        pdf.setFontSize(18);
        pdf.text(templateConfig.companyNameLine2, margin + 10, contactYPos);
      }
      
      contactYPos += 25;
      
      // "CONTACT US" heading
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('CONTACT US', margin + 10, contactYPos);
      
      contactYPos += 15;
      
      // Contact details
      pdf.setFontSize(11);
      
      if (templateConfig.website) {
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(contactGoldColor.r, contactGoldColor.g, contactGoldColor.b);
        pdf.text('WEBSITE:', margin + 10, contactYPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(templateConfig.website, margin + 45, contactYPos);
        contactYPos += 10;
      }
      
      if (templateConfig.contactEmail) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('EMAIL:', margin + 10, contactYPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(templateConfig.contactEmail, margin + 45, contactYPos);
        contactYPos += 10;
      }
      
      // Always show the phone number - use hardcoded value
      pdf.setFont('helvetica', 'bold');
      pdf.text('PHONE:', margin + 10, contactYPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text('(02) 8609 3299', margin + 45, contactYPos);
      contactYPos += 10;
      
      // Address
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(contactGoldColor.r, contactGoldColor.g, contactGoldColor.b);
      pdf.text('ADDRESS:', margin + 10, contactYPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Level 5 Nexus Norwest, 4 Columbia Ct, Norwest NSW 2153', margin + 45, contactYPos);
      contactYPos += 10;
      
      // ABN
      pdf.setFont('helvetica', 'bold');
      pdf.text('ABN:', margin + 10, contactYPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text('50 684 555 771', margin + 45, contactYPos);
      contactYPos += 10;
      
      // Disclaimer section
      contactYPos = pageHeight - 100;
      
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(contactGrayColor.r, contactGrayColor.g, contactGrayColor.b);
      
      // Full professional disclaimer
      const fullDisclaimer = "As a Professional Property Consultant & Buyers Agent, we provide information and advice based on our expertise and experience in the real estate market. Please be aware that the advice and insights offered are for general informational purposes only and should not be considered financial advice. While we strive to ensure the accuracy and relevance of the information provided, real estate markets are dynamic and subject to change and cannot guarantee the future performance or outcomes of any property investment. It is important to understand that real estate investments carry risks, including market fluctuations, changes in property values, and potential financial losses. Our services include assisting you in identifying and evaluating potential opportunities, negotiating purchase terms, and navigating the transaction process. Any decisions to purchase, sell, or invest in real estate should be made after careful consideration and consultation with appropriate financial, legal, and tax advisors. By engaging our services, you acknowledge that you have read and understood this disclaimer and agree to take full responsibility for your property-related decisions. Always conduct your own research and due diligence to ensure that any property transaction aligns with your financial objectives and risk profile.";
      
      const disclaimerLinesFull = pdf.splitTextToSize(fullDisclaimer, pageWidth - margin * 4);
      disclaimerLinesFull.forEach((line: string) => {
        pdf.text(line, margin + 10, contactYPos);
        contactYPos += 5;
      });
      
      // Bottom gold bar
      pdf.setFillColor(contactGoldColor.r, contactGoldColor.g, contactGoldColor.b);
      pdf.rect(0, pageHeight - 8, pageWidth, 8, 'F');

      // ========== FOOTER (on content pages only, skip cover and contact pages) ==========
      const totalPages = pdf.getNumberOfPages();
      const coverPageIndex = 1;
      const contactPageIndex = totalPages;
      
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        
        // Skip cover page (first) and contact page (last)
        if (i === coverPageIndex || i === contactPageIndex) {
          continue;
        }
        
        // Footer separator line - at contentMaxY boundary
        pdf.setDrawColor(mediumGray.r, mediumGray.g, mediumGray.b);
        pdf.setLineWidth(0.5);
        pdf.line(margin, contentMaxY + 2, pageWidth - margin, contentMaxY + 2);
        
        // Disclaimer - positioned in footer zone with adequate spacing
        pdf.setFontSize(6.5);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(grayText.r, grayText.g, grayText.b);
        const disclaimerLinesFooter = pdf.splitTextToSize(templateConfig.disclaimer, pageWidth - margin * 2.5);
        pdf.text(disclaimerLinesFooter, pageWidth / 2, contentMaxY + 8, { align: 'center' });
        
        // Contact info and page number at very bottom
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(darkText.r, darkText.g, darkText.b);
        pdf.text(`${templateConfig.contactEmail}  •  ${templateConfig.website}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
        
        // Page number (content pages start from 1, excluding cover)
        const contentPageNum = i - 1; // Exclude cover page from count
        const totalContentPages = totalPages - 2; // Exclude cover and contact pages
        pdf.setFontSize(7);
        pdf.setTextColor(grayText.r, grayText.g, grayText.b);
        pdf.text(`Page ${contentPageNum} of ${totalContentPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
      }

      // Save PDF - use cleaned address for filename
      const cleanedAddressForFile = report.property_address.replace(/[_\s]?Copy[_\s]?\d*$/i, '').trim();
      const fileName = `Cash_Flow_10Year_${cleanedAddressForFile.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      pdf.save(fileName);

      toast({
        title: "PDF Exported",
        description: "10-year cash flow analysis PDF has been downloaded.",
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export PDF. Please try again.",
        variant: "destructive"
      });
    }
  }, [report, baseFinancialData, projections, includeInputsSummaryInExport, includeConstructionScheduleInExport, constructionProgressSchedule, isNewBuild, chartExportToggles, toast]);

  // Print-friendly view in new window
  const openPrintView = useCallback(() => {
    if (!report || !baseFinancialData) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Popup Blocked",
        description: "Please allow popups to open the print view.",
        variant: "destructive"
      });
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>10-Year Cash Flow Analysis - ${report.property_address}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
          h1 { font-size: 24px; margin-bottom: 8px; }
          h2 { font-size: 18px; color: #666; margin-bottom: 16px; }
          .meta { color: #888; font-size: 12px; margin-bottom: 24px; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
          .metric { background: #f5f5f5; padding: 16px; border-radius: 8px; }
          .metric-label { font-size: 12px; color: #666; margin-bottom: 4px; }
          .metric-value { font-size: 24px; font-weight: bold; }
          .metric-sub { font-size: 11px; color: #888; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 24px; }
          th, td { padding: 6px 8px; text-align: right; border-bottom: 1px solid #eee; }
          th { background: #3b82f6; color: white; font-weight: 600; }
          td:first-child, th:first-child { text-align: left; font-weight: 500; }
          .section-header { background: #f0f0f0; font-weight: bold; }
          .text-green { color: #16a34a; }
          .text-red { color: #dc2626; }
          .equity-row td:not(:first-child) { color: #16a34a; }
          .summary { background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
          .summary h3 { font-size: 14px; margin-bottom: 8px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .summary-item { text-align: center; }
          .summary-label { font-size: 11px; color: #666; }
          .summary-value { font-size: 18px; font-weight: bold; color: #3b82f6; }
          .disclaimer { font-size: 10px; color: #888; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; }
          @media print { 
            body { padding: 0; }
            .no-print { display: none; }
            table { page-break-inside: avoid; }
          }
          .print-btn { position: fixed; top: 20px; right: 20px; background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 500; }
          .print-btn:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
        
        <h1>10-Year Cash Flow Analysis</h1>
        <h2>${report.property_address}</h2>
        <p class="meta">Generated: ${new Date().toLocaleDateString()}</p>
        
        <div class="metrics">
          <div class="metric">
            <div class="metric-label">Property Value</div>
            <div class="metric-value">${formatCurrency(baseFinancialData.marketValueNow)}</div>
            <div class="metric-sub">Current market value</div>
          </div>
          <div class="metric">
            <div class="metric-label">Purchase Price</div>
            <div class="metric-value">${formatCurrency(baseFinancialData.purchasePrice)}</div>
            <div class="metric-sub">Original purchase price</div>
          </div>
          <div class="metric">
            <div class="metric-label">Loan Amount</div>
            <div class="metric-value">${formatCurrency(baseFinancialData.loanAmount)}</div>
            <div class="metric-sub">${baseFinancialData.loanToValueRatio}% LVR</div>
          </div>
          <div class="metric">
            <div class="metric-label">Weekly Rent</div>
            <div class="metric-value">${formatCurrency(baseFinancialData.weeklyRent)}</div>
            <div class="metric-sub">${formatCurrency(baseFinancialData.weeklyRent * 52)} p.a.</div>
          </div>
          <div class="metric">
            <div class="metric-label">Year 10 Value</div>
            <div class="metric-value">${formatCurrency(projections[10]?.propertyMarketValue || 0)}</div>
            <div class="metric-sub">Projected @ ${baseFinancialData.capitalGrowth}% growth</div>
          </div>
        </div>
        
        ${includeInputsSummaryInExport ? `
        <!-- Summary -->
        <div class="summary" style="margin-bottom: 24px;">
          <h3 style="margin-bottom: 4px; text-align: center; font-size: 16px; font-weight: bold; border-bottom: 2px solid #ccc; padding-bottom: 6px;">${isNewBuild ? 'New Build' : 'Existing Property'}</h3>
          <h4 style="margin-bottom: 12px; text-align: center; font-size: 14px; font-weight: bold; letter-spacing: 1px;">SUMMARY</h4>
          <table style="margin-bottom: 0; font-size: 11px;">
            <tbody>
              <tr><td style="font-weight: 500; width: 50%;">Purchase Price</td><td style="text-align: right;">${formatCurrency(baseFinancialData.purchasePrice)}</td></tr>
              ${isNewBuild ? `
              <tr><td style="font-weight: 500;">Land Price</td><td style="text-align: right;">${formatCurrency(baseFinancialData.landPrice)}</td></tr>
              <tr><td style="font-weight: 500;">Build Price</td><td style="text-align: right;">${formatCurrency(baseFinancialData.buildPrice || (baseFinancialData.purchasePrice - baseFinancialData.landPrice))}</td></tr>
              ` : `
              <tr><td style="font-weight: 500;">Deposit Value</td><td style="text-align: right;">${formatCurrency(baseFinancialData.depositValue || (baseFinancialData.purchasePrice * (1 - baseFinancialData.loanToValueRatio / 100)))}</td></tr>
              `}
              <tr><td style="font-weight: 500;">Loan to Value ratio</td><td style="text-align: right;">${baseFinancialData.loanToValueRatio}%</td></tr>
              <tr><td style="font-weight: 500;">Interest Rate</td><td style="text-align: right;">${baseFinancialData.interestRate.toFixed(2)}%</td></tr>
              <tr><td style="font-weight: 500;">Capital Growth</td><td style="text-align: right;">${baseFinancialData.capitalGrowth}%</td></tr>
              <tr><td style="font-weight: 500;">Weekly Rent</td><td style="text-align: right;">${formatCurrency(baseFinancialData.weeklyRent)}</td></tr>
              <tr><td style="font-weight: 500;">Stamp Duty</td><td style="text-align: right;">${formatCurrency(baseFinancialData.stampDuty)}</td></tr>
              <tr><td style="font-weight: 500;">Body Corporate / Strata Fees</td><td style="text-align: right;">${formatCurrency(baseFinancialData.bodyCorporateFees)}</td></tr>
              <tr><td style="font-weight: 500;">Council Rate Charges</td><td style="text-align: right;">${formatCurrency(baseFinancialData.councilRates)}</td></tr>
              <tr><td style="font-weight: 500;">Water Rate Charges (Other)</td><td style="text-align: right;">${formatCurrency(baseFinancialData.waterRates)}</td></tr>
              <tr><td style="font-weight: 500;">Solicitor Fees</td><td style="text-align: right;">${formatCurrency(baseFinancialData.solicitorFees)}</td></tr>
              <tr><td style="font-weight: 500;">Building & Landlord Insurance</td><td style="text-align: right;">${formatCurrency(baseFinancialData.buildingLandlordInsurance)}</td></tr>
              <tr><td style="font-weight: 500;">Property Management Fees</td><td style="text-align: right;">${baseFinancialData.propertyManagementFees}%</td></tr>
              <tr><td style="font-weight: 500;">Repairs & Maintenance</td><td style="text-align: right;">${formatCurrency(baseFinancialData.repairsMaintenance)}</td></tr>
              <tr><td style="font-weight: 500;">Letting Fees (1 Week Rent)</td><td style="text-align: right;">${formatCurrency(baseFinancialData.lettingFees || baseFinancialData.weeklyRent)}</td></tr>
            </tbody>
          </table>
          <div style="margin-top: 16px; padding-top: 12px; border-top: 2px solid #ccc;">
            <h4 style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">Total Overall Expenditure to Completion</h4>
            <table style="margin-bottom: 0; font-size: 11px;">
              <tbody>
                ${isNewBuild && constructionProgressSchedule ? `
                  <tr><td style="font-weight: 500; width: 50%;">10% Land Purchase price</td><td style="text-align: right;">${formatCurrency(constructionProgressSchedule.upfrontCosts.tenPercentLand)}</td></tr>
                  <tr><td style="font-weight: 500;">5% Build Contract Price</td><td style="text-align: right;">${formatCurrency(constructionProgressSchedule.upfrontCosts.fivePercentBuild)}</td></tr>
                  <tr><td style="font-weight: 500;">Stamp Duty</td><td style="text-align: right;">${formatCurrency(constructionProgressSchedule.upfrontCosts.stampDuty)}</td></tr>
                  <tr><td style="font-weight: 500;">Solicitor Cost</td><td style="text-align: right;">${formatCurrency(constructionProgressSchedule.upfrontCosts.solicitorFees)}</td></tr>
                  <tr style="background: #e5e7eb;"><td style="font-weight: 600;">Total Upfront Cost</td><td style="text-align: right; font-weight: 600;">${formatCurrency(constructionProgressSchedule.upfrontCosts.totalUpfrontCost)}</td></tr>
                  <tr><td style="font-weight: 500;">${constructionProgressSchedule.durationMonths} Month Staged Progress</td><td style="text-align: right;">${formatCurrency(constructionProgressSchedule.totals.totalInterest)}</td></tr>
                  <tr style="background: #dbeafe;"><td style="font-weight: bold; color: #2563eb;">Total</td><td style="text-align: right; font-weight: bold; color: #2563eb;">${formatCurrency(constructionProgressSchedule.grandTotal)}</td></tr>
                ` : `
                  <tr><td style="font-weight: 500; width: 50%;">Deposit Value</td><td style="text-align: right;">${formatCurrency(baseFinancialData.depositValue || (baseFinancialData.purchasePrice * (1 - baseFinancialData.loanToValueRatio / 100)))}</td></tr>
                  <tr><td style="font-weight: 500;">Stamp Duty</td><td style="text-align: right;">${formatCurrency(baseFinancialData.stampDuty)}</td></tr>
                  <tr><td style="font-weight: 500;">Solicitor Cost</td><td style="text-align: right;">${formatCurrency(baseFinancialData.solicitorFees)}</td></tr>
                  <tr><td style="font-weight: 500;">Agent Fee</td><td style="text-align: right;">${formatCurrency(baseFinancialData.agentFee)}</td></tr>
                  <tr style="background: #e5e7eb;"><td style="font-weight: 600;">Total Upfront Cost</td><td style="text-align: right; font-weight: 600;">${formatCurrency((baseFinancialData.depositValue || (baseFinancialData.purchasePrice * (1 - baseFinancialData.loanToValueRatio / 100))) + baseFinancialData.stampDuty + baseFinancialData.solicitorFees + baseFinancialData.agentFee)}</td></tr>
                  <tr style="background: #dbeafe;"><td style="font-weight: bold; color: #2563eb;">Total</td><td style="text-align: right; font-weight: bold; color: #2563eb;">${formatCurrency((baseFinancialData.depositValue || (baseFinancialData.purchasePrice * (1 - baseFinancialData.loanToValueRatio / 100))) + baseFinancialData.stampDuty + baseFinancialData.solicitorFees + baseFinancialData.agentFee)}</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}
        
        ${isNewBuild && includeConstructionScheduleInExport && constructionProgressSchedule && constructionProgressSchedule.buildPrice > 0 ? `
        <!-- Construction Progress Payment Schedule (New Builds Only) -->
        <div class="summary" style="margin-bottom: 24px;">
          <h3 style="margin-bottom: 12px;">Construction Progress Payment Schedule</h3>
          <div style="display: flex; gap: 24px; margin-bottom: 16px; padding: 12px; background: #f0f4f8; border-radius: 6px;">
            <div><span style="font-size: 11px; color: #666;">Land Cost</span><br><strong>${formatCurrency(constructionProgressSchedule.landPrice)}</strong></div>
            <div><span style="font-size: 11px; color: #666;">Build Contract</span><br><strong>${formatCurrency(constructionProgressSchedule.buildPrice)}</strong></div>
            <div><span style="font-size: 11px; color: #666;">Total Project</span><br><strong>${formatCurrency(constructionProgressSchedule.totalProject)}</strong></div>
          </div>
          <p style="font-size: 12px; font-weight: 600; margin-bottom: 8px;">Build Contract Breakdown (${constructionProgressSchedule.durationMonths} Month Construction)</p>
          <table style="margin-bottom: 0; font-size: 11px;">
            <thead>
              <tr>
                <th style="text-align: left;">Stage</th>
                <th style="text-align: left;">Description</th>
                <th style="text-align: center;">Total Build Contract</th>
                <th style="text-align: right;">Stage Pricing</th>
                <th style="text-align: right;">Land Interest (Monthly)</th>
                <th style="text-align: right;">Build Interest (Monthly)</th>
                <th style="text-align: right;">Combined Repayment</th>
                <th style="text-align: center;">Month</th>
              </tr>
            </thead>
            <tbody>
              ${constructionProgressSchedule.stages.map((stage, idx) => `
              <tr style="${idx === 0 ? 'background: #f5f5f5;' : ''}">
                <td style="text-align: left; font-weight: 500;">${stage.stage}</td>
                <td style="text-align: left; color: #666; font-size: 10px;">${stage.description}</td>
                <td style="text-align: center;">${stage.percentage > 0 ? `${stage.percentage}%` : ''}</td>
                <td style="text-align: right;">${formatCurrency(stage.buildAmount)}</td>
                <td style="text-align: right;">${formatCurrency(stage.landInterest)}</td>
                <td style="text-align: right;">${stage.buildInterest > 0 ? formatCurrency(stage.buildInterest) : ''}</td>
                <td style="text-align: right; font-weight: 500;">${formatCurrency(stage.totalMonthlyInterest)}</td>
                <td style="text-align: center;">${stage.month}</td>
              </tr>
              `).join('')}
              <tr style="background: #f0f0f0; font-weight: bold; border-top: 2px solid #ccc;">
                <td></td>
                <td></td>
                <td style="text-align: center;">100%</td>
                <td style="text-align: right;">${formatCurrency(constructionProgressSchedule.landPrice + constructionProgressSchedule.buildPrice)}</td>
                <td style="text-align: right;">Total</td>
                <td></td>
                <td style="text-align: right;">${formatCurrency(constructionProgressSchedule.totals.totalCombinedRepayment)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          <p style="font-size: 10px; color: #888; margin-top: 8px;">* Interest calculated at ${constructionProgressSchedule.interestRate}% p.a. Land interest is constant; build interest increases as stages are drawn.</p>
        </div>
        ` : ''}
        
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Today</th>
              ${Array.from({ length: 10 }, (_, i) => `<th>Yr ${i + 1}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Capital Growth %</td>
              <td></td>
              ${projections.slice(1).map(p => `<td>${p.capitalGrowthRate.toFixed(1)}%</td>`).join('')}
            </tr>
            <tr>
              <td>CPI Growth %</td>
              <td></td>
              ${projections.slice(1).map(p => `<td>${p.cpiGrowthRate.toFixed(1)}%</td>`).join('')}
            </tr>
            <tr>
              <td>Property Value $</td>
              <td>${formatCurrency(projections[0].propertyMarketValue)}</td>
              ${projections.slice(1).map(p => `<td>${formatCurrency(p.propertyMarketValue)}</td>`).join('')}
            </tr>
            <tr>
              <td>Purchase Price $</td>
              <td>${formatCurrency(baseFinancialData.purchasePrice)}</td>
              ${Array(10).fill('<td></td>').join('')}
            </tr>
            <tr>
              <td>Loan Amount $</td>
              <td>${formatCurrency(projections[0].loanAmount)}</td>
              ${projections.slice(1).map(p => `<td>${formatCurrency(p.loanAmount)}</td>`).join('')}
            </tr>
            <tr class="section-header"><td colspan="12">STATISTICS</td></tr>
            <tr class="equity-row">
              <td>Equity $</td>
              <td class="text-green">${formatCurrency(projections[0].equityInProperty)}</td>
              ${projections.slice(1).map(p => `<td class="text-green">${formatCurrency(p.equityInProperty)}</td>`).join('')}
            </tr>
            <tr>
              <td>LVR %</td>
              <td>${projections[0].loanToValueRatio.toFixed(1)}%</td>
              ${projections.slice(1).map(p => `<td>${p.loanToValueRatio.toFixed(1)}%</td>`).join('')}
            </tr>
            <tr>
              <td>Rental Income $</td>
              <td>${formatCurrency(baseFinancialData.weeklyRent)}pw</td>
              ${projections.slice(1).map(p => `<td>${formatCurrency(p.rentalIncome)}</td>`).join('')}
            </tr>
            <tr>
              <td>Gross Yield %</td>
              <td></td>
              ${projections.slice(1).map(p => `<td>${p.grossYield.toFixed(2)}%</td>`).join('')}
            </tr>
            <tr>
              <td>Net Yield %</td>
              <td></td>
              ${projections.slice(1).map(p => `<td>${p.netYield.toFixed(2)}%</td>`).join('')}
            </tr>
            <tr class="section-header"><td colspan="12">CASH DEDUCTIONS</td></tr>
            <tr>
              <td>Property Expenses $</td>
              <td>$0</td>
              ${projections.slice(1).map(p => `<td>${formatCurrency(p.propertyExpenses)}</td>`).join('')}
            </tr>
            <tr>
              <td>Land Tax $</td>
              <td></td>
              ${projections.slice(1).map(p => `<td>${formatCurrency(p.landTax)}</td>`).join('')}
            </tr>
            <tr>
              <td>Interest Rate %</td>
              <td></td>
              ${projections.slice(1).map(p => `<td>${p.interestRate.toFixed(2)}%</td>`).join('')}
            </tr>
            <tr>
              <td>Interest Payments $</td>
              <td>$0</td>
              ${projections.slice(1).map(p => `<td>${formatCurrency(p.interestPayments)}</td>`).join('')}
            </tr>
            <tr>
              <td>Principal Payments $</td>
              <td>$0</td>
              ${projections.slice(1).map(p => `<td>${formatCurrency(p.principalPayments)}</td>`).join('')}
            </tr>
            <tr>
              <td>Pre-Tax Cash Flow p/a $</td>
              <td></td>
              ${projections.slice(1).map(p => `<td class="${p.preTaxCashFlowPA < 0 ? 'text-red' : 'text-green'}">${formatCurrency(p.preTaxCashFlowPA)}</td>`).join('')}
            </tr>
            <tr>
              <td>Pre-Tax Cash Flow p/w $</td>
              <td></td>
              ${projections.slice(1).map(p => `<td class="${p.preTaxCashFlowPW < 0 ? 'text-red' : 'text-green'}">${formatCurrency(p.preTaxCashFlowPW)}</td>`).join('')}
            </tr>
            <tr class="section-header"><td colspan="12">NON-CASH DEDUCTIONS</td></tr>
            <tr>
              <td>Depreciation $</td>
              <td></td>
              ${projections.slice(1).map(p => `<td>${formatCurrency(p.depreciation)}</td>`).join('')}
            </tr>
            <tr class="section-header"><td colspan="12">SUMMARY</td></tr>
            <tr>
              <td>Total Deductions $</td>
              <td></td>
              ${projections.slice(1).map(p => `<td>${formatCurrency(p.totalDeductions)}</td>`).join('')}
            </tr>
            <tr>
              <td>Net Profit/Loss $</td>
              <td></td>
              ${projections.slice(1).map(p => `<td class="${p.netProfitLoss < 0 ? 'text-red' : 'text-green'}">${formatCurrency(p.netProfitLoss)}</td>`).join('')}
            </tr>
            <tr>
              <td>Tax Refund $</td>
              <td></td>
              ${projections.slice(1).map(p => `<td class="text-green">${formatCurrency(p.taxRefund)}</td>`).join('')}
            </tr>
            <tr style="background: #eff6ff; font-weight: bold;">
              <td>After-Tax Cash Flow p/a $</td>
              <td></td>
              ${projections.slice(1).map(p => `<td class="${p.afterTaxCashFlowPA < 0 ? 'text-red' : 'text-green'}">${formatCurrency(p.afterTaxCashFlowPA)}</td>`).join('')}
            </tr>
            <tr style="background: #eff6ff; font-weight: bold;">
              <td>After-Tax Cash Flow p/w $</td>
              <td></td>
              ${projections.slice(1).map(p => `<td class="${p.afterTaxCashFlowPW < 0 ? 'text-red' : 'text-green'}">${formatCurrency(p.afterTaxCashFlowPW)}</td>`).join('')}
            </tr>
          </tbody>
        </table>
        
        <div class="summary">
          <h3>10-Year Investment Summary</h3>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Year 10 Property Value</div>
              <div class="summary-value text-green">${formatCurrency(projections[10]?.propertyMarketValue || 0)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Year 10 Equity</div>
              <div class="summary-value text-green">${formatCurrency(projections[10]?.equityInProperty || 0)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total After-Tax Cash Flow</div>
              <div class="summary-value ${projections.slice(1).reduce((sum, p) => sum + p.afterTaxCashFlowPA, 0) < 0 ? 'text-red' : 'text-green'}">${formatCurrency(projections.slice(1).reduce((sum, p) => sum + p.afterTaxCashFlowPA, 0))}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Capital Gain</div>
              <div class="summary-value text-green">${formatCurrency((projections[10]?.propertyMarketValue || 0) - baseFinancialData.purchasePrice)}</div>
            </div>
          </div>
        </div>
        
        <p class="disclaimer">
          This analysis is for informational purposes only and does not constitute financial advice. 
          Projections are estimates based on assumed growth rates and may not reflect actual future performance.
          Please consult with a qualified financial advisor before making investment decisions.
        </p>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }, [report, baseFinancialData, projections, includeInputsSummaryInExport, includeConstructionScheduleInExport, constructionProgressSchedule, isNewBuild, toast]);

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
                  <Badge 
                    variant={isNewBuild ? "default" : "secondary"}
                    className="ml-2 text-xs"
                  >
                    {isNewBuild ? "New Build" : "Existing Property"}
                  </Badge>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      Export PDF
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 bg-background border">
                    <div className="p-3 space-y-3">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chart Export Options</div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={includeAllChartsInExport}
                            onCheckedChange={(checked) => handleGlobalChartsToggle(checked === true)}
                          />
                          <span className="text-sm font-medium">Include All Charts</span>
                        </label>
                        <Separator className="my-2" />
                        <label className="flex items-center gap-2 cursor-pointer pl-4">
                          <Checkbox
                            checked={chartExportToggles.cashFlowTrends}
                            onCheckedChange={(checked) => handleChartToggle('cashFlowTrends', checked === true)}
                          />
                          <span className="text-sm">Cash Flow Trends</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer pl-4">
                          <Checkbox
                            checked={chartExportToggles.yieldChart}
                            onCheckedChange={(checked) => handleChartToggle('yieldChart', checked === true)}
                          />
                          <span className="text-sm">Yield Percentages</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer pl-4">
                          <Checkbox
                            checked={chartExportToggles.comparisonChart}
                            onCheckedChange={(checked) => handleChartToggle('comparisonChart', checked === true)}
                          />
                          <span className="text-sm">Property Comparison</span>
                        </label>
                      </div>
                      <Separator className="my-2" />
                      <Button size="sm" className="w-full" onClick={exportSingleReportPDF}>
                        <FileText className="h-4 w-4 mr-2" />
                        Generate PDF
                      </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={openPrintView}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print View
                </Button>
              </div>
            </div>
          </DialogHeader>
        </div>

        <Separator />

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">
            {/* Key Metrics Summary */}
            <div className="grid grid-cols-5 gap-4">
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
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs font-medium">Purchase Price</span>
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(baseFinancialData.purchasePrice)}</p>
                  <p className="text-xs text-muted-foreground">Original purchase price</p>
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

            {/* Comparison Mode Toggle & Land Tax Exclusion */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2 flex-wrap">
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Select up to 4 reports:</span>
                    {selectedComparisonReportIds.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {selectedComparisonReportIds.map((id) => {
                          const r = availableReports.find(rep => rep.id === id);
                          return r ? (
                            <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1">
                              {r.property_address.split(',')[0].substring(0, 20)}
                              <X 
                                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                                onClick={() => handleToggleComparisonReport(id)}
                              />
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                    <Select
                      value=""
                      onValueChange={(value) => handleToggleComparisonReport(value)}
                    >
                      <SelectTrigger className="w-[280px]">
                        <SelectValue placeholder={loadingReports ? "Loading..." : `Add property (${selectedComparisonReportIds.length}/4)`} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableReports
                          .filter(r => !selectedComparisonReportIds.includes(r.id))
                          .map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.property_address.length > 40 
                                ? r.property_address.substring(0, 40) + '...' 
                                : r.property_address}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              
              {/* Land Tax Exclusion Toggle */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="excludeLandTax"
                  checked={excludeLandTaxFromCashFlow}
                  onCheckedChange={(checked) => {
                    setExcludeLandTaxFromCashFlow(checked === true);
                    setHasChanges(true);
                  }}
                />
                <label 
                  htmlFor="excludeLandTax" 
                  className="text-sm font-medium cursor-pointer"
                >
                  Exclude Land Tax from analysis
                </label>
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

            {/* Comparison Chart - Side by Side (Up to 5 Properties) */}
            {comparisonMode && comparisonReports.length > 0 && allComparisonProjections.length > 0 && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <GitCompare className="h-4 w-4" />
                      Property Comparison: Cash Flow ({comparisonReports.length + 1} Properties)
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Comparing {comparisonReports.length + 1} properties
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
                  <div ref={comparisonChartRef} className="h-[380px] w-full bg-background p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={projections.filter(p => p.year >= 1).map((p, i) => {
                          const dataPoint: any = {
                            year: `Year ${p.year}`,
                            [`${report?.property_address.split(',')[0]} Value`]: p.propertyMarketValue,
                          };
                          allComparisonProjections.forEach(({ report: compReport, projections: compProjs }, idx) => {
                            dataPoint[`${compReport.property_address.split(',')[0]} Value`] = compProjs[i + 1]?.propertyMarketValue || 0;
                          });
                          return dataPoint;
                        })}
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
                        <Legend wrapperStyle={{ fontSize: '9px' }} />
                        <Line 
                          type="monotone" 
                          dataKey={`${report?.property_address.split(',')[0]} Value`}
                          stroke={COMPARISON_COLORS[0].value} 
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                        {allComparisonProjections.map(({ report: compReport }, idx) => (
                          <Line 
                            key={compReport.id}
                            type="monotone" 
                            dataKey={`${compReport.property_address.split(',')[0]} Value`}
                            stroke={COMPARISON_COLORS[idx + 1]?.value || '#888'}
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={{ r: 2 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Advanced Investment Metrics Comparison */}
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Investment Metrics Comparison ({comparisonReports.length + 1} Properties)</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportComparisonPDF}
                        className="gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        Export PDF
                      </Button>
                    </div>
                    
                    {/* Metrics Table */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[140px] sticky left-0 bg-background">Metric</TableHead>
                            <TableHead className="text-center min-w-[120px]">
                              <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COMPARISON_COLORS[0].value }} />
                              {report?.property_address.split(',')[0].substring(0, 15)}
                            </TableHead>
                            {allComparisonMetrics.map(({ report: compReport }, idx) => (
                              <TableHead key={compReport.id} className="text-center min-w-[120px]">
                                <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COMPARISON_COLORS[idx + 1]?.value || '#888' }} />
                                {compReport.property_address.split(',')[0].substring(0, 15)}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            { label: '10-Year ROI', key: 'roi', format: (v: number) => `${v?.toFixed(1)}%`, higherBetter: true },
                            { label: 'Annualized ROI', key: 'annualizedRoi', format: (v: number) => `${v?.toFixed(2)}%`, higherBetter: true },
                            { label: 'Total Return', key: 'totalReturn', format: (v: number) => `$${(v || 0).toLocaleString()}`, higherBetter: true },
                            { label: 'Break-Even Year', key: 'breakEvenYear', format: (v: number) => v ? `Year ${v}` : 'N/A', higherBetter: false },
                            { label: 'Cash-on-Cash (Y1)', key: 'cashOnCash', format: (v: number) => `${v?.toFixed(2)}%`, higherBetter: true },
                            { label: 'Equity Multiple', key: 'equityMultiple', format: (v: number) => `${v?.toFixed(2)}x`, higherBetter: true },
                            { label: 'Capital Gain', key: 'capitalGain', format: (v: number) => `$${(v || 0).toLocaleString()}`, higherBetter: true },
                            { label: 'Total Cash Flow', key: 'totalCashFlow', format: (v: number) => `$${(v || 0).toLocaleString()}`, higherBetter: true },
                          ].map(({ label, key, format, higherBetter }) => {
                            const allValues = [
                              (primaryMetrics as any)?.[key] || (key === 'breakEvenYear' ? 99 : 0),
                              ...allComparisonMetrics.map(({ metrics }) => (metrics as any)?.[key] || (key === 'breakEvenYear' ? 99 : 0))
                            ];
                            const bestValue = higherBetter 
                              ? Math.max(...allValues.filter(v => v !== 99 && v !== null))
                              : Math.min(...allValues.filter(v => v !== 99 && v !== null));
                            
                            return (
                              <TableRow key={key}>
                                <TableCell className="font-medium sticky left-0 bg-background">{label}</TableCell>
                                <TableCell className={`text-center ${(primaryMetrics as any)?.[key] === bestValue ? 'text-green-600 font-semibold' : ''}`}>
                                  {format((primaryMetrics as any)?.[key])}
                                </TableCell>
                                {allComparisonMetrics.map(({ report: compReport, metrics }) => (
                                  <TableCell key={compReport.id} className={`text-center ${(metrics as any)?.[key] === bestValue ? 'text-green-600 font-semibold' : ''}`}>
                                    {format((metrics as any)?.[key])}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/30">
                            <TableCell className="font-medium sticky left-0 bg-muted/30">Year 10 Property Value</TableCell>
                            <TableCell className="text-center">
                              ${(projections[10]?.propertyMarketValue || 0).toLocaleString()}
                            </TableCell>
                            {allComparisonProjections.map(({ report: compReport, projections: compProjs }) => (
                              <TableCell key={compReport.id} className="text-center">
                                ${(compProjs[10]?.propertyMarketValue || 0).toLocaleString()}
                              </TableCell>
                            ))}
                          </TableRow>
                          <TableRow className="bg-muted/30">
                            <TableCell className="font-medium sticky left-0 bg-muted/30">Year 10 Equity</TableCell>
                            <TableCell className="text-center">
                              ${(projections[10]?.equityInProperty || 0).toLocaleString()}
                            </TableCell>
                            {allComparisonProjections.map(({ report: compReport, projections: compProjs }) => (
                              <TableCell key={compReport.id} className="text-center">
                                ${(compProjs[10]?.equityInProperty || 0).toLocaleString()}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Property Recommendation Engine */}
            {comparisonMode && comparisonReports.length > 0 && propertyRecommendation && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-amber-600" />
                      Investment Recommendation Engine
                    </CardTitle>
                    <Select value={investorProfile} onValueChange={(v) => setInvestorProfile(v as any)}>
                      <SelectTrigger className="w-[180px] h-8">
                        <SelectValue placeholder="Select Profile" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="growth">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-3 w-3 text-blue-500" />
                            Growth Focused
                          </div>
                        </SelectItem>
                        <SelectItem value="income">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-3 w-3 text-green-500" />
                            Income Focused
                          </div>
                        </SelectItem>
                        <SelectItem value="balanced">
                          <div className="flex items-center gap-2">
                            <Zap className="h-3 w-3 text-purple-500" />
                            Balanced
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Profile Description */}
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    {investorProfile === 'growth' && (
                      <span><strong>Growth Focused:</strong> Prioritizes capital appreciation, ROI, and equity growth over immediate cash flow.</span>
                    )}
                    {investorProfile === 'income' && (
                      <span><strong>Income Focused:</strong> Prioritizes positive cash flow, high rental yields, and early break-even.</span>
                    )}
                    {investorProfile === 'balanced' && (
                      <span><strong>Balanced:</strong> Seeks optimal mix of capital growth and income generation.</span>
                    )}
                  </div>

                  {/* Winner Announcement */}
                  <div className="flex items-start gap-4 p-4 rounded-lg border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-transparent">
                    <Award className={`h-10 w-10 ${propertyRecommendation.confidence === 'high' ? 'text-amber-500' : propertyRecommendation.confidence === 'moderate' ? 'text-amber-400' : 'text-amber-300'}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-lg">
                          {propertyRecommendation.winner}
                        </h4>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            propertyRecommendation.confidence === 'high' 
                              ? 'border-green-500 text-green-600' 
                              : propertyRecommendation.confidence === 'moderate'
                              ? 'border-amber-500 text-amber-600'
                              : 'border-gray-500 text-gray-600'
                          }`}
                        >
                          {propertyRecommendation.confidence} confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Best suited for {investorProfile === 'growth' ? 'growth-focused' : investorProfile === 'income' ? 'income-focused' : 'balanced'} investors
                      </p>
                      
                      {/* Rankings */}
                      <div className="space-y-2 mb-3">
                        <div className="text-xs font-semibold">Property Rankings:</div>
                        <div className="flex flex-wrap gap-2">
                          {propertyRecommendation.rankings.map((r, idx) => (
                            <div 
                              key={r.name}
                              className={`text-center px-3 py-1 rounded ${idx === 0 ? 'bg-green-500/20 border border-green-500/40' : 'bg-muted/50'}`}
                            >
                              <div className="text-[10px] text-muted-foreground">#{r.rank}</div>
                              <div className="text-xs font-medium">{r.name}</div>
                              <div className="text-xs font-semibold">{r.score} pts</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Key Insights */}
                      {propertyRecommendation.insights.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-green-600 mb-1">Key Insights:</div>
                          <ul className="text-xs space-y-1">
                            {propertyRecommendation.insights.map((insight, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>{insight}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <p className="text-[10px] text-muted-foreground italic">
                    This recommendation is based on projected data and the selected investor profile. Actual results may vary. 
                    Always conduct thorough due diligence before making investment decisions.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* AI-Powered Comparison Analysis */}
            {comparisonMode && comparisonReports.length > 0 && (
              <Card className="border-blue-500/30 bg-blue-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-600" />
                      AI-Powered Cash Flow Analysis
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {isLoadingAnalysis && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <RotateCcw className="h-3 w-3 animate-spin" />
                          Loading...
                        </Badge>
                      )}
                      {savedAnalysisId && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Save className="h-3 w-3" />
                          Saved
                        </Badge>
                      )}
                      {aiAnalysis && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={saveAiAnalysis}
                            disabled={isSavingAnalysis}
                            className="gap-1"
                          >
                            {isSavingAnalysis ? (
                              <RotateCcw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            {savedAnalysisId ? 'Update' : 'Save'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={exportAiAnalysisPDF}
                            className="gap-1"
                          >
                            <Download className="h-3 w-3" />
                            Export PDF
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        onClick={generateAiAnalysis}
                        disabled={isGeneratingAiAnalysis || isLoadingAnalysis}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {isGeneratingAiAnalysis ? (
                          <>
                            <RotateCcw className="h-3 w-3 mr-1 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Zap className="h-3 w-3 mr-1" />
                            {aiAnalysis ? 'Regenerate' : 'Generate AI Analysis'}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!aiAnalysis && !isGeneratingAiAnalysis && (
                    <p className="text-sm text-muted-foreground">
                      Click "Generate AI Analysis" to get an in-depth AI-powered comparison of cash flow projections, 
                      investment potential, and personalized recommendations based on your investor profile.
                    </p>
                  )}
                  
                  {isGeneratingAiAnalysis && (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <RotateCcw className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                        <p className="text-sm text-muted-foreground">Analyzing cash flow projections...</p>
                      </div>
                    </div>
                  )}
                  
                  {aiAnalysis && (
                    <div className="space-y-4">
                      {/* Executive Summary */}
                      {aiAnalysis.executiveSummary && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <h4 className="font-semibold text-sm mb-2">Executive Summary</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-line">{aiAnalysis.executiveSummary}</p>
                        </div>
                      )}
                      
                      {/* Final Rankings */}
                      {aiAnalysis.finalRankings && aiAnalysis.finalRankings.length > 0 && (
                        <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-transparent border border-blue-500/20">
                          <h4 className="font-semibold text-sm mb-3">Final Rankings</h4>
                          <div className="space-y-2">
                            {aiAnalysis.finalRankings.map((ranking: any, idx: number) => (
                              <div key={idx} className={`p-2 rounded ${idx === 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-muted/30'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant={idx === 0 ? 'default' : 'outline'} className="text-xs">
                                    #{ranking.rank}
                                  </Badge>
                                  <span className="font-medium text-sm">{ranking.address}</span>
                                  {ranking.score && (
                                    <Badge variant="secondary" className="text-xs ml-auto">
                                      Score: {typeof ranking.score === 'number' ? ranking.score.toFixed(1) : ranking.score}
                                    </Badge>
                                  )}
                                </div>
                                {ranking.verdict && (
                                  <p className="text-xs text-muted-foreground mt-1">{ranking.verdict}</p>
                                )}
                                {ranking.strengths && ranking.strengths.length > 0 && (
                                  <div className="mt-2">
                                    <span className="text-[10px] text-green-600 font-medium">Strengths: </span>
                                    <span className="text-[10px] text-muted-foreground">{ranking.strengths.join(', ')}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Investor Recommendations */}
                      {aiAnalysis.investorRecommendations && (
                        <div className="p-3 rounded-lg bg-muted/30">
                          <h4 className="font-semibold text-sm mb-2">Investor Profile Recommendations</h4>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {aiAnalysis.investorRecommendations.growthFocused && (
                              <div className="p-2 bg-blue-500/10 rounded">
                                <span className="font-medium text-blue-600">Growth Focused:</span>
                                <p className="text-muted-foreground mt-1">{aiAnalysis.investorRecommendations.growthFocused.reason}</p>
                              </div>
                            )}
                            {aiAnalysis.investorRecommendations.incomeFocused && (
                              <div className="p-2 bg-green-500/10 rounded">
                                <span className="font-medium text-green-600">Income Focused:</span>
                                <p className="text-muted-foreground mt-1">{aiAnalysis.investorRecommendations.incomeFocused.reason}</p>
                              </div>
                            )}
                            {aiAnalysis.investorRecommendations.balanced && (
                              <div className="p-2 bg-purple-500/10 rounded">
                                <span className="font-medium text-purple-600">Balanced:</span>
                                <p className="text-muted-foreground mt-1">{aiAnalysis.investorRecommendations.balanced.reason}</p>
                              </div>
                            )}
                            {aiAnalysis.investorRecommendations.riskAverse && (
                              <div className="p-2 bg-amber-500/10 rounded">
                                <span className="font-medium text-amber-600">Risk Averse:</span>
                                <p className="text-muted-foreground mt-1">{aiAnalysis.investorRecommendations.riskAverse.reason}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Overall Recommendation */}
                      {aiAnalysis.overallRecommendation?.bestProperty && (
                        <div className="p-3 rounded-lg border-2 border-green-500/40 bg-green-500/5">
                          <h4 className="font-semibold text-sm text-green-600 mb-1">Best Overall Property</h4>
                          <p className="text-sm">{aiAnalysis.overallRecommendation.bestProperty.reason}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-3">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> Click on any cell in Years 1-10 to edit values directly. Year 0 (Today) is the reference point and cannot be edited. 
                  Cells with <span className="text-primary font-semibold">blue highlighting</span> have been overridden.
                </p>
              </CardContent>
            </Card>

            {/* Inputs Summary Table - Collapsible */}
            <Collapsible open={inputsSummaryOpen} onOpenChange={setInputsSummaryOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {inputsSummaryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {isNewBuild ? 'New Build' : 'Existing Property'} - SUMMARY
                      </span>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground cursor-pointer">
                          <Checkbox
                            checked={includeInputsSummaryInExport}
                            onCheckedChange={(checked) => setIncludeInputsSummaryInExport(checked === true)}
                          />
                          Include in PDF/Print
                        </label>
                      </div>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {/* INPUTS Section */}
                    <div className="border-b-2 border-muted pb-2 mb-3">
                      <h4 className="text-sm font-bold text-center tracking-wide">INPUTS</h4>
                    </div>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium w-1/2">Purchase Price</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.purchasePrice)}</TableCell>
                        </TableRow>
                        {isNewBuild && (
                          <>
                            <TableRow>
                              <TableCell className="font-medium">Land Price</TableCell>
                              <TableCell className="text-right">{formatCurrency(baseFinancialData.landPrice)}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Build Price</TableCell>
                              <TableCell className="text-right">{formatCurrency(baseFinancialData.buildPrice || (baseFinancialData.purchasePrice - baseFinancialData.landPrice))}</TableCell>
                            </TableRow>
                          </>
                        )}
                        {/* Only show Deposit Value for existing properties */}
                        {!isNewBuild && (
                          <TableRow>
                            <TableCell className="font-medium">Deposit Value</TableCell>
                            <TableCell className="text-right">{formatCurrency(baseFinancialData.depositValue || (baseFinancialData.purchasePrice * (1 - baseFinancialData.loanToValueRatio / 100)))}</TableCell>
                          </TableRow>
                        )}
                        <TableRow>
                          <TableCell className="font-medium">Loan to Value ratio</TableCell>
                          <TableCell className="text-right">{baseFinancialData.loanToValueRatio}%</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Interest Rate</TableCell>
                          <TableCell className="text-right">{baseFinancialData.interestRate.toFixed(2)}%</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Capital Growth</TableCell>
                          <TableCell className="text-right">{baseFinancialData.capitalGrowth}%</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Weekly Rent</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.weeklyRent)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Stamp Duty</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.stampDuty)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Body Corporate / Strata Fees</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.bodyCorporateFees)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Council Rate Charges</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.councilRates)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Water Rate Charges (Other)</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.waterRates)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Solicitor Fees</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.solicitorFees)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Building & Landlord Insurance</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.buildingLandlordInsurance)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Property Management Fees</TableCell>
                          <TableCell className="text-right">{baseFinancialData.propertyManagementFees}%</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Repairs & Maintenance</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.repairsMaintenance)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Letting Fees (1 Week Rent)</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.lettingFees || baseFinancialData.weeklyRent)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Land Tax (p.a.)</TableCell>
                          <TableCell className="text-right">{formatCurrency(baseFinancialData.landTax)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    
                    {/* Cash Flow Analysis Inputs Section */}
                    <div className="mt-6 pt-4 border-t-2 border-muted">
                      <div className="border-b border-muted pb-2 mb-3">
                        <h4 className="text-sm font-bold">Cash Flow Analysis Inputs</h4>
                      </div>
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium w-1/2">Loan Amount</TableCell>
                            <TableCell className="text-right">{formatCurrency(baseFinancialData.loanAmount)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Loan Type</TableCell>
                            <TableCell className="text-right">{baseFinancialData.loanType === 'interest_only' ? 'Interest Only' : 'Principal & Interest'}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Loan Term</TableCell>
                            <TableCell className="text-right">{baseFinancialData.loanTermYears} years</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Occupancy Rate</TableCell>
                            <TableCell className="text-right">{baseFinancialData.occupancyRate} weeks/year</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">CPI / Expense Growth Rate</TableCell>
                            <TableCell className="text-right">{baseFinancialData.cpiGrowthRate}%</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Tax Rate (Marginal)</TableCell>
                            <TableCell className="text-right">{baseFinancialData.taxRate}%</TableCell>
                          </TableRow>
                          <TableRow className={baseFinancialData.depreciation > 0 ? 'bg-yellow-50 dark:bg-yellow-950/30' : ''}>
                            <TableCell className="font-medium">
                              Annual Depreciation (Year 1)
                              {baseFinancialData.includeDepreciationInCashFlow ? '' : ' (Excluded)'}
                              {baseFinancialData.depreciationSchedule ? (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  10-Year Schedule ({baseFinancialData.depreciationMethod?.toUpperCase() || 'DV'})
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(baseFinancialData.depreciation)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                    
                    {/* Total Overall Expenditure to Completion */}
                    <div className="mt-6 pt-4 border-t-2 border-muted">
                      <div className="border-b border-muted pb-2 mb-3">
                        <h4 className="text-sm font-bold">Total Overall Expenditure to Completion</h4>
                      </div>
                      <Table>
                        <TableBody>
                          {isNewBuild && constructionProgressSchedule ? (
                            <>
                              <TableRow>
                                <TableCell className="font-medium w-1/2">10% Land Purchase price</TableCell>
                                <TableCell className="text-right">{formatCurrency(constructionProgressSchedule.upfrontCosts.tenPercentLand)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="font-medium">5% Build Contract Price</TableCell>
                                <TableCell className="text-right">{formatCurrency(constructionProgressSchedule.upfrontCosts.fivePercentBuild)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="font-medium">Stamp Duty</TableCell>
                                <TableCell className="text-right">{formatCurrency(constructionProgressSchedule.upfrontCosts.stampDuty)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="font-medium">Solicitor Cost</TableCell>
                                <TableCell className="text-right">{formatCurrency(constructionProgressSchedule.upfrontCosts.solicitorFees)}</TableCell>
                              </TableRow>
                              <TableRow className="bg-muted/30">
                                <TableCell className="font-semibold">Total Upfront Cost</TableCell>
                                <TableCell className="text-right font-semibold">{formatCurrency(constructionProgressSchedule.upfrontCosts.totalUpfrontCost)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="font-medium">{constructionProgressSchedule.durationMonths} Month Staged Progress</TableCell>
                                <TableCell className="text-right">{formatCurrency(constructionProgressSchedule.totals.totalInterest)}</TableCell>
                              </TableRow>
                              <TableRow className="bg-primary/10">
                                <TableCell className="font-bold text-primary">Total</TableCell>
                                <TableCell className="text-right font-bold text-primary">{formatCurrency(constructionProgressSchedule.grandTotal)}</TableCell>
                              </TableRow>
                            </>
                          ) : (
                            <>
                              <TableRow>
                                <TableCell className="font-medium w-1/2">Deposit Value</TableCell>
                                <TableCell className="text-right">{formatCurrency(baseFinancialData.depositValue || (baseFinancialData.purchasePrice * (1 - baseFinancialData.loanToValueRatio / 100)))}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="font-medium">Stamp Duty</TableCell>
                                <TableCell className="text-right">{formatCurrency(baseFinancialData.stampDuty)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="font-medium">Solicitor Cost</TableCell>
                                <TableCell className="text-right">{formatCurrency(baseFinancialData.solicitorFees)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="font-medium">Agent Fee</TableCell>
                                <TableCell className="text-right">{formatCurrency(baseFinancialData.agentFee)}</TableCell>
                              </TableRow>
                              <TableRow className="bg-muted/30">
                                <TableCell className="font-semibold">Total Upfront Cost</TableCell>
                                <TableCell className="text-right font-semibold">
                                  {formatCurrency(
                                    (baseFinancialData.depositValue || (baseFinancialData.purchasePrice * (1 - baseFinancialData.loanToValueRatio / 100))) +
                                    baseFinancialData.stampDuty +
                                    baseFinancialData.solicitorFees +
                                    baseFinancialData.agentFee
                                  )}
                                </TableCell>
                              </TableRow>
                              <TableRow className="bg-primary/10">
                                <TableCell className="font-bold text-primary">Total</TableCell>
                                <TableCell className="text-right font-bold text-primary">
                                  {formatCurrency(
                                    (baseFinancialData.depositValue || (baseFinancialData.purchasePrice * (1 - baseFinancialData.loanToValueRatio / 100))) +
                                    baseFinancialData.stampDuty +
                                    baseFinancialData.solicitorFees +
                                    baseFinancialData.agentFee
                                  )}
                                </TableCell>
                              </TableRow>
                            </>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Construction Progress Payment Schedule - Collapsible (New Builds Only) */}
            {isNewBuild && constructionProgressSchedule && constructionProgressSchedule.buildPrice > 0 && (
              <Collapsible open={constructionScheduleOpen} onOpenChange={setConstructionScheduleOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          {constructionScheduleOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          Construction Progress Payment Schedule
                        </span>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground cursor-pointer">
                            <Checkbox
                              checked={includeConstructionScheduleInExport}
                              onCheckedChange={(checked) => setIncludeConstructionScheduleInExport(checked === true)}
                            />
                            Include in PDF/Print
                          </label>
                        </div>
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      {/* Preset Selection */}
                      <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-muted/20 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Schedule Mode:</span>
                          <Select value={schedulePreset} onValueChange={(value: 'rapid' | 'even' | 'custom') => setSchedulePreset(value)}>
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Select mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rapid">Rapid Build (Months 2-7)</SelectItem>
                              <SelectItem value="even">Even Distribution</SelectItem>
                              <SelectItem value="custom">Custom Positioning</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {schedulePreset === 'rapid' && 'Stages are fixed at months 2-7. Additional months show interest-only rows.'}
                          {schedulePreset === 'even' && `Stages are evenly distributed across ${constructionProgressSchedule.durationMonths} months.`}
                          {schedulePreset === 'custom' && 'Customize which month each stage occurs. Click on the month column to edit.'}
                        </span>
                      </div>

                      {/* Custom Stage Month Selection (only in custom mode) */}
                      {schedulePreset === 'custom' && (
                        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                          <h5 className="text-sm font-medium mb-3 text-blue-900 dark:text-blue-100">Custom Stage Positioning</h5>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[
                              { index: 0, label: 'Deposit' },
                              { index: 1, label: 'Slab/Base' },
                              { index: 2, label: 'Frame' },
                              { index: 3, label: 'Lock-up' },
                              { index: 4, label: 'Fixing' },
                              { index: 5, label: 'Completion' },
                            ].map(({ index, label }) => (
                              <div key={index} className="flex flex-col gap-1">
                                <label className="text-xs text-muted-foreground">{label}</label>
                                <Select 
                                  value={String(customStageMonths[index] || (index + 2))}
                                  onValueChange={(value) => {
                                    setCustomStageMonths(prev => ({
                                      ...prev,
                                      [index]: parseInt(value, 10)
                                    }));
                                  }}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Month" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: constructionProgressSchedule.durationMonths - 1 }, (_, i) => i + 2).map(month => (
                                      <SelectItem key={month} value={String(month)}>
                                        Month {month}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Note: Multiple stages can occur in the same month. Interest calculations update automatically.
                          </p>
                        </div>
                      )}

                      {/* Project Summary */}
                      <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-muted/30 rounded-lg">
                        <div>
                          <span className="text-xs text-muted-foreground">Land Cost</span>
                          <p className="font-semibold">{formatCurrency(constructionProgressSchedule.landPrice)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Build Contract</span>
                          <p className="font-semibold">{formatCurrency(constructionProgressSchedule.buildPrice)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Total Project</span>
                          <p className="font-semibold">{formatCurrency(constructionProgressSchedule.totalProject)}</p>
                        </div>
                      </div>

                      {/* Build Contract Breakdown */}
                      <h4 className="text-sm font-semibold mb-2">Build Contract Breakdown ({constructionProgressSchedule.durationMonths} Month Construction)</h4>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Stage</TableHead>
                            <TableHead className="font-semibold">Description</TableHead>
                            <TableHead className="text-center font-semibold">Total Build Contract</TableHead>
                            <TableHead className="text-right font-semibold">Stage Pricing</TableHead>
                            <TableHead className="text-right font-semibold">Land Interest Charge (Monthly)</TableHead>
                            <TableHead className="text-right font-semibold">Build Interest Charge (Monthly)</TableHead>
                            <TableHead className="text-right font-semibold">Combined Repayment Breakdown</TableHead>
                            <TableHead className="text-center font-semibold">Month</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {constructionProgressSchedule.stages.map((stage, idx) => (
                            <TableRow key={idx} className={idx === 0 ? 'bg-muted/20' : ''}>
                              <TableCell className="font-medium">{stage.stage || ''}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{stage.description || ''}</TableCell>
                              <TableCell className="text-center">{stage.percentage > 0 ? `${stage.percentage}%` : ''}</TableCell>
                              <TableCell className="text-right">{stage.buildAmount > 0 ? formatCurrency(stage.buildAmount) : ''}</TableCell>
                              <TableCell className="text-right">{formatCurrency(stage.landInterest)}</TableCell>
                              <TableCell className="text-right">{stage.buildInterest > 0 ? formatCurrency(stage.buildInterest) : ''}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(stage.totalMonthlyInterest)}</TableCell>
                              <TableCell className="text-center">{stage.month}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-semibold border-t-2">
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-center font-bold">100%</TableCell>
                            <TableCell className="text-right font-bold">{formatCurrency(constructionProgressSchedule.landPrice + constructionProgressSchedule.buildPrice)}</TableCell>
                            <TableCell className="text-right font-semibold">Total</TableCell>
                            <TableCell className="text-right"></TableCell>
                            <TableCell className="text-right font-bold">{formatCurrency(constructionProgressSchedule.totals.totalCombinedRepayment)}</TableCell>
                            <TableCell className="text-center"></TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>

                      <p className="text-xs text-muted-foreground mt-3">
                        * Interest calculated at {constructionProgressSchedule.interestRate}% p.a. Land interest is constant; build interest increases as stages are drawn.
                      </p>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

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
                            {p.year >= 1 && <span className="block text-[10px] font-normal text-muted-foreground">editable</span>}
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
                      
                      {/* Land Tax - Editable (moved from Summary to Cash Deductions) */}
                      {!excludeLandTaxFromCashFlow && (
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
                      )}
                      
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
