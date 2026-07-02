import { useMemo } from 'react';
import { format } from 'date-fns';
import { CheckCircle, Circle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DealLoadingState, DealStatePanel } from '@/components/deals/DealStatePresentation';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  isLoading: boolean;
  onUpdatePayment?: (paymentId: string, clientId: string, data: any) => void;
}

interface InvoiceRow {
  paymentId: string;
  dealId: string;
  clientId: string;
  clientName: string;
  stageName: string;
  stageNumber: number;
  percentage: number;
  amount: number | null;
  builderInvoiceReceived: boolean;
  builderInvoiceDate: string | null;
  submittedToLender: boolean;
  submittedDate: string | null;
  fundsReleased: boolean;
  fundsReleasedDate: string | null;
  paidToBuilder: boolean;
  paidToBuilderDate: string | null;
  commissionReceived: boolean;
}

export function BuilderInvoiceLog({ deals, isLoading, onUpdatePayment }: Props) {
  const invoiceRows = useMemo(() => {
    const rows: InvoiceRow[] = [];
    for (const deal of deals) {
      const payments = deal.buildPayments || [];
      for (const p of payments) {
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
          builderInvoiceDate: p.builder_invoice_date,
          submittedToLender: p.submitted_to_lender || false,
          submittedDate: p.submitted_to_lender_date,
          fundsReleased: p.funds_released || false,
          fundsReleasedDate: p.funds_released_date,
          paidToBuilder: p.paid_to_builder || false,
          paidToBuilderDate: p.paid_to_builder_date,
          commissionReceived: p.commission_received || false,
        });
      }
    }
    return rows;
  }, [deals]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);

  const formatStatusDate = (date: string) => format(new Date(date), 'dd/MM/yy');

  function StatusDate({ date }: { date: string }) {
    return (
      <span className="inline-flex min-w-[4.25rem] items-center justify-center rounded-full border border-success/25 bg-success/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-success dark:text-success">
        {formatStatusDate(date)}
      </span>
    );
  }

  function ToggleCheck({ value, field, dateField, row }: { value: boolean; field: string; dateField?: string; row: InvoiceRow }) {
    if (!onUpdatePayment) {
      return value ? (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-success/25 bg-success/10 text-success dark:text-success">
          <CheckCircle className="h-4 w-4" />
        </span>
      ) : (
        <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300">
          <Circle className="h-3.5 w-3.5" />
        </span>
      );
    }

    const handleToggle = () => {
      const newVal = !value;
      const update: any = { [field]: newVal };
      if (dateField) {
        update[dateField] = newVal ? new Date().toISOString().split('T')[0] : null;
      }
      onUpdatePayment(row.paymentId, row.clientId, update);
    };

    return (
      <button
        onClick={handleToggle}
        className={cn(
          'mx-auto flex h-7 w-7 items-center justify-center rounded-full border transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          value
            ? 'border-success/25 bg-success/10 text-success shadow-sm shadow-success/10 dark:text-success'
            : 'border-brand-500/20 bg-brand-500/10 text-brand-700 hover:border-brand-500/35 hover:bg-brand-500/15 dark:text-brand-300'
        )}
        title={`Toggle ${field.replace(/_/g, ' ')}`}
      >
        {value ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
      </button>
    );
  }

  if (isLoading) {
    return <DealLoadingState title="Loading builder invoices" description="Checking build payment stages and invoice receipt status." />;
  }

  if (invoiceRows.length === 0) {
    return (
      <DealStatePanel icon={<FileText className="h-7 w-7 text-brand-200" />} eyebrow="Builder invoices" title="No build progress payments found" description="Builder invoice tracking will appear when House & Land deals include real build payment stages." />
    );
  }

  return (
    <Card className="min-w-0 overflow-hidden rounded-card border-brand-200/15 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.065),rgba(24,24,27,0.90)_48%,rgba(0,0,0,0.72))] shadow-[0_22px_60px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.07)]">
      <CardHeader className="border-b border-brand-100/10 bg-background dark:bg-black/15 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </span>
              Builder Invoice Log
            </CardTitle>
            <p className="text-xs text-muted-foreground sm:text-sm">Construction progress payment ledger and invoice status controls.</p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
            {invoiceRows.length} stages
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 p-3 sm:p-4">
        <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-brand-100/15 bg-background dark:bg-background/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] [scrollbar-color:rgba(245,158,11,0.42)_rgba(24,24,27,0.78)] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand-300/40 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-background/70">
          <Table className="min-w-[900px]">
            <TableHeader className="sticky top-0 z-10 bg-background dark:bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Client</TableHead>
                <TableHead className="whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Stage</TableHead>
                <TableHead className="hidden whitespace-nowrap px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:table-cell">%</TableHead>
                <TableHead className="hidden whitespace-nowrap px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:table-cell">Amount</TableHead>
                <TableHead className="whitespace-nowrap px-4 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Invoice</TableHead>
                <TableHead className="hidden whitespace-nowrap px-4 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:table-cell">Submitted</TableHead>
                <TableHead className="whitespace-nowrap px-4 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Funds</TableHead>
                <TableHead className="hidden whitespace-nowrap px-4 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:table-cell">Paid</TableHead>
                <TableHead className="whitespace-nowrap px-4 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Comm.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoiceRows.map((row, idx) => (
                <TableRow className="group border-brand-100/10 hover:bg-brand-300/[0.055]" key={`${row.dealId}-${row.stageNumber}-${idx}`}>
                  <TableCell className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-foreground sm:text-sm">{row.clientName}</TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground sm:text-sm">{row.stageName}</TableCell>
                  <TableCell className="hidden px-4 py-4 text-right font-mono text-xs tabular-nums text-foreground sm:table-cell sm:text-sm">{row.percentage}%</TableCell>
                  <TableCell className="hidden px-4 py-4 text-right font-mono text-xs tabular-nums sm:table-cell sm:text-sm">{row.amount ? formatCurrency(row.amount) : <span className="text-muted-foreground/60">Not set</span>}</TableCell>
                  <TableCell className="px-4 py-4 text-center text-xs sm:text-sm">
                    {row.builderInvoiceDate && row.builderInvoiceReceived ? (
                      <StatusDate date={row.builderInvoiceDate} />
                    ) : (
                      <ToggleCheck value={row.builderInvoiceReceived} field="builder_invoice_received" dateField="builder_invoice_date" row={row} />
                    )}
                  </TableCell>
                  <TableCell className="hidden px-4 py-4 text-center text-xs sm:text-sm md:table-cell">
                    {row.submittedDate && row.submittedToLender ? (
                      <StatusDate date={row.submittedDate} />
                    ) : (
                      <ToggleCheck value={row.submittedToLender} field="submitted_to_lender" dateField="submitted_to_lender_date" row={row} />
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-4 text-center text-xs sm:text-sm">
                    {row.fundsReleasedDate && row.fundsReleased ? (
                      <StatusDate date={row.fundsReleasedDate} />
                    ) : (
                      <ToggleCheck value={row.fundsReleased} field="funds_released" dateField="funds_released_date" row={row} />
                    )}
                  </TableCell>
                  <TableCell className="hidden px-4 py-4 text-center text-xs sm:text-sm md:table-cell">
                    {row.paidToBuilderDate && row.paidToBuilder ? (
                      <StatusDate date={row.paidToBuilderDate} />
                    ) : (
                      <ToggleCheck value={row.paidToBuilder} field="paid_to_builder" dateField="paid_to_builder_date" row={row} />
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-4 text-center">
                    {row.commissionReceived ? (
                      <Badge variant="outline" className="rounded-full border-success/25 bg-success/10 px-2.5 py-1 text-[10px] font-semibold text-success dark:text-success">Paid</Badge>
                    ) : (
                      <ToggleCheck value={row.commissionReceived} field="commission_received" dateField="commission_received_date" row={row} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
