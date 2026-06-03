/**
 * Batch 9 — Mobile cockpit (/finance/mobile).
 * Compact "Today" list with one-tap actions, scan + voice buttons,
 * settlement countdown widget, and unread-message badge.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, AlertTriangle, Clock, ChevronRight, MessageSquare, Calendar,
} from 'lucide-react';
import { VoiceMemoButton } from '@/components/finance-portal/VoiceMemoButton';

const FN = 'finance-portal-batch9-10';

const STATUS_LABEL = (s?: string | null) => (s || '—').replace(/_/g, ' ');

export default function FinancePortalMobile() {
  const { invokeFinanceFunction } = useFinancePortalAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['mobile-today'],
    queryFn: async () => {
      const { data, error } = await invokeFinanceFunction(FN, { operation: 'mobile_today' });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  const nextSettlement = useMemo(() => {
    const arr = (data?.files ?? []).filter((f: any) => f.settlement_days !== null && f.settlement_days >= 0);
    arr.sort((a: any, b: any) => a.settlement_days - b.settlement_days);
    return arr[0] ?? null;
  }, [data]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur px-4 py-3">
        <h1 className="text-base font-semibold">Today</h1>
        <p className="text-xs text-muted-foreground">
          {data?.counts?.total_files ?? 0} files · {data?.counts?.unread_shared_messages ?? 0} unread
        </p>
      </header>

      <div className="p-3 space-y-3">
        {/* Settlement countdown */}
        {nextSettlement && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-primary" /> Next settlement
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Link
                to={`/finance/purchase-files/${nextSettlement.id}`}
                className="flex items-center justify-between text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{nextSettlement.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {nextSettlement.settlement_days === 0
                      ? 'Today'
                      : `${nextSettlement.settlement_days} days`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2">
          <VoiceMemoButton />
          <Button variant="outline" size="sm" asChild>
            <Link to="/finance/messages">
              <MessageSquare className="h-4 w-4 mr-1.5" /> Messages
              {(data?.counts?.unread_shared_messages ?? 0) > 0 && (
                <Badge className="ml-1.5 h-4 px-1.5">{data.counts.unread_shared_messages}</Badge>
              )}
            </Link>
          </Button>
        </div>

        {/* Triaged list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Action queue</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
              </div>
            ) : !data?.files?.length ? (
              <p className="p-6 text-center text-xs text-muted-foreground">No active files.</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-340px)]">
                <ul className="divide-y divide-border">
                  {data.files.map((f: any) => (
                    <li key={f.id}>
                      <Link
                        to={`/finance/purchase-files/${f.id}`}
                        className="flex items-start gap-2 px-3 py-2.5 hover:bg-accent/10 active:bg-accent/20"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.file_name}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] py-0">
                              {STATUS_LABEL(f.purchase_finance_status || f.status)}
                            </Badge>
                            {f.risk_level === 'high' && (
                              <Badge variant="destructive" className="text-[10px] py-0">
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> High
                              </Badge>
                            )}
                            {f.finance_days !== null && f.finance_days >= 0 && f.finance_days <= 3 && (
                              <Badge className="text-[10px] py-0 bg-destructive/20 text-destructive">
                                <Clock className="h-2.5 w-2.5 mr-0.5" />
                                Finance in {f.finance_days}d
                              </Badge>
                            )}
                            {f.settlement_days !== null && f.settlement_days >= 0 && f.settlement_days <= 7 && (
                              <Badge variant="secondary" className="text-[10px] py-0">
                                Settle {f.settlement_days}d
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
