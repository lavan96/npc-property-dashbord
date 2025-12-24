import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  startOfWeek, 
  endOfWeek, 
  isSameDay, 
  isToday, 
  isSameMonth,
  addMonths,
  subMonths
} from 'date-fns';
import { cn } from '@/lib/utils';

interface MiniCalendarNavigatorProps {
  currentMonth: Date;
  setCurrentMonth: (date: Date) => void;
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  eventsPerDay?: Record<string, number>;
}

export function MiniCalendarNavigator({
  currentMonth,
  setCurrentMonth,
  selectedDate,
  onDateSelect,
  eventsPerDay = {},
}: MiniCalendarNavigatorProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    onDateSelect(today);
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <span className="text-xs font-medium">{format(currentMonth, 'MMM yyyy')}</span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground font-medium py-0.5">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const eventCount = eventsPerDay[dateKey] || 0;
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDate = isToday(day);

          return (
            <button
              key={dateKey}
              onClick={() => onDateSelect(day)}
              className={cn(
                'relative h-6 w-6 text-[10px] rounded-full transition-all flex items-center justify-center',
                isSelected && 'bg-primary text-primary-foreground',
                !isSelected && isTodayDate && 'ring-1 ring-primary text-primary',
                !isSelected && !isTodayDate && 'hover:bg-muted',
                !isCurrentMonth && 'text-muted-foreground/40'
              )}
            >
              {format(day, 'd')}
              {eventCount > 0 && !isSelected && (
                <span 
                  className={cn(
                    'absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full',
                    eventCount > 3 ? 'bg-destructive' : 'bg-primary'
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Today button */}
      <Button 
        variant="outline" 
        size="sm" 
        className="w-full h-7 text-xs"
        onClick={goToToday}
      >
        Today
      </Button>
    </div>
  );
}
