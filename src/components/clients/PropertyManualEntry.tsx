import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Building2, Loader2, DollarSign, Percent, Home, Calculator, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PropertyManualEntryProps {
  clientId: string;
  onComplete: () => void;
}

type FrequencyType = 'monthly' | 'quarterly' | 'annually' | 'weekly';

interface ExpenseField {
  value: number;
  frequency: FrequencyType;
  monthlyValue: number;
}

interface PropertyFormData {
  property_type: 'owner_occupied' | 'investment';
  address: string;
  value: number;
  loan_remaining: number;
  interest_rate: number;
  ownership_percentage: number;
  monthly_interest_repayment: number;
  autoCalculateInterest: boolean;
  // Expenses with frequency
  body_corporate: ExpenseField;
  council_rates: ExpenseField;
  water_rates: ExpenseField;
  repairs_maintenance: ExpenseField;
  property_management: ExpenseField;
  landlord_insurance: ExpenseField;
  building_insurance: ExpenseField;
  // Rental income with frequency
  rental_income: ExpenseField;
}

const createExpenseField = (value = 0, frequency: FrequencyType = 'monthly'): ExpenseField => ({
  value,
  frequency,
  monthlyValue: convertToMonthly(value, frequency),
});

const convertToMonthly = (value: number, frequency: FrequencyType): number => {
  switch (frequency) {
    case 'weekly':
      return value * 4.33; // Average weeks per month
    case 'quarterly':
      return value / 3;
    case 'annually':
      return value / 12;
    case 'monthly':
    default:
      return value;
  }
};

const defaultFormData: PropertyFormData = {
  property_type: 'investment',
  address: '',
  value: 0,
  loan_remaining: 0,
  interest_rate: 5.90,
  ownership_percentage: 100,
  monthly_interest_repayment: 0,
  autoCalculateInterest: true,
  body_corporate: createExpenseField(0, 'quarterly'),
  council_rates: createExpenseField(0, 'quarterly'),
  water_rates: createExpenseField(0, 'quarterly'),
  repairs_maintenance: createExpenseField(0, 'annually'),
  property_management: createExpenseField(0, 'monthly'),
  landlord_insurance: createExpenseField(0, 'annually'),
  building_insurance: createExpenseField(0, 'annually'),
  rental_income: createExpenseField(0, 'weekly'),
};

export function PropertyManualEntry({ clientId, onComplete }: PropertyManualEntryProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<PropertyFormData>(defaultFormData);
  const queryClient = useQueryClient();

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
  
  // Net Monthly Rental Position (rental income minus expenses excluding interest)
  const netMonthlyRentalPosition = monthlyRentalIncome - (totalMonthlyExpenditure - formData.monthly_interest_repayment);

  const createPropertyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('client_properties').insert({
        client_id: clientId,
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
        weekly_rental_income: formData.rental_income.frequency === 'weekly' ? formData.rental_income.value : formData.rental_income.monthlyValue / 4.33,
        total_monthly_expenditure: totalMonthlyExpenditure,
        net_monthly_cashflow: netMonthlyCashflow,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-properties', clientId] });
      toast.success('Property added successfully');
      setFormData(defaultFormData);
      setOpen(false);
      onComplete();
    },
    onError: (error: any) => {
      toast.error('Failed to add property: ' + error.message);
    },
  });

  const handleSubmit = () => {
    if (!formData.address.trim()) {
      toast.error('Please enter an address');
      return;
    }
    createPropertyMutation.mutate();
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
    defaultFrequency = 'monthly',
    showMonthlyEquivalent = true,
  }: {
    label: string;
    field: keyof Pick<PropertyFormData, 'body_corporate' | 'council_rates' | 'water_rates' | 'repairs_maintenance' | 'property_management' | 'landlord_insurance' | 'building_insurance' | 'rental_income'>;
    defaultFrequency?: FrequencyType;
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Property
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Add Property
          </SheetTitle>
          <SheetDescription>
            Add a property matching Vownet template format
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          <div className="space-y-6 py-4">
            {/* Property Type Selection */}
            <Card className="border-primary/20">
              <CardContent className="pt-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Property Type</Label>
                    <Select
                      value={formData.property_type}
                      onValueChange={(v) => updateField('property_type', v as 'owner_occupied' | 'investment')}
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
                {formData.autoCalculateInterest && formData.loan_remaining > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Calculated: {formatCurrency(formData.loan_remaining)} × {formData.interest_rate}% ÷ 12
                  </p>
                )}
              </div>
            </div>

            {/* Monthly Expenses - Only for Investment Properties */}
            {formData.property_type === 'investment' && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Monthly Expenses (with frequency conversion)</h4>
                  
                  <div className="grid gap-4">
                    <ExpenseInput 
                      label="Body Corporate/Strata Fees" 
                      field="body_corporate" 
                      defaultFrequency="quarterly" 
                    />
                    <ExpenseInput 
                      label="Council Rate Charges" 
                      field="council_rates" 
                      defaultFrequency="quarterly" 
                    />
                    <ExpenseInput 
                      label="Water Rate Charges" 
                      field="water_rates" 
                      defaultFrequency="quarterly" 
                    />
                    <ExpenseInput 
                      label="Repairs & Maintenance" 
                      field="repairs_maintenance" 
                      defaultFrequency="annually" 
                    />
                    <ExpenseInput 
                      label="Property Management Fees" 
                      field="property_management" 
                      defaultFrequency="monthly" 
                    />
                    <ExpenseInput 
                      label="Landlord Insurance" 
                      field="landlord_insurance" 
                      defaultFrequency="annually" 
                    />
                    <ExpenseInput 
                      label="Building Insurance" 
                      field="building_insurance" 
                      defaultFrequency="annually" 
                    />
                  </div>
                </div>

                <Separator />

                {/* Rental Income */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Rental Income</h4>
                  <ExpenseInput 
                    label="Rental Income" 
                    field="rental_income" 
                    defaultFrequency="weekly" 
                  />
                </div>
              </>
            )}

            <Separator />

            {/* Summary Card */}
            <Card className="bg-muted/50 border-0">
              <CardContent className="pt-4 space-y-3">
                <h4 className="font-medium text-sm">Cashflow Summary</h4>
                
                {formData.property_type === 'investment' && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Monthly Rental Income</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(monthlyRentalIncome)}
                      </span>
                    </div>
                  </>
                )}
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly Interest Repayment</span>
                  <span className="font-medium text-red-600">
                    -{formatCurrency(formData.monthly_interest_repayment)}
                  </span>
                </div>
                
                {formData.property_type === 'investment' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Other Monthly Expenses</span>
                    <span className="font-medium text-red-600">
                      -{formatCurrency(totalMonthlyExpenditure - formData.monthly_interest_repayment)}
                    </span>
                  </div>
                )}
                
                <Separator />
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Expenditure</span>
                  <span className="font-medium text-red-600">
                    {formatCurrency(formData.property_type === 'owner_occupied' ? formData.monthly_interest_repayment : totalMonthlyExpenditure)}
                  </span>
                </div>
                
                {formData.property_type === 'investment' && (
                  <>
                    <div className="flex justify-between text-sm font-medium">
                      <span>Net Monthly Cashflow</span>
                      <span className={netMonthlyCashflow >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(netMonthlyCashflow)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Net Monthly Rental Position</span>
                      <span className={netMonthlyRentalPosition >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(netMonthlyRentalPosition)}
                      </span>
                    </div>
                  </>
                )}
                
                {formData.property_type === 'owner_occupied' && (
                  <div className="flex justify-between text-sm font-medium">
                    <span>Net Monthly Cashflow</span>
                    <span className="text-red-600">
                      -{formatCurrency(formData.monthly_interest_repayment)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <SheetFooter className="pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={createPropertyMutation.isPending}
          >
            {createPropertyMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Add Property
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
