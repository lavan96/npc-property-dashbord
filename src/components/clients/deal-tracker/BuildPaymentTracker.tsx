import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarIcon, Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BuildProgressPayment } from './types';

interface BuildPaymentTrackerProps {
  payments: BuildProgressPayment[];
  buildPrice: number | null;
  onUpdatePayment: (paymentId: string, data: Partial<BuildProgressPayment>) => void;
}

function DateCell({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs px-1.5 w-full justify-start">
          <CalendarIcon className="h-3 w-3 mr-1 shrink-0" />
          {value ? format(new Date(value), 'dd/MM/yy') : (label || '—')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? new Date(value) : undefined}
          onSelect={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : null)}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

export function BuildPaymentTracker({ payments, buildPrice, onUpdatePayment }: BuildPaymentTrackerProps) {
  const sorted = [...payments].sort((a, b) => a.display_order - b.display_order);

  const formatCurrency = (val: number | null) => {
    if (!val) return '—';
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);
  };

  const completedCount = sorted.filter(p => p.funds_released).length;
  const progressPercent = sorted.length > 0 ? (completedCount / sorted.length) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground font-medium">{completedCount}/{sorted.length} stages</span>
      </div>

      <div className="overflow-auto max-w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30px]">#</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-center">Invoice Rcvd</TableHead>
              <TableHead className="text-center">Submitted</TableHead>
              <TableHead className="text-center">Funds Released</TableHead>
              <TableHead className="text-center">Paid Builder</TableHead>
              <TableHead className="text-center">Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => {
              const stageAmount = buildPrice ? (buildPrice * p.percentage / 100) : p.amount;
              return (
                <TableRow key={p.id} className={cn(p.funds_released && 'bg-green-500/5')}>
                  <TableCell className="font-mono text-xs">{p.stage_number}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{p.stage_name}</span>
                      {p.is_commission_trigger && (
                        <Bell className="h-3 w-3 text-amber-500" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{p.percentage}%</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(stageAmount || null)}</TableCell>

                  {/* Invoice Received */}
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <Checkbox
                        checked={p.builder_invoice_received}
                        onCheckedChange={(checked) => onUpdatePayment(p.id, {
                          builder_invoice_received: !!checked,
                          builder_invoice_date: checked ? (p.builder_invoice_date || format(new Date(), 'yyyy-MM-dd')) : null,
                        })}
                      />
                      {p.builder_invoice_received && (
                        <DateCell
                          value={p.builder_invoice_date}
                          onChange={(d) => onUpdatePayment(p.id, { builder_invoice_date: d })}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Submitted to Lender */}
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <Checkbox
                        checked={p.submitted_to_lender}
                        onCheckedChange={(checked) => onUpdatePayment(p.id, {
                          submitted_to_lender: !!checked,
                          submitted_to_lender_date: checked ? (p.submitted_to_lender_date || format(new Date(), 'yyyy-MM-dd')) : null,
                        })}
                      />
                      {p.submitted_to_lender && (
                        <DateCell
                          value={p.submitted_to_lender_date}
                          onChange={(d) => onUpdatePayment(p.id, { submitted_to_lender_date: d })}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Funds Released */}
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <Checkbox
                        checked={p.funds_released}
                        onCheckedChange={(checked) => onUpdatePayment(p.id, {
                          funds_released: !!checked,
                          funds_released_date: checked ? (p.funds_released_date || format(new Date(), 'yyyy-MM-dd')) : null,
                        })}
                      />
                      {p.funds_released && (
                        <DateCell
                          value={p.funds_released_date}
                          onChange={(d) => onUpdatePayment(p.id, { funds_released_date: d })}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Paid to Builder */}
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <Checkbox
                        checked={p.paid_to_builder}
                        onCheckedChange={(checked) => onUpdatePayment(p.id, {
                          paid_to_builder: !!checked,
                          paid_to_builder_date: checked ? (p.paid_to_builder_date || format(new Date(), 'yyyy-MM-dd')) : null,
                        })}
                      />
                      {p.paid_to_builder && (
                        <DateCell
                          value={p.paid_to_builder_date}
                          onChange={(d) => onUpdatePayment(p.id, { paid_to_builder_date: d })}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Commission */}
                  <TableCell className="text-center">
                    {p.is_commission_trigger ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <Checkbox
                          checked={p.commission_received}
                          onCheckedChange={(checked) => onUpdatePayment(p.id, {
                            commission_received: !!checked,
                            commission_received_date: checked ? (p.commission_received_date || format(new Date(), 'yyyy-MM-dd')) : null,
                          })}
                        />
                        {p.commission_received ? (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/30">Paid</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30">Due</Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
