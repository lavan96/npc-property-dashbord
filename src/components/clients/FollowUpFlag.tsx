import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Bell, BellRing, X } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FollowUpFlagProps {
  clientId: string;
  followUpDate: string | null | undefined;
  /** Extra query keys to invalidate on change */
  invalidateKeys?: string[][];
  size?: 'sm' | 'default';
}

export function FollowUpFlag({ clientId, followUpDate, invalidateKeys = [], size = 'default' }: FollowUpFlagProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const parsedDate = followUpDate ? new Date(followUpDate) : undefined;
  const isFlagged = !!followUpDate;
  const isOverdue = parsedDate && isPast(parsedDate) && !isToday(parsedDate);

  const mutation = useMutation({
    mutationFn: async (newDate: string | null) => {
      try {
        const { data, error } = await invokeSecureFunction('manage-client-data', {
          operation: 'update',
          table: 'clients',
          clientId,
          data: { follow_up_date: newDate },
        });
        if (!error && data?.success) return;
      } catch (err) {
        console.warn('Edge function failed, falling back:', err);
      }
      const { error } = await supabase
        .from('clients')
        .update({ follow_up_date: newDate })
        .eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-tracker'] });
      invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      setOpen(false);
    },
    onError: (error: any) => {
      toast.error('Failed to update follow-up: ' + error.message);
    },
  });

  const handleSelectDate = (date: Date | undefined) => {
    if (!date) return;
    const iso = format(date, 'yyyy-MM-dd');
    mutation.mutate(iso);
    toast.success(`Follow-up set for ${format(date, 'MMM d, yyyy')}`);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    mutation.mutate(null);
    toast.success('Follow-up cleared');
  };

  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const btnSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(btnSize, 'shrink-0 relative')}
          disabled={mutation.isPending}
        >
          {isFlagged ? (
            <BellRing
              className={cn(
                iconSize,
                'transition-colors',
                isOverdue
                  ? 'fill-destructive/20 text-destructive'
                  : 'fill-amber-400/20 text-amber-500'
              )}
            />
          ) : (
            <Bell className={cn(iconSize, 'text-muted-foreground hover:text-amber-500 transition-colors')} />
          )}
          {isOverdue && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom">
        <div className="p-3 pb-1 flex items-center justify-between gap-4">
          <span className="text-sm font-medium">
            {isFlagged ? 'Follow-up date' : 'Set follow-up'}
          </span>
          {isFlagged && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
              onClick={handleClear}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
        {isFlagged && parsedDate && (
          <div className={cn(
            'mx-3 mb-1 px-2 py-1 rounded text-xs text-center',
            isOverdue ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600'
          )}>
            {isOverdue ? 'Overdue: ' : 'Scheduled: '}
            {format(parsedDate, 'EEEE, MMM d, yyyy')}
          </div>
        )}
        <Calendar
          mode="single"
          selected={parsedDate}
          onSelect={handleSelectDate}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );
}
