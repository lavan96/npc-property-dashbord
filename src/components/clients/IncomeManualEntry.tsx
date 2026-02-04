import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
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
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, DollarSign, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { IncomeFormFields } from './IncomeFormFields';

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
      return data.income || [];
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

  const updateField = useCallback((field: keyof IncomeFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateNumberField = useCallback((field: keyof IncomeFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  }, []);

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
          <Card className="bg-success/10 border-success/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-success" />
                <span className="font-medium text-success">Total Household Income</span>
              </div>
              <p className="text-2xl font-bold text-success">{formatCurrency(combinedTotal)}/year</p>
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
                <IncomeFormFields
                  formData={formData}
                  updateNumberField={updateNumberField}
                  updateField={updateField}
                  onSubmit={handleSubmit}
                  isPending={saveMutation.isPending}
                  editingId={editingId}
                  annualGrossSalary={annualGrossSalary}
                  totalAnnualIncome={totalAnnualIncome}
                />
              </TabsContent>

              <TabsContent value="secondary" className="mt-4">
                <IncomeFormFields
                  formData={formData}
                  updateNumberField={updateNumberField}
                  updateField={updateField}
                  onSubmit={handleSubmit}
                  isPending={saveMutation.isPending}
                  editingId={editingId}
                  annualGrossSalary={annualGrossSalary}
                  totalAnnualIncome={totalAnnualIncome}
                />
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
