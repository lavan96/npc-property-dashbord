import { format, differenceInDays, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarIcon, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Deal } from './types';

interface DealCriticalDatesProps {
  deal: Deal;
  onUpdate: (data: Partial<Deal>) => void;
}

interface DateFieldConfig {
  key: keyof Deal;
  label: string;
  showFor: 'all' | 'house_and_land';
  isUrgent?: boolean;
}

const DATE_FIELDS: DateFieldConfig[] = [
  { key: 'finance_clause_expiry', label: 'Finance Clause Expiry', showFor: 'all', isUrgent: true },
  { key: 'settlement_date', label: 'Settlement Date', showFor: 'all', isUrgent: true },
  { key: 'land_settlement_date', label: 'Land Settlement Date', showFor: 'house_and_land' },
  { key: 'expected_build_start', label: 'Expected Build Start', showFor: 'house_and_land' },
  { key: 'estimated_completion', label: 'Estimated Completion', showFor: 'house_and_land' },
];

function DateWarningBadge({ dateStr }: { dateStr: string }) {
  const date = new Date(dateStr);
  const daysAway = differenceInDays(date, new Date());

  if (isPast(date)) {
    return <Badge variant="destructive" className="text-[10px]">Overdue by {Math.abs(daysAway)}d</Badge>;
  }
  if (daysAway <= 5) {
    return <Badge className="text-[10px] bg-red-500">{daysAway}d away</Badge>;
  }
  if (daysAway <= 14) {
    return <Badge className="text-[10px] bg-amber-500">{daysAway}d away</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">{daysAway}d away</Badge>;
}

export function DealCriticalDates({ deal, onUpdate }: DealCriticalDatesProps) {
  const visibleFields = DATE_FIELDS.filter(
    f => f.showFor === 'all' || deal.deal_type === f.showFor
  );

  const urgentDates = visibleFields.filter(f => {
    const val = deal[f.key] as string | null;
    if (!val || !f.isUrgent) return false;
    const daysAway = differenceInDays(new Date(val), new Date());
    return daysAway <= 7;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-primary" />
          Critical Dates
          {urgentDates.length > 0 && (
            <Badge variant="destructive" className="text-[10px] ml-auto">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {urgentDates.length} urgent
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleFields.map((field) => {
            const value = deal[field.key] as string | null;
            return (
              <div key={field.key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground truncate">{field.label}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {value && <DateWarningBadge dateStr={value} />}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2">
                        <CalendarIcon className="h-3 w-3 mr-1" />
                        {value ? format(new Date(value), 'dd MMM yyyy') : 'Set'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={value ? new Date(value) : undefined}
                        onSelect={(date) => onUpdate({ [field.key]: date ? format(date, 'yyyy-MM-dd') : null } as Partial<Deal>)}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
