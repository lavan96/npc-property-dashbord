import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, ExternalLink, FileSearch, Link2 } from 'lucide-react';
import type { DealWithClient } from '@/hooks/useAllDeals';

const FINANCE_STATUS_TONE: Record<string, string> = {
  at_risk: 'border-destructive/40 bg-destructive/5 text-destructive',
  unconditional_approval: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-500',
  settled: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-500',
  ready_for_settlement: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-500',
};

function statusLabel(s?: string | null) {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function LinkedFinanceFilesPanel({ deals }: { deals: DealWithClient[] }) {
  const navigate = useNavigate();

  const linked = useMemo(() => deals.filter(d => d.financeFile), [deals]);
  const unlinked = useMemo(() => deals.filter(d => !d.financeFile), [deals]);

  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20 shadow-sm">
      <CardHeader className="space-y-4 border-b border-border/70 pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-primary/15 bg-primary/10 p-2 text-primary">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Finance coordination
            </p>
            <CardTitle className="mt-1 text-base font-semibold tracking-tight">
              Linked Finance Files
            </CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Purchase File coverage for active deals, with finance portal hand-offs kept visible for follow-up.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
            <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              {linked.length} linked
            </Badge>
            <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              {unlinked.length} unlinked
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded-lg bg-amber-500/15 p-1.5 text-amber-700 dark:text-amber-300">
              <FileSearch className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {unlinked.length > 0 ? 'Finance linking attention required' : 'Finance file coverage is fully linked'}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {linked.length === 0
                  ? 'No deals are linked to a finance Purchase File yet. Open a deal in Command Centre and link it from the finance portal Deal Room.'
                  : unlinked.length > 0
                    ? 'Unlinked deals remain in the workflow queue so the team can coordinate Purchase File setup without losing visibility.'
                    : 'Every deal in this view is connected to a finance Purchase File and ready for portal review.'}
              </p>
            </div>
          </div>
        </div>

        {linked.length > 0 && (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {linked.map(d => {
              const pf = d.financeFile!;
              const tone = FINANCE_STATUS_TONE[pf.finance_status || ''] || 'border-border/80 bg-background/70';
              return (
                <div key={d.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs shadow-sm transition-colors hover:bg-muted/40 ${tone}`}>
                  <div className="min-w-0">
                    <p className="font-semibold truncate text-foreground">{d.client_name}</p>
                    <p className="mt-1 text-muted-foreground truncate">
                      {pf.lender || 'No lender'} · {pf.settlement_date || 'No settlement date'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] capitalize bg-background/60">{statusLabel(pf.finance_status)}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs hover:bg-background/80"
                      onClick={() => navigate(`/finance/purchase-files/${pf.id}`)}
                    >
                      Open <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
