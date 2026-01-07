import { useState } from 'react';
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
import { Plus, Building2, Loader2, DollarSign, Percent, Home } from 'lucide-react';
import { toast } from 'sonner';

interface PropertyManualEntryProps {
  clientId: string;
  onComplete: () => void;
}

interface PropertyFormData {
  property_type: 'owner_occupied' | 'investment';
  address: string;
  value: number;
  loan_remaining: number;
  interest_rate: number;
  ownership_percentage: number;
  monthly_interest_repayment: number;
  monthly_body_corporate: number;
  monthly_council_rates: number;
  monthly_water_rates: number;
  monthly_repairs_maintenance: number;
  monthly_property_management: number;
  monthly_landlord_insurance: number;
  monthly_building_insurance: number;
  monthly_rental_income: number;
  weekly_rental_income: number;
}

const defaultFormData: PropertyFormData = {
  property_type: 'investment',
  address: '',
  value: 0,
  loan_remaining: 0,
  interest_rate: 0,
  ownership_percentage: 100,
  monthly_interest_repayment: 0,
  monthly_body_corporate: 0,
  monthly_council_rates: 0,
  monthly_water_rates: 0,
  monthly_repairs_maintenance: 0,
  monthly_property_management: 0,
  monthly_landlord_insurance: 0,
  monthly_building_insurance: 0,
  monthly_rental_income: 0,
  weekly_rental_income: 0,
};

export function PropertyManualEntry({ clientId, onComplete }: PropertyManualEntryProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<PropertyFormData>(defaultFormData);
  const queryClient = useQueryClient();

  const updateField = <K extends keyof PropertyFormData>(field: K, value: PropertyFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateNumberField = (field: keyof PropertyFormData, value: string) => {
    const numValue = parseFloat(value) || 0;
    updateField(field, numValue as any);
  };

  // Calculate total monthly expenditure
  const totalMonthlyExpenditure = 
    formData.monthly_interest_repayment +
    formData.monthly_body_corporate +
    formData.monthly_council_rates +
    formData.monthly_water_rates +
    formData.monthly_repairs_maintenance +
    formData.monthly_property_management +
    formData.monthly_landlord_insurance +
    formData.monthly_building_insurance;

  // Calculate net monthly cashflow
  const netMonthlyCashflow = formData.monthly_rental_income - totalMonthlyExpenditure;

  const createPropertyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('client_properties').insert({
        client_id: clientId,
        ...formData,
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Property
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Add Property
          </SheetTitle>
          <SheetDescription>
            Manually add a property to the client's portfolio
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Home className="h-4 w-4" />
                Property Details
              </h4>
              
              <div className="space-y-2">
                <Label htmlFor="property_type">Property Type</Label>
                <Select
                  value={formData.property_type}
                  onValueChange={(v) => updateField('property_type', v as 'owner_occupied' | 'investment')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner_occupied">Owner Occupied</SelectItem>
                    <SelectItem value="investment">Investment</SelectItem>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="value">Property Value</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="value"
                      type="number"
                      value={formData.value || ''}
                      onChange={(e) => updateNumberField('value', e.target.value)}
                      className="pl-9"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loan_remaining">Loan Remaining</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="loan_remaining"
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
                  <Label htmlFor="interest_rate">Interest Rate</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="interest_rate"
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
                  <Label htmlFor="ownership_percentage">Ownership %</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="ownership_percentage"
                      type="number"
                      value={formData.ownership_percentage || ''}
                      onChange={(e) => updateNumberField('ownership_percentage', e.target.value)}
                      className="pl-9"
                      placeholder="100"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Monthly Expenses */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Monthly Expenses
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="monthly_interest_repayment">Interest Repayment</Label>
                  <Input
                    id="monthly_interest_repayment"
                    type="number"
                    value={formData.monthly_interest_repayment || ''}
                    onChange={(e) => updateNumberField('monthly_interest_repayment', e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthly_body_corporate">Body Corporate</Label>
                  <Input
                    id="monthly_body_corporate"
                    type="number"
                    value={formData.monthly_body_corporate || ''}
                    onChange={(e) => updateNumberField('monthly_body_corporate', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="monthly_council_rates">Council Rates</Label>
                  <Input
                    id="monthly_council_rates"
                    type="number"
                    value={formData.monthly_council_rates || ''}
                    onChange={(e) => updateNumberField('monthly_council_rates', e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthly_water_rates">Water Rates</Label>
                  <Input
                    id="monthly_water_rates"
                    type="number"
                    value={formData.monthly_water_rates || ''}
                    onChange={(e) => updateNumberField('monthly_water_rates', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="monthly_repairs_maintenance">Repairs & Maintenance</Label>
                  <Input
                    id="monthly_repairs_maintenance"
                    type="number"
                    value={formData.monthly_repairs_maintenance || ''}
                    onChange={(e) => updateNumberField('monthly_repairs_maintenance', e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthly_property_management">Property Management</Label>
                  <Input
                    id="monthly_property_management"
                    type="number"
                    value={formData.monthly_property_management || ''}
                    onChange={(e) => updateNumberField('monthly_property_management', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="monthly_landlord_insurance">Landlord Insurance</Label>
                  <Input
                    id="monthly_landlord_insurance"
                    type="number"
                    value={formData.monthly_landlord_insurance || ''}
                    onChange={(e) => updateNumberField('monthly_landlord_insurance', e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthly_building_insurance">Building Insurance</Label>
                  <Input
                    id="monthly_building_insurance"
                    type="number"
                    value={formData.monthly_building_insurance || ''}
                    onChange={(e) => updateNumberField('monthly_building_insurance', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Income (for investment properties) */}
            {formData.property_type === 'investment' && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Rental Income</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="monthly_rental_income">Monthly Rental</Label>
                    <Input
                      id="monthly_rental_income"
                      type="number"
                      value={formData.monthly_rental_income || ''}
                      onChange={(e) => updateNumberField('monthly_rental_income', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weekly_rental_income">Weekly Rental</Label>
                    <Input
                      id="weekly_rental_income"
                      type="number"
                      value={formData.weekly_rental_income || ''}
                      onChange={(e) => updateNumberField('weekly_rental_income', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Monthly Expenses</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(totalMonthlyExpenditure)}
                </span>
              </div>
              {formData.property_type === 'investment' && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Monthly Rental Income</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(formData.monthly_rental_income)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm font-medium">
                    <span>Net Monthly Cash Flow</span>
                    <span className={netMonthlyCashflow >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(netMonthlyCashflow)}
                    </span>
                  </div>
                </>
              )}
            </div>
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