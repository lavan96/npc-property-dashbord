import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CalendarLoadingSkeletonProps {
  view: 'month' | 'week' | 'timeline';
}

export function CalendarLoadingSkeleton({ view }: CalendarLoadingSkeletonProps) {
  if (view === 'month') {
    return (
      <div className="space-y-1 animate-pulse">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center py-2">
              <Skeleton className="h-4 w-8 mx-auto" />
            </div>
          ))}
        </div>
        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div 
              key={i} 
              className="min-h-[80px] p-1 rounded-md border border-transparent"
            >
              <Skeleton className="h-4 w-4 mb-2" />
              <div className="space-y-1">
                {Math.random() > 0.5 && <Skeleton className="h-4 w-full" />}
                {Math.random() > 0.7 && <Skeleton className="h-4 w-3/4" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'week') {
    return (
      <div className="space-y-1 animate-pulse">
        {/* Week headers */}
        <div className="grid grid-cols-8 gap-1 mb-2">
          <div className="w-16" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="text-center py-2">
              <Skeleton className="h-4 w-8 mx-auto mb-1" />
              <Skeleton className="h-8 w-8 rounded-full mx-auto" />
            </div>
          ))}
        </div>
        {/* Time grid */}
        {Array.from({ length: 12 }).map((_, hour) => (
          <div key={hour} className="grid grid-cols-8 gap-1 border-t border-border/30">
            <div className="w-16 py-1">
              <Skeleton className="h-3 w-10 ml-auto" />
            </div>
            {Array.from({ length: 7 }).map((_, day) => (
              <div key={day} className="min-h-[48px] px-1 py-1 border-l border-border/30">
                {Math.random() > 0.8 && (
                  <Skeleton className="h-10 w-full rounded" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Timeline view
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="w-16 shrink-0">
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Stats loading skeleton
export function StatsLoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="p-4 rounded-lg border bg-card">
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

// Sidebar loading skeleton
export function SidebarLoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="p-3 rounded-lg border">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1">
              <Skeleton className="h-4 w-3/4 mb-1" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
