import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, RotateCcw, Save } from 'lucide-react';

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
}

export function ManualDataOverrideModal({ report, isOpen, onClose, onSave }: ManualDataOverrideModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number | string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Define the confirmed input fields for manual overrides
  const fields: OverrideField[] = [
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
      key: 'depositValue',
      label: 'Deposit Value',
      originalValue: report?.financial_calculations?.depositValue || null,
      overrideValue: report?.manual_overrides?.depositValue || null,
      prefix: '$'
    },
    {
      key: 'loanToValueRatio',
      label: 'Loan to Value Ratio',
      originalValue: report?.financial_calculations?.loanToValueRatio || null,
      overrideValue: report?.manual_overrides?.loanToValueRatio || null,
      suffix: '%'
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
      key: 'weeklyRent',
      label: 'Weekly Rent',
      originalValue: report?.financial_calculations?.weeklyRent || null,
      overrideValue: report?.manual_overrides?.weeklyRent || null,
      prefix: '$'
    },
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

  useEffect(() => {
    if (report && isOpen) {
      // Initialize overrides from existing manual_overrides
      setOverrides(report.manual_overrides || {});
      setHasChanges(false);
    }
  }, [report, isOpen]);

  const handleOverrideChange = (key: string, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    setOverrides(prev => ({
      ...prev,
      [key]: numValue
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
        'buildingLandlordInsurance': 'annualCosts.landlordInsurance',
        'propertyManagementFees': 'annualCosts.propertyManagementPercent',
        'solicitorFees': 'initialCosts.legalFees',
        'repairsMaintenance': 'annualCosts.maintenance',
        'lettingFees': 'annualCosts.lettingFees',
        'capitalGrowth': 'assumptions.capitalGrowth',
        'buildPrice': 'initialCosts.buildPrice',
        'landPrice': 'initialCosts.landPrice',
        'landSizeSqm': 'propertySpecs.landSizeSqm',
        'buildSizeSqm': 'propertySpecs.buildSizeSqm'
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
      
      // Update database with merged data (NO Perplexity call)
      const { error: updateError } = await supabase
        .from('investment_reports')
        .update({ 
          manual_overrides: overrides,
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
              Override inaccurate data from external sources. Original values are preserved for reference.
            </DialogDescription>
          </DialogHeader>
        </div>

        <Separator />

        <ScrollArea className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 py-4">
            {fields.map((field, index) => (
              <div key={field.key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold">{field.label}</Label>
                    {hasOverride(field.key) && (
                      <Badge variant="secondary" className="text-xs">
                        Overridden
                      </Badge>
                    )}
                  </div>
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
                    </div>
                  </div>
                </div>

                {index < fields.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
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