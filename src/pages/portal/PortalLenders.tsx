import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Landmark, Scale, ChevronRight } from 'lucide-react';
import { usePortalLendersData } from '@/hooks/usePortalData';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pre_assessment: 'Pre-Assessment',
  submitted: 'Submitted',
  conditional_approval: 'Conditional Approval',
  unconditional_approval: 'Approved',
  loan_docs_issued: 'Loan Docs Issued',
  settled: 'Settled',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

const STATUS_VARIANT: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pre_assessment: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  submitted: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  conditional_approval: 'bg-primary/10 text-primary',
  unconditional_approval: 'bg-primary/15 text-primary',
  loan_docs_issued: 'bg-primary/20 text-primary',
  settled: 'bg-success/15 text-success',
  declined: 'bg-destructive/10 text-destructive',
  withdrawn: 'bg-muted text-muted-foreground',
};

const PIPELINE = [
  'draft','pre_assessment','submitted','conditional_approval',
  'unconditional_approval','loan_docs_issued','settled',
];

export default function PortalLenders() {
  const { data, isLoading } = usePortalLendersData();
  const submissions: any[] = data?.lenderSubmissions ?? [];
  const comparisons: any[] = data?.lenderComparisons ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="client-portal-page-header">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Landmark className="h-6 w-6 text-primary" /> Your Lender Submissions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your loan applications and view lender comparisons your broker has shared.
        </p>
      </div>

      <Card className="client-portal-soft-panel overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Loan applications</CardTitle>
          <CardDescription>Read-only view of your submissions across lenders.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {submissions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No active submissions yet. Your broker will share progress here.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {submissions.map(s => {
                const idx = PIPELINE.indexOf(s.status);
                return (
                  <div key={s.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{s.lender_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.product_name || '—'}
                          {s.loan_amount ? ` · $${Number(s.loan_amount).toLocaleString()}` : ''}
                          {s.interest_rate ? ` · ${Number(s.interest_rate).toFixed(2)}%` : ''}
                        </div>
                      </div>
                      <Badge className={cn("text-[10px]", STATUS_VARIANT[s.status])}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                    </div>
                    {idx >= 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {PIPELINE.map((st, i) => (
                          <div key={st} className="flex items-center gap-1">
                            <div className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-medium",
                              i <= idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            )}>
                              {STATUS_LABEL[st]}
                            </div>
                            {i < PIPELINE.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="client-portal-soft-panel overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4" /> Lender comparisons
          </CardTitle>
          <CardDescription>Comparison snapshots your broker has shared with you.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {comparisons.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No comparisons shared yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {comparisons.map(sheet => (
                <div key={sheet.id} className="p-4 space-y-2">
                  <div className="font-medium text-sm">{sheet.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Shared {new Date(sheet.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(sheet.rate_snapshot as any[]).map((r, i) => (
                      <Badge key={i} variant="outline" className={cn("text-[10px] tabular-nums",
                        i === 0 && "border-primary/50 text-primary"
                      )}>
                        {r.lender_name}{r.lowest_rate ? ` · ${Number(r.lowest_rate).toFixed(2)}%` : ''}
                      </Badge>
                    ))}
                  </div>
                  {sheet.notes && (
                    <div className="text-xs text-muted-foreground italic">{sheet.notes}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
