import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, RotateCcw, Save, Calculator, ExternalLink, ChevronDown, ChevronRight, ArrowRight, Check, Table, Copy } from 'lucide-react';
import { Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATE_MAPPING } from '@/lib/states';

interface InvestmentReport {
  id: string;
  property_address: string;
  financial_calculations?: any;
  manual_overrides?: any;
}

interface ManualDataOverrideModalProps {
  report: InvestmentReport | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void | Promise<void>;
}

interface OverrideField {
  key: string;
  label: string;
  originalValue: number | string | null;
  overrideValue: number | string | null;
  prefix?: string;
  suffix?: string;
  type?: 'number' | 'select';
  options?: { value: string; label: string }[];
  isCashFlowField?: boolean; // New fields for cash flow analysis
}

export function ManualDataOverrideModal({ report, isOpen, onClose, onSave }: ManualDataOverrideModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [cashFlowFieldToggles, setCashFlowFieldToggles] = useState<Record<string, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [includeDepreciationInCashFlow, setIncludeDepreciationInCashFlow] = useState(true);
  const [showDepreciationCalculator, setShowDepreciationCalculator] = useState(false);
  const [showStampDutyCalculator, setShowStampDutyCalculator] = useState(false);
  const [detectedState, setDetectedState] = useState<string>('All');
  
  // Depreciation Schedule Builder state
  const [showDepreciationSchedule, setShowDepreciationSchedule] = useState(false);
  const [depreciationMethod, setDepreciationMethod] = useState<'prime_cost' | 'diminishing_value'>('prime_cost');
  const [depreciationSchedule, setDepreciationSchedule] = useState<Record<number, number>>({});
  const [year1Depreciation, setYear1Depreciation] = useState<number>(0);

  // Detect state from property address
  const detectStateFromAddress = useCallback((address: string): string => {
    if (!address) return 'All';
    const upperAddress = address.toUpperCase();
    
    // Check for state abbreviations (commonly at end of address like "Sydney, NSW 2000")
    for (const abbr of Object.keys(STATE_MAPPING)) {
      // Match state abbreviation with word boundaries or at end
      const patterns = [
        new RegExp(`\\b${abbr}\\b`),  // Word boundary match
        new RegExp(`\\s${abbr}\\s*\\d{4}`),  // Before postcode
        new RegExp(`,\\s*${abbr}\\s`),  // After comma
      ];
      if (patterns.some(p => p.test(upperAddress))) {
        return abbr;
      }
    }
    
    // Check for full state names
    for (const [abbr, fullName] of Object.entries(STATE_MAPPING)) {
      if (upperAddress.includes(fullName.toUpperCase())) {
        return abbr;
      }
    }
    
    return 'All';
  }, []);

  // Detect state when report changes
  useEffect(() => {
    if (report?.property_address) {
      const state = detectStateFromAddress(report.property_address);
      setDetectedState(state);
    }
  }, [report?.property_address, detectStateFromAddress]);

  // Load stamp duty calculator script when expanded
  useEffect(() => {
    if (showStampDutyCalculator) {
      // Remove existing script to reload with new state
      const existingScript = document.getElementById('stamp-src');
      if (existingScript) {
        existingScript.remove();
      }
      
      // Create and append new script with detected state
      const script = document.createElement('script');
      script.id = 'stamp-src';
      script.type = 'text/javascript';
      script.src = '//calculatorsonline.com.au/external/!main/stamp_duty.min.js';
      script.setAttribute('data-state', detectedState);
      document.body.appendChild(script);
      
      // Show the calculator div
      const calcDiv = document.getElementById('stamp-duty-calculator');
      if (calcDiv) {
        calcDiv.classList.remove('hidden');
      }
    }
  }, [showStampDutyCalculator, detectedState]);

  // Function to capture stamp duty from calculator
  const captureStampDutyFromCalculator = useCallback(() => {
    // Try to find the stamp duty result in the calculator's output
    const calcContainer = document.getElementById('stamp-duty-calculator');
    if (!calcContainer) {
      toast({
        title: "Calculator not loaded",
        description: "Please wait for the calculator to load and calculate a value first.",
        variant: "destructive"
      });
      return;
    }

    // Look for common patterns in calculator output
    // The calculator typically shows results in elements with specific classes or IDs
    const resultSelectors = [
      '.stamp-duty-result',
      '.result-value',
      '#stamp-duty-result',
      '[data-result]',
      '.calc-result',
      'strong',
      '.total',
      '#total'
    ];

    let stampDutyValue: number | null = null;

    for (const selector of resultSelectors) {
      const elements = calcContainer.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent || '';
        // Look for dollar amounts like $12,345 or $12,345.67
        const match = text.match(/\$[\d,]+(?:\.\d{2})?/);
        if (match) {
          const value = parseFloat(match[0].replace(/[$,]/g, ''));
          if (value > 0 && value < 10000000) { // Reasonable stamp duty range
            stampDutyValue = value;
            break;
          }
        }
      }
      if (stampDutyValue) break;
    }

    // Also search all text content for dollar amounts if specific selectors didn't work
    if (!stampDutyValue) {
      const allText = calcContainer.textContent || '';
      const matches = allText.match(/\$[\d,]+(?:\.\d{2})?/g);
      if (matches && matches.length > 0) {
        // Try to find a reasonable stamp duty value (typically the largest or last value)
        const values = matches
          .map(m => parseFloat(m.replace(/[$,]/g, '')))
          .filter(v => v > 100 && v < 10000000); // Filter reasonable values
        
        if (values.length > 0) {
          // Take the last reasonable value (often the result)
          stampDutyValue = values[values.length - 1];
        }
      }
    }

    if (stampDutyValue) {
      setOverrides(prev => ({
        ...prev,
        stampDuty: stampDutyValue
      }));
      setHasChanges(true);
      toast({
        title: "Stamp Duty Applied",
        description: `$${stampDutyValue.toLocaleString()} has been applied to the Stamp Duty field.`,
      });
    } else {
      toast({
        title: "Could not capture value",
        description: "Please calculate stamp duty in the calculator first, then try again. You can also manually enter the value.",
        variant: "destructive"
      });
    }
  }, [toast]);

  // Define the confirmed input fields for manual overrides
  // Grouped by category for better organization
  const purchaseLoanFields: OverrideField[] = [
    {
      key: 'purchasePrice',
      label: 'Purchase Price',
      originalValue: report?.financial_calculations?.purchasePrice || report?.financial_calculations?.propertyValue || null,
      overrideValue: report?.manual_overrides?.purchasePrice || null,
      prefix: '$'
    },
    {
      key: 'landPrice',
      label: 'Land Price',
      originalValue: report?.financial_calculations?.landPrice || null,
      overrideValue: report?.manual_overrides?.landPrice || null,
      prefix: '$'
    },
    {
      key: 'buildPrice',
      label: 'Build Price',
      originalValue: report?.financial_calculations?.buildPrice || null,
      overrideValue: report?.manual_overrides?.buildPrice || null,
      prefix: '$'
    },
    {
      key: 'marketValueNow',
      label: 'Market Value Now',
      originalValue: report?.financial_calculations?.marketValueNow || null,
      overrideValue: report?.manual_overrides?.marketValueNow || null,
      prefix: '$',
      isCashFlowField: true
    },
    {
      key: 'depositValue',
      label: 'Deposit Value',
      originalValue: report?.financial_calculations?.depositValue || null,
      overrideValue: report?.manual_overrides?.depositValue || null,
      prefix: '$'
    },
    {
      key: 'loanAmount',
      label: 'Loan Amount',
      originalValue: report?.financial_calculations?.loanAmount || null,
      overrideValue: report?.manual_overrides?.loanAmount || null,
      prefix: '$',
      isCashFlowField: true
    },
    {
      key: 'loanToValueRatio',
      label: 'Loan to Value Ratio',
      originalValue: report?.financial_calculations?.loanToValueRatio || null,
      overrideValue: report?.manual_overrides?.loanToValueRatio || null,
      suffix: '%'
    },
    {
      key: 'loanType',
      label: 'Loan Type',
      originalValue: report?.financial_calculations?.loanType || null,
      overrideValue: report?.manual_overrides?.loanType || null,
      type: 'select',
      options: [
        { value: 'interest_only', label: 'Interest Only' },
        { value: 'principal_interest', label: 'Principal & Interest' }
      ],
      isCashFlowField: true
    },
    {
      key: 'loanTermYears',
      label: 'Loan Term',
      originalValue: report?.financial_calculations?.loanTermYears || null,
      overrideValue: report?.manual_overrides?.loanTermYears || null,
      suffix: 'years',
      isCashFlowField: true
    },
    {
      key: 'interestRate',
      label: 'Interest Rate',
      originalValue: report?.financial_calculations?.interestRate || null,
      overrideValue: report?.manual_overrides?.interestRate || null,
      suffix: '%'
    },
    {
      key: 'capitalGrowth',
      label: 'Capital Growth',
      originalValue: report?.financial_calculations?.capitalGrowth || null,
      overrideValue: report?.manual_overrides?.capitalGrowth || null,
      suffix: '%'
    },
    {
      key: 'constructionDurationMonths',
      label: 'Construction Duration',
      originalValue: report?.financial_calculations?.constructionDurationMonths || null,
      overrideValue: report?.manual_overrides?.constructionDurationMonths || null,
      suffix: 'months',
      isCashFlowField: true
    },
  ];

  const rentalIncomeFields: OverrideField[] = [
    {
      key: 'weeklyRent',
      label: 'Weekly Rent',
      originalValue: report?.financial_calculations?.weeklyRent || null,
      overrideValue: report?.manual_overrides?.weeklyRent || null,
      prefix: '$'
    },
    {
      key: 'occupancyRate',
      label: 'Occupancy Rate',
      originalValue: report?.financial_calculations?.occupancyRate || 52,
      overrideValue: report?.manual_overrides?.occupancyRate || null,
      suffix: 'weeks/year',
      isCashFlowField: true
    },
  ];

  const annualExpenseFields: OverrideField[] = [
    {
      key: 'stampDuty',
      label: 'Stamp Duty',
      originalValue: report?.financial_calculations?.stampDuty || null,
      overrideValue: report?.manual_overrides?.stampDuty || null,
      prefix: '$'
    },
    {
      key: 'bodyCorporateFees',
      label: 'Body Corporate / Strata Fees',
      originalValue: report?.financial_calculations?.bodyCorporateFees || report?.financial_calculations?.strataFees || null,
      overrideValue: report?.manual_overrides?.bodyCorporateFees || null,
      prefix: '$'
    },
    {
      key: 'landTax',
      label: 'Land Tax',
      originalValue: report?.financial_calculations?.landTax || report?.financial_calculations?.annualCosts?.landTax || null,
      overrideValue: report?.manual_overrides?.landTax || null,
      prefix: '$'
    },
    {
      key: 'councilRates',
      label: 'Council Rate Charges',
      originalValue: report?.financial_calculations?.councilRates || null,
      overrideValue: report?.manual_overrides?.councilRates || null,
      prefix: '$'
    },
    {
      key: 'waterRates',
      label: 'Water Rate Charges (Other)',
      originalValue: report?.financial_calculations?.waterRates || null,
      overrideValue: report?.manual_overrides?.waterRates || null,
      prefix: '$'
    },
    {
      key: 'solicitorFees',
      label: 'Solicitor Fees',
      originalValue: report?.financial_calculations?.solicitorFees || report?.financial_calculations?.legalFees || null,
      overrideValue: report?.manual_overrides?.solicitorFees || null,
      prefix: '$'
    },
    {
      key: 'buildingLandlordInsurance',
      label: 'Building & Landlord Insurance',
      originalValue: report?.financial_calculations?.buildingLandlordInsurance || null,
      overrideValue: report?.manual_overrides?.buildingLandlordInsurance || null,
      prefix: '$'
    },
    {
      key: 'propertyManagementFees',
      label: 'Property Management Fees',
      originalValue: report?.financial_calculations?.propertyManagementFees || null,
      overrideValue: report?.manual_overrides?.propertyManagementFees || null,
      suffix: '%'
    },
    {
      key: 'repairsMaintenance',
      label: 'Repairs & Maintenance',
      originalValue: report?.financial_calculations?.repairsMaintenance || null,
      overrideValue: report?.manual_overrides?.repairsMaintenance || null,
      prefix: '$'
    },
    {
      key: 'lettingFees',
      label: 'Letting Fees (1 Week Rent)',
      originalValue: report?.financial_calculations?.lettingFees || null,
      overrideValue: report?.manual_overrides?.lettingFees || null,
      prefix: '$'
    },
    {
      key: 'agentFee',
      label: 'Agent Fee (Commission)',
      originalValue: report?.financial_calculations?.agentFee || null,
      overrideValue: report?.manual_overrides?.agentFee || null,
      prefix: '$',
      isCashFlowField: true
    },
  ];

  const taxGrowthFields: OverrideField[] = [
    {
      key: 'cpiGrowthRate',
      label: 'CPI / Expense Growth Rate',
      originalValue: report?.financial_calculations?.cpiGrowthRate || 3,
      overrideValue: report?.manual_overrides?.cpiGrowthRate || null,
      suffix: '%',
      isCashFlowField: true
    },
    {
      key: 'depreciation',
      label: 'Annual Depreciation',
      originalValue: report?.financial_calculations?.depreciation || null,
      overrideValue: report?.manual_overrides?.depreciation || null,
      prefix: '$',
      isCashFlowField: true
    },
    {
      key: 'taxRate',
      label: 'Tax Rate (Marginal)',
      originalValue: report?.financial_calculations?.taxRate || 30,
      overrideValue: report?.manual_overrides?.taxRate || null,
      suffix: '%',
      isCashFlowField: true
    },
    {
      key: 'constructionYear',
      label: 'Construction Year',
      originalValue: report?.financial_calculations?.constructionYear || null,
      overrideValue: report?.manual_overrides?.constructionYear || null,
      isCashFlowField: true
    },
  ];

  const propertySpecFields: OverrideField[] = [
    {
      key: 'landSizeSqm',
      label: 'Land Size',
      originalValue: report?.financial_calculations?.landSizeSqm || null,
      overrideValue: report?.manual_overrides?.landSizeSqm || null,
      suffix: 'm²'
    },
    {
      key: 'buildSizeSqm',
      label: 'Build Size',
      originalValue: report?.financial_calculations?.buildSizeSqm || null,
      overrideValue: report?.manual_overrides?.buildSizeSqm || null,
      suffix: 'm²'
    }
  ];

  // Combined fields for legacy support
  const fields: OverrideField[] = [
    ...purchaseLoanFields,
    ...rentalIncomeFields,
    ...annualExpenseFields,
    ...taxGrowthFields,
    ...propertySpecFields
  ];

  useEffect(() => {
    if (report && isOpen) {
      // Initialize overrides from existing manual_overrides
      setOverrides(report.manual_overrides || {});
      // Initialize cash flow field toggles (default: don't include new fields in investment report)
      const defaultToggles: Record<string, boolean> = {};
      fields.filter(f => f.isCashFlowField).forEach(f => {
        defaultToggles[f.key] = report.manual_overrides?.cashFlowFieldToggles?.[f.key] ?? false;
      });
      setCashFlowFieldToggles(defaultToggles);
      // Initialize depreciation master toggle (default: include in cash flow analysis)
      setIncludeDepreciationInCashFlow(report.manual_overrides?.includeDepreciationInCashFlow ?? true);
      
      // Initialize depreciation schedule builder from existing data
      const existingSchedule = report.manual_overrides?.depreciationSchedule || {};
      setDepreciationSchedule(existingSchedule);
      setYear1Depreciation(existingSchedule[1] || report.manual_overrides?.depreciation || 0);
      setDepreciationMethod(report.manual_overrides?.depreciationMethod || 'prime_cost');
      
      setHasChanges(false);
    }
  }, [report, isOpen]);

  // Calculate Prime Cost depreciation schedule (constant annual depreciation)
  const calculatePrimeCostSchedule = (year1Value: number) => {
    const schedule: Record<number, number> = {};
    for (let year = 1; year <= 10; year++) {
      schedule[year] = year1Value; // Prime Cost = same value each year
    }
    return schedule;
  };

  // Calculate Diminishing Value depreciation schedule (declining balance)
  const calculateDiminishingValueSchedule = (year1Value: number) => {
    const schedule: Record<number, number> = {};
    let currentValue = year1Value;
    const declineRate = 0.85; // 15% decline each year typical for diminishing value
    for (let year = 1; year <= 10; year++) {
      schedule[year] = Math.round(currentValue);
      currentValue = currentValue * declineRate;
    }
    return schedule;
  };

  // Update schedule when year 1 value or method changes
  const handleYear1DepreciationChange = (value: number) => {
    setYear1Depreciation(value);
    if (depreciationMethod === 'prime_cost') {
      setDepreciationSchedule(calculatePrimeCostSchedule(value));
    } else {
      setDepreciationSchedule(calculateDiminishingValueSchedule(value));
    }
    setHasChanges(true);
  };

  // Update schedule when method changes
  const handleDepreciationMethodChange = (method: 'prime_cost' | 'diminishing_value') => {
    setDepreciationMethod(method);
    if (year1Depreciation > 0) {
      if (method === 'prime_cost') {
        setDepreciationSchedule(calculatePrimeCostSchedule(year1Depreciation));
      } else {
        setDepreciationSchedule(calculateDiminishingValueSchedule(year1Depreciation));
      }
    }
    setHasChanges(true);
  };

  // Update individual year in schedule (for manual adjustments)
  const handleScheduleYearChange = (year: number, value: number) => {
    setDepreciationSchedule(prev => ({
      ...prev,
      [year]: value
    }));
    setHasChanges(true);
  };

  // Apply depreciation schedule to cash flow yearly overrides
  const applyDepreciationToCashFlow = () => {
    // Get existing cash flow yearly overrides or create new
    const existingCashFlowOverrides = overrides.cashFlowYearlyOverrides as Record<string, Record<string, number>> || {};
    
    // Create new overrides with depreciation values for years 2-10
    const updatedCashFlowOverrides = { ...existingCashFlowOverrides };
    
    for (let year = 2; year <= 10; year++) {
      const depValue = depreciationSchedule[year] || 0;
      if (!updatedCashFlowOverrides[year]) {
        updatedCashFlowOverrides[year] = {};
      }
      updatedCashFlowOverrides[year] = {
        ...updatedCashFlowOverrides[year],
        depreciation: depValue
      };
    }

    // Also set Year 1 depreciation in main overrides
    setOverrides(prev => ({
      ...prev,
      depreciation: depreciationSchedule[1] || year1Depreciation,
      cashFlowYearlyOverrides: updatedCashFlowOverrides,
      depreciationSchedule,
      depreciationMethod
    }));

    setHasChanges(true);

    toast({
      title: "Depreciation Applied",
      description: "10-year depreciation schedule has been applied to cash flow analysis.",
    });
  };

  const handleOverrideChange = (key: string, value: string) => {
    const field = fields.find(f => f.key === key);
    
    // Clear any existing validation error for this field
    setValidationErrors(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
    
    if (field?.type === 'select') {
      setOverrides(prev => ({
        ...prev,
        [key]: value || null
      }));
    } else {
      const numValue = value === '' ? null : parseFloat(value);
      
      // Validate construction duration months (1-18)
      if (key === 'constructionDurationMonths' && numValue !== null) {
        if (numValue < 1 || numValue > 18) {
          setValidationErrors(prev => ({
            ...prev,
            [key]: 'Construction duration must be between 1 and 18 months'
          }));
        }
      }
      
      setOverrides(prev => ({
        ...prev,
        [key]: numValue
      }));
    }
    setHasChanges(true);
  };

  const handleToggleChange = (key: string, enabled: boolean) => {
    setCashFlowFieldToggles(prev => ({
      ...prev,
      [key]: enabled
    }));
    setHasChanges(true);
  };

  const handleReset = (key: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[key];
    setOverrides(newOverrides);
    // Clear validation error for this field
    setValidationErrors(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
    setHasChanges(true);
  };

  const handleResetAll = () => {
    setOverrides({});
    const defaultToggles: Record<string, boolean> = {};
    fields.filter(f => f.isCashFlowField).forEach(f => {
      defaultToggles[f.key] = false;
    });
    setCashFlowFieldToggles(defaultToggles);
    setIncludeDepreciationInCashFlow(true);
    setValidationErrors({});
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!report) return;
    
    // Check for validation errors before saving
    if (Object.keys(validationErrors).length > 0) {
      toast({
        title: "Validation Error",
        description: "Please fix validation errors before saving.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      console.log('💾 Saving manual overrides (data-only update, no AI regeneration)');
      
      // Merge overrides with existing financial_calculations
      const mergedFinancialData = { ...report.financial_calculations };
      
      // Apply override mapping to nested structure
      const overrideMapping: Record<string, string> = {
        'purchasePrice': 'initialCosts.propertyValue',
        'stampDuty': 'initialCosts.stampDuty',
        'depositValue': 'initialCosts.deposit',
        'loanToValueRatio': 'keyMetrics.lvr',
        'interestRate': 'loanDetails.interestRate',
        'weeklyRent': 'income.weeklyRent',
        'councilRates': 'annualCosts.councilRates',
        'waterRates': 'annualCosts.waterRates',
        'bodyCorporateFees': 'annualCosts.strataFees',
        'landTax': 'annualCosts.landTax',
        'buildingLandlordInsurance': 'annualCosts.landlordInsurance',
        'propertyManagementFees': 'annualCosts.propertyManagementPercent',
        'solicitorFees': 'initialCosts.legalFees',
        'repairsMaintenance': 'annualCosts.maintenance',
        'lettingFees': 'annualCosts.lettingFees',
        'capitalGrowth': 'assumptions.capitalGrowth',
        'buildPrice': 'initialCosts.buildPrice',
        'landPrice': 'initialCosts.landPrice',
        'landSizeSqm': 'propertySpecs.landSizeSqm',
        'buildSizeSqm': 'propertySpecs.buildSizeSqm',
        // New cash flow fields
        'marketValueNow': 'cashFlow.marketValueNow',
        'loanAmount': 'cashFlow.loanAmount',
        'loanType': 'cashFlow.loanType',
        'loanTermYears': 'cashFlow.loanTermYears',
        'occupancyRate': 'cashFlow.occupancyRate',
        'cpiGrowthRate': 'cashFlow.cpiGrowthRate',
        'depreciation': 'cashFlow.depreciation',
        'taxRate': 'cashFlow.taxRate',
        'constructionYear': 'cashFlow.constructionYear'
      };
      
      // Apply overrides to nested structure
      for (const [flatKey, overrideValue] of Object.entries(overrides)) {
        const nestedPath = overrideMapping[flatKey];
        if (nestedPath) {
          const keys = nestedPath.split('.');
          let current = mergedFinancialData;
          
          for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
              current[keys[i]] = {};
            }
            current = current[keys[i]];
          }
          
          current[keys[keys.length - 1]] = overrideValue;
        }
      }
      
      // Recalculate dependent values after applying overrides
      if (!mergedFinancialData.annualCosts) {
        mergedFinancialData.annualCosts = {};
      }
      if (!mergedFinancialData.income) {
        mergedFinancialData.income = {};
      }
      
      // Recalculate property management dollar amount from weekly rent and percentage
      const weeklyRent = mergedFinancialData.income.weeklyRent || 0;
      const annualRent = weeklyRent * 52;
      const propertyManagementPercent = mergedFinancialData.annualCosts.propertyManagementPercent || 7;
      const propertyManagement = Math.floor(annualRent * (propertyManagementPercent / 100));
      
      // Update the calculated property management dollar amount
      mergedFinancialData.annualCosts.propertyManagement = propertyManagement;
      
      console.log('📊 Recalculated property management:', {
        weeklyRent,
        annualRent,
        propertyManagementPercent,
        propertyManagement
      });
      
      // Recalculate totalAnnual after applying overrides (excluding letting fees)
      const councilRates = mergedFinancialData.annualCosts.councilRates || 0;
      const waterRates = mergedFinancialData.annualCosts.waterRates || 0;
      const strataFees = mergedFinancialData.annualCosts.strataFees || 0;
      const landlordInsurance = mergedFinancialData.annualCosts.landlordInsurance || 0;
      const maintenance = mergedFinancialData.annualCosts.maintenance || 1500;
      
      mergedFinancialData.annualCosts.totalAnnual = councilRates + waterRates + strataFees + landlordInsurance + propertyManagement + maintenance;
      
      console.log('📊 Recalculated totalAnnual:', mergedFinancialData.annualCosts.totalAnnual);
      
      // Save overrides with cash flow field toggles and depreciation master toggle
      const overridesWithToggles = {
        ...overrides,
        cashFlowFieldToggles,
        includeDepreciationInCashFlow
      };
      
      // Update database with merged data (NO Perplexity call)
      const { error: updateError } = await supabase
        .from('investment_reports')
        .update({ 
          manual_overrides: overridesWithToggles,
          financial_calculations: mergedFinancialData,
          updated_at: new Date().toISOString()
        })
        .eq('id', report.id);

      if (updateError) throw updateError;

      console.log('✓ Manual overrides saved (data-only, no AI regeneration)');

      toast({
        title: "Overrides applied",
        description: "Manual data overrides have been saved. The updated values are now reflected in the report.",
      });

      setHasChanges(false);
      
      // Call onSave callback and wait for it to complete (refetches data)
      await onSave?.();
      
      onClose();
    } catch (error: any) {
      console.error('❌ Error applying overrides:', error);
      toast({
        title: "Failed to apply overrides",
        description: error.message || "Failed to save manual data overrides",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const formatValue = (value: number | string | null, prefix?: string, suffix?: string) => {
    if (value === null || value === undefined) return 'Not available';
    if (typeof value === 'string') {
      // For select fields, display the label
      if (value === 'interest_only') return 'Interest Only';
      if (value === 'principal_interest') return 'Principal & Interest';
      return value;
    }
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return `${prefix || ''}${numValue.toLocaleString()}${suffix || ''}`;
  };

  const getFieldValue = (field: OverrideField) => {
    const overrideValue = overrides[field.key];
    if (overrideValue !== undefined && overrideValue !== null) {
      return overrideValue;
    }
    return '';
  };

  const hasOverride = (key: string) => {
    return overrides[key] !== undefined && overrides[key] !== null;
  };

  const renderField = (field: OverrideField, showSeparator: boolean = true) => (
    <div key={field.key} className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-base font-semibold">{field.label}</Label>
          {hasOverride(field.key) && (
            <Badge variant="secondary" className="text-xs">
              Overridden
            </Badge>
          )}
          {field.isCashFlowField && (
            <Badge variant="outline" className="text-xs bg-primary/10">
              <Calculator className="h-3 w-3 mr-1" />
              Cash Flow
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {field.isCashFlowField && (
            <div className="flex items-center gap-2 mr-2">
              <Label className="text-xs text-muted-foreground">Include in Report</Label>
              <Switch
                checked={cashFlowFieldToggles[field.key] || false}
                onCheckedChange={(checked) => handleToggleChange(field.key, checked)}
              />
            </div>
          )}
          {hasOverride(field.key) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleReset(field.key)}
              className="h-8 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Original Value */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Original Value (API)</Label>
          <div className="flex items-center h-10 px-3 py-2 rounded-md border bg-muted/50 text-muted-foreground">
            {formatValue(field.originalValue, field.prefix, field.suffix)}
          </div>
        </div>

        {/* Override Value */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Manual Override</Label>
          <div className="flex items-center gap-2">
            {field.type === 'select' ? (
              <Select
                value={getFieldValue(field) as string || ''}
                onValueChange={(value) => handleOverrideChange(field.key, value)}
              >
                <SelectTrigger className={hasOverride(field.key) ? 'border-primary' : ''}>
                  <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                {field.prefix && (
                  <span className="text-muted-foreground">{field.prefix}</span>
                )}
                <Input
                  type="number"
                  step="0.01"
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  value={getFieldValue(field)}
                  onChange={(e) => handleOverrideChange(field.key, e.target.value)}
                  className={`${hasOverride(field.key) ? 'border-primary' : ''} ${validationErrors[field.key] ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                {field.suffix && (
                  <span className="text-muted-foreground text-sm whitespace-nowrap">{field.suffix}</span>
                )}
              </>
            )}
          </div>
          {validationErrors[field.key] && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {validationErrors[field.key]}
            </p>
          )}
        </div>
      </div>

      {showSeparator && <Separator className="mt-4" />}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col gap-0 p-0">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Manual Data Override
            </DialogTitle>
            <DialogDescription>
              Override inaccurate data from external sources. Fields marked with <Calculator className="h-3 w-3 inline mx-1" /> are for 10-year cash flow analysis - toggle "Include in Report" to show them in the investment report PDF.
            </DialogDescription>
          </DialogHeader>
        </div>

        <Separator />

        <ScrollArea className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 py-4">
            {/* Purchase & Loan Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full"></span>
                Purchase & Loan Details
              </h3>
              {purchaseLoanFields.map((field, index) => 
                renderField(field, index < purchaseLoanFields.length - 1)
              )}
            </div>

            <Separator className="my-6" />

            {/* Rental Income Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full"></span>
                Rental Income
              </h3>
              {rentalIncomeFields.map((field, index) => 
                renderField(field, index < rentalIncomeFields.length - 1)
              )}
            </div>

            <Separator className="my-6" />

            {/* Annual Operating Expenses Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full"></span>
                Annual Operating Expenses
              </h3>
              
              {/* Stamp Duty Calculator */}
              <Collapsible 
                open={showStampDutyCalculator} 
                onOpenChange={setShowStampDutyCalculator}
                className="rounded-lg border bg-gradient-to-br from-card to-muted/20"
              >
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full flex items-center justify-between p-4 h-auto hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/10">
                        <Calculator className="h-5 w-5 text-orange-600" />
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground">Stamp Duty Calculator</p>
                          {detectedState !== 'All' && (
                            <Badge variant="secondary" className="text-xs">
                              {detectedState} detected
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Calculate stamp duty for all Australian states and territories
                        </p>
                      </div>
                    </div>
                    {showStampDutyCalculator ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-4">
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ExternalLink className="h-4 w-4" />
                        <span>Powered by calculatorsonline.com.au</span>
                      </div>
                      {detectedState !== 'All' && (
                        <Badge variant="outline" className="text-xs">
                          Pre-selected: {STATE_MAPPING[detectedState] || detectedState}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Stamp Duty Calculator Container */}
                    <div className="relative rounded-lg overflow-hidden border bg-white shadow-inner p-4">
                      <div id="stamp-duty-calculator" className="orange-theme">
                        <div id="stamp-duty-anchors">
                          <p className="text-sm text-muted-foreground">
                            Stamp Duty Calculator from{' '}
                            <a 
                              href="https://calculatorsonline.com.au" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              calculatorsonline.com.au
                            </a>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Auto-populate Button */}
                    <Button 
                      onClick={captureStampDutyFromCalculator}
                      className="w-full gap-2"
                      variant="default"
                    >
                      <Copy className="h-4 w-4" />
                      Use Calculated Stamp Duty Value
                    </Button>

                    {/* Instructions */}
                    <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                      <p className="text-sm font-medium text-foreground">How to use:</p>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>State is auto-detected from property address{detectedState !== 'All' && ` (${detectedState})`}</li>
                        <li>Enter the property purchase price</li>
                        <li>Select buyer type (first home buyer, investor, etc.)</li>
                        <li>Click "Use Calculated Stamp Duty Value" to auto-populate</li>
                      </ol>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {annualExpenseFields.map((field, index) => 
                renderField(field, index < annualExpenseFields.length - 1)
              )}
            </div>

            <Separator className="my-6" />

            {/* Tax & Growth Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                  <span className="w-2 h-2 bg-primary rounded-full"></span>
                  Tax & Growth Settings
                </h3>
              </div>
              
              {/* Master Depreciation Toggle for Cash Flow Analysis */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="space-y-1">
                  <Label className="text-base font-semibold">Include Depreciation in Cash Flow Analysis</Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, depreciation values will be factored into the 10-year cash flow projections
                  </p>
                </div>
                <Switch
                  checked={includeDepreciationInCashFlow}
                  onCheckedChange={(checked) => {
                    setIncludeDepreciationInCashFlow(checked);
                    setHasChanges(true);
                  }}
                />
              </div>

              {/* Washington Brown Depreciation Calculator */}
              <Collapsible 
                open={showDepreciationCalculator} 
                onOpenChange={setShowDepreciationCalculator}
                className="rounded-lg border bg-gradient-to-br from-card to-muted/20"
              >
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full flex items-center justify-between p-4 h-auto hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Calculator className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-foreground">Washington Brown Depreciation Calculator</p>
                        <p className="text-sm text-muted-foreground">
                          Calculate accurate tax depreciation estimates for this property
                        </p>
                      </div>
                    </div>
                    {showDepreciationCalculator ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-4">
                    <Separator />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ExternalLink className="h-4 w-4" />
                      <span>Powered by Washington Brown - Australia's leading quantity surveyors</span>
                    </div>
                    
                    {/* Iframe Container */}
                    <div className="relative rounded-lg overflow-hidden border bg-white shadow-inner">
                      <iframe 
                        src="https://www.washingtonbrown.com.au/public/static/external/"
                        className="w-full border-0"
                        style={{ 
                          height: '680px',
                          minHeight: '680px'
                        }}
                        title="Washington Brown Depreciation Calculator"
                        loading="lazy"
                      />
                    </div>

                    {/* Instructions */}
                    <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                      <p className="text-sm font-medium text-foreground">How to use:</p>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Enter the property details in the calculator above</li>
                        <li>Click "Calculate" to get the depreciation estimate</li>
                        <li>Copy the <strong>Year 1</strong> depreciation value (either Diminishing Value or Prime Cost)</li>
                        <li>Enter that value in the "Annual Depreciation" field below</li>
                      </ol>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Depreciation Schedule Builder */}
              <Collapsible 
                open={showDepreciationSchedule} 
                onOpenChange={setShowDepreciationSchedule}
                className="rounded-lg border bg-gradient-to-br from-card to-muted/20"
              >
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full flex items-center justify-between p-4 h-auto hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <Table className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-foreground">Depreciation Schedule Builder</p>
                        <p className="text-sm text-muted-foreground">
                          Create 10-year depreciation schedule and apply to cash flow analysis
                        </p>
                      </div>
                    </div>
                    {showDepreciationSchedule ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-4">
                    <Separator />
                    
                    {/* Method Selection */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Depreciation Method</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleDepreciationMethodChange('prime_cost')}
                          className={`p-4 rounded-lg border-2 text-left transition-all ${
                            depreciationMethod === 'prime_cost'
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {depreciationMethod === 'prime_cost' && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                            <span className="font-semibold">Prime Cost</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Same depreciation amount each year (straight-line)
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDepreciationMethodChange('diminishing_value')}
                          className={`p-4 rounded-lg border-2 text-left transition-all ${
                            depreciationMethod === 'diminishing_value'
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {depreciationMethod === 'diminishing_value' && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                            <span className="font-semibold">Diminishing Value</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Higher depreciation early, decreasing over time
                          </p>
                        </button>
                      </div>
                    </div>

                    {/* Year 1 Input */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Year 1 Depreciation (from Washington Brown)</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">$</span>
                        <Input
                          type="number"
                          placeholder="Enter Year 1 depreciation value"
                          value={year1Depreciation || ''}
                          onChange={(e) => handleYear1DepreciationChange(parseFloat(e.target.value) || 0)}
                          className="max-w-[200px]"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Copy the Year 1 value from Washington Brown calculator above
                      </p>
                    </div>

                    {/* 10-Year Schedule Table */}
                    {year1Depreciation > 0 && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">10-Year Depreciation Schedule</Label>
                        <div className="rounded-lg border overflow-hidden">
                          <UITable>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="w-[100px] font-semibold">Year</TableHead>
                                <TableHead className="font-semibold">Depreciation Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Array.from({ length: 10 }, (_, i) => i + 1).map((year) => (
                                <TableRow key={year} className={year === 1 ? 'bg-primary/5' : ''}>
                                  <TableCell className="font-medium">
                                    Year {year}
                                    {year === 1 && (
                                      <Badge variant="outline" className="ml-2 text-xs">Base</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <span className="text-muted-foreground">$</span>
                                      <Input
                                        type="number"
                                        value={depreciationSchedule[year] || ''}
                                        onChange={(e) => handleScheduleYearChange(year, parseFloat(e.target.value) || 0)}
                                        className="max-w-[150px] h-8"
                                      />
                                      {depreciationMethod === 'diminishing_value' && year > 1 && (
                                        <span className="text-xs text-muted-foreground">
                                          ({((depreciationSchedule[year] / depreciationSchedule[1]) * 100).toFixed(0)}% of Y1)
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </UITable>
                        </div>

                        {/* Total Depreciation Summary */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                          <span className="text-sm font-medium">Total 10-Year Depreciation</span>
                          <span className="text-lg font-bold text-primary">
                            ${Object.values(depreciationSchedule).reduce((sum, val) => sum + (val || 0), 0).toLocaleString()}
                          </span>
                        </div>

                        {/* Apply to Cash Flow Button */}
                        <Button
                          onClick={applyDepreciationToCashFlow}
                          className="w-full"
                          size="lg"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Apply to Cash Flow Analysis
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          This will inject the depreciation values into your 10-year cash flow projections
                        </p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
              
              {taxGrowthFields.map((field, index) => 
                renderField(field, index < taxGrowthFields.length - 1)
              )}
            </div>

            <Separator className="my-6" />

            {/* Property Specifications Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full"></span>
                Property Specifications
              </h3>
              {propertySpecFields.map((field, index) => 
                renderField(field, index < propertySpecFields.length - 1)
              )}
            </div>
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex items-center justify-between px-6 py-4">
          <Button
            variant="outline"
            onClick={handleResetAll}
            disabled={Object.keys(overrides).length === 0}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset All
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || saving || Object.keys(validationErrors).length > 0}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Overrides'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
