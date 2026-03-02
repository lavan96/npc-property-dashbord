import { useMemo } from 'react';
import { differenceInDays, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Clock, CalendarDays, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  onDealClick?: (deal: DealWithClient) => void;
}

export function SettlementCountdownCards({ deals, onDealClick }: Props) {
  const upcoming = useMemo(() => {
    const now = new Date();
    return deals
      .filter(d => d.settlement_date)
      .map(d => ({
        deal: d,
        daysUntil: differenceInDays(new Date(d.settlement_date!), now),
      }))
      .filter(d => d.daysUntil >= -7) // include up to 7 days overdue
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 8);
  }, [deals]);

  const getBucket = (days: number) => {
    if (days < 0) return { label: 'OVERDUE', color: 'bg-destructive/10 border-destructive/30 text-destructive', ring: 'ring-destructive/20' };
    if (days <= 7) return { label: '7 DAYS', color: 'bg-red-500/10 border-red-500/30 text-red-600', ring: 'ring-red-500/20' };
    if (days <= 14) return { label: '14 DAYS', color: 'bg-amber-500/10 border-amber-500/30 text-amber-600', ring: 'ring-amber-500/20' };
    if (days <= 30) return { label: '30 DAYS', color: 'bg-blue-500/10 border-blue-500/30 text-blue-600', ring: 'ring-blue-500/20' };
    return { label: `${days}d`, color: 'bg-muted border-border text-muted-foreground', ring: '' };
  };

  if (upcoming.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-primary" />
          Settlement Countdown
          <Badge variant="outline" className="text-[10px] ml-auto">{upcoming.length} upcoming</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-4 pb-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {upcoming.map(({ deal, daysUntil }) => {
            const bucket = getBucket(daysUntil);
            return (
              <div
                key={deal.id}
                className={cn(
                  'rounded-lg border p-2.5 cursor-pointer transition-all hover:shadow-sm',
                  bucket.color,
                  onDealClick && 'hover:ring-2 ' + bucket.ring
                )}
                onClick={() => onDealClick?.(deal)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold truncate max-w-[120px]">{deal.client_name}</span>
                  <span className={cn('text-[10px] font-bold', daysUntil < 0 ? 'text-destructive' : '')}>
                    {daysUntil < 0 ? (
                      <span className="flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" />{Math.abs(daysUntil)}d late</span>
                    ) : daysUntil === 0 ? 'TODAY' : `${daysUntil}d`}
                  </span>
                </div>
                <p className="text-[10px] opacity-80 truncate">{deal.property_address || deal.current_stage}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] opacity-70">
                    <CalendarDays className="h-3 w-3 inline mr-0.5" />
                    {format(new Date(deal.settlement_date!), 'dd MMM yyyy')}
                  </span>
                  {deal.total_contract_price && (
                    <span className="text-[10px] font-mono opacity-80">
                      ${(deal.total_contract_price / 1000).toFixed(0)}k
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
