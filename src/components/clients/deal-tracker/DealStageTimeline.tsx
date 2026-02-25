import { useState } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, Circle, Clock, SkipForward, CalendarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DealStage, StageStatus } from './types';

interface DealStageTimelineProps {
  stages: DealStage[];
  onUpdateStage: (stageId: string, data: Partial<DealStage>) => void;
}

const STATUS_ICONS: Record<StageStatus, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-amber-500" />,
  complete: <Check className="h-4 w-4 text-green-600" />,
  skipped: <SkipForward className="h-4 w-4 text-muted-foreground/50" />,
};

const STATUS_COLORS: Record<StageStatus, string> = {
  pending: 'border-muted-foreground/30 bg-muted/30',
  in_progress: 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/20',
  complete: 'border-green-600 bg-green-500/10',
  skipped: 'border-muted-foreground/20 bg-muted/20 opacity-60',
};

const NEXT_STATUS: Record<StageStatus, StageStatus> = {
  pending: 'in_progress',
  in_progress: 'complete',
  complete: 'pending',
  skipped: 'pending',
};

export function DealStageTimeline({ stages, onUpdateStage }: DealStageTimelineProps) {
  const sorted = [...stages].sort((a, b) => a.display_order - b.display_order);

  const handleStatusToggle = (stage: DealStage) => {
    const newStatus = NEXT_STATUS[stage.status];
    const updates: Partial<DealStage> = { status: newStatus };
    if (newStatus === 'complete') {
      updates.completed_at = new Date().toISOString();
    } else {
      updates.completed_at = null;
    }
    onUpdateStage(stage.id, updates);
  };

  return (
    <div className="space-y-1">
      {sorted.map((stage, idx) => {
        const isLast = idx === sorted.length - 1;
        return (
          <div key={stage.id} className="flex gap-3">
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleStatusToggle(stage)}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all hover:scale-110',
                        STATUS_COLORS[stage.status]
                      )}
                    >
                      {STATUS_ICONS[stage.status]}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>Click to change status → {NEXT_STATUS[stage.status]}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {!isLast && (
                <div className={cn(
                  'w-0.5 flex-1 min-h-[16px]',
                  stage.status === 'complete' ? 'bg-green-500/50' : 'bg-border'
                )} />
              )}
            </div>

            {/* Stage content */}
            <div className={cn(
              'flex-1 pb-3 pt-0.5',
              stage.status === 'skipped' && 'opacity-60'
            )}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{stage.stage_name}</span>
                {stage.stage_category && (
                  <Badge variant="outline" className="text-[10px] h-5">{stage.stage_category}</Badge>
                )}
                {stage.percentage_or_amount && (
                  <Badge variant="secondary" className="text-[10px] h-5">{stage.percentage_or_amount}</Badge>
                )}
              </div>

              <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium">Responsible:</span> {stage.responsible || '—'}
                </div>
                <div>
                  <span className="font-medium">Client:</span> {stage.client_action || '—'}
                </div>
                <div>
                  <span className="font-medium">Internal:</span> {stage.internal_action || '—'}
                </div>
              </div>

              <div className="mt-1.5 flex items-center gap-3 text-xs">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      {stage.key_date ? format(new Date(stage.key_date), 'dd MMM yyyy') : 'Set date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={stage.key_date ? new Date(stage.key_date) : undefined}
                      onSelect={(date) => onUpdateStage(stage.id, { key_date: date ? format(date, 'yyyy-MM-dd') : null })}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {stage.completed_at && (
                  <span className="text-green-600">✓ Completed {format(new Date(stage.completed_at), 'dd MMM yyyy')}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
