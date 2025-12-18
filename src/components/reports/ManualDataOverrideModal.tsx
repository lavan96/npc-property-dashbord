import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, RotateCcw, Save, Calculator } from 'lucide-react';

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
  const [overrides, setOverrides] = useState<Record<string, number | string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [cashFlowFieldToggles, setCashFlowFieldToggles] = useState<Record<string, boolean>>({});
  const [includeDepreciationInCashFlow, setIncludeDepreciationInCashFlow] = useState(true);

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
      setHasChanges(false);
    }
  }, [report, isOpen]);

  const handleOverrideChange = (key: string, value: string) => {
    const field = fields.find(f => f.key === key);
    if (field?.type === 'select') {
      setOverrides(prev => ({
        ...prev,
        [key]: value || null
      }));
    } else {
      const numValue = value === '' ? null : parseFloat(value);
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
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!report) return;

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
                  className={hasOverride(field.key) ? 'border-primary' : ''}
                />
                {field.suffix && (
                  <span className="text-muted-foreground text-sm whitespace-nowrap">{field.suffix}</span>
                )}
              </>
            )}
          </div>
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
            <Button onClick={handleSave} disabled={!hasChanges || saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Overrides'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
