import { useMemo } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { DollarSign, Bell, CheckCircle, Clock, Circle, ReceiptText, Send, Banknote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { DealWithClient } from '@/hooks/useAllDeals';
import { pipelineBadgeClass } from '@/components/deals/pipelineBadgeStyles';


const kpiCardBase = 'relative overflow-hidden rounded-2xl border shadow-xl shadow-black/5 before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent';
const tableShellClass = 'overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-xl shadow-black/5';
const tableHeaderClass = '[&_tr]:border-b [&_tr]:border-border/70 [&_th]:bg-muted/55 [&_th]:py-3 [&_th]:text-[10px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.16em] [&_th]:text-muted-foreground';
const rowHoverClass = 'border-border/55 transition-colors hover:bg-amber-500/5 data-[state=selected]:bg-muted';
const emptyDashClass = 'inline-flex min-w-6 justify-center rounded-full border border-dashed border-border/80 bg-muted/35 px-2 py-0.5 font-mono text-xs text-muted-foreground';

interface Props {
  deals: DealWithClient[];
  isLoading: boolean;
  onUpdatePayment?: (paymentId: string, clientId: string, data: any) => void;
}

interface CommissionRow {
  paymentId: string;
  dealId: string;
  clientId: string;
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

export function CommissionDashboard({ deals, isLoading, onUpdatePayment }: Props) {
  const commissionRows = useMemo(() => {
    const rows: CommissionRow[] = [];
    for (const deal of deals) {
      const payments = deal.buildPayments || [];
      for (const p of payments) {
        if (!p.is_commission_trigger) continue;
        rows.push({
          paymentId: p.id,
          dealId: deal.id,
          clientId: deal.client_id,
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

  function ToggleCheck({ value, field, row }: { value: boolean; field: string; row: CommissionRow }) {
    if (!onUpdatePayment) {
      return value ? (
        <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
      ) : (
        <span className={emptyDashClass}>—</span>
      );
    }

    const dateField = field === 'builder_invoice_received' ? 'builder_invoice_date'
      : field === 'submitted_to_lender' ? 'submitted_to_lender_date'
      : field === 'funds_released' ? 'funds_released_date'
      : field === 'commission_received' ? 'commission_received_date'
      : null;

    const handleToggle = () => {
      const newVal = !value;
      const update: any = { [field]: newVal };
      if (dateField) {
        update[dateField] = newVal ? new Date().toISOString().split('T')[0] : null;
      }
      onUpdatePayment(row.paymentId, row.clientId, update);
    };

    const iconTone = field === 'funds_released'
      ? 'text-teal-600 bg-teal-500/10 border-teal-500/25'
      : field === 'submitted_to_lender'
        ? 'text-sky-600 bg-sky-500/10 border-sky-500/25'
        : field === 'builder_invoice_received'
          ? 'text-amber-700 bg-amber-500/10 border-amber-500/25'
          : 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25';

    return (
      <button
        onClick={handleToggle}
        className={cn(
          'mx-auto inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all hover:-translate-y-0.5 hover:scale-105 hover:shadow-md',
          value ? iconTone : 'border-border/70 bg-muted/30 text-muted-foreground/45 hover:border-amber-300/60 hover:bg-amber-500/10 hover:text-amber-700'
        )}
        title={`Toggle ${field.replace(/_/g, ' ')}`}
      >
        {value ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
      </button>
    );
  }

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card className={cn(kpiCardBase, 'border-amber-300/45 bg-gradient-to-br from-amber-50 via-card to-orange-50/80 dark:from-amber-950/35 dark:via-card dark:to-orange-950/20')}>
          <CardContent className="p-4 text-center sm:p-5">
            <Clock className="mx-auto mb-2 h-5 w-5 text-amber-600" />
            <p className="text-2xl font-black tabular-nums text-amber-700 sm:text-3xl">{stats.totalPending}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800/75 dark:text-amber-200/80">Pending</p>
          </CardContent>
        </Card>
        <Card className={cn(kpiCardBase, 'border-amber-300/35 bg-gradient-to-br from-card via-amber-50/70 to-card dark:via-amber-950/20')}>
          <CardContent className="p-4 text-center sm:p-5">
            <Bell className="mx-auto mb-2 h-5 w-5 text-amber-600" />
            <p className="text-2xl font-black tabular-nums text-amber-700 sm:text-3xl">{stats.pendingSlabs.length}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Slab Pending</p>
          </CardContent>
        </Card>
        <Card className={cn(kpiCardBase, 'border-orange-300/35 bg-gradient-to-br from-card via-orange-50/70 to-card dark:via-orange-950/20')}>
          <CardContent className="p-4 text-center sm:p-5">
            <Bell className="mx-auto mb-2 h-5 w-5 text-orange-600" />
            <p className="text-2xl font-black tabular-nums text-orange-700 sm:text-3xl">{stats.pendingFrames.length}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Frame Pending</p>
          </CardContent>
        </Card>
        <Card className={cn(kpiCardBase, 'border-emerald-300/40 bg-gradient-to-br from-emerald-50 via-card to-teal-50/80 dark:from-emerald-950/30 dark:via-card dark:to-teal-950/20')}>
          <CardContent className="p-4 text-center sm:p-5">
            <CheckCircle className="mx-auto mb-2 h-5 w-5 text-emerald-600" />
            <p className="text-2xl font-black tabular-nums text-emerald-700 sm:text-3xl">{stats.received.length}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800/70 dark:text-emerald-200/80">Received</p>
          </CardContent>
        </Card>
        <Card className={cn(kpiCardBase, 'col-span-2 border-teal-300/45 bg-gradient-to-br from-teal-50 via-card to-emerald-50/80 dark:from-teal-950/30 dark:via-card dark:to-emerald-950/20 sm:col-span-1')}>
          <CardContent className="p-4 text-center sm:p-5">
            <DollarSign className="mx-auto mb-2 h-5 w-5 text-teal-600" />
            <p className="text-xl font-black tabular-nums text-teal-700 sm:text-2xl">{formatCurrency(stats.totalReceived)}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-800/70 dark:text-teal-200/80">Total Received</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Commissions */}
      <Card className="overflow-hidden rounded-2xl border-amber-200/45 bg-gradient-to-br from-card via-card to-amber-50/35 shadow-xl shadow-black/5 dark:border-amber-900/40 dark:to-amber-950/15">
        <CardHeader className="border-b border-amber-200/35 bg-amber-500/5 pb-3">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Pending Commission Triggers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className={cn(tableShellClass, 'max-w-full overflow-auto rounded-none border-0 shadow-none')}>
            <Table>
              <TableHeader className={tableHeaderClass}>
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
                    <TableRow key={`${row.dealId}-${row.stageNumber}-${idx}`} className={rowHoverClass}>
                      <TableCell className="py-3.5 font-semibold text-xs sm:text-sm whitespace-nowrap">{row.clientName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Bell className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs sm:text-sm">{row.stageName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs font-semibold text-muted-foreground sm:table-cell">{row.percentage}%</TableCell>
                      <TableCell className="hidden text-right text-xs font-bold text-amber-700 tabular-nums sm:table-cell sm:text-sm">{row.amount ? formatCurrency(row.amount) : <span className={emptyDashClass}>—</span>}</TableCell>
                      <TableCell className="text-center">
                        <ToggleCheck value={row.builderInvoiceReceived} field="builder_invoice_received" row={row} />
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        <ToggleCheck value={row.submittedToLender} field="submitted_to_lender" row={row} />
                      </TableCell>
                      <TableCell className="text-center">
                        <ToggleCheck value={row.fundsReleased} field="funds_released" row={row} />
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => onUpdatePayment?.(row.paymentId, row.clientId, {
                            commission_received: true,
                            commission_received_date: new Date().toISOString().split('T')[0],
                          })}
                          className="rounded-full transition-transform hover:-translate-y-0.5 hover:shadow-md"
                          title="Mark commission as received"
                        >
                          {row.fundsReleased ? (
                            <Badge className={pipelineBadgeClass('warning', false, 'whitespace-nowrap transition-colors hover:bg-amber-500/20')}><Banknote className="mr-1 h-3 w-3" />Awaiting</Badge>
                          ) : row.submittedToLender ? (
                            <Badge variant="outline" className={pipelineBadgeClass('warning', false, 'whitespace-nowrap')}><Send className="mr-1 h-3 w-3" />Submitted</Badge>
                          ) : row.builderInvoiceReceived ? (
                            <Badge variant="outline" className={pipelineBadgeClass('warning', false, 'whitespace-nowrap')}><ReceiptText className="mr-1 h-3 w-3" />Invoice</Badge>
                          ) : (
                            <span className={emptyDashClass}>—</span>
                          )}
                        </button>
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
        <Card className="overflow-hidden rounded-2xl border-teal-200/45 bg-gradient-to-br from-card via-card to-teal-50/35 shadow-xl shadow-black/5 dark:border-teal-900/40 dark:to-teal-950/15">
          <CardHeader className="border-b border-teal-200/35 bg-teal-500/5 pb-3">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Received Commissions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className={cn(tableShellClass, 'max-w-full overflow-auto rounded-none border-0 shadow-none')}>
              <Table>
                <TableHeader className={tableHeaderClass}>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Client</TableHead>
                    <TableHead className="whitespace-nowrap">Stage</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.received.map((row, idx) => (
                    <TableRow key={`recv-${row.dealId}-${row.stageNumber}-${idx}`} className="border-border/55 transition-colors hover:bg-teal-500/5">
                      <TableCell className="py-3.5 font-semibold text-xs sm:text-sm">{row.clientName}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{row.stageName}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-amber-700 sm:text-sm">
                        {row.commissionAmount ? formatCurrency(row.commissionAmount) : <span className={emptyDashClass}>—</span>}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm">
                        {row.commissionReceivedDate ? format(new Date(row.commissionReceivedDate), 'dd MMM yyyy') : <span className={emptyDashClass}>—</span>}
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
