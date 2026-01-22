import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, DollarSign, Loader2, Edit } from 'lucide-react';
import { toast } from 'sonner';

interface IncomeManualEntryProps {
  clientId: string;
  onComplete: () => void;
}

interface IncomeFormData {
  id?: string;
  contact_type: 'primary' | 'secondary';
  gross_salary: number;
  salary_frequency: string;
  bonus: number;
  allowance: number;
  commission: number;
  overtime_essential: number;
  overtime_non_essential: number;
  other_taxable_income: number;
}

const frequencyOptions = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
];

const defaultFormData: IncomeFormData = {
  contact_type: 'primary',
  gross_salary: 0,
  salary_frequency: 'annual',
  bonus: 0,
  allowance: 0,
  commission: 0,
  overtime_essential: 0,
  overtime_non_essential: 0,
  other_taxable_income: 0,
};

import { invokeSecureFunction } from '@/lib/secureInvoke';

export function IncomeManualEntry({ clientId, onComplete }: IncomeManualEntryProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'primary' | 'secondary'>('primary');
  const [formData, setFormData] = useState<IncomeFormData>(defaultFormData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch existing income records with secure Edge Function (HttpOnly cookies)
  const { data: existingIncome = [] } = useQuery({
    queryKey: ['client-income', clientId],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('get-client-data', {
        clientId,
        include: { income: true },
      });
      
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error('Failed to fetch income');
      return data.data?.income || [];
    },
  });

  const primaryIncome = existingIncome.find(i => i.contact_type === 'primary');
  const secondaryIncome = existingIncome.find(i => i.contact_type === 'secondary');

  const loadIncomeData = (income: any, contactType: 'primary' | 'secondary') => {
    if (income) {
      setFormData({
        id: income.id,
        contact_type: contactType,
        gross_salary: income.gross_salary || 0,
        salary_frequency: income.salary_frequency || 'annual',
        bonus: income.bonus || 0,
        allowance: income.allowance || 0,
        commission: income.commission || 0,
        overtime_essential: income.overtime_essential || 0,
        overtime_non_essential: income.overtime_non_essential || 0,
        other_taxable_income: income.other_taxable_income || 0,
      });
      setEditingId(income.id);
    } else {
      setFormData({ ...defaultFormData, contact_type: contactType });
      setEditingId(null);
    }
  };

  // Load data when tab changes
  const handleTabChange = (tab: 'primary' | 'secondary') => {
    setActiveTab(tab);
    const income = tab === 'primary' ? primaryIncome : secondaryIncome;
    loadIncomeData(income, tab);
  };

  // Load data when sheet opens
  useState(() => {
    if (open) {
      const income = activeTab === 'primary' ? primaryIncome : secondaryIncome;
      loadIncomeData(income, activeTab);
    }
  });

  const updateField = (field: keyof IncomeFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateNumberField = (field: keyof IncomeFormData, value: string) => {
    updateField(field, parseFloat(value) || 0);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        client_id: clientId,
        contact_type: formData.contact_type,
        gross_salary: formData.gross_salary,
        salary_frequency: formData.salary_frequency,
        bonus: formData.bonus,
        allowance: formData.allowance,
        commission: formData.commission,
        overtime_essential: formData.overtime_essential,
        overtime_non_essential: formData.overtime_non_essential,
        other_taxable_income: formData.other_taxable_income,
      };

      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: editingId ? 'update' : 'create',
        table: 'client_income',
        clientId,
        recordId: editingId,
        data: payload,
      });
      
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to save income');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-income', clientId] });
      toast.success('Income details saved');
    },
    onError: (error: any) => {
      toast.error('Failed to save income: ' + error.message);
    },
  });

  const handleSubmit = () => {
    saveMutation.mutate();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calculate annual income
  const convertToAnnual = (amount: number, frequency: string) => {
    switch (frequency) {
      case 'weekly': return amount * 52;
      case 'fortnightly': return amount * 26;
      case 'monthly': return amount * 12;
      default: return amount;
    }
  };

  const annualGrossSalary = convertToAnnual(formData.gross_salary, formData.salary_frequency);
  const totalAnnualIncome = 
    annualGrossSalary + 
    formData.bonus + 
    formData.allowance + 
    formData.commission + 
    formData.overtime_essential + 
    formData.overtime_non_essential + 
    formData.other_taxable_income;

  const IncomeForm = () => (
    <div className="space-y-4">
      {/* Gross Salary with Frequency */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Gross Salary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                value={formData.gross_salary || ''}
                onChange={(e) => updateNumberField('gross_salary', e.target.value)}
                className="pl-9"
                placeholder="0"
              />
            </div>
            <Select
              value={formData.salary_frequency}
              onValueChange={(v) => updateField('salary_frequency', v)}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formData.salary_frequency !== 'annual' && formData.gross_salary > 0 && (
            <p className="text-xs text-muted-foreground">
              = {formatCurrency(annualGrossSalary)} per annum
            </p>
          )}
        </CardContent>
      </Card>

      {/* Additional Income Fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Additional Income (Annual)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Bonus (avg of last 2 years)</Label>
              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={formData.bonus || ''}
                  onChange={(e) => updateNumberField('bonus', e.target.value)}
                  className="pl-7 h-9"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Allowance</Label>
              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={formData.allowance || ''}
                  onChange={(e) => updateNumberField('allowance', e.target.value)}
                  className="pl-7 h-9"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Commission</Label>
              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={formData.commission || ''}
                  onChange={(e) => updateNumberField('commission', e.target.value)}
                  className="pl-7 h-9"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Overtime (Essential)</Label>
              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={formData.overtime_essential || ''}
                  onChange={(e) => updateNumberField('overtime_essential', e.target.value)}
                  className="pl-7 h-9"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Overtime (Non-Essential)</Label>
              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={formData.overtime_non_essential || ''}
                  onChange={(e) => updateNumberField('overtime_non_essential', e.target.value)}
                  className="pl-7 h-9"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Other Taxable Income</Label>
              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={formData.other_taxable_income || ''}
                  onChange={(e) => updateNumberField('other_taxable_income', e.target.value)}
                  className="pl-7 h-9"
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Other taxable income includes Centrelink Part A/B, disability payments, carer's allowance
          </p>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="bg-muted/50 border-0">
        <CardContent className="pt-4">
          <div className="flex justify-between items-center">
            <span className="font-medium">Total Annual Income</span>
            <span className="text-lg font-bold text-green-600">
              {formatCurrency(totalAnnualIncome)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCurrency(totalAnnualIncome / 12)} per month
          </p>
        </CardContent>
      </Card>

      <Button 
        onClick={handleSubmit} 
        disabled={saveMutation.isPending}
        className="w-full"
      >
        {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {editingId ? 'Update Income Details' : 'Save Income Details'}
      </Button>
    </div>
  );

  // Calculate total annual income for display
  const calculateTotalForContact = (contactIncome: typeof primaryIncome) => {
    if (!contactIncome) return 0;
    const annualSalary = convertToAnnual(contactIncome.gross_salary || 0, contactIncome.salary_frequency || 'annual');
    return annualSalary + (contactIncome.bonus || 0) + (contactIncome.allowance || 0) + 
           (contactIncome.commission || 0) + (contactIncome.overtime_essential || 0) + 
           (contactIncome.overtime_non_essential || 0) + (contactIncome.other_taxable_income || 0);
  };

  const primaryTotal = calculateTotalForContact(primaryIncome);
  const secondaryTotal = calculateTotalForContact(secondaryIncome);
  const combinedTotal = primaryTotal + secondaryTotal;

  return (
    <div className="space-y-4">
      {/* Income Summary Display */}
      {existingIncome.length > 0 ? (
        <div className="space-y-2">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-700">Total Household Income</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(combinedTotal)}/year</p>
              <p className="text-sm text-muted-foreground">{formatCurrency(combinedTotal / 12)}/month</p>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-2 gap-2">
            {primaryIncome && (
              <Card>
                <CardContent className="pt-3">
                  <p className="text-xs text-muted-foreground">Primary</p>
                  <p className="font-medium">{formatCurrency(primaryTotal)}/year</p>
                </CardContent>
              </Card>
            )}
            {secondaryIncome && (
              <Card>
                <CardContent className="pt-3">
                  <p className="text-xs text-muted-foreground">Secondary</p>
                  <p className="font-medium">{formatCurrency(secondaryTotal)}/year</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No income records</p>
        </div>
      )}

      <Sheet open={open} onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          const income = activeTab === 'primary' ? primaryIncome : secondaryIncome;
          loadIncomeData(income, activeTab);
        }
      }}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {existingIncome.length > 0 ? 'Edit Income' : 'Add Income'}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financial Details (Income)
            </SheetTitle>
            <SheetDescription>
              Manage income details for primary and secondary contacts
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-180px)] pr-4 mt-4">
            <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as 'primary' | 'secondary')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="primary">
                  Primary Contact
                  {primaryIncome && <Edit className="h-3 w-3 ml-1" />}
                </TabsTrigger>
                <TabsTrigger value="secondary">
                  Secondary Contact
                  {secondaryIncome && <Edit className="h-3 w-3 ml-1" />}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="primary" className="mt-4">
                <IncomeForm />
              </TabsContent>

              <TabsContent value="secondary" className="mt-4">
                <IncomeForm />
              </TabsContent>
            </Tabs>
          </ScrollArea>

          <SheetFooter className="pt-4">
            <Button variant="outline" onClick={() => { setOpen(false); onComplete(); }}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
