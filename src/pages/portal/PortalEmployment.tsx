import { usePortalFinancesData } from '@/hooks/usePortalData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Briefcase, DollarSign, TrendingUp, TrendingDown, Loader2,
  Building2, CircleDollarSign, CreditCard
} from 'lucide-react';

function fmt(val?: number | null): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function InfoRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  if (!value || value === '—') return null;
  return (
    <div className="flex justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-right ${highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

export default function PortalEmployment() {
  const { data, isLoading, error } = usePortalFinancesData();

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

  // Group income by source_category
  const incomeByCategory = income.reduce((acc: Record<string, any[]>, item: any) => {
    const cat = item.source_category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Group expenses by category
  const expensesByCategory = expenses.reduce((acc: Record<string, any[]>, item: any) => {
    const cat = item.expense_category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const totalMonthlyIncome = income.reduce((sum: number, i: any) => sum + (i.gross_annual_amount || 0) / 12, 0);
  const totalMonthlyExpenses = expenses.reduce((sum: number, e: any) => sum + (e.monthly_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Employment & Finances</h1>
        <p className="text-muted-foreground mt-1">Your employment, income, and expense details</p>
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

        {/* Employment Tab */}
        <TabsContent value="employment" className="space-y-4">
          {employment.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Briefcase className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p>No employment records on file.</p>
              </CardContent>
            </Card>
          ) : (
            employment.map((emp: any) => (
              <Card key={emp.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{emp.employer_name || 'Employment'}</CardTitle>
                        {emp.occupation_role && <CardDescription>{emp.occupation_role}</CardDescription>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">{emp.contact_type || 'Primary'}</Badge>
                      {emp.is_current && <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Current</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <InfoRow label="Employment Type" value={emp.employment_type} />
                  <InfoRow label="Gross Annual Salary" value={fmt(emp.gross_annual_salary)} highlight />
                  <InfoRow label="Salary Amount" value={emp.salary_amount ? `${fmt(emp.salary_amount)} ${emp.salary_frequency || ''}` : '—'} />
                  <InfoRow label="Bonus" value={fmt(emp.bonus)} />
                  <InfoRow label="Commission" value={fmt(emp.commission)} />
                  <InfoRow label="Overtime (Essential)" value={fmt(emp.overtime_essential)} />
                  <InfoRow label="Overtime (Non-Essential)" value={fmt(emp.overtime_non_essential)} />
                  <InfoRow label="Allowance" value={fmt(emp.allowance)} />
                  <InfoRow label="Start Date" value={emp.start_date ? new Date(emp.start_date).toLocaleDateString('en-AU') : '—'} />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Income Tab */}
        <TabsContent value="income" className="space-y-4">
          {income.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CircleDollarSign className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p>No income sources on file.</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(incomeByCategory).map(([category, items]) => (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base capitalize">{category.replace(/_/g, ' ')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {(items as any[]).map((inc: any) => (
                    <div key={inc.id} className="py-3 border-b border-border/50 last:border-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-foreground">{inc.source_name || inc.source_type}</p>
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">{inc.contact_type} • {inc.source_type?.replace(/_/g, ' ')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmt(inc.gross_annual_amount)}<span className="text-xs text-muted-foreground font-normal">/yr</span></p>
                          <p className="text-xs text-muted-foreground">{fmt(inc.gross_annual_amount / 12)}/mo</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-4">
          {expenses.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CreditCard className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p>No expenses on file.</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(expensesByCategory).map(([category, items]) => (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base capitalize">{category.replace(/_/g, ' ')}</CardTitle>
                    <span className="text-sm font-semibold text-destructive">
                      {fmt((items as any[]).reduce((s: number, e: any) => s + (e.monthly_amount || 0), 0))}/mo
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
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
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
