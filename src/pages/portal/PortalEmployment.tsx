import { usePortalFinancesData } from '@/hooks/usePortalData';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Briefcase, TrendingUp, CreditCard, Loader2 } from 'lucide-react';
import { PortalEmploymentForm } from '@/components/portal/PortalEmploymentForm';
import { PortalIncomeForm } from '@/components/portal/PortalIncomeForm';

function fmt(val?: number | null): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

export default function PortalEmployment() {
  const { data, isLoading, error, refetch } = usePortalFinancesData();

  const client = data?.client;
  const employment = data?.employment || [];
  const income = data?.income || [];
  const expenses = data?.expenses || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">Unable to load data.</CardContent></Card>
    );
  }

  const totalMonthlyIncome = income.reduce((sum: number, i: any) => sum + (i.gross_annual_amount || 0) / 12, 0);
  const totalMonthlyExpenses = expenses.reduce((sum: number, e: any) => sum + (e.monthly_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Employment & Finances</h1>
        <p className="text-muted-foreground mt-1">Manage your employment, income, and expense details</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Monthly Income</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(client?.total_monthly_income || totalMonthlyIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Monthly Expenses</p>
            <p className="text-xl font-bold text-destructive">{fmt(client?.total_monthly_expenditure || totalMonthlyExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Net Cash Flow</p>
            <p className={`text-xl font-bold ${(client?.net_monthly_cash_flow ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {fmt(client?.net_monthly_cash_flow)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Debt</p>
            <p className="text-xl font-bold text-foreground">{fmt(client?.total_debt)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="employment" className="space-y-4">
        <TabsList className="w-full flex">
          <TabsTrigger value="employment" className="flex-1 gap-2">
            <Briefcase className="h-4 w-4" />
            Employment
          </TabsTrigger>
          <TabsTrigger value="income" className="flex-1 gap-2">
            <TrendingUp className="h-4 w-4" />
            Income
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex-1 gap-2">
            <CreditCard className="h-4 w-4" />
            Expenses
          </TabsTrigger>
        </TabsList>

        {/* Employment Tab — Full CRUD */}
        <TabsContent value="employment" className="space-y-4">
          <PortalEmploymentForm
            existingEmployment={employment}
            onRefresh={refetch}
          />
        </TabsContent>

        {/* Income Tab — Full CRUD */}
        <TabsContent value="income" className="space-y-4">
          <PortalIncomeForm
            existingIncome={income}
            onRefresh={refetch}
          />
        </TabsContent>

        {/* Expenses Tab — Read-only for now */}
        <TabsContent value="expenses" className="space-y-4">
          {expenses.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CreditCard className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p>No expenses on file.</p>
              </CardContent>
            </Card>
          ) : (
            (() => {
              const expensesByCategory = expenses.reduce((acc: Record<string, any[]>, item: any) => {
                const cat = item.expense_category || 'Other';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(item);
                return acc;
              }, {});

              return Object.entries(expensesByCategory).map(([category, items]) => (
                <Card key={category}>
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-base font-semibold capitalize">{category.replace(/_/g, ' ')}</p>
                      <span className="text-sm font-semibold text-destructive">
                        {fmt((items as any[]).reduce((s: number, e: any) => s + (e.monthly_amount || 0), 0))}/mo
                      </span>
                    </div>
                    {(items as any[]).map((exp: any) => (
                      <div key={exp.id} className="flex justify-between py-2.5 border-b border-border/50 last:border-0">
                        <div>
                          <p className="text-sm text-foreground">{exp.expense_name || exp.expense_category}</p>
                          {exp.frequency && <p className="text-xs text-muted-foreground capitalize">{exp.frequency}</p>}
                        </div>
                        <p className="text-sm font-medium text-foreground">{fmt(exp.monthly_amount)}<span className="text-xs text-muted-foreground font-normal">/mo</span></p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ));
            })()
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
