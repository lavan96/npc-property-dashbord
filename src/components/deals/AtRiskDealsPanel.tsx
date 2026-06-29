import { useMemo } from 'react';
import { differenceInDays, isPast, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RISK_STATUS_CONFIG } from '@/components/clients/deal-tracker/types';
import type { DealWithClient } from '@/hooks/useAllDeals';
import { pipelineBadgeClass } from '@/components/deals/pipelineBadgeStyles';

interface Props {
  deals: DealWithClient[];
  onDealClick?: (deal: DealWithClient) => void;
}

interface RiskItem {
  deal: DealWithClient;
  reasons: string[];
  severity: 'critical' | 'warning';
}

export function AtRiskDealsPanel({ deals, onDealClick }: Props) {
  const riskItems = useMemo(() => {
    const items: RiskItem[] = [];
    const now = new Date();

    deals.forEach(deal => {
      const reasons: string[] = [];
      let severity: 'critical' | 'warning' = 'warning';

      // Urgent risk status
      if (deal.risk_status === 'urgent') {
        reasons.push('Marked as urgent');
        severity = 'critical';
      } else if (deal.risk_status === 'needs_follow_up') {
        reasons.push('Needs follow-up');
      }

      // Overdue settlement
      if (deal.settlement_date && isPast(new Date(deal.settlement_date))) {
        reasons.push(`Settlement overdue (${format(new Date(deal.settlement_date), 'dd MMM')})`);
        severity = 'critical';
      }

      // Settlement within 7 days
      if (deal.settlement_date) {
        const days = differenceInDays(new Date(deal.settlement_date), now);
        if (days >= 0 && days <= 7) {
          reasons.push(`Settling in ${days}d`);
          if (severity !== 'critical') severity = 'warning';
        }
      }

      // Finance clause expiry
      if (deal.finance_clause_expiry) {
        const days = differenceInDays(new Date(deal.finance_clause_expiry), now);
        if (days < 0) {
          reasons.push('Finance clause expired');
          severity = 'critical';
        } else if (days <= 7) {
          reasons.push(`Finance clause expires in ${days}d`);
        }
      }

      // Stale deals — no stage progress and > 14 days old
      const stageCount = (deal.stages || []).filter((s: any) => s.status === 'complete').length;
      const dealAge = differenceInDays(now, new Date(deal.created_at));
      if (stageCount <= 1 && dealAge > 14) {
        reasons.push(`Stale — ${dealAge}d with minimal progress`);
      }

      if (reasons.length > 0) {
        items.push({ deal, reasons, severity });
      }
    });

    return items.sort((a, b) => {
      if (a.severity === 'critical' && b.severity !== 'critical') return -1;
      if (b.severity === 'critical' && a.severity !== 'critical') return 1;
      return 0;
    });
  }, [deals]);

  if (riskItems.length === 0) {
    return (
      <Card className="border-green-500/20 bg-green-500/5 shadow-sm">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-green-600 font-medium">✅ All deals on track — no immediate risks detected</p>
        </CardContent>
      </Card>
    );
  }

  const critical = riskItems.filter(r => r.severity === 'critical').length;

  return (
    <Card
      className={cn(
        'overflow-hidden border shadow-sm ring-1 ring-black/5',
        critical > 0
          ? 'border-destructive/25 bg-gradient-to-b from-destructive/[0.035] via-card to-card'
          : 'border-amber-500/25 bg-gradient-to-b from-amber-500/[0.05] via-card to-card'
      )}
    >
      <CardHeader className="border-b border-border/60 px-3 pb-3 pt-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div
              className={cn(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-sm',
                critical > 0
                  ? 'border-destructive/20 bg-destructive/10 text-destructive'
                  : 'border-amber-500/25 bg-amber-500/10 text-amber-600'
              )}
            >
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold tracking-tight">Risk Control</CardTitle>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                At-risk deals requiring operational attention
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={pipelineBadgeClass(critical > 0 ? 'danger' : 'warning', false, 'shrink-0 uppercase tracking-wide')}
          >
            {critical > 0 ? `${critical} critical` : `${riskItems.length} warnings`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3 py-3 sm:px-4">
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {riskItems.map(({ deal, reasons, severity }) => {
            const riskCfg = RISK_STATUS_CONFIG[deal.risk_status];
            const isCritical = severity === 'critical';

            return (
              <div
                key={deal.id}
                className={cn(
                  'group cursor-pointer rounded-xl border bg-card/85 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                  'focus-within:ring-2 focus-within:ring-ring/30',
                  isCritical
                    ? 'border-destructive/20 hover:border-destructive/35 hover:bg-destructive/[0.045]'
                    : 'border-amber-500/20 hover:border-amber-500/35 hover:bg-amber-500/[0.055]'
                )}
                onClick={() => onDealClick?.(deal)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
                      isCritical
                        ? 'border-destructive/20 bg-destructive/10 text-destructive'
                        : 'border-amber-500/25 bg-amber-500/10 text-amber-600'
                    )}
                  >
                    {isCritical ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold leading-5 text-foreground">{deal.client_name}</p>
                      </div>
                      <Badge className={cn(pipelineBadgeClass(deal.risk_status === 'on_track' ? 'success' : deal.risk_status === 'needs_follow_up' ? 'warning' : 'danger', true, 'h-5 shrink-0 px-1.5'), riskCfg.color)}>
                        {riskCfg.emoji}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {reasons.map((reason, index) => (
                        <span
                          key={index}
                          className={cn(
                            'max-w-full break-words rounded-md border px-2 py-1 text-[11px] font-medium leading-4',
                            isCritical
                              ? 'border-destructive/15 bg-destructive/[0.055] text-destructive'
                              : 'border-amber-500/20 bg-amber-500/[0.065] text-amber-700'
                          )}
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
