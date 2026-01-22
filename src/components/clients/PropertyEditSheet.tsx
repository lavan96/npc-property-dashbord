import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Loader2, DollarSign, Percent, Home, Calculator, Info, Landmark, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationsContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PropertyData {
  id: string;
  client_id: string;
  property_type: string;
  address: string;
  value: number | null;
  loan_remaining: number | null;
  interest_rate: number | null;
  ownership_percentage: number | null;
  monthly_interest_repayment: number | null;
  monthly_body_corporate: number | null;
  monthly_council_rates: number | null;
  monthly_water_rates: number | null;
  monthly_repairs_maintenance: number | null;
  monthly_property_management: number | null;
  monthly_landlord_insurance: number | null;
  monthly_building_insurance: number | null;
  monthly_rental_income: number | null;
  weekly_rental_income: number | null;
  total_monthly_expenditure: number | null;
  net_monthly_cashflow: number | null;
  smsf_fund_name: string | null;
  smsf_trustee_name: string | null;
  smsf_trustee_type: string | null;
  smsf_abn: string | null;
  smsf_compliance_status: string | null;
  smsf_auditor_name: string | null;
}

interface PropertyEditSheetProps {
  property: PropertyData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

type FrequencyType = 'monthly' | 'quarterly' | 'annually' | 'weekly';

interface ExpenseField {
  value: number;
  frequency: FrequencyType;
  monthlyValue: number;
}

interface PropertyFormData {
  property_type: 'owner_occupied' | 'investment' | 'smsf';
  address: string;
  value: number;
  loan_remaining: number;
  interest_rate: number;
  ownership_percentage: number;
  monthly_interest_repayment: number;
  autoCalculateInterest: boolean;
  body_corporate: ExpenseField;
  council_rates: ExpenseField;
  water_rates: ExpenseField;
  repairs_maintenance: ExpenseField;
  property_management: ExpenseField;
  landlord_insurance: ExpenseField;
  building_insurance: ExpenseField;
  rental_income: ExpenseField;
  smsf_fund_name: string;
  smsf_trustee_name: string;
  smsf_trustee_type: 'individual' | 'corporate';
  smsf_abn: string;
  smsf_compliance_status: 'compliant' | 'non_compliant' | 'pending_audit';
  smsf_auditor_name: string;
}

const convertToMonthly = (value: number, frequency: FrequencyType): number => {
  switch (frequency) {
    case 'weekly':
      return value * 4.33;
    case 'quarterly':
      return value / 3;
    case 'annually':
      return value / 12;
    case 'monthly':
    default:
      return value;
  }
};

const createExpenseField = (monthlyValue: number = 0): ExpenseField => ({
  value: monthlyValue,
  frequency: 'monthly',
  monthlyValue: monthlyValue,
});

export function PropertyEditSheet({ property, open, onOpenChange, onComplete }: PropertyEditSheetProps) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  
  const [formData, setFormData] = useState<PropertyFormData>({
    property_type: 'investment',
    address: '',
    value: 0,
    loan_remaining: 0,
    interest_rate: 5.90,
    ownership_percentage: 100,
    monthly_interest_repayment: 0,
    autoCalculateInterest: false,
    body_corporate: createExpenseField(),
    council_rates: createExpenseField(),
    water_rates: createExpenseField(),
    repairs_maintenance: createExpenseField(),
    property_management: createExpenseField(),
    landlord_insurance: createExpenseField(),
    building_insurance: createExpenseField(),
    rental_income: createExpenseField(),
    smsf_fund_name: '',
    smsf_trustee_name: '',
    smsf_trustee_type: 'individual',
    smsf_abn: '',
    smsf_compliance_status: 'compliant',
    smsf_auditor_name: '',
  });

  // Populate form with existing property data when sheet opens
  useEffect(() => {
    if (open && property) {
      setFormData({
        property_type: (property.property_type as 'owner_occupied' | 'investment' | 'smsf') || 'investment',
        address: property.address || '',
        value: Number(property.value) || 0,
        loan_remaining: Number(property.loan_remaining) || 0,
        interest_rate: Number(property.interest_rate) || 5.90,
        ownership_percentage: Number(property.ownership_percentage) || 100,
        monthly_interest_repayment: Number(property.monthly_interest_repayment) || 0,
        autoCalculateInterest: false,
        body_corporate: createExpenseField(Number(property.monthly_body_corporate) || 0),
        council_rates: createExpenseField(Number(property.monthly_council_rates) || 0),
        water_rates: createExpenseField(Number(property.monthly_water_rates) || 0),
        repairs_maintenance: createExpenseField(Number(property.monthly_repairs_maintenance) || 0),
        property_management: createExpenseField(Number(property.monthly_property_management) || 0),
        landlord_insurance: createExpenseField(Number(property.monthly_landlord_insurance) || 0),
        building_insurance: createExpenseField(Number(property.monthly_building_insurance) || 0),
        rental_income: createExpenseField(Number(property.monthly_rental_income) || 0),
        smsf_fund_name: property.smsf_fund_name || '',
        smsf_trustee_name: property.smsf_trustee_name || '',
        smsf_trustee_type: (property.smsf_trustee_type as 'individual' | 'corporate') || 'individual',
        smsf_abn: property.smsf_abn || '',
        smsf_compliance_status: (property.smsf_compliance_status as 'compliant' | 'non_compliant' | 'pending_audit') || 'compliant',
        smsf_auditor_name: property.smsf_auditor_name || '',
      });
    }
  }, [open, property]);

  // Auto-calculate monthly interest repayment when loan or rate changes
  useEffect(() => {
    if (formData.autoCalculateInterest && formData.loan_remaining > 0 && formData.interest_rate > 0) {
      const annualInterest = formData.loan_remaining * (formData.interest_rate / 100);
      const monthlyInterest = annualInterest / 12;
      setFormData(prev => ({ ...prev, monthly_interest_repayment: Math.round(monthlyInterest * 100) / 100 }));
    }
  }, [formData.loan_remaining, formData.interest_rate, formData.autoCalculateInterest]);

  const updateField = <K extends keyof PropertyFormData>(field: K, value: PropertyFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateNumberField = (field: keyof PropertyFormData, value: string) => {
    const numValue = parseFloat(value) || 0;
    updateField(field, numValue as any);
  };

  const updateExpenseField = (
    field: keyof Pick<PropertyFormData, 'body_corporate' | 'council_rates' | 'water_rates' | 'repairs_maintenance' | 'property_management' | 'landlord_insurance' | 'building_insurance' | 'rental_income'>,
    key: 'value' | 'frequency',
    newValue: number | FrequencyType
  ) => {
    setFormData(prev => {
      const expense = prev[field];
      const updatedExpense = { ...expense };
      
      if (key === 'value') {
        updatedExpense.value = newValue as number;
        updatedExpense.monthlyValue = convertToMonthly(newValue as number, expense.frequency);
      } else {
        updatedExpense.frequency = newValue as FrequencyType;
        updatedExpense.monthlyValue = convertToMonthly(expense.value, newValue as FrequencyType);
      }
      
      return { ...prev, [field]: updatedExpense };
    });
  };

  // Calculate total monthly expenditure
  const totalMonthlyExpenditure = 
    formData.monthly_interest_repayment +
    formData.body_corporate.monthlyValue +
    formData.council_rates.monthlyValue +
    formData.water_rates.monthlyValue +
    formData.repairs_maintenance.monthlyValue +
    formData.property_management.monthlyValue +
    formData.landlord_insurance.monthlyValue +
    formData.building_insurance.monthlyValue;

  // Calculate net monthly cashflow
  const monthlyRentalIncome = formData.rental_income.monthlyValue;
  const netMonthlyCashflow = monthlyRentalIncome - totalMonthlyExpenditure;

  const updatePropertyMutation = useMutation({
    mutationFn: async () => {
      const updateData = {
        property_type: formData.property_type,
        address: formData.address,
        value: formData.value,
        loan_remaining: formData.loan_remaining,
        interest_rate: formData.interest_rate,
        ownership_percentage: formData.ownership_percentage,
        monthly_interest_repayment: formData.monthly_interest_repayment,
        monthly_body_corporate: formData.body_corporate.monthlyValue,
        monthly_council_rates: formData.council_rates.monthlyValue,
        monthly_water_rates: formData.water_rates.monthlyValue,
        monthly_repairs_maintenance: formData.repairs_maintenance.monthlyValue,
        monthly_property_management: formData.property_management.monthlyValue,
        monthly_landlord_insurance: formData.landlord_insurance.monthlyValue,
        monthly_building_insurance: formData.building_insurance.monthlyValue,
        monthly_rental_income: monthlyRentalIncome,
        weekly_rental_income: formData.rental_income.frequency === 'weekly' ? formData.rental_income.value : monthlyRentalIncome / 4.33,
        total_monthly_expenditure: totalMonthlyExpenditure,
        net_monthly_cashflow: netMonthlyCashflow,
        smsf_fund_name: formData.property_type === 'smsf' ? formData.smsf_fund_name : null,
        smsf_trustee_name: formData.property_type === 'smsf' ? formData.smsf_trustee_name : null,
        smsf_trustee_type: formData.property_type === 'smsf' ? formData.smsf_trustee_type : null,
        smsf_abn: formData.property_type === 'smsf' ? formData.smsf_abn : null,
        smsf_compliance_status: formData.property_type === 'smsf' ? formData.smsf_compliance_status : null,
        smsf_auditor_name: formData.property_type === 'smsf' ? formData.smsf_auditor_name : null,
      };

      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'update',
        table: 'client_properties',
        clientId: property.client_id,
        recordId: property.id,
        data: updateData,
      });
      
      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Failed to update property');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-properties', property.client_id] });
      queryClient.invalidateQueries({ queryKey: ['secure-client-data', property.client_id] });
      toast.success('Property updated successfully');
      
      addNotification({
        type: 'portfolio_updated',
        title: 'Property Updated',
        message: `Property at ${formData.address} has been updated`,
        entityId: property.client_id
      });
      
      onOpenChange(false);
      onComplete();
    },
    onError: (error: any) => {
      toast.error('Failed to update property: ' + error.message);
    },
  });

  const deletePropertyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'client_properties',
        clientId: property.client_id,
        recordId: property.id,
      });
      
      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Failed to delete property');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-properties', property.client_id] });
      queryClient.invalidateQueries({ queryKey: ['secure-client-data', property.client_id] });
      toast.success('Property deleted successfully');
      
      addNotification({
        type: 'portfolio_updated',
        title: 'Property Deleted',
        message: `Property at ${property.address} has been removed`,
        entityId: property.client_id
      });
      
      onOpenChange(false);
      onComplete();
    },
    onError: (error: any) => {
      toast.error('Failed to delete property: ' + error.message);
    },
  });

  const handleSubmit = () => {
    if (!formData.address.trim()) {
      toast.error('Please enter an address');
      return;
    }
    if (formData.property_type === 'smsf' && !formData.smsf_fund_name.trim()) {
      toast.error('Please enter the SMSF fund name');
      return;
    }
    updatePropertyMutation.mutate();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const FrequencySelect = ({ value, onChange }: { value: FrequencyType; onChange: (v: FrequencyType) => void }) => (
    <Select value={value} onValueChange={(v) => onChange(v as FrequencyType)}>
      <SelectTrigger className="w-[100px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="weekly">Weekly</SelectItem>
        <SelectItem value="monthly">Monthly</SelectItem>
        <SelectItem value="quarterly">Quarterly</SelectItem>
        <SelectItem value="annually">Annually</SelectItem>
      </SelectContent>
    </Select>
  );

  const ExpenseInput = ({
    label,
    field,
    showMonthlyEquivalent = true,
  }: {
    label: string;
    field: keyof Pick<PropertyFormData, 'body_corporate' | 'council_rates' | 'water_rates' | 'repairs_maintenance' | 'property_management' | 'landlord_insurance' | 'building_insurance' | 'rental_income'>;
    showMonthlyEquivalent?: boolean;
  }) => {
    const expense = formData[field];
    return (
      <div className="space-y-2">
        <Label className="text-xs">{label}</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <DollarSign className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="number"
              value={expense.value || ''}
              onChange={(e) => updateExpenseField(field, 'value', parseFloat(e.target.value) || 0)}
              className="pl-7 h-9 text-sm"
              placeholder="0"
            />
          </div>
          <FrequencySelect 
            value={expense.frequency} 
            onChange={(v) => updateExpenseField(field, 'frequency', v)} 
          />
        </div>
        {showMonthlyEquivalent && expense.frequency !== 'monthly' && expense.value > 0 && (
          <p className="text-xs text-muted-foreground">
            = {formatCurrency(expense.monthlyValue)}/month
          </p>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Edit Property
          </SheetTitle>
          <SheetDescription>
            Update property details
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
          <div className="space-y-6 py-4">
            {/* Property Type Selection */}
            <Card className="border-primary/20">
              <CardContent className="pt-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Property Type</Label>
                    <Select
                      value={formData.property_type}
                      onValueChange={(v) => updateField('property_type', v as 'owner_occupied' | 'investment' | 'smsf')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner_occupied">
                          <div className="flex items-center gap-2">
                            <Home className="h-4 w-4" />
                            Owner Occupied
                          </div>
                        </SelectItem>
                        <SelectItem value="investment">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Investment Property
                          </div>
                        </SelectItem>
                        <SelectItem value="smsf">
                          <div className="flex items-center gap-2">
                            <Landmark className="h-4 w-4" />
                            SMSF (Self-Managed Super Fund)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Address *</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      placeholder="123 Main Street, Sydney NSW 2000"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SMSF Details - Only shown when SMSF is selected */}
            {formData.property_type === 'smsf' && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="pt-4">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-amber-600">
                      <Shield className="h-4 w-4" />
                      SMSF Details & Compliance
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Fund Name <span className="text-destructive">*</span></Label>
                        <Input
                          value={formData.smsf_fund_name}
                          onChange={(e) => updateField('smsf_fund_name', e.target.value)}
                          placeholder="Smith Family Super Fund"
                          className={!formData.smsf_fund_name.trim() ? 'border-destructive/50' : ''}
                        />
                        {!formData.smsf_fund_name.trim() && (
                          <p className="text-xs text-destructive">Required for SMSF properties</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>ABN</Label>
                        <Input
                          value={formData.smsf_abn}
                          onChange={(e) => updateField('smsf_abn', e.target.value)}
                          placeholder="12 345 678 901"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Trustee Name</Label>
                        <Input
                          value={formData.smsf_trustee_name}
                          onChange={(e) => updateField('smsf_trustee_name', e.target.value)}
                          placeholder="John Smith"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Trustee Type</Label>
                        <Select
                          value={formData.smsf_trustee_type}
                          onValueChange={(v) => updateField('smsf_trustee_type', v as 'individual' | 'corporate')}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="individual">Individual Trustee</SelectItem>
                            <SelectItem value="corporate">Corporate Trustee</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Compliance Status</Label>
                        <Select
                          value={formData.smsf_compliance_status}
                          onValueChange={(v) => updateField('smsf_compliance_status', v as 'compliant' | 'non_compliant' | 'pending_audit')}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="compliant">
                              <span className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                Compliant
                              </span>
                            </SelectItem>
                            <SelectItem value="pending_audit">
                              <span className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                                Pending Audit
                              </span>
                            </SelectItem>
                            <SelectItem value="non_compliant">
                              <span className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-red-500" />
                                Non-Compliant
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Auditor Name</Label>
                        <Input
                          value={formData.smsf_auditor_name}
                          onChange={(e) => updateField('smsf_auditor_name', e.target.value)}
                          placeholder="SMSF Auditor Pty Ltd"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Financial Details */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Financial Details
              </h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Value</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      value={formData.value || ''}
                      onChange={(e) => updateNumberField('value', e.target.value)}
                      className="pl-9"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Loan Remaining ($)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      value={formData.loan_remaining || ''}
                      onChange={(e) => updateNumberField('loan_remaining', e.target.value)}
                      className="pl-9"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Interest Rate (%)</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.interest_rate || ''}
                      onChange={(e) => updateNumberField('interest_rate', e.target.value)}
                      className="pl-9"
                      placeholder="5.90"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Ownership (%)</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      value={formData.ownership_percentage || ''}
                      onChange={(e) => updateNumberField('ownership_percentage', e.target.value)}
                      className="pl-9"
                      placeholder="100"
                    />
                  </div>
                </div>
              </div>

              {/* Monthly Interest Repayment */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    Monthly Interest Repayment ($)
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Auto-calculated from Loan × Interest Rate ÷ 12</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => updateField('autoCalculateInterest', !formData.autoCalculateInterest)}
                  >
                    <Calculator className="h-3 w-3 mr-1" />
                    {formData.autoCalculateInterest ? 'Manual' : 'Auto'}
                  </Button>
                </div>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    value={formData.monthly_interest_repayment || ''}
                    onChange={(e) => {
                      updateField('autoCalculateInterest', false);
                      updateNumberField('monthly_interest_repayment', e.target.value);
                    }}
                    className="pl-9"
                    placeholder="0"
                    disabled={formData.autoCalculateInterest}
                  />
                </div>
              </div>
            </div>

            {/* Rental Income - Only for investment/smsf */}
            {(formData.property_type === 'investment' || formData.property_type === 'smsf') && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Rental Income</h4>
                  <ExpenseInput label="Rental Income" field="rental_income" />
                </div>

                <Separator />
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Monthly Expenses</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <ExpenseInput label="Body Corporate" field="body_corporate" />
                    <ExpenseInput label="Council Rates" field="council_rates" />
                    <ExpenseInput label="Water Rates" field="water_rates" />
                    <ExpenseInput label="Repairs & Maintenance" field="repairs_maintenance" />
                    <ExpenseInput label="Property Management" field="property_management" />
                    <ExpenseInput label="Landlord Insurance" field="landlord_insurance" />
                    <ExpenseInput label="Building Insurance" field="building_insurance" />
                  </div>
                </div>

                {/* Summary */}
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Monthly Rental Income</span>
                        <span className="text-green-600 font-medium">{formatCurrency(monthlyRentalIncome)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Monthly Expenses</span>
                        <span className="text-red-600 font-medium">-{formatCurrency(totalMonthlyExpenditure)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Net Monthly Cash Flow</span>
                        <span className={netMonthlyCashflow >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(netMonthlyCashflow)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row justify-between gap-2 pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Property?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the property at "{property.address}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deletePropertyMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deletePropertyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Delete'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button onClick={handleSubmit} disabled={updatePropertyMutation.isPending}>
            {updatePropertyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
