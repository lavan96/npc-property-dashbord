import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link2, ExternalLink } from 'lucide-react';
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Linked Finance Files
          <Badge variant="outline" className="ml-auto">{linked.length} linked · {unlinked.length} unlinked</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {linked.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No deals are linked to a finance Purchase File yet. Open a deal in Command Centre and link it from the finance portal Deal Room.
          </p>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {linked.map(d => {
              const pf = d.financeFile!;
              const tone = FINANCE_STATUS_TONE[pf.finance_status || ''] || 'border-border bg-card';
              return (
                <div key={d.id} className={`flex items-center justify-between gap-2 p-2 rounded border text-xs ${tone}`}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{d.client_name}</p>
                    <p className="text-muted-foreground truncate">
                      {pf.lender || 'No lender'} · {pf.settlement_date || 'No settlement date'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] capitalize">{statusLabel(pf.finance_status)}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
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
