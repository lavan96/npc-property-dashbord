import { useMemo } from 'react';
import { format } from 'date-fns';
import { CheckCircle, FileText } from 'lucide-react';
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

interface InvoiceRow {
  dealId: string;
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

export function BuilderInvoiceLog({ deals, isLoading }: Props) {
  const invoiceRows = useMemo(() => {
    const rows: InvoiceRow[] = [];
    for (const deal of deals) {
      const payments = deal.buildPayments || [];
      for (const p of payments) {
        rows.push({
          dealId: deal.id,
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

  function StatusIcon({ value }: { value: boolean }) {
    return value ? (
      <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
    ) : (
      <span className="text-xs text-muted-foreground block text-center">—</span>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-64 rounded-lg" />;
  }

  if (invoiceRows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
          <FileText className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No build progress payments found.</p>
          <p className="text-xs text-muted-foreground">Builder invoice tracking appears when House & Land deals have build payment stages.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Builder Invoice Log
          <Badge variant="outline" className="text-xs ml-auto">{invoiceRows.length} stages</Badge>
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
                <TableHead className="text-center whitespace-nowrap hidden md:table-cell">Submitted</TableHead>
                <TableHead className="text-center whitespace-nowrap">Funds</TableHead>
                <TableHead className="text-center whitespace-nowrap hidden md:table-cell">Paid</TableHead>
                <TableHead className="text-center whitespace-nowrap">Comm.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoiceRows.map((row, idx) => (
                <TableRow key={`${row.dealId}-${row.stageNumber}-${idx}`}>
                  <TableCell className="font-medium text-xs sm:text-sm whitespace-nowrap">{row.clientName}</TableCell>
                  <TableCell className="text-xs sm:text-sm whitespace-nowrap">{row.stageName}</TableCell>
                  <TableCell className="text-right font-mono text-xs sm:text-sm hidden sm:table-cell">{row.percentage}%</TableCell>
                  <TableCell className="text-right text-xs sm:text-sm hidden sm:table-cell">{row.amount ? formatCurrency(row.amount) : '—'}</TableCell>
                  <TableCell className="text-center text-xs sm:text-sm">
                    {row.builderInvoiceDate ? format(new Date(row.builderInvoiceDate), 'dd/MM/yy') : (
                      <StatusIcon value={row.builderInvoiceReceived} />
                    )}
                  </TableCell>
                  <TableCell className="text-center text-xs sm:text-sm hidden md:table-cell">
                    {row.submittedDate ? format(new Date(row.submittedDate), 'dd/MM/yy') : (
                      <StatusIcon value={row.submittedToLender} />
                    )}
                  </TableCell>
                  <TableCell className="text-center text-xs sm:text-sm">
                    {row.fundsReleasedDate ? format(new Date(row.fundsReleasedDate), 'dd/MM/yy') : (
                      <StatusIcon value={row.fundsReleased} />
                    )}
                  </TableCell>
                  <TableCell className="text-center text-xs sm:text-sm hidden md:table-cell">
                    {row.paidToBuilderDate ? format(new Date(row.paidToBuilderDate), 'dd/MM/yy') : (
                      <StatusIcon value={row.paidToBuilder} />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {row.commissionReceived ? (
                      <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/30">Paid</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
