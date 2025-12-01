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
  onSave?: () => void;
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

  // Define the 9 critical financial data fields
  const fields: OverrideField[] = [
    {
      key: 'propertyValue',
      label: 'Property Value / Purchase Price',
      originalValue: report?.financial_calculations?.propertyValue || null,
      overrideValue: report?.manual_overrides?.propertyValue || null,
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
      key: 'legalFees',
      label: 'Legal Fees',
      originalValue: report?.financial_calculations?.legalFees || null,
      overrideValue: report?.manual_overrides?.legalFees || null,
      prefix: '$'
    },
    {
      key: 'buildingInspection',
      label: 'Building & Pest Inspection',
      originalValue: report?.financial_calculations?.buildingInspection || null,
      overrideValue: report?.manual_overrides?.buildingInspection || null,
      prefix: '$'
    },
    {
      key: 'loanSetupCosts',
      label: 'Loan Setup Costs',
      originalValue: report?.financial_calculations?.loanSetupCosts || null,
      overrideValue: report?.manual_overrides?.loanSetupCosts || null,
      prefix: '$'
    },
    {
      key: 'weeklyRent',
      label: 'Weekly Rent',
      originalValue: report?.financial_calculations?.weeklyRent || null,
      overrideValue: report?.manual_overrides?.weeklyRent || null,
      prefix: '$',
      suffix: '/week'
    },
    {
      key: 'councilRates',
      label: 'Council Rates',
      originalValue: report?.financial_calculations?.councilRates || null,
      overrideValue: report?.manual_overrides?.councilRates || null,
      prefix: '$',
      suffix: '/year'
    },
    {
      key: 'waterRates',
      label: 'Water Rates',
      originalValue: report?.financial_calculations?.waterRates || null,
      overrideValue: report?.manual_overrides?.waterRates || null,
      prefix: '$',
      suffix: '/year'
    },
    {
      key: 'strataFees',
      label: 'Strata/Body Corporate Fees',
      originalValue: report?.financial_calculations?.strataFees || null,
      overrideValue: report?.manual_overrides?.strataFees || null,
      prefix: '$',
      suffix: '/quarter'
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
      // Update the report with manual overrides
      const { error } = await supabase
        .from('investment_reports')
        .update({ 
          manual_overrides: overrides,
          updated_at: new Date().toISOString()
        })
        .eq('id', report.id);

      if (error) throw error;

      toast({
        title: "Overrides saved",
        description: "Manual data overrides have been saved successfully. Report will regenerate automatically.",
      });

      setHasChanges(false);
      onSave?.();
      onClose();
    } catch (error: any) {
      console.error('Error saving overrides:', error);
      toast({
        title: "Save failed",
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
              {saving ? 'Saving...' : 'Save & Regenerate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}