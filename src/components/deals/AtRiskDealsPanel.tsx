import { useMemo } from 'react';
import { differenceInDays, isPast, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { AlertTriangle, Clock, FileWarning, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RISK_STATUS_CONFIG } from '@/components/clients/deal-tracker/types';
import type { DealWithClient } from '@/hooks/useAllDeals';

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
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-green-600 font-medium">✅ All deals on track — no immediate risks detected</p>
        </CardContent>
      </Card>
    );
  }

  const critical = riskItems.filter(r => r.severity === 'critical').length;

  return (
    <Card className={cn(critical > 0 ? 'border-destructive/30' : 'border-amber-500/30')}>
      <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <ShieldAlert className={cn('h-4 w-4', critical > 0 ? 'text-destructive' : 'text-amber-500')} />
          At-Risk Deals
          <Badge variant={critical > 0 ? 'destructive' : 'outline'} className="text-[10px] ml-auto">
            {critical > 0 ? `${critical} critical` : `${riskItems.length} warnings`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-4 pb-3">
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {riskItems.map(({ deal, reasons, severity }) => {
            const riskCfg = RISK_STATUS_CONFIG[deal.risk_status];
            return (
              <div
                key={deal.id}
                className={cn(
                  'flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors',
                  severity === 'critical'
                    ? 'bg-destructive/5 hover:bg-destructive/10'
                    : 'bg-amber-500/5 hover:bg-amber-500/10'
                )}
                onClick={() => onDealClick?.(deal)}
              >
                {severity === 'critical' ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold truncate">{deal.client_name}</span>
                    <Badge className={cn('text-[8px] px-1 py-0 h-3.5 border shrink-0', riskCfg.color)}>
                      {riskCfg.emoji}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {reasons.map((r, i) => (
                      <span key={i} className="text-[10px] text-muted-foreground">
                        {i > 0 && '·'} {r}
                      </span>
                    ))}
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
