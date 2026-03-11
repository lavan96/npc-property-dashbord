import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: '7 Days' },
  { value: 'last_14d', label: '14 Days' },
  { value: 'last_30d', label: '30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_90d', label: '90 Days' },
];

interface DateRangePickerProps {
  datePreset: string;
  onDatePresetChange: (preset: string) => void;
  customRange: { since: string; until: string } | null;
  onCustomRangeChange: (range: { since: string; until: string } | null) => void;
}

export function DateRangePicker({
  datePreset,
  onDatePresetChange,
  customRange,
  onCustomRangeChange,
}: DateRangePickerProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    customRange ? new Date(customRange.since) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    customRange ? new Date(customRange.until) : undefined
  );
  const [open, setOpen] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);

  const isCustom = !!customRange;

  const handlePresetClick = (preset: string) => {
    onCustomRangeChange(null);
    onDatePresetChange(preset);
    setStartDate(undefined);
    setEndDate(undefined);
    setSelectingEnd(false);
  };

  const handleStartSelect = (date: Date | undefined) => {
    if (!date) return;
    setStartDate(date);
    setEndDate(undefined);
    setSelectingEnd(true);
  };

  const handleEndSelect = (date: Date | undefined) => {
    if (!date || !startDate) return;
    setEndDate(date);
    setSelectingEnd(false);
    const since = format(startDate, 'yyyy-MM-dd');
    const until = format(date, 'yyyy-MM-dd');
    onCustomRangeChange({ since, until });
    onDatePresetChange('custom');
    setOpen(false);
  };

  const clearCustom = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setSelectingEnd(false);
    onCustomRangeChange(null);
    onDatePresetChange('last_30d');
  };

  const activePresetLabel = DATE_PRESETS.find(p => p.value === datePreset)?.label;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {DATE_PRESETS.map(p => (
          <Button
            key={p.value}
            variant={!isCustom && datePreset === p.value ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-7 px-2.5 text-xs font-medium transition-all',
              !isCustom && datePreset === p.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => handlePresetClick(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Custom date range popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={isCustom ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-7 gap-1.5 text-xs font-medium',
              isCustom
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {isCustom && customRange ? (
              <span>
                {format(new Date(customRange.since), 'MMM d')} – {format(new Date(customRange.until), 'MMM d, yyyy')}
              </span>
            ) : (
              <span>Custom Range</span>
            )}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">
                {selectingEnd ? 'Select End Date' : 'Select Start Date'}
              </p>
              {isCustom && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={clearCustom}>
                  Clear
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn('text-xs px-2 py-0.5', startDate ? 'border-primary/40 text-primary' : '')}>
                {startDate ? format(startDate, 'MMM d, yyyy') : 'Start'}
              </Badge>
              <span className="text-xs text-muted-foreground">→</span>
              <Badge variant="outline" className={cn('text-xs px-2 py-0.5', endDate ? 'border-primary/40 text-primary' : '')}>
                {endDate ? format(endDate, 'MMM d, yyyy') : 'End'}
              </Badge>
            </div>
          </div>
          <Calendar
            mode="single"
            selected={selectingEnd ? endDate : startDate}
            onSelect={selectingEnd ? handleEndSelect : handleStartSelect}
            disabled={(date) => {
              if (date > new Date()) return true;
              if (selectingEnd && startDate && date < startDate) return true;
              return false;
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
