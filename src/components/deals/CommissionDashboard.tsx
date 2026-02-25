import { useMemo } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { DollarSign, Bell, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  isLoading: boolean;
}

interface CommissionRow {
  dealId: string;
  clientName: string;
  stageName: string;
  stageNumber: number;
  percentage: number;
  amount: number | null;
  builderInvoiceReceived: boolean;
  submittedToLender: boolean;
  fundsReleased: boolean;
  commissionReceived: boolean;
  commissionReceivedDate: string | null;
  commissionAmount: number | null;
  buildPrice: number | null;
}

export function CommissionDashboard({ deals, isLoading }: Props) {
  const commissionRows = useMemo(() => {
    const rows: CommissionRow[] = [];
    for (const deal of deals) {
      const payments = deal.buildPayments || [];
      for (const p of payments) {
        if (!p.is_commission_trigger) continue;
        rows.push({
          dealId: deal.id,
          clientName: deal.client_name || 'Unknown',
          stageName: p.stage_name,
          stageNumber: p.stage_number,
          percentage: p.percentage,
          amount: deal.build_price ? (deal.build_price * p.percentage / 100) : p.amount,
          builderInvoiceReceived: p.builder_invoice_received || false,
          submittedToLender: p.submitted_to_lender || false,
          fundsReleased: p.funds_released || false,
          commissionReceived: p.commission_received || false,
          commissionReceivedDate: p.commission_received_date,
          commissionAmount: p.commission_amount,
          buildPrice: deal.build_price,
        });
      }
    }
    return rows;
  }, [deals]);

  const stats = useMemo(() => {
    const pending = commissionRows.filter(r => !r.commissionReceived);
    const received = commissionRows.filter(r => r.commissionReceived);
    const pendingSlabs = pending.filter(r => r.stageName === 'Slab/Base');
    const pendingFrames = pending.filter(r => r.stageName === 'Frame');
    const totalReceived = received.reduce((s, r) => s + (r.commissionAmount || 0), 0);
    const totalPending = pending.length;
    return { pending, received, pendingSlabs, pendingFrames, totalReceived, totalPending };
  }, [commissionRows]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 sm:h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-amber-600">{stats.totalPending}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold">{stats.pendingSlabs.length}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Slab Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold">{stats.pendingFrames.length}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Frame Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.received.length}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Received</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{formatCurrency(stats.totalReceived)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Total Received</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Commissions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Pending Commission Triggers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Client</TableHead>
                  <TableHead className="whitespace-nowrap">Stage</TableHead>
                  <TableHead className="text-right whitespace-nowrap hidden sm:table-cell">%</TableHead>
                  <TableHead className="text-right whitespace-nowrap hidden sm:table-cell">Amount</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Invoice</TableHead>
                  <TableHead className="text-center whitespace-nowrap hidden sm:table-cell">Submitted</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Funds</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                      No pending commission triggers
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.pending.map((row, idx) => (
                    <TableRow key={`${row.dealId}-${row.stageNumber}-${idx}`}>
                      <TableCell className="font-medium text-xs sm:text-sm whitespace-nowrap">{row.clientName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Bell className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs sm:text-sm">{row.stageName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs sm:text-sm hidden sm:table-cell">{row.percentage}%</TableCell>
                      <TableCell className="text-right text-xs sm:text-sm hidden sm:table-cell">{row.amount ? formatCurrency(row.amount) : '—'}</TableCell>
                      <TableCell className="text-center">
                        {row.builderInvoiceReceived ? (
                          <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        {row.submittedToLender ? (
                          <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.fundsReleased ? (
                          <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.fundsReleased ? (
                          <Badge className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 border whitespace-nowrap">Awaiting</Badge>
                        ) : row.submittedToLender ? (
                          <Badge variant="outline" className="text-[10px] whitespace-nowrap">Submitted</Badge>
                        ) : row.builderInvoiceReceived ? (
                          <Badge variant="outline" className="text-[10px] whitespace-nowrap">Invoice</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground whitespace-nowrap">—</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Received Commissions */}
      {stats.received.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Received Commissions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Client</TableHead>
                    <TableHead className="whitespace-nowrap">Stage</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.received.map((row, idx) => (
                    <TableRow key={`recv-${row.dealId}-${row.stageNumber}-${idx}`}>
                      <TableCell className="font-medium text-xs sm:text-sm">{row.clientName}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{row.stageName}</TableCell>
                      <TableCell className="text-right font-mono text-xs sm:text-sm">
                        {row.commissionAmount ? formatCurrency(row.commissionAmount) : '—'}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm">
                        {row.commissionReceivedDate ? format(new Date(row.commissionReceivedDate), 'dd MMM yyyy') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
